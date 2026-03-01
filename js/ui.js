import * as THREE from 'three';
import { state } from './state.js';

// FPS Counter
let fpsDiv;
let frameCount = 0;
let lastFpsTime = 0;

export function initUI() {
    fpsDiv = document.getElementById('fps-counter');
    // Show speed/alt display once game starts (unhide from CSS)
}


export function updateFPS(time) {
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
            label.style.color = '#22c55e';
        }
    }
}

export function updateAmmoDisplay() {
    const el = document.getElementById('ammo-count');
    if (el) el.innerText = state.missileAmmo;
}

export function updateScore() {
    const el = document.getElementById('score');
    if (el) el.innerText = state.score;
}

export function showKillFeed(msg, color = 'white') {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.innerText = msg;
    item.style.color = color;
    item.style.marginBottom = '5px';
    item.style.textShadow = '1px 1px 2px black';
    item.style.opacity = '0';
    item.style.transition = 'opacity 0.2s';

    feed.appendChild(item);
    requestAnimationFrame(() => item.style.opacity = '1');

    setTimeout(() => {
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 200);
    }, 4000);
}

export function showKillStreak(text) {
    const el = document.getElementById('kill-streak');
    if (!el) return;
    el.innerText = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1500);
}

// Professional kill notification (+100 KILL!)
let killNotifyTimeout = null;
export function showKillNotification(points, label = 'KILL') {
    const el = document.getElementById('kill-notify');
    if (!el) return;
    el.innerText = `+${points} ${label}`;
    el.style.display = 'block';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(0) scale(0.6)';

    if (killNotifyTimeout) clearTimeout(killNotifyTimeout);

    requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.12s, transform 0.2s';
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(-20px) scale(1)';
    });

    killNotifyTimeout = setTimeout(() => {
        el.style.transition = 'opacity 0.4s, transform 0.4s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(-60px) scale(0.8)';
        setTimeout(() => { el.style.display = 'none'; }, 500);
    }, 1200);
}

// Damage flash - overlay vignette (not body color)
let damageFlashTimer = null;
export function showDamageFlash() {
    const overlay = document.getElementById('damage-overlay');
    if (!overlay) return;
    overlay.style.transition = 'opacity 0.05s';
    overlay.style.opacity = '1';
    if (damageFlashTimer) clearTimeout(damageFlashTimer);
    damageFlashTimer = setTimeout(() => {
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
    }, 80);
}

// Professional game over screen
let totalKills = 0;
export function incrementKillCount() { totalKills++; }
export function resetKillCount() { totalKills = 0; }

export function showGameOver(cause) {
    const screen = document.getElementById('game-over');
    if (!screen) return;
    document.getElementById('go-cause').innerText = cause || '';
    document.getElementById('go-score').innerText = state.score;
    document.getElementById('go-kills').innerText = totalKills;

    // In multiplayer, game over is shown but auto-respawn, so hide respawn btn
    const respawnBtn = document.getElementById('go-respawn-btn');
    if (respawnBtn) {
        respawnBtn.style.display = state.isMultiplayer ? 'none' : 'inline-block';
    }

    screen.classList.add('active');
}

export function hideGameOver() {
    const screen = document.getElementById('game-over');
    if (screen) screen.classList.remove('active');
}

// Speed & altitude HUD
export function updateSpeedAltitude(speed, altitude) {
    const el = document.getElementById('speed-alt-display');
    if (!el) return;
    el.style.display = 'block';
    const spdEl = document.getElementById('speed-val');
    const altEl = document.getElementById('alt-val');
    if (spdEl) spdEl.innerText = `SPD ${Math.round(speed)}`;
    if (altEl) altEl.innerText = `ALT ${Math.round(Math.max(0, altitude))}m`;
}

// Map boundary warning
export function showBoundaryWarning(show) {
    const el = document.getElementById('boundary-warning');
    if (!el) return;
    el.style.display = show ? 'block' : 'none';
}

// Respawn countdown
export function showRespawnCountdown(seconds, onDone) {
    const screen = document.getElementById('respawn-screen');
    const cdEl = document.getElementById('respawn-countdown');
    if (!screen || !cdEl) { if (onDone) onDone(); return; }

    screen.classList.add('active');
    cdEl.innerText = seconds;

    let remaining = seconds - 1;
    const interval = setInterval(() => {
        if (remaining <= 0) {
            clearInterval(interval);
            screen.classList.remove('active');
            if (onDone) onDone();
        } else {
            cdEl.innerText = remaining;
            remaining--;
        }
    }, 1000);
}

// Team score display
export function updateTeamScore(blueScore, redScore) {
    const display = document.getElementById('team-score-display');
    if (!display) return;
    display.style.display = 'flex';
    const bEl = document.getElementById('score-blue');
    const rEl = document.getElementById('score-red');
    if (bEl) bEl.innerText = blueScore;
    if (rEl) rEl.innerText = redScore;
}

// Missile reload indicator
export function updateMissileReload(progress) {
    const bar = document.getElementById('missile-reload-bar');
    const fill = document.getElementById('missile-reload-fill');
    if (!bar || !fill) return;
    if (progress >= 1) {
        bar.style.display = 'none';
    } else {
        bar.style.display = 'block';
        fill.style.width = (progress * 100) + '%';
    }
}

export function updateCrosshair() {
    if (!state.player || !state.camera) return;

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(state.player.mesh.quaternion);
    const target = state.player.mesh.position.clone().add(fwd.multiplyScalar(500));
    const vector = target.project(state.camera);

    const x = (vector.x * .5 + .5) * window.innerWidth;
    const y = -(vector.y * .5 - .5) * window.innerHeight;

    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        if (vector.z < 1) {
            crosshair.style.display = 'block';
            crosshair.style.left = `${x}px`;
            crosshair.style.top = `${y}px`;
        } else {
            crosshair.style.display = 'none';
        }
    }
}

// Afterburner bar
export function updateAfterburnerBar(fuel, active, onCooldown) {
    const display = document.getElementById('afterburner-display');
    const fill = document.getElementById('afterburner-fill');
    const status = document.getElementById('afterburner-status');
    if (!display || !fill || !status) return;
    display.style.display = state.gameStarted ? 'block' : 'none';
    fill.style.width = (fuel * 100) + '%';
    if (active) {
        fill.style.background = 'linear-gradient(90deg,#ef4444,#fbbf24)';
        status.innerText = 'AKTİF';
        status.style.color = '#fbbf24';
    } else if (onCooldown) {
        fill.style.background = 'linear-gradient(90deg,#374151,#4b5563)';
        status.innerText = 'SOĞUYOR';
        status.style.color = '#6b7280';
    } else {
        fill.style.background = 'linear-gradient(90deg,#f97316,#fbbf24)';
        status.innerText = fuel >= 1.0 ? 'HAZIR' : 'DOLUYOR';
        status.style.color = fuel >= 1.0 ? '#4ade80' : '#94a3b8';
    }
}

// Flare count display
export function updateFlareDisplay(ammo) {
    const el = document.getElementById('flare-display');
    const cnt = document.getElementById('flare-count');
    if (!el || !cnt) return;
    el.style.display = state.gameStarted ? 'block' : 'none';
    cnt.innerText = ammo;
    cnt.style.color = ammo > 0 ? '#fbbf24' : '#ef4444';
}

// Lock-on HUD box
export function updateLockOnHUD(target, progress) {
    const box = document.getElementById('lockon-box');
    if (!box) return;
    if (!target || !state.camera || !target.mesh) {
        box.style.display = 'none';
        return;
    }
    const pos3d = target.mesh.position.clone();
    const projected = pos3d.project(state.camera);
    if (projected.z >= 1) { box.style.display = 'none'; return; }
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = -(projected.y * 0.5 - 0.5) * window.innerHeight;
    const sz = 44;
    box.style.display = 'block';
    box.style.left = (x - sz / 2) + 'px';
    box.style.top = (y - sz / 2) + 'px';
    box.style.width = sz + 'px';
    box.style.height = sz + 'px';
    const prog = document.getElementById('lockon-progress-bar');
    if (prog) prog.style.width = (progress * 100) + '%';
    const label = document.getElementById('lockon-label');
    const color = progress >= 1.0 ? '#ff0000' : '#ff8800';
    box.style.borderColor = color;
    if (label) { label.innerText = progress >= 1.0 ? 'LOCKED' : 'LOCK...'; label.style.color = color; }
    if (prog) prog.style.background = color;
}

// Settings panel
export function openSettings() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    state.showSettings = true;
    panel.style.display = 'flex';
    const v = document.getElementById('setting-volume');
    const d = document.getElementById('setting-dayspeed');
    const b = document.getElementById('setting-bloom');
    if (v) v.value = state.settings.volume;
    if (d) d.value = state.settings.daySpeed;
    if (b) b.checked = state.settings.bloom !== false;
}

export function closeSettings() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;
    state.showSettings = false;
    panel.style.display = 'none';
    const v = document.getElementById('setting-volume');
    const d = document.getElementById('setting-dayspeed');
    const b = document.getElementById('setting-bloom');
    if (v) state.settings.volume = parseFloat(v.value);
    if (d) { state.settings.daySpeed = parseFloat(d.value); state.daySpeed = state.settings.daySpeed; }
    if (b) state.settings.bloom = b.checked;
}

// Session stats overlay (Tab)
export function toggleStats() {
    state.showStats = !state.showStats;
    const overlay = document.getElementById('stats-overlay');
    if (!overlay) return;
    if (state.showStats) {
        const kills = document.getElementById('stat-kills');
        const deaths = document.getElementById('stat-deaths');
        const score = document.getElementById('stat-score');
        const time = document.getElementById('stat-time');
        if (kills) kills.innerText = state.sessionKills;
        if (deaths) deaths.innerText = state.sessionDeaths;
        if (score) score.innerText = state.score;
        if (time) {
            const elapsed = state.sessionStartTime ? Math.floor((Date.now() - state.sessionStartTime) / 1000) : 0;
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            time.innerText = `${mins}:${String(secs).padStart(2, '0')}`;
        }
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
}

// Fullscreen tactical map (M)
export function toggleFullMap() {
    state.showMap = !state.showMap;
    const overlay = document.getElementById('fullmap-overlay');
    if (!overlay) return;
    if (state.showMap) {
        overlay.style.display = 'flex';
        drawFullMap();
    } else {
        overlay.style.display = 'none';
    }
}

function drawFullMap() {
    const canvas = document.getElementById('fullmap-canvas');
    if (!canvas || !state.player) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const range = 2200;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0, 8, 0, 0.95)';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,255,0,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const gx = (i / 10) * W, gy = (i / 10) * H;
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    // Center cross
    ctx.strokeStyle = 'rgba(0,255,0,0.2)';
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

    function world2map(wx, wz) {
        return { x: cx + (wx / range) * (W / 2), y: cy + (wz / range) * (H / 2) };
    }
    function drawDot(wx, wz, color, size, label) {
        const p = world2map(wx, wz);
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
        if (label) {
            ctx.fillStyle = color; ctx.font = '10px monospace';
            ctx.fillText(label, p.x + size + 2, p.y + 4);
        }
    }

    state.antiAirs.forEach(aa => { if (aa.mesh) drawDot(aa.mesh.position.x, aa.mesh.position.z, '#ff8800', 4); });
    state.powerups.forEach(pu => { if (pu.mesh) drawDot(pu.mesh.position.x, pu.mesh.position.z, '#ffff00', 4); });
    state.enemies.forEach(e => { if (e.mesh) drawDot(e.mesh.position.x, e.mesh.position.z, '#ff4444', 5); });
    state.remotePlayers.forEach(rp => {
        if (!rp.mesh) return;
        const isTeammate = rp.data && rp.data.team && state.team && rp.data.team === state.team;
        drawDot(rp.mesh.position.x, rp.mesh.position.z, isTeammate ? '#00ff88' : '#ff4444', 6, rp.data?.name);
    });

    // Player
    const pp = world2map(state.player.mesh.position.x, state.player.mesh.position.z);
    ctx.fillStyle = '#00ff00';
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(pp.x, pp.y, 12, 0, Math.PI * 2); ctx.stroke();

    // Legend
    const legends = [['#00ff00', 'Sen'], ['#ff4444', 'Düşman'], ['#ff8800', 'AA'], ['#ffff00', 'Güçlendirme'], ['#00ff88', 'Takım']];
    ctx.font = '11px monospace';
    legends.forEach(([color, lbl], i) => {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(16, 16 + i * 18, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(lbl, 26, 20 + i * 18);
    });

    // Range ring
    ctx.strokeStyle = 'rgba(0,255,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, (W / 2) * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, (W / 2) * 0.9, 0, Math.PI * 2); ctx.stroke();
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
    const range = 2000;

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

    const pPos = state.player.mesh.position;
    const euler = new THREE.Euler().setFromQuaternion(state.player.mesh.quaternion);
    const angle = euler.y;

    function drawBlip(x, z, color, size = 3, shape = 'circle') {
        const dx = x - pPos.x;
        const dz = z - pPos.z;
        const rx = dx * Math.cos(-angle) - dz * Math.sin(-angle);
        const rz = dx * Math.sin(-angle) + dz * Math.cos(-angle);
        const sx = cx + (rx / range) * (width / 2);
        const sy = cy + (rz / range) * (height / 2);
        const dist = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
        if (dist > width / 2) return;

        ctx.fillStyle = color;
        ctx.beginPath();
        if (shape === 'square') {
            ctx.rect(sx - size, sy - size, size * 2, size * 2);
        } else if (shape === 'diamond') {
            ctx.moveTo(sx, sy - size);
            ctx.lineTo(sx + size, sy);
            ctx.lineTo(sx, sy + size);
            ctx.lineTo(sx - size, sy);
            ctx.closePath();
        } else {
            ctx.arc(sx, sy, size, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    // Player direction indicator
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    // Arrow showing player heading
    ctx.strokeStyle = 'rgba(0,255,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 14);
    ctx.stroke();

    // Enemies (red circle)
    if (state.enemies) {
        state.enemies.forEach(e => {
            if (e.mesh) drawBlip(e.mesh.position.x, e.mesh.position.z, '#ff4444', 4);
        });
    }

    // Anti-air units (orange diamond)
    if (state.antiAirs) {
        state.antiAirs.forEach(aa => {
            if (aa.mesh) drawBlip(aa.mesh.position.x, aa.mesh.position.z, '#ff8800', 3, 'diamond');
        });
    }

    // Power-ups (yellow square)
    if (state.powerups) {
        state.powerups.forEach(pu => {
            if (pu.mesh) drawBlip(pu.mesh.position.x, pu.mesh.position.z, '#ffff00', 3, 'square');
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
