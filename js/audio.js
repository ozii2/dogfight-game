import { state } from './state.js';

let isAudioInit = false;

// Engine sound nodes
let engineOsc = null, engineGain = null, engineFilter = null;
let missileWarningOsc = null, missileWarningGain = null;
let warningActive = false;

export function initAudio() {
    if (isAudioInit) return;
    try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        isAudioInit = true;
    } catch (e) {
        console.warn('AudioContext not supported');
    }
}

export function startEngineSound() {
    if (!isAudioInit || !state.audioCtx) return;
    if (engineOsc) return;
    const ctx = state.audioCtx;

    // Very soft sine-wave rumble – barely audible background hum
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sine';
    engineOsc.frequency.value = 48;

    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 80;
    engineFilter.Q.value = 0.5;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0.012; // very quiet

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
}

export function updateEngineSound(speed, maxSpeed) {
    if (!isAudioInit || !state.audioCtx || !engineOsc) return;
    const ctx = state.audioCtx;
    const t = ctx.currentTime;
    const ratio = Math.max(0.3, Math.min(1, speed / maxSpeed));

    engineOsc.frequency.linearRampToValueAtTime(40 + ratio * 20, t + 0.3);
    engineGain.gain.linearRampToValueAtTime(0.008 + ratio * 0.008, t + 0.3);
}

export function stopEngineSound() {
    if (engineOsc) { try { engineOsc.stop(); } catch(e) {} engineOsc = null; }
    engineGain = null; engineFilter = null;
}

export function playMissileWarning() {
    if (!isAudioInit || !state.audioCtx || warningActive) return;
    warningActive = true;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;

    missileWarningOsc = ctx.createOscillator();
    missileWarningOsc.type = 'square';
    missileWarningOsc.frequency.value = 880;

    missileWarningGain = ctx.createGain();
    missileWarningGain.gain.setValueAtTime(0, now);

    // Rapid beep pattern
    for (let i = 0; i < 6; i++) {
        missileWarningGain.gain.setValueAtTime(0.12, now + i * 0.15);
        missileWarningGain.gain.setValueAtTime(0, now + i * 0.15 + 0.07);
    }

    missileWarningOsc.connect(missileWarningGain);
    missileWarningGain.connect(ctx.destination);
    missileWarningOsc.start(now);
    missileWarningOsc.stop(now + 1.0);

    setTimeout(() => { warningActive = false; }, 1100);
}

export function playShootSound() {
    if (!isAudioInit || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;

    // --- Layer 1: Sharp crack (noise burst) ---
    const crackLen = ctx.sampleRate * 0.08;
    const crackBuf = ctx.createBuffer(1, crackLen, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
        const t = i / crackLen;
        const env = t < 0.02 ? (t / 0.02) : Math.pow(1 - t, 4);
        crackData[i] = (Math.random() * 2 - 1) * env;
    }
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackFilter = ctx.createBiquadFilter();
    crackFilter.type = 'highpass';
    crackFilter.frequency.value = 2000;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.3, now);

    crackSrc.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(ctx.destination);
    crackSrc.start(now);

    // --- Layer 2: Low thump ---
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
}

export function playExplodeSound() {
    if (!isAudioInit || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;

    // --- Layer 1: Deep bass boom ---
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, now);
    boom.frequency.exponentialRampToValueAtTime(15, now + 0.8);

    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.6, now);
    boomGain.gain.setValueAtTime(0.6, now + 0.05);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    // Distortion for crunch
    const distortion = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = (Math.PI + 200) * x / (Math.PI + 200 * Math.abs(x));
    }
    distortion.curve = curve;
    distortion.oversample = '4x';

    boom.connect(distortion);
    distortion.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.8);

    // --- Layer 2: Noise burst (debris/shrapnel) ---
    const noiseLen = ctx.sampleRate * 1.2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const noiseData = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
        const t = i / noiseLen;
        // Fast attack, slow decay
        const env = t < 0.01 ? (t / 0.01) : Math.pow(1 - t, 3);
        noiseData[i] = (Math.random() * 2 - 1) * env;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1500, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 1.0);
    noiseFilter.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSrc.start(now);

    // --- Layer 3: Mid crackle ---
    const crackle = ctx.createOscillator();
    crackle.type = 'sawtooth';
    crackle.frequency.setValueAtTime(200, now);
    crackle.frequency.exponentialRampToValueAtTime(30, now + 0.4);

    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.25, now);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    crackle.connect(crackleGain);
    crackleGain.connect(ctx.destination);
    crackle.start(now);
    crackle.stop(now + 0.4);
}

export function playFlareSound() {
    if (!isAudioInit || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;
    const bufLen = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-(i / bufLen) * 14);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
}

// Subtle "tick" sound (bullet hit)
export function playImpactSound() {
    if (!isAudioInit || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;

    // Very short, quiet click
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200 + Math.random() * 300, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now); // Very quiet
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}
