import * as THREE from 'three';
import { state } from './state.js';

// FPS Counter
let fpsDiv;
let frameCount = 0;
let lastFpsTime = 0;

export function initUI() {
    fpsDiv = document.createElement('div');
    fpsDiv.style.position = 'absolute';
    fpsDiv.style.top = '10px';
    fpsDiv.style.left = '10px';
    fpsDiv.style.color = '#00ff00';
    fpsDiv.style.fontFamily = 'monospace';
    fpsDiv.style.fontSize = '14px';
    fpsDiv.style.fontWeight = 'bold';
    fpsDiv.style.zIndex = '1000';
    fpsDiv.style.textShadow = '1px 1px 2px black';
    document.body.appendChild(fpsDiv);
}

export function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        if (fpsDiv) fpsDiv.innerText = `FPS: ${frameCount}`;
        frameCount = 0;
        lastFpsTime = now;
    }
}

export function updateHealthBar() {
    if (!state.player) return;
    const hpPercent = (state.player.health / state.player.maxHealth) * 100;
    const healthBar = document.getElementById('health-bar');
    if (healthBar) {
        healthBar.style.width = hpPercent + '%';
        if (hpPercent > 50) {
            healthBar.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
        } else if (hpPercent > 20) {
            healthBar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        } else {
            healthBar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
        }
    }
}

export function updateWeaponUI(type, mode) {
    const label = document.getElementById('weapon-label');
    const ammoDisplay = document.getElementById('ammo-display');

    if (type === 'attack') {
        if (mode === 1) {
            label.innerText = 'Silah: FÜZE';
            label.style.color = '#22c55e';
            ammoDisplay.style.display = 'block';
        } else {
            label.innerText = 'Silah: MERMİ';
            label.style.color = '#fbbf24';
            ammoDisplay.style.display = 'none';
        }
    } else if (type === 'bomber') {
        if (mode === 1) {
            label.innerText = 'Silah: BOMBA';
            label.style.color = '#ff6b6b';
        } else {
            label.innerText = 'Silah: MERMİ';
            label.style.color = '#22c55e'; // Green for generic gun on bomber?
        }
    }
}

export function updateAmmoDisplay() {
    document.getElementById('ammo-count').innerText = state.missileAmmo;
}

export function updateScore() {
    document.getElementById('score').innerText = state.score;
}

export function showKillFeed(msg, color = 'white') {
    const feed = document.getElementById('kill-feed');
    const item = document.createElement('div');
    item.innerText = msg;
    item.style.color = color;
    item.style.marginBottom = '5px';
    item.style.textShadow = '1px 1px 2px black';
    item.style.opacity = '0';
    item.style.transition = 'opacity 0.2s';

    feed.appendChild(item);

    // Animate in
    requestAnimationFrame(() => item.style.opacity = '1');

    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 200);
    }, 4000);
}

export function showKillStreak(text) {
    const el = document.getElementById('kill-streak');
    el.innerText = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
}

export function showDamageFlash() {
    document.body.style.backgroundColor = 'red';
    setTimeout(() => document.body.style.backgroundColor = '#87CEEB', 50);
}
export function updateCrosshair() {
    if (!state.player || !state.camera) return;

    // Get forward vector
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(state.player.mesh.quaternion);
    // Target point 500 units away
    const target = state.player.mesh.position.clone().add(fwd.multiplyScalar(500));

    // Project to 2D screen space
    const vector = target.project(state.camera);

    // Convert to CSS coordinates
    const x = (vector.x * .5 + .5) * window.innerWidth;
    const y = -(vector.y * .5 - .5) * window.innerHeight;

    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        // Only show if in front of camera
        if (vector.z < 1) {
            crosshair.style.display = 'block';
            crosshair.style.left = `${x}px`;
            crosshair.style.top = `${y}px`;
        } else {
            crosshair.style.display = 'none';
        }
    }
}

export function updateRadar() {
    if (!state.player) return;

    const canvas = document.getElementById('radar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const range = 2000; // Radar range

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Grid rings
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Player (Center)
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Player FOV lines
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - 15, cy - 40);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 15, cy - 40);
    ctx.stroke();

    const pPos = state.player.mesh.position;
    // We want the radar to rotate with the player
    // So forward is always UP
    // Player rotation around Y axis
    const euler = new THREE.Euler().setFromQuaternion(state.player.mesh.quaternion);
    const angle = euler.y; // Yaw

    function drawBlip(x, z, color, size = 3) {
        // Relative position
        const dx = x - pPos.x;
        const dz = z - pPos.z;

        // Rotate by -angle (inverse player rotation)
        const rx = dx * Math.cos(-angle) - dz * Math.sin(-angle);
        const rz = dx * Math.sin(-angle) + dz * Math.cos(-angle);

        // Scale to canvas
        // -z is forward in Three.js, so -rz should be up (-y in canvas)
        // correct mapping: rz -> y, rx -> x
        const sx = cx + (rx / range) * (width / 2);
        const sy = cy + (rz / range) * (height / 2);

        // Clamp to circle
        const dist = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
        if (dist > width / 2) return; // Out of range

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Enemies (Red)
    if (state.enemies) {
        state.enemies.forEach(e => {
            if (e.mesh) drawBlip(e.mesh.position.x, e.mesh.position.z, '#ff0000', 4);
        });
    }

    // Remote Players (green = teammate, red = enemy)
    if (state.remotePlayers) {
        state.remotePlayers.forEach(rp => {
            if (!rp.mesh) return;
            const isTeammate = rp.data && rp.data.team && state.team && rp.data.team === state.team;
            drawBlip(rp.mesh.position.x, rp.mesh.position.z, isTeammate ? '#00ff88' : '#ff0000', 4);
        });
    }


}
