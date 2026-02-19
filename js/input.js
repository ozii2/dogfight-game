import { state } from './state.js';
import { updateWeaponUI } from './ui.js';
import { initAudio } from './audio.js';

export function initInput(shootCallback, cameraCallback) {
    // Resize is handled in graphics or main, but we can emit event? 
    // Usually main handles resize listener calling graphics.onWindowResize.

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
        if (e.code === 'KeyC') {
            if (cameraCallback) cameraCallback();
        }

        const player = state.player;
        if (!player || !player.aircraftType) return;

        // Weapon switching for Attack aircraft
        if (player.aircraftType.modelType === 'attack') {
            if (e.code === 'Digit1') {
                state.attackWeaponMode = 1;
                updateWeaponUI('attack', 1);
            }
            if (e.code === 'Digit2') {
                state.attackWeaponMode = 2;
                updateWeaponUI('attack', 2);
            }
        }

        // Weapon switching for Bomber aircraft
        if (player.aircraftType.modelType === 'bomber') {
            if (e.code === 'Digit1') {
                state.bomberWeaponMode = 1;
                updateWeaponUI('bomber', 1);
            }
            if (e.code === 'Digit2') {
                state.bomberWeaponMode = 2;
                updateWeaponUI('bomber', 2);
            }
        }
    });
}
