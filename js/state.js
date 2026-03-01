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
    gameOverShown: false,
    lastTime: 0,
    lastSyncTime: 0,
    score: 0,
    killStreak: 0,
    lastKillTime: 0,
    lastJoinData: null,
    powerups: [],
    activePowerup: null, // { type, timer }

    // Multiplayer info
    socket: null,
    myPlayerId: null,
    playerName: 'Pilot',
    roomId: 'dogfight',
    team: null, // 'blue' | 'red'

    // Assets/Env
    terrain: null,
    audioCtx: null,
    waterMesh: null,
    waterTime: 0,

    // Post-processing
    composer: null,

    // Sky / Day-Night
    skyUniforms: null,
    sunLight: null,
    hemiLight: null,
    dayTime: 10.0,       // 0-24 game hours
    daySpeed: 0.4,       // game hours per real second (~60s full cycle)
    clouds: [],

    // Afterburner
    afterburnerActive: false,
    afterburnerFuel: 1.0,
    afterburnerCooldown: 0,

    // Flares
    flareAmmo: 3,
    flareCooldown: 0,
    activeFlares: [],

    // Damage model
    damageSmokes: [],

    // Lock-on
    lockOnTarget: null,
    lockOnProgress: 0,

    // Session stats
    sessionKills: 0,
    sessionDeaths: 0,
    sessionStartTime: 0,

    // Settings
    settings: {
        volume: 0.5,
        mouseSensitivity: 1.0,
        bloom: true,
        quality: 'high',
        daySpeed: 0.4
    },

    // UI overlay flags
    showStats: false,
    showMap: false,
    showSettings: false,

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
export function setTeam(t) { state.team = t; }
