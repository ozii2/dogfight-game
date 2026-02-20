import { state } from './state.js';

let isAudioInit = false;

export function initAudio() {
    if (isAudioInit) return;
    try {
        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        isAudioInit = true;
    } catch (e) {
        console.warn('AudioContext not supported');
    }
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

// NEW: Metallic impact sound (bullet hitting target)
export function playImpactSound() {
    if (!isAudioInit || !state.audioCtx) return;
    const ctx = state.audioCtx;
    const now = ctx.currentTime;

    // Sharp metallic ping
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.15, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    // Tiny noise for impact texture
    const impLen = ctx.sampleRate * 0.05;
    const impBuf = ctx.createBuffer(1, impLen, ctx.sampleRate);
    const impData = impBuf.getChannelData(0);
    for (let i = 0; i < impLen; i++) {
        const t = i / impLen;
        impData[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 6);
    }
    const impSrc = ctx.createBufferSource();
    impSrc.buffer = impBuf;

    const impGain = ctx.createGain();
    impGain.gain.setValueAtTime(0.2, now);

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    impSrc.connect(hpf);
    hpf.connect(impGain);
    impGain.connect(ctx.destination);
    impSrc.start(now);
}
