import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

function createCar() {
  const car = new THREE.Group();
  car.name = 'Neon Countach';
  car.position.y = 0.02;
  const materials = {
    body: mat(),
    bodyAlt: mat({ color: 0x0d0b12, roughness: 0.24 }),
    carbon: mat({ color: 0x030305, roughness: 0.36, clearcoat: 0.5 }),
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
// Five cells across the 14.8-wide road, and rungs at the same pitch along it,
// so the neon grid reads as squares.
const GRID_COLUMNS = 5;
const GRID_CELL = (ROAD_HALF_WIDTH * 2) / GRID_COLUMNS;
// World units travelled per km/h per second. Sets how fast the track rushes
// past for a given speedometer reading.
const WORLD_SCALE = 0.22;
const LANES = [-4.6, -1.55, 1.55, 4.6];
// Traffic lives on a z corridor that straddles the chase camera (z = -10.4):
// cars fade in far ahead, or slip in behind the camera and overtake us.
const TRAFFIC_SPAWN_Z = 210;
const TRAFFIC_BEHIND_Z = -58;
const TRAFFIC_DESPAWN_Z = -96;
const TRAFFIC_FORWARD_LIMIT = 300;
// Spawns at z below this are close enough to be unavoidable, so they must keep
// clear of the lane the player is sitting in.
const TRAFFIC_SAFE_ZONE = 60;
// A hair wider than the 2.4 collision half-width, so a "safe" lane really is.
const TRAFFIC_LANE_CLEARANCE = 2.6;
const TRAFFIC_SEED_COUNT = 8;

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
  for (let i = 0; i < 16; i += 1) {
    const color = palette[i % palette.length];
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.5, metalness: 0.2 }),
    );
    mesh.castShadow = true;
    mesh.visible = false;
    addEdges(mesh, 0xffffff, 0.3, 18);
    group.add(mesh);
    slots.push({ mesh, active: false, speed: 0, hit: false });
  }
  scene.add(group);
  return { group, slots };
}

// Both rings are sized so their wrap span just outruns the camera's 260-unit
// far plane. Anything further only ever renders inside solid fog, and these are
// detailed meshes rather than the boxes they replaced, so the extra instances
// would be pure cost.
const PALM_SPACING = 17.5;
const PALM_PER_SIDE = 16;
const BUILDING_SPACING = 31;
const BUILDING_PER_SIDE = 10;
// The GLB is a ~2.2 x 3.25 x 2.2 unit block, so it needs a uniform blow-up
// before the per-instance vertical stretch turns it into a skyline tower.
const BUILDING_BASE_SCALE = 4;

function populatePalms(scene, template, items) {
  // The export ships a fully transmissive material, which would render the
  // fronds as invisible glass. Zeroing transmission is the only edit made to
  // it — the baseColor texture stays untouched so the same asset still reads
  // correctly if it is ever dropped onto a brighter terrain.
  template.traverse((node) => {
    if (!node.isMesh) return;
    if (node.material.transmission !== undefined) node.material.transmission = 0;
    // Keeps the scene's room environment from lifting the fronds out of
    // silhouette. The baseColor texture itself is left as authored.
    node.material.envMapIntensity = 0.03;
  });

  const span = PALM_SPACING * PALM_PER_SIDE;
  for (let i = 0; i < PALM_PER_SIDE * 2; i += 1) {
    const side = i % 2 ? 1 : -1;
    const palm = template.clone(true);
    // Clones share the template material on purpose: every palm is lit the
    // same way, so one material keeps the draw calls cheap.
    palm.scale.setScalar(0.85 + ((i * 3) % 3) * 0.15);
    palm.rotation.y = (i * 1.73) % (Math.PI * 2);
    palm.position.set(side * 9.4, 0.03, Math.floor(i / 2) * PALM_SPACING - 40);
    palm.traverse((node) => node.layers.set(PALM_LAYER));
    scene.add(palm);
    items.push({ mesh: palm, span });
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
      color: tint.clone().multiplyScalar(0.5),
      // Just enough self-light to stay readable through the fog, not enough to
      // flatten the sun's shading.
      emissive: tint.clone().multiplyScalar(0.05),
      metalness: 0.3,
      roughness: 0.38,
      envMapIntensity: 0.25,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // Alternating 1x-3x vertical stretch breaks up the skyline silhouette.
    mesh.scale.set(BUILDING_BASE_SCALE, BUILDING_BASE_SCALE * (1 + ((i * 7) % 5) * 0.5), BUILDING_BASE_SCALE);
    mesh.rotation.y = side > 0 ? Math.PI : 0;
    mesh.position.set(side * (48 + ((i * 5) % 3) * 14), 0, Math.floor(i / 2) * BUILDING_SPACING - 40);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.layers.set(SUN_LAYER);
    scene.add(mesh);
    items.push({ mesh, span });
  }
}

function createScenery(scene) {
  // `items` is handed back immediately and only ever appended to, so the render
  // loop can iterate an empty array for the frames before the models land.
  const items = [];
  const loader = new GLTFLoader();
  loader.load(`${ASSET_BASE}assets/palm.glb`, (gltf) => populatePalms(scene, gltf.scene, items));
  loader.load(`${ASSET_BASE}assets/building.glb`, (gltf) => populateBuildings(scene, gltf.scene, items));
  return { items };
}

// Cross-section of a neon grid line: an over-exposed core that falls off into
// the line's own colour and then to nothing. Offsets are measured across the
// line, 0.5 being its centre.
function neonLineStops(hex) {
  const css = `#${new THREE.Color(hex).getHexString()}`;
  // The flat transparent stops matter: without them the ramp would spread the
  // glow across the whole cell instead of hugging the line.
  return [
    [0, `${css}00`], [0.36, `${css}00`], [0.43, css], [0.483, '#ffe4f4'],
    [0.517, '#ffe4f4'], [0.57, css], [0.64, `${css}00`], [1, `${css}00`],
  ];
}

// `seam` lays the profile along the tile's length with the core split across
// the wrap, so a repeating tile draws one rung per cell. Otherwise the profile
// runs across the tile and paints a single rail.
function createNeonLineTexture(hex, { seam = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = seam ? 4 : 128;
  canvas.height = seam ? 256 : 4;
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

function createRaceWorld(scene, renderer) {
  const loader = new THREE.TextureLoader();

  // The track carries no fill at all: it is a black surface that only the neon
  // grid sits on top of.
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, ROAD_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x07030e, roughness: 1, metalness: 0 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 120);
  road.receiveShadow = true;
  scene.add(road);

  // Rungs scroll with the car and rails stay put, so the grid squares stream
  // toward the camera the way the synthwave reference does. Both directions use
  // the same pitch, which keeps the cells square. Everything is additive, so
  // the crossings burn brighter than the lines themselves.
  const gridTexture = createNeonLineTexture(PINK, { seam: true });
  gridTexture.repeat.set(1, ROAD_LENGTH / GRID_CELL);
  gridTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const rungs = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, ROAD_LENGTH),
    new THREE.MeshBasicMaterial({ map: gridTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  rungs.rotation.x = -Math.PI / 2;
  rungs.position.set(0, 0.012, 120);
  scene.add(rungs);

  const railMaterial = new THREE.MeshBasicMaterial({ map: createNeonLineTexture(PINK), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const railGeometry = new THREE.PlaneGeometry(GRID_CELL, ROAD_LENGTH);
  for (let i = 0; i <= GRID_COLUMNS; i += 1) {
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.rotation.x = -Math.PI / 2;
    rail.position.set(-ROAD_HALF_WIDTH + i * GRID_CELL, 0.014, 120);
    scene.add(rail);
  }

  const shoulder = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 420),
    new THREE.MeshBasicMaterial({ color: 0x090117 }),
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.set(0, -0.012, 120);
  scene.add(shoulder);

  const skyTexture = loader.load(`${ASSET_BASE}assets/synthwave-sky.png`);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 72),
    new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  sky.position.set(0, 29, 115);
  scene.add(sky);

  const horizonGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(110, 7),
    new THREE.MeshBasicMaterial({ color: 0xff087a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  horizonGlow.position.set(0, 4.8, 58);
  scene.add(horizonGlow);

  renderer.shadowMap.enabled = true;
  const traffic = createTraffic(scene);
  const scenery = createScenery(scene);
  return { gridTexture, traffic, scenery };
}

export function createNeonCarExperience(container, { onReady, onTelemetry }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0528);
  scene.fog = new THREE.FogExp2(0x120526, 0.009);
  const camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 260);
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
  scene.environmentIntensity = 0.24;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.94, 5.2);
  controls.enabled = false;

  const raceWorld = createRaceWorld(scene, renderer);
  const model = createCar();
  scene.add(model.car);
  model.underGlow.material.opacity = 0;

  const hemi = new THREE.HemisphereLight(0x6537b5, 0x100015, 0.72);
  scene.add(hemi);
  const keyPink = new THREE.SpotLight(PINK, 34, 32, Math.PI / 5, 0.7, 1.3);
  keyPink.position.set(-7, 6, 6);
  keyPink.target.position.set(0, 0.7, 0);
  keyPink.castShadow = true;
  keyPink.shadow.mapSize.set(1024, 1024);
  scene.add(keyPink, keyPink.target);
  const keyBlue = new THREE.SpotLight(BLUE, 30, 32, Math.PI / 4, 0.7, 1.2);
  keyBlue.position.set(6, 4, -5);
  keyBlue.target.position.set(0, 0.7, 0);
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
  const palmFill = new THREE.HemisphereLight(0x452a6b, 0x05010a, 0.12);
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
  let torque = 0;
  let lastTelemetryAt = 0;
  const keys = new Set();
  const MAX_SPEED = 220;
  const MAX_REVERSE = -55;
  // Five gears, each covering its own speed band in roughly GEAR_SECONDS of
  // throttle, so a full pull from a standstill to MAX_SPEED takes ~20 s.
  const GEARS = [
    { min: 0, max: 55 },
    { min: 55, max: 100 },
    { min: 100, max: 140 },
    { min: 140, max: 180 },
    { min: 180, max: MAX_SPEED },
  ];
  const GEAR_SECONDS = 4;
  const SHIFT_SECONDS = 0.42;
  const SHIFT_SPEED_LOSS = 9;
  const LAUNCH_SECONDS = 0.55;
  const LAUNCH_BOOST = 58;
  const COAST_DECEL = MAX_SPEED / 2;
  const BRAKE_DECEL = 160;
  const REVERSE_ACCEL = 55;
  const LATERAL_SPEED = 9.5;
  const CAR_HALF_WIDTH = 1.45;
  let gearIndex = 0;
  let shiftTimer = 0;
  let launchTimer = 0;
  let prevAccelerating = false;
  let bodyPitch = 0;
  let travelThisFrame = 0;
  let raceTime = 0;
  let spawnTimer = 0;
  let impactFlash = 0;
  let collisions = 0;
  let wasRunning = false;
  const DIFFICULTY_RAMP = 90;
  const CAMERA_Z = -10.4;
  const TARGET_Z = 5.2;
  let cameraHeight = 3.15;
  let cameraAngle = 8;
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

  function updateDriving(delta, elapsed) {
    const accelerating = keys.has('ArrowUp') || keys.has('KeyW');
    const braking = keys.has('ArrowDown') || keys.has('KeyS');
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
    steer = THREE.MathUtils.lerp(steer, steerTarget, 1 - Math.exp(-8 * delta));
    const steerAuthority = THREE.MathUtils.clamp(Math.abs(speed) / 26, 0.22, 1);
    carX -= steer * LATERAL_SPEED * steerAuthority * delta;
    carX = THREE.MathUtils.clamp(carX, -(ROAD_HALF_WIDTH - CAR_HALF_WIDTH), ROAD_HALF_WIDTH - CAR_HALF_WIDTH);
    model.car.position.x = carX;
    model.car.rotation.z = THREE.MathUtils.lerp(model.car.rotation.z, -steer * 0.045, 1 - Math.exp(-6 * delta));
    model.car.rotation.y = THREE.MathUtils.lerp(model.car.rotation.y, -steer * 0.16, 1 - Math.exp(-5 * delta));
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
  function pickLane(spawnZ) {
    const options = spawnZ < TRAFFIC_SAFE_ZONE ? safeLanes(carX) : LANES;
    return options[Math.floor(Math.random() * options.length)];
  }

  function spawnTrafficCar({ fromBehind = false, forcedZ = null } = {}) {
    const slot = raceWorld.traffic.slots.find((entry) => !entry.active);
    if (!slot) return;
    const level = difficulty();
    const spawnZ = forcedZ ?? (fromBehind
      ? TRAFFIC_BEHIND_Z - Math.random() * 22
      : TRAFFIC_SPAWN_Z + Math.random() * 40);
    slot.active = true;
    slot.hit = false;
    // Traffic drifts by at the closing speed between us, so a car coming up
    // from behind only reads as an overtake while it outruns the player.
    // Faster traffic later on leaves less room to weave through.
    slot.speed = fromBehind
      ? speed + THREE.MathUtils.lerp(25, 60, level) + Math.random() * 20
      : THREE.MathUtils.lerp(70, 150, level) + Math.random() * 25;
    slot.mesh.visible = true;
    slot.mesh.position.set(pickLane(spawnZ), 0.68, spawnZ);
    slot.mesh.material.emissiveIntensity = 0.45;
  }

  // The road starts populated end to end rather than filling in over the first
  // few seconds. This deliberately overshoots the difficulty-ramped cap; the
  // grid thins back out to it as the seeded cars clear the corridor.
  function seedTraffic() {
    for (let i = 0; i < TRAFFIC_SEED_COUNT; i += 1) {
      const t = i / (TRAFFIC_SEED_COUNT - 1);
      const z = THREE.MathUtils.lerp(TRAFFIC_BEHIND_Z - 12, TRAFFIC_SPAWN_Z + 60, t) + (Math.random() - 0.5) * 18;
      spawnTrafficCar({ fromBehind: z < 0, forcedZ: z });
    }
  }

  function updateTraffic(delta) {
    const { slots } = raceWorld.traffic;
    if (!raceRunning) {
      slots.forEach((slot) => { slot.active = false; slot.mesh.visible = false; });
      raceTime = 0;
      spawnTimer = 0;
      collisions = 0;
      wasRunning = false;
      return;
    }
    if (!wasRunning) {
      seedTraffic();
      wasRunning = true;
    }

    raceTime += delta;
    const level = difficulty();
    const activeCount = slots.reduce((total, slot) => total + (slot.active ? 1 : 0), 0);
    const maxActive = Math.round(THREE.MathUtils.lerp(2, 9, level));
    spawnTimer -= delta;
    if (spawnTimer <= 0 && activeCount < maxActive) {
      spawnTrafficCar({ fromBehind: Math.random() < 0.45 });
      spawnTimer = THREE.MathUtils.lerp(2.8, 0.75, level) * (0.7 + Math.random() * 0.6);
    }

    slots.forEach((slot) => {
      if (!slot.active) return;
      slot.mesh.position.z -= (speed - slot.speed) * WORLD_SCALE * delta;
      if (slot.mesh.position.z < TRAFFIC_DESPAWN_Z || slot.mesh.position.z > TRAFFIC_FORWARD_LIMIT) {
        slot.active = false;
        slot.mesh.visible = false;
        return;
      }
      if (slot.hit) {
        slot.mesh.material.emissiveIntensity = Math.max(0.45, slot.mesh.material.emissiveIntensity - delta * 4);
        return;
      }
      const dx = Math.abs(slot.mesh.position.x - carX);
      const dz = Math.abs(slot.mesh.position.z);
      if (dx < 2.4 && dz < 5.8) {
        slot.hit = true;
        collisions += 1;
        slot.mesh.material.emissiveIntensity = 3.2;
        speed *= 0.45;
        gearIndex = gearForSpeed(Math.abs(speed));
        torque = 0;
        impactFlash = 0.45;
        suspension.phase = 'spring';
        suspension.springTime = 0;
        suspension.amplitude = 0.14;
      }
    });
  }

  function updateScenery() {
    raceWorld.scenery.items.forEach((item) => {
      item.mesh.position.z -= travelThisFrame;
      if (item.mesh.position.z < -45) item.mesh.position.z += item.span;
      else if (item.mesh.position.z > item.span - 45) item.mesh.position.z -= item.span;
    });
  }

  function updateCameraRig(delta) {
    if (currentPreset) return;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, cameraHeight, 1 - Math.exp(-8 * delta));
    const targetY = cameraHeight - Math.tan(THREE.MathUtils.degToRad(cameraAngle)) * (TARGET_Z - CAMERA_Z);
    controls.target.y = THREE.MathUtils.lerp(controls.target.y, targetY, 1 - Math.exp(-8 * delta));
  }

  function update(delta, elapsed, maxed) {
    updateBackfire(delta, elapsed, maxed);
    updateTurnSignals(delta);
    updateSuspension(delta);
    updateTraffic(delta);
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
  };
  window.addEventListener('resize', resize);
  animate();
  if (typeof onReady === 'function') requestAnimationFrame(() => requestAnimationFrame(onReady));

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
      // Any car close enough to be unavoidable that is sharing our lane band.
      playerLaneIntrusions: raceWorld.traffic.slots.filter((slot) => slot.active
        && Math.abs(slot.mesh.position.z) < TRAFFIC_SAFE_ZONE
        && Math.abs(slot.mesh.position.x - carX) <= TRAFFIC_LANE_CLEARANCE).length,
      maxActive: Math.round(THREE.MathUtils.lerp(2, 9, THREE.MathUtils.clamp(raceTime / DIFFICULTY_RAMP, 0, 1))),
      raceTime: Number(raceTime.toFixed(1)),
      collisions,
    },
    render: {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    },
    scenery: {
      loaded: raceWorld.scenery.items.length,
      palms: raceWorld.scenery.items.filter((item) => item.span === PALM_SPACING * PALM_PER_SIDE).length,
      buildings: raceWorld.scenery.items.filter((item) => item.span === BUILDING_SPACING * BUILDING_PER_SIDE).length,
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
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      const stepElapsed = clock.elapsedTime + i / 60;
      updateDriving(1 / 60, stepElapsed);
      const maxed = raceRunning && torque > 0.92 && speed > MAX_SPEED - 8;
      update(1 / 60, stepElapsed, maxed);
    }
    controls.update();
    renderer.info.reset();
    composer.render();
  };

  return {
    setRunning(enabled) { raceRunning = enabled; },
    setCameraRig({ height, angle }) {
      if (typeof height === 'number') cameraHeight = THREE.MathUtils.clamp(height, 1.4, 9);
      if (typeof angle === 'number') cameraAngle = THREE.MathUtils.clamp(angle, -2, 30);
    },
    getCameraRig() { return { height: cameraHeight, angle: cameraAngle }; },
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
      keyPink.intensity = enabled ? 28 : 8;
      keyBlue.intensity = enabled ? 24 : 8;
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
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
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
