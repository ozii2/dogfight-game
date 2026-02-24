import * as THREE from 'three';
import { state, setScene, setCamera, setRenderer } from './state.js';
import { getTerrainHeight, noise } from './utils.js';

export function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

export function initGraphics() {
    // Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.0015); // Expo fog for better depth
    setScene(scene);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.set(0, 50, 100);
    setCamera(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tone mapping for better dynamic range
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);
    setRenderer(renderer);

    // Light
    // Hemisphere light for natural sky/ground ambient
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2); // Brighter sun
    dirLight.position.set(100, 300, 200);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024; // Optimized shadows
    dirLight.shadow.mapSize.height = 1024;
    const d = 800;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    // Environment
    createSky();
    createTerrain();
    createTrees();
    createBuildings();
}

function createSky() {
    const vertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `;
    const fragmentShader = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize( vWorldPosition + offset ).y;
            gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
        }
    `;
    const uniforms = {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
    };
    uniforms.topColor.value.copy(new THREE.Color(0x0077ff));
    uniforms.bottomColor.value.copy(new THREE.Color(0xffffff));

    const skyGeo = new THREE.SphereGeometry(2000, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.BackSide
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    state.scene.add(sky);
}

export function createTerrain() {
    const geometry = new THREE.PlaneGeometry(4000, 4000, 64, 64); // Reduced segments for performance as we have fog
    geometry.rotateX(-Math.PI / 2);

    const posAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < posAttribute.count; i++) {
        vertex.fromBufferAttribute(posAttribute, i);
        vertex.y = getTerrainHeight(vertex.x, vertex.z);
        posAttribute.setY(i, vertex.y);
    }

    geometry.computeVertexNormals();

    // Height-based vertex coloring with more natural tones
    const colors = new Float32Array(posAttribute.count * 3);
    const deepWater = new THREE.Color(0x1e3a8a); // Dark blue (faked)
    const sandColor = new THREE.Color(0xd2b48c); // Tan
    const grassColor = new THREE.Color(0x3f6218); // Darker olive green
    const rockColor = new THREE.Color(0x5c5040); // Dark grey-brown
    const snowColor = new THREE.Color(0xffffff); // White

    for (let i = 0; i < posAttribute.count; i++) {
        const y = posAttribute.getY(i);
        let color;
        if (y < -5) {
            color = sandColor.lerp(deepWater, 0.4); // Underwater darker
        } else if (y < 5) {
            color = sandColor;
        } else if (y < 60) {
            const t = (y - 5) / 55;
            color = grassColor.clone().lerp(rockColor, t * 0.3); // Mix grass
        } else if (y < 120) {
            const t = (y - 60) / 60;
            color = rockColor.clone().lerp(snowColor, t * 0.2);
        } else {
            color = snowColor;
        }
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: false, // Smooth shading for realism
        roughness: 0.9,
        metalness: 0.1
    });

    state.terrain = new THREE.Mesh(geometry, material);
    state.terrain.receiveShadow = true;
    state.scene.add(state.terrain);

    // Water plane
    const waterGeo = new THREE.PlaneGeometry(4000, 4000, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.6,
        roughness: 0.05,
        metalness: 0.8
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = -5;
    water.receiveShadow = true;
    state.scene.add(water);
}

export function createTrees() {
    const treeCount = 200;
    const validTrees = [];

    // 1. Find valid positions first
    for (let i = 0; i < treeCount * 1.5; i++) { // Try more to fill count
        if (validTrees.length >= treeCount) break;

        const x = (Math.random() - 0.5) * 3600;
        const z = (Math.random() - 0.5) * 3600;

        // Find height at position using consistent terrain function
        let y = getTerrainHeight(x, z);

        // Don't put trees on water, very high peaks, or airfield (y near 0)
        if (y < 5 || y > 150) continue;

        validTrees.push({ x, y, z });
    }

    const finalCount = validTrees.length;
    const dummy = new THREE.Object3D();

    // Tree Trunk - Low Poly Instanced
    const trunkGeom = new THREE.CylinderGeometry(1, 2, 5, 5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, finalCount);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    // Tree Top - Low Poly Instanced
    const topGeom = new THREE.ConeGeometry(6, 15, 5);
    const topMat = new THREE.MeshLambertMaterial({ color: 0x1a472a });
    const topMesh = new THREE.InstancedMesh(topGeom, topMat, finalCount);
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;

    validTrees.forEach((pos, i) => {
        const s = 0.8 + Math.random() * 0.4; // Scale variation

        // Trunk
        dummy.position.set(pos.x, pos.y + 2.5 * s, pos.z);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        trunkMesh.setMatrixAt(i, dummy.matrix);

        // Top
        dummy.position.set(pos.x, pos.y + (2.5 + 7.5) * s, pos.z); // Stack on trunk
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        topMesh.setMatrixAt(i, dummy.matrix);

        // Add to colliders
        state.treeColliders.push({
            x: pos.x,
            z: pos.z,
            radius: 5 * s,
            height: 20 * s
        });
    });

    state.scene.add(trunkMesh);
    state.scene.add(topMesh);
}

export function createBuildings() {
    const count = 150; // Reduced count target
    const group = new THREE.Group();

    // Shared materials
    const windowTex = createWindowTexture();
    const matConcrete = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Lambert
    const matRoof = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Lambert

    // City Settings (Central Grid)
    const citySize = 500; // Reduced from 800
    const blockSize = 80;
    const roadWidth = 20;

    const matAsphalt = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const roadGeo = new THREE.PlaneGeometry(20, 20);
    roadGeo.rotateX(-Math.PI / 2);

    const roadPositions = [];
    const dummy = new THREE.Object3D();

    for (let x = -citySize; x <= citySize; x += 20) {
        for (let z = -citySize; z <= citySize; z += 20) {

            // Determine if road or building slot
            const xMod = Math.abs(x) % blockSize;
            const zMod = Math.abs(z) % blockSize;
            const isRoadVal = xMod < roadWidth || zMod < roadWidth;

            // Get terrain height
            const y = getTerrainHeight(x, z);

            // Water check
            if (y < 5) continue;
            // Steepness check
            const y2 = getTerrainHeight(x + 5, z + 5);
            if (Math.abs(y - y2) > 4) continue;

            if (isRoadVal) {
                // Collect Road Position
                if (x % 20 === 0 && z % 20 === 0) {
                    roadPositions.push({ x, y: y + 0.1, z });
                }
            } else {
                // Place Building (Sparse placement)
                if (Math.random() > 0.7) continue; // More sparse (was 0.4)

                // Zoning: Distance from center 0,0
                const dist = Math.sqrt(x * x + z * z);
                const centerFactor = Math.max(0, 1.0 - (dist / citySize));

                const isSkyscraper = Math.random() < (centerFactor * centerFactor * 0.9);

                let w, h, d;
                const building = new THREE.Group();

                if (isSkyscraper) {
                    // SKYSCRAPER
                    w = 15 + Math.random() * 10;
                    d = 15 + Math.random() * 10;
                    h = 60 + Math.random() * 100 * centerFactor;

                    const localTex = windowTex.clone();
                    localTex.repeat.set(1, h / 10);
                    localTex.needsUpdate = true;
                    const matWall = new THREE.MeshLambertMaterial({ map: localTex });

                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [matWall, matWall, matConcrete, matConcrete, matWall, matWall]);
                    mesh.castShadow = true;
                    mesh.position.y = h / 2;
                    building.add(mesh);

                    const antH = 5 + Math.random() * 15;
                    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, antH, 4), matConcrete);
                    antenna.position.set(0, h + antH / 2, 0);
                    building.add(antenna);
                } else {
                    // SMALL HOUSE
                    w = 10 + Math.random() * 8;
                    d = 10 + Math.random() * 8;
                    h = 8 + Math.random() * 8;

                    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matConcrete);
                    mesh.castShadow = true;
                    mesh.position.y = h / 2;
                    building.add(mesh);

                    // Roof
                    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, w * 0.5, 4), matRoof);
                    roof.position.y = h + w * 0.25;
                    roof.rotation.y = Math.PI / 4;
                    building.add(roof);
                }

                building.position.set(x, y, z);
                group.add(building);

                // Add Collider (Restored logic)
                state.treeColliders.push({
                    x: x,
                    z: z,
                    radius: Math.max(w, d) * 0.7,
                    height: h
                });
            }
        }
    }

    // Create Instanced Road
    if (roadPositions.length > 0) {
        const roadMesh = new THREE.InstancedMesh(roadGeo, matAsphalt, roadPositions.length);
        roadPositions.forEach((pos, i) => {
            dummy.position.set(pos.x, pos.y, pos.z);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            roadMesh.setMatrixAt(i, dummy.matrix);
        });
        roadMesh.receiveShadow = true;
        state.scene.add(roadMesh);
    }

    state.scene.add(group);
}

export function addShake(amount) {
    // Shake logic needs cameraShake variable in state or somewhere
    // For now, let's export cameraShake from state? 
    // Or just handle shaking in main loop using a state property.
    if (state.cameraShake === undefined) state.cameraShake = 0;
    state.cameraShake = Math.max(state.cameraShake, amount);
}

// Helper to create a procedural window texture
function createWindowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Wall color
    ctx.fillStyle = '#555555';
    ctx.fillRect(0, 0, 64, 64);

    // Randomly lit windows
    const cols = 2;
    const rows = 4;
    const pad = 4;
    const w = (64 - (cols + 1) * pad) / cols;
    const h = (64 - (rows + 1) * pad) / rows;

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            // Random light
            if (Math.random() > 0.4) {
                ctx.fillStyle = Math.random() > 0.8 ? '#ffff00' : '#88ccff'; // Yellow or Blue light
            } else {
                ctx.fillStyle = '#222222'; // Dark
            }
            ctx.fillRect(pad + i * (w + pad), pad + j * (h + pad), w, h);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
