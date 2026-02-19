import * as THREE from 'three';

// Global Game State
export const state = {
    scene: null,
    camera: null,
    renderer: null,
    player: null,

    // Arrays
    bullets: [],
    enemies: [],
    particles: [],
    treeColliders: [],
    antiAirs: [],
    remotePlayers: new Map(), // id -> { mesh, data, targetPos, targetQuat }

    // Game Status
    gameStarted: false,
    isMultiplayer: false,
    lastTime: 0,
    lastSyncTime: 0,
    score: 0,
    killStreak: 0,
    lastKillTime: 0,
    lastJoinData: null,

    // Multiplayer info
    socket: null,
    myPlayerId: null,
    playerName: 'Pilot',
    roomId: 'dogfight',

    // Assets/Env
    terrain: null,
    audioCtx: null,

    // Input state
    keys: {},
    mouseDown: false,

    // Weapons
    missileAmmo: 0,
    maxMissileAmmo: 4,
    attackWeaponMode: 1,
    bomberWeaponMode: 1,
    bomberCameraMode: 'normal'
};

// Setters for top-level objects
export function setScene(s) { state.scene = s; }
export function setCamera(c) { state.camera = c; }
export function setRenderer(r) { state.renderer = r; }
export function setPlayer(p) { state.player = p; }
export function setSocket(s) { state.socket = s; }
export function setGameStarted(v) { state.gameStarted = v; }
