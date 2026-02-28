import * as THREE from 'three';
import { state, setPlayer } from './state.js';
import { getTerrainHeight } from './utils.js';
import { AIRCRAFT_TYPES, STREAK_NAMES, KILL_STREAK_TIMEOUT, SYNC_RATE } from './constants.js';
import { playShootSound, playExplodeSound, playImpactSound, initAudio } from './audio.js';
import { updateHealthBar, updateScore, showKillFeed, showKillStreak, updateWeaponUI, updateAmmoDisplay, showDamageFlash, updateFPS } from './ui.js';
import { addShake } from './graphics.js';
import { createJetMesh, createAntiAirMesh, createMissileMesh, createBulletMesh, createBombMesh } from './models.js';

let debrisList = [];
let playerFireCooldown = 0;
let killStreakTimer = null;

export function registerKill() {
    const now = Date.now();
    if (now - state.lastKillTime < KILL_STREAK_TIMEOUT) {
        state.killStreak++;
    } else {
        state.killStreak = 1;
    }
    state.lastKillTime = now;

    if (state.killStreak >= 2) {
        const streakName = STREAK_NAMES[Math.min(state.killStreak, 7)];
        showKillStreak(streakName);
    }

    if (killStreakTimer) clearTimeout(killStreakTimer);
    killStreakTimer = setTimeout(() => { state.killStreak = 0; }, KILL_STREAK_TIMEOUT);
}

export function createPlayer(selectedType) {
    if (!selectedType) selectedType = AIRCRAFT_TYPES.fighter;

    // Create Mesh
    const group = createJetMesh(selectedType.mainColor, selectedType.wingColor, selectedType.modelType);
    state.scene.add(group);

    // Initialize Player State
    const p = {
        mesh: group,
        speed: selectedType.speed,
        velocity: new THREE.Vector3(),
        rotationVelocity: new THREE.Vector2(),
        health: selectedType.health,
        maxHealth: selectedType.maxHealth,
        fireCooldown: selectedType.fireCooldown,
        damage: selectedType.damage,
        aircraftType: selectedType
    };

    p.mesh.position.y = 150; // Start high
    setPlayer(p);

    // Initialize UI for player
    updateHealthBar();
    if (selectedType.modelType === 'attack') {
        state.missileAmmo = selectedType.missileAmmo || 4;
        state.maxMissileAmmo = state.missileAmmo;
        state.attackWeaponMode = 1;
        updateWeaponUI('attack', 1);
        updateAmmoDisplay();
        document.getElementById('weapon-display').style.display = 'block';
    } else if (selectedType.modelType === 'bomber') {
        state.bomberWeaponMode = 1;
        updateWeaponUI('bomber', 1);
        document.getElementById('weapon-display').style.display = 'block';
    } else {
        document.getElementById('weapon-display').style.display = 'none';
    }
}

export function createEnemy() {
    const types = ['fighter', 'attack', 'bomber'];
    const rndType = types[Math.floor(Math.random() * 3)];
    const enemyModel = rndType === 'attack' ? 'attack' : (rndType === 'bomber' ? 'bomber' : 'fighter');

    // Enemy colors
    const enemy = createJetMesh(0xff0000, 0x333333, enemyModel);

    // Spawn far away
    const angle = Math.random() * Math.PI * 2;
    const dist = 800 + Math.random() * 1200;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    const y = 50 + Math.random() * 100;

    enemy.position.set(x, y, z);
    enemy.lookAt(0, y, 0);

    state.scene.add(enemy);

    state.enemies.push({
        mesh: enemy,
        speed: 40,
        cooldown: 6.0 + Math.random() * 3.0,
        type: enemyModel // Store type for bullet style
    });

    document.getElementById('enemy-count').innerText = state.enemies.length;
}

export function spawnAntiAirs(serverData) {
    if (serverData) {
        // Server provided positions - calculate terrain height on client
        serverData.forEach(data => {
            if (data.alive === false) return;
            const y = getTerrainHeight(data.x, data.z);
            if (y < -15) return; // Skip deep water only

            const mesh = createAntiAirMesh();
            mesh.position.set(data.x, Math.max(y, 0), data.z);
            state.scene.add(mesh);
            state.antiAirs.push({
                mesh: mesh,
                health: data.health || 3,
                cooldown: 0,
                fireRate: 0.6,
                range: 400,
                damage: 0.5,
                id: data.id
            });
        });
    } else {
        // Local generation - spawn around the map on land
        const targetCount = 15;
        let spawned = 0;
        let attempts = 0;

        while (spawned < targetCount && attempts < 300) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 150 + Math.random() * 800;
            const x = Math.sin(angle) * dist;
            const z = Math.cos(angle) * dist;
            const y = getTerrainHeight(x, z);

            if (y < -15) continue; // Skip deep water only

            const mesh = createAntiAirMesh();
            mesh.position.set(x, Math.max(y, 0), z);
            state.scene.add(mesh);

            state.antiAirs.push({
                mesh: mesh,
                health: 3,
                cooldown: 0,
                fireRate: 0.3,
                range: 400,
                damage: 1
            });
            spawned++;
        }
        console.log(`AA spawn: ${spawned} placed after ${attempts} attempts`);
    }
    console.log(`Anti-Air systems spawned: ${state.antiAirs.length}`);
}

export function createExplosion(position, color, count) {
    const particleCount = Math.min(count, 15);
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const velocities = []; // Store velocities separately

    const baseColor = new THREE.Color(color || 0xffaa00);
    const fireColor = new THREE.Color(0xff4400);
    const secondaryColor = new THREE.Color(0x888888);

    const velocityData = [];

    for (let i = 0; i < particleCount; i++) {
        positions.push(0, 0, 0);
        const speed = 10 + Math.random() * 20;
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.random() * Math.PI * 2;

        velocityData.push(
            Math.sin(angle1) * Math.cos(angle2) * speed,
            Math.sin(angle1) * Math.sin(angle2) * speed,
            Math.cos(angle1) * speed
        );

        const rnd = Math.random();
        if (rnd < 0.3) {
            colors.push(baseColor.r, baseColor.g, baseColor.b);
        } else if (rnd < 0.6) {
            colors.push(fireColor.r, fireColor.g, fireColor.b);
        } else {
            colors.push(secondaryColor.r, secondaryColor.g, secondaryColor.b);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
        size: 4,
        vertexColors: true,
        transparent: true
    });

    const points = new THREE.Points(geometry, material);
    points.position.copy(position);
    state.scene.add(points);

    state.particles.push({
        mesh: points,
        velocities: velocityData,
        life: 1.0,
        light: null
    });

    // Cleanup old particles
    while (state.particles.length > 50) {
        const old = state.particles.shift();
        state.scene.remove(old.mesh);
        if (old.mesh.geometry) old.mesh.geometry.dispose();
        if (old.mesh.material) old.mesh.material.dispose();
    }

    // Shake and Sound
    if (count > 50) {
        addShake(1.5);
        playExplodeSound();
    } else {
        addShake(0.3);
        // No loud sound for small impacts
    }
}

export function createDebris(position) {
    const debrisCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < debrisCount; i++) {
        const size = 0.5 + Math.random() * 1.5;
        const geo = new THREE.BoxGeometry(size, size * 0.3, size * 0.7);
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0, 0, 0.15 + Math.random() * 0.2),
            roughness: 0.8,
            metalness: 0.4
        });
        const chunk = new THREE.Mesh(geo, mat);
        chunk.position.copy(position);
        chunk.position.x += (Math.random() - 0.5) * 5;
        chunk.position.y += (Math.random() - 0.5) * 5;
        chunk.position.z += (Math.random() - 0.5) * 5;

        state.scene.add(chunk);

        debrisList.push({
            mesh: chunk,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 30,
                10 + Math.random() * 20,
                (Math.random() - 0.5) * 30
            ),
            rotSpeed: new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10,
                (Math.random() - 0.5) * 10
            ),
            life: 2.0 + Math.random() * 1.0
        });
    }

    while (debrisList.length > 20) {
        const old = debrisList.shift();
        state.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.mesh.material.dispose();
    }
}

// === WEAPON LOGIC ===

export function tryPlayerShoot() {
    if (!state.player) return;
    if (playerFireCooldown > 0) return;

    const weaponType = state.player.aircraftType ? state.player.aircraftType.modelType : 'fighter';

    if (weaponType === 'fighter') {
        shootBullet(state.player, 'player');
    } else if (weaponType === 'attack') {
        if (state.attackWeaponMode === 1) {
            if (state.missileAmmo <= 0) return;
            shootSingleMissile(state.player, 'player');
            state.missileAmmo--;
            updateAmmoDisplay();
        } else {
            shootBullet(state.player, 'player');
        }
    } else if (weaponType === 'bomber') {
        if (state.bomberWeaponMode === 1) {
            dropBomb(state.player, 'player');
        } else {
            shootBullet(state.player, 'player');
        }
    } else {
        shoot(state.player, 'player');
    }

    // Cooldown set
    if (weaponType === 'attack' && state.attackWeaponMode === 2) {
        playerFireCooldown = 0.15;
    } else if (weaponType === 'bomber' && state.bomberWeaponMode === 2) {
        playerFireCooldown = 0.18;
    } else {
        playerFireCooldown = state.player.fireCooldown || 0.5;
    }
}

function shootBullet(sourceObj, type) {
    const isPlayer = type === 'player';
    if (isPlayer) playShootSound();
    const color = isPlayer ? 0xffdd44 : 0xff0000;
    const wingOffsets = [new THREE.Vector3(-2.5, -0.3, 2), new THREE.Vector3(2.5, -0.3, 2)];

    for (const wingOff of wingOffsets) {
        const bullet = createBulletMesh(color, false); // Standard bullet for all types
        const offset = wingOff.clone().applyQuaternion(sourceObj.mesh.quaternion);
        bullet.position.copy(sourceObj.mesh.position).add(offset);
        bullet.quaternion.copy(sourceObj.mesh.quaternion);

        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceObj.mesh.quaternion);
        const velocity = fwd.multiplyScalar(600);

        state.scene.add(bullet);
        state.bullets.push({
            mesh: bullet, velocity: velocity, life: 2.0, type: type,
            damage: isPlayer ? (state.player.damage || 1) : 1,
            isHoming: false, isBullet: true, isBomb: false
        });
    }
}

function shootCannon(sourceObj, type) {
    const isPlayer = type === 'player';
    if (isPlayer) playShootSound();
    const color = isPlayer ? 0xff8800 : 0xff0000;

    // Create Cannon Group logic inline or reuse model?
    // Using inline simplified version as in index.html
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mat);
    body.rotateX(Math.PI / 2);
    group.add(body);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    tip.position.z = 0.9;
    group.add(tip);

    group.position.copy(sourceObj.mesh.position);
    const offset = new THREE.Vector3(0, -1, 3).applyQuaternion(sourceObj.mesh.quaternion);
    group.position.add(offset);
    group.quaternion.copy(sourceObj.mesh.quaternion);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceObj.mesh.quaternion);
    state.scene.add(group);

    state.bullets.push({
        mesh: group, velocity: fwd.multiplyScalar(550), life: 2.5, type: type,
        damage: isPlayer ? (state.player.damage || 2) : 1,
        isHoming: false, isBullet: true, isBomb: false
    });
}

function shootSingleMissile(sourceObj, type) {
    const isPlayer = type === 'player';
    if (isPlayer) playShootSound();
    const color = isPlayer ? 0xffaa00 : 0xff0000;

    const wingOffsets = [
        new THREE.Vector3(-4, -0.5, 1), new THREE.Vector3(4, -0.5, 1),
        new THREE.Vector3(-7, -0.5, 0), new THREE.Vector3(7, -0.5, 0)
    ];
    // Determine offset index based on ammo if player
    let offsetIndex = 0;
    if (isPlayer) {
        offsetIndex = (state.maxMissileAmmo - state.missileAmmo) % wingOffsets.length;
    }

    const missile = createMissileMesh(color);
    const offset = wingOffsets[offsetIndex].clone().applyQuaternion(sourceObj.mesh.quaternion);
    missile.position.copy(sourceObj.mesh.position).add(offset);
    missile.quaternion.copy(sourceObj.mesh.quaternion);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceObj.mesh.quaternion);

    state.scene.add(missile);

    // Find nearest enemy within 35° cone in front of aircraft
    let target = null;
    let minDist = 900; // Max lock-on range
    const lockAngle = Math.cos(35 * Math.PI / 180); // 35 degree half-angle

    for (const e of state.enemies) {
        const toEnemy = new THREE.Vector3().subVectors(e.mesh.position, missile.position).normalize();
        const dot = fwd.dot(toEnemy); // cos(angle between fwd and enemy)
        if (dot > lockAngle) { // Within 35° cone
            const d = missile.position.distanceTo(e.mesh.position);
            if (d < minDist) { minDist = d; target = e; }
        }
    }
    // Also check remote players in multiplayer
    if (state.isMultiplayer) {
        state.remotePlayers.forEach((rp) => {
            if (!rp.mesh) return;
            const toEnemy = new THREE.Vector3().subVectors(rp.mesh.position, missile.position).normalize();
            const dot = fwd.dot(toEnemy);
            if (dot > lockAngle) {
                const d = missile.position.distanceTo(rp.mesh.position);
                if (d < minDist) { minDist = d; target = rp; }
            }
        });
    }

    state.bullets.push({
        mesh: missile, velocity: fwd.multiplyScalar(350), life: 4.0, type: type,
        damage: isPlayer ? (state.player.damage || 2) : 1,
        isHoming: true, isBullet: false, isBomb: false,
        targetEnemy: target
    });
}

function dropBomb(sourceObj, type) {
    const isPlayer = type === 'player';
    if (isPlayer) playShootSound();

    const bomb = createBombMesh();
    bomb.position.copy(sourceObj.mesh.position);
    const down = new THREE.Vector3(0, -2, 0).applyQuaternion(sourceObj.mesh.quaternion);
    bomb.position.add(down);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceObj.mesh.quaternion);
    const baseSpeed = (isPlayer && state.player.aircraftType) ? state.player.aircraftType.speed : 45;
    const velocity = fwd.multiplyScalar(baseSpeed * 0.8);
    velocity.y -= 10;

    state.scene.add(bomb);
    state.bullets.push({
        mesh: bomb, velocity: velocity, life: 10.0, type: type,
        damage: isPlayer ? (state.player.damage || 3) : 1,
        isHoming: false, isBullet: false, isBomb: true
    });
}

export function shoot(sourceObj, type) {
    // Generic
    const isPlayer = type === 'player';
    if (isPlayer) playShootSound();
    const color = isPlayer ? 0xffaa00 : 0xff0000;
    const bullet = createMissileMesh(color);

    bullet.position.copy(sourceObj.mesh.position);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(sourceObj.mesh.quaternion);
    bullet.position.addScaledVector(fwd, 2);
    bullet.quaternion.copy(sourceObj.mesh.quaternion);

    state.scene.add(bullet);
    state.bullets.push({
        mesh: bullet, velocity: fwd.multiplyScalar(400), life: 3.0, type: type,
        damage: 1, isHoming: false, isBullet: false, isBomb: false
    });
}

function aaShoot(aa, target) {
    // Logic for AA shooting
    const turret = aa.mesh.userData.turret;
    const bulletGeo = new THREE.SphereGeometry(0.3, 4, 4);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const bulletMesh = new THREE.Mesh(bulletGeo, bulletMat);

    const worldPos = new THREE.Vector3();
    turret.getWorldPosition(worldPos);
    worldPos.y += 1;
    bulletMesh.position.copy(worldPos);
    state.scene.add(bulletMesh);

    const targetPos = target.mesh ? target.mesh.position.clone() : target.position.clone();
    const dir = targetPos.sub(worldPos).normalize();

    state.bullets.push({
        mesh: bulletMesh, velocity: dir.multiplyScalar(250), life: 2.0,
        type: 'aa', damage: aa.damage
    });

    const flash = turret.getObjectByName('muzzleFlash');
    if (flash) {
        flash.material.opacity = 1.0;
        setTimeout(() => flash.material.opacity = 0, 80);
    }
}

// === UPDATE LOOPS ===

export function updatePlayer(dt) {
    if (!state.player) return;
    const player = state.player;

    // Cooldown
    if (playerFireCooldown > 0) playerFireCooldown -= dt;

    // Continuous Fire (Hold Space or Mouse)
    if (state.keys['Space'] || state.mouseDown) {
        tryPlayerShoot();
    }

    // Movement logic
    let baseSpeed = player.aircraftType.speed;
    if (state.activePowerup && state.activePowerup.type === 'speed') baseSpeed *= 1.5;
    const speed = state.keys['KeyW'] ? baseSpeed * 1.4 : (state.keys['KeyS'] ? baseSpeed * 0.6 : baseSpeed);

    let pitch = 0, roll = 0, yaw = 0;
    const inv = window.invertedControls ? 1 : -1;
    if (state.keys['ArrowUp']) pitch = inv;
    if (state.keys['ArrowDown']) pitch = -inv;
    if (state.keys['ArrowLeft']) roll = -1;
    if (state.keys['ArrowRight']) roll = 1;
    if (state.keys['KeyA']) yaw = 1;
    if (state.keys['KeyD']) yaw = -1;

    player.mesh.rotateX(pitch * 1.0 * dt);
    player.mesh.rotateZ(roll * 2.2 * dt);
    player.mesh.rotateY(yaw * 1.0 * dt);

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(player.mesh.quaternion);
    player.mesh.position.addScaledVector(fwd, speed * dt);

    // Animations (Nav lights / Ailerons / Fire)
    // ... Simplified animations for modules ...
    const blinkState = Math.floor(Date.now() / 500) % 2 === 0;
    const navL = player.mesh.getObjectByName('navLightLeft');
    if (navL) navL.visible = blinkState;
    // ...

    // Terrain Collision
    const tH = getTerrainHeight(player.mesh.position.x, player.mesh.position.z);
    if (player.mesh.position.y < tH + 2) {
        gameOver("You crashed into the mountains!");
    }

    // Tree Collision
    for (const tree of state.treeColliders) {
        // Simplified distance check
        const dx = player.mesh.position.x - tree.x;
        const dz = player.mesh.position.z - tree.z;
        if (dx * dx + dz * dz < tree.radius * tree.radius) {
            const tBase = getTerrainHeight(tree.x, tree.z);
            if (player.mesh.position.y < tBase + tree.height) {
                gameOver("You crashed into a tree!");
            }
        }
    }
}

export function updateEnemies(dt) {
    state.enemies.forEach(enemy => {
        // AI Logic
        if (!state.player) return;
        const toPlayer = new THREE.Vector3().subVectors(state.player.mesh.position, enemy.mesh.position);
        const dist = toPlayer.length();
        toPlayer.normalize();

        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.mesh.quaternion);
        // Simple turn towards player
        const desiredQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toPlayer);
        enemy.mesh.quaternion.rotateTowards(desiredQ, 0.5 * dt);

        enemy.mesh.position.addScaledVector(fwd, enemy.speed * dt); // Simple forward

        enemy.cooldown -= dt;
        if (dist < 300 && enemy.cooldown <= 0) {
            shoot(enemy, 'enemy');
            enemy.cooldown = 6 + Math.random() * 2;
        }
    });
}

export function updateAntiAirs(dt) {
    state.antiAirs.forEach(aa => {
        aa.cooldown -= dt;
        if (!state.player) return;

        const dist = aa.mesh.position.distanceTo(state.player.mesh.position);
        if (dist < aa.range && aa.cooldown <= 0) {
            aaShoot(aa, state.player);
            aa.cooldown = aa.fireRate;
        }

        // Turret rotation logic
        const turret = aa.mesh.userData.turret;
        if (turret) {
            turret.lookAt(state.player.mesh.position); // Simplified lookAt
        }
    });
}

export function updateBullets(dt) {
    for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.life -= dt;

        if (b.isBomb) {
            b.velocity.y -= 120 * dt;
            // Blink light
            const light = b.mesh.getObjectByName('bombLight');
            if (light) {
                const blink = Math.floor(Date.now() / 200) % 2 === 0;
                light.visible = blink;
                light.material.color.setHex(blink ? 0xff0000 : 0x440000);
            }
        }

        // Homing Logic
        if (b.isHoming && b.targetEnemy && b.targetEnemy.mesh) {
            // Verify target is still alive (in enemies list or remote players)
            const isAlive = state.enemies.includes(b.targetEnemy) ||
                (state.remotePlayers && state.remotePlayers.has &&
                    Array.from(state.remotePlayers.values()).includes(b.targetEnemy));

            if (isAlive) {
                const desired = new THREE.Vector3().subVectors(b.targetEnemy.mesh.position, b.mesh.position).normalize();
                const curr = b.velocity.clone().normalize();
                curr.lerp(desired, 3 * dt).normalize(); // Gentle tracking
                b.velocity.copy(curr.multiplyScalar(b.velocity.length()));
                // Rotate missile to face direction
                b.mesh.lookAt(b.mesh.position.clone().add(b.velocity));
            } else {
                b.targetEnemy = null; // Target destroyed, fly straight
            }
        }

        b.mesh.position.addScaledVector(b.velocity, dt);

        // Collisions
        if (b.type === 'player') {
            // Check enemies
            for (let j = state.enemies.length - 1; j >= 0; j--) {
                const e = state.enemies[j];
                if (b.mesh.position.distanceTo(e.mesh.position) < 15) {
                    playImpactSound();
                    createExplosion(e.mesh.position, 0xff0000, 30);
                    createDebris(e.mesh.position);
                    state.score += 100;
                    registerKill();
                    updateScore();
                    state.scene.remove(e.mesh);
                    state.enemies.splice(j, 1);
                    state.scene.remove(b.mesh);
                    state.bullets.splice(i, 1);
                    return; // Bullet dead
                }
            }
            // Check AA
            for (let j = state.antiAirs.length - 1; j >= 0; j--) {
                const aa = state.antiAirs[j];
                if (b.mesh.position.distanceTo(aa.mesh.position) < 15) {
                    aa.health--;
                    if (aa.health <= 0) {
                        createExplosion(aa.mesh.position, 0xff8800, 50);
                        state.score += 50;
                        updateScore();
                        state.scene.remove(aa.mesh);
                        state.antiAirs.splice(j, 1);
                    } else {
                        createExplosion(aa.mesh.position, 0xffff00, 10);
                    }
                    state.scene.remove(b.mesh);
                    state.bullets.splice(i, 1);
                    return;
                }
            }
            // Check Remote Players (PvP)
            if (state.isMultiplayer && state.socket) {
                state.remotePlayers.forEach((rp, rpId) => {
                    if (!rp.mesh) return;
                    // Friendly fire prevention
                    if (rp.data && rp.data.team && state.team && rp.data.team === state.team) return;
                    const dist = b.mesh.position.distanceTo(rp.mesh.position);
                    if (dist < 15) {
                        // Hit!
                        createExplosion(rp.mesh.position.clone(), 0xff4444, 20);
                        state.socket.emit('hitPlayer', {
                            targetId: rpId,
                            damage: b.damage || 1,
                            bulletId: b.id
                        });
                        state.scene.remove(b.mesh);
                        state.bullets.splice(i, 1);
                    }
                });
                if (!state.bullets[i]) return; // Bullet was removed
            }
        } else if (b.type === 'enemy' || b.type === 'aa') {
            if (state.player && b.mesh.position.distanceTo(state.player.mesh.position) < 10) {
                playImpactSound();
                takeDamage(1);
                state.scene.remove(b.mesh);
                state.bullets.splice(i, 1);
                return;
            }
        }

        // Ground hit
        const tH = getTerrainHeight(b.mesh.position.x, b.mesh.position.z);
        if (b.mesh.position.y < tH) {
            if (b.isBomb) {
                createExplosion(b.mesh.position, 0xff4400, 100); // Huge explosion!
            } else {
                playImpactSound(); // Quiet tick for bullets
                createExplosion(b.mesh.position, 0xffff00, 10); // Small visual only
            }
            state.scene.remove(b.mesh);
            state.bullets.splice(i, 1);
        } else if (b.life <= 0) {
            state.scene.remove(b.mesh);
            state.bullets.splice(i, 1);
        }
    }
}

export function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.life -= dt;
        const positions = p.mesh.geometry.attributes.position.array;
        for (let j = 0; j < p.velocities.length; j++) { // Correct loop?
            // velocity is array [vx, vy, vz, vx, vy, vz...]
            // No, in createExplosion I am pushing velocities per particle!
            // Wait, createExplosion logic:
            // velocities.push(vx, vy, vz) per particle.
            // positions.push(0,0,0).
            positions[j] += p.velocities[j] * dt;
        }
        p.mesh.geometry.attributes.position.needsUpdate = true;
        p.mesh.material.opacity = p.life;

        if (p.life <= 0) {
            state.scene.remove(p.mesh);
            state.particles.splice(i, 1);
        }
    }
}

export function updateDebris(dt) {
    for (let i = debrisList.length - 1; i >= 0; i--) {
        const d = debrisList[i];
        d.life -= dt;
        d.velocity.y -= 40 * dt;
        d.mesh.position.addScaledVector(d.velocity, dt);
        d.mesh.rotation.x += d.rotSpeed.x * dt;

        if (d.mesh.position.y < getTerrainHeight(d.mesh.position.x, d.mesh.position.z)) {
            d.mesh.position.y = getTerrainHeight(d.mesh.position.x, d.mesh.position.z);
            d.velocity.set(0, 0, 0);
        }

        if (d.life <= 0) {
            state.scene.remove(d.mesh);
            debrisList.splice(i, 1);
        }
    }
}

export function takeDamage(amount) {
    if (!state.player) return;
    state.player.health -= amount;
    updateHealthBar();
    showDamageFlash();
    addShake(0.5);
    playExplodeSound();

    if (state.player.health <= 0) {
        gameOver("Shot down!");
    }
}

export function gameOver(msg) {
    createExplosion(state.player.mesh.position, 0xff0000, 100);
    setTimeout(() => {
        alert("GAME OVER: " + msg);
        location.reload();
    }, 100);
    setPlayer(null); // Stop logic
}


export function createRemotePlayer(id, data) {
    if (state.remotePlayers.has(id)) return;

    // Determine color by team
    const isTeammate = data.team && state.team && data.team === state.team;
    let color;
    if (data.team === 'blue') {
        color = { main: 0x3b82f6, wing: 0x1d4ed8 };
    } else if (data.team === 'red') {
        color = { main: 0xef4444, wing: 0xb91c1c };
    } else {
        color = data.color || { main: 0xcccccc, wing: 0x888888 };
    }
    const mesh = createJetMesh(color.main, color.wing, data.aircraftType || 'fighter');

    // Name tag (green for teammates, red for enemies)
    const nameColor = isTeammate ? '#4ade80' : '#ff6b6b';
    const teamLabel = data.team === 'blue' ? '🔵 ' : data.team === 'red' ? '🔴 ' : '';
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isTeammate ? 'rgba(0,40,0,0.7)' : 'rgba(40,0,0,0.7)';
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();
    ctx.fillStyle = nameColor;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(teamLabel + (data.name || 'Pilot'), 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 8;
    sprite.scale.set(12, 3, 1);
    mesh.add(sprite);

    if (data.position) {
        mesh.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (data.rotation) {
        mesh.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
    }

    state.scene.add(mesh);
    state.remotePlayers.set(id, {
        mesh: mesh,
        data: data,
        targetPos: mesh.position.clone(),
        targetQuat: mesh.quaternion.clone()
    });
}

export function updateRemotePlayers(dt) {
    state.remotePlayers.forEach((rp) => {
        if (rp.mesh && rp.targetPos) {
            rp.mesh.position.lerp(rp.targetPos, 0.15);
            rp.mesh.quaternion.slerp(rp.targetQuat, 0.15);

            // Nav lights
            const blink = Math.floor(Date.now() / 500) % 2 === 0;
            const nL = rp.mesh.getObjectByName('navLightLeft');
            if (nL) nL.visible = blink;
        }
    });

    // Broadcast my position
    if (state.isMultiplayer && state.socket && state.socket.connected) {
        const now = Date.now();
        if (now - state.lastSyncTime > SYNC_RATE && state.player && state.player.mesh) {
            state.lastSyncTime = now;
            state.socket.emit('playerUpdate', {
                position: {
                    x: state.player.mesh.position.x,
                    y: state.player.mesh.position.y,
                    z: state.player.mesh.position.z
                },
                rotation: {
                    x: state.player.mesh.quaternion.x,
                    y: state.player.mesh.quaternion.y,
                    z: state.player.mesh.quaternion.z,
                    w: state.player.mesh.quaternion.w
                },
                speed: state.player.speed || 0
            });
        }
    }
}

export function removeRemotePlayer(id) {
    if (state.remotePlayers.has(id)) {
        const rp = state.remotePlayers.get(id);
        state.scene.remove(rp.mesh);
        state.remotePlayers.delete(id);
    }
}

// =====================
// POWER-UPS
// =====================
const POWERUP_TYPES = [
    { type: 'speed', color: 0x3b82f6, label: '⚡ HIZ ARTIŞI!', duration: 8 },
    { type: 'health', color: 0x22c55e, label: '💚 CAN YENİLENDİ!', duration: 0 },
    { type: 'damage', color: 0xef4444, label: '💥 ÇİFT HASAR!', duration: 8 }
];

export function spawnPowerup() {
    const pType = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];

    // Create floating box
    const geo = new THREE.BoxGeometry(5, 5, 5);
    const mat = new THREE.MeshPhongMaterial({
        color: pType.color,
        emissive: pType.color,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Random position on map
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * 600;
    mesh.position.set(
        Math.sin(angle) * dist,
        60 + Math.random() * 80,
        Math.cos(angle) * dist
    );

    state.scene.add(mesh);
    state.powerups.push({
        mesh,
        type: pType.type,
        label: pType.label,
        duration: pType.duration,
        baseY: mesh.position.y,
        time: 0
    });
}

export function updatePowerups(dt) {
    // Animate & check collection
    for (let i = state.powerups.length - 1; i >= 0; i--) {
        const pu = state.powerups[i];
        pu.time += dt;

        // Bob up and down + rotate
        pu.mesh.position.y = pu.baseY + Math.sin(pu.time * 2) * 3;
        pu.mesh.rotation.y += dt * 2;
        pu.mesh.rotation.x += dt * 0.5;

        // Check player collision
        if (state.player && state.player.mesh) {
            const dist = pu.mesh.position.distanceTo(state.player.mesh.position);
            if (dist < 20) {
                collectPowerup(pu);
                state.scene.remove(pu.mesh);
                state.powerups.splice(i, 1);
            }
        }
    }

    // Update active powerup timer
    if (state.activePowerup) {
        state.activePowerup.timer -= dt;
        if (state.activePowerup.timer <= 0) {
            state.activePowerup = null;
        }
    }
}

function collectPowerup(pu) {
    createExplosion(pu.mesh.position.clone(), 0xffff00, 15);

    if (pu.type === 'health') {
        // Heal to full
        if (state.player) {
            state.player.health = state.player.maxHealth;
            updateHealthBar();
        }
    } else if (pu.type === 'speed') {
        state.activePowerup = { type: 'speed', timer: pu.duration };
    } else if (pu.type === 'damage') {
        state.activePowerup = { type: 'damage', timer: pu.duration };
    }

    // Show notification
    const notify = document.getElementById('powerup-notify');
    if (notify) {
        notify.textContent = pu.label;
        notify.className = 'show';
        setTimeout(() => { notify.className = ''; }, 2000);
    }
}

