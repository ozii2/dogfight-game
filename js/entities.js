import * as THREE from 'three';
import { state, setPlayer } from './state.js';
import { getTerrainHeight } from './utils.js';
import { AIRCRAFT_TYPES, STREAK_NAMES, KILL_STREAK_TIMEOUT, SYNC_RATE, MAP_BOUNDARY, MAP_WARNING } from './constants.js';
import { playShootSound, playExplodeSound, playImpactSound, stopEngineSound, playFlareSound } from './audio.js';
import { updateHealthBar, updateScore, showKillFeed, showKillStreak, updateWeaponUI, updateAmmoDisplay, showDamageFlash, showGameOver, showRespawnCountdown, showBoundaryWarning, showKillNotification, incrementKillCount, updateMissileReload, updateSpeedAltitude, updateAfterburnerBar, updateFlareDisplay, updateLockOnHUD } from './ui.js';
import { addShake } from './graphics.js';
import { createJetMesh, createAntiAirMesh, createMissileMesh, createBulletMesh, createBombMesh } from './models.js';

let debrisList = [];
let playerFireCooldown = 0;
let killStreakTimer = null;
let totalPlayerKills = 0;

// Missile reload state
let missileReloadTimer = 0;

// Bullet trail particles pool
const trailParticles = [];

export function registerKill() {
    const now = Date.now();
    if (now - state.lastKillTime < KILL_STREAK_TIMEOUT) {
        state.killStreak++;
    } else {
        state.killStreak = 1;
    }
    state.lastKillTime = now;
    totalPlayerKills++;
    state.sessionKills++;
    incrementKillCount();

    // Big kill notification
    const pts = state.killStreak >= 2 ? state.killStreak * 100 : 100;
    showKillNotification(pts);

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

    // Session tracking
    if (!state.sessionStartTime) state.sessionStartTime = Date.now();

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

    const enemy = createJetMesh(0xff0000, 0x333333, enemyModel);

    const angle = Math.random() * Math.PI * 2;
    const dist = 800 + Math.random() * 1200;
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist;
    const y = 80 + Math.random() * 120;

    enemy.position.set(x, y, z);
    enemy.lookAt(0, y, 0);

    state.scene.add(enemy);

    // AI state machine
    const patrolAngle = Math.random() * Math.PI * 2;
    state.enemies.push({
        mesh: enemy,
        speed: 35 + Math.random() * 15,
        cooldown: 3.0 + Math.random() * 3.0,
        type: enemyModel,
        // AI
        aiState: 'patrol',       // patrol | pursue | attack | evade | altitude
        evadeTimer: 0,
        evadeDir: 1,
        patrolAngle: patrolAngle,
        patrolRadius: 300 + Math.random() * 400,
        aiTimer: Math.random() * 2
    });

    const el = document.getElementById('enemy-count');
    if (el) el.innerText = state.enemies.length;
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

    // Missile reload for attack aircraft
    if (player.aircraftType && player.aircraftType.modelType === 'attack') {
        const reloadTime = player.aircraftType.missileReloadTime || 18;
        const maxAmmo = player.aircraftType.missileAmmo || 6;
        if (state.missileAmmo < maxAmmo) {
            missileReloadTimer += dt;
            updateMissileReload(missileReloadTimer / reloadTime);
            if (missileReloadTimer >= reloadTime) {
                missileReloadTimer = 0;
                state.missileAmmo = Math.min(state.missileAmmo + 1, maxAmmo);
                updateAmmoDisplay();
                updateMissileReload(1); // hide bar
            }
        } else {
            missileReloadTimer = 0;
            updateMissileReload(1); // hide bar
        }
    }

    // Continuous Fire
    if (state.keys['Space'] || state.mouseDown) {
        tryPlayerShoot();
    }

    // Movement logic
    let baseSpeed = player.aircraftType.speed;
    if (state.activePowerup && state.activePowerup.type === 'speed') baseSpeed *= 1.5;

    // Afterburner
    const abKey = state.keys['ShiftLeft'] || state.keys['ShiftRight'];
    if (abKey && state.afterburnerFuel > 0 && state.afterburnerCooldown <= 0) {
        state.afterburnerActive = true;
        state.afterburnerFuel = Math.max(0, state.afterburnerFuel - dt / 5);
        if (state.afterburnerFuel <= 0) state.afterburnerCooldown = 10;
    } else {
        state.afterburnerActive = false;
        if (state.afterburnerCooldown > 0) {
            state.afterburnerCooldown = Math.max(0, state.afterburnerCooldown - dt);
        } else if (state.afterburnerFuel < 1.0) {
            state.afterburnerFuel = Math.min(1.0, state.afterburnerFuel + dt / 8);
        }
    }
    if (state.afterburnerActive) baseSpeed *= 1.5;

    // Damage model: speed penalty at < 30% health
    const healthPct = player.health / player.maxHealth;
    if (healthPct < 0.3) baseSpeed *= 0.7;

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

    // Afterburner flame trail
    if (state.afterburnerActive) {
        const bwd = new THREE.Vector3(0, 0, -1).applyQuaternion(player.mesh.quaternion);
        const tp = player.mesh.position.clone().addScaledVector(bwd, 4);
        spawnTrailParticle(tp, 0xff6600, false);
        if (Math.random() < 0.5) spawnTrailParticle(tp.clone().addScaledVector(bwd, 2), 0xffaa00, false);
    }

    // Damage smoke at < 50% health
    if (healthPct < 0.5 && Math.random() < (0.5 - healthPct) * dt * 25) {
        const sp = player.mesh.position.clone();
        sp.y -= 1;
        spawnTrailParticle(sp, healthPct < 0.25 ? 0x111111 : 0x444444, true);
    }

    // Nav lights
    const blinkState = Math.floor(Date.now() / 500) % 2 === 0;
    const navL = player.mesh.getObjectByName('navLightLeft');
    if (navL) navL.visible = blinkState;

    // Speed & altitude HUD
    const terrH = getTerrainHeight(player.mesh.position.x, player.mesh.position.z);
    const altitude = player.mesh.position.y - terrH;
    updateSpeedAltitude(speed, altitude);
    updateAfterburnerBar(state.afterburnerFuel, state.afterburnerActive, state.afterburnerCooldown > 0);
    updateFlareDisplay(state.flareAmmo);

    // Terrain Collision
    if (player.mesh.position.y < terrH + 2) {
        handlePlayerDeath("Dağa çarptın!");
        return;
    }

    // Tree Collision
    for (const tree of state.treeColliders) {
        const dx = player.mesh.position.x - tree.x;
        const dz = player.mesh.position.z - tree.z;
        if (dx * dx + dz * dz < tree.radius * tree.radius) {
            const tBase = getTerrainHeight(tree.x, tree.z);
            if (player.mesh.position.y < tBase + tree.height) {
                handlePlayerDeath("Ağaca çarptın!");
                return;
            }
        }
    }

    // Map boundary check
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    const boundary = MAP_BOUNDARY || 2000;
    const warning = MAP_WARNING || 1700;
    const distFromCenter = Math.max(Math.abs(px), Math.abs(pz));

    if (distFromCenter > boundary) {
        // Force redirect toward center
        const toCenter = new THREE.Vector3(-px, 0, -pz).normalize();
        const desiredQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, 1), toCenter
        );
        player.mesh.quaternion.rotateTowards(desiredQ, 2.0 * dt);
        showBoundaryWarning(true);
    } else if (distFromCenter > warning) {
        showBoundaryWarning(true);
    } else {
        showBoundaryWarning(false);
    }
}


export function updateEnemies(dt) {
    state.enemies.forEach(enemy => {
        if (!state.player) return;

        const eMesh = enemy.mesh;
        const ePos = eMesh.position;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(eMesh.quaternion);
        enemy.cooldown -= dt;
        enemy.aiTimer -= dt;

        // === TERRAIN AVOIDANCE: Always check altitude ===
        const tH = getTerrainHeight(ePos.x, ePos.z);
        const alt = ePos.y - tH;
        if (alt < 25) {
            enemy.aiState = 'altitude';
            enemy.evadeTimer = 0;
        }

        const toPlayer = new THREE.Vector3().subVectors(state.player.mesh.position, ePos);
        const dist = toPlayer.length();
        const toPlayerN = toPlayer.clone().normalize();
        const facingDot = fwd.dot(toPlayerN); // 1 = facing player, -1 = facing away

        // === STATE TRANSITIONS ===
        if (enemy.aiState !== 'altitude') {
            if (enemy.evadeTimer > 0) {
                enemy.evadeTimer -= dt;
                if (enemy.evadeTimer <= 0) {
                    enemy.aiState = dist < 500 ? 'pursue' : 'patrol';
                }
            } else if (dist > 1400) {
                enemy.aiState = 'patrol';
            } else if (dist < 200 && facingDot > 0.5) {
                enemy.aiState = 'attack';
            } else if (dist < 700) {
                enemy.aiState = 'pursue';
                // Random evasion chance when player is behind
                if (facingDot < -0.3 && Math.random() < 0.003) {
                    enemy.aiState = 'evade';
                    enemy.evadeTimer = 1.5 + Math.random();
                    enemy.evadeDir = Math.random() < 0.5 ? 1 : -1;
                }
            }
        }

        // === STATE BEHAVIOR ===
        let targetQ;

        if (enemy.aiState === 'altitude') {
            // Pitch up hard to gain altitude
            const up = new THREE.Vector3(0, 1, 0);
            const combined = fwd.clone().add(up.multiplyScalar(3)).normalize();
            targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), combined);
            eMesh.quaternion.rotateTowards(targetQ, 1.8 * dt);
            if (alt > 50) enemy.aiState = 'pursue';

        } else if (enemy.aiState === 'evade') {
            // Bank hard left or right
            eMesh.rotateZ(enemy.evadeDir * 3.5 * dt);
            eMesh.rotateY(-enemy.evadeDir * 1.2 * dt);

        } else if (enemy.aiState === 'patrol') {
            // Circle patrol pattern
            if (enemy.aiTimer <= 0) {
                enemy.patrolAngle += 0.3 + Math.random() * 0.4;
                enemy.aiTimer = 2 + Math.random() * 2;
            }
            const patX = Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
            const patZ = Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
            const patY = 80 + Math.sin(enemy.patrolAngle * 0.7) * 30;
            const toPatrol = new THREE.Vector3(patX - ePos.x, patY - ePos.y, patZ - ePos.z).normalize();
            targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toPatrol);
            eMesh.quaternion.rotateTowards(targetQ, 0.6 * dt);

        } else {
            // pursue / attack – turn toward player with altitude awareness
            const desiredY = Math.max(tH + 40, state.player.mesh.position.y);
            const aimPos = new THREE.Vector3(
                state.player.mesh.position.x,
                desiredY,
                state.player.mesh.position.z
            );
            const toAim = new THREE.Vector3().subVectors(aimPos, ePos).normalize();
            targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toAim);
            const turnRate = enemy.aiState === 'attack' ? 1.0 : 0.7;
            eMesh.quaternion.rotateTowards(targetQ, turnRate * dt);
        }

        // Move forward
        const moveFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(eMesh.quaternion);
        eMesh.position.addScaledVector(moveFwd, enemy.speed * dt);

        // Shooting
        if (enemy.aiState === 'attack' && dist < 320 && enemy.cooldown <= 0 && facingDot > 0.7) {
            shoot(enemy, 'enemy');
            enemy.cooldown = 2.5 + Math.random() * 2.5;
        } else if (enemy.aiState === 'pursue' && dist < 500 && enemy.cooldown <= 0 && facingDot > 0.5) {
            shoot(enemy, 'enemy');
            enemy.cooldown = 4 + Math.random() * 3;
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

// Spawn a small trail particle at position
function spawnTrailParticle(pos, color, isSmoke) {
    const geo = new THREE.SphereGeometry(isSmoke ? 1.2 : 0.4, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: isSmoke ? 0.45 : 0.8
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    state.scene.add(mesh);
    trailParticles.push({ mesh, life: isSmoke ? 0.5 : 0.2, maxLife: isSmoke ? 0.5 : 0.2 });

    // Cull old trails
    while (trailParticles.length > 200) {
        const old = trailParticles.shift();
        state.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.mesh.material.dispose();
    }
}

export function updateTrailParticles(dt) {
    for (let i = trailParticles.length - 1; i >= 0; i--) {
        const t = trailParticles[i];
        t.life -= dt;
        t.mesh.material.opacity = (t.life / t.maxLife) * (t.mesh.material.opacity > 0.01 ? t.mesh.material.opacity : 0);
        if (t.life <= 0) {
            state.scene.remove(t.mesh);
            t.mesh.geometry.dispose();
            t.mesh.material.dispose();
            trailParticles.splice(i, 1);
        }
    }
}

// === FLARE SYSTEM ===

export function launchFlare() {
    if (!state.player || state.flareAmmo <= 0 || state.flareCooldown > 0) return;
    state.flareAmmo--;
    state.flareCooldown = 2.0;

    const geo = new THREE.SphereGeometry(0.6, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(state.player.mesh.position);

    const bwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.player.mesh.quaternion);
    const velocity = bwd.multiplyScalar(25);
    velocity.y -= 8;

    state.scene.add(mesh);
    state.activeFlares.push({ mesh, velocity, life: 3.5 });
    playFlareSound();
}

export function updateFlares(dt) {
    if (state.flareCooldown > 0) state.flareCooldown = Math.max(0, state.flareCooldown - dt);

    for (let i = state.activeFlares.length - 1; i >= 0; i--) {
        const fl = state.activeFlares[i];
        fl.life -= dt;
        fl.velocity.y -= 18 * dt;
        fl.mesh.position.addScaledVector(fl.velocity, dt);

        // Deflect homing missiles aimed near the flare
        for (const b of state.bullets) {
            if (!b.isHoming) continue;
            if (b.mesh.position.distanceTo(fl.mesh.position) < 35) {
                b.targetEnemy = null; // break lock
            }
        }

        // Flare particle trail
        if (Math.random() < 0.5) spawnTrailParticle(fl.mesh.position, 0xffaa00, false);
        if (Math.random() < 0.3) spawnTrailParticle(fl.mesh.position, 0xffffff, false);

        if (fl.life <= 0) {
            state.scene.remove(fl.mesh);
            fl.mesh.geometry.dispose();
            fl.mesh.material.dispose();
            state.activeFlares.splice(i, 1);
        }
    }
}

// === LOCK-ON INDICATOR (for attack aircraft) ===

export function updateLockOn(dt) {
    if (!state.player || !state.player.aircraftType) {
        state.lockOnTarget = null; state.lockOnProgress = 0;
        updateLockOnHUD(null, 0);
        return;
    }
    if (state.player.aircraftType.modelType !== 'attack' || state.attackWeaponMode !== 1) {
        state.lockOnTarget = null; state.lockOnProgress = 0;
        updateLockOnHUD(null, 0);
        return;
    }

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(state.player.mesh.quaternion);
    const lockCos = Math.cos(35 * Math.PI / 180);
    let bestTarget = null;
    let minDist = 900;

    for (const e of state.enemies) {
        const toE = new THREE.Vector3().subVectors(e.mesh.position, state.player.mesh.position).normalize();
        if (fwd.dot(toE) > lockCos) {
            const d = state.player.mesh.position.distanceTo(e.mesh.position);
            if (d < minDist) { minDist = d; bestTarget = e; }
        }
    }

    if (bestTarget) {
        if (state.lockOnTarget === bestTarget) {
            state.lockOnProgress = Math.min(1.0, state.lockOnProgress + dt * 1.2);
        } else {
            state.lockOnTarget = bestTarget;
            state.lockOnProgress = 0;
        }
    } else {
        state.lockOnTarget = null;
        state.lockOnProgress = 0;
    }
    updateLockOnHUD(state.lockOnTarget, state.lockOnProgress);
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
            // Bomb trail
            if (Math.random() < 0.6) spawnTrailParticle(b.mesh.position, 0x888888, true);
        }

        // Trail for missiles
        if (b.isHoming) {
            spawnTrailParticle(b.mesh.position, 0xaaccff, true);
        } else if (b.isBullet && Math.random() < 0.4) {
            spawnTrailParticle(b.mesh.position, b.type === 'player' ? 0xffee66 : 0xff4444, false);
        }

        // Homing Logic
        if (b.isHoming && b.targetEnemy && b.targetEnemy.mesh) {
            const isAlive = state.enemies.includes(b.targetEnemy) ||
                (state.remotePlayers && state.remotePlayers.has &&
                    Array.from(state.remotePlayers.values()).includes(b.targetEnemy));

            if (isAlive) {
                const desired = new THREE.Vector3().subVectors(b.targetEnemy.mesh.position, b.mesh.position).normalize();
                const curr = b.velocity.clone().normalize();
                curr.lerp(desired, 3 * dt).normalize();
                b.velocity.copy(curr.multiplyScalar(b.velocity.length()));
                b.mesh.lookAt(b.mesh.position.clone().add(b.velocity));
            } else {
                b.targetEnemy = null;
            }
        }

        b.mesh.position.addScaledVector(b.velocity, dt);

        // Per-aircraft hit radius
        const playerHitR = state.player && state.player.aircraftType ? (state.player.aircraftType.hitRadius || 10) : 10;

        // Collisions
        if (b.type === 'player') {
            // Check enemies – use enemy type hitRadius
            for (let j = state.enemies.length - 1; j >= 0; j--) {
                const e = state.enemies[j];
                const hitR = AIRCRAFT_TYPES[e.type] ? (AIRCRAFT_TYPES[e.type].hitRadius || 10) : 10;
                if (b.mesh.position.distanceTo(e.mesh.position) < hitR) {
                    playImpactSound();
                    createExplosion(e.mesh.position, 0xff0000, 30);
                    createDebris(e.mesh.position);
                    state.score += 100;
                    registerKill();
                    updateScore();
                    showKillFeed(`💀 Düşman vuruldu! +100`, '#ff4444');
                    state.scene.remove(e.mesh);
                    state.enemies.splice(j, 1);
                    state.scene.remove(b.mesh);
                    if (b.mesh.geometry) b.mesh.geometry.dispose();
                    if (b.mesh.material) b.mesh.material.dispose();
                    state.bullets.splice(i, 1);
                    const el = document.getElementById('enemy-count');
                    if (el) el.innerText = state.enemies.length;
                    return;
                }
            }
            // Check AA
            for (let j = state.antiAirs.length - 1; j >= 0; j--) {
                const aa = state.antiAirs[j];
                if (b.mesh.position.distanceTo(aa.mesh.position) < 12) {
                    aa.health -= b.damage || 1;
                    if (aa.health <= 0) {
                        createExplosion(aa.mesh.position, 0xff8800, 50);
                        state.score += 50;
                        showKillNotification(50, 'AA');
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
                let bulletRemoved = false;
                state.remotePlayers.forEach((rp, rpId) => {
                    if (bulletRemoved || !rp.mesh) return;
                    if (rp.data && rp.data.team && state.team && rp.data.team === state.team) return;
                    const dist = b.mesh.position.distanceTo(rp.mesh.position);
                    if (dist < 12) {
                        createExplosion(rp.mesh.position.clone(), 0xff4444, 20);
                        state.socket.emit('hitPlayer', {
                            targetId: rpId,
                            damage: b.damage || 1,
                            bulletId: b.id
                        });
                        state.scene.remove(b.mesh);
                        state.bullets.splice(i, 1);
                        bulletRemoved = true;
                    }
                });
                if (bulletRemoved) return;
            }
        } else if (b.type === 'enemy' || b.type === 'aa') {
            if (state.player && b.mesh.position.distanceTo(state.player.mesh.position) < playerHitR) {
                playImpactSound();
                takeDamage(b.damage || 1);
                state.scene.remove(b.mesh);
                state.bullets.splice(i, 1);
                return;
            }
        }

        // Ground hit
        const tH = getTerrainHeight(b.mesh.position.x, b.mesh.position.z);
        if (b.mesh.position.y < tH) {
            if (b.isBomb) {
                createExplosion(b.mesh.position, 0xff4400, 100);
            } else {
                createExplosion(b.mesh.position, 0xffff00, 10);
            }
            state.scene.remove(b.mesh);
            if (b.mesh.geometry) b.mesh.geometry.dispose();
            if (b.mesh.material) b.mesh.material.dispose();
            state.bullets.splice(i, 1);
        } else if (b.life <= 0) {
            state.scene.remove(b.mesh);
            if (b.mesh.geometry) b.mesh.geometry.dispose();
            if (b.mesh.material) b.mesh.material.dispose();
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

function handlePlayerDeath(cause) {
    if (state.isMultiplayer) {
        gameOver(cause);
    } else {
        triggerSingleplayerDeath(cause);
    }
}

export function takeDamage(amount) {
    if (!state.player) return;
    if (state.gameOverShown) return;
    state.player.health -= amount;
    updateHealthBar();
    showDamageFlash();
    addShake(0.5);
    playExplodeSound();

    if (state.player.health <= 0) {
        handlePlayerDeath("Düşürüldün!");
    }
}

// Singleplayer respawn flow
export function triggerSingleplayerDeath(cause) {
    if (state.gameOverShown) return;
    state.gameOverShown = true;
    state.sessionDeaths++;
    createExplosion(state.player.mesh.position.clone(), 0xff0000, 100);
    state.scene.remove(state.player.mesh);
    const savedType = state.player.aircraftType;
    setPlayer(null);
    stopEngineSound();

    showRespawnCountdown(3, () => {
        state.gameOverShown = false;
        missileReloadTimer = 0;
        createPlayer(savedType);
        // Reset missile ammo
        if (savedType.modelType === 'attack') {
            state.missileAmmo = savedType.missileAmmo || 6;
            updateAmmoDisplay();
        }
    });
}

export function gameOver(msg) {
    if (state.gameOverShown) return;
    state.gameOverShown = true;
    state.sessionDeaths++;
    if (state.player) {
        createExplosion(state.player.mesh.position.clone(), 0xff0000, 100);
        state.scene.remove(state.player.mesh);
    }
    setPlayer(null);
    stopEngineSound();
    setTimeout(() => showGameOver(msg), 400);
}

// Called from HTML button
window.respawnFromGameOver = function () {
    window.location.reload();
};


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

