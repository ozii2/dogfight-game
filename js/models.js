import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- 3D Model Preloading ---
const loadedModels = {};
const gltfLoader = new GLTFLoader();

function loadModel(path, key, targetSize) {
    return new Promise((resolve) => {
        gltfLoader.load(
            path,
            (gltf) => {
                const model = gltf.scene;
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = targetSize / maxDim;
                model.scale.set(scale, scale, scale);
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center.multiplyScalar(scale));
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                loadedModels[key] = model;
                console.log(`${key} 3D model loaded!`);
                resolve();
            },
            undefined,
            (err) => {
                console.warn(`${key} model load failed, using fallback:`, err);
                resolve();
            }
        );
    });
}

export function preloadModels() {
    return Promise.all([
        loadModel('models/wwii_soviet_plane_with_interior.glb', 'fighter', 150),
        loadModel('models/Rafael.gltf', 'attack', 18)
    ]);
}

export function addAfterburner(group, zPos, scale) {
    const flameCore = new THREE.ConeGeometry(0.35 * scale, 3 * scale, 8);
    flameCore.rotateX(-Math.PI / 2);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    const flame = new THREE.Mesh(flameCore, flameMat);
    flame.position.z = zPos;
    flame.name = 'fireCore';
    group.add(flame);

    const flameOuter = new THREE.ConeGeometry(0.6 * scale, 4 * scale, 8);
    flameOuter.rotateX(-Math.PI / 2);
    const flameOuterMat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.5 });
    const flameO = new THREE.Mesh(flameOuter, flameOuterMat);
    flameO.position.z = zPos;
    flameO.name = 'fireOuter';
    group.add(flameO);
}

export function createFighterMesh(mainColor, wingColor) {
    // Use loaded 3D model if available
    if (loadedModels.fighter) {
        const clone = loadedModels.fighter.clone();
        clone.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
            }
        });
        return clone;
    }

    // Fallback: procedural geometry
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.7, roughness: 0.3 });
    const matWing = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.6, roughness: 0.4 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 0.95, roughness: 0.05, transparent: true, opacity: 0.4 });

    // Slim fuselage
    const frontGeo = new THREE.CylinderGeometry(0.7, 1.1, 5, 12);
    frontGeo.rotateX(Math.PI / 2);
    const front = new THREE.Mesh(frontGeo, matBody);
    front.position.z = 4.5;
    group.add(front);

    const bodyGeo = new THREE.CylinderGeometry(1.1, 1.2, 8, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, matBody);
    body.position.z = -1;
    group.add(body);

    const rearGeo = new THREE.CylinderGeometry(1.2, 0.8, 4, 12);
    rearGeo.rotateX(Math.PI / 2);
    const rear = new THREE.Mesh(rearGeo, matBody);
    rear.position.z = -7;
    group.add(rear);

    // Long pointed nose
    const noseGeo = new THREE.ConeGeometry(0.7, 5, 12);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, matBody);
    nose.position.z = 9.5;
    group.add(nose);

    // Cockpit
    const canopyGeo = new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const canopy = new THREE.Mesh(canopyGeo, matGlass);
    canopy.position.set(0, 0.8, 3);
    canopy.scale.set(0.6, 0.5, 1.3);
    group.add(canopy);

    // Slim delta wings
    const wingGeo = new THREE.BoxGeometry(13, 0.08, 3.5);
    const leftWing = new THREE.Mesh(wingGeo, matWing);
    leftWing.position.set(-5.5, 0, -1);
    leftWing.rotation.y = -0.15;
    leftWing.rotation.z = -0.02;
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, matWing);
    rightWing.position.set(5.5, 0, -1);
    rightWing.rotation.y = 0.15;
    rightWing.rotation.z = 0.02;
    group.add(rightWing);

    // Twin vertical tails
    const vTailGeo = new THREE.BoxGeometry(0.1, 2.8, 2.2);
    const leftTail = new THREE.Mesh(vTailGeo, matWing);
    leftTail.position.set(-1.0, 1.6, -7);
    leftTail.rotation.x = 0.15;
    leftTail.rotation.z = 0.12;
    group.add(leftTail);

    const rightTail = new THREE.Mesh(vTailGeo, matWing);
    rightTail.position.set(1.0, 1.6, -7);
    rightTail.rotation.x = 0.15;
    rightTail.rotation.z = -0.12;
    group.add(rightTail);

    // H-stab
    const hStabGeo = new THREE.BoxGeometry(5, 0.08, 1.8);
    const hStab = new THREE.Mesh(hStabGeo, matWing);
    hStab.position.set(0, 0.2, -8);
    group.add(hStab);

    // Intakes
    const intakeGeo = new THREE.BoxGeometry(0.7, 0.7, 2);
    group.add(new THREE.Mesh(intakeGeo, matDark).translateX(-1.3).translateY(-0.3).translateZ(2));
    group.add(new THREE.Mesh(intakeGeo, matDark).translateX(1.3).translateY(-0.3).translateZ(2));

    // Nozzle
    const nozzleGeo = new THREE.CylinderGeometry(0.7, 0.5, 1.5, 12);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, matDark);
    nozzle.position.z = -9.5;
    group.add(nozzle);

    // === Nav Lights ===
    const navLightGeoSmall = new THREE.SphereGeometry(0.15, 6, 6);
    const matNavRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const matNavGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const matNavWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const navLeft = new THREE.Mesh(navLightGeoSmall, matNavRed);
    navLeft.position.set(-12, 0.1, -1);
    navLeft.name = 'navLightLeft';
    group.add(navLeft);
    const navRight = new THREE.Mesh(navLightGeoSmall, matNavGreen);
    navRight.position.set(12, 0.1, -1);
    navRight.name = 'navLightRight';
    group.add(navRight);
    const navTail = new THREE.Mesh(navLightGeoSmall, matNavWhite);
    navTail.position.set(0, 2.5, -8.5);
    navTail.name = 'navLightTail';
    group.add(navTail);

    // === Ailerons (animated control surfaces) ===
    const aileronGeo = new THREE.BoxGeometry(3, 0.06, 0.8);
    const matAileron = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.6, roughness: 0.4 });
    const aileronL = new THREE.Mesh(aileronGeo, matAileron);
    aileronL.position.set(-10, 0, -2.5);
    group.add(aileronL);
    const aileronR = new THREE.Mesh(aileronGeo, matAileron);
    aileronR.position.set(10, 0, -2.5);
    group.add(aileronR);
    group.userData.aileronL = aileronL;
    group.userData.aileronR = aileronR;

    // === Fuselage stripe decal ===
    const stripeGeo = new THREE.BoxGeometry(0.05, 0.5, 4);
    const matStripe = new THREE.MeshBasicMaterial({ color: wingColor });
    const stripeL = new THREE.Mesh(stripeGeo, matStripe);
    stripeL.position.set(-1.15, 0.5, -1);
    group.add(stripeL);
    const stripeR = new THREE.Mesh(stripeGeo, matStripe);
    stripeR.position.set(1.15, 0.5, -1);
    group.add(stripeR);

    // === Wingtip missile rails ===
    const railGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6);
    railGeo.rotateX(Math.PI / 2);
    const matRail = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });
    const railL = new THREE.Mesh(railGeo, matRail);
    railL.position.set(-11.5, -0.3, -1);
    group.add(railL);
    const railR = new THREE.Mesh(railGeo, matRail);
    railR.position.set(11.5, -0.3, -1);
    group.add(railR);

    addAfterburner(group, -11.5, 1.0);

    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return group;
}

export function createAttackMesh(mainColor, wingColor) {
    // Use loaded 3D model if available
    if (loadedModels.attack) {
        const clone = loadedModels.attack.clone();
        clone.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
            }
        });
        return clone;
    }

    // Fallback: procedural geometry
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.6, roughness: 0.4 });
    const matWing = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.5, roughness: 0.5 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 0.95, roughness: 0.05, transparent: true, opacity: 0.4 });
    const matWeapon = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });

    // Wider fuselage
    const frontGeo = new THREE.CylinderGeometry(1.0, 1.5, 5, 12);
    frontGeo.rotateX(Math.PI / 2);
    const front = new THREE.Mesh(frontGeo, matBody);
    front.position.z = 4;
    group.add(front);

    const bodyGeo = new THREE.CylinderGeometry(1.5, 1.6, 9, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, matBody);
    body.position.z = -1.5;
    group.add(body);

    const rearGeo = new THREE.CylinderGeometry(1.6, 1.2, 4, 12);
    rearGeo.rotateX(Math.PI / 2);
    const rear = new THREE.Mesh(rearGeo, matBody);
    rear.position.z = -7.5;
    group.add(rear);

    // Shorter nose
    const noseGeo = new THREE.ConeGeometry(1.0, 3, 12);
    noseGeo.rotateX(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, matBody);
    nose.position.z = 8;
    group.add(nose);

    // Cockpit
    const canopyGeo = new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const canopy = new THREE.Mesh(canopyGeo, matGlass);
    canopy.position.set(0, 1.0, 2.5);
    canopy.scale.set(0.7, 0.6, 1.1);
    group.add(canopy);

    // Wide straight wings
    const wingGeo = new THREE.BoxGeometry(14, 0.15, 5);
    const leftWing = new THREE.Mesh(wingGeo, matWing);
    leftWing.position.set(-6, -0.2, -1);
    leftWing.rotation.y = -0.08;
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, matWing);
    rightWing.position.set(6, -0.2, -1);
    rightWing.rotation.y = 0.08;
    group.add(rightWing);

    // Weapon pods under wings
    const podGeo = new THREE.CylinderGeometry(0.4, 0.4, 3, 8);
    podGeo.rotateX(Math.PI / 2);
    [-7, 7, -4, 4].forEach(xPos => {
        const pod = new THREE.Mesh(podGeo, matWeapon);
        pod.position.set(xPos, -0.8, -1);
        group.add(pod);
    });

    // Single large vertical tail
    const vTailGeo = new THREE.BoxGeometry(0.15, 4, 3);
    const tail = new THREE.Mesh(vTailGeo, matWing);
    tail.position.set(0, 2.5, -7.5);
    tail.rotation.x = 0.12;
    group.add(tail);

    // H-stab
    const hStabGeo = new THREE.BoxGeometry(7, 0.12, 2.5);
    const hStab = new THREE.Mesh(hStabGeo, matWing);
    hStab.position.set(0, 0.3, -8.5);
    group.add(hStab);

    // Intakes (larger)
    const intakeGeo = new THREE.BoxGeometry(1.0, 1.0, 2.5);
    group.add(new THREE.Mesh(intakeGeo, matDark).translateX(-1.8).translateY(-0.5).translateZ(1.5));
    group.add(new THREE.Mesh(intakeGeo, matDark).translateX(1.8).translateY(-0.5).translateZ(1.5));

    // Nozzle
    const nozzleGeo = new THREE.CylinderGeometry(1.0, 0.7, 1.5, 12);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, matDark);
    nozzle.position.z = -10;
    group.add(nozzle);

    // === Nav Lights ===
    const navLightGeoSmall = new THREE.SphereGeometry(0.15, 6, 6);
    const matNavRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const matNavGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const matNavWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const navLeft = new THREE.Mesh(navLightGeoSmall, matNavRed);
    navLeft.position.set(-13, -0.1, -1);
    navLeft.name = 'navLightLeft';
    group.add(navLeft);
    const navRight = new THREE.Mesh(navLightGeoSmall, matNavGreen);
    navRight.position.set(13, -0.1, -1);
    navRight.name = 'navLightRight';
    group.add(navRight);
    const navTail = new THREE.Mesh(navLightGeoSmall, matNavWhite);
    navTail.position.set(0, 3.5, -9);
    navTail.name = 'navLightTail';
    group.add(navTail);

    // === Ailerons ===
    const aileronGeo = new THREE.BoxGeometry(3.5, 0.1, 1.0);
    const matAileron = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.5, roughness: 0.5 });
    const aileronL = new THREE.Mesh(aileronGeo, matAileron);
    aileronL.position.set(-11, -0.2, -3);
    group.add(aileronL);
    const aileronR = new THREE.Mesh(aileronGeo, matAileron);
    aileronR.position.set(11, -0.2, -3);
    group.add(aileronR);
    group.userData.aileronL = aileronL;
    group.userData.aileronR = aileronR;

    // === Fuselage stripe ===
    const stripeGeo = new THREE.BoxGeometry(0.05, 0.6, 5);
    const matStripe = new THREE.MeshBasicMaterial({ color: wingColor });
    const stripeL = new THREE.Mesh(stripeGeo, matStripe);
    stripeL.position.set(-1.55, 0.6, -1.5);
    group.add(stripeL);
    const stripeR = new THREE.Mesh(stripeGeo, matStripe);
    stripeR.position.set(1.55, 0.6, -1.5);
    group.add(stripeR);

    addAfterburner(group, -12, 1.2);

    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return group;
}

export function createBomberMesh(mainColor, wingColor) {
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.5, roughness: 0.5 });
    const matWing = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.5, roughness: 0.5 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 0.95, roughness: 0.05, transparent: true, opacity: 0.4 });

    // Large fuselage
    const frontGeo = new THREE.CylinderGeometry(1.2, 2.0, 6, 12);
    frontGeo.rotateX(Math.PI / 2);
    const front = new THREE.Mesh(frontGeo, matBody);
    front.position.z = 5;
    group.add(front);

    const bodyGeo = new THREE.CylinderGeometry(2.0, 2.2, 12, 12);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, matBody);
    body.position.z = -2;
    group.add(body);

    const rearGeo = new THREE.CylinderGeometry(2.2, 1.5, 5, 12);
    rearGeo.rotateX(Math.PI / 2);
    const rear = new THREE.Mesh(rearGeo, matBody);
    rear.position.z = -10;
    group.add(rear);

    // Blunt nose
    const noseGeo = new THREE.SphereGeometry(1.2, 12, 8);
    const nose = new THREE.Mesh(noseGeo, matBody);
    nose.position.z = 8;
    nose.scale.set(1, 1, 1.5);
    group.add(nose);

    // Cockpit (wide)
    const canopyGeo = new THREE.SphereGeometry(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const canopy = new THREE.Mesh(canopyGeo, matGlass);
    canopy.position.set(0, 1.3, 4);
    canopy.scale.set(0.8, 0.6, 1.0);
    group.add(canopy);

    // Very wide wings
    const wingGeo = new THREE.BoxGeometry(18, 0.2, 6);
    const leftWing = new THREE.Mesh(wingGeo, matWing);
    leftWing.position.set(-8, -0.3, -2);
    leftWing.rotation.y = -0.06;
    group.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, matWing);
    rightWing.position.set(8, -0.3, -2);
    rightWing.rotation.y = 0.06;
    group.add(rightWing);

    // Twin engine nacelles on wings
    const engineGeo = new THREE.CylinderGeometry(1.0, 1.0, 5, 12);
    engineGeo.rotateX(Math.PI / 2);
    [-6, 6].forEach(xPos => {
        const engine = new THREE.Mesh(engineGeo, matDark);
        engine.position.set(xPos, -0.8, -2);
        group.add(engine);

        // Engine intake ring
        const ringGeo = new THREE.TorusGeometry(1.0, 0.15, 8, 16);
        const ring = new THREE.Mesh(ringGeo, matBody);
        ring.position.set(xPos, -0.8, 0.5);
        group.add(ring);

        // Engine nozzle
        const nzGeo = new THREE.CylinderGeometry(0.8, 0.5, 1.0, 12);
        nzGeo.rotateX(Math.PI / 2);
        const nz = new THREE.Mesh(nzGeo, matDark);
        nz.position.set(xPos, -0.8, -5);
        group.add(nz);
    });

    // Bomb bay (belly detail)
    const bayGeo = new THREE.BoxGeometry(3, 0.8, 8);
    const bay = new THREE.Mesh(bayGeo, matDark);
    bay.position.set(0, -1.8, -2);
    group.add(bay);

    // Large single vertical tail
    const vTailGeo = new THREE.BoxGeometry(0.18, 5, 4);
    const tail = new THREE.Mesh(vTailGeo, matWing);
    tail.position.set(0, 3.5, -10);
    tail.rotation.x = 0.1;
    group.add(tail);

    // H-stab (large)
    const hStabGeo = new THREE.BoxGeometry(10, 0.15, 3);
    const hStab = new THREE.Mesh(hStabGeo, matWing);
    hStab.position.set(0, 0.5, -11);
    group.add(hStab);

    // Afterburners on both engines
    [-6, 6].forEach(xPos => {
        const fc = new THREE.ConeGeometry(0.35, 3, 8);
        fc.rotateX(-Math.PI / 2);
        const fmat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        const f = new THREE.Mesh(fc, fmat);
        f.position.set(xPos, -0.8, -7);
        if (xPos === -6) f.name = 'fireCore';
        group.add(f);

        const fo = new THREE.ConeGeometry(0.6, 4, 8);
        fo.rotateX(-Math.PI / 2);
        const fomat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.5 });
        const foMesh = new THREE.Mesh(fo, fomat);
        foMesh.position.set(xPos, -0.8, -7);
        if (xPos === -6) foMesh.name = 'fireOuter';
        group.add(foMesh);
    });

    // === Nav Lights ===
    const navLightGeoSmall = new THREE.SphereGeometry(0.2, 6, 6);
    const matNavRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const matNavGreen = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const matNavWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const navLeft = new THREE.Mesh(navLightGeoSmall, matNavRed);
    navLeft.position.set(-17, -0.1, -2);
    navLeft.name = 'navLightLeft';
    group.add(navLeft);
    const navRight = new THREE.Mesh(navLightGeoSmall, matNavGreen);
    navRight.position.set(17, -0.1, -2);
    navRight.name = 'navLightRight';
    group.add(navRight);
    const navTail = new THREE.Mesh(navLightGeoSmall, matNavWhite);
    navTail.position.set(0, 4.5, -12);
    navTail.name = 'navLightTail';
    group.add(navTail);

    // === Ailerons ===
    const aileronGeo = new THREE.BoxGeometry(4, 0.12, 1.2);
    const matAileron = new THREE.MeshStandardMaterial({ color: wingColor, metalness: 0.5, roughness: 0.5 });
    const aileronL = new THREE.Mesh(aileronGeo, matAileron);
    aileronL.position.set(-14, -0.3, -4);
    group.add(aileronL);
    const aileronR = new THREE.Mesh(aileronGeo, matAileron);
    aileronR.position.set(14, -0.3, -4);
    group.add(aileronR);
    group.userData.aileronL = aileronL;
    group.userData.aileronR = aileronR;

    // === Fuselage stripe ===
    const stripeGeo = new THREE.BoxGeometry(0.06, 0.8, 6);
    const matStripe = new THREE.MeshBasicMaterial({ color: wingColor });
    const stripeL = new THREE.Mesh(stripeGeo, matStripe);
    stripeL.position.set(-2.05, 0.8, -2);
    group.add(stripeL);
    const stripeR = new THREE.Mesh(stripeGeo, matStripe);
    stripeR.position.set(2.05, 0.8, -2);
    group.add(stripeR);

    group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return group;
}

export function createJetMesh(mainColor, wingColor, modelType) {
    if (modelType === 'attack') return createAttackMesh(mainColor, wingColor);
    if (modelType === 'bomber') return createBomberMesh(mainColor, wingColor);
    return createFighterMesh(mainColor, wingColor); // default fighter
}

export function createAntiAirMesh() {
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.5, roughness: 0.6 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
    const matAccent = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.4, roughness: 0.5 });

    // Truck base
    const baseGeo = new THREE.BoxGeometry(4, 2, 7);
    const base = new THREE.Mesh(baseGeo, matBody);
    base.position.y = 1.5;
    base.castShadow = true;
    group.add(base);

    // Wheels (4) - Low Poly
    const wheelGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    [[-2.2, 0.5, 2], [2.2, 0.5, 2], [-2.2, 0.5, -2], [2.2, 0.5, -2]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(...pos);
        wheel.castShadow = true;
        group.add(wheel);
    });

    // Turret Base
    const turretGroup = new THREE.Group();
    turretGroup.position.set(0, 2.5, 0);
    group.add(turretGroup);

    const turretBase = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 3), matDark);
    turretBase.castShadow = true;
    turretGroup.add(turretBase);

    // Guns (Twin Barrels)
    const barrelGeo = new THREE.CylinderGeometry(0.15, 0.15, 5, 5);
    barrelGeo.rotateX(Math.PI / 2); // Point Z
    const barrel1 = new THREE.Mesh(barrelGeo, matDark);
    barrel1.position.set(-0.6, 0.5, 2.5);
    barrel1.castShadow = true;
    turretGroup.add(barrel1);

    const barrel2 = new THREE.Mesh(barrelGeo, matDark);
    barrel2.position.set(0.6, 0.5, 2.5);
    barrel2.castShadow = true;
    turretGroup.add(barrel2);

    // Muzzle Flash (Hidden initially)
    const flashGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(0, 0.5, 5.5);
    flash.name = 'muzzleFlash';
    turretGroup.add(flash);

    // Radar dish
    const dishGeo = new THREE.CylinderGeometry(0.8, 0.1, 0.5, 8);
    dishGeo.rotateX(Math.PI / 2);
    const dish = new THREE.Mesh(dishGeo, matAccent);
    dish.position.set(0, 1.5, -1);
    dish.rotation.x = -Math.PI / 4;
    turretGroup.add(dish);

    // Warning light
    const warnGeo = new THREE.SphereGeometry(0.2, 4, 4);
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const warn = new THREE.Mesh(warnGeo, warnMat);
    warn.position.set(0, 2.0, -1);
    warn.name = 'warnLight';
    turretGroup.add(warn);

    group.userData.turret = turretGroup;
    return group;
}

export function createMissileMesh(color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.3 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8), bodyMat);
    body.rotateX(Math.PI / 2);
    group.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.5, 8), bodyMat);
    nose.rotateX(Math.PI / 2);
    nose.position.z = 1.0;
    group.add(nose);

    const finGeo = new THREE.BoxGeometry(0.8, 0.05, 0.4);
    const fins1 = new THREE.Mesh(finGeo, finMat);
    fins1.position.z = -0.5;
    group.add(fins1);

    const fins2 = new THREE.Mesh(finGeo, finMat);
    fins2.position.z = -0.5;
    fins2.rotation.z = Math.PI / 2;
    group.add(fins2);

    const thruster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.05, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffaa00 })
    );
    thruster.rotateX(Math.PI / 2);
    thruster.position.z = -0.8;
    group.add(thruster);

    return group;
}

export function createBulletMesh(color, isHeavy = false) {
    const group = new THREE.Group();
    // Brighter color (Yellow/Orange)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

    if (isHeavy) {
        // === HEAVY BULLET (Attack / Bomber) - Large & Glow ===
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.0, 6), mat);
        body.rotateX(Math.PI / 2);
        group.add(body);

        const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), tipMat);
        tip.position.z = 3.2;
        group.add(tip);

        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.4,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 8.0, 8), glowMat);
        glow.rotateX(Math.PI / 2);
        group.add(glow);
    } else {
        // === STANDARD BULLET (Fighter) - Small ===
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.0, 6), mat);
        body.rotateX(Math.PI / 2);
        group.add(body);

        const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), tipMat);
        tip.position.z = 1.6;
        group.add(tip);
    }

    return group;
}

export function createBombMesh() {
    const group = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    const matFin = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.4, roughness: 0.6 });
    const matStripe = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.3,
        roughness: 0.5,
        emissive: 0xff0000,
        emissiveIntensity: 0.8
    });

    // Main bomb body (fat cylinder)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.5, 10), matBody);
    body.rotateX(Math.PI / 2);
    group.add(body);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), matBody);
    nose.position.z = 1.25;
    nose.scale.set(1, 1, 0.8);
    group.add(nose);

    // Red stripe
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 10), matStripe);
    stripe.rotateX(Math.PI / 2);
    stripe.position.z = 0.5;
    group.add(stripe);

    // Tail fins (4x cross pattern)
    const finGeo = new THREE.BoxGeometry(1.2, 0.05, 0.6);
    const fin1 = new THREE.Mesh(finGeo, matFin);
    fin1.position.z = -1.3;
    group.add(fin1);

    const fin2 = new THREE.Mesh(finGeo, matFin);
    fin2.position.z = -1.3;
    fin2.rotation.z = Math.PI / 2;
    group.add(fin2);

    // Tail ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 12), matFin);
    ring.position.z = -1.25;
    group.add(ring);

    // Blinking Light (Red)
    const lightGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.z = -1.5;
    light.name = 'bombLight';
    group.add(light);

    return group;
}

export function createBombSight() {
    const group = new THREE.Group();
    // Red Ring
    const ringGeo = new THREE.RingGeometry(2, 2.5, 32);
    ringGeo.rotateX(-Math.PI / 2); // Flat on ground initially? 
    // Actually rotateX(-PI/2) makes it flat on XZ plane if standard Cylinder logic applies. 
    // RingGeometry is in XY plane by default. So rotateX(-PI/2) puts it on XZ. Correct.
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Inner Cross
    const crossGeo = new THREE.PlaneGeometry(4, 0.4);
    crossGeo.rotateX(-Math.PI / 2);
    const cross1 = new THREE.Mesh(crossGeo, ringMat);
    group.add(cross1);

    const cross2 = new THREE.Mesh(crossGeo, ringMat);
    cross2.rotation.y = Math.PI / 2;
    group.add(cross2);

    return group;
}
