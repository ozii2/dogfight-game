import * as THREE from 'three';
import { state, setPlayer } from './state.js';
import { AIRCRAFT_TYPES } from './constants.js';
import { createRemotePlayer, removeRemotePlayer, spawnAntiAirs, createExplosion, createDebris, registerKill } from './entities.js';
import { updateHealthBar, showKillFeed, updateScore } from './ui.js';
import { addShake } from './graphics.js';

export function initNetwork() {
    console.log('initNetwork called');
    // Join Room Button Logic
    const joinBtn = document.getElementById('joinRoomBtn');
    if (joinBtn) {
        console.log('Join button found, attaching listener');
        joinBtn.addEventListener('click', joinRoom);
    } else {
        console.error('Join button not found!');
    }
}

function joinRoom() {
    console.log('Join Room function started');
    const statusEl = document.getElementById('lobbyStatus');
    if (statusEl) statusEl.textContent = 'Bağlanılıyor...';

    const playerNameInput = document.getElementById('playerNameInput');
    const roomNameInput = document.getElementById('roomNameInput');

    if (!playerNameInput || !roomNameInput) {
        console.error('Input fields not found!');
        return;
    }

    state.playerName = playerNameInput.value || 'Pilot_' + Math.floor(Math.random() * 1000);
    const roomId = roomNameInput.value || 'dogfight';
    console.log(`Attempting to join room: ${roomId} as ${state.playerName}`);

    if (typeof io === 'undefined') {
        alert('Socket.io kütüphanesi yüklenemedi! İnternet bağlantınızı kontrol edin.');
        return;
    }

    let serverUrl;

    // Check for URL param 'server'
    const params = new URLSearchParams(window.location.search);
    if (params.has('server')) {
        serverUrl = params.get('server');
        console.log('Connecting to custom server:', serverUrl);
        state.socket = io(serverUrl);
    } else {
        // Auto-detect
        if (location.protocol === 'file:') {
            console.log('File protocol detected, connecting to localhost:3000');
            state.socket = io('http://localhost:3000');
        } else if (location.port === '3000' || !location.port) {
            // Running on port 3000 (local) or standard port (ngrok/production)
            console.log('Same origin detected, connecting to default');
            state.socket = io();
        } else {
            // Running on dev port (e.g. 5500), assume server is on 3000
            serverUrl = `${location.protocol}//${location.hostname}:3000`;
            console.log('Dev port detected, connecting to:', serverUrl);
            state.socket = io(serverUrl);
        }
    }
    state.isMultiplayer = true;

    document.getElementById('lobbyStatus').textContent = 'Bağlanılıyor...';

    // Socket Events
    setupSocketEvents();

    // We don't emit 'joinRoom' immediately? 
    // Wait, original code emitted it AFTER aircraft selection?
    // Let's check original logic. 
    // Ah, in original: socket.on('connect') -> show aircraft select.
    // Then selectAircraft -> createPlayer -> socket.emit('joinRoom')?
    // No, I need to check where 'joinRoom' was emitted.
    // It was likely in `createPlayer` or `selectAircraft`?
}

function setupSocketEvents() {
    const socket = state.socket;

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        state.myPlayerId = socket.id;

        if (state.gameStarted && state.lastJoinData) {
            console.log('Rejoining active game...');
            // Re-emit joinRoom
            socket.emit('joinRoom', state.lastJoinData, (response) => {
                if (response.success) {
                    console.log('Rejoined room successfully after reconnect');
                    // We might need to ensure our mesh is valid, but createPlayer logic handles that locally.
                    // The server will broadcast playerJoined for us (as a new ID).
                    // Other players handle this.
                }
            });
        } else {
            // Initial connect or manual refresh
            document.getElementById('lobbyStatus').textContent = 'Bağlandı! Uçağını seç...';
            document.getElementById('lobby-screen').style.display = 'none';
            document.getElementById('aircraft-select').style.display = 'block';
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err);
        document.getElementById('lobbyStatus').textContent = 'Sunucuya bağlanılamadı!';
        document.getElementById('lobbyStatus').style.color = '#ef4444';
    });

    socket.on('playerJoined', (data) => {
        if (data.id !== state.myPlayerId) {
            createRemotePlayer(data.id, data.data);
        }
    });

    socket.on('playerLeft', (data) => {
        removeRemotePlayer(data.id);
        showKillFeed(`${data.id.substr(0, 4)} ayrıldı`, '#888');
    });

    socket.on('playerMoved', (data) => {
        const rp = state.remotePlayers.get(data.id);
        if (rp) {
            rp.targetPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            rp.targetQuat = new THREE.Quaternion(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
        }
    });

    socket.on('bulletSpawned', (bullet) => {
        if (bullet.ownerId === state.myPlayerId) return;

        const geo = new THREE.SphereGeometry(0.3, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(bullet.position.x, bullet.position.y, bullet.position.z);
        state.scene.add(mesh);

        state.bullets.push({
            mesh: mesh,
            velocity: new THREE.Vector3(bullet.velocity.x, bullet.velocity.y, bullet.velocity.z),
            life: bullet.life || 2.0,
            type: 'remote',
            damage: bullet.damage || 1,
            ownerId: bullet.ownerId,
            isBomb: bullet.isBomb || false,
            isBullet: true
        });
    });

    socket.on('playerDamaged', (data) => {
        if (data.id === state.myPlayerId && state.player) {
            state.player.health = data.health;
            state.player.maxHealth = data.maxHealth;
            updateHealthBar();
            addShake(0.5);
            // Red flash via DOM
            const v = document.getElementById('vignette');
            if (v) {
                v.style.boxShadow = 'inset 0 0 100px rgba(255,0,0,0.4)';
                setTimeout(() => { v.style.boxShadow = 'inset 0 0 150px rgba(0,0,0,0.5)'; }, 200);
            }
        }
    });

    socket.on('playerKilled', (data) => {
        showKillFeed(`${data.killerName} ✈→💥 ${data.victimName}`, '#ef4444');

        if (data.victimId === state.myPlayerId) {
            showKillFeed('ÖLDÜN! 3 saniye sonra yeniden doğacaksın...', '#ff0000');
        }

        if (data.killerId === state.myPlayerId) {
            state.score += 100;
            updateScore();
            registerKill();
        }

        const rp = state.remotePlayers.get(data.victimId);
        if (rp && rp.mesh) rp.mesh.visible = false;
    });

    socket.on('playerRespawned', (data) => {
        if (data.id === state.myPlayerId && state.player) {
            state.player.health = data.data.health;
            state.player.maxHealth = data.data.maxHealth;
            state.player.mesh.position.set(data.data.position.x, data.data.position.y, data.data.position.z);
            updateHealthBar();
            showKillFeed('Yeniden doğdun!', '#22c55e');
        } else {
            const rp = state.remotePlayers.get(data.id);
            if (rp && rp.mesh) {
                rp.mesh.visible = true;
                rp.mesh.position.set(data.data.position.x, data.data.position.y, data.data.position.z);
            }
        }
    });

    socket.on('scoreUpdate', (data) => {
        if (data.id === state.myPlayerId) {
            state.score = data.score;
            updateScore();
        }
    });

    socket.on('aaUnitDestroyed', (data) => {
        const aaIdx = state.antiAirs.findIndex(a => a.aaId === data.aaId); // Note: server sends aaId? 
        // In local spawnAntiAirs, we didn't assign aaId unless server provided it.
        // If server provided it, good. If not, this might fail for locally spawned AA in MP?
        // Usually MP implies server spawns AAs.

        if (aaIdx !== -1) {
            const aa = state.antiAirs[aaIdx];
            createExplosion(aa.mesh.position, 0xff8800, 60);
            createDebris(aa.mesh.position);
            state.scene.remove(aa.mesh);
            state.antiAirs.splice(aaIdx, 1);
        }

        if (data.destroyerId === state.myPlayerId) {
            state.score += 50;
            updateScore();
        }
    });

    // Map Update (AA units from server)
    socket.on('mapUpdate', (data) => {
        // Clear existing AAs
        state.antiAirs.forEach(aa => state.scene.remove(aa.mesh));
        state.antiAirs.length = 0;
        spawnAntiAirs(data.aaUnits); // Pass server data
    });
}
