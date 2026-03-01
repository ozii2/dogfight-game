import { state } from './state.js';
import { updateWeaponUI, openSettings, closeSettings, toggleStats, toggleFullMap } from './ui.js';
import { initAudio } from './audio.js';
import { launchFlare } from './entities.js';

export function initInput(shootCallback, cameraCallback) {
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

        // Flare
        if (e.code === 'KeyF') launchFlare();

        // Settings (ESC)
        if (e.code === 'Escape') {
            if (state.showSettings) closeSettings(); else openSettings();
            e.preventDefault();
        }

        // Stats overlay (Tab)
        if (e.code === 'Tab') {
            toggleStats();
            e.preventDefault();
        }

        // Fullscreen tactical map (M)
        if (e.code === 'KeyM') toggleFullMap();

        const player = state.player;
        if (!player || !player.aircraftType) return;

        // Weapon switching for Attack aircraft
        if (player.aircraftType.modelType === 'attack') {
            if (e.code === 'Digit1') { state.attackWeaponMode = 1; updateWeaponUI('attack', 1); }
            if (e.code === 'Digit2') { state.attackWeaponMode = 2; updateWeaponUI('attack', 2); }
        }

        // Weapon switching for Bomber aircraft
        if (player.aircraftType.modelType === 'bomber') {
            if (e.code === 'Digit1') { state.bomberWeaponMode = 1; updateWeaponUI('bomber', 1); }
            if (e.code === 'Digit2') { state.bomberWeaponMode = 2; updateWeaponUI('bomber', 2); }
        }
    });
}
