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

export const AIRCRAFT_TYPES = {
    fighter: {
        name: 'Avcı (Fighter)',
        speed: 80,
        health: 6,
        maxHealth: 6,
        fireCooldown: 0.08,
        damage: 1,
        mainColor: 0x38bdf8,
        wingColor: 0x0284c7,
        modelType: 'fighter'
    },
    attack: {
        name: 'Taaruz (Attack)',
        speed: 65,
        health: 6,
        maxHealth: 6,
        fireCooldown: 0.6,
        damage: 2,
        missileAmmo: 4,
        mainColor: 0x22c55e,
        wingColor: 0x15803d,
        modelType: 'attack'
    },
    bomber: {
        name: 'Bombardıman (Bomber)',
        speed: 45,
        health: 10,
        maxHealth: 10,
        fireCooldown: 0.8,
        damage: 3,
        mainColor: 0x94a3b8,
        wingColor: 0x991b1b,
        modelType: 'bomber'
    }
};
