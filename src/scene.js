import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createCarAudio } from './audio.js';

const PINK = 0xff0d87;
const BLUE = 0x086cff;
const CAR_BLACK = 0x09090d;
const ASSET_BASE = import.meta.env.BASE_URL;
// Only objects on this layer are lit by the sun, so the skyline catches the
// sunset while the road and the car stay in neon darkness.
const SUN_LAYER = 1;
// The palms sit on their own layer instead, reached by a single dim light, so
// they read as near-black silhouettes without their material being altered.
const PALM_LAYER = 2;

const cameraPresets = {
  hero: { position: new THREE.Vector3(8.3, 2.5, 9.5), target: new THREE.Vector3(0.25, 0.7, 0.15) },
  front: { position: new THREE.Vector3(0.1, 1.85, 10.2), target: new THREE.Vector3(0, 0.68, 0.8) },
  side: { position: new THREE.Vector3(10.2, 1.95, 0.2), target: new THREE.Vector3(0, 0.68, 0) },
  rear: { position: new THREE.Vector3(-0.1, 1.85, -10.1), target: new THREE.Vector3(0, 0.68, -0.7) },
  top: { position: new THREE.Vector3(0.1, 10.7, 0.9), target: new THREE.Vector3(0, 0.25, 0) },
};

function mat(options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0x030306,
    metalness: 0.72,
    roughness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.3,
    ...options,
  });
}

function wedgeGeometry(front, back) {
  const vertices = new Float32Array([
    -front.w / 2, front.y0, front.z, front.w / 2, front.y0, front.z, front.w / 2, front.y1, front.z, -front.w / 2, front.y1, front.z,
    -back.w / 2, back.y0, back.z, back.w / 2, back.y0, back.z, back.w / 2, back.y1, back.z, -back.w / 2, back.y1, back.z,
  ]);
  const indices = [
    0, 1, 2, 0, 2, 3, 5, 4, 7, 5, 7, 6,
    4, 0, 3, 4, 3, 7, 1, 5, 6, 1, 6, 2,
    3, 2, 6, 3, 6, 7, 4, 5, 1, 4, 1, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addEdges(mesh, color = PINK, opacity = 0.42, threshold = 22) {
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, threshold),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false }),
  );
  line.position.set(0, 0, 0);
  mesh.add(line);
  return line;
}

function addBox(group, name, size, position, material, rotation = [0, 0, 0], edges = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (edges) addEdges(mesh, edges === 'blue' ? BLUE : PINK, 0.34);
  return mesh;
}

function addWedge(group, name, front, back, material, edges = true) {
  const mesh = new THREE.Mesh(wedgeGeometry(front, back), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (edges) addEdges(mesh, edges === 'blue' ? BLUE : PINK, 0.36);
  return mesh;
}

function createGlowPanel(width, height, color, intensity = 8) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, height + 0.12, 0.11), mat({ color: 0x050508, roughness: 0.35 }));
  group.add(frame);
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.075),
    new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.22, toneMapped: false }),
  );
  lens.position.z = 0.085;
  group.add(lens);
  for (let i = 1; i < 6; i += 1) {
    const divider = new THREE.Mesh(new THREE.BoxGeometry(0.012, height * 0.9, 0.02), new THREE.MeshBasicMaterial({ color: 0x25000f }));
    divider.position.set(-width / 2 + (width / 6) * i, 0, 0.13);
    group.add(divider);
  }
  return { group, lens };
}

function addSequentialTailSegments(tail, side, baseColor) {
  const segments = [];
  for (let i = 0; i < 6; i += 1) {
    const material = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: 2.7,
      roughness: 0.26,
      clearcoat: 0.8,
      toneMapped: false,
    });
    const segment = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.235, 0.038), material);
    segment.position.set(-0.3 + i * 0.12, 0, 0.142);
    segment.userData.sequenceIndex = side < 0 ? i : 5 - i;
    segment.userData.baseColor = baseColor;
    tail.group.add(segment);
    segments.push(segment);
  }
  segments.sort((a, b) => a.userData.sequenceIndex - b.userData.sequenceIndex);
  return { segments, side };
}

function createWheel(side, z, materials) {
  const wheel = new THREE.Group();
  wheel.position.set(side * 1.2, 0.653, z);

  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.14, 18, 64), materials.tire);
  tire.rotation.y = Math.PI / 2;
  tire.scale.z = 1.7;
  tire.castShadow = true;
  wheel.add(tire);
  const sidewallOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.535, 0.289, 48), materials.tireSide);
  sidewallOuter.rotation.z = Math.PI / 2;
  wheel.add(sidewallOuter);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.365, 0.365, 0.34, 48), materials.rim);
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.3655, 48), materials.brake);
  brake.rotation.z = Math.PI / 2;
  wheel.add(brake);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.408, 32), materials.hub);
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);

  const outward = side > 0 ? 0.22 : -0.22;
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.061, 0.051, 16), materials.hole);
    hole.rotation.z = Math.PI / 2;
    hole.position.set(outward, Math.cos(angle) * 0.225, Math.sin(angle) * 0.225);
    wheel.add(hole);
  }
  for (let i = 0; i < 30; i += 1) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.357, 0.014, 0.055), materials.tread);
    const a = (i / 30) * Math.PI * 2;
    tread.position.set(0, Math.cos(a) * 0.645, Math.sin(a) * 0.645);
    tread.rotation.x = -a;
    wheel.add(tread);
  }
  return wheel;
}

function createWheelArch(side, z, materials) {
  const shape = new THREE.Shape();
  const archRadius = 0.70;
  const outerRadius = 0.757;
  shape.moveTo(outerRadius, -0.055);
  for (let i = 1; i <= 20; i += 1) {
    const angle = (i / 20) * Math.PI;
    shape.lineTo(Math.cos(angle) * outerRadius, Math.sin(angle) * outerRadius - 0.055);
  }
  shape.lineTo(-archRadius, 0);
  for (let i = 19; i >= 0; i -= 1) {
    const angle = (i / 20) * Math.PI;
    shape.lineTo(Math.cos(angle) * archRadius, Math.sin(angle) * archRadius);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.288,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -0.144);
  const arch = new THREE.Mesh(geometry, materials.body);
  arch.name = z > 0 ? 'front-wheel-arch' : 'rear-wheel-arch';
  arch.position.set(side * 1.12, 0.653, z);
  arch.rotation.y = Math.PI / 2;
  arch.castShadow = true;
  arch.receiveShadow = true;
  addEdges(arch, side > 0 ? BLUE : PINK, 0.34, 18);

  const well = new THREE.Mesh(
    new THREE.CircleGeometry(0.69, 40),
    new THREE.MeshStandardMaterial({ color: 0x010103, roughness: 1, metalness: 0 }),
  );
  well.name = 'wheel-well';
  well.position.set(side * 1.025, 0.653, z);
  well.rotation.y = Math.PI / 2;
  return { arch, well };
}

function createSeat(materials, side) {
  const seat = new THREE.Group();
  seat.position.set(side * 0.48, 0.72, -0.25);
  const base = addBox(seat, 'seat-base', [0.55, 0.18, 0.76], [0, 0, 0], materials.interior, [-0.08, 0, 0]);
  const back = addBox(seat, 'seat-back', [0.57, 0.76, 0.18], [0, 0.34, -0.33], materials.interior, [-0.18, 0, 0]);
  const head = addBox(seat, 'headrest', [0.38, 0.28, 0.18], [0, 0.78, -0.44], materials.interior);
  [base, back, head].forEach((piece) => addEdges(piece, 0x521134, 0.28, 20));
  return seat;
}

function createLicensePlate() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05050a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ff168e';
  ctx.lineWidth = 9;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = '#ff50ae';
  ctx.textAlign = 'center';
  ctx.font = '600 34px monospace';
  ctx.fillText('MIAMI', 256, 64);
  ctx.font = '700 86px monospace';
  ctx.fillText('SUNSET', 256, 166);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.215), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
}

function createBackfire() {
  const group = new THREE.Group();
  group.name = 'exhaust-backfire';
  group.visible = false;

  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4a00,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xd9f4ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sparks = [];

  [-0.58, -0.3, 0.3, 0.58].forEach((x, pipeIndex) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 12, 1, true), flameMaterial.clone());
    flame.position.set(x, 0.38, -4.13);
    flame.rotation.x = -Math.PI / 2;
    flame.scale.set(1, 0.35, 1);
    group.add(flame);

    const core = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.58, 10, 1, true), coreMaterial.clone());
    core.position.set(x, 0.38, -3.98);
    core.rotation.x = -Math.PI / 2;
    core.scale.set(1, 0.3, 1);
    group.add(core);

    for (let i = 0; i < 5; i += 1) {
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + (i % 2) * 0.008, 6, 6),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb000 : 0xff2c00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      spark.userData = {
        origin: new THREE.Vector3(x, 0.38, -3.82),
        velocity: new THREE.Vector3((i - 2) * 0.09 + (pipeIndex - 1.5) * 0.015, (i % 3 - 1) * 0.13, -1.3 - i * 0.12),
      };
      spark.position.copy(spark.userData.origin);
      group.add(spark);
      sparks.push(spark);
    }
  });

  const light = new THREE.PointLight(0xff4a00, 0, 5.5, 2);
  light.position.set(0, 0.38, -4.05);
  group.add(light);
  return { group, flames: group.children.filter((child) => child.isMesh && child.geometry.type === 'ConeGeometry'), sparks, light };
}

// Neon cannon. A bolt is a stretched additive core inside a softer halo, so it
// reads as a light source without costing a real one, and bloom does the rest.
const SHOT_POOL_SIZE = 8;
const SHOT_COLOR = 0x35f5ff;
// World units per second, in the player-relative frame the traffic lives in.
// Slow enough that the bolt is legible for several frames on its way out.
const SHOT_SPEED = 200;
const SHOT_COOLDOWN = 0.38;
const SHOT_MUZZLE_Z = 4.1;
const SHOT_MAX_Z = 200;
// Summed half-extents of a bolt and a traffic car, so a bolt that visually
// overlaps a body counts as a strike.
const SHOT_HIT_HALF_X = 1.35;
const SHOT_HIT_HALF_Z = 3.4;

function createNeonShots(scene) {
  const group = new THREE.Group();
  group.name = 'neon-shots';
  // Long and thick enough that the bolt reads as an unbroken streak: at full
  // speed it advances a little over three units a frame, so a shorter tracer
  // would leave visible gaps between frames.
  const coreGeometry = new THREE.CylinderGeometry(0.16, 0.16, 7, 10);
  coreGeometry.rotateX(Math.PI / 2);
  const haloGeometry = new THREE.CylinderGeometry(0.52, 0.3, 9, 12, 1, true);
  haloGeometry.rotateX(Math.PI / 2);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xeaffff, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: SHOT_COLOR, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const slots = [];
  for (let i = 0; i < SHOT_POOL_SIZE; i += 1) {
    const bolt = new THREE.Group();
    bolt.add(new THREE.Mesh(coreGeometry, coreMaterial), new THREE.Mesh(haloGeometry, haloMaterial));
    bolt.visible = false;
    group.add(bolt);
    slots.push({ mesh: bolt, active: false, x: 0, z: 0 });
  }
  scene.add(group);
  return { group, slots };
}

// Expanding ring left where a bolt connects.
const BURST_POOL_SIZE = 5;
const BURST_SECONDS = 0.42;

function createImpactBursts(scene) {
  const group = new THREE.Group();
  group.name = 'neon-bursts';
  const geometry = new THREE.RingGeometry(0.45, 0.72, 24);
  const slots = [];
  for (let i = 0; i < BURST_POOL_SIZE; i += 1) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: SHOT_COLOR,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    mesh.visible = false;
    group.add(mesh);
    slots.push({ mesh, active: false, time: 0, scale: 1, seconds: BURST_SECONDS, growth: 5.5 });
  }
  scene.add(group);
  return { group, slots };
}

// White speed streaks that tear past the car once it is pinned at max speed.
// One LineSegments object, so the whole effect is a single draw call.
const WIND_STREAKS = 56;
const WIND_START_Z = 26;
const WIND_END_Z = -26;

function createWind() {
  const positions = new Float32Array(WIND_STREAKS * 6);
  const streaks = [];
  for (let i = 0; i < WIND_STREAKS; i += 1) {
    streaks.push({
      x: 0,
      y: 0,
      z: 0,
      length: 0,
      speed: 0,
      // Staggered so they do not all restart on the same frame.
      offset: i / WIND_STREAKS,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return { lines, streaks, positions, geometry };
}

function createCar() {
  const car = new THREE.Group();
  car.name = 'Neon Countach';
  car.position.y = 0.02;
  const materials = {
    // The skyline sun never reaches layer 0, and these restrained environment
    // values remove the residual white centre glare while preserving neon rims.
    body: mat({ envMapIntensity: 0.025, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.42 }),
    bodyAlt: mat({ color: 0x0d0b12, roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.42, envMapIntensity: 0.025 }),
    carbon: mat({ color: 0x030305, roughness: 0.4, clearcoat: 0.45, envMapIntensity: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x02040a, metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.76, clearcoat: 1, envMapIntensity: 0.4 }),
    interior: mat({ color: 0x08060a, roughness: 0.7, metalness: 0.05 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x070709, roughness: 0.9, metalness: 0.05 }),
    tireSide: new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.82 }),
    tread: new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 1 }),
    rim: mat({ color: 0x15131a, metalness: 1, roughness: 0.2 }),
    brake: mat({ color: 0x4a4148, metalness: 0.95, roughness: 0.32 }),
    hub: mat({ color: 0x08080c, roughness: 0.2 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x010102 }),
    seam: new THREE.MeshBasicMaterial({ color: 0x19040f }),
    chrome: mat({ color: 0x89828a, metalness: 1, roughness: 0.12 }),
  };

  addWedge(car, 'lower-chassis', { z: 3.55, w: 2.18, y0: 0.42, y1: 0.73 }, { z: -3.38, w: 2.45, y0: 0.42, y1: 0.82 }, materials.body, 'blue');
  addWedge(car, 'front-nose', { z: 3.72, w: 1.72, y0: 0.55, y1: 0.72 }, { z: 1.72, w: 2.25, y0: 0.55, y1: 1.08 }, materials.body);
  addWedge(car, 'hood', { z: 3.45, w: 1.7, y0: 0.72, y1: 0.76 }, { z: 0.94, w: 1.88, y0: 1.06, y1: 1.13 }, materials.bodyAlt);
  addWedge(car, 'center-body', { z: 1.62, w: 2.18, y0: 0.67, y1: 1.08 }, { z: -2.12, w: 2.28, y0: 0.68, y1: 1.22 }, materials.bodyAlt);
  addWedge(car, 'rear-deck', { z: -0.92, w: 1.86, y0: 1.08, y1: 1.2 }, { z: -3.5, w: 2.18, y0: 0.72, y1: 1.04 }, materials.bodyAlt, 'blue');

  [-1, 1].forEach((side) => {
    addBox(car, 'side-skirt', [0.2, 0.24, 3.7], [side * 1.18, 0.5, -0.18], materials.carbon, [0, 0, 0], side > 0 ? 'blue' : true);
    addBox(car, 'front-splitter', [0.22, 0.12, 1.24], [side * 0.92, 0.45, 3.26], materials.carbon, [0, side * 0.09, 0], side > 0 ? 'blue' : true);
    addBox(car, 'rear-diffuser', [0.22, 0.12, 0.72], [side * 0.95, 0.43, -3.2], materials.carbon, [0.06, side * -0.12, 0], side > 0 ? 'blue' : true);
  });

  addWedge(car, 'cabin-core', { z: 1.02, w: 1.68, y0: 1.04, y1: 1.23 }, { z: -1.38, w: 1.52, y0: 1.06, y1: 1.62 }, materials.interior, false);
  addWedge(car, 'roof', { z: 0.35, w: 1.45, y0: 1.58, y1: 1.65 }, { z: -1.16, w: 1.34, y0: 1.58, y1: 1.67 }, materials.bodyAlt);
  const windshield = addWedge(car, 'windshield', { z: 1.08, w: 1.63, y0: 1.12, y1: 1.18 }, { z: 0.3, w: 1.44, y0: 1.55, y1: 1.62 }, materials.glass, true);
  windshield.renderOrder = 2;
  addWedge(car, 'rear-window', { z: -1.18, w: 1.34, y0: 1.55, y1: 1.62 }, { z: -2.02, w: 1.65, y0: 1.2, y1: 1.26 }, materials.glass, 'blue');

  car.add(createSeat(materials, -1), createSeat(materials, 1));
  addBox(car, 'dashboard', [1.48, 0.2, 0.38], [0, 1.18, 0.64], materials.interior, [-0.12, 0, 0]);
  addBox(car, 'left-wiper', [0.56, 0.018, 0.025], [-0.3, 1.18, 1.01], materials.carbon, [0.02, -0.18, 0]);
  addBox(car, 'right-wiper', [0.5, 0.018, 0.025], [0.28, 1.18, 1.01], materials.carbon, [0.02, 0.2, 0]);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 30), materials.interior);
  steering.position.set(-0.46, 1.34, 0.39);
  steering.rotation.x = Math.PI / 2 + 0.35;
  car.add(steering);
  addBox(car, 'console', [0.22, 0.25, 1.12], [0, 0.91, -0.05], materials.interior, [-0.06, 0, 0]);

  [-1, 1].forEach((side) => {
    addBox(car, 'b-pillar', [0.12, 0.54, 0.13], [side * 0.72, 1.35, -1.03], materials.body, [side * -0.09, 0, side * -0.08], true);

    const mirror = addWedge(car, 'mirror', { z: 1.06, w: 0.2, y0: 1.29, y1: 1.43 }, { z: 0.72, w: 0.36, y0: 1.3, y1: 1.45 }, materials.body, side > 0 ? 'blue' : true);
    mirror.position.x = side * 1.07;
  });

  const wheels = [];
  [2.28, -2.27].forEach((z) => {
    [-1, 1].forEach((side) => {
      const wheel = createWheel(side, z, materials);
      // Front wheels steer, so yaw must be applied before the rolling spin.
      if (z > 0) wheel.rotation.order = 'YXZ';
      car.add(wheel);
      wheels.push(wheel);
      const wheelArch = createWheelArch(side, z, materials);
      car.add(wheelArch.well, wheelArch.arch);
      const archPath = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.1, -0.72),
        new THREE.Vector3(0, 0.43, -0.55),
        new THREE.Vector3(0, 0.70, 0),
        new THREE.Vector3(0, 0.43, 0.55),
        new THREE.Vector3(0, -0.1, 0.72),
      ], false, 'catmullrom', 0.18);
      const brow = new THREE.Mesh(new THREE.TubeGeometry(archPath, 32, 0.063, 8, false), materials.body);
      brow.position.set(side * 1.215, 0.653, z);
      car.add(brow);
    });
  });

  const lightMeshes = [];
  const indicators = [];
  [-1, 1].forEach((side) => {
    addBox(car, 'headlight-pod', [0.77, 0.16, 0.58], [side * 0.62, 0.98, 2.42], materials.bodyAlt, [-0.08, 0, 0], true);
    const headlight = createGlowPanel(0.65, 0.2, side > 0 ? 0xff68d3 : 0xffd9ef, 9);
    headlight.group.position.set(side * 0.64, 0.83, 3.18);
    car.add(headlight.group);
    lightMeshes.push(headlight.lens);
    const fog = createGlowPanel(0.38, 0.12, side > 0 ? 0xff164e : 0xff3c7c, 6);
    fog.group.position.set(side * 0.77, 0.56, 3.56);
    car.add(fog.group);
    lightMeshes.push(fog.lens);
    const marker = createGlowPanel(0.16, 0.08, 0xff6a26, 4);
    marker.group.position.set(side * 1.03, 0.74, 2.84);
    marker.group.rotation.y = side * 0.25;
    car.add(marker.group);
    lightMeshes.push(marker.lens);
  });

  addBox(car, 'rear-fascia', [1.98, 0.7, 0.18], [0, 0.83, -3.4], materials.carbon, [0.03, 0, 0], 'blue');
  [-1, 1].forEach((side) => {
    const baseColor = side < 0 ? 0xff102d : 0xff184f;
    const tail = createGlowPanel(0.72, 0.27, baseColor, 6.5);
    tail.group.position.set(side * 0.67, 0.9, -3.52);
    tail.group.rotation.y = Math.PI;
    car.add(tail.group);
    lightMeshes.push(tail.lens);
    indicators.push(addSequentialTailSegments(tail, side, baseColor));
  });
  for (let i = 0; i < 4; i += 1) addBox(car, 'rear-grille-slat', [0.88, 0.035, 0.04], [0, 0.71 + i * 0.1, -3.52], materials.seam);
  const plate = createLicensePlate();
  plate.position.set(0, 0.59, -3.57);
  plate.rotation.y = Math.PI;
  car.add(plate);

  [-0.58, -0.3, 0.3, 0.58].forEach((x) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.38, 24, 1, true), materials.chrome);
    pipe.position.set(x, 0.38, -3.49);
    pipe.rotation.x = Math.PI / 2;
    car.add(pipe);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.073, 24), new THREE.MeshBasicMaterial({ color: 0x010101 }));
    inner.position.set(x, 0.38, -3.69);
    inner.rotation.y = Math.PI;
    car.add(inner);
  });

  for (let i = 0; i < 7; i += 1) addBox(car, 'engine-louver', [1.46, 0.07, 0.2], [0, 1.24 - i * 0.028, -1.62 - i * 0.25], materials.carbon, [-0.11, 0, 0], i % 2 ? 'blue' : true);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 5; i += 1) addBox(car, 'side-vent', [0.12, 0.07, 0.43], [side * (0.82 + i * 0.055), 1.21, -2.06 - i * 0.08], materials.carbon, [-0.1, side * 0.14, 0]);
  });

  addBox(car, 'front-bumper', [1.52, 0.14, 0.16], [0, 0.48, 3.69], materials.carbon, [0, 0, 0], true);
  [-1, 1].forEach((side) => addBox(car, 'bumper-wing', [0.64, 0.15, 0.42], [side * 0.89, 0.45, 3.43], materials.carbon, [0, side * -0.05, side * -0.02], side > 0 ? 'blue' : true));
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.09, 3), new THREE.MeshPhysicalMaterial({ color: 0xd2a340, metalness: 0.85, roughness: 0.22 }));
  badge.position.set(0, 0.925, 3.31);
  car.add(badge);

  const underGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.8, 9.4),
    new THREE.MeshBasicMaterial({ color: 0xff006e, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  underGlow.rotation.x = -Math.PI / 2;
  underGlow.position.y = 0.032;

  const backfire = createBackfire();
  car.add(backfire.group);

  return { car, wheels, lightMeshes, backfire, indicators, underGlow };
}

const ROAD_HALF_WIDTH = 7.4;
const ROAD_LENGTH = 420;
const ROAD_NEAR_Z = -90;
const ROAD_TAPER_Z = 55;
const ROAD_FAR_Z = ROAD_NEAR_Z + ROAD_LENGTH;
// The road keeps a narrow neck beyond the vanishing point instead of ending
// in a literal triangle. Perspective supplies most of the convergence; this
// extra taper makes the distant silhouette read clearly at every aspect ratio.
const ROAD_FAR_HALF_WIDTH = 0.78;
// Ten cells across the 14.8-wide road, and rungs at the same pitch along it,
// so the neon grid reads as squares.
const GRID_COLUMNS = 10;
const GRID_CELL = (ROAD_HALF_WIDTH * 2) / GRID_COLUMNS;
// Half-widths of a grid line as a fraction of one cell: the over-exposed core,
// the solid shoulder around it, and where the glow reaches nothing. Expressed
// against the cell so both grid axes stay identical.
const GRID_LINE_CORE = 0.0038;
const GRID_LINE_SOLID = 0.0155;
const GRID_LINE_GLOW = 0.0312;
// World units travelled per km/h per second. Sets how fast the track rushes
// past for a given speedometer reading.
const WORLD_SCALE = 0.44;
const LANES = [-4.6, -1.55, 1.55, 4.6];
const MAX_PLAYER_SPEED = 220;
// Traffic tops out well below the player. At 98% of our own maximum nothing
// could ever be caught, so the road ahead was effectively uncollidable.
const MAX_TRAFFIC_SPEED = MAX_PLAYER_SPEED * 0.78;
const TRAFFIC_POOL_SIZE = 32;
const TRAFFIC_MAX_ACTIVE = 22;
// Traffic lives on a z corridor that straddles the chase camera (z = -10.4):
// cars fade in far ahead, or slip in behind the camera and overtake us.
const TRAFFIC_SPAWN_Z = 168;
const TRAFFIC_BEHIND_Z = -58;
const TRAFFIC_DESPAWN_Z = -96;
const TRAFFIC_FORWARD_LIMIT = 230;
// Spawns at z below this are close enough to be unavoidable, so they must keep
// clear of the lane the player is sitting in.
const TRAFFIC_SAFE_ZONE = 60;
// A hair wider than the 2.4 collision half-width, so a "safe" lane really is.
const TRAFFIC_LANE_CLEARANCE = 2.6;
const TRAFFIC_SEED_COUNT = 20;
// Summed half-extents of the two bodies, so an overlap on both axes is a real
// contact. The player is 2.9 x 7.4, a traffic car 1.9 x 4.2.
const HIT_HALF_X = 2.4;
const HIT_HALF_Z = 5.8;
// Traffic-to-traffic uses two of the smaller body.
const CAR_HALF_X = 0.95;
const CAR_HALF_Z = 2.1;
// The solver settles resting bodies at exactly their summed half-extents, so a
// queue of cars sitting bumper to bumper lands a few thousandths inside a strict
// comparison. Only a gap smaller than this counts as real interpenetration.
const CONTACT_EPSILON = 0.02;
// How hard a contact throws the bodies apart sideways, and how much closing
// speed a rear-end hand over along the road.
const SIDE_IMPULSE = 7.2;
const REAR_IMPULSE = 0.55;
const LATERAL_DAMPING = 3.4;
const LANE_CHANGE_SPEED = 4.4;
const LANE_CHANGE_COOLDOWN = 2.4;
const LANE_CLEAR_AHEAD = 13;
const LANE_CLEAR_BEHIND = 10;

// Lanes the player is not currently occupying. LANES spans 9.2 units, so with a
// 2.6 clearance at least two lanes always survive the filter.
function safeLanes(x) {
  return LANES.filter((lane) => Math.abs(lane - x) > TRAFFIC_LANE_CLEARANCE);
}

function createTraffic(scene) {
  const group = new THREE.Group();
  group.name = 'traffic';
  const geometry = new THREE.BoxGeometry(1.9, 1.3, 4.2);
  const palette = [0x1de5ff, 0xffb020, 0x9d4bff, 0x28ff9b, 0xff4f7d];
  const slots = [];
  for (let i = 0; i < TRAFFIC_POOL_SIZE; i += 1) {
    const color = palette[i % palette.length];
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.2 }),
    );
    mesh.castShadow = true;
    mesh.visible = false;
    addEdges(mesh, 0xffffff, 0.3, 18);
    group.add(mesh);
    slots.push({
      mesh,
      active: false,
      speed: 0,
      cruiseSpeed: 0,
      hit: false,
      x: 0,
      vx: 0,
      lane: 0,
      targetLane: 0,
      laneChanging: false,
      laneChangeCooldown: 0,
      taper: 1,
      // Set once a neon bolt connects: the car leaves the AI entirely and flies
      // a ballistic arc off the track instead.
      launched: false,
      launchVy: 0,
      launchVx: 0,
      spin: new THREE.Vector3(),
    });
  }
  scene.add(group);
  return { group, slots };
}

// Both rings are sized so their wrap span just outruns the camera's 260-unit
// far plane. Anything further only ever renders inside solid fog, and these are
// detailed meshes rather than the boxes they replaced, so the extra instances
// would be pure cost.
// Spread wider rather than multiplied: the same 44 detailed palms now cover a
// 528-unit ring, so a recycled palm reappears deep in the fog like the towers do
// without adding the triangles another 16 clones would cost.
const PALM_SPACING = 24;
const PALM_PER_SIDE = 22;
// How far ahead scenery stays renderable. Everything is recycled inside a ring
// long enough that the wrap always lands beyond this, deep inside solid fog.
const SCENERY_FAR_VISIBLE = 780;
// Deterministic scatter: the scenery must look random but rebuild identically,
// and seeding off the instance index keeps it dependency-free.
function scatter(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Static props merged into a handful of z-slices. One slice is one draw call
// and wraps on its own, so a field of hundreds of pieces stays cheap.
function addScatterBlocks(scene, items, {
  blocks, blockLength, material, layer, kind, startZ = 20, buildBlock,
}) {
  const span = blocks * blockLength;
  for (let index = 0; index < blocks; index += 1) {
    const parts = buildBlock(index);
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts), material);
    parts.forEach((part) => part.dispose());
    mesh.position.z = index * blockLength + startZ;
    if (layer !== undefined) mesh.layers.set(layer);
    scene.add(mesh);
    items.push({ mesh, span, kind });
  }
}
// The ring has to be long enough that a recycled building re-enters the world
// far beyond the fog rather than a few seconds ahead of the bumper. Spacing
// carries that distance rather than instance count: 16 per side over a 672-unit
// ring puts a wrapped tower back at z ~ 600, where the fog is still solid, and
// the merged box LODs behind it keep the skyline from reading as sparse.
const BUILDING_SPACING = 42;
const BUILDING_PER_SIDE = 16;
const BUILDING_START_Z = 60;
// The GLB is a ~2.2 x 3.25 x 2.2 unit block, so it needs a uniform blow-up
// before the per-instance vertical stretch turns it into a skyline tower.
const BUILDING_BASE_SCALE = 4;

function populatePalms(scene, template, items) {
  // The palms are pure black cut-outs. Lighting alone left the baseColor texture
  // showing through wherever bloom or the environment caught a frond, so the
  // texture is dropped outright and the material forced to black. The GLB on
  // disk is untouched — only the runtime clone is retinted.
  template.traverse((node) => {
    if (!node.isMesh) return;
    const source = node.material;
    // The map is kept only for its alpha, which is what cuts the fronds out of
    // their quads; black times any texel is still black, so no colour survives.
    node.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: source.map ?? null,
      alphaMap: source.alphaMap ?? null,
      transparent: source.transparent,
      alphaTest: source.alphaTest,
      side: source.side,
      toneMapped: false,
      fog: true,
    });
    source.dispose();
  });

  const span = PALM_SPACING * PALM_PER_SIDE;
  for (let i = 0; i < PALM_PER_SIDE * 2; i += 1) {
    const side = i % 2 ? 1 : -1;
    const palm = template.clone(true);
    // Clones share the template material on purpose: every palm is lit the
    // same way, so one material keeps the draw calls cheap.
    palm.scale.setScalar(0.85 + ((i * 3) % 3) * 0.15);
    palm.rotation.y = (i * 1.73) % (Math.PI * 2);
    palm.position.set(side * 9.4, 0.03, Math.floor(i / 2) * PALM_SPACING + 18);
    palm.traverse((node) => node.layers.set(PALM_LAYER));
    scene.add(palm);
    items.push({ mesh: palm, span, kind: 'palm' });
  }
}

function populateBuildings(scene, template, items) {
  // All 13 primitives carry default (white, fully metallic) materials that we
  // overwrite with one tint per building anyway, so merging them collapses 13
  // draw calls per instance down to 1.
  template.updateWorldMatrix(true, true);
  const parts = [];
  template.traverse((node) => {
    if (!node.isMesh) return;
    parts.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
  });
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  // Recentre on x/z and drop the base to y = 0 so placement is predictable.
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);

  const tints = [0xff2e88, 0x2ecbff, 0x7a3cff, 0xffa63d, 0x3affc1];
  const span = BUILDING_SPACING * BUILDING_PER_SIDE;
  for (let i = 0; i < BUILDING_PER_SIDE * 2; i += 1) {
    const side = i % 2 ? 1 : -1;
    const tint = new THREE.Color(tints[i % tints.length]);
    // One material per building, otherwise every instance would share — and
    // overwrite — the same tint.
    const material = new THREE.MeshStandardMaterial({
      color: tint.clone().multiplyScalar(0.3),
      // Just enough self-light to stay readable through the fog, not enough to
      // flatten the sun's shading.
      emissive: tint.clone().multiplyScalar(0.035),
      metalness: 0.3,
      roughness: 0.38,
      envMapIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Alternating 1x-3x vertical stretch breaks up the skyline silhouette.
    mesh.scale.set(BUILDING_BASE_SCALE, BUILDING_BASE_SCALE * (1 + ((i * 7) % 5) * 0.5), BUILDING_BASE_SCALE);
    mesh.rotation.y = side > 0 ? Math.PI : 0;
    mesh.position.set(side * (38 + ((i * 5) % 3) * 13), 0, Math.floor(i / 2) * BUILDING_SPACING + BUILDING_START_Z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.set(SUN_LAYER);
    scene.add(mesh);
    items.push({ mesh, span, kind: 'building' });
  }
}

// Everything past the detailed ring is a box: at this distance the GLB's
// balconies and railings are sub-pixel, so a stretched cube carries the
// silhouette for a fraction of the cost and lets the skyline run to the horizon.
const FAR_BLOCKS = 13;
const FAR_BLOCK_LENGTH = 58;
const FAR_COLUMNS = [88, 110, 136, 166, 200];
const FAR_PER_COLUMN = 3;

function populateDistantSkyline(scene, items) {
  const tints = [0xff2e88, 0x2ecbff, 0x7a3cff, 0xffa63d, 0x3affc1, 0xff5f4d];
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.55, envMapIntensity: 0.2 });
  const tint = new THREE.Color();
  addScatterBlocks(scene, items, {
    blocks: FAR_BLOCKS,
    blockLength: FAR_BLOCK_LENGTH,
    material,
    layer: SUN_LAYER,
    kind: 'far-building',
    startZ: 34,
    buildBlock(block) {
      const parts = [];
      FAR_COLUMNS.forEach((columnX, column) => {
        for (let side = -1; side <= 1; side += 2) {
          for (let n = 0; n < FAR_PER_COLUMN; n += 1) {
            const seed = block * 97 + column * 17 + n * 7 + (side > 0 ? 3.5 : 0);
            // Further-out columns run taller and wider so the skyline keeps
            // reading at distance instead of shrinking into the fog.
            const depthScale = 1 + column * 0.16;
            const width = (9 + scatter(seed) * 13) * depthScale;
            const height = (14 + scatter(seed + 1) * 32) * depthScale;
            const geometry = new THREE.BoxGeometry(width, height, width * (0.7 + scatter(seed + 2) * 0.6));
            tint.setHex(tints[Math.floor(scatter(seed + 3) * tints.length) % tints.length]).multiplyScalar(0.55);
            const colors = new Float32Array(geometry.attributes.position.count * 3);
            for (let v = 0; v < colors.length; v += 3) {
              colors[v] = tint.r;
              colors[v + 1] = tint.g;
              colors[v + 2] = tint.b;
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.translate(
              side * (columnX + scatter(seed + 4) * 20 * depthScale),
              height / 2,
              (n + scatter(seed + 5)) * (FAR_BLOCK_LENGTH / FAR_PER_COLUMN),
            );
            parts.push(geometry);
          }
        }
      });
      return parts;
    },
  });
}

// A dense, shallow bed of closed low-poly stones. Every block is merged into a
// single draw call, while the closed icosahedra keep the ground convincingly
// faceted from low chase-camera angles.
const ROCK_BLOCKS = 10;
const ROCK_BLOCK_LENGTH = 55;
const ROCK_PER_BLOCK = 110;
const ROCK_MIN_X = ROAD_HALF_WIDTH + 0.7;
const ROCK_MAX_X = 34;
const ROCK_MAX_HEIGHT = 0.52;

function populateRocks(scene, items) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.02,
    flatShading: true,
    envMapIntensity: 0.04,
  });
  const rockPalette = [0x120d0b, 0x1b1210, 0x241713, 0x2d1d17, 0x191313];
  addScatterBlocks(scene, items, {
    blocks: ROCK_BLOCKS,
    blockLength: ROCK_BLOCK_LENGTH,
    material,
    layer: PALM_LAYER,
    kind: 'rocks',
    startZ: 8,
    buildBlock(block) {
      const parts = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let n = 0; n < ROCK_PER_BLOCK; n += 1) {
          const seed = block * 53 + n * 11 + (side > 0 ? 2.5 : 0);
          const radius = 0.48 + scatter(seed) * 0.72;
          const geometry = new THREE.IcosahedronGeometry(radius, 0);
          const yScale = 0.19 + scatter(seed + 30) * 0.1;
          // Shove the vertices around so no two stones share a silhouette, but
          // clamp the vertical component so the bed always behaves as ground.
          const position = geometry.attributes.position;
          for (let v = 0; v < position.count; v += 1) {
            position.setXYZ(
              v,
              position.getX(v) * (0.76 + scatter(seed + v) * 0.58),
              THREE.MathUtils.clamp(position.getY(v) * yScale, -ROCK_MAX_HEIGHT / 2, ROCK_MAX_HEIGHT / 2),
              position.getZ(v) * (0.76 + scatter(seed + v + 80) * 0.58),
            );
          }
          geometry.computeVertexNormals();
          const tint = new THREE.Color(rockPalette[Math.floor(scatter(seed + 7) * rockPalette.length)]);
          const colors = new Float32Array(position.count * 3);
          for (let v = 0; v < colors.length; v += 3) {
            const shade = 0.78 + scatter(seed + v + 140) * 0.25;
            colors[v] = tint.r * shade;
            colors[v + 1] = tint.g * shade;
            colors[v + 2] = tint.b * shade;
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          geometry.translate(
            side * THREE.MathUtils.lerp(ROCK_MIN_X, ROCK_MAX_X, scatter(seed + 3)),
            radius * yScale * 0.38,
            (n + scatter(seed + 4)) * (ROCK_BLOCK_LENGTH / ROCK_PER_BLOCK),
          );
          parts.push(geometry);
        }
      }
      return parts;
    },
  });
}

function createScenery(scene) {
  const items = [];
  const loader = new GLTFLoader();
  const state = { items, assetsReady: false, ready: null };
  const palmReady = loader.loadAsync(`${ASSET_BASE}assets/palm.glb`)
    .then((gltf) => populatePalms(scene, gltf.scene, items));
  const buildingReady = loader.loadAsync(`${ASSET_BASE}assets/building.glb`)
    .then((gltf) => populateBuildings(scene, gltf.scene, items));
  populateDistantSkyline(scene, items);
  populateRocks(scene, items);
  state.ready = Promise.all([palmReady, buildingReady]).then(() => {
    state.assetsReady = true;
  });
  return state;
}

// Cross-section of a neon grid line: an over-exposed core that falls off into
// the line's own colour and then to nothing. Offsets are measured across the
// line, 0.5 being its centre.
function neonLineStops(hex) {
  const css = `#${new THREE.Color(hex).getHexString()}`;
  const glowMid = (GRID_LINE_GLOW + GRID_LINE_SOLID) / 2;
  const hotMid = (GRID_LINE_SOLID + GRID_LINE_CORE) / 2;
  // Several intermediate stops produce a smooth pink -> pale pink -> white
  // falloff despite the profile now being only one third of its former width.
  return [
    [0, `${css}00`],
    [0.5 - GRID_LINE_GLOW, `${css}00`],
    [0.5 - glowMid, `${css}55`],
    [0.5 - GRID_LINE_SOLID, `${css}dd`],
    [0.5 - hotMid, '#ff78bc'],
    [0.5 - GRID_LINE_CORE, '#ffd2e9'],
    [0.5, '#ffffff'],
    [0.5 + GRID_LINE_CORE, '#ffd2e9'],
    [0.5 + hotMid, '#ff78bc'],
    [0.5 + GRID_LINE_SOLID, `${css}dd`],
    [0.5 + glowMid, `${css}55`],
    [0.5 + GRID_LINE_GLOW, `${css}00`],
    [1, `${css}00`],
  ];
}

// `seam` lays the profile along the tile's length with the core split across
// the wrap, so a repeating tile draws one rung per cell. Otherwise the profile
// runs across the tile and paints a single rail.
function createNeonLineTexture(hex, { seam = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = seam ? 4 : 1024;
  canvas.height = seam ? 1024 : 4;
  const ctx = canvas.getContext('2d');
  const gradient = seam
    ? ctx.createLinearGradient(0, 0, 0, canvas.height)
    : ctx.createLinearGradient(0, 0, canvas.width, 0);
  const stops = seam
    // Rotate the profile half a tile so its centre lands on the seam. The
    // gradient then holds the core colour out to both tile ends on its own.
    ? neonLineStops(hex).map(([at, color]) => [at >= 0.5 ? at - 0.5 : at + 0.5, color]).sort((a, b) => a[0] - b[0])
    : neonLineStops(hex);
  stops.forEach(([at, color]) => gradient.addColorStop(at, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = seam ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = seam ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return texture;
}

function roadHalfWidthAt(z) {
  if (z <= ROAD_TAPER_Z) return ROAD_HALF_WIDTH;
  const t = THREE.MathUtils.clamp((z - ROAD_TAPER_Z) / (ROAD_FAR_Z - ROAD_TAPER_Z), 0, 1);
  return THREE.MathUtils.lerp(ROAD_HALF_WIDTH, ROAD_FAR_HALF_WIDTH, t * t * (3 - 2 * t));
}

// How far the road has narrowed at a given z, as a fraction of its full width.
// Lane positions, car bodies and their collision extents all ride on this, so a
// car stays the same size relative to the road it is driving on. Without it the
// four lanes converge to about 1.1 units apart past the taper while the cars
// stay 1.9 wide, which makes overlap unavoidable however hard the solver works.
function taperAt(z) {
  return roadHalfWidthAt(z) / ROAD_HALF_WIDTH;
}

function laneXAtZ(lane, z) {
  return lane * taperAt(z);
}

function createTaperedSurface(leftRatio = -1, rightRatio = 1, y = 0) {
  const rows = [ROAD_NEAR_Z, ROAD_TAPER_Z, 205, ROAD_FAR_Z];
  const positions = [];
  const uvs = [];
  const indices = [];
  rows.forEach((z, index) => {
    const halfWidth = roadHalfWidthAt(z);
    positions.push(halfWidth * leftRatio, y, z, halfWidth * rightRatio, y, z);
    const v = (z - ROAD_NEAR_Z) / ROAD_LENGTH;
    uvs.push(0, v, 1, v);
    if (index < rows.length - 1) {
      const at = index * 2;
      indices.push(at, at + 2, at + 1, at + 2, at + 3, at + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createRaceWorld(scene, renderer, camera) {
  const loader = new THREE.TextureLoader();

  // The track carries no fill at all, and its material is unlit on purpose: a
  // lit surface would let the scene's lamps wash the cells between the neon,
  // and those have to stay black.
  const road = new THREE.Mesh(
    createTaperedSurface(-1, 1, 0),
    new THREE.MeshBasicMaterial({ color: 0x03010a }),
  );
  scene.add(road);

  // Rungs scroll with the car and rails stay put, so the grid squares stream
  // toward the camera the way the synthwave reference does. Both directions use
  // the same pitch, which keeps the cells square. Everything is additive, so
  // the crossings burn brighter than the lines themselves.
  const gridTexture = createNeonLineTexture(PINK, { seam: true });
  gridTexture.repeat.set(1, ROAD_LENGTH / GRID_CELL);
  gridTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const rungs = new THREE.Mesh(
    createTaperedSurface(-1, 1, 0.012),
    new THREE.MeshBasicMaterial({ map: gridTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  scene.add(rungs);

  const railMaterial = new THREE.MeshBasicMaterial({ map: createNeonLineTexture(PINK), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (let i = 0; i <= GRID_COLUMNS; i += 1) {
    const center = -1 + (i / GRID_COLUMNS) * 2;
    const halfCell = 1 / GRID_COLUMNS;
    const rail = new THREE.Mesh(createTaperedSurface(center - halfCell, center + halfCell, 0.014), railMaterial);
    scene.add(rail);
  }

  // Wide and long enough to stay under the deepened skyline, so the ground never
  // ends before the fog does.
  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 940),
    new THREE.MeshBasicMaterial({ color: 0x090117 }),
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(0, -0.012, 360);
  scene.add(shoulder);

  const skyMaterial = new THREE.MeshBasicMaterial({ depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1),
    skyMaterial,
  );
  sky.position.set(0, 0, -250);
  sky.renderOrder = -1000;
  camera.add(sky);
  scene.add(camera);
  const fitSky = () => {
    const distance = Math.abs(sky.position.z);
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance;
    const visibleWidth = visibleHeight * camera.aspect;
    const coverHeight = Math.max(visibleHeight, visibleWidth / 2.5);
    sky.scale.setScalar(coverHeight * 1.02);
    // The sun sits below the bitmap centre. Offset the camera-locked plane so
    // the sun stays on the central horizon and remains visible above the car.
    sky.position.y = coverHeight * 0.36;
  };
  fitSky();
  const skyReady = loader.loadAsync(`${ASSET_BASE}assets/synthwave-sky.png`).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    skyMaterial.map = texture;
    skyMaterial.needsUpdate = true;
  });

  renderer.shadowMap.enabled = true;
  const traffic = createTraffic(scene);
  const scenery = createScenery(scene);
  const ready = Promise.all([skyReady, scenery.ready]);
  return { gridTexture, traffic, scenery, ready, fitSky };
}

export function createNeonCarExperience(container, { onReady, onTelemetry }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0528);
  // Thinner fog and a much deeper far plane: the skyline has to read from
  // hundreds of units out so towers grow on the horizon instead of appearing
  // alongside the car. Raising `near` in step keeps the depth ratio better than
  // it was before the far plane moved.
  scene.fog = new THREE.FogExp2(0x120526, 0.0034);
  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.5, 900);
  camera.position.set(0, 3.15, -10.4);
  camera.layers.enable(SUN_LAYER);
  camera.layers.enable(PALM_LAYER);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, 0.03).texture;
  scene.environmentIntensity = 0.12;
  const controls = new OrbitControls(camera, renderer.domElement);
  // Looking straight ahead places the geometric horizon at 50% of the frame.
  controls.target.set(0, 3.15, 5.2);
  controls.enabled = false;

  const raceWorld = createRaceWorld(scene, renderer, camera);
  const carAudio = createCarAudio({ musicUrl: `${ASSET_BASE}assets/game-sfx.mp3` });
  const model = createCar();
  scene.add(model.car);
  const shots = createNeonShots(scene);
  const bursts = createImpactBursts(scene);
  const wind = createWind();
  scene.add(wind.lines);
  model.underGlow.material.opacity = 0;

  const hemi = new THREE.HemisphereLight(0x6537b5, 0x100015, 0.36);
  scene.add(hemi);
  const keyPink = new THREE.SpotLight(PINK, 14, 32, Math.PI / 5, 0.7, 1.3);
  keyPink.position.set(-7, 6, 6);
  keyPink.target.position.set(-1.8, 0.7, 0);
  keyPink.castShadow = true;
  keyPink.shadow.mapSize.set(1024, 1024);
  scene.add(keyPink, keyPink.target);
  const keyBlue = new THREE.SpotLight(BLUE, 12, 32, Math.PI / 4, 0.7, 1.2);
  keyBlue.position.set(6, 4, -5);
  keyBlue.target.position.set(1.8, 0.7, 0);
  scene.add(keyBlue, keyBlue.target);
  // Low sunset sun, raking in from the side so the skyline picks up a warm
  // specular edge and shades its own far faces. It is confined to SUN_LAYER so
  // it never washes out the road, the car or the palms.
  const sun = new THREE.DirectionalLight(0xffa273, 3.6);
  sun.position.set(60, 30, 140);
  sun.target.position.set(0, 0, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  // Only the stretch of skyline actually on screen needs shadow coverage.
  Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 20, far: 230 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.layers.set(SUN_LAYER);
  sun.target.layers.set(SUN_LAYER);
  scene.add(sun, sun.target);
  // Dim cool fill so the faces the sun misses keep their own colour instead of
  // going flat black, without competing with the sun's shading.
  const skylineFill = new THREE.HemisphereLight(0x39215e, 0x0a0416, 0.6);
  skylineFill.layers.set(SUN_LAYER);
  scene.add(skylineFill);
  // The palms' only light source: dim, cool and purely ambient.
  const palmFill = new THREE.HemisphereLight(0x452a6b, 0x05010a, 0.07);
  palmFill.layers.set(PALM_LAYER);
  scene.add(palmFill);
  const rearGlow = new THREE.PointLight(0xff003f, 12, 6, 2);
  rearGlow.position.set(0, 0.7, -3.8);
  scene.add(rearGlow);

  // Let render stats accumulate across all composer passes so the telemetry
  // hook reports a whole frame, not just the final blit.
  renderer.info.autoReset = false;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.36, 0.35, 0.87));

  const clock = new THREE.Clock();
  let frameId;
  let disposed = false;
  let currentPreset = null;
  let transitionStart = 0;
  let fromPosition = camera.position.clone();
  let fromTarget = controls.target.clone();
  let wheelsSpinning = false;
  let wheelAngle = 0;
  let lightsEnabled = true;
  let backfireTime = 0;
  const backfireDuration = 2.4;
  let raceRunning = false;
  let speed = 0;
  let steer = 0;
  let carX = 0;
  let carVX = 0;
  let torque = 0;
  let lastTelemetryAt = 0;
  const keys = new Set();
  const MAX_SPEED = MAX_PLAYER_SPEED;
  const MAX_REVERSE = -55;
  // Five gears, each covering its own speed band in roughly GEAR_SECONDS of
  // throttle. Without the shift overhead that would put a full pull at
  // 5 * GEAR_SECONDS; four shifts each cost SHIFT_SECONDS plus the time spent
  // regaining SHIFT_SPEED_LOSS, which is what the constant below is tuned
  // against so the measured 0-220 km/h run lands at ~7 s.
  const GEARS = [
    { min: 0, max: 55 },
    { min: 55, max: 100 },
    { min: 100, max: 140 },
    { min: 140, max: 180 },
    { min: 180, max: MAX_SPEED },
  ];
  const GEAR_SECONDS = 1.05;
  const SHIFT_SECONDS = 0.42;
  const SHIFT_SPEED_LOSS = 9;
  const LAUNCH_SECONDS = 0.55;
  const LAUNCH_BOOST = 116;
  const COAST_DECEL = MAX_SPEED / 2;
  const BRAKE_DECEL = 160;
  const REVERSE_ACCEL = 55;
  const LATERAL_SPEED = 9.5;
  const CAR_HALF_WIDTH = 1.45;
  let gearIndex = 0;
  let shiftTimer = 0;
  let launchTimer = 0;
  let prevAccelerating = false;
  let isAccelerating = false;
  let isBraking = false;
  let bodyPitch = 0;
  let travelThisFrame = 0;
  let raceTime = 0;
  let spawnTimer = 0;
  let impactFlash = 0;
  let collisions = 0;
  let laneChanges = 0;
  let wasRunning = false;
  let shotCooldown = 0;
  let shotsFired = 0;
  let shotHits = 0;
  let steerDirection = 0;
  const DIFFICULTY_RAMP = 90;
  const TARGET_Z = 5.2;
  let cameraHeight = 3.15;
  let cameraAngle = 0;
  // How far the chase camera sits behind the car. Pulling in fills the frame
  // with the car; pushing out gives the scenery room.
  let cameraDistance = 10.4;
  let activeTurnSignal = null;
  let turnSignalTime = 0;
  const suspension = {
    phase: 'rest',
    velocity: 0,
    springTime: 0,
    amplitude: 0,
  };
  const carRestY = 0.02;
  const wheelRestY = 0.653;

  const onKeyDown = (event) => {
    if (event.code === 'KeyF') {
      event.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen?.();
      else container.requestFullscreen?.();
      return;
    }
    // 1-5 drop the car straight into that gear. Selecting a higher gear pulls
    // speed up to the bottom of its band, which is what makes a standing start
    // in 4th or 5th immediately quick.
    const gearKey = /^(Digit|Numpad)([1-5])$/.exec(event.code);
    if (gearKey) {
      event.preventDefault();
      selectGear(Number(gearKey[2]) - 1);
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) fireNeonShot();
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  };
  const onKeyUp = (event) => keys.delete(event.code);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function gearForSpeed(value) {
    for (let i = GEARS.length - 1; i >= 0; i -= 1) if (value >= GEARS[i].min) return i;
    return 0;
  }

  // Manual gear select. Speed is pulled into the chosen gear's band, so picking
  // a high gear from a standstill launches the car at that speed — the point of
  // the shortcut — and picking a low one engine-brakes down into it. Without the
  // clamp the automatic would simply reselect the gear that matched the speed
  // and the key press would do nothing.
  function selectGear(index) {
    if (!raceRunning || index < 0 || index >= GEARS.length) return;
    const target = GEARS[index];
    gearIndex = index;
    shiftTimer = SHIFT_SECONDS * 0.5;
    if (speed < target.min) {
      speed = target.min;
      backfireTime = backfireDuration;
    } else if (speed > target.max) {
      speed = target.max;
    }
    torque = THREE.MathUtils.clamp((speed - target.min) / (target.max - target.min), 0, 1);
  }

  function updateDriving(delta, elapsed) {
    const accelerating = keys.has('ArrowUp') || keys.has('KeyW');
    const braking = keys.has('ArrowDown') || keys.has('KeyS');
    isAccelerating = raceRunning && accelerating && !braking;
    isBraking = raceRunning && braking;
    const steeringLeft = keys.has('ArrowLeft') || keys.has('KeyA');
    const steeringRight = keys.has('ArrowRight') || keys.has('KeyD');
    let pitchTarget = 0;

    if (!raceRunning) {
      speed = THREE.MathUtils.lerp(speed, 0, 1 - Math.exp(-3 * delta));
      torque = THREE.MathUtils.lerp(torque, 0, 1 - Math.exp(-5 * delta));
      gearIndex = 0;
      shiftTimer = 0;
      launchTimer = 0;
    } else if (shiftTimer > 0) {
      // Mid-shift: the clutch is out, so speed bleeds off and torque collapses.
      shiftTimer = Math.max(0, shiftTimer - delta);
      speed -= (SHIFT_SPEED_LOSS / SHIFT_SECONDS) * delta;
      torque = THREE.MathUtils.lerp(torque, 0.04, 1 - Math.exp(-16 * delta));
      pitchTarget = 0.035 * (shiftTimer / SHIFT_SECONDS);
    } else if (accelerating && !braking) {
      if (!prevAccelerating && speed < 30) {
        launchTimer = LAUNCH_SECONDS;
        backfireTime = backfireDuration;
      }
      const gear = GEARS[gearIndex];
      const boost = launchTimer > 0 ? LAUNCH_BOOST * (launchTimer / LAUNCH_SECONDS) : 0;
      speed += ((gear.max - gear.min) / GEAR_SECONDS + boost) * delta;
      if (launchTimer > 0) {
        pitchTarget = -0.055 * (launchTimer / LAUNCH_SECONDS);
        launchTimer = Math.max(0, launchTimer - delta);
      }
      torque = THREE.MathUtils.clamp((speed - gear.min) / (gear.max - gear.min), 0, 1);
      if (torque >= 1 && gearIndex < GEARS.length - 1) {
        gearIndex += 1;
        shiftTimer = SHIFT_SECONDS;
      }
    } else if (braking) {
      speed -= (speed > 0.05 ? BRAKE_DECEL : -REVERSE_ACCEL) * delta;
      torque = THREE.MathUtils.lerp(torque, 0.2, 1 - Math.exp(-10 * delta));
      gearIndex = gearForSpeed(Math.abs(speed));
    } else {
      const drop = COAST_DECEL * delta;
      speed = drop >= Math.abs(speed) ? 0 : speed - Math.sign(speed) * drop;
      torque = THREE.MathUtils.lerp(torque, 0, 1 - Math.exp(-9 * delta));
      gearIndex = gearForSpeed(Math.abs(speed));
    }
    prevAccelerating = accelerating;
    speed = THREE.MathUtils.clamp(speed, MAX_REVERSE, MAX_SPEED);
    bodyPitch = THREE.MathUtils.lerp(bodyPitch, pitchTarget, 1 - Math.exp(-12 * delta));
    model.car.rotation.x = bodyPitch;

    // Screen-right is world -x from the chase camera, so lateral motion and the
    // nose yaw both invert the raw steer input.
    const steerTarget = steeringLeft ? -1 : steeringRight ? 1 : 0;
    // Raw input, not the smoothed value: the scrub effect should fire the moment
    // the wheel is flicked, including on a direct left-to-right reversal.
    steerDirection = raceRunning ? steerTarget : 0;
    steer = THREE.MathUtils.lerp(steer, steerTarget, 1 - Math.exp(-8 * delta));
    const steerAuthority = THREE.MathUtils.clamp(Math.abs(speed) / 26, 0.22, 1);
    carX -= steer * LATERAL_SPEED * steerAuthority * delta;
    // Sideways knocks from a contact ride on top of the steering and decay.
    carX += carVX * delta;
    carVX -= carVX * Math.min(1, LATERAL_DAMPING * delta);
    carX = THREE.MathUtils.clamp(carX, -(ROAD_HALF_WIDTH - CAR_HALF_WIDTH), ROAD_HALF_WIDTH - CAR_HALF_WIDTH);
    model.car.position.x = carX;
    model.car.rotation.z = THREE.MathUtils.lerp(model.car.rotation.z, -steer * 0.045 + carVX * 0.012, 1 - Math.exp(-6 * delta));
    model.car.rotation.y = THREE.MathUtils.lerp(model.car.rotation.y, -steer * 0.16 - carVX * 0.02, 1 - Math.exp(-5 * delta));
    wheelAngle -= delta * (speed * 0.11);
    model.wheels.forEach((wheel, index) => {
      wheel.rotation.x = wheelAngle;
      if (index < 2) wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, -steer * 0.32, 1 - Math.exp(-9 * delta));
    });

    // One shared distance drives the texture scroll, the traffic and the
    // scenery, so the whole world moves at the speed on the dial.
    travelThisFrame = speed * WORLD_SCALE * delta;
    raceWorld.gridTexture.offset.y = (raceWorld.gridTexture.offset.y - travelThisFrame * (raceWorld.gridTexture.repeat.y / ROAD_LENGTH)) % 1;
    wheelsSpinning = Math.abs(speed) > 0.5;

    if (!currentPreset) {
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, carX, 1 - Math.exp(-4 * delta));
      controls.target.x = THREE.MathUtils.lerp(controls.target.x, carX, 1 - Math.exp(-4 * delta));
    }

    if (onTelemetry && elapsed - lastTelemetryAt > 0.11) {
      lastTelemetryAt = elapsed;
      const absSpeed = Math.abs(speed);
      const gear = speed < -0.5 ? 'R' : absSpeed < 1 && !accelerating ? 'N' : String(gearIndex + 1);
      onTelemetry({
        speed: absSpeed,
        rpm: absSpeed < 1 && !accelerating ? 0 : 1200 + torque * 6800,
        gear,
        torque,
        shifting: shiftTimer > 0,
      });
    }
  }

  // `scale` matters because the same ring is used at both ends of the shot: the
  // muzzle sits barely 14 units from the camera, where an impact-sized ring
  // would swallow the screen, while a strike is usually a hundred units out.
  function spawnBurst(x, y, z, { scale = 1, seconds = BURST_SECONDS, growth = 5.5 } = {}) {
    const burst = bursts.slots.find((entry) => !entry.active) ?? bursts.slots[0];
    burst.active = true;
    burst.time = 0;
    burst.scale = scale;
    burst.seconds = seconds;
    burst.growth = growth;
    burst.mesh.visible = true;
    burst.mesh.position.set(x, y, z);
    burst.mesh.scale.setScalar(scale);
    burst.mesh.material.opacity = 1;
  }

  function updateBursts(delta) {
    bursts.slots.forEach((burst) => {
      if (!burst.active) return;
      burst.time += delta;
      const t = burst.time / burst.seconds;
      if (t >= 1) {
        burst.active = false;
        burst.mesh.visible = false;
        return;
      }
      burst.mesh.scale.setScalar(burst.scale * (1 + t * burst.growth));
      burst.mesh.material.opacity = (1 - t) * 0.95;
      burst.mesh.lookAt(camera.position);
    });
  }

  // A struck car is thrown up, spun on all three axes and pushed toward the
  // nearest verge, which is what clears the lane the player was blocked in.
  function launchTrafficCar(slot, impactZ) {
    slot.launched = true;
    slot.laneChanging = false;
    slot.launchVy = 15.5 + Math.random() * 4;
    // Away from the road centre, so the wreck always leaves the track.
    const outward = Math.sign(slot.x) || (Math.random() < 0.5 ? -1 : 1);
    slot.launchVx = outward * (9 + Math.random() * 7);
    slot.spin.set(
      6 + Math.random() * 5,
      outward * (3.5 + Math.random() * 3),
      outward * (7 + Math.random() * 5),
    );
    slot.speed = Math.max(slot.speed, 40);
    slot.mesh.material.emissiveIntensity = 5.5;
    spawnBurst(slot.x, 0.9, impactZ);
    carAudio.launchHit();
    shotHits += 1;
  }

  function updateLaunchedCar(slot, delta) {
    slot.launchVy -= 21 * delta;
    slot.mesh.position.y += slot.launchVy * delta;
    slot.x += slot.launchVx * delta;
    slot.mesh.position.x = slot.x;
    slot.mesh.rotation.x += slot.spin.x * delta;
    slot.mesh.rotation.y += slot.spin.y * delta;
    slot.mesh.rotation.z += slot.spin.z * delta;
    slot.mesh.material.emissiveIntensity = Math.max(0.45, slot.mesh.material.emissiveIntensity - delta * 3.4);
    if (slot.mesh.position.y < -9) {
      slot.active = false;
      slot.mesh.visible = false;
    }
  }

  function fireNeonShot() {
    if (!raceRunning || shotCooldown > 0) return;
    const shot = shots.slots.find((entry) => !entry.active);
    if (!shot) return;
    shot.active = true;
    shot.x = carX;
    shot.z = SHOT_MUZZLE_Z;
    shot.mesh.visible = true;
    shot.mesh.position.set(shot.x, 0.78, shot.z);
    shotCooldown = SHOT_COOLDOWN;
    shotsFired += 1;
    // Muzzle flash at the nose, so firing reads even when the bolt is already
    // downrange by the next frame. Small and brief — it is right under the lens.
    spawnBurst(carX, 0.78, SHOT_MUZZLE_Z, { scale: 0.3, seconds: 0.16, growth: 2.4 });
    carAudio.shot();
  }

  function updateShots(delta) {
    shotCooldown = Math.max(0, shotCooldown - delta);
    const targets = raceWorld.traffic.slots.filter((slot) => slot.active && !slot.launched);
    shots.slots.forEach((shot) => {
      if (!shot.active) return;
      shot.z += SHOT_SPEED * delta;
      if (shot.z > SHOT_MAX_Z) {
        shot.active = false;
        shot.mesh.visible = false;
        return;
      }
      // Nearest overlapping car along the flight path, so a bolt cannot skip
      // past the first car in a queue and hit the one behind it.
      let struck = null;
      for (const slot of targets) {
        // Re-checked per bolt: an earlier bolt this same frame may already have
        // launched this car.
        if (slot.launched || !slot.active) continue;
        if (Math.abs(slot.x - shot.x) > SHOT_HIT_HALF_X) continue;
        if (Math.abs(slot.mesh.position.z - shot.z) > SHOT_HIT_HALF_Z) continue;
        if (!struck || slot.mesh.position.z < struck.mesh.position.z) struck = slot;
      }
      if (struck) {
        launchTrafficCar(struck, shot.z);
        shot.active = false;
        shot.mesh.visible = false;
        return;
      }
      shot.mesh.position.z = shot.z;
    });
  }

  let windEnvelope = 0;
  function respawnStreak(streak, seed) {
    // Streaks are seeded in a band either side of the car so they read as air
    // tearing past it rather than as a tunnel around the camera.
    const side = seed % 2 ? 1 : -1;
    streak.x = side * (1.5 + Math.random() * 6.5);
    streak.y = 0.25 + Math.random() * 3.2;
    streak.z = WIND_START_Z * (0.55 + Math.random() * 0.6);
    streak.length = 5 + Math.random() * 11;
    streak.speed = 90 + Math.random() * 90;
  }

  function updateWind(delta, maxed) {
    windEnvelope = THREE.MathUtils.lerp(windEnvelope, maxed ? 1 : 0, 1 - Math.exp(-4.5 * delta));
    wind.lines.visible = windEnvelope > 0.02;
    wind.lines.material.opacity = windEnvelope * 0.85;
    if (!wind.lines.visible) return;
    wind.streaks.forEach((streak, index) => {
      if (streak.length === 0) respawnStreak(streak, index);
      streak.z -= streak.speed * delta;
      if (streak.z < WIND_END_Z) respawnStreak(streak, index);
      const base = index * 6;
      wind.positions[base] = streak.x;
      wind.positions[base + 1] = streak.y;
      wind.positions[base + 2] = streak.z;
      wind.positions[base + 3] = streak.x;
      wind.positions[base + 4] = streak.y;
      wind.positions[base + 5] = streak.z + streak.length;
    });
    wind.geometry.attributes.position.needsUpdate = true;
  }

  let flameEnvelope = 0;
  function updateBackfire(delta, elapsed, maxed) {
    backfireTime = Math.max(0, backfireTime - delta);
    const pulse = backfireTime > 0 ? Math.sin(Math.min((1 - backfireTime / backfireDuration) * Math.PI, Math.PI)) : 0;
    flameEnvelope = THREE.MathUtils.lerp(flameEnvelope, maxed ? 1 : 0, 1 - Math.exp(-7 * delta));
    const envelope = Math.max(pulse, flameEnvelope);
    model.backfire.group.visible = envelope > 0.01;
    if (envelope <= 0.01) return;
    model.backfire.flames.forEach((flame, index) => {
      const flicker = 0.72 + Math.sin(elapsed * 34 + index * 1.7) * 0.28;
      flame.material.opacity = envelope * (index % 2 ? 0.95 : 0.72);
      flame.scale.set(0.75 + flicker * 0.5, 0.35 + envelope * flicker * 1.15, 0.75 + flicker * 0.5);
    });
    const sparkProgress = backfireTime > 0 ? Math.min(1, (1 - backfireTime / backfireDuration) * 1.45) : (elapsed % 0.4) / 0.4;
    model.backfire.sparks.forEach((spark, index) => {
      spark.position.copy(spark.userData.origin).addScaledVector(spark.userData.velocity, sparkProgress);
      spark.position.y -= sparkProgress * sparkProgress * 0.14;
      spark.material.opacity = Math.max(0, (1 - sparkProgress) * 1.4 * envelope);
      spark.scale.setScalar(1 + (index % 3) * 0.35);
    });
    model.backfire.light.intensity = envelope * 38;
  }

  function updateTurnSignals(delta) {
    turnSignalTime += delta;
    const phase = turnSignalTime % 1.1;
    const litCount = phase < 0.72 ? Math.min(6, Math.floor(phase / 0.12) + 1) : phase < 0.92 ? 6 : 0;
    model.indicators.forEach((indicator) => {
      const enabled = activeTurnSignal === (indicator.side < 0 ? 'left' : 'right');
      indicator.segments.forEach((segment, index) => {
        const lit = enabled && index < litCount;
        segment.material.emissive.setHex(lit ? 0xff7800 : segment.userData.baseColor);
        segment.material.emissiveIntensity = lit ? 9.5 : lightsEnabled ? 2.7 : 0;
        segment.material.color.setHex(lit ? 0xffa000 : segment.userData.baseColor);
        segment.scale.y = lit ? 1.08 : 1;
      });
    });
  }

  function updateSuspension(delta) {
    let bodyOffset = 0;
    if (suspension.phase === 'falling') {
      suspension.velocity -= 9.81 * delta;
      model.car.position.y += suspension.velocity * delta;
      if (model.car.position.y <= carRestY) {
        const impactSpeed = Math.abs(suspension.velocity);
        suspension.phase = 'spring';
        suspension.springTime = 0;
        suspension.amplitude = THREE.MathUtils.clamp(impactSpeed * 0.02, 0.09, 0.18);
        model.car.position.y = carRestY;
      }
    } else if (suspension.phase === 'spring') {
      suspension.springTime += delta;
      bodyOffset = -suspension.amplitude * Math.exp(-3.1 * suspension.springTime) * Math.sin(14.5 * suspension.springTime);
      model.car.position.y = carRestY + bodyOffset;
      if (suspension.springTime > 1.8) {
        suspension.phase = 'rest';
        model.car.position.y = carRestY;
        bodyOffset = 0;
      }
    }
    if (suspension.phase === 'rest') model.car.position.y = carRestY;
    model.wheels.forEach((wheel) => {
      wheel.position.y = wheelRestY - bodyOffset;
    });
  }

  function difficulty() {
    return THREE.MathUtils.clamp(raceTime / DIFFICULTY_RAMP, 0, 1);
  }

  // Cars appearing far ahead can use any lane — there is time to react. Anything
  // spawning close to or behind us is unavoidable, so it has to keep out of the
  // lane we are in.
  function pickLane(spawnZ, preferredLane = null) {
    const options = spawnZ < TRAFFIC_SAFE_ZONE ? safeLanes(carX) : LANES;
    if (preferredLane !== null && options.includes(preferredLane)) return preferredLane;
    return options[Math.floor(Math.random() * options.length)];
  }

  // Bodies are impenetrable, so a car must never be placed on top of one that
  // is already there — the solver would otherwise have to shove them apart in
  // full view.
  function spotIsFree(x, z) {
    const taper = taperAt(z);
    return !raceWorld.traffic.slots.some((slot) => slot.active
      && !slot.launched
      && Math.abs(slot.x - x) < CAR_HALF_X * 2.4 * taper
      && Math.abs(slot.mesh.position.z - z) < CAR_HALF_Z * 2.4 * taper);
  }

  function trafficCruiseSpeed(fromBehind, level) {
    const roll = Math.random();
    let cruiseSpeed;
    if (roll < 0.3) cruiseSpeed = 52 + Math.random() * 40;
    else if (roll < 0.78) cruiseSpeed = 92 + Math.random() * 48;
    else cruiseSpeed = 140 + Math.random() * (MAX_TRAFFIC_SPEED - 140);
    if (fromBehind) cruiseSpeed = Math.max(cruiseSpeed, speed + THREE.MathUtils.lerp(18, 42, level) + Math.random() * 18);
    return THREE.MathUtils.clamp(cruiseSpeed, 45, MAX_TRAFFIC_SPEED);
  }

  function spawnTrafficCar({ fromBehind = false, forcedZ = null, forcedLane = null } = {}) {
    const slot = raceWorld.traffic.slots.find((entry) => !entry.active);
    if (!slot) return false;
    const level = difficulty();
    let spawnZ = 0;
    let lane = 0;
    let free = false;
    for (let attempt = 0; attempt < 20 && !free; attempt += 1) {
      spawnZ = forcedZ ?? (fromBehind
        ? TRAFFIC_BEHIND_Z - Math.random() * 22
        : TRAFFIC_SPAWN_Z + Math.random() * 40);
      if (forcedZ !== null && attempt > 0) {
        const direction = attempt % 2 ? 1 : -1;
        spawnZ += direction * Math.ceil(attempt / 2) * CAR_HALF_Z * 2.8;
      }
      lane = pickLane(spawnZ, forcedLane);
      if (lane === undefined) continue;
      free = spotIsFree(laneXAtZ(lane, spawnZ), spawnZ);
    }
    if (!free) return false;
    slot.active = true;
    slot.hit = false;
    slot.cruiseSpeed = trafficCruiseSpeed(fromBehind, level);
    slot.speed = slot.cruiseSpeed;
    slot.x = laneXAtZ(lane, spawnZ);
    slot.vx = 0;
    slot.lane = lane;
    slot.targetLane = lane;
    slot.laneChanging = false;
    slot.laneChangeCooldown = Math.random() * 1.2;
    slot.launched = false;
    slot.launchVy = 0;
    slot.launchVx = 0;
    slot.spin.set(0, 0, 0);
    slot.taper = taperAt(spawnZ);
    slot.mesh.visible = true;
    slot.mesh.rotation.set(0, 0, 0);
    slot.mesh.scale.setScalar(slot.taper);
    slot.mesh.position.set(slot.x, 0.68 * slot.taper, spawnZ);
    slot.mesh.material.emissiveIntensity = 0.45;
    return true;
  }

  // Four cars begin behind the camera and sixteen ahead, all outside the
  // player's unavoidable collision band. Cars are staggered longitudinally so
  // the four visual lanes can converge safely as they approach the horizon.
  const SEED_BEHIND_COUNT = 4;

  function seedTraffic() {
    for (let i = 0; i < TRAFFIC_SEED_COUNT; i += 1) {
      const behind = i < SEED_BEHIND_COUNT;
      const z = behind
        ? TRAFFIC_BEHIND_Z - 30 + i * 11.6
        : 46 + (i - SEED_BEHIND_COUNT) * 10.5;
      const lane = behind
        ? (i % 2 ? LANES[LANES.length - 1] : LANES[0])
        : LANES[(i - SEED_BEHIND_COUNT) % LANES.length];
      spawnTrafficCar({ fromBehind: behind, forcedZ: z, forcedLane: lane });
    }
    spawnTimer = 1.5;
  }

  function laneClearance(slot, lane, live) {
    const candidateX = laneXAtZ(lane, slot.mesh.position.z);
    if (Math.abs(candidateX) > roadHalfWidthAt(slot.mesh.position.z) - CAR_HALF_X * slot.taper) return -Infinity;
    if (slot.mesh.position.z < TRAFFIC_SAFE_ZONE && Math.abs(candidateX - carX) <= TRAFFIC_LANE_CLEARANCE) return -Infinity;
    let nearest = Infinity;
    for (const other of live) {
      if (other === slot) continue;
      const dz = other.mesh.position.z - slot.mesh.position.z;
      const otherTargetX = laneXAtZ(other.targetLane, other.mesh.position.z);
      if (Math.abs(otherTargetX - candidateX) < CAR_HALF_X * (slot.taper + other.taper) * 1.125
        && dz > -LANE_CLEAR_BEHIND && dz < LANE_CLEAR_AHEAD) return -Infinity;
      nearest = Math.min(nearest, Math.abs(dz));
    }
    return nearest;
  }

  function planTrafficMotion(slot, live) {
    // Traffic drives its own road: it queues behind slower cars and changes lane
    // around them, but it never reacts to the player. Dodging us — which it used
    // to do from 80 units out, at full traffic speed — made the car in front
    // impossible to reach, so avoiding it is the driver's job now. Spawns are
    // still filtered out of the player's unavoidable band, so nothing is unfair.
    let lead = null;
    let leadGap = Infinity;
    for (const other of live) {
      if (other === slot || Math.abs(other.targetLane - slot.targetLane) > 0.2) continue;
      const gap = other.mesh.position.z - slot.mesh.position.z - CAR_HALF_Z * 2;
      if (gap > 0 && gap < leadGap) {
        lead = other;
        leadGap = gap;
      }
    }

    let desiredSpeed = slot.cruiseSpeed;
    if (!lead) return desiredSpeed;
    const closingSpeed = Math.max(0, slot.speed - lead.speed);
    const timeToContact = closingSpeed > 0.5 ? leadGap / (closingSpeed * WORLD_SCALE) : Infinity;
    const threatened = leadGap < 10 || (leadGap < 32 && timeToContact < 2.4);
    if (!threatened) return desiredSpeed;

    if (!slot.laneChanging && slot.laneChangeCooldown <= 0) {
      const laneIndex = LANES.indexOf(slot.lane);
      const candidates = [LANES[laneIndex - 1], LANES[laneIndex + 1]]
        .filter((lane) => lane !== undefined)
        .map((lane) => ({ lane, clearance: laneClearance(slot, lane, live) }))
        .filter((candidate) => Number.isFinite(candidate.clearance))
        .sort((a, b) => b.clearance - a.clearance);
      if (candidates.length) {
        slot.targetLane = candidates[0].lane;
        slot.laneChanging = true;
        slot.laneChangeCooldown = LANE_CHANGE_COOLDOWN + Math.random() * 1.4;
        laneChanges += 1;
        return desiredSpeed;
      }
    }

    // No safe adjacent lane: blend down toward the leading car instead of
    // relying on the collision solver to absorb a preventable rear-end.
    desiredSpeed = Math.min(desiredSpeed, Math.max(38, lead.speed - (leadGap < 7 ? 8 : 2)));
    return desiredSpeed;
  }

  function updateTraffic(delta) {
    const { slots } = raceWorld.traffic;
    if (!raceRunning) {
      slots.forEach((slot) => { slot.active = false; slot.launched = false; slot.mesh.visible = false; });
      shots.slots.forEach((shot) => { shot.active = false; shot.mesh.visible = false; });
      bursts.slots.forEach((burst) => { burst.active = false; burst.mesh.visible = false; });
      raceTime = 0;
      spawnTimer = 0;
      collisions = 0;
      laneChanges = 0;
      shotsFired = 0;
      shotHits = 0;
      shotCooldown = 0;
      carVX = 0;
      wasRunning = false;
      return;
    }
    if (!wasRunning) {
      seedTraffic();
      wasRunning = true;
    }

    raceTime += delta;
    const activeCount = slots.reduce((total, slot) => total + (slot.active ? 1 : 0), 0);
    spawnTimer -= delta;
    if (spawnTimer <= 0 && activeCount < TRAFFIC_MAX_ACTIVE) {
      const burst = raceTime < 1.5 ? 0 : Math.min(4, TRAFFIC_MAX_ACTIVE - activeCount);
      for (let i = 0; i < burst; i += 1) {
        const fromBehind = Math.random() < 0.45;
        if (!spawnTrafficCar({ fromBehind }) && fromBehind) spawnTrafficCar({ fromBehind: false });
      }
      spawnTimer = activeCount < TRAFFIC_SEED_COUNT ? 0.04 : 0.22 + Math.random() * 0.22;
    }

    const live = [];
    slots.forEach((slot) => {
      if (!slot.active) return;
      slot.mesh.position.z -= (speed - slot.speed) * WORLD_SCALE * delta;
      if (slot.mesh.position.z < TRAFFIC_DESPAWN_Z || slot.mesh.position.z > TRAFFIC_FORWARD_LIMIT) {
        slot.active = false;
        slot.mesh.visible = false;
        return;
      }
      if (slot.launched) {
        updateLaunchedCar(slot, delta);
        return;
      }
      if (slot.hit) slot.mesh.material.emissiveIntensity = Math.max(0.45, slot.mesh.material.emissiveIntensity - delta * 4);
      slot.laneChangeCooldown = Math.max(0, slot.laneChangeCooldown - delta);
      live.push(slot);
    });

    live.forEach((slot) => {
      const desiredSpeed = planTrafficMotion(slot, live);
      const speedResponse = desiredSpeed < slot.speed ? 4.8 : 0.85;
      slot.speed = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(slot.speed, desiredSpeed, 1 - Math.exp(-speedResponse * delta)),
        35,
        MAX_TRAFFIC_SPEED,
      );
      const targetX = laneXAtZ(slot.targetLane, slot.mesh.position.z);
      const laneDelta = targetX - slot.x;
      const laneStep = THREE.MathUtils.clamp(laneDelta, -LANE_CHANGE_SPEED * delta, LANE_CHANGE_SPEED * delta);
      slot.x += laneStep + slot.vx * delta;
      slot.vx -= slot.vx * Math.min(1, LATERAL_DAMPING * delta);
      if (slot.laneChanging && Math.abs(targetX - slot.x) < 0.045) {
        slot.x = targetX;
        slot.lane = slot.targetLane;
        slot.laneChanging = false;
      }
      slot.taper = taperAt(slot.mesh.position.z);
      slot.mesh.scale.setScalar(slot.taper);
      slot.mesh.position.y = 0.68 * slot.taper;
      const roadLimit = Math.max(0, roadHalfWidthAt(slot.mesh.position.z) - CAR_HALF_X * slot.taper);
      slot.x = THREE.MathUtils.clamp(slot.x, -roadLimit, roadLimit);
      slot.mesh.position.x = slot.x;
      const lateralVelocity = laneStep / Math.max(delta, 0.001) + slot.vx;
      slot.mesh.rotation.y = THREE.MathUtils.lerp(slot.mesh.rotation.y, -lateralVelocity * 0.055, 1 - Math.exp(-7 * delta));
    });

    // A single pass leaves residual overlap once three or more bodies pile up,
    // because separating one pair can push a car into the next. A few
    // iterations converge without needing a full physics solver.
    for (let pass = 0; pass < 24; pass += 1) if (resolveTrafficContacts(live) === 0) break;
    resolvePlayerContacts(live);
    for (let pass = 0; pass < 24; pass += 1) if (resolveTrafficContacts(live) === 0) break;
    live.forEach((slot) => { slot.speed = Math.min(slot.speed, MAX_TRAFFIC_SPEED); });
    carX = THREE.MathUtils.clamp(carX, -(ROAD_HALF_WIDTH - CAR_HALF_WIDTH), ROAD_HALF_WIDTH - CAR_HALF_WIDTH);
    model.car.position.x = carX;
  }

  // Separates two overlapping bodies along whichever axis they are least buried
  // in, which is what keeps a side-swipe from being read as a rear-end.
  function contact(dx, dz, halfX, halfZ) {
    const overlapX = halfX - Math.abs(dx);
    const overlapZ = halfZ - Math.abs(dz);
    if (overlapX <= 0 || overlapZ <= 0) return null;
    // Compare each overlap against its own axis so a long thin car is not
    // always separated along its short side.
    const sideways = overlapX / halfX < overlapZ / halfZ;
    return { sideways, overlapX, overlapZ, signX: Math.sign(dx) || 1, signZ: Math.sign(dz) || 1 };
  }

  function resolveTrafficContacts(live) {
    let separated = 0;
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        // Summed half-extents of this particular pair, each shrunk by the road
        // width where it sits.
        const spread = a.taper + b.taper;
        const hit = contact(b.x - a.x, b.mesh.position.z - a.mesh.position.z, CAR_HALF_X * spread, CAR_HALF_Z * spread);
        if (!hit) continue;
        if (hit.sideways) {
          // Push both clear and send them apart sideways.
          const push = (hit.overlapX / 2) * hit.signX;
          a.x -= push;
          b.x += push;
          const impulse = SIDE_IMPULSE * hit.signX;
          a.vx -= impulse * 0.5;
          b.vx += impulse * 0.5;
        } else {
          const push = (hit.overlapZ / 2) * hit.signZ;
          a.mesh.position.z -= push;
          b.mesh.position.z += push;
          // The car behind gives up closing speed, the one ahead is shoved on.
          const behind = hit.signZ > 0 ? a : b;
          const ahead = hit.signZ > 0 ? b : a;
          const closing = Math.max(0, behind.speed - ahead.speed);
          behind.speed -= closing * REAR_IMPULSE;
          ahead.speed += closing * REAR_IMPULSE;
        }
        a.mesh.position.x = a.x;
        b.mesh.position.x = b.x;
        separated += 1;
      }
    }
    return separated;
  }

  function resolvePlayerContacts(live) {
    live.forEach((slot) => {
      // The player is pinned at z = 0; the world moves around it.
      const hit = contact(slot.x - carX, slot.mesh.position.z, HIT_HALF_X, HIT_HALF_Z);
      if (!hit) return;
      if (!slot.hit) {
        collisions += 1;
        slot.mesh.material.emissiveIntensity = 3.2;
        impactFlash = 0.45;
        suspension.phase = 'spring';
        suspension.springTime = 0;
        suspension.amplitude = 0.14;
      }
      slot.hit = true;
      if (hit.sideways) {
        // Side-swipe: both bodies are pushed clear and thrown apart sideways.
        // The player is the heavier body, so it takes the smaller share.
        const push = hit.overlapX * hit.signX;
        carX -= push * 0.35;
        slot.x += push * 0.65;
        carVX -= SIDE_IMPULSE * hit.signX * 0.35;
        slot.vx += SIDE_IMPULSE * hit.signX * 0.65;
      } else {
        const push = hit.overlapZ * hit.signZ;
        slot.mesh.position.z += push;
        const closing = hit.signZ > 0 ? speed - slot.speed : slot.speed - speed;
        if (closing > 0) {
          if (hit.signZ > 0) {
            // We ran into the back of it: we lose speed, it is shoved forward.
            speed -= closing * REAR_IMPULSE;
            slot.speed += closing * REAR_IMPULSE;
          } else {
            // It rear-ended us: we are shoved forward, it drops back.
            speed += closing * REAR_IMPULSE * 0.6;
            slot.speed -= closing * REAR_IMPULSE;
          }
          gearIndex = gearForSpeed(Math.abs(speed));
          torque = 0;
        }
      }
      slot.mesh.position.x = slot.x;
    });
  }

  function updateScenery() {
    raceWorld.scenery.items.forEach((item) => {
      item.mesh.position.z -= travelThisFrame;
      // Props are kept in a bounded pool. Once a block has completely passed
      // behind the chase camera it is hidden, recycled to the far end, and only
      // becomes renderable again when it re-enters the forward corridor.
      if (item.mesh.position.z < -72) item.mesh.position.z += item.span;
      else if (item.mesh.position.z > item.span + 40) item.mesh.position.z -= item.span;
      item.mesh.visible = item.mesh.position.z > -62 && item.mesh.position.z < SCENERY_FAR_VISIBLE;
    });
  }

  function updateCameraRig(delta) {
    if (currentPreset) return;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, cameraHeight, 1 - Math.exp(-8 * delta));
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, -cameraDistance, 1 - Math.exp(-8 * delta));
    const targetY = cameraHeight - Math.tan(THREE.MathUtils.degToRad(cameraAngle)) * (TARGET_Z + cameraDistance);
    controls.target.y = THREE.MathUtils.lerp(controls.target.y, targetY, 1 - Math.exp(-8 * delta));
  }

  function update(delta, elapsed, maxed) {
    carAudio.update({
      rpm: Math.abs(speed) < 1 && !isAccelerating ? 0 : 1200 + torque * 6800,
      speed: Math.abs(speed),
      accelerating: isAccelerating,
      braking: isBraking,
      shifting: shiftTimer > 0,
      maxed,
      steerDirection,
    });
    updateWind(delta, maxed);
    updateBackfire(delta, elapsed, maxed);
    updateTurnSignals(delta);
    updateSuspension(delta);
    updateShots(delta);
    updateTraffic(delta);
    updateBursts(delta);
    updateScenery();
    updateCameraRig(delta);
    if (impactFlash > 0) {
      impactFlash = Math.max(0, impactFlash - delta);
      bodyPitch += impactFlash * 0.08;
      model.car.rotation.x = bodyPitch;
    }
  }

  function animate() {
    frameId = requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    if (currentPreset) {
      const t = Math.min((performance.now() - transitionStart) / 950, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fromPosition, currentPreset.position, eased);
      controls.target.lerpVectors(fromTarget, currentPreset.target, eased);
      if (t >= 1) currentPreset = null;
    }
    updateDriving(delta, elapsed);
    const maxed = raceRunning && torque > 0.92 && speed > MAX_SPEED - 8;
    update(delta, elapsed, maxed);
    renderer.info.reset();
    const glowPulse = lightsEnabled ? 2.7 + Math.sin(elapsed * 2.2) * 0.18 : 0;
    model.lightMeshes.forEach((lens) => { lens.material.emissiveIntensity = glowPulse; });
    controls.update();
    composer.render();
  }

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    raceWorld.fitSky();
  };
  const onFullscreenChange = () => resize();
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  animate();
  raceWorld.ready
    .then(() => {
      if (disposed || typeof onReady !== 'function') return;
      requestAnimationFrame(() => requestAnimationFrame(onReady));
    })
    .catch((error) => {
      console.error('Essential scenery failed to load.', error);
      if (!disposed && typeof onReady === 'function') onReady();
    });

  window.render_game_to_text = () => JSON.stringify({
    coordinateSystem: 'Three.js world coordinates: +x right, +y up, +z toward the front of the car',
    camera: currentPreset ? 'transitioning' : 'settled',
    race: {
      running: raceRunning,
      speed: Number(speed.toFixed(1)),
      steer: Number(steer.toFixed(2)),
      carX: Number(carX.toFixed(2)),
      torque: Number(torque.toFixed(2)),
      gear: gearIndex + 1,
      shifting: shiftTimer > 0,
      travelPerSecond: Number((speed * WORLD_SCALE).toFixed(1)),
    },
    traffic: {
      active: raceWorld.traffic.slots.filter((slot) => slot.active).length,
      ahead: raceWorld.traffic.slots.filter((slot) => slot.active && slot.mesh.position.z >= 0).length,
      behind: raceWorld.traffic.slots.filter((slot) => slot.active && slot.mesh.position.z < 0).length,
      changingLanes: raceWorld.traffic.slots.filter((slot) => slot.active && slot.laneChanging).length,
      laneChanges,
      fastest: Number(Math.max(0, ...raceWorld.traffic.slots.filter((slot) => slot.active).map((slot) => slot.speed)).toFixed(1)),
      speedLimit: Number(MAX_TRAFFIC_SPEED.toFixed(1)),
      nearest: raceWorld.traffic.slots
        .filter((slot) => slot.active)
        .sort((a, b) => Math.abs(a.mesh.position.z) - Math.abs(b.mesh.position.z))
        .slice(0, 8)
        .map((slot) => ({
          x: Number(slot.x.toFixed(2)),
          z: Number(slot.mesh.position.z.toFixed(1)),
          speed: Number(slot.speed.toFixed(1)),
          targetLane: slot.targetLane,
        })),
      // Any car close enough to be unavoidable that is sharing our lane band.
      playerLaneIntrusions: raceWorld.traffic.slots.filter((slot) => slot.active
        && Math.abs(slot.mesh.position.z) < TRAFFIC_SAFE_ZONE
        && Math.abs(slot.mesh.position.x - carX) <= TRAFFIC_LANE_CLEARANCE).length,
      initialSeed: TRAFFIC_SEED_COUNT,
      maxActive: TRAFFIC_MAX_ACTIVE,
      raceTime: Number(raceTime.toFixed(1)),
      collisions,
      launched: raceWorld.traffic.slots.filter((slot) => slot.active && slot.launched).length,
    },
    neonShots: {
      inFlight: shots.slots.filter((shot) => shot.active).length,
      cooldown: Number(shotCooldown.toFixed(2)),
      fired: shotsFired,
      hits: shotHits,
      bursts: bursts.slots.filter((burst) => burst.active).length,
    },
    render: {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    },
    physics: {
      // Any pair still interpenetrating after a resolve pass is a solver
      // failure: bodies are supposed to be impenetrable.
      carOverlaps: (() => {
        // Launched wrecks are excluded: they are metres above the road, so an
        // x/z overlap with a car still driving is not a contact.
        const live = raceWorld.traffic.slots.filter((slot) => slot.active && !slot.launched);
        let count = 0;
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const spread = live[i].taper + live[j].taper;
            if (Math.abs(live[i].x - live[j].x) < CAR_HALF_X * spread - CONTACT_EPSILON
              && Math.abs(live[i].mesh.position.z - live[j].mesh.position.z) < CAR_HALF_Z * spread - CONTACT_EPSILON) count += 1;
          }
        }
        return count;
      })(),
      // Where any residual overlap is, so a solver failure can be told from a
      // pair converging in the distance.
      carOverlapPairs: (() => {
        const live = raceWorld.traffic.slots.filter((slot) => slot.active && !slot.launched);
        const pairs = [];
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const spread = live[i].taper + live[j].taper;
            const dx = Math.abs(live[i].x - live[j].x);
            const dz = Math.abs(live[i].mesh.position.z - live[j].mesh.position.z);
            if (dx < CAR_HALF_X * spread - CONTACT_EPSILON && dz < CAR_HALF_Z * spread - CONTACT_EPSILON) {
              pairs.push({
                z: [Number(live[i].mesh.position.z.toFixed(1)), Number(live[j].mesh.position.z.toFixed(1))],
                dx: Number(dx.toFixed(2)),
                dz: Number(dz.toFixed(2)),
                taper: [Number(live[i].taper.toFixed(2)), Number(live[j].taper.toFixed(2))],
              });
            }
          }
        }
        return pairs;
      })(),
      playerOverlaps: raceWorld.traffic.slots.filter((slot) => slot.active
        && Math.abs(slot.x - carX) < HIT_HALF_X && Math.abs(slot.mesh.position.z) < HIT_HALF_Z).length,
      carVX: Number(carVX.toFixed(2)),
    },
    wind: { active: wind.lines.visible, opacity: Number(wind.lines.material.opacity.toFixed(2)) },
    audio: carAudio.getState(),
    camera3rd: { height: Number(cameraHeight.toFixed(2)), angle: Number(cameraAngle.toFixed(1)), distance: Number(cameraDistance.toFixed(2)) },
    horizon: {
      screenY: 0.5,
      sunCameraLocked: true,
      roadTaperStartsAt: ROAD_TAPER_Z,
      roadFarHalfWidth: ROAD_FAR_HALF_WIDTH,
    },
    scenery: {
      assetsReady: raceWorld.scenery.assetsReady,
      loaded: raceWorld.scenery.items.length,
      visible: raceWorld.scenery.items.filter((item) => item.mesh.visible).length,
      palms: raceWorld.scenery.items.filter((item) => item.kind === 'palm').length,
      buildings: raceWorld.scenery.items.filter((item) => item.kind === 'building' || item.kind === 'far-building').length,
      rockBlocks: raceWorld.scenery.items.filter((item) => item.kind === 'rocks').length,
      rockMaxHeight: ROCK_MAX_HEIGHT,
    },
    floorScroll: Number(raceWorld.gridTexture.offset.y.toFixed(3)),
    wheelsSpinning,
    backfire: {
      active: backfireTime > 0,
      remainingSeconds: Number(backfireTime.toFixed(2)),
      exhaustCount: 4,
    },
    turnSignal: {
      activeSide: activeTurnSignal,
      sequenceStep: activeTurnSignal ? Math.min(6, Math.floor((turnSignalTime % 1.1) / 0.12) + 1) : 0,
    },
    suspension: {
      phase: suspension.phase,
      bodyHeight: Number(model.car.position.y.toFixed(3)),
      wheelContactHeight: Number((model.car.position.y + model.wheels[0].position.y - 0.673).toFixed(3)),
      wheelArchClearance: 0.027,
      wheelWidthScale: 1.7,
      wheelArchThicknessScale: 1.8,
    },
    lightsEnabled,
  });
  window.advanceTime = (ms, renderFrame = true) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      const stepElapsed = clock.elapsedTime + i / 60;
      updateDriving(1 / 60, stepElapsed);
      const maxed = raceRunning && torque > 0.92 && speed > MAX_SPEED - 8;
      update(1 / 60, stepElapsed, maxed);
    }
    if (renderFrame) {
      controls.update();
      renderer.info.reset();
      composer.render();
    }
  };

  return {
    setRunning(enabled) { raceRunning = enabled; },
    setSoundEnabled(enabled) { return carAudio.setEnabled(enabled); },
    setMusicVolume(value) { return carAudio.setMusicVolume(value); },
    setSfxVolume(value) { return carAudio.setSfxVolume(value); },
    selectGear(index) { selectGear(index); },
    fireNeonShot() { fireNeonShot(); },
    setCameraRig({ height, angle, distance }) {
      if (typeof height === 'number') cameraHeight = THREE.MathUtils.clamp(height, 1.4, 9);
      if (typeof angle === 'number') cameraAngle = THREE.MathUtils.clamp(angle, -2, 30);
      if (typeof distance === 'number') cameraDistance = THREE.MathUtils.clamp(distance, 4.5, 26);
    },
    getCameraRig() { return { height: cameraHeight, angle: cameraAngle, distance: cameraDistance }; },
    setCamera(name) {
      const preset = cameraPresets[name];
      if (!preset) return;
      fromPosition = camera.position.clone();
      fromTarget = controls.target.clone();
      currentPreset = preset;
      transitionStart = performance.now();
    },
    setLights(enabled) {
      lightsEnabled = enabled;
      keyPink.intensity = enabled ? 14 : 4;
      keyBlue.intensity = enabled ? 12 : 4;
      rearGlow.intensity = enabled ? 12 : 0;
    },
    setWheelsSpinning(enabled) { wheelsSpinning = enabled; },
    triggerBackfire() {
      backfireTime = backfireDuration;
      model.backfire.sparks.forEach((spark) => spark.position.copy(spark.userData.origin));
    },
    setAutoRotate(enabled) { controls.autoRotate = enabled; },
    setTurnSignal(side) {
      activeTurnSignal = side === 'left' || side === 'right' ? side : null;
      turnSignalTime = 0;
    },
    triggerDrop() {
      suspension.phase = 'falling';
      suspension.velocity = 0;
      suspension.springTime = 0;
      model.car.position.y = carRestY + 2.35;
      model.wheels.forEach((wheel) => { wheel.position.y = wheelRestY; });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
      carAudio.dispose();
      composer.dispose();
      renderer.dispose();
      pmrem.dispose();
      environment.dispose();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material?.dispose?.();
      });
      renderer.domElement.remove();
      delete window.render_game_to_text;
      delete window.advanceTime;
    },
  };
}
