import * as THREE from 'three';
import { state, setScene, setCamera, setRenderer } from './state.js';
import { getTerrainHeight, noise } from './utils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    if (state.composer) {
        state.composer.setSize(window.innerWidth, window.innerHeight);
        // Update FXAA resolution
        const fxaaPass = state.composer.passes.find(p => p.uniforms && p.uniforms['resolution']);
        if (fxaaPass) {
            fxaaPass.uniforms['resolution'].value.set(
                1 / window.innerWidth, 1 / window.innerHeight
            );
        }
    }
}

export function initGraphics() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.0015);
    setScene(scene);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(0, 50, 100);
    setCamera(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);
    setRenderer(renderer);

    // Hemisphere light (sky / ground ambient)
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);
    state.hemiLight = hemi;

    // Directional sun light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 300, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    const d = 800;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);
    state.sunLight = dirLight;

    // Lens flare on sun
    addLensflare(dirLight);

    // EffectComposer: Bloom + FXAA
    setupPostProcessing(renderer, scene, camera);

    // Environment
    createSky();
    createTerrain();
    createTrees();
    createBuildings();
    createClouds();
}

// ─── POST-PROCESSING ─────────────────────────────────────────────────────────

function setupPostProcessing(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.45,   // strength
        0.4,    // radius
        0.80    // threshold – only very bright things bloom
    );
    composer.addPass(bloomPass);
    state._bloomPass = bloomPass;

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(
        1 / window.innerWidth, 1 / window.innerHeight
    );
    composer.addPass(fxaaPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    state.composer = composer;
}

// ─── LENS FLARE ──────────────────────────────────────────────────────────────

function makeFlareTex(size, color) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
}

function addLensflare(light) {
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(makeFlareTex(256, 'rgba(255,220,160,1)'), 120, 0));
    flare.addElement(new LensflareElement(makeFlareTex(64,  'rgba(200,180,255,0.6)'), 60,  0.6));
    flare.addElement(new LensflareElement(makeFlareTex(48,  'rgba(255,220,100,0.4)'), 40,  0.9));
    flare.addElement(new LensflareElement(makeFlareTex(32,  'rgba(200,220,255,0.5)'), 25,  1.2));
    light.add(flare);
}

// ─── SKY ─────────────────────────────────────────────────────────────────────

function createSky() {
    const vertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPosition = wp.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    const fragmentShader = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize(vWorldPosition + offset).y;
            gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
    `;
    const uniforms = {
        topColor:    { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset:      { value: 33 },
        exponent:    { value: 0.6 }
    };
    state.skyUniforms = uniforms;

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(2000, 32, 15),
        new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide })
    );
    state.scene.add(sky);
}

// ─── CLOUDS ──────────────────────────────────────────────────────────────────

function makeCloudTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    const puffs = [[60,80,50],[120,58,68],[190,82,52],[95,90,38],[155,88,44],[220,70,36]];
    puffs.forEach(([x, y, r]) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0,   'rgba(255,255,255,0.92)');
        g.addColorStop(0.5, 'rgba(240,245,255,0.55)');
        g.addColorStop(1,   'rgba(230,240,255,0)');
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
    });
    return new THREE.CanvasTexture(c);
}

function createClouds() {
    const tex = makeCloudTex();
    for (let i = 0; i < 50; i++) {
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity: 0.7 + Math.random() * 0.2,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        const x = (Math.random() - 0.5) * 3600;
        const z = (Math.random() - 0.5) * 3600;
        const y = 220 + Math.random() * 280;
        sprite.position.set(x, y, z);
        const w = 200 + Math.random() * 350;
        sprite.scale.set(w, w * 0.38, 1);
        sprite.userData.drift = (Math.random() - 0.5) * 3;
        state.scene.add(sprite);
        state.clouds.push(sprite);
    }
}

// ─── DAY / NIGHT UPDATE ───────────────────────────────────────────────────────

export function updateEnvironment(dt) {
    // Advance time
    state.dayTime = (state.dayTime + state.daySpeed * dt) % 24;
    const t = state.dayTime;

    // Sun arc
    const sunAngle = (t / 24) * Math.PI * 2 - Math.PI / 2;
    if (state.sunLight) {
        state.sunLight.position.set(
            Math.cos(sunAngle) * 600,
            Math.sin(sunAngle) * 500,
            150
        );
    }

    // Color / intensity presets
    let skyTop, skyBot, fogCol, amb, sun;
    if (t < 6) {
        const f = t / 6;
        skyTop = lerpCol(0x050515, 0x224488, f);
        skyBot = lerpCol(0x0a0a30, 0xff8833, f);
        fogCol = lerpCol(0x050515, 0xdd6622, f);
        amb = 0.05 + f * 0.25;
        sun = 0.0 + f * 0.55;
    } else if (t < 10) {
        const f = (t - 6) / 4;
        skyTop = lerpCol(0x224488, 0x0077ff, f);
        skyBot = lerpCol(0xff8833, 0xffffff, f);
        fogCol = lerpCol(0xdd6622, 0x87CEEB, f);
        amb = 0.3 + f * 0.3;
        sun = 0.55 + f * 0.65;
    } else if (t < 16) {
        skyTop = new THREE.Color(0x0077ff);
        skyBot = new THREE.Color(0xffffff);
        fogCol = new THREE.Color(0x87CEEB);
        amb = 0.60; sun = 1.20;
    } else if (t < 20) {
        const f = (t - 16) / 4;
        skyTop = lerpCol(0x0077ff, 0xcc2200, f);
        skyBot = lerpCol(0xffffff, 0xff9944, f);
        fogCol = lerpCol(0x87CEEB, 0xff5511, f);
        amb = 0.6 - f * 0.38;
        sun = 1.2 - f * 0.9;
    } else {
        const f = (t - 20) / 4;
        skyTop = lerpCol(0xcc2200, 0x050515, f);
        skyBot = lerpCol(0xff9944, 0x0a0a30, f);
        fogCol = lerpCol(0xff5511, 0x050515, f);
        amb = 0.22 - f * 0.17;
        sun = 0.3 - f * 0.3;
    }

    if (state.skyUniforms) {
        state.skyUniforms.topColor.value.copy(skyTop);
        state.skyUniforms.bottomColor.value.copy(skyBot);
    }
    if (state.scene.fog) {
        state.scene.fog.color.copy(fogCol);
        state.scene.background.copy(fogCol);
    }
    if (state.hemiLight) state.hemiLight.intensity = amb;
    if (state.sunLight) {
        const sinH = Math.sin(sunAngle);
        state.sunLight.intensity = Math.max(0, sun * sinH);
        const warmth = t > 6 && t < 20 ? (t > 16 ? 0xff9944 : 0xffffff) : 0x334466;
        state.sunLight.color.setHex(warmth);
    }

    // Bloom toggle by settings
    if (state._bloomPass) {
        state._bloomPass.enabled = state.settings.bloom !== false;
    }

    // Water animation
    if (state.waterMesh) {
        state.waterTime += dt;
        const wMat = state.waterMesh.material;
        wMat.opacity = 0.55 + Math.sin(state.waterTime * 0.4) * 0.06;
        // Slight color pulse to simulate reflection
        const bright = 0.27 + Math.sin(state.waterTime * 0.3) * 0.03;
        wMat.color.setRGB(bright * 0.4, bright * 0.7, bright);
    }

    // Drift clouds
    for (const cloud of state.clouds) {
        cloud.position.x += cloud.userData.drift * dt;
        if (Math.abs(cloud.position.x) > 2000) {
            cloud.position.x = -Math.sign(cloud.position.x) * 1900;
        }
    }
}

function lerpCol(hexA, hexB, t) {
    return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

// ─── TERRAIN & WATER ─────────────────────────────────────────────────────────

export function createTerrain() {
    const geometry = new THREE.PlaneGeometry(4000, 4000, 64, 64);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
        vertex.fromBufferAttribute(posAttr, i);
        vertex.y = getTerrainHeight(vertex.x, vertex.z);
        posAttr.setY(i, vertex.y);
    }
    geometry.computeVertexNormals();

    // Vertex colors
    const colors = new Float32Array(posAttr.count * 3);
    const cWater = new THREE.Color(0x1e3a8a);
    const cSand  = new THREE.Color(0xd2b48c);
    const cGrass = new THREE.Color(0x3f6218);
    const cRock  = new THREE.Color(0x5c5040);
    const cSnow  = new THREE.Color(0xffffff);
    for (let i = 0; i < posAttr.count; i++) {
        const y = posAttr.getY(i);
        let col;
        if (y < -5)         col = cSand.clone().lerp(cWater, 0.4);
        else if (y < 5)     col = cSand.clone();
        else if (y < 60)    col = cGrass.clone().lerp(cRock, ((y - 5) / 55) * 0.3);
        else if (y < 120)   col = cRock.clone().lerp(cSnow, ((y - 60) / 60) * 0.25);
        else                col = cSnow.clone();
        colors[i * 3]     = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 });
    state.terrain = new THREE.Mesh(geometry, material);
    state.terrain.receiveShadow = true;
    state.scene.add(state.terrain);

    // Animated water plane
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.6,
        roughness: 0.05,
        metalness: 0.85
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -5;
    water.receiveShadow = true;
    state.scene.add(water);
    state.waterMesh = water;
}

// ─── TREES ───────────────────────────────────────────────────────────────────

export function createTrees() {
    const treeCount = 200;
    const validTrees = [];
    for (let i = 0; i < treeCount * 1.8 && validTrees.length < treeCount; i++) {
        const x = (Math.random() - 0.5) * 3600;
        const z = (Math.random() - 0.5) * 3600;
        const y = getTerrainHeight(x, z);
        if (y < 5 || y > 150) continue;
        validTrees.push({ x, y, z });
    }

    const dummy = new THREE.Object3D();
    const trunkMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(1, 2, 5, 5),
        new THREE.MeshLambertMaterial({ color: 0x5c4033 }),
        validTrees.length
    );
    const topMesh = new THREE.InstancedMesh(
        new THREE.ConeGeometry(6, 15, 5),
        new THREE.MeshLambertMaterial({ color: 0x1a472a }),
        validTrees.length
    );
    trunkMesh.castShadow = topMesh.castShadow = true;
    trunkMesh.receiveShadow = topMesh.receiveShadow = true;

    validTrees.forEach((pos, i) => {
        const s = 0.8 + Math.random() * 0.4;
        dummy.position.set(pos.x, pos.y + 2.5 * s, pos.z);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(pos.x, pos.y + (2.5 + 7.5) * s, pos.z);
        dummy.updateMatrix();
        topMesh.setMatrixAt(i, dummy.matrix);
        state.treeColliders.push({ x: pos.x, z: pos.z, radius: 5 * s, height: 20 * s });
    });
    state.scene.add(trunkMesh);
    state.scene.add(topMesh);
}

// ─── BUILDINGS ───────────────────────────────────────────────────────────────

export function createBuildings() {
    const group = new THREE.Group();
    const windowTex = createWindowTexture();
    const matConcrete = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const matRoof     = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const citySize = 500, blockSize = 80, roadWidth = 20;
    const matAsphalt = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const roadGeo = new THREE.PlaneGeometry(20, 20);
    roadGeo.rotateX(-Math.PI / 2);
    const dummy = new THREE.Object3D();
    const roadPositions = [];

    for (let x = -citySize; x <= citySize; x += 20) {
        for (let z = -citySize; z <= citySize; z += 20) {
            const xMod = Math.abs(x) % blockSize;
            const zMod = Math.abs(z) % blockSize;
            const isRoad = xMod < roadWidth || zMod < roadWidth;
            const y = getTerrainHeight(x, z);
            if (y < 5) continue;
            if (Math.abs(y - getTerrainHeight(x + 5, z + 5)) > 4) continue;
            if (isRoad) {
                if (x % 20 === 0 && z % 20 === 0) roadPositions.push({ x, y: y + 0.1, z });
                continue;
            }
            if (Math.random() > 0.7) continue;
            const dist = Math.sqrt(x * x + z * z);
            const cf = Math.max(0, 1 - dist / citySize);
            const isSkyscraper = Math.random() < cf * cf * 0.9;
            const building = new THREE.Group();
            let w, h, d;
            if (isSkyscraper) {
                w = 15 + Math.random() * 10; d = 15 + Math.random() * 10;
                h = 60 + Math.random() * 100 * cf;
                const localTex = windowTex.clone();
                localTex.repeat.set(1, h / 10); localTex.needsUpdate = true;
                const mesh = new THREE.Mesh(
                    new THREE.BoxGeometry(w, h, d),
                    [new THREE.MeshLambertMaterial({ map: localTex }), ...Array(5).fill(matConcrete)]
                );
                mesh.castShadow = true; mesh.position.y = h / 2;
                building.add(mesh);
                const antH = 5 + Math.random() * 15;
                const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, antH, 4), matConcrete);
                ant.position.set(0, h + antH / 2, 0);
                building.add(ant);
            } else {
                w = 10 + Math.random() * 8; d = 10 + Math.random() * 8; h = 8 + Math.random() * 8;
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matConcrete);
                mesh.castShadow = true; mesh.position.y = h / 2;
                building.add(mesh);
                const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, w * 0.5, 4), matRoof);
                roof.position.y = h + w * 0.25; roof.rotation.y = Math.PI / 4;
                building.add(roof);
            }
            building.position.set(x, y, z);
            group.add(building);
            state.treeColliders.push({ x, z, radius: Math.max(w, d) * 0.7, height: h });
        }
    }
    if (roadPositions.length > 0) {
        const roadMesh = new THREE.InstancedMesh(roadGeo, matAsphalt, roadPositions.length);
        roadPositions.forEach((pos, i) => {
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
            dummy.updateMatrix();
            roadMesh.setMatrixAt(i, dummy.matrix);
        });
        roadMesh.receiveShadow = true;
        state.scene.add(roadMesh);
    }
    state.scene.add(group);
}

export function addShake(amount) {
    if (state.cameraShake === undefined) state.cameraShake = 0;
    state.cameraShake = Math.max(state.cameraShake, amount);
}

function createWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 64, 64);
    const cols = 2, rows = 4, pad = 4;
    const w = (64 - (cols + 1) * pad) / cols;
    const h = (64 - (rows + 1) * pad) / rows;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            ctx.fillStyle = Math.random() > 0.4
                ? (Math.random() > 0.8 ? '#ffff00' : '#88ccff')
                : '#222222';
            ctx.fillRect(pad + i * (w + pad), pad + j * (h + pad), w, h);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
