import { state } from './state.js';
import { updateWeaponUI, openSettings, closeSettings, toggleStats, toggleFullMap } from './ui.js';
import { initAudio } from './audio.js';
import { launchFlare } from './entities.js';

export const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export function initInput(shootCallback, cameraCallback) {
    // Keyboard
    window.addEventListener('keydown', e => state.keys[e.code] = true);
    window.addEventListener('keyup', e => state.keys[e.code] = false);

    window.addEventListener('mousedown', () => {
        initAudio();
        state.mouseDown = true;
        shootCallback();
    });
    window.addEventListener('mouseup', () => state.mouseDown = false);

    window.addEventListener('keydown', e => {
        initAudio();
        if (e.code === 'Space') shootCallback();
        if (e.code === 'KeyC' && cameraCallback) cameraCallback();
        if (e.code === 'KeyF') launchFlare();
        if (e.code === 'Escape') {
            if (state.showSettings) closeSettings(); else openSettings();
            e.preventDefault();
        }
        if (e.code === 'Tab') { toggleStats(); e.preventDefault(); }
        if (e.code === 'KeyM') toggleFullMap();

        const player = state.player;
        if (!player || !player.aircraftType) return;
        if (player.aircraftType.modelType === 'attack') {
            if (e.code === 'Digit1') { state.attackWeaponMode = 1; updateWeaponUI('attack', 1); }
            if (e.code === 'Digit2') { state.attackWeaponMode = 2; updateWeaponUI('attack', 2); }
        }
        if (player.aircraftType.modelType === 'bomber') {
            if (e.code === 'Digit1') { state.bomberWeaponMode = 1; updateWeaponUI('bomber', 1); }
            if (e.code === 'Digit2') { state.bomberWeaponMode = 2; updateWeaponUI('bomber', 2); }
        }
    });

    // Mobile touch controls
    if (isMobile) setupMobileControls(shootCallback);
}

// ─── MOBILE CONTROLS ─────────────────────────────────────────────────────────

function setupMobileControls(shootCallback) {
    // Prevent page scroll/zoom during gameplay
    document.addEventListener('touchmove', e => {
        if (state.gameStarted) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchstart', e => {
        if (state.gameStarted) initAudio();
    }, { passive: true });

    setupJoystick();
    setupActionButtons(shootCallback);
}

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const knob = document.getElementById('joystick-knob');
    if (!zone || !knob) return;

    const BASE_R = 65;  // half of 130px base
    const KNOB_H = 26;  // half of 52px knob
    const MAX_TRAVEL = BASE_R - KNOB_H; // 39px

    let touchId = null;
    let centerX = 0, centerY = 0;

    function applyJoystick(cx, cy) {
        let dx = cx - centerX;
        let dy = cy - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_TRAVEL) {
            dx = (dx / dist) * MAX_TRAVEL;
            dy = (dy / dist) * MAX_TRAVEL;
        }
        knob.style.left = (BASE_R + dx - KNOB_H) + 'px';
        knob.style.top  = (BASE_R + dy - KNOB_H) + 'px';

        const nx = dx / MAX_TRAVEL;
        const ny = dy / MAX_TRAVEL;
        const DEAD = 0.2;
        state.keys['ArrowUp']    = ny < -DEAD;
        state.keys['ArrowDown']  = ny >  DEAD;
        state.keys['ArrowLeft']  = nx < -DEAD;
        state.keys['ArrowRight'] = nx >  DEAD;
    }

    function resetJoystick() {
        knob.style.left = (BASE_R - KNOB_H) + 'px';
        knob.style.top  = (BASE_R - KNOB_H) + 'px';
        state.keys['ArrowUp'] = state.keys['ArrowDown'] = false;
        state.keys['ArrowLeft'] = state.keys['ArrowRight'] = false;
    }

    zone.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        touchId = t.identifier;
        const rect = zone.getBoundingClientRect();
        centerX = rect.left + BASE_R;
        centerY = rect.top + BASE_R;
        applyJoystick(t.clientX, t.clientY);
    }, { passive: false });

    zone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === touchId) applyJoystick(t.clientX, t.clientY);
        }
    }, { passive: false });

    zone.addEventListener('touchend', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
            if (t.identifier === touchId) { touchId = null; resetJoystick(); }
        }
    }, { passive: false });

    zone.addEventListener('touchcancel', e => {
        touchId = null; resetJoystick();
    }, { passive: false });
}

function setupActionButtons(shootCallback) {
    // Fire button
    const fireBtn = document.getElementById('btn-fire');
    if (fireBtn) {
        fireBtn.addEventListener('touchstart', e => {
            e.preventDefault(); initAudio();
            state.mouseDown = true; shootCallback();
            fireBtn.style.background = 'rgba(220,38,38,1)';
            fireBtn.style.boxShadow = '0 0 30px rgba(255,50,50,0.7)';
        }, { passive: false });
        fireBtn.addEventListener('touchend', e => {
            e.preventDefault(); state.mouseDown = false;
            fireBtn.style.background = 'rgba(220,38,38,0.75)';
            fireBtn.style.boxShadow = '0 0 20px rgba(220,38,38,0.4)';
        }, { passive: false });
        fireBtn.addEventListener('touchcancel', e => {
            state.mouseDown = false;
        }, { passive: false });
    }

    // Key-mapped buttons
    keyBtn('btn-speedup',   'KeyW');
    keyBtn('btn-speeddown', 'KeyS');
    keyBtn('btn-boost',     'ShiftLeft');
    keyBtn('btn-yaw-left',  'KeyA');
    keyBtn('btn-yaw-right', 'KeyD');

    // Flare button (one-shot)
    const flareBtn = document.getElementById('btn-flare');
    if (flareBtn) {
        flareBtn.addEventListener('touchstart', e => {
            e.preventDefault(); launchFlare();
            flareBtn.style.opacity = '0.6';
        }, { passive: false });
        flareBtn.addEventListener('touchend', e => {
            e.preventDefault(); flareBtn.style.opacity = '1';
        }, { passive: false });
    }

    // Weapon switch buttons
    weaponBtn('btn-weapon1', 1);
    weaponBtn('btn-weapon2', 2);

    // Camera button
    const camBtn = document.getElementById('btn-camera');
    if (camBtn) {
        camBtn.addEventListener('touchstart', e => {
            e.preventDefault();
            // dispatch a KeyC keydown event so main.js camera toggle works
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', bubbles: true }));
        }, { passive: false });
        camBtn.addEventListener('touchend', e => e.preventDefault(), { passive: false });
    }
}

function keyBtn(id, keyCode) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', e => {
        e.preventDefault(); state.keys[keyCode] = true;
        btn.style.opacity = '0.6';
    }, { passive: false });
    btn.addEventListener('touchend', e => {
        e.preventDefault(); state.keys[keyCode] = false;
        btn.style.opacity = '1';
    }, { passive: false });
    btn.addEventListener('touchcancel', e => {
        state.keys[keyCode] = false; btn.style.opacity = '1';
    }, { passive: false });
}

function weaponBtn(id, num) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
        const player = state.player;
        if (!player || !player.aircraftType) return;
        if (player.aircraftType.modelType === 'attack') {
            state.attackWeaponMode = num; updateWeaponUI('attack', num);
        } else if (player.aircraftType.modelType === 'bomber') {
            state.bomberWeaponMode = num; updateWeaponUI('bomber', num);
        }
    }, { passive: false });
    btn.addEventListener('touchend', e => e.preventDefault(), { passive: false });
}
