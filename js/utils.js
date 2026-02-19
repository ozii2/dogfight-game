export class SimpleNoise {
    constructor() {
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.perm[i] = this.perm[i + 256] = Math.floor(Math.random() * 256);
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    noise(x, y, z) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        const A = this.perm[X] + Y, AA = this.perm[A] + Z, AB = this.perm[A + 1] + Z;
        const B = this.perm[X + 1] + Y, BA = this.perm[B] + Z, BB = this.perm[B + 1] + Z;
        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.perm[AA], x, y, z),
            this.grad(this.perm[BA], x - 1, y, z)),
            this.lerp(u, this.grad(this.perm[AB], x, y - 1, z),
                this.grad(this.perm[BB], x - 1, y - 1, z))),
            this.lerp(v, this.lerp(u, this.grad(this.perm[AA + 1], x, y, z - 1),
                this.grad(this.perm[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.perm[AB + 1], x, y - 1, z - 1),
                    this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1))));
    }
}

export const noise = new SimpleNoise();

// Helper to get terrain height
// Needs to be flexible to use the exported noise
export function getTerrainHeight(x, z) {
    // Large features
    let y = noise.noise(x * 0.001, 0, z * 0.001) * 250;
    // Detail
    y += noise.noise(x * 0.005, 0, z * 0.005) * 50;
    // Extra roughness
    y += noise.noise(x * 0.02, 0, z * 0.02) * 10;

    // Flatten center for airfield (approx 600 radius)
    const dist = Math.sqrt(x * x + z * z);
    if (dist < 600) {
        y *= (dist / 600); // Smooth transition
    }
    // River/Canyon
    if (y < -20) y = -20; // Water level clamp

    return y;
}
