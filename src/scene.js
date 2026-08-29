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
// Holding the trigger fires at this fixed cadence. A discrete tap bypasses it
// entirely and fires immediately — only the 8-slot pool below caps how fast a
// user can out-click it.
const SHOT_HOLD_INTERVAL = 0.5;
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
    slots.push({ mesh: bolt, active: false, x: 0, y: 0.78, z: 0 });
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

// Gold coins laid along the road in orderly queues rather than scattered: a
// group is five coins evenly spaced down one lane, and the next group picks a
// different lane, so the road reads as a deliberate trail to follow instead of
// a random sprinkle. Collecting a coin only removes that coin; a whole group
// is relaid ahead, in a new lane, once its entire queue has passed the player.
const COIN_GROUP_SIZE = 5;
const COIN_GROUP_COUNT = 3;
const COIN_POOL_SIZE = COIN_GROUP_SIZE * COIN_GROUP_COUNT;
// Gap between consecutive coins in one queue. At full speed the player crosses
// this in ~0.09 s, which is what makes a run down a queue read as a streak.
const COIN_SPACING = 9;
const COIN_MIN_Z = 55;
// Clear road between the tail of one queue and the head of the next, so the
// lane change between groups is legible rather than one continuous ribbon.
const COIN_GROUP_GAP_MIN = 48;
const COIN_GROUP_GAP_MAX = 96;
const COIN_COLLECT_HALF_X = 1.5;
const COIN_COLLECT_HALF_Z = 1.6;
// Local z of the last coin in a queue, relative to the queue's head.
const COIN_QUEUE_LENGTH = (COIN_GROUP_SIZE - 1) * COIN_SPACING;

function createCoins(scene) {
  const group = new THREE.Group();
  group.name = 'coins';
  const geometry = new THREE.CylinderGeometry(0.46, 0.46, 0.11, 22);
  // Baked into the geometry once so the coin's face points at the camera by
  // default; the per-frame spin then just animates rotation.y.
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffd23d, emissive: 0xffae00, emissiveIntensity: 2.4, metalness: 0.78, roughness: 0.26,
  });
  const groups = [];
  for (let g = 0; g < COIN_GROUP_COUNT; g += 1) {
    const slots = [];
    for (let i = 0; i < COIN_GROUP_SIZE; i += 1) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      addEdges(mesh, 0xfff2c2, 0.55, 12);
      group.add(mesh);
      slots.push({ mesh, collected: false });
    }
    // `headZ` is the queue's leading coin — the lowest z, and so the first one
    // the player reaches as the world scrolls toward them.
    groups.push({ lane: LANES[g % LANES.length], headZ: 0, slots });
  }
  scene.add(group);
  return { group, groups };
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
export const MAX_PLAYER_SPEED = 220;
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
// The player's own half-width and lateral authority. Both live out here rather
// than in the experience closure because the passage sweep below is a pure
// function of the traffic and the car's x, and is exercised directly by tests.
const CAR_HALF_WIDTH = 1.45;
const LATERAL_SPEED = 9.5;
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

// The road must always offer a way through at full throttle — this game is
// about weaving without lifting, not about braking. Reserving a whole lane
// outright would have traffic shuffling constantly at this density, so instead
// the corridor ahead is swept as a reachability problem: the player's lateral
// speed bounds how far sideways they can get per unit of road travelled, so the
// set of x positions still reachable is carried slice by slice through the free
// gaps between cars. If that set ever empties, the road is genuinely walled and
// one car is moved to open it (see openPassage).
const PASSAGE_SLICES = 11;
const PASSAGE_SLICE_LENGTH = 13;
// The sweep is about the road ahead, not the car's immediate surroundings.
// Starting it level with the player instead makes simply driving alongside
// another car register as a wall — the player's own body fills the slice — and
// the correction below would then be shoving traffic out of the way at
// touching distance, which is exactly the dodging the traffic must never do.
const PASSAGE_START_Z = 26;
// A gap must beat this to count as drivable. The blockers below already carry
// the player's own half-width, so this is pure comfort margin on top.
const PASSAGE_MIN_GAP = 0.5;
// No car nearer than this is ever moved to open a corridor. Inside it, a
// correction would read as traffic dodging the player — the one thing this
// traffic must never do — and a wall that close was the driver's to steer
// around anyway. Comfortably beyond TRAFFIC_SAFE_ZONE, the band where spawns
// already keep clear of the player.
const PASSAGE_ACTION_MIN_Z = 90;
// Minimum seconds between corrections, so the road rearranges at the pace of
// traffic rather than snapping open.
const PASSAGE_ACTION_INTERVAL = 0.5;
// Slices in the maintained corridor. Enough to reach past TRAFFIC_SPAWN_Z from
// PASSAGE_ACTION_MIN_Z, so a burst of spawns that lands a ready-made wall is
// caught the frame it is created — seconds before it drifts close enough that
// clearing it would be either rushed or off-limits.
const PASSAGE_WALL_SLICES = 10;

// Free x-spans across one z-slice: the drivable road minus every car body that
// reaches into it. Cars are placed where they will actually be when the player
// arrives, so one already sliding out of the way is not counted as a wall.
function passageSpans(live, z, arrivalTime) {
  const limit = roadHalfWidthAt(z) - CAR_HALF_WIDTH * taperAt(z);
  if (limit <= 0) return [];
  let spans = [[-limit, limit]];
  for (const slot of live) {
    const slotZ = slot.mesh.position.z;
    if (Math.abs(slotZ - z) > HIT_HALF_Z + PASSAGE_SLICE_LENGTH / 2) continue;
    const targetX = laneXAtZ(slot.targetLane, slotZ);
    const travel = LANE_CHANGE_SPEED * arrivalTime;
    const predictedX = slot.x + THREE.MathUtils.clamp(targetX - slot.x, -travel, travel);
    const reach = HIT_HALF_X * slot.taper;
    const lo = predictedX - reach;
    const hi = predictedX + reach;
    const next = [];
    for (const span of spans) {
      if (hi <= span[0] || lo >= span[1]) next.push(span);
      else {
        if (lo > span[0]) next.push([span[0], lo]);
        if (hi < span[1]) next.push([hi, span[1]]);
      }
    }
    spans = next;
    if (!spans.length) return spans;
  }
  return spans.filter((span) => span[1] - span[0] >= PASSAGE_MIN_GAP);
}

// Widens every span by `reach` on both sides and merges what now overlaps.
// Inputs are sorted and disjoint, and both properties survive.
function dilateSpans(spans, reach) {
  const merged = [];
  for (const span of spans) {
    const lo = span[0] - reach;
    const hi = span[1] + reach;
    const last = merged[merged.length - 1];
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  return merged;
}

function intersectSpans(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]);
    const hi = Math.min(a[i][1], b[j][1]);
    if (hi - lo >= PASSAGE_MIN_GAP) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i += 1;
    else j += 1;
  }
  return out;
}

// How long until the player reaches a given z, planned at the top speed they
// are entitled to hold. That is the tightest lateral budget and the shortest
// warning, so a corridor that survives this check survives at any speed.
function arrivalTimeAt(z) {
  return Math.max(0, z) / (MAX_PLAYER_SPEED * WORLD_SCALE);
}

// Index of the first slice ahead the player can no longer reach any part of,
// or -1 when the corridor stays open the whole way out. Exported so the
// guarantee can be exercised directly against adversarial traffic rather than
// only observed through a live drive.
// `onRoad` false means the car is off riding a ramp or flying the easter egg.
// Its x is then somewhere out past the kerb and says nothing about where it
// will rejoin, so the sweep asks the weaker question that actually matters
// there — whether a passage exists at all — rather than pinning the plan to a
// position the player is not in and would not land at.
export function firstBlockedSlice(live, carX, {
  onRoad = true, slices = PASSAGE_SLICES, startZ = PASSAGE_START_Z,
} = {}) {
  // Lateral units the player can buy per unit of road, at the top speed they
  // are entitled to hold.
  const perUnit = LATERAL_SPEED / (MAX_PLAYER_SPEED * WORLD_SCALE);
  const reach = perUnit * PASSAGE_SLICE_LENGTH;
  const edge = ROAD_HALF_WIDTH - CAR_HALF_WIDTH;
  // The first slice is further off than the rest, so it gets its own budget.
  const seedReach = perUnit * startZ;
  const from = THREE.MathUtils.clamp(carX, -edge, edge);
  let spans = onRoad
    ? [[Math.max(-edge, from - seedReach), Math.min(edge, from + seedReach)]]
    : [[-edge, edge]];
  for (let i = 0; i < slices; i += 1) {
    const z = startZ + i * PASSAGE_SLICE_LENGTH;
    if (i > 0) spans = dilateSpans(spans, reach);
    spans = intersectSpans(spans, passageSpans(live, z, arrivalTimeAt(z)));
    if (!spans.length) return i;
  }
  return -1;
}

// The corridor the system actually maintains, and the only one it will move a
// car to protect: from the distance where a correction still reads as traffic
// flowing rather than dodging, out past the spawn band.
//
// It is seeded with the whole road rather than the player's own x on purpose.
// Judging a far wall from where the car happens to be right now conflates two
// different things: a genuine wall, which is the road's fault and fixable, and
// the player having simply not moved over yet, which is theirs. Worse, a near
// obstruction the policy forbids touching would otherwise shadow every fixable
// wall behind it — openPassage stops at the first blocked slice — so the far
// road silently stopped being maintained exactly when it was busiest.
export function firstWallAhead(live) {
  return firstBlockedSlice(live, 0, {
    onRoad: false, slices: PASSAGE_WALL_SLICES, startZ: PASSAGE_ACTION_MIN_Z,
  });
}

// Centre of the widest gap in the traffic at a given distance — where a driver
// looking that far up the road would aim. Null when nothing is open there.
export function aimXAt(live, z) {
  const spans = passageSpans(live, z, arrivalTimeAt(z));
  let best = null;
  for (const span of spans) {
    if (!best || span[1] - span[0] > best[1] - best[0]) best = span;
  }
  return best ? (best[0] + best[1]) / 2 : null;
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
      // How long this car has been blocked with nowhere to go. A long enough
      // wait eases how tight a gap it will accept, so a jam can't pin a car
      // in place forever — see planTrafficMotion / laneClearance.
      stuckTime: 0,
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

// A side ramp: a single-lane strip that peels off the outer lane like a
// highway exit, climbs, and ends in an upward-angled lip. It never rejoins
// the road as a driveable surface — reaching the lip launches the car
// airborne, and it comes back down on the main road under gravity. The
// player is fixed at world z = 0, so every point along the ramp's own local
// length `s` (0 at the branch-off, RAMP_LENGTH at the lip) passes under the
// car exactly once as the ramp's rigid mesh scrolls toward and past it — s
// for whatever point currently coincides with the player is recovered as
// `-mesh.position.z`.
const RAMP_LENGTH = 55;
// Kept modest on purpose: the chase camera holds a fixed height (a deliberate
// setting, not a car-follow rig — see AGENTS.md), so a launch has to stay low
// enough that the car does not fly above the frame it can't chase into.
const RAMP_PEAK_HEIGHT = 2.4;
// Higher = the climb stays flatter for longer and steepens only near the
// lip, which is what gives the exit a "ski jump" rather than a straight
// incline.
const RAMP_HEIGHT_EXPONENT = 3;
const RAMP_LATERAL_OFFSET = 6.5;
const RAMP_ENTRY_TOLERANCE = 1.3;
const RAMP_DECK_WIDTH = 3;

function rampProgress(s) {
  return THREE.MathUtils.clamp(s / RAMP_LENGTH, 0, 1);
}

// Unsigned lateral offset from the road centreline at local distance `s`;
// the caller multiplies by the ramp's side (+1/-1) for world x.
function rampXOffsetAt(s) {
  const t = rampProgress(s);
  const eased = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(Math.abs(LANES[LANES.length - 1]), ROAD_HALF_WIDTH + RAMP_LATERAL_OFFSET, eased);
}

function rampHeightAt(s) {
  return RAMP_PEAK_HEIGHT * rampProgress(s) ** RAMP_HEIGHT_EXPONENT;
}

// Derivative of rampHeightAt with respect to s: how steep the deck is at
// that point, in rise per unit of travel. At s = RAMP_LENGTH this is also
// what turns the car's own forward speed into a launch vY (see updateRamp).
function rampSlopeAt(s) {
  const t = rampProgress(s);
  return (RAMP_PEAK_HEIGHT * RAMP_HEIGHT_EXPONENT * t ** (RAMP_HEIGHT_EXPONENT - 1)) / RAMP_LENGTH;
}

// Built once for side = +1; a spawn mirrors it with scale.x = -1 rather than
// rebuilding the geometry.
function buildSideRampMesh() {
  const group = new THREE.Group();
  group.name = 'side-ramp';
  const segments = 26;
  const positions = [];
  const indices = [];
  const leftEdge = [];
  const rightEdge = [];
  for (let i = 0; i <= segments; i += 1) {
    const s = (i / segments) * RAMP_LENGTH;
    const x = rampXOffsetAt(s);
    const y = rampHeightAt(s);
    positions.push(x - RAMP_DECK_WIDTH / 2, y, s, x + RAMP_DECK_WIDTH / 2, y, s);
    leftEdge.push(new THREE.Vector3(x - RAMP_DECK_WIDTH / 2, y + 0.02, s));
    rightEdge.push(new THREE.Vector3(x + RAMP_DECK_WIDTH / 2, y + 0.02, s));
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const deck = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x0a0714, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide,
  }));
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  [leftEdge, rightEdge].forEach((points) => {
    const edgeGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.95, toneMapped: false });
    group.add(new THREE.Line(edgeGeometry, edgeMaterial));
  });
  group.visible = false;
  return group;
}

// Roadside warning sign for the ramp: a canvas-texture board (real road-sign
// yellow/black diagonal stripe, so it reads as "hazard ahead" at a glance)
// plus a neon-blue arrow matching the ramp's own edge colour, on a post at
// the shoulder. Two are placed at different lead distances ahead of the
// ramp's entry — see RAMP_SIGN_LEAD_FAR/NEAR — so the player gets an early
// warning and a closer confirmation.
function createRampSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.clip();
  ctx.strokeStyle = '#ffcf1a';
  ctx.lineWidth = 26;
  for (let x = -canvas.height; x < canvas.width + canvas.height; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, canvas.height);
    ctx.lineTo(x + canvas.height, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#050505';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  // Upward ramp arrow.
  ctx.strokeStyle = '#35f5ff';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = '#35f5ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(60, 200);
  ctx.lineTo(150, 200);
  ctx.lineTo(150, 110);
  ctx.lineTo(196, 110);
  ctx.lineTo(130, 44);
  ctx.lineTo(64, 110);
  ctx.lineTo(110, 110);
  ctx.lineTo(110, 160);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildRampSign() {
  const group = new THREE.Group();
  group.name = 'ramp-sign';
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 2.3, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6, metalness: 0.3 }),
  );
  post.position.y = 1.15;
  post.castShadow = true;
  group.add(post);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: createRampSignTexture(), toneMapped: false, side: THREE.DoubleSide }),
  );
  board.position.set(0, 2.15, 0);
  group.add(board);
  group.visible = false;
  return group;
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
  // it was before the far plane moved. Thinned further still: at 0.0034
  // buildings stayed under 6% visible past z=500 and only really emerged from
  // z~400, which read as popping out of nowhere. At 0.0022 they're ~30%
  // visible (a soft, growing silhouette) by z=500 and ~65% by z=300, while the
  // far LOD skyline's own edge (~z=790) is still faint enough (~5%) that its
  // hard visibility cutoff never reads as a pop.
  scene.fog = new THREE.FogExp2(0x120526, 0.0022);
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
  const coins = createCoins(scene);
  // Function declarations are hoisted, so the first queues can be laid out
  // here even though resetCoins is defined further down with the rest of the
  // per-race state.
  resetCoins();
  const sideRamp = buildSideRampMesh();
  scene.add(sideRamp);
  const rampSignFar = buildRampSign();
  const rampSignNear = buildRampSign();
  scene.add(rampSignFar, rampSignNear);
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
  // Torque's rise rate while accelerating is implicitly 1/GEAR_SECONDS (it
  // tracks speed linearly across a band that takes GEAR_SECONDS to cross).
  // Braking and coasting decay it at the same rate, so it never falls faster
  // than it built up.
  const TORQUE_RATE = 1 / GEAR_SECONDS;
  const SHIFT_SECONDS = 0.42;
  const SHIFT_SPEED_LOSS = 9;
  const LAUNCH_SECONDS = 0.55;
  const LAUNCH_BOOST = 116;
  const BRAKE_DECEL = 160;
  const REVERSE_ACCEL = 55;
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
  // How many times the passage sweep had to step in. Watched during tuning:
  // a high rate means the traffic density is fighting the guarantee rather
  // than living inside it.
  let passageOpenings = 0;
  let passageCooldown = 0;
  let wasRunning = false;
  // Counts up toward SHOT_HOLD_INTERVAL while Space is held; a discrete tap
  // fires immediately and does not wait on this.
  let spaceAutoFireTimer = 0;
  let shotsFired = 0;
  let shotHits = 0;
  let coinsCollected = 0;
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

  // Side-ramp jump. 'none': not on it. 'riding': following its curve, x and y
  // are on rails. 'airborne': just launched off the lip; the suspension state
  // machine now owns y (as a 'falling' phase) while this only eases x back
  // toward the road.
  const RAMP_SPAWN_Z = 175;
  // Roughly five times as many ramps as before. Most of a cycle is travel
  // rather than waiting: 120 units for the ramp to follow its warning signs in,
  // then 255 more for it to clear the camera — about 3.9 s at full speed — so
  // the idle gap below is what is left to reach a ~6.5 s period.
  const RAMP_FIRST_DELAY = 2;
  const RAMP_INTERVAL_MIN = 1.5;
  const RAMP_INTERVAL_MAX = 3.5;
  // How far the player travels between passing a warning sign and reaching the
  // ramp's own entry point. The world only ever scrolls one way, so an object
  // is reached in ascending z: to be passed *before* the ramp, a sign has to
  // sit at a *lower* z than it. Spawning it lower would make it pop into
  // existence a short way in front of the bumper, so instead every piece of a
  // ramp announcement is spawned at the same far RAMP_SPAWN_Z and staged by
  // how far the world has scrolled since the cycle began (rampCycleTravel).
  // Each one therefore fades in out of the same distance, and the far sign is
  // always reached first, then the near sign, then the ramp.
  const RAMP_SIGN_LEAD_FAR = 120;
  const RAMP_SIGN_LEAD_NEAR = 55;
  let rampActive = false;
  let rampSide = 1;
  let rampState = 'none';
  let rampSpawnTimer = RAMP_FIRST_DELAY;
  let rampLandingTargetX = 0;
  let rampLaunches = 0;
  // Distance scrolled since the current announcement's far sign appeared, or
  // -1 when no cycle is staged.
  let rampCycleTravel = -1;

  // Hidden flight mode. Tapping Space while the car is still in the air off a
  // ramp trades the cannon for the controls of a low-flying car: the arrows
  // become altitude and lateral drift, the throttle pins itself at maximum,
  // and the road below is just scenery until the player chooses to touch down.
  // Deliberately undocumented in the on-screen key list — it is an easter egg.
  const FLIGHT_CEILING = 26;
  const FLIGHT_CLIMB_SPEED = 12;
  const FLIGHT_LATERAL_SPEED = 14;
  // How far off the centreline the flight may wander. Well outside the road,
  // but inside the detailed scenery ring so there is always something to see.
  const FLIGHT_HALF_WIDTH = 24;
  // Below this the flight is on approach and the corridor narrows to the road
  // itself, so coming down always ends on the deck. A launch throws the car
  // well past the kerb, so without this a descent out over the rocks would
  // stall at a floor with nothing on screen explaining why — and landing there
  // outright would teleport the car back inside the road clamp from twenty
  // units away. Funnelling it in costs the player no control they would miss:
  // they still choose when to descend.
  const FLIGHT_LANDING_Y = 7;
  let flightState = 'none';
  let flightY = 0;
  let flights = 0;

  // True only when the car is genuinely down on the road sharing it with
  // traffic. Riding or flying deliberately takes it outside those bounds, so
  // the road-edge clamp and player-vs-traffic collision both stand down.
  function carOnRoad() {
    return rampState === 'none' && flightState === 'none';
  }

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
      // Each physical press fires once immediately, however fast the user is
      // clicking. Holding the key down additionally keeps it in `keys`, which
      // the fixed-cadence auto-fire in updateShots reads every frame.
      if (!event.repeat) {
        // The one exception: mid-flight off a ramp, this press takes off
        // instead of firing. Once flying, Space goes back to being the cannon.
        if (rampState === 'airborne' && flightState === 'none') startFlight();
        else fireNeonShot();
        spaceAutoFireTimer = 0;
      }
      keys.add(event.code);
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  };
  const onKeyUp = (event) => {
    keys.delete(event.code);
    if (event.code === 'Space') spaceAutoFireTimer = 0;
  };
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
    const flying = flightState === 'flying';
    const accelerating = keys.has('ArrowUp') || keys.has('KeyW');
    const braking = keys.has('ArrowDown') || keys.has('KeyS');
    // In flight the arrows fly the car rather than drive it, so the engine is
    // reported as pinned open regardless of which of them is held.
    isAccelerating = raceRunning && (flying || (accelerating && !braking));
    isBraking = raceRunning && braking && !flying;
    const steeringLeft = !flying && (keys.has('ArrowLeft') || keys.has('KeyA'));
    const steeringRight = !flying && (keys.has('ArrowRight') || keys.has('KeyD'));
    let pitchTarget = 0;

    if (!raceRunning) {
      speed = THREE.MathUtils.lerp(speed, 0, 1 - Math.exp(-3 * delta));
      torque = THREE.MathUtils.lerp(torque, 0, 1 - Math.exp(-5 * delta));
      gearIndex = 0;
      shiftTimer = 0;
      launchTimer = 0;
    } else if (flying) {
      // Throttle held wide open for the whole flight: altitude is the only
      // thing the player is steering now.
      speed = THREE.MathUtils.lerp(speed, MAX_SPEED, 1 - Math.exp(-3 * delta));
      torque = THREE.MathUtils.lerp(torque, 1, 1 - Math.exp(-3 * delta));
      gearIndex = GEARS.length - 1;
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
      // Torque bleeds off no faster than it built up in the first place.
      torque = Math.max(0, torque - TORQUE_RATE * delta);
      gearIndex = gearForSpeed(Math.abs(speed));
    } else {
      // Off-throttle, the car sheds speed at exactly the rate it would have
      // gained it in the current gear, so coasting mirrors acceleration
      // instead of a flat constant that used to decelerate harder than any
      // gear could accelerate.
      const gear = GEARS[gearForSpeed(Math.abs(speed))];
      const drop = ((gear.max - gear.min) / GEAR_SECONDS) * delta;
      speed = drop >= Math.abs(speed) ? 0 : speed - Math.sign(speed) * drop;
      torque = Math.max(0, torque - TORQUE_RATE * delta);
      gearIndex = gearForSpeed(Math.abs(speed));
    }
    prevAccelerating = accelerating;
    speed = THREE.MathUtils.clamp(speed, MAX_REVERSE, MAX_SPEED);
    // While flying, updateFlight pitches the nose to the climb instead.
    if (!flying) {
      bodyPitch = THREE.MathUtils.lerp(bodyPitch, pitchTarget, 1 - Math.exp(-12 * delta));
      model.car.rotation.x = bodyPitch;
    }

    // Screen-right is world -x from the chase camera, so lateral motion and the
    // nose yaw both invert the raw steer input.
    const steerTarget = steeringLeft ? -1 : steeringRight ? 1 : 0;
    // Raw input, not the smoothed value: the scrub effect should fire the moment
    // the wheel is flicked, including on a direct left-to-right reversal.
    steerDirection = raceRunning ? steerTarget : 0;
    steer = THREE.MathUtils.lerp(steer, steerTarget, 1 - Math.exp(-8 * delta));
    const steerAuthority = THREE.MathUtils.clamp(Math.abs(speed) / 26, 0.22, 1);
    // updateFlight owns carX outright while flying, so the road-going steering
    // must not also integrate into it.
    if (!flying) {
      carX -= steer * LATERAL_SPEED * steerAuthority * delta;
      // Sideways knocks from a contact ride on top of the steering and decay.
      carX += carVX * delta;
    }
    carVX -= carVX * Math.min(1, LATERAL_DAMPING * delta);
    // The side ramp and the flight easter egg both intentionally take the car
    // outside the road's normal bounds; updateRamp / updateFlight own carX for
    // the rest of the frame in those states, so the everyday clamp stands down.
    if (carOnRoad()) {
      carX = THREE.MathUtils.clamp(carX, -(ROAD_HALF_WIDTH - CAR_HALF_WIDTH), ROAD_HALF_WIDTH - CAR_HALF_WIDTH);
      model.car.position.x = carX;
    }
    if (!flying) {
      model.car.rotation.z = THREE.MathUtils.lerp(model.car.rotation.z, -steer * 0.045 + carVX * 0.012, 1 - Math.exp(-6 * delta));
      model.car.rotation.y = THREE.MathUtils.lerp(model.car.rotation.y, -steer * 0.16 - carVX * 0.02, 1 - Math.exp(-5 * delta));
    }
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
        hits: shotHits,
        coins: coinsCollected,
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
    // No cooldown gate: a tap always fires. The pool (8 slots, each bolt
    // alive under a second at SHOT_SPEED) is the only limit on click rate.
    if (!raceRunning) return;
    const shot = shots.slots.find((entry) => !entry.active);
    if (!shot) return;
    shot.active = true;
    shot.x = carX;
    shot.z = SHOT_MUZZLE_Z;
    // Tracked per bolt rather than fixed, so a shot fired from altitude during
    // the flight easter egg leaves the muzzle where the muzzle actually is.
    shot.y = model.car.position.y + 0.76;
    shot.mesh.visible = true;
    shot.mesh.position.set(shot.x, shot.y, shot.z);
    shotsFired += 1;
    // Muzzle flash at the nose, so firing reads even when the bolt is already
    // downrange by the next frame. Small and brief — it is right under the lens.
    spawnBurst(carX, shot.y, SHOT_MUZZLE_Z, { scale: 0.3, seconds: 0.16, growth: 2.4 });
    carAudio.shot();
  }

  function updateShots(delta) {
    // Fixed-cadence auto-fire while the key is held. A tap already fired on
    // its own keydown and reset this timer, so holding through a tap does not
    // double up — the next auto-shot still lands a full interval later.
    if (raceRunning && keys.has('Space')) {
      spaceAutoFireTimer += delta;
      if (spaceAutoFireTimer >= SHOT_HOLD_INTERVAL) {
        fireNeonShot();
        spaceAutoFireTimer -= SHOT_HOLD_INTERVAL;
      }
    }
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

  // Relays one queue ahead of every other queue currently out, in a lane it was
  // not already using — that lane switch between groups is the whole point of
  // laying coins out in fives.
  function relayCoinGroup(group) {
    const furthestTail = coins.groups.reduce(
      (max, other) => (other === group ? max : Math.max(max, other.headZ + COIN_QUEUE_LENGTH)),
      COIN_MIN_Z,
    );
    group.headZ = furthestTail + COIN_GROUP_GAP_MIN + Math.random() * (COIN_GROUP_GAP_MAX - COIN_GROUP_GAP_MIN);
    const options = LANES.filter((lane) => lane !== group.lane);
    group.lane = options[Math.floor(Math.random() * options.length)];
    group.slots.forEach((slot) => {
      slot.collected = false;
      slot.mesh.visible = true;
    });
  }

  function resetCoins() {
    let headZ = COIN_MIN_Z;
    coins.groups.forEach((group, index) => {
      group.lane = LANES[index % LANES.length];
      group.headZ = headZ;
      headZ += COIN_QUEUE_LENGTH + COIN_GROUP_GAP_MIN + Math.random() * (COIN_GROUP_GAP_MAX - COIN_GROUP_GAP_MIN);
      group.slots.forEach((slot) => {
        slot.collected = false;
        slot.mesh.visible = true;
      });
    });
    layoutCoins(0);
  }

  // Positions every coin from its group's head. Coins ride the road's taper on
  // x like the traffic does, so a distant queue stays on the narrowing deck
  // instead of hanging off its edge.
  function layoutCoins(delta) {
    coins.groups.forEach((group) => {
      group.slots.forEach((slot, index) => {
        const z = group.headZ + index * COIN_SPACING;
        slot.mesh.position.set(laneXAtZ(group.lane, z), 0.95, z);
        if (!slot.collected) slot.mesh.rotation.y += delta * 2.6;
      });
    });
  }

  function updateCoins(delta) {
    if (!raceRunning) return;
    coins.groups.forEach((group) => {
      group.headZ -= travelThisFrame;
      group.slots.forEach((slot, index) => {
        if (slot.collected) return;
        const z = group.headZ + index * COIN_SPACING;
        if (Math.abs(group.lane - carX) < COIN_COLLECT_HALF_X && Math.abs(z) < COIN_COLLECT_HALF_Z) {
          slot.collected = true;
          slot.mesh.visible = false;
          coinsCollected += 1;
          carAudio.coin();
        }
      });
      // Only once the whole queue is behind the player is the group relaid, so
      // a collected coin leaves a real gap in the line rather than teleporting.
      if (group.headZ + COIN_QUEUE_LENGTH < -8) relayCoinGroup(group);
    });
    layoutCoins(delta);
  }

  // Opens an announcement: picks the side and puts the far warning sign out at
  // the spawn distance. The near sign and the ramp itself follow from
  // updateRampSpawn as the world scrolls, so all three enter from the same
  // distance in the order the player needs to meet them.
  function beginRampCycle() {
    rampSide = Math.random() < 0.5 ? -1 : 1;
    const signX = rampSide * (ROAD_HALF_WIDTH + 1.3);
    rampSignFar.position.set(signX, 0, RAMP_SPAWN_Z);
    rampSignFar.visible = true;
    rampSignNear.position.set(signX, 0, RAMP_SPAWN_Z);
    rampSignNear.visible = false;
    rampCycleTravel = 0;
  }

  function spawnRamp() {
    sideRamp.scale.x = rampSide;
    sideRamp.position.z = RAMP_SPAWN_Z;
    sideRamp.visible = true;
    rampActive = true;
    rampState = 'none';
  }

  function clearRampCycle() {
    rampActive = false;
    rampCycleTravel = -1;
    sideRamp.visible = false;
    rampSignFar.visible = false;
    rampSignNear.visible = false;
  }

  function updateRampSpawn(delta) {
    if (!raceRunning) {
      clearRampCycle();
      rampState = 'none';
      rampSpawnTimer = RAMP_FIRST_DELAY;
      return;
    }
    if (rampCycleTravel < 0) {
      rampSpawnTimer -= delta;
      if (rampSpawnTimer <= 0) beginRampCycle();
      return;
    }

    // Everything already out scrolls by the same travelThisFrame, so the leads
    // established by staggered spawns never close.
    rampCycleTravel += travelThisFrame;
    if (rampSignFar.visible) rampSignFar.position.z -= travelThisFrame;
    if (rampSignNear.visible) rampSignNear.position.z -= travelThisFrame;
    if (rampActive) sideRamp.position.z -= travelThisFrame;

    // The near sign joins once the far one is the right distance ahead of it.
    if (!rampSignNear.visible && rampCycleTravel >= RAMP_SIGN_LEAD_FAR - RAMP_SIGN_LEAD_NEAR) {
      rampSignNear.position.z = RAMP_SPAWN_Z;
      rampSignNear.visible = true;
    }
    // And the ramp last of all, a full lead behind the far sign.
    if (!rampActive && rampCycleTravel >= RAMP_SIGN_LEAD_FAR) spawnRamp();

    // Gated on rampState so the mesh never disappears out from under a car
    // still riding or airborne on it — that would leave updateRamp's guard
    // clause (`if (!rampActive) return`) skipping the rest of its own state
    // machine, stranding rampState off 'none' and, with it, the traffic
    // collision and road-edge clamp it also gates. Once the player is back
    // to 'none' the mesh is already far behind the camera regardless.
    if (rampActive && rampState === 'none' && sideRamp.position.z < -(RAMP_LENGTH + 25)) {
      clearRampCycle();
      rampSpawnTimer = RAMP_INTERVAL_MIN + Math.random() * (RAMP_INTERVAL_MAX - RAMP_INTERVAL_MIN);
    }
  }

  // Drives the player through whichever phase the ramp is in. Called after
  // updateTraffic so its writes to carX/position.x/position.y are the ones
  // that stick for the frame, overriding the normal driving and collision
  // logic that ran earlier — both of which are also gated on rampState
  // elsewhere so they do not fight this.
  function updateRamp(delta) {
    // The flight easter egg takes over the car completely, including from a
    // ramp that is still on screen underneath it.
    if (!rampActive || flightState === 'flying') return;
    // Local distance along the ramp of whatever point currently sits at the
    // player's fixed z = 0, recovered from the rigid mesh's own scroll.
    const s = -sideRamp.position.z;

    if (rampState === 'none' && s >= 0 && s <= RAMP_LENGTH * 0.92) {
      const entryX = rampSide * rampXOffsetAt(s);
      if (Math.abs(carX - entryX) < RAMP_ENTRY_TOLERANCE) rampState = 'riding';
    }

    if (rampState === 'riding') {
      if (s > RAMP_LENGTH) {
        // Off the lip: hand y over to the suspension's free-fall integrator,
        // seeded with an upward velocity so it arcs instead of just dropping.
        // Converting the ramp's own exit slope this way means a faster car
        // launches higher, exactly as leaving a real ramp faster would.
        const worldSpeed = Math.abs(speed) * WORLD_SCALE;
        suspension.phase = 'falling';
        // Clamped, not just floored: the raw slope*speed figure comfortably
        // exceeds what the fixed-height camera can keep framed at highway
        // speed (see RAMP_PEAK_HEIGHT above), so this is a tuned range, not
        // a literal launch-angle conversion.
        suspension.velocity = THREE.MathUtils.clamp(rampSlopeAt(RAMP_LENGTH) * worldSpeed, 5, 7.5);
        model.car.position.y = carRestY + rampHeightAt(RAMP_LENGTH);
        rampLandingTargetX = 0;
        rampState = 'airborne';
        rampLaunches += 1;
        carAudio.rampJump();
      } else {
        const x = rampSide * rampXOffsetAt(s);
        carX = x;
        model.car.position.x = x;
        model.car.position.y = carRestY + rampHeightAt(s);
        model.car.rotation.x = -Math.atan(rampSlopeAt(s));
      }
    } else if (rampState === 'airborne') {
      carX = THREE.MathUtils.lerp(carX, rampLandingTargetX, 1 - Math.exp(-2.2 * delta));
      model.car.position.x = carX;
      // The suspension machine lands (phase leaves 'falling') on its own;
      // once it does, the car is physically back on the road and normal
      // steering/collision resume.
      if (suspension.phase !== 'falling') rampState = 'none';
    }
  }

  function startFlight() {
    flightState = 'flying';
    flightY = model.car.position.y;
    flights += 1;
    // The suspension's free fall handed y over; from here the flight owns it.
    suspension.phase = 'rest';
    suspension.velocity = 0;
    // Back to 'none' so the ramp's own machinery — despawning the deck,
    // scheduling the next announcement — carries on normally underneath. What
    // keeps the road clamp and traffic collision switched off is now
    // flightState, via carOnRoad().
    rampState = 'none';
    carAudio.flightStart();
  }

  function endFlight() {
    flightState = 'none';
    flightY = carRestY;
    model.car.position.y = carRestY;
    bodyPitch = 0;
    // Land on the springs, exactly as a ramp jump does.
    suspension.phase = 'spring';
    suspension.springTime = 0;
    suspension.amplitude = 0.11;
    carAudio.flightEnd();
  }

  function updateFlight(delta) {
    if (flightState !== 'flying') return;
    if (!raceRunning) {
      endFlight();
      return;
    }
    const climbing = keys.has('ArrowUp') || keys.has('KeyW');
    const diving = keys.has('ArrowDown') || keys.has('KeyS');
    const climb = (climbing ? 1 : 0) - (diving ? 1 : 0);
    // Screen-right is world -x from the chase camera, the same inversion the
    // on-road steering uses.
    const lateral = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0)
      - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);

    const edge = ROAD_HALF_WIDTH - CAR_HALF_WIDTH;
    carX = THREE.MathUtils.clamp(
      carX - lateral * FLIGHT_LATERAL_SPEED * delta, -FLIGHT_HALF_WIDTH, FLIGHT_HALF_WIDTH,
    );
    // Coming down out over the rocks eases the car back across the kerb on its
    // own, slowly enough that the player's own steering always outweighs it.
    // Without this, holding the descent off-road would simply hover at the
    // floor below with nothing on screen saying why.
    if (climb < 0 && Math.abs(carX) > edge) {
      carX = THREE.MathUtils.lerp(carX, Math.sign(carX) * edge, 1 - Math.exp(-1.6 * delta));
    }
    // How far off the road the car is sets a floor under its altitude, so a
    // descent converges onto the deck rather than being dragged sideways into
    // it — clamping x by altitude instead would slide the car across the world
    // faster than it can fly.
    const off = Math.max(0, Math.abs(carX) - edge);
    const floor = carRestY + (off / (FLIGHT_HALF_WIDTH - edge)) * FLIGHT_LANDING_Y;
    flightY = THREE.MathUtils.clamp(flightY + climb * FLIGHT_CLIMB_SPEED * delta, floor, FLIGHT_CEILING);

    model.car.position.x = carX;
    model.car.position.y = flightY;
    bodyPitch = THREE.MathUtils.lerp(bodyPitch, -climb * 0.17, 1 - Math.exp(-6 * delta));
    model.car.rotation.x = bodyPitch;
    model.car.rotation.z = THREE.MathUtils.lerp(model.car.rotation.z, -lateral * 0.24, 1 - Math.exp(-5 * delta));
    model.car.rotation.y = THREE.MathUtils.lerp(model.car.rotation.y, -lateral * 0.2, 1 - Math.exp(-5 * delta));

    if (flightY <= carRestY + 0.01) endFlight();
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
    // The streaks are seeded in a band around the car's resting height, so they
    // have to ride up with it in flight or the air would tear past underneath.
    wind.lines.position.y = flightState === 'flying' ? model.car.position.y - carRestY : 0;
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
    // updateFlight owns the car's y outright; the wheels just hang at rest.
    if (flightState === 'flying') {
      model.wheels.forEach((wheel) => { wheel.position.y = wheelRestY; });
      return;
    }
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
    slot.stuckTime = 0;
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
  // Cars ahead are laid around a reserved corridor rather than cycling straight
  // through LANES — four consecutive cars 10.5 units apart cover every lane
  // inside one short stretch, which walls the road outright and would have
  // openPassage dismantling the grid on the very first frame.
  //
  // Two adjacent lanes are held clear at a time: the one currently open and the
  // one the corridor is about to move to. Reserving only the open lane is not
  // enough, because a car blocks a 24.6-unit band of road (HIT_HALF_Z either
  // side, plus the slice the sweep tests it against) — far longer than the
  // 10.5 between cars — so at the seam between two runs the bands from both
  // sides overlap and can cover every lane at once. Keeping the incoming lane
  // clear through the whole preceding run gives the player a lane that is open
  // on both sides of the seam to carry them across it.
  //
  // Six cars per run rather than four: fewer seams means fewer places for the
  // bands to stack up. Verified by sweeping run length against spacing over
  // hundreds of random corridors each — at four, one seed in seven still came
  // out marginally impassable; at six, none did.
  const SEED_OPEN_RUN = 6;

  // A genuine neighbour of `lane`, never `lane` itself — clamping a random
  // step would sit still at either kerb and collapse the two reserved lanes
  // back into one.
  function neighbourLane(lane) {
    if (lane === 0) return 1;
    if (lane === LANES.length - 1) return LANES.length - 2;
    return lane + (Math.random() < 0.5 ? -1 : 1);
  }

  function seedTraffic() {
    let openLane = Math.floor(Math.random() * LANES.length);
    let nextLane = neighbourLane(openLane);
    for (let i = 0; i < TRAFFIC_SEED_COUNT; i += 1) {
      const behind = i < SEED_BEHIND_COUNT;
      const ahead = i - SEED_BEHIND_COUNT;
      const z = behind
        ? TRAFFIC_BEHIND_Z - 30 + i * 11.6
        : 46 + ahead * 10.5;
      let lane;
      if (behind) {
        lane = i % 2 ? LANES[LANES.length - 1] : LANES[0];
      } else {
        // One lane sideways per run is a shift the player can follow: 42 units
        // of road to cross 3.05 of lane needs 7 units/s of lateral speed,
        // comfortably inside the 9.5 they have.
        if (ahead > 0 && ahead % SEED_OPEN_RUN === 0) {
          openLane = nextLane;
          nextLane = neighbourLane(openLane);
        }
        const options = LANES.filter((_, index) => index !== openLane && index !== nextLane);
        lane = options[ahead % options.length];
      }
      spawnTrafficCar({ fromBehind: behind, forcedZ: z, forcedLane: lane });
    }
    spawnTimer = 1.5;
  }

  // `ease` shrinks the required gap toward another car as a lane-change
  // candidate — 1 is the normal, comfortable gap; planTrafficMotion drives it
  // down the longer a car has been stuck with nowhere to go, so a jam cannot
  // pin a car in its lane forever. It never touches the road-edge or
  // player-safety checks, which stay absolute.
  function laneClearance(slot, lane, live, ease = 1) {
    const candidateX = laneXAtZ(lane, slot.mesh.position.z);
    if (Math.abs(candidateX) > roadHalfWidthAt(slot.mesh.position.z) - CAR_HALF_X * slot.taper) return -Infinity;
    if (slot.mesh.position.z < TRAFFIC_SAFE_ZONE && Math.abs(candidateX - carX) <= TRAFFIC_LANE_CLEARANCE) return -Infinity;
    let nearest = Infinity;
    for (const other of live) {
      if (other === slot) continue;
      const dz = other.mesh.position.z - slot.mesh.position.z;
      const otherTargetX = laneXAtZ(other.targetLane, other.mesh.position.z);
      if (Math.abs(otherTargetX - candidateX) < CAR_HALF_X * (slot.taper + other.taper) * 1.125 * ease
        && dz > -LANE_CLEAR_BEHIND * ease && dz < LANE_CLEAR_AHEAD * ease) return -Infinity;
      nearest = Math.min(nearest, Math.abs(dz));
    }
    return nearest;
  }

  // A car stuck this long with no lane change available starts accepting
  // progressively tighter gaps (see `ease` in laneClearance). At ease = 0 the
  // proximity check in laneClearance is mathematically a no-op — the
  // threshold it compares against shrinks to zero, so "closer than zero" can
  // never be true — leaving only the absolute road-edge and player-safety
  // checks standing. That is what turns STUCK_HARD_LIMIT into a real
  // guarantee rather than just a longer wait: once reached, only running off
  // the road or into the player's safe zone can still block the change, and
  // both of those are separately enforced everywhere else in the game.
  const STUCK_GRACE = 2.2;
  const STUCK_HARD_LIMIT = 5;

  function planTrafficMotion(slot, live, delta) {
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
    if (!lead) {
      slot.stuckTime = 0;
      return desiredSpeed;
    }
    const closingSpeed = Math.max(0, slot.speed - lead.speed);
    const timeToContact = closingSpeed > 0.5 ? leadGap / (closingSpeed * WORLD_SCALE) : Infinity;
    const threatened = leadGap < 10 || (leadGap < 32 && timeToContact < 2.4);
    if (!threatened) {
      slot.stuckTime = 0;
      return desiredSpeed;
    }

    // Eases linearly from 1 (comfortable) down to 0 (proximity check fully
    // disabled) as stuckTime runs from STUCK_GRACE to STUCK_HARD_LIMIT.
    const ease = 1 - THREE.MathUtils.clamp(
      (slot.stuckTime - STUCK_GRACE) / (STUCK_HARD_LIMIT - STUCK_GRACE), 0, 1,
    );
    // Once fully desperate (ease bottomed out), the cooldown that normally
    // paces lane changes stands down too — otherwise it could gate a retry
    // for another second-plus after the car is already entitled to force
    // one, quietly breaking the STUCK_HARD_LIMIT guarantee. `laneChanging`
    // still blocks a second attempt while physically mid-transition, since
    // that one is already resolving the jam.
    const desperate = ease <= 0;
    if (!slot.laneChanging && (slot.laneChangeCooldown <= 0 || desperate)) {
      const laneIndex = LANES.indexOf(slot.lane);
      const candidates = [LANES[laneIndex - 1], LANES[laneIndex + 1]]
        .filter((lane) => lane !== undefined)
        .map((lane) => ({ lane, clearance: laneClearance(slot, lane, live, ease) }))
        .filter((candidate) => Number.isFinite(candidate.clearance))
        .sort((a, b) => b.clearance - a.clearance);
      if (candidates.length) {
        slot.targetLane = candidates[0].lane;
        slot.laneChanging = true;
        slot.laneChangeCooldown = LANE_CHANGE_COOLDOWN + Math.random() * 1.4;
        slot.stuckTime = 0;
        laneChanges += 1;
        return desiredSpeed;
      }
    }

    slot.stuckTime += delta;
    // No safe adjacent lane: blend down toward the leading car instead of
    // relying on the collision solver to absorb a preventable rear-end.
    desiredSpeed = Math.min(desiredSpeed, Math.max(38, lead.speed - (leadGap < 7 ? 8 : 2)));
    return desiredSpeed;
  }

  // Sends a car to whichever neighbouring lane sits further from the player's
  // line, easing the comfort requirement only as far as it has to. Unlike the
  // stuck-car escape in planTrafficMotion this is not about the car's own
  // predicament — it is the road making room for the player.
  function moveTrafficAside(slot, live) {
    if (slot.laneChanging) return false;
    const laneIndex = LANES.indexOf(slot.lane);
    const options = [LANES[laneIndex - 1], LANES[laneIndex + 1]].filter((lane) => lane !== undefined);
    for (const ease of [1, 0.6, 0.25, 0]) {
      const candidates = options
        .filter((lane) => Number.isFinite(laneClearance(slot, lane, live, ease)))
        .sort((a, b) => Math.abs(b - carX) - Math.abs(a - carX));
      if (!candidates.length) continue;
      slot.targetLane = candidates[0];
      slot.laneChanging = true;
      slot.laneChangeCooldown = LANE_CHANGE_COOLDOWN + Math.random() * 1.4;
      slot.stuckTime = 0;
      laneChanges += 1;
      passageOpenings += 1;
      return true;
    }
    return false;
  }

  // Clears the nearest wall, one car per frame. Because passageSpans predicts
  // where a car will be rather than where it is, a car already committed to
  // getting out of the way stops counting immediately — so the next frame
  // either finds the corridor open or picks a genuinely different car, and
  // this never cascades into a synchronised shuffle.
  function openPassage(live, delta) {
    // Paced, so a corridor that needs two cars moved resolves over a beat
    // rather than in one synchronised jump. A wall is a second or more of road
    // away, which is several of these.
    passageCooldown = Math.max(0, passageCooldown - delta);
    if (passageCooldown > 0) return;
    const blocked = firstWallAhead(live);
    if (blocked < 0) return;
    const z = PASSAGE_ACTION_MIN_Z + blocked * PASSAGE_SLICE_LENGTH;
    const wall = live
      .filter((slot) => Math.abs(slot.mesh.position.z - z) <= HIT_HALF_Z + PASSAGE_SLICE_LENGTH / 2)
      // Never inside the band where traffic is close enough that moving it
      // would read as dodging the player — that is the one thing this traffic
      // must not do. A wall this close was already the driver's problem to
      // steer around; the sweep's job is to stop one forming further out,
      // where rearranging the road still looks like traffic simply flowing.
      .filter((slot) => slot.mesh.position.z >= PASSAGE_ACTION_MIN_Z)
      // Nearest the player's own line first: opening the gap in front of them
      // beats opening one at the far kerb they could never reach in time.
      .sort((a, b) => Math.abs(a.x - carX) - Math.abs(b.x - carX));
    for (const slot of wall) {
      // A car still sliding into the wall is cheapest to turn back — it is not
      // committed, and nothing has taken the lane it is leaving.
      if (slot.laneChanging && slot.targetLane !== slot.lane) {
        slot.targetLane = slot.lane;
        slot.laneChanging = false;
        slot.laneChangeCooldown = LANE_CHANGE_COOLDOWN;
        passageCooldown = PASSAGE_ACTION_INTERVAL;
        passageOpenings += 1;
        return;
      }
      if (moveTrafficAside(slot, live)) {
        passageCooldown = PASSAGE_ACTION_INTERVAL;
        return;
      }
    }
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
      passageOpenings = 0;
      passageCooldown = 0;
      shotsFired = 0;
      shotHits = 0;
      coinsCollected = 0;
      flights = 0;
      spaceAutoFireTimer = 0;
      carVX = 0;
      if (wasRunning) resetCoins();
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
      const desiredSpeed = planTrafficMotion(slot, live, delta);
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

    // Run after every car has planned and moved, so the sweep judges the road
    // as it actually stands this frame. Corrections land on targetLane and take
    // effect from the next frame — a wall is a second or more ahead, so that is
    // nowhere near late.
    openPassage(live, delta);

    // A single pass leaves residual overlap once three or more bodies pile up,
    // because separating one pair can push a car into the next. A few
    // iterations converge without needing a full physics solver.
    for (let pass = 0; pass < 24; pass += 1) if (resolveTrafficContacts(live) === 0) break;
    // No traffic collisions while riding the side ramp or flying — the car
    // isn't really sharing the traffic lanes at that point.
    if (carOnRoad()) resolvePlayerContacts(live);
    for (let pass = 0; pass < 24; pass += 1) if (resolveTrafficContacts(live) === 0) break;
    live.forEach((slot) => { slot.speed = Math.min(slot.speed, MAX_TRAFFIC_SPEED); });
    if (carOnRoad()) {
      carX = THREE.MathUtils.clamp(carX, -(ROAD_HALF_WIDTH - CAR_HALF_WIDTH), ROAD_HALF_WIDTH - CAR_HALF_WIDTH);
      model.car.position.x = carX;
    }
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
    // The chase camera deliberately holds a fixed height rather than tracking
    // the car — except in flight, where the car climbs far past anything a
    // fixed rig could keep in frame. Raising the eye and the look-at target
    // together preserves the camera's angle, so only the altitude changes.
    const climb = flightState === 'flying' ? model.car.position.y - carRestY : 0;
    const height = cameraHeight + climb;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, height, 1 - Math.exp(-8 * delta));
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, -cameraDistance, 1 - Math.exp(-8 * delta));
    const targetY = height - Math.tan(THREE.MathUtils.degToRad(cameraAngle)) * (TARGET_Z + cameraDistance);
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
    updateRampSpawn(delta);
    updateRamp(delta);
    // After updateRamp, so a take-off overrides the ramp's own landing glide,
    // and before updateCameraRig, which frames the car's final height.
    updateFlight(delta);
    updateCoins(delta);
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
      // How long the most-blocked active car has been unable to find a lane
      // change. Should never run away — the ease mechanism in
      // planTrafficMotion bounds this near STUCK_HARD_LIMIT.
      maxStuckTime: Number(Math.max(0, ...raceWorld.traffic.slots.filter((slot) => slot.active).map((slot) => slot.stuckTime)).toFixed(1)),
      initialSeed: TRAFFIC_SEED_COUNT,
      maxActive: TRAFFIC_MAX_ACTIVE,
      raceTime: Number(raceTime.toFixed(1)),
      collisions,
      launched: raceWorld.traffic.slots.filter((slot) => slot.active && slot.launched).length,
    },
    neonShots: {
      inFlight: shots.slots.filter((shot) => shot.active).length,
      spaceHeld: keys.has('Space'),
      autoFireTimer: Number(spaceAutoFireTimer.toFixed(2)),
      holdInterval: SHOT_HOLD_INTERVAL,
      fired: shotsFired,
      hits: shotHits,
      bursts: bursts.slots.filter((burst) => burst.active).length,
    },
    coins: {
      collected: coinsCollected,
      groupSize: COIN_GROUP_SIZE,
      spacing: COIN_SPACING,
      // Each queue reports its lane and the z of its head and tail, so the
      // "fives down one lane, then a different lane" layout is checkable.
      queues: coins.groups
        .map((group) => ({
          lane: group.lane,
          headZ: Number(group.headZ.toFixed(1)),
          tailZ: Number((group.headZ + COIN_QUEUE_LENGTH).toFixed(1)),
          remaining: group.slots.filter((slot) => !slot.collected).length,
        }))
        .sort((a, b) => a.headZ - b.headZ),
    },
    sideRamp: {
      active: rampActive,
      side: rampSide,
      state: rampState,
      s: rampActive ? Number((-sideRamp.position.z).toFixed(1)) : null,
      length: RAMP_LENGTH,
      spawnTimer: Number(rampSpawnTimer.toFixed(1)),
      launches: rampLaunches,
      cycleTravel: Number(rampCycleTravel.toFixed(1)),
      // Ascending z is the order the player meets them, so signs must both be
      // below the ramp entry for the warning to arrive first.
      reachOrder: [
        { what: 'sign-far', z: rampSignFar.visible ? Number(rampSignFar.position.z.toFixed(1)) : null },
        { what: 'sign-near', z: rampSignNear.visible ? Number(rampSignNear.position.z.toFixed(1)) : null },
        { what: 'ramp-entry', z: rampActive ? Number(sideRamp.position.z.toFixed(1)) : null },
      ],
    },
    // The relaxation guarantee: `blockedSlice` must stay -1. Anything else
    // means the sweep found a wall this frame and is opening it.
    passage: (() => {
      const live = raceWorld.traffic.slots.filter((slot) => slot.active && !slot.launched);
      const blocked = firstBlockedSlice(live, carX, { onRoad: carOnRoad() });
      const wall = firstWallAhead(live);
      return {
        blockedSlice: blocked,
        onRoad: carOnRoad(),
        blockedAtZ: blocked < 0 ? null : PASSAGE_START_Z + blocked * PASSAGE_SLICE_LENGTH,
        wallSlice: wall,
        // Where a driver looking about a second up the road would aim.
        aimX: aimXAt(live, 78),
        wallAtZ: wall < 0 ? null : PASSAGE_ACTION_MIN_Z + wall * PASSAGE_SLICE_LENGTH,
        lookaheadZ: PASSAGE_START_Z + (PASSAGE_SLICES - 1) * PASSAGE_SLICE_LENGTH,
        openings: passageOpenings,
      };
    })(),
    flight: {
      state: flightState,
      y: Number(model.car.position.y.toFixed(2)),
      ceiling: FLIGHT_CEILING,
      takeoffs: flights,
      // The easter egg is only armed while the car is in the air off a ramp.
      armed: rampState === 'airborne' && flightState === 'none',
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
  // Test-only: skips the normal spawn timer so QA can reach the ramp without
  // waiting out RAMP_FIRST_DELAY / RAMP_INTERVAL_*.
  window.debugSpawnRamp = () => {
    if (!rampActive) spawnRamp();
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
      delete window.debugSpawnRamp;
    },
  };
}
