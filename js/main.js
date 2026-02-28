import * as THREE from 'three';
import { state, setGameStarted, setPlayer, setTeam } from './state.js';
import { initGraphics, onWindowResize, addShake } from './graphics.js';
import { initInput } from './input.js';
import { initAudio } from './audio.js';
import { initNetwork } from './network.js';
import { updateFPS, updateHealthBar, updateWeaponUI, updateAmmoDisplay, updateCrosshair, updateRadar } from './ui.js';
import { createPlayer, createEnemy, spawnAntiAirs, updatePlayer, updateEnemies, updateAntiAirs, updateBullets, updateParticles, updateDebris, updateRemotePlayers, tryPlayerShoot, createRemotePlayer, spawnPowerup, updatePowerups } from './entities.js';
import { AIRCRAFT_TYPES, TEAMS } from './constants.js';
import { createBombSight, preloadModels } from './models.js';
import { getTerrainHeight } from './utils.js';

// Global access for HTML buttons
window.confirmTeam = function () {
    const teamData = TEAMS[state.team] || TEAMS.blue;
    document.getElementById('team-select').style.display = 'none';
    document.getElementById('aircraft-select').style.display = 'flex';

    // Theme the aircraft select header with team color
    const label = document.getElementById('aircraft-team-label');
    if (label) {
        label.textContent = `${teamData.label} ${teamData.name.toUpperCase()}`;
        label.style.color = teamData.cssColor;
    }
};

window.chooseTeam = function (teamKey) {
    setTeam(teamKey);
    const teamData = TEAMS[teamKey] || TEAMS.blue;
    document.getElementById('team-select').style.display = 'none';
    document.getElementById('aircraft-select').style.display = 'flex';

    // Theme the aircraft select header with team color
    const label = document.getElementById('aircraft-team-label');
    if (label) {
        label.textContent = `${teamData.label} ${teamData.name.toUpperCase()}`;
        label.style.color = teamData.cssColor;
    }
};

window.selectAircraft = function (type) {
    console.log('selectAircraft called with:', type);
    const selectedType = AIRCRAFT_TYPES[type];
    if (!selectedType) {
        console.error('Invalid aircraft type:', type);
        return;
    }

    document.getElementById('aircraft-select').style.display = 'none';
    document.getElementById('hud').style.display = 'block';

    // Only show instructions if element exists
    const inst = document.getElementById('instructions');
    if (inst) inst.style.display = 'block';

    setGameStarted(true);
    console.log('Game Started set to true');

    try {
        createPlayer(selectedType);
        console.log('Player created');
    } catch (e) {
        console.error('Error creating player:', e);
        alert('Player creation failed: ' + e.message);
    }

    if (state.isMultiplayer && state.socket) {
        // ... (socket emit logic stays same)
        const joinData = {
            roomId: document.getElementById('roomNameInput').value || 'dogfight',
            playerName: state.playerName,
            aircraftType: type,
            team: state.team || 'blue',
            color: { main: selectedType.mainColor, wing: selectedType.wingColor }
        };
        state.lastJoinData = joinData;

        state.socket.emit('joinRoom', joinData, (response) => {
            if (response.success) {
                console.log('Joined room successfully');
                // Confirm server-assigned team (may differ from client preference)
                if (response.assignedTeam) {
                    setTeam(response.assignedTeam);
                }
                // Initialize existing players
                if (response.existingPlayers) {
                    Object.entries(response.existingPlayers).forEach(([id, data]) => {
                        createRemotePlayer(id, data);
                    });
                }
                // Initialize AA units
                if (response.antiAirs) {
                    // Clear any local AA first just in case
                    state.antiAirs.forEach(aa => state.scene.remove(aa.mesh));
                    state.antiAirs.length = 0;
                    spawnAntiAirs(response.antiAirs);
                } else {
                    // Server didn't provide AA, spawn locally
                    spawnAntiAirs();
                }
                // Spawn local bot enemies for fun
                for (let i = 0; i < 3; i++) createEnemy();
                // Respawn bots every 30 seconds (max 10)
                setInterval(() => {
                    if (state.enemies.length < 10) {
                        for (let i = 0; i < 3; i++) createEnemy();
                    }
                }, 30000);
                // Spawn power-ups
                for (let i = 0; i < 5; i++) spawnPowerup();
                setInterval(() => {
                    if (state.powerups.length < 8) spawnPowerup();
                }, 15000);
            } else {
                console.error('Join failed:', response.error);
                alert('Odaya katılamadı: ' + response.error);
                location.reload();
            }
        });
    } else {
        // Singleplayer setup
        spawnAntiAirs(); // Local generation
        for (let i = 0; i < 5; i++) createEnemy();
    }
};

window.restartGame = function () {
    location.reload();
};

// Start
window.addEventListener('DOMContentLoaded', async () => {
    console.log('Game Initializing...');
    try {
        await init();
        console.log('Game Initialized.');
    } catch (e) {
        console.error('Init Failed:', e);
        alert('Oyun başlatılamadı: ' + e.message);
    }
});

async function init() {
    console.log('Preloading 3D Models...');
    await preloadModels();

    console.log('Initializing Graphics...');
    initGraphics();

    console.log('Initializing Input...');
    console.log('Initializing Input...');
    initInput(tryPlayerShoot, () => {
        if (state.player && state.player.aircraftType && state.player.aircraftType.modelType === 'bomber') {
            state.bomberCameraMode = state.bomberCameraMode === 'normal' ? 'bombing' : 'normal';
        }
    });

    console.log('Initializing Network...');
    initNetwork();

    state.bombSight = createBombSight();
    state.scene.add(state.bombSight);
    state.bombSight.visible = false;

    // Start Loop
    requestAnimationFrame(animate);
}

function animate(time) {
    requestAnimationFrame(animate);

    try {
        // FPS Update
        updateFPS(time); // Ensure ui.js has this export and it works

        const dt = (time - state.lastTime) / 1000;
        state.lastTime = time;

        if (!state.gameStarted || !state.player) {
            if (state.renderer && state.scene && state.camera) {
                state.renderer.render(state.scene, state.camera);
            }
            return;
        }

        // Update Entities
        updatePlayer(dt);
        updateBullets(dt);
        updateEnemies(dt);
        updateRemotePlayers(dt);
        updateParticles(dt);
        updateDebris(dt);
        updateAntiAirs(dt);
        updatePowerups(dt);

        // Camera Follow
        if (state.player && state.camera) {
            const relativeOffset = new THREE.Vector3(0, 15, -40);

            if (state.player.aircraftType &&
                state.player.aircraftType.modelType === 'bomber' &&
                state.bomberCameraMode === 'bombing') {
                relativeOffset.set(0, 60, 5); // From above (Top-Down)
            }

            state.player.mesh.updateMatrixWorld();
            const cameraOffset = relativeOffset.applyMatrix4(state.player.mesh.matrixWorld);
            state.camera.position.lerp(cameraOffset, 0.1);
            state.camera.lookAt(state.player.mesh.position);
        }

        // Camera Shake Decay
        if (state.cameraShake > 0) {
            state.camera.position.x += (Math.random() - 0.5) * state.cameraShake;
            state.camera.position.y += (Math.random() - 0.5) * state.cameraShake;
            state.camera.position.z += (Math.random() - 0.5) * state.cameraShake;
            state.cameraShake -= dt * 5;
            if (state.cameraShake < 0) state.cameraShake = 0;
        }

        // Bomb Sight Update
        if (state.bombSight) {
            let showSight = false;
            if (state.player && state.player.aircraftType &&
                state.player.aircraftType.modelType === 'bomber' &&
                state.bomberCameraMode === 'bombing') {

                // Calculate Impact
                const p = state.player.mesh.position;
                const alt = p.y - getTerrainHeight(p.x, p.z); // Altitude above ground

                if (alt > 0) {
                    // 0.5*g*t^2 - v0y*t - h = 0
                    // g=120, v0y=-10
                    const delta = 100 + 4 * 60 * alt;
                    const t = (-10 + Math.sqrt(delta)) / 120;

                    // Horizontal Travel
                    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(state.player.mesh.quaternion);
                    const speed = (state.player.aircraftType.speed || 45) * 0.8;
                    const dist = speed * t;

                    const impactPos = p.clone().addScaledVector(fwd, dist);
                    impactPos.y = getTerrainHeight(impactPos.x, impactPos.z) + 1.0;

                    state.bombSight.position.copy(impactPos);
                    state.bombSight.rotation.set(-Math.PI / 2, 0, 0); // Flat on XZ

                    state.bombSight.visible = true;
                    showSight = true;

                    // Pulse
                    const s = 1 + Math.sin(Date.now() * 0.005) * 0.2;
                    state.bombSight.scale.set(s, s, s);
                }
            }
            if (!showSight) state.bombSight.visible = false;
        }

        // Radar
        updateRadar();

        // Crosshair
        updateCrosshair();

        state.renderer.render(state.scene, state.camera);
    } catch (e) {
        console.error('Game Loop Error:', e);
        // Throwing here would stop 'requestAnimationFrame', which might be good to avoid log spam, 
        // unlike just logging. But let's just log every 1 second to avoid spam.
        if (!window.lastErrorTime || Date.now() - window.lastErrorTime > 1000) {
            window.lastErrorTime = Date.now();
            // alert('Game Error: ' + e.message);
        }
    }
}




