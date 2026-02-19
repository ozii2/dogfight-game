const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// =====================
// GAME STATE
// =====================
const rooms = new Map(); // roomId -> { players, bullets, antiAirs, gameState }

function createRoom(roomId) {
    const room = {
        id: roomId,
        players: new Map(),
        bullets: [],
        antiAirs: [],
        bulletIdCounter: 0,
        createdAt: Date.now()
    };

    // Spawn AA units for this room
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const dist = 150 + Math.random() * 800;
        room.antiAirs.push({
            id: i,
            x: Math.sin(angle) * dist,
            z: Math.cos(angle) * dist,
            health: 3,
            alive: true
        });
    }

    rooms.set(roomId, room);
    return room;
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

// =====================
// SOCKET.IO EVENTS
// =====================
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    let currentRoom = null;
    let playerData = null;

    // --- LOBBY ---
    socket.on('getRooms', (callback) => {
        const roomList = [];
        rooms.forEach((room, id) => {
            roomList.push({
                id: id,
                playerCount: room.players.size,
                maxPlayers: 8
            });
        });
        callback(roomList);
    });

    socket.on('createRoom', (data, callback) => {
        const roomId = data.roomId || 'room_' + Math.random().toString(36).substr(2, 6);

        if (rooms.has(roomId)) {
            callback({ success: false, error: 'Room already exists' });
            return;
        }

        const room = createRoom(roomId);
        callback({ success: true, roomId: roomId });
        console.log(`Room created: ${roomId}`);
    });

    socket.on('joinRoom', (data, callback) => {
        const { roomId, playerName, aircraftType } = data;

        let room = getRoom(roomId);
        if (!room) {
            room = createRoom(roomId);
        }

        if (room.players.size >= 8) {
            callback({ success: false, error: 'Room is full' });
            return;
        }

        // Leave previous room if any
        if (currentRoom) {
            leaveRoom(socket);
        }

        // Assign team colors
        const teamColors = [
            { main: 0x3b82f6, wing: 0x1d4ed8 }, // Blue
            { main: 0xef4444, wing: 0xb91c1c }, // Red
            { main: 0x22c55e, wing: 0x15803d }, // Green
            { main: 0xf59e0b, wing: 0xd97706 }, // Yellow
            { main: 0x8b5cf6, wing: 0x6d28d9 }, // Purple
            { main: 0xec4899, wing: 0xbe185d }, // Pink
            { main: 0x06b6d4, wing: 0x0891b2 }, // Cyan
            { main: 0xf97316, wing: 0xea580c }, // Orange
        ];
        const colorIdx = room.players.size % teamColors.length;

        playerData = {
            id: socket.id,
            name: playerName || 'Pilot_' + socket.id.substr(0, 4),
            aircraftType: aircraftType || 'fighter',
            color: teamColors[colorIdx],
            position: { x: 0, y: 150, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            health: 5,
            maxHealth: 5,
            score: 0,
            alive: true,
            speed: 0,
            lastUpdate: Date.now()
        };

        // Set HP based on aircraft type
        if (aircraftType === 'attack') {
            playerData.health = 6;
            playerData.maxHealth = 6;
        } else if (aircraftType === 'bomber') {
            playerData.health = 10;
            playerData.maxHealth = 10;
        }

        // Spawn position - spread players apart
        const spawnAngle = colorIdx * (Math.PI * 2 / 8);
        playerData.position.x = Math.sin(spawnAngle) * 200;
        playerData.position.z = Math.cos(spawnAngle) * 200;

        room.players.set(socket.id, playerData);
        currentRoom = room;
        socket.join(roomId);

        // Send current state to joining player
        const existingPlayers = {};
        room.players.forEach((p, id) => {
            if (id !== socket.id) {
                existingPlayers[id] = p;
            }
        });

        callback({
            success: true,
            playerId: socket.id,
            playerData: playerData,
            existingPlayers: existingPlayers,
            antiAirs: room.antiAirs
        });

        // Notify others
        socket.to(roomId).emit('playerJoined', {
            id: socket.id,
            data: playerData
        });

        console.log(`${playerData.name} joined room ${roomId} (${room.players.size} players)`);
    });

    // --- GAME UPDATES ---
    socket.on('playerUpdate', (data) => {
        if (!currentRoom || !playerData) return;

        playerData.position = data.position;
        playerData.rotation = data.rotation;
        playerData.speed = data.speed || 0;
        playerData.lastUpdate = Date.now();


        // Broadcast to others in room
        socket.to(currentRoom.id).emit('playerMoved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation,
            speed: data.speed || 0
        });
    });

    // --- SHOOTING ---
    socket.on('shoot', (data) => {
        if (!currentRoom || !playerData || !playerData.alive) return;

        const bulletId = currentRoom.bulletIdCounter++;
        const bullet = {
            id: bulletId,
            ownerId: socket.id,
            position: { ...data.position },
            velocity: { ...data.velocity },
            type: data.bulletType || 'bullet', // bullet, missile, bomb, cannon
            life: data.life || 2.0,
            damage: data.damage || 1,
            isBomb: data.isBomb || false,
            isHoming: data.isHoming || false,
            createdAt: Date.now()
        };

        currentRoom.bullets.push(bullet);

        // Broadcast to all in room (including sender for confirmation)
        io.to(currentRoom.id).emit('bulletSpawned', bullet);
    });

    // --- HIT DETECTION (server authoritative) ---
    socket.on('hitPlayer', (data) => {
        if (!currentRoom) return;

        const { targetId, damage, bulletId } = data;
        const target = currentRoom.players.get(targetId);

        if (!target || !target.alive) return;

        target.health -= (damage || 1);

        if (target.health <= 0) {
            target.alive = false;
            target.health = 0;

            // Award score to shooter
            if (playerData) {
                playerData.score += 100;
                io.to(currentRoom.id).emit('scoreUpdate', {
                    id: socket.id,
                    score: playerData.score
                });
            }

            // Notify all about kill
            io.to(currentRoom.id).emit('playerKilled', {
                killerId: socket.id,
                killerName: playerData ? playerData.name : 'Unknown',
                victimId: targetId,
                victimName: target.name
            });

            // Respawn after 3 seconds
            setTimeout(() => {
                if (currentRoom && currentRoom.players.has(targetId)) {
                    const t = currentRoom.players.get(targetId);
                    t.alive = true;
                    t.health = t.maxHealth;
                    const angle = Math.random() * Math.PI * 2;
                    t.position = {
                        x: Math.sin(angle) * 300,
                        y: 150,
                        z: Math.cos(angle) * 300
                    };
                    io.to(currentRoom.id).emit('playerRespawned', {
                        id: targetId,
                        data: t
                    });
                }
            }, 3000);
        }

        // Notify target about damage
        io.to(currentRoom.id).emit('playerDamaged', {
            id: targetId,
            health: target.health,
            maxHealth: target.maxHealth,
            attackerId: socket.id
        });
    });

    // --- AA UNIT DESTROYED ---
    socket.on('aaDestroyed', (data) => {
        if (!currentRoom) return;

        const aa = currentRoom.antiAirs.find(a => a.id === data.aaId);
        if (aa && aa.alive) {
            aa.health -= (data.damage || 1);
            if (aa.health <= 0) {
                aa.alive = false;

                if (playerData) {
                    playerData.score += 50;
                }

                io.to(currentRoom.id).emit('aaUnitDestroyed', {
                    aaId: data.aaId,
                    destroyerId: socket.id
                });
            }
        }
    });

    // --- CHAT ---
    socket.on('chatMessage', (msg) => {
        if (!currentRoom || !playerData) return;
        io.to(currentRoom.id).emit('chatMessage', {
            name: playerData.name,
            message: msg,
            timestamp: Date.now()
        });
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
        leaveRoom(socket);
        console.log(`Player disconnected: ${socket.id}`);
    });

    function leaveRoom(sock) {
        if (!currentRoom) return;

        currentRoom.players.delete(sock.id);
        sock.to(currentRoom.id).emit('playerLeft', { id: sock.id });

        // Clean up empty rooms
        if (currentRoom.players.size === 0) {
            rooms.delete(currentRoom.id);
            console.log(`Room ${currentRoom.id} deleted (empty)`);
        }

        sock.leave(currentRoom.id);
        currentRoom = null;
        playerData = null;
    }
});

// =====================
// SERVER TICK (remove old bullets)
// =====================
setInterval(() => {
    rooms.forEach((room) => {
        const now = Date.now();
        room.bullets = room.bullets.filter(b => (now - b.createdAt) < (b.life * 1000));

        // Check for disconnected players (timeout 60s)
        room.players.forEach((p, id) => {
            if (now - p.lastUpdate > 60000) {
                room.players.delete(id);
                io.to(room.id).emit('playerLeft', { id: id });
            }
        });
    });
}, 1000);

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════╗
║   DOGFIGHT 3D MULTIPLAYER SERVER     ║
╠══════════════════════════════════════╣
║   Port: ${PORT}                          ║
║   Players can connect via browser    ║
╚══════════════════════════════════════╝
    `);
});
