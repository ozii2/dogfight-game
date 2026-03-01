export const TEAMS = {
    blue: { name: 'Mavi Takım', color: 0x3b82f6, cssColor: '#3b82f6', label: '🔵' },
    red:  { name: 'Kırmızı Takım', color: 0xef4444, cssColor: '#ef4444', label: '🔴' }
};

export const SYNC_RATE = 100; // ms between updates (10 Hz) for better stability
export const KILL_STREAK_TIMEOUT = 3000;

export const STREAK_NAMES = {
    2: 'DOUBLE KILL!',
    3: 'TRIPLE KILL!',
    4: 'MULTI KILL!',
    5: 'MEGA KILL!',
    6: 'UNSTOPPABLE!',
    7: 'GODLIKE!'
};

export const MAP_BOUNDARY = 2000;   // hard wall
export const MAP_WARNING = 1700;    // warn player

export const AIRCRAFT_TYPES = {
    fighter: {
        name: 'Avcı (Fighter)',
        speed: 78,
        health: 5,
        maxHealth: 5,
        fireCooldown: 0.10,     // slightly slower (was 0.08)
        damage: 1,
        hitRadius: 8,           // smaller hitbox
        mainColor: 0x38bdf8,
        wingColor: 0x0284c7,
        modelType: 'fighter'
    },
    attack: {
        name: 'Taaruz (Attack)',
        speed: 68,
        health: 7,
        maxHealth: 7,
        fireCooldown: 0.55,
        damage: 3,              // missile damage up (was 2)
        missileAmmo: 6,         // more missiles (was 4)
        missileReloadTime: 18,  // seconds to reload 1 missile
        hitRadius: 10,
        mainColor: 0x22c55e,
        wingColor: 0x15803d,
        modelType: 'attack'
    },
    bomber: {
        name: 'Bombardıman (Bomber)',
        speed: 52,              // faster (was 45)
        health: 14,             // tankier (was 10)
        maxHealth: 14,
        fireCooldown: 0.7,
        damage: 5,              // bigger bomb damage (was 3)
        hitRadius: 14,
        mainColor: 0x94a3b8,
        wingColor: 0x991b1b,
        modelType: 'bomber'
    }
};
