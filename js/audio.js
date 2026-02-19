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

    const now = state.audioCtx.currentTime;

    // Simple "Pfft-Whoosh"
    const bufferSize = state.audioCtx.sampleRate * 0.4;
    const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        const envelope = t < 0.05 ? (t / 0.05) : Math.pow(1 - t, 2);
        data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const source = state.audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = state.audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.4);
    filter.Q.value = 1;

    const gain = state.audioCtx.createGain();
    gain.gain.setValueAtTime(0.4, now);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(state.audioCtx.destination);
    source.start(now);
}

export function playExplodeSound() {
    if (!isAudioInit || !state.audioCtx) return;

    const now = state.audioCtx.currentTime;
    const osc = state.audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

    const gain = state.audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    osc.connect(gain);
    gain.connect(state.audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
}
