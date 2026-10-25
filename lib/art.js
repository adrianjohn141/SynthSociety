// Storybook-diorama look: flat pastel toon materials, inverted-hull brown outlines,
// canvas-drawn textures. Every builder returns a Group whose front faces +z.
import { WORLD_SIZE, WORLD_CORNER, onIsland } from './world.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LOCATIONS, DISTRICTS, DIST, DISTRICT_ROADS, BENCHES, LANTERNS, HOUSES, MEADOW_R, HUB_R, HUB_DIST, JUNCTION_R, RING, mulberry32 } from './sim.js';

export const C = {
  outline: '#6b4a3a', cream: '#fbf1de', peach: '#f6c3a3', pink: '#eab1b5', sage: '#b9d09c', sageDark: '#97b582',
  teal: '#8cc3bf', gold: '#f2cf7a', coral: '#e39a8a', wood: '#a47458', woodDark: '#7a5442', stone: '#ece2d1',
  stoneDark: '#cdbfa9', earth: '#c9a27e', water: '#a9d8d6', blossom: '#f7c6d3', blossom2: '#efaec1',
};

const grad = new THREE.DataTexture(new Uint8Array([148, 212, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

const mats = new Map();
export function toon(color, map) {
  const k = color + (map?.uuid ?? '');
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color, gradientMap: grad, ...(map && { map }) })); // three warns on map: undefined
  return mats.get(k);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: C.outline, side: THREE.BackSide });
export const windowMat = new THREE.MeshBasicMaterial({ color: '#d7e7e4' }); // tinted warm at night by the scene
const shadowMat = new THREE.MeshBasicMaterial({ color: C.outline, transparent: true, opacity: 0.16, depthWrite: false });

// Mesh + a back-face hull grown by `t` world units on every axis, so outline width is uniform.
export function part(geo, mat, pos = [0, 0, 0], { t = 0.07, map } = {}) {
  const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat, map) : mat);
  m.position.set(...pos);
  if (t > 0) {
    geo.computeBoundingBox();
    const size = geo.boundingBox.getSize(new THREE.Vector3()), c = geo.boundingBox.getCenter(new THREE.Vector3());
    const k = (d) => (d > 1e-3 ? 1 + (2 * t) / d : 1);
    const o = new THREE.Mesh(geo, canopyMats.includes(mat) ? canopyOutline : bushMats.includes(mat) ? bushOutline : outlineMat);
    o.scale.set(k(size.x), k(size.y), k(size.z));
    o.position.set(c.x * (1 - o.scale.x), c.y * (1 - o.scale.y), c.z * (1 - o.scale.z));
    o.raycast = () => {};
    m.add(o);
  }
  return m;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
const ball = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const turnTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const shade = (c, k = 0.86) => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const blob = (r) => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.036;
  return m;
};

// ---------- hand-drawn canvas textures (white base, so the material colour shows through) ----------
let TX;
function canvasTex(size, draw, rx = 1, ry = rx) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, size, size);
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}
function textures() {
  if (TX) return TX;
  const R = mulberry32(7);
  const tile = (g, s) => {
    g.strokeStyle = 'rgba(90,60,60,0.35)';
    g.lineWidth = 3;
    for (let y = 0; y < s; y += s / 6)
      for (let x = (y / (s / 6)) % 2 ? s / 16 : 0; x < s + s / 8; x += s / 8) { g.beginPath(); g.arc(x, y, s / 16, 0, Math.PI); g.stroke(); }
  };
  TX = {
    grass: canvasTex(512, (g, s) => {
      g.lineCap = 'round';
      for (let i = 0; i < 160; i++) {
        const x = R() * s, y = R() * s;
        g.strokeStyle = `rgba(105,138,86,${0.16 + R() * 0.18})`;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y - 9, x + 7 * (R() - 0.3), y - 16); g.stroke();
      }
      for (let i = 0; i < 65; i++) { g.fillStyle = 'rgba(255,255,235,0.55)'; g.beginPath(); g.arc(R() * s, R() * s, 2.5 + R() * 3, 0, 7); g.fill(); }
    }, 16 / ISLAND),
    stone: canvasTex(512, (g, s) => {
      g.fillStyle = '#dfd3be';
      g.fillRect(0, 0, s, s);
      const rows = 6, rh = s / rows, gap = 6, tones = ['#fffdf8', '#faf1e4', '#f3e7d6', '#eadbc7'];
      g.lineWidth = 3.5;
      for (let r = 0; r < rows; r++) {
        const weights = Array.from({ length: 6 }, () => 0.78 + R() * 0.44);
        const sum = weights.reduce((a, b) => a + b, 0);
        let x = ((r % 2) * 0.5 + (R() - 0.5) * 0.08) * (s / 6);
        for (const w0 of weights) {
          const w = (w0 / sum) * s, y = r * rh + (R() - 0.5) * 2.5, h = rh - gap, sw = w - gap;
          const col = tones[Math.floor(R() * tones.length)], rad = Math.min(13, sw * 0.26, h * 0.28);
          for (const ox of [0, -s, s]) {
            if (x + ox + sw < 0 || x + ox > s) continue;
            g.fillStyle = col;
            g.strokeStyle = 'rgba(107,74,58,0.48)';
            g.beginPath(); g.roundRect(x + ox + gap / 2, y + gap / 2, sw, h, rad); g.fill(); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.35)';
            g.beginPath(); g.roundRect(x + ox + gap / 2 + 4, y + gap / 2 + 4, Math.max(4, sw - 8), Math.max(4, h * 0.38), rad * 0.6); g.fill();
          }
          x += w;
        }
      }
    }, 1 / 3.2),
    tile: canvasTex(128, tile, 6, 3),
    tileGable: canvasTex(128, tile, 0.8, 0.8),
    earth: canvasTex(128, (g, s) => {
      g.strokeStyle = 'rgba(110,80,60,0.25)';
      g.lineWidth = 3;
      for (let y = 20; y < s; y += 28) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x / 9 + y) * 3); g.stroke(); }
    }, 8, 1),
    petal: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(107,74,58,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(16, 16, 11, 7, 0.6, 0, 7); g.fill(); g.stroke();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
    awning: {},
    // stepped (cel-style) warm glow for lantern light on the ground
    pool: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      for (const [r, a] of [[62, 0.16], [44, 0.26], [26, 0.36]]) { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(64, 64, r, 0, 7); g.fill(); }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })(),
  };
  return TX;
}
function awningTex(color) {
  const A = textures().awning;
  return (A[color] ??= canvasTex(64, (g, s) => { g.fillStyle = color; for (let i = 0; i < 4; i += 2) g.fillRect((i * s) / 4, 0, s / 4, s); }, 2, 1));
}

// ---------- architecture ----------
function hipRoof(w, d, h, color) {
  const g = new THREE.Group();
  g.add(part(box(w, 0.16, d), shade(color, 0.8), [0, 0.08, 0], { t: 0.05 }));
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(w - 0.2, h, d - 0.2);
  g.add(part(geo, color, [0, 0.14, 0], { map: textures().tile }));
  g.add(part(box(0.3, 0.22, 0.3), shade(color, 0.8), [0, h + 0.1, 0], { t: 0.04 }));
  return g;
}

function gableRoof(w, d, h, color) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  const g = new THREE.Group();
  g.add(part(geo, color, [0, 0, 0], { map: textures().tileGable }));
  g.add(part(box(0.24, 0.2, d + 0.1), shade(color, 0.8), [0, h, 0], { t: 0.04 }));
  return g;
}

function house({ w, d, h, wall, roof, roofH = 1.4, gable = false, frontWindows = true, win = windowMat.clone() }) {
  const g = new THREE.Group(), base = 0.3;
  win.userData.window = true;
  g.userData.windowMaterial = win;
  g.add(part(box(w + 0.5, base, d + 0.5), C.stone, [0, base / 2, 0]));
  g.add(part(doorwayWall(w, h, d), wall, [0, base, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(part(box(0.2, h, 0.2), C.wood, [(sx * w) / 2, base + h / 2, (sz * d) / 2], { t: 0.04 }));
  g.add(part(box(w + 0.12, 0.2, d + 0.12), C.wood, [0, base + h - 0.1, 0], { t: 0.04 }));
  const door = hingedDoor();
  door.position.set(0, base, d / 2 + 0.06);
  g.add(door);
  const rows = h > 2.8 ? [base + 1.3, base + h - 0.8] : [base + h * 0.58];
  for (const y of rows) {
    if (frontWindows) for (const x of [-(w / 2 - 0.85), w / 2 - 0.85]) g.add(part(box(0.75, 0.6, 0.1), win, [x, y, d / 2 + 0.04], { t: 0.05 }));
    for (const sx of [-1, 1]) g.add(part(box(0.1, 0.6, 0.75), win, [(sx * w) / 2 + sx * 0.04, y, 0], { t: 0.05 }));
  }
  const r = gable ? gableRoof(w + 0.9, d + 1, roofH, roof) : hipRoof(w + 1.4, d + 1.4, roofH, roof);
  r.position.y = base + h;
  g.add(r);
  g.userData.top = base + h + roofH;
  return g;
}

// A real opening in the front of the shell, deep enough for the short saved
// threshold walk. The back of the recess still keeps interiors out of sight.
export function doorwayWall(w, h, d) {
  const jamb = (w - 1.1) / 2;
  const pieces = [
    box(w, h, d - 1).translate(0, h / 2, -0.5),
    box(jamb, 1.4, 1).translate(-(w + 1.1) / 4, 0.7, d / 2 - 0.5),
    box(jamb, 1.4, 1).translate((w + 1.1) / 4, 0.7, d / 2 - 0.5),
    box(w, h - 1.4, 1).translate(0, (h + 1.4) / 2, d / 2 - 0.5),
  ];
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return geometry;
}

// The hinge stays at the jamb. Only the leaf moves; the dark recess and frame
// make the opening readable even on buildings with a solid low-poly shell.
export function hingedDoor() {
  const g = new THREE.Group(), hinge = new THREE.Group();
  g.add(part(box(0.98, 1.35, 0.025), '#49372e', [0, 0.675, -0.025], { t: 0 }));
  for (const x of [-0.51, 0.51]) g.add(part(box(0.08, 1.4, 0.14), C.wood, [x, 0.7, 0], { t: 0.015 }));
  g.add(part(box(1.1, 0.09, 0.14), C.wood, [0, 1.38, 0], { t: 0.015 }));
  hinge.position.x = -0.45;
  hinge.add(part(box(0.9, 1.3, 0.08), C.woodDark, [0.45, 0.65, 0.025], { t: 0.02 }));
  hinge.add(part(ball(0.045, 8, 6), C.gold, [0.78, 0.65, 0.09], { t: 0.008 }));
  g.add(hinge);
  g.userData.door = { hinge, openness: 0 };
  return g;
}

export function animateDoor(door, open, dt) {
  const state = door.userData.door;
  state.openness += ((open ? 1 : 0) - state.openness) * (1 - Math.exp(-Math.max(0, dt) * (open ? 9 : 3)));
  state.hinge.rotation.y = -state.openness * Math.PI * 0.54;
}

// An open wooden hull, rather than a submerged hemisphere. All geometry is
// built once; bobbing changes only the boat transform, not its water shadow.
export function rowboat() {
  const g = new THREE.Group(), hull = new THREE.Group();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.65, 1.5, 1);
  shadow.position.y = 0.115;
  g.add(shadow, hull);
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.28); shape.lineTo(0.45, -0.66); shape.lineTo(0.48, 0.65);
  shape.lineTo(0.32, 1.05); shape.lineTo(-0.32, 1.05); shape.lineTo(-0.48, 0.65); shape.lineTo(-0.45, -0.66); shape.closePath();
  const floor = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: false }).rotateX(Math.PI / 2);
  hull.add(part(floor, '#b98450', [0, 0.24, 0], { t: 0.015 }));
  const points = [[0, -1.28], [0.45, -0.66], [0.48, 0.65], [0.32, 1.05], [-0.32, 1.05], [-0.48, 0.65], [-0.45, -0.66], [0, -1.28]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], len = Math.hypot(bx - ax, bz - az), angle = Math.atan2(bx - ax, bz - az);
    for (const [y, height, width, color] of [[0.31, 0.27, 0.09, '#805036'], [0.46, 0.045, 0.11, '#e3bd83'], [0.18, 0.045, 0.1, '#4f382c']]) {
      const edge = part(box(width, height, len + 0.025), color, [(ax + bx) / 2, y, (az + bz) / 2], { t: 0.008 });
      edge.rotation.y = angle; hull.add(edge);
    }
  }
  for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) hull.add(part(box(0.77, 0.025, 0.25), '#d7ad77', [0, 0.25, z], { t: 0.006 }));
  for (const z of [-0.42, 0.52]) hull.add(part(box(0.9, 0.065, 0.22), '#e3bd83', [0, 0.39, z], { t: 0.014 }));
  const oar = part(cyl(0.025, 0.025, 1.65, 6), C.woodDark, [0.1, 0.5, 0], { t: 0.008 });
  oar.rotation.set(Math.PI / 2, 0, 0.4); hull.add(oar);
  g.userData.float = hull;
  return g;
}

export function animateBoat(boat, t) {
  const hull = boat.userData.float;
  hull.position.y = Math.sin(t * 1.3) * 0.018;
  hull.rotation.z = Math.sin(t * 0.9) * 0.025;
  hull.rotation.x = Math.sin(t * 1.1 + 0.7) * 0.012;
}

export function bathDetails() {
  const g = new THREE.Group(), headTowel = new THREE.Group(), shoulderTowel = new THREE.Group();
  headTowel.add(part(box(0.27, 0.065, 0.2), C.cream, [0, 0, 0], { t: 0.012 }));
  headTowel.add(part(box(0.2, 0.025, 0.17), '#e0d6c5', [0, 0.04, 0], { t: 0.006 }));
  headTowel.position.y = 1.45;
  for (const x of [-0.15, 0.15]) shoulderTowel.add(part(box(0.1, 0.32, 0.08), C.cream, [x, 0.7, 0.13], { t: 0.01 }));
  shoulderTowel.add(part(box(0.36, 0.07, 0.15), C.cream, [0, 0.88, 0], { t: 0.01 }));
  const blushMat = new THREE.MeshBasicMaterial({ color: '#e99393', transparent: true, opacity: 0, depthWrite: false });
  const cheeks = new THREE.Group();
  for (const x of [-0.2, 0.2]) cheeks.add(part(ball(0.065, 8, 6).scale(1, 0.55, 0.3), blushMat, [x, 0, 0], { t: 0 }));
  cheeks.position.set(0, 1.1, 0.4);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#f0eee0', transparent: true, opacity: 0.5, depthWrite: false });
  const rings = [0, 1].map(() => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.375, 28), ringMat.clone());
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.545;
    g.add(ring); return ring;
  });
  g.add(headTowel, shoulderTowel, cheeks);
  function animate(soaking, warmUntil, simTime, t) {
    const warm = Math.max(0, Math.min(1, (warmUntil - simTime) / 12));
    g.visible = soaking || warm > 0;
    headTowel.visible = soaking; shoulderTowel.visible = !soaking && warm > 0;
    blushMat.opacity = (soaking ? 1 : warm) * 0.6;
    cheeks.visible = soaking || warm > 0;
    rings.forEach((ring, i) => {
      ring.visible = soaking;
      const k = (t * 0.45 + i * 0.5) % 1;
      ring.scale.setScalar(0.75 + k * 1.5);
      ring.material.opacity = (1 - k) * 0.45;
    });
  }
  animate(false, 0, 0, 0);
  return { g, animate, headTowel, cheeks };
}

export function fitBathDetails(model, bath, headBone) {
  if (!headBone) return;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.getObjectByName('head-mesh') ?? model), center = bounds.getCenter(new THREE.Vector3());
  bath.headTowel.position.set(center.x, bounds.max.y + 0.04, center.z);
  bath.cheeks.position.set(center.x, center.y, bounds.max.z + 0.008);
  for (const object of [bath.headTowel, bath.cheeks]) {
    model.add(object);
    object.position.divideScalar(model.scale.x);
    object.scale.divideScalar(model.scale.x);
    headBone.attach(object);
  }
}

export function workingDetails() {
  const g = new THREE.Group(), tea = new THREE.Group(), dough = new THREE.Group(), scale = new THREE.Group(), watering = new THREE.Group();
  tea.add(part(cyl(0.14, 0.09, 0.1, 14), C.cream, [0, 0.51, 0.3], { t: 0.012 }));
  tea.add(part(cyl(0.115, 0.115, 0.012, 14), '#8fab6c', [0, 0.567, 0.3], { t: 0 }));
  const whisk = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    whisk.add(part(cyl(0.006, 0.009, 0.09, 4), '#e0bf81', [Math.cos(a) * 0.034, 0, Math.sin(a) * 0.034], { t: 0 }));
  }
  whisk.add(part(cyl(0.018, 0.024, 0.12, 6), '#d1a56c', [0, 0.09, 0], { t: 0.005 }));
  tea.add(whisk);
  const froth = new THREE.Group();
  for (let i = 0; i < 7; i++) froth.add(part(ball(0.013, 6, 5), '#e4e7b7', [Math.cos(i * 2.4) * 0.07, 0.579, 0.3 + Math.sin(i * 2.4) * 0.07], { t: 0 }));
  tea.add(froth);
  const kettle = new THREE.Group();
  kettle.add(part(ball(0.1, 10, 8), '#718b85', [0.24, 0.53, 0.32], { t: 0.01 }));
  kettle.add(part(cyl(0.018, 0.026, 0.12, 6).rotateZ(-0.8), '#718b85', [0.33, 0.57, 0.32], { t: 0.005 }));
  tea.add(kettle);
  const puffs = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ball(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff8e8', transparent: true, depthWrite: false }));
    tea.add(m); return m;
  });
  dough.add(part(box(0.36, 0.025, 0.24), C.wood, [0, 0.49, 0.3], { t: 0.01 }));
  const loaf = part(ball(0.11, 12, 8).scale(1.25, 0.55, 0.8), '#f0d5a6', [0, 0.56, 0.3], { t: 0.01 });
  const roller = part(cyl(0.025, 0.025, 0.32, 8).rotateZ(Math.PI / 2), '#bc8b61', [0, 0.61, 0.3], { t: 0.01 });
  dough.add(loaf, roller);
  scale.add(part(box(0.3, 0.035, 0.22), C.wood, [0, 0.49, 0.3], { t: 0.01 }));
  scale.add(part(cyl(0.013, 0.013, 0.19, 6), C.woodDark, [0, 0.59, 0.3], { t: 0.005 }));
  const beam = part(box(0.32, 0.02, 0.025), C.gold, [0, 0.69, 0.3], { t: 0.006 });
  for (const x of [-0.13, 0.13]) beam.add(part(cyl(0.075, 0.05, 0.025, 10), '#d2b288', [x, -0.05, 0], { t: 0.005 }));
  beam.add(part(ball(0.045, 8, 6), C.coral, [-0.13, -0.02, 0], { t: 0.005 }));
  scale.add(beam);
  watering.add(part(cyl(0.08, 0.08, 0.14, 10), '#8aa9a1', [0.17, 0.43, 0.26], { t: 0.01 }));
  watering.add(part(cyl(0.015, 0.025, 0.22, 6).rotateX(0.8), '#8aa9a1', [0.17, 0.43, 0.42], { t: 0.006 }));
  const drops = [0, 1, 2].map(() => { const m = part(ball(0.013, 6, 5), '#b8deda', [0, 0, 0], { t: 0 }); watering.add(m); return m; });
  const harvest = new THREE.Group(); // a woven basket of picked vegetables at the hip
  harvest.add(part(cyl(0.14, 0.11, 0.14, 12), '#c99a5e', [0.2, 0.42, 0.24], { t: 0.012 }));
  [[C.coral, 0.15, 0.2], ['#e6a24a', 0.24, 0.27], [C.sage, 0.2, 0.3]].forEach(([c, x, z]) => harvest.add(part(ball(0.045, 8, 6), c, [x, 0.5, z], { t: 0.008 })));
  g.add(tea, dough, scale, watering, harvest);
  function animate(state, t) {
    const task = state?.task, active = task?.reached && !state.walking && !state.hidden && !state.serving && !task.kind?.startsWith('work-');
    tea.visible = !!(active && state.work && state.at === 'teahouse' && task.anim === 'work');
    dough.visible = !!(active && state.work && state.at === 'bakery' && task.anim === 'work');
    scale.visible = !!(active && state.work && state.at === 'market' && task.anim === 'work');
    const farming = !!(active && state.at === 'farm' && task.anim === 'garden'), picking = /^Harvest/.test(state?.act ?? '');
    watering.visible = farming && !picking; harvest.visible = farming && picking;
    g.visible = tea.visible || dough.visible || scale.visible || watering.visible || harvest.visible;
    whisk.position.set(Math.sin(t * 34) * 0.045, 0.61, 0.3 + Math.sin(t * 51) * 0.025);
    whisk.rotation.z = Math.sin(t * 34) * 0.15;
    froth.scale.y = 0.95 + Math.sin(t * 17) * 0.05;
    puffs.forEach((m, i) => { const k = (t * 0.6 + i / 3) % 1; m.position.set(0.34 + k * 0.04, 0.65 + k * 0.25, 0.32); m.scale.setScalar(0.7 + k); m.material.opacity = (1 - k) * 0.55; });
    roller.position.z = 0.3 + Math.sin(t * 4) * 0.065;
    loaf.scale.y = 0.85 + Math.sin(t * 8) * 0.15;
    beam.rotation.z = Math.sin(t * 2.6) * 0.09;
    drops.forEach((m, i) => { const k = (t * 0.8 + i / 3) % 1; m.position.set(0.17, 0.38 - k * 0.3, 0.5 + k * 0.13); });
    return g.visible;
  }
  return { g, animate };
}

function lantern(glow = windowMat) {
  const g = new THREE.Group(), t = 0.04;
  g.add(part(cyl(0.28, 0.32, 0.2, 10), C.stoneDark, [0, 0.1, 0], { t }));
  g.add(part(cyl(0.1, 0.12, 0.6, 8), C.stoneDark, [0, 0.5, 0], { t }));
  g.add(part(box(0.5, 0.1, 0.5), C.stoneDark, [0, 0.85, 0], { t }));
  g.add(part(box(0.32, 0.3, 0.32), glow, [0, 1.05, 0], { t }));
  g.add(part(new THREE.ConeGeometry(0.42, 0.3, 4).rotateY(Math.PI / 4), C.stoneDark, [0, 1.35, 0], { t }));
  g.add(part(ball(0.07, 8, 6), C.stoneDark, [0, 1.55, 0], { t: 0.03 }));
  g.add(blob(0.4));
  return g;
}

function bakery() {
  const g = house({ w: 5, d: 4, h: 2.3, wall: C.peach, roof: C.teal, roofH: 1.6 });
  g.add(part(box(0.6, 1.6, 0.6), '#d8a48f', [1.4, 3.8, -0.6]));
  g.add(part(cyl(0.38, 0.38, 0.12, 24).rotateX(Math.PI / 2), C.gold, [0, 2.1, 2.14], { t: 0.05 }));
  g.add(part(box(1.4, 0.6, 0.7), C.wood, [1.7, 0.6, 2.95], { t: 0.05 })); // a body's width out from the wall, so the baker fits behind it
  for (const x of [1.3, 1.7, 2.1]) g.add(part(ball(0.17, 12, 8).scale(1, 0.6, 1), '#e8b665', [x, 0.98, 2.95], { t: 0.03 }));
  const ovenMat = new THREE.MeshBasicMaterial({ color: '#6a4736' });
  g.add(part(box(0.8, 0.48, 0.06), C.woodDark, [-1.55, 0.7, 2.08], { t: 0.025 }));
  g.add(part(box(0.65, 0.34, 0.04), ovenMat, [-1.55, 0.7, 2.13], { t: 0 }));
  g.userData.oven = ovenMat;
  g.userData.steam = new THREE.Vector3(1.4, 4.7, -0.6); // oven smoke from the chimney
  return g;
}

function teahouse() {
  const g = house({ w: 5.2, d: 4, h: 1.9, wall: C.cream, roof: C.pink, roofH: 1.0 });
  g.add(part(box(3, 1.1, 2.4), C.cream, [0, 3.25, 0]));
  g.add(part(box(0.75, 0.5, 0.1), g.userData.windowMaterial, [0, 3.3, 1.24], { t: 0.04 }));
  const top = hipRoof(4.2, 3.6, 1.1, C.pink);
  top.position.y = 3.8;
  g.add(top);
  g.userData.curtains = [];
  for (const x of [-0.3, 0, 0.3]) {
    const curtain = part(box(0.27, 0.45, 0.04).translate(0, -0.225, 0), C.teal, [x, 1.575, 2.13], { t: 0.02 });
    g.add(curtain); g.userData.curtains.push(curtain);
  }
  // wagasa parasol over a red bench, set out past the eaves (the hip roof reaches x = -3.3) so the canopy clears them
  g.add(part(box(1.4, 0.12, 0.6), '#d98c8c', [-4.3, 0.42, 2.4], { t: 0.04 }));
  for (const x of [-4.85, -3.75]) g.add(part(box(0.1, 0.36, 0.5), C.woodDark, [x, 0.18, 2.4], { t: 0.03 }));
  g.add(part(cyl(0.05, 0.05, 2.2, 6), C.woodDark, [-4.3, 1.1, 1.85], { t: 0.03 })); // behind the bench, between its two sitters
  g.add(part(new THREE.ConeGeometry(0.9, 0.45, 16), C.pink, [-4.3, 2.3, 1.95], { t: 0.05 }));
  const shadow = blob(0.9);
  shadow.position.x = -4.3;
  shadow.position.z = 2.4;
  g.add(shadow);
  g.userData.top = 4.9;
  return g;
}

function shrine() {
  const g = new THREE.Group();
  g.add(part(box(5.2, 0.5, 4.4), C.stone, [0, 0.25, -0.5]));
  const hall = house({ w: 4.2, d: 3.2, h: 1.9, wall: C.cream, roof: '#9fbfa6', roofH: 1.5 });
  hall.position.set(0, 0.5, -0.6);
  g.add(hall);
  g.add(part(box(1.6, 0.25, 0.6), C.stoneDark, [0, 0.12, 1.95], { t: 0.04 }));
  // torii gate the residents walk through
  for (const x of [-1.25, 1.25]) g.add(part(cyl(0.13, 0.15, 2.5, 12), C.coral, [x, 1.25, 3.0], { t: 0.05 }));
  g.add(part(box(3.5, 0.22, 0.34), C.woodDark, [0, 2.62, 3.0], { t: 0.05 }));
  g.add(part(box(3.1, 0.16, 0.26), C.coral, [0, 2.44, 3.0], { t: 0.04 }));
  g.add(part(box(2.9, 0.14, 0.2), C.coral, [0, 2.0, 3.0], { t: 0.04 }));
  for (const x of [-2.3, 2.3]) { const l = lantern(); l.position.set(x, 0, 2.5); g.add(l); }
  for (const x of [-4, 4]) { const t = sakura(1, mulberry32(x + 9)); t.position.set(x, 0, 0.4); g.add(t); } // the cherry trees the gardener prunes
  g.userData.top = hall.userData.top + 0.5;
  return g;
}

function library() {
  const g = house({ w: 5, d: 4, h: 3.2, wall: C.teal, roof: '#e2a99b', roofH: 1.5 });
  g.add(part(box(5.6, 0.14, 4.6), C.wood, [0, 2.3, 0], { t: 0.04 }));
  g.add(part(cyl(0.35, 0.35, 0.1, 20).rotateX(Math.PI / 2), g.userData.windowMaterial, [0, 2.85, 2.05], { t: 0.05 }));
  g.add(part(box(1.2, 0.5, 0.6), C.wood, [2.1, 0.25, 2.9], { t: 0.04 })); // a body's width out from the wall, so the librarian fits behind it
  ['#e59a98', C.gold, C.teal, '#b39ad1'].forEach((c, i) => g.add(part(box(0.16, 0.42, 0.4), c, [1.7 + i * 0.24, 0.7, 2.9], { t: 0.02 })));
  return g;
}

function market() {
  const g = new THREE.Group();
  const stalls = [[-2.7, -0.4, 0.25, '#f2cf7a', ['#f6b09a', '#f2cf7a', '#e8826e']], [0, 0.3, 0, '#8cc3bf', ['#a9c7e0', '#cfe0ea', '#a9c7e0']], [2.7, -0.4, -0.25, '#eab1b5', ['#f7c6d3', '#fff3b0', '#c9e3a6']]];
  for (const [x, z, rot, color, produce] of stalls) {
    const s = new THREE.Group();
    s.add(part(box(1.8, 0.75, 1.0), C.wood, [0, 0.375, 0]));
    for (const px of [-0.85, 0.85]) for (const pz of [-0.45, 0.45]) s.add(part(cyl(0.05, 0.05, 2.0, 6), C.woodDark, [px, 1.0, pz], { t: 0.03 }));
    const aw = part(box(2.1, 0.08, 1.5), '#ffffff', [0, 2.05, 0.15], { map: awningTex(color), t: 0.05 });
    aw.rotation.x = 0.18;
    s.add(aw);
    for (let i = 0; i < 6; i++) s.add(part(ball(0.15, 10, 8), produce[i % 3], [-0.6 + (i % 3) * 0.6 + (i > 2 ? 0.3 : 0), 0.88, i > 2 ? 0.2 : -0.15], { t: 0.03 }));
    s.add(part(box(0.5, 0.35, 0.5), C.wood, [1.1, 0.18, 0.6], { t: 0.04 }));
    s.add(blob(1.2));
    s.position.set(x, 0, z);
    s.rotation.y = rot;
    g.add(s);
  }
  g.userData.top = 2.6;
  return g;
}

// paper lanterns (chochin) of the pleasure district; brightened at night by the scene
export const lanternMat = new THREE.MeshBasicMaterial({ color: '#e8907e' });
function chochin(x, y, z, glow = lanternMat) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(part(ball(0.2, 12, 10).scale(1, 1.3, 1), glow, [0, 0, 0], { t: 0.03 }));
  for (const cy of [-0.27, 0.27]) g.add(part(cyl(0.11, 0.11, 0.06, 10), C.woodDark, [0, cy, 0], { t: 0 }));
  return g;
}

// ring: cottages set back around a big plaza get stepping stones to it and a hedge beside each garden
function homes(palette, { ring = false } = {}) {
  return () => {
    const g = new THREE.Group();
    g.userData.windows = [];
    g.userData.blooms = []; // the flowers in each doorstep pot, scaled by how well they are tended
    for (const [x, z, wall, roof, rot = 0] of palette) {
      const turn = (dx, dz) => [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)]; // the house's own frame
      const win = windowMat.clone(); // each home lights up only when someone is in
      g.userData.windows.push(win);
      const h = house({ w: 2.6, d: 2.6, h: 1.7, wall, roof, roofH: 1.3, gable: true, frontWindows: false, win });
      h.position.set(x, 0, z);
      h.rotation.y = rot;
      g.add(h);
      const [px, pz] = turn(0.95, 1.75);
      g.add(part(cyl(0.16, 0.12, 0.25, 10), '#d8a48f', [px, 0.12, pz], { t: 0.03 }));
      const bloom = new THREE.Group();
      bloom.position.set(px, 0.26, pz);
      bloom.add(part(ball(0.2, 10, 8), C.blossom2, [0, 0.12, 0], { t: 0.03 }));
      [[0.13, 0.2, 0.05, C.gold], [-0.1, 0.24, 0.08, C.cream], [0.02, 0.3, -0.1, C.blossom]].forEach(([dx, dy, dz, c]) => bloom.add(part(ball(0.08, 8, 6), c, [dx, dy, dz], { t: 0.015 })));
      g.add(bloom);
      g.userData.blooms.push(bloom);
      const wash = new THREE.Group(); // a washing line behind the house, hung out on fine days
      const [wx, wz] = turn(0, -1.75);
      wash.position.set(wx, 0, wz);
      wash.rotation.y = rot;
      for (const sx of [-0.9, 0.9]) wash.add(part(cyl(0.03, 0.03, 0.9, 6), C.woodDark, [sx, 0.45, 0], { t: 0.015 }));
      wash.add(part(cyl(0.008, 0.008, 1.8, 4).rotateZ(Math.PI / 2), C.cream, [0, 0.86, 0], { t: 0 }));
      [[-0.5, C.blossom], [0, C.teal], [0.5, C.gold]].forEach(([cx, c]) => wash.add(part(box(0.32, 0.36, 0.02), c, [cx, 0.67, 0], { t: 0.012 })));
      wash.visible = false;
      g.add(wash);
      (g.userData.laundry ??= []).push(wash);
      // a little chimney; its smoke rises only while someone in this house is home and awake
      const [cx, cz] = turn(0.75, -0.45);
      g.add(part(box(0.26, 1.3, 0.26), C.stoneDark, [cx, 2.55, cz], { t: 0.03 }));
      if (ring) {
        const [sx, sz] = turn(0, 2.2), far = Math.hypot(sx, RING - sz), ux = -sx / far, uz = (RING - sz) / far; // towards the plaza centre
        for (let d = 0; d < far - HUB_R - 0.9; d += 0.95) g.add(part(cyl(0.24, 0.27, 0.04, 9), C.stone, [sx + ux * d, 0.03, sz + uz * d], { t: 0.012 }));
        const hedge = bush(0.55, mulberry32(Math.round(x * 97 + z * 13))), [hx, hz] = turn(-2.35, 0.2);
        hedge.position.set(hx, 0, hz);
        g.add(hedge);
      }
      (g.userData.smoke ??= []).push([0, 1, 2].map(() => {
        const puff = new THREE.Mesh(ball(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#efe6d6', transparent: true, depthWrite: false }));
        puff.userData.from = new THREE.Vector3(cx, 3.25, cz);
        puff.raycast = () => {};
        g.add(puff);
        return puff;
      }));
    }
    g.userData.top = 3.4;
    return g;
  };
}

// Nori's carpentry on Willow Lane: a ladder up to the roof she is fixing, a sawhorse with a plank and a toolbox.
function carpentry(build) {
  return () => {
    const g = build(), ladder = new THREE.Group();
    for (const x of [-0.22, 0.22]) ladder.add(part(box(0.06, 2.4, 0.06), C.wood, [x, 1.2, 0], { t: 0.012 }));
    for (let k = 0; k < 6; k++) ladder.add(part(box(0.44, 0.04, 0.05), C.wood, [0, 0.25 + k * 0.4, 0], { t: 0.008 }));
    ladder.position.set(-1.5, 0, -0.9); ladder.rotation.set(0, Math.PI / 2, -0.28); // leaning on the middle cottage's side wall
    g.add(ladder);
    for (const x of [-2.05, -1.35]) for (const z of [-0.18, 0.18]) g.add(part(box(0.05, 0.55, 0.05).rotateX(z > 0 ? -0.25 : 0.25), C.woodDark, [x, 0.27, 3.4 + z], { t: 0.01 }));
    g.add(part(box(0.9, 0.06, 0.12), C.woodDark, [-1.7, 0.54, 3.4], { t: 0.01 }));
    g.add(part(box(1.6, 0.05, 0.3), '#e6c7a2', [-1.7, 0.6, 3.4], { t: 0.012 }));
    g.add(part(box(0.45, 0.22, 0.25), C.coral, [-2.95, 0.11, 3.3], { t: 0.015 }));
    g.add(part(box(0.3, 0.04, 0.04), C.woodDark, [-2.95, 0.27, 3.3], { t: 0.006 }));
    return g;
  };
}

function store() {
  const g = house({ w: 4.6, d: 3.6, h: 2.1, wall: '#f3e2c4', roof: '#8fa9b8', roofH: 1.3 });
  const aw = part(box(4.2, 0.08, 1.1), '#ffffff', [0, 2.0, 2.3], { map: awningTex(C.teal), t: 0.05 });
  aw.rotation.x = 0.25;
  g.add(aw);
  for (const [x, z] of [[1.6, 2.5], [2.05, 2.75]]) g.add(part(cyl(0.3, 0.3, 0.6, 12), C.wood, [x, 0.3, z], { t: 0.04 }));
  for (const x of [-1.5, -1.95]) g.add(part(ball(0.3, 12, 10).scale(1, 1.2, 0.9), C.cream, [x, 0.33, 2.6], { t: 0.04 })); // rice sacks
  return g;
}

function bathhouse() {
  const g = house({ w: 5.2, d: 4, h: 2.0, wall: C.cream, roof: C.teal, roofH: 1.4 });
  g.add(part(cyl(0.35, 0.42, 4.4, 12), '#d8a48f', [-1.6, 3.0, -1.1]));
  g.add(part(cyl(0.42, 0.42, 0.2, 12), C.woodDark, [-1.6, 5.2, -1.1], { t: 0.04 }));
  g.userData.curtains = [];
  for (const [x, c] of [[-0.22, '#7fa7c9'], [0.22, C.pink]]) {
    const curtain = part(box(0.4, 0.6, 0.04).translate(0, -0.3, 0), c, [x, 1.6, 2.08], { t: 0.02 });
    g.add(curtain); g.userData.curtains.push(curtain);
  }
  for (const x of [1.7, 2.2]) g.add(part(cyl(0.28, 0.24, 0.5, 12), C.wood, [x, 0.25, 2.5], { t: 0.04 }));
  g.userData.steam = new THREE.Vector3(-1.6, 5.4, -1.1);
  // Open courtyard bath, visible from the isometric camera. Its three reserved
  // places are shared with baths.js; the opaque surface hides submerged legs.
  g.add(part(cyl(1.5, 1.55, 0.3, 28), C.woodDark, [4.2, 0.15, 0.35], { t: 0.025 }));
  g.add(part(cyl(1.37, 1.37, 0.045, 28), '#8bbeb6', [4.2, 0.33, 0.35], { t: 0 }));
  g.add(part(new THREE.TorusGeometry(1.45, 0.075, 6, 28).rotateX(Math.PI / 2), '#d7ad77', [4.2, 0.33, 0.35], { t: 0.012 }));
  g.add(part(box(3.1, 0.12, 0.55), C.wood, [4.2, 0.06, 2.25], { t: 0.02 }));
  g.userData.bathSteam = new THREE.Vector3(4.2, 0.45, 0.35);
  // the firebox that heats the baths, stoked from the side yard (sim.js bathhouse work station)
  g.add(part(box(0.9, 0.7, 0.7), C.stoneDark, [-3.3, 0.35, 0.8], { t: 0.03 }));
  g.add(part(box(0.42, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: '#f2a35a' }), [-3.3, 0.3, 1.16], { t: 0 }));
  g.add(part(cyl(0.12, 0.14, 1.2, 8), C.stoneDark, [-3.5, 1.2, 0.65], { t: 0.02 }));
  for (const [y, z] of [[0.12, 1.5], [0.12, 1.75], [0.32, 1.62]]) g.add(part(cyl(0.1, 0.1, 0.7, 8).rotateZ(Math.PI / 2), C.wood, [-4.2, y, z], { t: 0.015 }));
  return g;
}

function theater() {
  const g = house({ w: 6.4, d: 4.2, h: 2.6, wall: '#f6e3cf', roof: C.coral, roofH: 1.7, frontWindows: false });
  g.add(part(box(5.2, 0.5, 1.4), C.wood, [0, 0.25, 2.75]));
  for (const x of [-2.4, 2.4]) g.add(part(box(1.1, 2.1, 0.1), '#d98c8c', [x, 1.45, 2.16], { t: 0.04 }));
  g.add(part(box(5.8, 0.45, 0.12), '#ffffff', [0, 2.62, 2.18], { map: awningTex('#d98c8c'), t: 0.04 }));
  for (const x of [-2, -1, 0, 1, 2]) g.add(chochin(x, 2.35, 2.75));
  for (const [x, c] of [[-3.7, C.gold], [3.7, C.teal]]) {
    g.add(part(cyl(0.05, 0.05, 3.4, 6), C.woodDark, [x, 1.7, 2.9], { t: 0.03 }));
    g.add(part(box(0.5, 1.9, 0.04), c, [x + 0.3, 2.2, 2.9], { t: 0.03 })); // nobori banner
  }
  g.userData.top = 4.6;
  return g;
}

function fishingPier() {
  const g = new THREE.Group();
  // The deck and water footprints match the simulation's collision boundaries.
  g.add(part(box(14.3, 0.08, 8.3), C.stoneDark, [0, 0.025, -3], { t: 0.04 }));
  g.add(part(box(14, 0.04, 8), C.water, [0, 0.08, -3], { t: 0 }));
  for (let z = -3.2; z < 4; z += 0.35) g.add(part(box(6, 0.12, 0.32), z % 0.7 < 0.35 ? '#c69770' : '#d5ab83', [0, 0.06, z], { t: 0.013 }));
  for (const x of [-2.9, 2.9]) for (const z of [-3.1, 0, 3.7]) g.add(part(cyl(0.09, 0.1, 0.5, 8), C.woodDark, [x, 0.1, z], { t: 0.02 }));
  for (const x of [-2, 0, 2]) {
    g.add(part(box(0.5, 0.04, 0.3), C.cream, [x, 0.15, -2.3], { t: 0.015 }));
    g.add(part(cyl(0.19, 0.15, 0.26, 12), C.teal, [x + 0.6, 0.26, -1.8], { t: 0.02 }));
  }
  for (let i = 0; i < 20; i++) {
    const x = (i < 10 ? -1 : 1) * (5.8 + (i % 3) * 0.35), z = -6.5 + (i % 10) * 0.75;
    for (let j = 0; j < 3; j++) g.add(part(cyl(0.025, 0.035, 0.65 + j * 0.13, 5), '#648257', [x + j * 0.1, 0.37, z + j * 0.06], { t: 0.01 }));
    if (i % 2 === 0) g.add(part(cyl(0.05, 0.05, 0.2, 6), C.wood, [x + 0.1, 0.78, z], { t: 0.01 }));
  }
  for (let i = 0; i < 12; i++) g.add(part(box(0.5 + i % 3 * 0.2, 0.01, 0.025), '#d4efea', [(i % 2 ? -1 : 1) * (3.6 + i % 4 * 0.6), 0.11, -6.5 + i * 0.56], { t: 0 }));
  // A little moored rowboat beside the deck.
  const boat = rowboat();
  boat.position.set(4.6, 0, -2);
  g.add(boat);
  g.userData.boat = boat;
  // The mooring stays attached to the pier, above the water.
  g.add(part(cyl(0.018, 0.018, 1.55, 6).rotateZ(Math.PI / 2), '#e3bd83', [3.65, 0.27, -2.8], { t: 0 }));
  g.userData.top = 1.8;
  return g;
}

function watersideKitchen() {
  const g = new THREE.Group();
  g.add(part(box(6.4, 0.3, 3), C.stone, [0, 0.15, 0], { t: 0.04 }));
  for (const x of [-3, 3]) for (const z of [-1.3, 1.3]) g.add(part(cyl(0.09, 0.1, 2.9, 8), C.wood, [x, 1.45, z], { t: 0.03 }));
  g.add(part(box(7, 0.22, 1.8), C.teal, [0, 3, -0.9], { t: 0.06 }));
  g.add(part(box(6.4, 0.12, 0.12), C.woodDark, [0, 2.8, 1.3], { t: 0.02 }));
  for (const x of [-2, 0, 2]) {
    g.add(part(box(1.35, 0.45, 0.9), C.stoneDark, [x, 0.325, 1], { t: 0.035 }));
    g.add(part(box(1.1, 0.04, 0.65), C.woodDark, [x, 0.57, 1], { t: 0.02 }));
    for (let k = 0; k < 7; k++) g.add(part(box(0.025, 0.04, 0.7), C.stone, [x - 0.45 + k * 0.15, 0.61, 1], { t: 0 }));
    g.add(part(ball(0.07, 8, 6), C.coral, [x, 0.51, 1.2], { t: 0.01 }));
  }
  for (const x of [-2, 2]) {
    g.add(part(box(2, 0.12, 0.8), C.wood, [x, 0.5, 4.5], { t: 0.03 }));
    for (const dx of [-0.7, 0.7]) g.add(part(box(0.1, 0.5, 0.6), C.woodDark, [x + dx, 0.25, 4.5], { t: 0.02 }));
  }
  g.add(chochin(-2.5, 2.5, 1.7), chochin(2.5, 2.5, 1.7));
  g.userData.top = 3.3;
  return g;
}

function watersidePavilion() {
  const g = new THREE.Group();
  for (let x = -3.2; x < 3.2; x += 0.32) g.add(part(box(0.3, 0.08, 5), C.wood, [x, 0.02, 0.7], { t: 0.01 }));
  for (const x of [-3, 3]) g.add(part(cyl(0.12, 0.12, 2.8, 8), C.woodDark, [x, 1.4, 0], { t: 0.03 }));
  g.add(part(box(6.6, 0.18, 3), C.gold, [0, 2.9, 0], { t: 0.04 }));
  g.add(part(box(6.4, 0.75, 0.15), C.wood, [0, 0.5, -1.4], { t: 0.025 }));
  for (const x of [-2.5, 0, 2.5]) g.add(part(cyl(0.08, 0.08, 0.9, 6), C.woodDark, [x, 0.45, -1.4], { t: 0.02 }));
  g.add(chochin(-2.4, 2.45, 1.2), chochin(0, 2.45, 1.2), chochin(2.4, 2.45, 1.2));
  g.userData.top = 3.3;
  return g;
}

// Vegetable beds: long earth mounds with rows of leafy crops (cabbages and carrot tops).
function vegBeds(xs, z0, z1) {
  const g = new THREE.Group(), len = z1 - z0;
  xs.forEach((x, i) => {
    g.add(part(box(1, 0.22, len), C.earth, [x, 0.11, (z0 + z1) / 2], { t: 0.03 }));
    for (let z = z0 + 0.45; z < z1 - 0.2; z += 0.7) {
      if (i % 2) g.add(part(ball(0.2, 10, 8), '#a9cc7e', [x, 0.36, z], { t: 0.025 }));
      else for (const dx of [-0.2, 0.2]) g.add(part(new THREE.ConeGeometry(0.09, 0.34, 5), C.sageDark, [x + dx, 0.38, z], { t: 0.02 }));
    }
  });
  return g;
}
function haystack() {
  const g = new THREE.Group();
  g.add(part(cyl(0.5, 0.55, 0.55, 14), '#e8c66a', [0, 0.28, 0], { t: 0.04 }));
  g.add(part(new THREE.ConeGeometry(0.52, 0.5, 14), '#efd27f', [0, 0.8, 0], { t: 0.04 }));
  return g;
}

// Sunfield Farm: a red barn between vegetable beds (footprints match the simulation's SOLIDS and work stations).
function farm() {
  const g = new THREE.Group();
  const barn = house({ w: 4.6, d: 3.6, h: 2.2, wall: '#d9776a', roof: C.woodDark, roofH: 1.6, gable: true, frontWindows: false });
  barn.position.set(0, 0, -0.8);
  g.add(barn);
  g.add(part(box(1.7, 1.7, 0.08), C.cream, [0, 1.15, 1.04], { t: 0.04 })); // big barn doors with white trim
  g.add(part(box(1.5, 1.5, 0.06), '#b85c50', [0, 1.15, 1.09], { t: 0.02 }));
  for (const sx of [-1, 1]) g.add(part(box(0.12, 2, 0.04), C.cream, [0, 1.15, 1.13], { t: 0 }).rotateZ(sx * 0.78));
  g.add(vegBeds([-5.9, -3.9], -3, 2), vegBeds([3.9, 5.9], -3, 2));
  const hay = haystack();
  hay.position.set(-2.9, 0, 2.4);
  g.add(hay);
  for (const [x, y, z] of [[2.7, 0.2, 2.2], [3.15, 0.2, 2.5], [2.9, 0.6, 2.35]]) { // crates of produce for the market
    g.add(part(box(0.42, 0.38, 0.42), C.wood, [x, y, z], { t: 0.03 }));
    for (const dx of [-0.1, 0.1]) g.add(part(ball(0.09, 8, 6), y > 0.4 ? C.coral : '#f0a35a', [x + dx, y + 0.24, z], { t: 0.01 }));
  }
  // scarecrow minding the right-hand beds
  g.add(part(cyl(0.05, 0.05, 1.6, 6), C.woodDark, [5.2, 0.8, -1.6], { t: 0.02 }));
  g.add(part(box(1.1, 0.07, 0.07), C.woodDark, [5.2, 1.25, -1.6], { t: 0.02 }));
  g.add(part(box(0.5, 0.55, 0.22), C.teal, [5.2, 1.1, -1.6], { t: 0.02 }));
  g.add(part(ball(0.18, 10, 8), C.cream, [5.2, 1.68, -1.6], { t: 0.02 }));
  g.add(part(new THREE.ConeGeometry(0.34, 0.22, 12), '#e8c66a', [5.2, 1.88, -1.6], { t: 0.02 }));
  g.userData.top = 4.1;
  return g;
}

// fruit trees in tidy orchard rows, hung with persimmons
function fruitTree(rnd) {
  const g = new THREE.Group();
  g.add(part(cyl(0.1, 0.16, 1, 8), C.wood, [0, 0.5, 0], { t: 0.04 }));
  g.add(part(ball(0.75, 14, 10), rnd() < 0.5 ? '#a9cc8c' : '#97bf80', [0, 1.45, 0], { t: 0.05 }));
  for (let i = 0; i < 5; i++) { const a = rnd() * 6.28; g.add(part(ball(0.09, 8, 6), '#f0a35a', [Math.cos(a) * 0.62, 1.2 + rnd() * 0.5, Math.sin(a) * 0.62], { t: 0.01 })); }
  g.add(blob(0.8));
  return g;
}

// a cedar: a straight trunk under stacked evergreen tiers
function cedar(s, rnd) {
  const g = new THREE.Group(), green = rnd() < 0.5 ? '#86a982' : '#76997a';
  g.add(part(cyl(0.1 * s, 0.16 * s, 0.9 * s, 8), C.woodDark, [0, 0.45 * s, 0], { t: 0.04 }));
  for (const [y, r, h] of [[0.9, 0.85, 1.1], [1.55, 0.65, 0.95], [2.1, 0.42, 0.8]]) g.add(part(new THREE.ConeGeometry(r * s, h * s, 9), green, [0, (y + h / 2) * s, 0], { t: 0.05 }));
  g.add(blob(0.9 * s));
  return g;
}

// Kumo Hot Spring: a rock-rimmed pool under a little waterfall, with a changing hut (footprints match SOLIDS and PLACES).
function onsen() {
  const g = new THREE.Group(), R = mulberry32(11);
  const hut = house({ w: 2.5, d: 2.1, h: 1.7, wall: C.cream, roof: C.woodDark, roofH: 1.1, gable: true, frontWindows: false });
  hut.position.set(-3.5, 0, -0.9);
  g.add(hut);
  for (const [x, c] of [[-3.72, '#7fa7c9'], [-3.28, C.pink]]) g.add(part(box(0.4, 0.6, 0.04), c, [x, 1.3, 0.23], { t: 0.02 })); // noren curtains
  g.add(part(cyl(1.85, 1.85, 0.1, 28), '#9fd3d6', [0.4, 0.2, 0.2], { t: 0 })); // the water
  for (let k = 0; k < 18; k++) { // rim stones
    const a = (k / 18) * Math.PI * 2, r = 1.95 + R() * 0.12;
    g.add(part(ball(0.26 + R() * 0.1, 10, 8).scale(1.2, 0.6, 1), k % 3 ? C.stoneDark : C.stone, [0.4 + Math.cos(a) * r, 0.16, 0.2 + Math.sin(a) * r], { t: 0.03 }));
  }
  for (const [x, z, r, y] of [[0.2, -2.3, 0.75, 0.5], [1.2, -2.4, 0.95, 0.75], [2.3, -2.2, 0.7, 0.45], [1.6, -1.9, 0.5, 0.3], [0.9, -2.5, 0.6, 1.3]]) // rocky rise behind
    g.add(part(ball(r, 12, 10).scale(1, 0.9, 0.8), C.stoneDark, [x, y, z], { t: 0.05 }));
  g.add(part(box(0.45, 1.3, 0.06), '#c6ecec', [1.0, 0.85, -1.62], { t: 0.02 })); // waterfall into the pool
  for (const [x, z] of [[2.9, -1.4], [-1.6, 2.4]]) { const t = cedar(0.7, R); t.position.set(x, 0, z); g.add(t); }
  for (const [x, y] of [[-2.9, 0.15], [-2.65, 0.15], [-2.78, 0.42]]) g.add(part(cyl(0.14, 0.12, 0.26, 10), C.wood, [x, y, 0.85], { t: 0.02 })); // stacked wash buckets
  g.add(chochin(-4.6, 2.2, 0.35), chochin(-2.4, 2.2, 0.35));
  g.userData.steam = new THREE.Vector3(0.4, 0.4, 0.2);
  g.userData.top = 3.4;
  return g;
}

// Cedar Woodlot: an open woodshed of split firewood, a log pile and the chopping block (footprints match SOLIDS and PLACES).
function woodlot() {
  const g = new THREE.Group(), R = mulberry32(13);
  for (const [x, z, h] of [[1.35, -0.15, 2.0], [4.05, -0.15, 2.0], [1.35, -2.25, 1.6], [4.05, -2.25, 1.6]]) g.add(part(box(0.18, h, 0.18), C.woodDark, [x, h / 2, z], { t: 0.03 }));
  const roof = part(box(3.3, 0.14, 2.7), C.wood, [2.7, 1.9, -1.2], { t: 0.05 });
  roof.rotation.x = -0.2;
  g.add(roof);
  for (let row = 0; row < 4; row++) for (let k = 0; k < 9; k++) // split firewood stacked under the roof
    g.add(part(cyl(0.13, 0.13, 1.4, 6).rotateX(Math.PI / 2), R() < 0.5 ? '#c99a74' : '#b88a66', [1.65 + k * 0.29 + (row % 2) * 0.14, 0.15 + row * 0.25, -1.3], { t: 0.015 }));
  for (const [n, y] of [[3, 0.22], [2, 0.6], [1, 0.98]]) for (let k = 0; k < n; k++) // felled logs
    g.add(part(cyl(0.22, 0.22, 1.9, 10).rotateZ(Math.PI / 2), C.wood, [-2.4, y, -0.8 - (n - 1) * 0.22 + k * 0.44], { t: 0.03 }));
  g.add(part(cyl(0.3, 0.34, 0.45, 12), '#c99a74', [0.2, 0.22, 0.9], { t: 0.03 })); // chopping block, axe resting in it
  g.add(part(box(0.06, 0.7, 0.06), C.woodDark, [0.3, 0.75, 0.9], { t: 0.02 }).rotateZ(-0.35));
  g.add(part(box(0.24, 0.16, 0.05), C.stoneDark, [0.2, 0.47, 0.9], { t: 0.02 }));
  for (const [x, z, a] of [[0.75, 1.3, 0.3], [-0.35, 1.2, 1.4], [0.6, 0.45, 2.2]]) g.add(part(cyl(0.12, 0.12, 0.4, 6).rotateZ(Math.PI / 2).rotateY(a), '#c99a74', [x, 0.12, z], { t: 0.015 }));
  for (const [x, z, k] of [[-4.4, -2.2, 1.2], [-0.9, -2.6, 1.1], [4.8, 0.4, 1.3]]) { const t = cedar(k, R); t.position.set(x, 0, z); g.add(t); }
  g.userData.top = 3.9;
  return g;
}

const BUILDERS = {
  farm, onsen, woodlot,
  cabin: homes(HOUSES.cabin.map(([x, z], i) => [x, z, ...[['#d9b48f', C.woodDark], ['#e6c7a2', C.sageDark]][i]])),
  farmhouse: homes(HOUSES.farmhouse.map(([x, z], i) => [x, z, ...[['#f3e3c3', '#d9776a'], [C.cream, C.sageDark]][i]])),
  // [wall, roof] per house in order around the plaza ring: no two neighbours share a roof colour
  clover: homes(HOUSES.clover.map(([x, z, rot], i) => [x, z, ...[[C.peach, C.pink], [C.cream, C.teal], ['#e8dcf0', C.gold], [C.peach, C.sageDark], ['#dde8c9', C.cream]][i], rot]), { ring: true }),
  blossom: homes(HOUSES.blossom.map(([x, z, rot], i) => [x, z, ...[[C.cream, C.coral], ['#e8dcf0', C.sageDark], [C.cream, C.pink], [C.peach, C.teal], ['#dde8c9', C.gold]][i], rot]), { ring: true }),
  maple: homes(HOUSES.maple.map(([x, z, rot], i) => [x, z, ...[[C.peach, C.cream], [C.cream, C.coral], ['#e8dcf0', C.teal], ['#dde8c9', C.pink], [C.peach, C.sageDark]][i], rot]), { ring: true }),
  bakery, teahouse, shrine, library, market, store, bathhouse, theater, fishing: fishingPier, cookhouse: watersideKitchen, boardwalk: watersidePavilion,
  homes: homes(HOUSES.homes.map(([x, z, rot], i) => [x, z, ...[[C.cream, C.teal], [C.peach, C.pink], ['#dde8c9', C.gold]][i], rot])),
  willow: carpentry(homes(HOUSES.willow.map(([x, z, rot], i) => [x, z, ...[['#e8dcf0', '#9fbfa6'], [C.cream, '#e2a99b'], [C.peach, C.teal]][i], rot]))),
};

// Entrance gate on each district's road, styled per district.
function gate(kind) {
  const g = new THREE.Group(), post = { village: C.wood, market: C.teal, pleasure: C.coral, waterfront: C.teal, farmland: C.earth, hillside: C.sageDark, meadow: C.pink }[kind];
  for (const x of [-1.9, 1.9]) {
    g.add(part(cyl(0.14, 0.16, 2.8, 10), post, [x, 1.4, 0], { t: 0.05 }));
    g.add(part(box(0.5, 0.25, 0.5), C.stoneDark, [x, 0.12, 0], { t: 0.04 }));
  }
  if (kind === 'market') g.add(part(box(4.4, 0.5, 0.14), '#ffffff', [0, 2.75, 0], { map: awningTex(C.gold), t: 0.05 }));
  else {
    g.add(part(box(4.7, 0.22, 0.34), C.woodDark, [0, 2.9, 0], { t: 0.05 }));
    g.add(part(box(4.1, 0.14, 0.2), post, [0, 2.4, 0], { t: 0.04 }));
  }
  if (kind === 'pleasure') for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(chochin(x, 2.05, 0));
  return g;
}

export const SEAT_H = 0.3; // bench seat height, matched to the residents' sitting pose
function bench() {
  const g = new THREE.Group(), t = 0.03;
  g.add(part(box(1.3, 0.08, 0.42), C.wood, [0, SEAT_H, -0.06], { t }));
  g.add(part(box(1.3, 0.3, 0.07), C.wood, [0, SEAT_H + 0.25, -0.28], { t }));
  for (const x of [-0.55, 0.55]) g.add(part(box(0.08, SEAT_H, 0.36), C.woodDark, [x, SEAT_H / 2, -0.06], { t }));
  g.add(blob(0.75));
  return g;
}

function signpost() {
  const g = new THREE.Group();
  g.add(part(cyl(0.1, 0.12, 2.4, 8), C.wood, [0, 1.2, 0], { t: 0.04 }));
  DISTRICTS.forEach((D, i) => {
    const arm = new THREE.Group();
    arm.rotation.y = Math.atan2(D.uz, -D.ux); // local +x (the board) points towards the district
    arm.position.y = 1.5 + i * 0.32;
    arm.add(part(box(1.1, 0.24, 0.06), C.cream, [0.6, 0, 0], { t: 0.03 }));
    g.add(arm);
  });
  return g;
}

// ---------- nature ----------
// canopy colours per season: blossom, summer leaves, autumn maple tones, winter frost
const FOLIAGE = {
  spring: [C.blossom, C.blossom2], summer: ['#b5d39a', '#9fc48a'],
  autumn: ['#f2b07a', '#e8907a', '#f2cf7a'], winter: ['#f3f0ea', '#e2e8ec'],
};
// Leaves sway in the wind in the vertex shader (stronger in rain); canopy outlines share the same sway so the hull never slips.
const wind = { time: { value: 0 }, gust: { value: 1 } };
const swaying = (m, base = 0.9, amp = 0.035) => { // sway grows with height above `base`
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uWindTime: wind.time, uWindGust: wind.gust });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindTime, uWindGust;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 windAt = modelMatrix * vec4(transformed, 1.0);
      float windLift = clamp(windAt.y - ${base.toFixed(2)}, 0.0, 2.0) * ${amp.toFixed(3)} * uWindGust;
      transformed.x += sin(uWindTime * 1.3 + windAt.x * 0.45 + windAt.z * 0.3) * windLift;
      transformed.z += sin(uWindTime * 1.1 + windAt.z * 0.5 - windAt.x * 0.2) * windLift * 0.6;`);
  };
  m.customProgramCacheKey = () => `wind${base}:${amp}`;
  return m;
};
const canopyMats = [0, 1, 2].map((i) => swaying(new THREE.MeshToonMaterial({ color: FOLIAGE.spring[i % 2], gradientMap: grad })));
const canopyOutline = swaying(outlineMat.clone());
const bushMats = [C.sage, C.sageDark].map((c) => swaying(new THREE.MeshToonMaterial({ color: c, gradientMap: grad }), 0.05, 0.08));
const bushOutline = swaying(outlineMat.clone(), 0.05, 0.08);
const syncCanopy = (s) => { const p = FOLIAGE[s] ?? FOLIAGE.spring; canopyMats.forEach((m, i) => m.color.set(p[i % p.length])); };
let canopy = canopyMats;

function sakura(s, rnd) {
  const g = new THREE.Group();
  g.add(part(cyl(0.12 * s, 0.2 * s, 1.3 * s, 8), C.wood, [0, 0.65 * s, 0], { t: 0.05 }));
  for (const [x, y, z, r] of [[0, 1.75, 0, 0.85], [0.6, 1.5, 0.2, 0.6], [-0.55, 1.55, -0.15, 0.62], [0.1, 2.25, -0.1, 0.6], [-0.2, 1.45, 0.55, 0.5]])
    g.add(part(ball(r * s, 16, 12), canopy[Math.floor(rnd() * canopy.length)], [x * s, y * s, z * s], { t: 0.06 }));
  g.add(blob(1.1 * s));
  return g;
}

function bush(s, rnd) {
  const g = new THREE.Group();
  for (const [x, z, r] of [[0, 0, 0.5], [0.45, 0.15, 0.36], [-0.4, 0.1, 0.38]]) g.add(part(ball(r * s, 14, 10), bushMats[rnd() < 0.6 ? 0 : 1], [x * s, r * s * 0.8, z * s], { t: 0.05 }));
  g.add(blob(0.8 * s));
  return g;
}

function flowers(rnd) {
  const g = new THREE.Group(), col = [C.gold, C.blossom2, '#ffffff', '#b39ad1'][Math.floor(rnd() * 4)];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ball(0.1, 8, 6), toon(col));
    m.position.set((rnd() - 0.5) * 1.1, 0.12, (rnd() - 0.5) * 1.1);
    g.add(m);
  }
  return g;
}

// ---------- animals ----------
function duck(color) {
  const g = new THREE.Group();
  g.add(part(ball(0.2, 12, 10).scale(1, 0.75, 1.35), color, [0, 0.12, 0], { t: 0.025 }));
  g.add(part(ball(0.12, 10, 8), color === C.cream ? C.cream : '#7f9f80', [0, 0.32, 0.2], { t: 0.02 }));
  g.add(part(box(0.08, 0.04, 0.14), '#f0a35a', [0, 0.3, 0.34], { t: 0.01 }));
  return g;
}
function hen(rnd) {
  const g = new THREE.Group(), body = new THREE.Group();
  body.add(part(ball(0.2, 12, 10).scale(1, 0.95, 1.2), rnd() < 0.5 ? C.cream : '#d9a676', [0, 0.24, 0], { t: 0.025 }));
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.16);
  head.add(part(ball(0.1, 10, 8), C.cream, [0, 0, 0], { t: 0.02 }));
  head.add(part(box(0.04, 0.07, 0.08), C.coral, [0, 0.1, 0], { t: 0.01 }));
  head.add(part(new THREE.ConeGeometry(0.035, 0.08, 6).rotateX(Math.PI / 2), '#f0a35a', [0, -0.01, 0.12], { t: 0.01 }));
  body.add(head);
  body.add(part(new THREE.ConeGeometry(0.1, 0.18, 6).rotateX(-0.9), C.cream, [0, 0.36, -0.2], { t: 0.02 }));
  for (const x of [-0.06, 0.06]) g.add(part(cyl(0.015, 0.015, 0.12, 4), '#f0a35a', [x, 0.06, 0], { t: 0 }));
  g.add(body, blob(0.22));
  g.userData = { body, head };
  return g;
}
function deer() {
  const g = new THREE.Group(), legs = [];
  g.add(part(ball(0.32, 12, 10).scale(0.85, 0.8, 1.6), '#c99a6e', [0, 0.78, 0], { t: 0.03 }));
  for (const [x, z] of [[-0.14, 0.32], [0.14, 0.32], [-0.14, -0.32], [0.14, -0.32]]) {
    const l = part(cyl(0.04, 0.035, 0.55, 6).translate(0, -0.275, 0), '#a77c58', [x, 0.62, z], { t: 0.015 });
    legs.push(l);
    g.add(l);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 0.95, 0.38);
  neck.add(part(cyl(0.08, 0.1, 0.42, 8).translate(0, 0.2, 0), '#c99a6e', [0, 0, 0], { t: 0.02 }));
  neck.add(part(ball(0.13, 10, 8).scale(0.9, 0.9, 1.4), '#c99a6e', [0, 0.42, 0.08], { t: 0.02 }));
  for (const x of [-0.09, 0.09]) neck.add(part(new THREE.ConeGeometry(0.05, 0.14, 6), '#a77c58', [x, 0.56, 0], { t: 0.015 }));
  for (const [x, z] of [[-0.2, 0.1], [0.1, 0.2], [0.24, -0.1]]) g.add(part(ball(0.04, 6, 5), C.cream, [x, 1.02, z], { t: 0 })); // fawn spots
  g.add(neck, blob(0.5));
  g.userData = { neck, legs };
  return g;
}
function bird(color) {
  const g = new THREE.Group(), wings = [];
  g.add(part(ball(0.09, 8, 6).scale(1, 0.9, 1.5), color, [0, 0, 0], { t: 0.015 }));
  for (const sx of [-1, 1]) {
    const w = part(box(0.22, 0.02, 0.1).translate(sx * 0.11, 0, 0), color, [0, 0.02, 0], { t: 0.01 });
    wings.push(w);
    g.add(w);
  }
  g.userData = { wings };
  return g;
}

// A town pet (cat or dog) whose pose follows its simulated state: walking, sitting, napping, being petted.
export function petModel(kind, coat) {
  const g = new THREE.Group(), body = new THREE.Group(), dark = shade(coat, 0.8), dog = kind === 'dog', k = dog ? 1.3 : 1;
  body.add(part(ball(0.18 * k, 12, 10).scale(0.9, 0.8, 1.55), coat, [0, 0, 0], { t: 0.025 }));
  const head = new THREE.Group();
  head.position.set(0, 0.12 * k, 0.26 * k);
  head.add(part(ball(0.14 * k, 12, 10), coat, [0, 0, 0], { t: 0.025 }));
  for (const sx of [-1, 1]) head.add(part(new THREE.ConeGeometry(0.055 * k, (dog ? 0.1 : 0.13) * k, 4), dog ? dark : coat, [sx * 0.075 * k, 0.13 * k, 0], { t: 0.015 }).rotateZ(dog ? -sx * 2.4 : -sx * 0.25));
  head.add(part(ball(0.03, 6, 5), C.outline, [0, -0.01, 0.135 * k], { t: 0 }));
  if (dog) head.add(part(ball(0.07 * k, 8, 6).scale(1, 0.8, 1.2), coat, [0, -0.04, 0.12 * k], { t: 0.015 }));
  body.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.05, -0.25 * k);
  tail.add(part(cyl(0.03 * k, 0.025 * k, 0.32 * k, 6).translate(0, 0.16 * k, 0), dark, [0, 0, 0], { t: 0.015 }));
  body.add(tail);
  const curledTail = part(new THREE.TorusGeometry(0.2 * k, 0.028 * k, 5, 14, Math.PI * 1.65).rotateX(Math.PI / 2), dark, [0, -0.015, -0.04 * k], { t: 0.008 });
  body.add(curledTail); curledTail.visible = false;
  const legs = [[-0.08, 0.13], [0.08, 0.13], [-0.08, -0.13], [0.08, -0.13]].map(([x, z]) => {
    const l = part(cyl(0.03 * k, 0.03 * k, 0.16 * k, 6).translate(0, -0.08 * k, 0), coat, [x * k, -0.05, z * k], { t: 0.015 });
    body.add(l);
    return l;
  });
  g.add(body, blob(0.25 * k));
  const base = 0.2 * k;
  function pose(state, moving, t) {
    let y = base, pitch = 0, squash = 1, legSwing = 0, wag = Math.sin(t * 2) * 0.3, headTilt = 0;
    if (moving) { legSwing = Math.sin(t * 14) * 0.6; y = base + Math.abs(Math.sin(t * 14)) * 0.02; wag = Math.sin(t * 6) * 0.25; }
    else if (state === 'sit' || state === 'petted') { pitch = -0.55; y = base + 0.04; headTilt = 0.45; if (state === 'petted') wag = Math.sin(t * (dog ? 18 : 5)) * 0.7; }
    else if (state === 'nap' || state === 'sleep') { squash = 0.6; y = base * 0.55; headTilt = 0.2; wag = 0.9; }
    else if (state === 'follow') wag = Math.sin(t * 9) * 0.55; // waiting at a favourite's heels
    else if (state === 'sniff') { headTilt = 0.6 + Math.sin(t * 5) * 0.12; wag = Math.sin(t * 3) * 0.1; }
    else if (state === 'stretch') { pitch = 0.3; squash = 0.75; y = base * 0.8; headTilt = -0.35; }
    else if (state === 'scratch') { headTilt = 0.25; wag = 0.5; }
    body.position.y = y;
    body.rotation.x = pitch;
    const asleep = state === 'nap' || state === 'sleep';
    body.scale.set(1, squash, asleep ? 0.78 : 1);
    head.position.z = (asleep ? 0.12 : 0.26) * k;
    head.rotation.y = asleep ? -0.9 : 0;
    tail.visible = !asleep; curledTail.visible = asleep;
    head.rotation.x = headTilt + (state === 'petted' ? Math.sin(t * 3) * 0.12 : 0);
    tail.rotation.set(state === 'nap' || state === 'sleep' ? 1.3 : -0.6, wag, 0);
    legs.forEach((l, i) => (l.rotation.x = (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1) * legSwing));
    if (!moving && state === 'scratch') { legs[3].rotation.x = Math.sin(t * 20) * 0.8; legs[3].rotation.z = -0.75; }
    else legs[3].rotation.z = 0;
  }
  return { g, pose };
}

function pond(rnd, animators) {
  const pg = new THREE.Group();
  pg.add(part(cyl(2.7, 2.7, 0.04, 32).scale(1, 1, 0.75), C.water, [0, 0.02, 0], { t: 0 }));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 0.32 + rnd() * 0.18;
    pg.add(part(ball(r, 10, 8).scale(1, 0.6, 1), C.stoneDark, [Math.cos(a) * 2.8, r * 0.3, Math.sin(a) * 2.1], { t: 0.04 }));
  }
  for (const [x, z] of [[-1, 0.6], [1.2, -0.5], [0.3, 0.9]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16, 0.4, 5.6), toon('#648257'));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(x, 0.05, z);
    pg.add(pad);
  }
  const koi = ['#f2a07b', '#fff6ea', '#f2cf7a'].map((c, i) => {
    const k = part(ball(0.13, 10, 8).scale(0.6, 0.4, 1.6), c, [0, 0.05, 0], { t: 0.025 });
    pg.add(k);
    return { k, phase: i * 2.1, r: 1.1 + i * 0.35 };
  });
  const ducks = [C.cream, '#c9a27e'].map((c, i) => { const d = duck(c); pg.add(d); return { d, phase: i * Math.PI + 0.6 }; });
  // frogs come out on the lily pads in the rain and on mild evenings, hopping pad to pad now and then
  const pads = [[-1, 0.6], [1.2, -0.5], [0.3, 0.9]];
  const frogs = [0, 1].map((i) => {
    const f = new THREE.Group();
    f.add(part(ball(0.09, 10, 8).scale(1, 0.7, 1.2), C.sageDark, [0, 0.05, 0], { t: 0.015 }));
    for (const sx of [-1, 1]) f.add(part(ball(0.03, 6, 5), C.cream, [sx * 0.04, 0.11, 0.06], { t: 0.008 }));
    pg.add(f);
    return { f, pad: i, from: i, hop: -10, next: 3 + i * 4 };
  });
  animators.push((t, dt, env) => frogs.forEach((g) => {
    g.f.visible = env.rain > 0.3 || (env.night > 0.4 && env.season !== 'winter');
    if (t >= g.next) { g.from = g.pad; g.pad = (g.pad + 1 + (Math.random() < 0.5 ? 1 : 0)) % pads.length; g.hop = t; g.next = t + 4 + Math.random() * 8; }
    const k = Math.min(1, (t - g.hop) / 0.5), a = pads[g.from], b = pads[g.pad];
    g.f.position.set(a[0] + (b[0] - a[0]) * k, 0.05 + Math.sin(k * Math.PI) * 0.35, a[1] + (b[1] - a[1]) * k);
    if (k < 1) g.f.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
  }));
  animators.push((t) => {
    koi.forEach(({ k, phase, r }) => {
      const a = t * 0.5 + phase;
      k.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r * 0.7);
      k.rotation.y = -a;
    });
    ducks.forEach(({ d, phase }) => { // a slow paddle round the pond, bobbing and dipping its head now and then
      const a = t * 0.12 + phase, dip = Math.max(0, Math.sin(t * 0.7 + phase * 3) - 0.92) * 12;
      d.position.set(Math.cos(a) * 1.7, 0.04 + Math.sin(t * 2 + phase) * 0.02, Math.sin(a) * 1.25);
      d.rotation.set(dip * 0.5, Math.atan2(-Math.sin(a) * 1.7, Math.cos(a) * 1.25), 0);
    });
  });
  return pg;
}

// Terraced rice paddies: earth bunds around shallow water with rows of sprouts.
function paddies(cols, rows) {
  const g = new THREE.Group(), cell = 3.4;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * cell, z = (j - (rows - 1) / 2) * cell;
      g.add(part(box(cell - 0.1, 0.18, cell - 0.1), C.earth, [x, 0.09, z], { t: 0.03 }));
      g.add(part(box(cell - 0.6, 0.04, cell - 0.6), '#b9dccf', [x, 0.2, z], { t: 0 }));
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++)
          g.add(part(new THREE.ConeGeometry(0.1, 0.38, 5), C.sageDark, [x - 1.05 + a * 0.7, 0.4, z - 1.05 + b * 0.7], { t: 0.025 }));
    }
  return g;
}

export const ISLAND = WORLD_SIZE;
const CORNER = WORLD_CORNER; // rounded slab corners, so no bare empty corners
const DISTRICT_TINT = { village: '#cfe0b4', market: '#eadcb8', pleasure: '#efd2d0', waterfront: '#c7ded1', farmland: '#e2e4b4', hillside: '#d3e2c8', meadow: '#e2d8c1' };

// distance from (x, z) to segment a-b
const segDist = (x, z, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
};

// Bake a group of static meshes into one mesh per material: thousands of draw calls become a few dozen.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo.index ? geo : geo.setIndex([...Array(geo.attributes.position.count).keys()]));
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.raycast = () => {}; // scenery is never picked
    out.add(m);
    geos.forEach((g) => g.dispose());
  }
  return out;
}

// falling particles: petals, leaves, rain streaks, snow, fireflies
function particles(n, size, color, area) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * area, Math.random() * 24, (Math.random() - 0.5) * area], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, color, transparent: true, depthWrite: false }));
  pts.raycast = () => {};
  return { pts, pos, geo };
}

export function buildTown(scene, season = 'spring') {
  const tx = textures(), rnd = mulberry32(11), animators = [];
  syncCanopy(season);
  canopy = canopyMats.slice(0, (FOLIAGE[season] ?? FOLIAGE.spring).length);
  const statics = new THREE.Group(); // merged into a few meshes at the end
  const add = (o, x, z, rot = 0, into = statics) => { o.position.x = x; o.position.z = z; o.rotation.y = rot; into.add(o); return o; };
  const lights = [], festLights = [];

  // Flat ground layer with world-space planar UVs and a slightly wider curb beneath so overlapping paths merge cleanly.
  const worldUV = (geo) => {
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    return geo;
  };
  const disc = (r, mat, x, z, y, { t = 0.05, map, segs = 48 } = {}) => {
    const top = new THREE.CircleGeometry(r, segs).rotateX(-Math.PI / 2).translate(x, y, z);
    if (map) worldUV(top);
    statics.add(new THREE.Mesh(top, typeof mat === 'string' ? toon(mat, map) : mat));
    if (t > 0) statics.add(new THREE.Mesh(new THREE.CircleGeometry(r + t, segs).rotateX(Math.PI / 2).translate(x, y - 0.004, z), outlineMat));
  };
  const road = (w, len, mat, x, z, rot, y, { t = 0.05, map } = {}) => {
    const top = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2).rotateY(rot).translate(x, y, z);
    if (map) worldUV(top);
    statics.add(new THREE.Mesh(top, typeof mat === 'string' ? toon(mat, map) : mat));
    if (t > 0) statics.add(new THREE.Mesh(new THREE.PlaneGeometry(w + 2 * t, len + 2 * t).rotateX(Math.PI / 2).rotateY(rot).translate(x, y - 0.003, z), outlineMat));
  };

  // diorama slab with rounded corners
  const earth = tx.earth.clone();
  earth.repeat.set(0.1, 0.6);
  earth.needsUpdate = true;
  const h = ISLAND / 2, r = CORNER, shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h); shape.absarc(h - r, -h + r, r, -Math.PI / 2, 0);
  shape.lineTo(h, h - r); shape.absarc(h - r, h - r, r, 0, Math.PI / 2);
  shape.lineTo(-h + r, h); shape.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI);
  shape.lineTo(-h, -h + r); shape.absarc(-h + r, -h + r, r, Math.PI, 1.5 * Math.PI);
  const slab = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false, curveSegments: 16 }).rotateX(-Math.PI / 2);
  scene.add(part(slab, [toon(C.sage, tx.grass), toon(C.earth, earth)], [0, -1.6, 0], { t: 0.1 }));

  // central crossroads with a signpost
  disc(JUNCTION_R + 0.5, C.stone, 0, 0, 0.026, { map: tx.stone, t: 0.06 });
  statics.add(signpost());

  const locs = {}, segments = [];
  for (const D of DISTRICTS) {
    // tinted district ground, plaza, road to the crossroads and an entrance gate
    disc(D.id === 'meadow' ? MEADOW_R + 3.4 : RING + 5.5, DISTRICT_TINT[D.id], D.x, D.z, 0.01, { map: tx.grass, t: 0.06, segs: 64 }); // the meadow's cottage ring is wider
    disc(HUB_R + 0.5, C.stone, D.x, D.z, 0.026, { map: tx.stone, t: 0.06 });
    disc(1.3, shade(DISTRICT_TINT[D.id], 0.9), D.x, D.z, 0.032, { t: 0.04, segs: 32 });
    const len = D.distance - HUB_R - JUNCTION_R + 1.2;
    const approach = DISTRICT_ROADS[D.id];
    for (let i = 1; i < approach.points.length; i++) {
      const a = approach.points[i - 1], b = approach.points[i];
      road(approach.width, Math.hypot(b.x - a.x, b.z - a.z), C.stone, (a.x + b.x) / 2, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z), 0.025, { map: tx.stone, t: 0.06 });
      disc(approach.width / 2, C.stone, b.x, b.z, 0.025, { map: tx.stone, t: 0.04 });
      segments.push([a, b, approach.width / 2 + 1.1]);
    }
    add(gate(D.id), D.gate.x + D.ux * 1.6, D.gate.z + D.uz * 1.6, D.rot);
    if (D.id === 'pleasure') {
      lights.push({ x: D.gate.x + D.ux * 1.6, z: D.gate.z + D.uz * 1.6, r: 2.6 });
      // lantern posts lining the road in
      for (let k = 3; k < len - 1; k += 3) for (const sgn of [-1, 1]) {
        const x = D.gate.x + D.ux * k - D.uz * 1.8 * sgn, z = D.gate.z + D.uz * k + D.ux * 1.8 * sgn;
        add(part(cyl(0.05, 0.05, 2.2, 6), C.woodDark, [0, 1.1, 0], { t: 0.03 }), x, z);
        const glow = lanternMat.clone(); // each post lantern brightens on its own when someone passes
        add(chochin(0, 2.0, 0, glow), x, z);
        lights.push({ x, z, r: 1.3, y: 2.0, glow, paper: true });
      }
    }

    for (const l of LOCATIONS.filter((l) => l.district === D.id)) {
      const r0 = HUB_R - 0.2, r1 = RING - 3.0, m = (r0 + r1) / 2;
      road(1.9, r1 - r0, C.stone, D.x - l.ux * m, D.z - l.uz * m, l.rot, 0.025, { map: tx.stone, t: 0.05 });
      disc(2.15, C.stone, l.door.x - l.ux * 0.6, l.door.z - l.uz * 0.6, 0.026, { map: tx.stone, t: 0.05, segs: 36 });
      const { x: lx, z: lz } = LANTERNS[l.id];
      const glow = windowMat.clone(); // each stone lantern lights up on its own when someone is near
      add(lantern(glow), lx, lz);
      lights.push({ x: lx, z: lz, r: 1.9, y: 1.05, glow }, { x: l.door.x - l.ux * 1.4, z: l.door.z - l.uz * 1.4, r: 1.8 }); // lantern, and the lit doorway
      segments.push([l.entry, l, 1.8]);

      const g = add(BUILDERS[l.id](), l.x, l.z, l.rot, scene);
      g.userData.pick = { type: 'location', id: l.id };
      locs[l.id] = g;
      const businessWindows = new Set();
      g.traverse((o) => { if (o.material?.userData.window) businessWindows.add(o.material); });
      // shop-front chochin and stone lanterns get their own materials so they glow only while the place is occupied
      g.traverse((o) => {
        if (o.material === lanternMat) o.material = g.userData.lanternGlow ??= lanternMat.clone();
        else if (o.material === windowMat) o.material = g.userData.stoneGlow ??= windowMat.clone();
      });
      if (!g.userData.windows) g.userData.businessWindows = [...businessWindows];
      if (g.userData.boat) animators.push((t) => animateBoat(g.userData.boat, t));
      if (g.userData.smoke) animators.push((t, dt, env) => g.userData.smoke.forEach((puffs, h) => {
        let lit = false;
        for (const id in env.people) { const s = env.people[id]; if (s.home === l.id && s.house === h && s.at === l.id && s.hidden && s.act !== 'Sleeping') { lit = true; break; } }
        puffs.forEach((p, i) => { // three puffs on a loop: rise, drift downwind, swell and fade
          const k = (t * 0.3 + i / 3 + h * 0.37) % 1, f = p.userData.from;
          p.visible = lit && env.rain < 0.6;
          p.position.set(f.x + k * 0.6 * (1 + env.rain), f.y + k * 1.3, f.z + Math.sin(k * 5 + i) * 0.08);
          p.scale.setScalar(0.6 + k * 1.6);
          p.material.opacity = (1 - k) * 0.45 * (1 - env.night * 0.5);
        });
      }));
      if (g.userData.curtains) animators.push((t) => g.userData.curtains.forEach((c, i) => { c.rotation.x = Math.sin(t * 1.3 + i * 0.6) * 0.08; }));
      if (g.userData.oven) {
        const cold = new THREE.Color('#6a4736'), hot = new THREE.Color('#edab65');
        animators.push((t, dt, env) => {
          let baking = false;
          for (const id in env.people) { const s = env.people[id]; if (s.at === l.id && s.work && !s.walking && s.task?.reached && env.fires?.[l.id]) { baking = true; break; } }
          g.userData.oven.color.copy(cold).lerp(hot, baking ? 0.9 + Math.sin(t * 5) * 0.05 : 0);
        });
      }
      g.updateMatrixWorld(true);
      g.traverse((object) => {
        if (!object.userData.door) return;
        const center = object.getWorldPosition(new THREE.Vector3());
        animators.push((t, dt, env) => {
          let open = false;
          for (const id in env.people) {
            const s = env.people[id];
            if (!s.hidden && s.walking && Math.hypot(s.x - center.x, s.z - center.z) < 1.65 && s.path?.some((p) => p.threshold && Math.hypot(p.x - center.x, p.z - center.z) < 1.1)) { open = true; break; }
          }
          animateDoor(object, open, dt);
        });
      });
      for (const source of ['steam', 'bathSteam']) if (g.userData[source]) {
        g.updateMatrixWorld();
        const top = g.localToWorld(g.userData[source].clone());
        const puffs = [0, 0.33, 0.66].map((phase) => {
          const m = new THREE.Mesh(ball(0.4, 12, 10), new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, depthWrite: false }));
          scene.add(m);
          return { m, phase };
        });
        const id = l.id;
        animators.push((t, dt, env) => puffs.forEach(({ m, phase }) => {
          let active = id !== 'bakery';
          if (!active) for (const who in env.people) { const s = env.people[who]; if (s.at === id && s.work && !s.walking && s.task?.reached) { active = true; break; } }
          m.visible = active && env.fires?.[id] !== false;
          const k = (t * 0.25 + phase) % 1;
          m.position.set(top.x + k * 0.6, top.y + k * 2.4, top.z);
          m.scale.setScalar(0.5 + k * 1.2);
          m.material.opacity = 0.75 * (1 - k);
        }));
      }
    }
  }

  for (const b of BENCHES) add(bench(), b.x, b.z, b.face);

  // Lantern Festival dressing: strings of chochin around the pleasure plaza, shown on festival nights
  const P = DIST.pleasure, festival = new THREE.Group();
  const posts = [-145, -105, -35, 35, 105, 145].map((o) => {
    const a = ((P.angle + o) * Math.PI) / 180, x = P.x + Math.cos(a) * (HUB_R + 0.9), z = P.z + Math.sin(a) * (HUB_R + 0.9);
    festival.add(part(cyl(0.06, 0.06, 2.8, 6), C.coral, [x, 1.4, z], { t: 0.03 }));
    festLights.push({ x, z, r: 1.3 });
    return { x, z };
  });
  for (let i = 0; i < posts.length - 1; i++) { // spans between neighbours, leaving the road side open
    const a = posts[i], b = posts[i + 1];
    for (const k of [0.25, 0.5, 0.75]) festival.add(chochin(a.x + (b.x - a.x) * k, 2.6 - Math.sin(k * Math.PI) * 0.45, a.z + (b.z - a.z) * k));
  }
  festival.visible = false;
  scene.add(festival);

  // koi pond tucked beside the tea house
  const pa = ((P.angle + 125) * Math.PI) / 180, pondAt = { x: P.x + Math.cos(pa) * 12.5, z: P.z + Math.sin(pa) * 12.5 };
  add(pond(rnd, animators), pondAt.x, pondAt.z, -pa, scene);

  // Sunfield's rice paddies, vegetable patch and orchard fill the open land around the farm plaza
  const fields = [];
  const plot = (F, offset, dist, r, make) => {
    const a = ((F.angle + offset) * Math.PI) / 180, x = F.x + Math.cos(a) * dist, z = F.z + Math.sin(a) * dist;
    add(make(), x, z, Math.atan2(-Math.cos(a), -Math.sin(a)));
    fields.push({ x, z, r });
  };
  plot(DIST.farmland, 80, 11.5, 6.2, () => paddies(3, 2));
  plot(DIST.farmland, -140, 11, 4, () => vegBeds([-1.5, 0, 1.5], -2, 2));
  plot(DIST.farmland, 140, 11.5, 5, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const t = fruitTree(rnd); t.position.set((i - 1) * 2.4, 0, (j - 1) * 2.4); g.add(t); }
    return g;
  });

  // the hillside's cedar groves close in around the onsen plaza
  const grove = (n, spread) => () => {
    const g = new THREE.Group();
    for (let k = 0; k < n; k++) { const t = cedar(0.9 + rnd() * 0.6, rnd), a = rnd() * 6.28, d = Math.sqrt(rnd()) * spread; t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.add(t); }
    return g;
  };
  for (const o of [140, -140]) plot(DIST.hillside, o, 11.5, 4.2, grove(7, 3.2));
  for (const o of [40, -40]) plot(DIST.hillside, o, 14.5, 2.6, grove(3, 1.6));

  // scatter trees, bushes and flowers on free ground; the gaps between districts stay green
  const blockers = [
    ...Object.entries(HOUSES).flatMap(([id, houses]) => houses.map(([x, z]) => {
      const l = LOCATIONS.find((p) => p.id === id);
      return { x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz, r: 3.4 };
    })),
    ...LOCATIONS.map((l) => ({ x: l.x, z: l.z, r: l.id === 'fishing' ? 11 : l.id === 'farm' ? 8 : 6.4 })),
    ...DISTRICTS.map((D) => ({ x: D.x, z: D.z, r: HUB_R + 1.6 })),
    { x: 0, z: 0, r: JUNCTION_R + 1.8 }, { ...pondAt, r: 3.8 }, ...fields, ...BENCHES.map((b) => ({ x: b.x, z: b.z, r: 1.4 })),
  ];
  const free = (x, z) =>
    onIsland(x, z, 1.4) &&
    blockers.every((b) => Math.hypot(x - b.x, z - b.z) > b.r) &&
    segments.every(([a, b, clear]) => segDist(x, z, a, b) > clear);
  const trees = [];
  const anywhere = () => [(rnd() - 0.5) * ISLAND, (rnd() - 0.5) * ISLAND];
  const place = (n, make, minGap, at = anywhere) => {
    for (let tries = 0, done = 0; done < n && tries < n * 40; tries++) {
      const [x, z] = at();
      if (!free(x, z) || trees.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
      add(make(), x, z, rnd() * 6.28);
      trees.push({ x, z, kind: make });
      done++;
    }
  };
  const tree = () => sakura(0.9 + rnd() * 0.5, rnd), shrub = () => bush(0.8 + rnd() * 0.5, rnd);
  const H = DIST.hillside;
  place(30, () => cedar(0.9 + rnd() * 0.5, rnd), 2.2, () => { const a = rnd() * 6.28, d = 12 + rnd() * 16; return [H.x + Math.cos(a) * d, H.z + Math.sin(a) * d]; }); // the woods
  place(70, tree, 2.8);
  place(90, shrub, 1.6);
  const flower = () => flowers(rnd);
  place(60, flower, 1.2);
  // autumn leaf piles under some of the trees
  {
    const piles = trees.filter((p) => p.kind === tree).filter((_, i) => i % 3 === 0).map((p) => ({ p, a: rnd() * 6.28 }))
      .filter(({ p, a }) => free(p.x + Math.cos(a) * 1.1, p.z + Math.sin(a) * 1.1)).map(({ p, a }) => { // never on a path or plaza
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) g.add(part(ball(0.22 + rnd() * 0.12, 8, 6).scale(1, 0.38, 1), [C.coral, C.gold, '#e8a45f'][k % 3], [(rnd() - 0.5) * 0.5, 0.04, (rnd() - 0.5) * 0.5], { t: 0.02 }));
      g.position.set(p.x + Math.cos(a) * 1.1, 0, p.z + Math.sin(a) * 1.1);
      scene.add(g);
      return g;
    });
    animators.push((t, dt, env) => piles.forEach((g) => (g.visible = env.season === 'autumn' && env.snow < 0.5)));
  }
  const sakuras = trees.filter((p) => p.kind === tree), bushes = trees.filter((p) => p.kind === shrub), beds = trees.filter((p) => p.kind === flower);

  // hens pecking about the farm plaza (roosting in the barn after dark)
  {
    const F = DIST.farmland, hens = [0, 1, 2, 3].map(() => {
      const h = hen(rnd), x = F.x + (rnd() - 0.5) * 4, z = F.z + (rnd() - 0.5) * 4;
      scene.add(h);
      return { h, x, z, gx: x, gz: z, wait: rnd() * 3 };
    });
    animators.push((t, dt, env) => hens.forEach((c) => {
      const { body, head } = c.h.userData, dx = c.gx - c.x, dz = c.gz - c.z, d = Math.hypot(dx, dz);
      c.h.visible = env.night < 0.6;
      if (d > 0.05) {
        const s = Math.min(d, 1.1 * dt);
        c.x += (dx / d) * s;
        c.z += (dz / d) * s;
        c.h.rotation.y = Math.atan2(dx, dz);
        body.position.y = Math.abs(Math.sin(t * 16)) * 0.03;
        head.rotation.x = 0;
      } else { // peck, peck, look about, then potter somewhere else
        head.rotation.x = Math.max(0, Math.sin(t * 7 + c.wait * 5)) * 0.9;
        if ((c.wait -= dt) < 0) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (HUB_R - 1); c.gx = F.x + Math.cos(a) * r; c.gz = F.z + Math.sin(a) * r; c.wait = 2 + Math.random() * 5; }
      }
      c.h.position.set(c.x, 0, c.z);
    }));
  }

  // deer grazing in the cedar woods, wandering off unhurried and lifting their heads to listen
  {
    const H = DIST.hillside, herd = [0, 1].map((i) => {
      const d = deer(), a = rnd() * 6.28, r = 15 + rnd() * 5, x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r;
      scene.add(d);
      return { d, x, z, gx: x, gz: z, wait: 2 + i * 3 };
    });
    animators.push((t, dt, env) => herd.forEach((c) => {
      const w = (env.walkers ?? []).find((p) => Math.hypot(p.x - c.x, p.z - c.z) < 4);
      if (w && !c.fleeing) { // someone came too close: bound off away from them
        const a = Math.atan2(c.x - w.x, c.z - w.z), x = c.x + Math.sin(a) * 6, z = c.z + Math.cos(a) * 6;
        if (onIsland(x, z, 2.5)) { c.gx = x; c.gz = z; c.fleeing = true; }
      }
      const { neck, legs } = c.d.userData, dx = c.gx - c.x, dz = c.gz - c.z, d = Math.hypot(dx, dz);
      if (d < 0.05) c.fleeing = false;
      if (d > 0.05) {
        const s = Math.min(d, (c.fleeing ? 3 : 0.7) * dt);
        c.x += (dx / d) * s;
        c.z += (dz / d) * s;
        c.d.rotation.y = turnTo(c.d.rotation.y, Math.atan2(dx, dz), 0.1);
        legs.forEach((l, i) => (l.rotation.x = Math.sin(t * (c.fleeing ? 16 : 7) + (i === 0 || i === 3 ? 0 : Math.PI)) * (c.fleeing ? 0.7 : 0.4)));
        neck.rotation.x = c.fleeing ? -0.3 : 0; // head up when startled
      } else {
        legs.forEach((l) => (l.rotation.x = 0));
        neck.rotation.x = Math.sin(t * 0.4 + c.wait) > -0.3 ? 1.9 : 0.1; // grazing, now and then looking up
        if ((c.wait -= dt) < 0) {
          const a = Math.random() * 6.28, r = 14 + Math.random() * 7, x = H.x + Math.cos(a) * r, z = H.z + Math.sin(a) * r;
          if (onIsland(x, z, 2.5) && Math.hypot(x - c.x, z - c.z) < 9) { c.gx = x; c.gz = z; }
          c.wait = 6 + Math.random() * 10;
        }
      }
      c.d.position.set(c.x, 0, c.z);
    }));
  }

  // butterflies over the flower beds on fine spring and summer days
  {
    const flutter = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
      const b = bird(i % 2 ? '#f7c6d3' : C.gold), home = beds[(i * 7) % Math.max(1, beds.length)] ?? { x: 0, z: 0 };
      b.scale.setScalar(0.7);
      scene.add(b);
      return { b, home, phase: i * 1.7 };
    });
    animators.push((t, dt, env) => flutter.forEach(({ b, home, phase }) => {
      b.visible = ['spring', 'summer'].includes(env.season) && env.night < 0.3 && env.rain < 0.2;
      if (!b.visible) return;
      const a = t * 0.6 + phase;
      b.position.set(home.x + Math.cos(a) * 1.2 + Math.sin(a * 2.3) * 0.4, 0.8 + Math.sin(t * 2.1 + phase) * 0.25, home.z + Math.sin(a) * 1.2);
      b.rotation.y = -a;
      b.userData.wings.forEach((w, j) => (w.rotation.z = (j ? -1 : 1) * Math.sin(t * 22 + phase) * 0.9));
    }));
  }

  // dragonflies over the pond and the fishing lake on warm days: a hover, then a quick dart somewhere new
  {
    const pier = LOCATIONS.find((l) => l.id === 'fishing'), waters = [pondAt, { x: pier.x - 4.5 * pier.ux, z: pier.z - 4.5 * pier.uz }]; // the lake lies past the pier's fishing spaces
    const flies = [0, 1, 2, 3, 4, 5].map((i) => {
      const g = new THREE.Group(), wings = [];
      g.add(part(cyl(0.018, 0.012, 0.32, 5).rotateX(Math.PI / 2), i % 2 ? C.teal : C.coral, [0, 0, 0], { t: 0.01 }));
      for (const z of [0.04, -0.03]) for (const sx of [-1, 1]) { const w = part(box(0.2, 0.006, 0.05).translate(sx * 0.1, 0, 0), C.cream, [0, 0.015, z], { t: 0.006 }); wings.push(w); g.add(w); }
      scene.add(g);
      const home = waters[i % waters.length];
      return { g, wings, home, at: { x: home.x, y: 0.6, z: home.z }, to: { x: home.x, y: 0.6, z: home.z }, next: i * 0.7 };
    });
    animators.push((t, dt, env) => flies.forEach((f) => {
      f.g.visible = ['summer', 'autumn'].includes(env.season) && env.night < 0.3 && env.rain < 0.2;
      if (!f.g.visible) return;
      if (t >= f.next) { // pick a new hover spot over the water
        const a = Math.random() * 6.28, r = Math.random() * 2.6;
        f.to = { x: f.home.x + Math.cos(a) * r, y: 0.35 + Math.random() * 0.6, z: f.home.z + Math.sin(a) * r };
        f.next = t + 1.2 + Math.random() * 2.5;
      }
      const k = Math.min(1, dt * 5), dx = f.to.x - f.at.x, dz = f.to.z - f.at.z;
      f.at.x += dx * k; f.at.y += (f.to.y - f.at.y) * k; f.at.z += dz * k;
      if (Math.hypot(dx, dz) > 0.05) f.g.rotation.y = Math.atan2(dx, dz);
      f.g.position.set(f.at.x, f.at.y + Math.sin(t * 9 + f.next) * 0.02, f.at.z);
      f.wings.forEach((w, j) => (w.rotation.z = (j % 2 ? -1 : 1) * Math.sin(t * 60 + j) * 0.35));
    }));
  }

  // pigeons pecking about the village and market plazas, fluttering up when someone walks close, then settling again
  {
    const flock = ['village', 'market'].flatMap((id) => [0, 1, 2, 3].map((i) => {
      const D = DIST[id], b = bird(i % 2 ? '#b9b3bd' : '#9d97a6'), a = (i / 4) * 6.28 + 0.4, home = { x: D.x + Math.cos(a) * 2.2, z: D.z + Math.sin(a) * 2.2 };
      scene.add(b);
      const roofId = (id === 'village' ? ['library', 'bakery', 'teahouse', 'shrine'] : ['store', 'bathhouse', 'theater', 'library'])[i];
      const roof = LOCATIONS.find((l) => l.id === roofId), offset = roofId === 'library' ? (id === 'village' ? -0.12 : 0.12) : 0;
      const back = roofId === 'shrine' ? -0.6 : 0;
      const roost = { x: roof.x + offset * roof.uz + back * roof.ux, z: roof.z - offset * roof.ux + back * roof.uz, y: locs[roof.id].userData.top + 0.24 };
      return { b, home, roost, at: { ...home }, up: 0, away: 0, seed: i * 1.9 + D.x };
    }));
    animators.push((t, dt, env) => flock.forEach((p) => {
      p.b.visible = env.night < 0.4 && env.rain < 0.3;
      if (!p.b.visible) return;
      const near = (env.walkers ?? []).some((w) => Math.hypot(w.x - p.at.x, w.z - p.at.z) < 1.6);
      if (near && p.up === 0) p.away = t + 6 + Math.random() * 6; // startled
      p.up = Math.max(0, Math.min(1, p.up + (t < p.away ? dt * 2 : -dt * 0.7)));
      const peck = p.up === 0 ? Math.max(0, Math.sin(t * 5 + p.seed)) * 0.25 : 0;
      const hopPhase = (t * 0.65 + p.seed) % 1, hop = p.up === 0 && hopPhase < 0.22 ? Math.sin(hopPhase / 0.22 * Math.PI) * 0.16 : 0;
      const groundX = p.home.x + Math.sin(Math.floor(t * 0.65 + p.seed) * 1.7) * 0.45;
      const groundZ = p.home.z + Math.cos(Math.floor(t * 0.65 + p.seed) * 1.7) * 0.45;
      const blend = Math.min(1, dt * (hop > 0 ? 12 : 1));
      if (p.up > 0) { p.at.x = groundX + (p.roost.x - groundX) * p.up; p.at.z = groundZ + (p.roost.z - groundZ) * p.up; }
      else { p.at.x += (groundX - p.at.x) * blend; p.at.z += (groundZ - p.at.z) * blend; }
      const flying = p.up > 0 && p.up < 1;
      p.b.position.set(p.at.x, 0.08 + p.up * p.roost.y + Math.sin(p.up * Math.PI) * 1.5 + hop, p.at.z);
      p.b.rotation.set(peck, flying ? Math.atan2(p.roost.x - p.home.x, p.roost.z - p.home.z) + (t >= p.away ? Math.PI : 0) : Math.sin(t * 0.3 + p.seed), 0);
      p.b.userData.wings.forEach((w, j) => (w.rotation.z = flying ? (j ? -1 : 1) * (t < p.away ? Math.sin(t * 20 + p.seed) * 0.8 : 0.2) : (j ? 1 : -1) * 1.25));
    }));
  }

  // a little flock of sparrows crossing the sky now and then by day
  {
    const flock = [0, 1, 2, 3, 4].map((i) => { const b = bird('#a47458'); scene.add(b); return { b, off: [(i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.7, -Math.ceil(i / 2) * 0.6] }; });
    let start = -100, from = null, to = null;
    animators.push((t, dt, env) => {
      if (t - start > 40) {
        start = t;
        const a = Math.random() * 6.28;
        from = { x: Math.cos(a) * 60, z: Math.sin(a) * 60 };
        to = { x: -from.x + (Math.random() - 0.5) * 30, z: -from.z + (Math.random() - 0.5) * 30 };
      }
      const k = (t - start) / 22, on = from && k < 1 && env.night < 0.4 && env.rain < 0.2;
      const yaw = to ? Math.atan2(to.x - from.x, to.z - from.z) : 0, cx = Math.cos(yaw), sx = Math.sin(yaw);
      flock.forEach(({ b, off }, i) => {
        b.visible = !!on;
        if (!on) return;
        b.position.set(from.x + (to.x - from.x) * k + off[0] * cx + off[1] * sx, 10 + Math.sin(t * 1.5 + i) * 0.3, from.z + (to.z - from.z) * k - off[0] * sx + off[1] * cx);
        b.rotation.y = yaw;
        b.userData.wings.forEach((w, j) => (w.rotation.z = (j ? -1 : 1) * Math.sin(t * 14 + i) * 0.7));
      });
    });
  }

  // Grills emit only while a resident is really cooking at that station.
  {
    const kitchen = locs.cookhouse;
    for (const x of [-2, 0, 2]) {
      const smoke = new THREE.Mesh(ball(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ede3ce', transparent: true, depthWrite: false }));
      const sparks = new THREE.InstancedMesh(ball(0.018, 5, 4), new THREE.MeshBasicMaterial({ color: '#f3bf6e' }), 3);
      const matrix = new THREE.Matrix4();
      kitchen.add(smoke, sparks);
      animators.push((t, dt, env) => {
        let cooking = false;
        for (const id in env.people) {
          const s = env.people[id];
          if (s.at === 'cookhouse' && s.meal?.phase === 'cooking' && s.task?.kind === 'cook' && s.task.reached && !s.walking && s.task.at?.[0] === x) { cooking = true; break; }
        }
        smoke.visible = sparks.visible = cooking;
        if (!cooking) return;
        const k = (t * 0.65) % 1;
        smoke.position.set(x + k * 0.2, 0.75 + k * 0.8, 1);
        smoke.scale.setScalar(0.7 + k * 1.7); smoke.material.opacity = (1 - k) * 0.4;
        for (let i = 0; i < 3; i++) {
          const a = (t * 1.8 + i / 3) % 1;
          matrix.makeScale(1 - a * 0.7, 1 - a * 0.7, 1 - a * 0.7).setPosition(x + Math.sin(i * 2.4) * a * 0.2, 0.65 + a * 0.5, 1 + Math.cos(i * 2.4) * a * 0.2);
          sparks.setMatrixAt(i, matrix);
        }
        sparks.instanceMatrix.needsUpdate = true;
      });
    }
  }
  // Lake glints and warm lantern streaks use one shared geometry and matrix.
  // The deck stays clear: strips live only on the two exposed water shoulders.
  {
    const pier = locs.fishing, matrix = new THREE.Matrix4();
    const material = new THREE.MeshBasicMaterial({ color: '#e5f1df', transparent: true, opacity: 0.5, depthWrite: false });
    const glints = new THREE.InstancedMesh(box(0.5, 0.008, 0.035), material, 24);
    pier.add(glints);
    const dayColor = new THREE.Color('#e5f1df'), nightColor = new THREE.Color('#eac58c');
    animators.push((t, dt, env) => {
      material.color.copy(dayColor).lerp(nightColor, env.night);
      material.opacity = (0.25 + env.night * 0.16) * (1 - env.rain * 0.55);
      for (let i = 0; i < 24; i++) {
        const wave = Math.sin(t * 1.1 + i * 1.7);
        matrix.makeScale(0.6 + (wave + 1) * 0.35, 1, 1);
        matrix.setPosition((i % 2 ? -1 : 1) * (3.5 + i % 4 * 0.75), 0.12 + wave * 0.004, -6.5 + Math.floor(i / 2) * 0.58);
        glints.setMatrixAt(i, matrix);
      }
      glints.instanceMatrix.needsUpdate = true;
    });
  }
  // Bats flit over the hillside woods and the meadow from dusk, except in winter and rain.
  {
    const bats = ['hillside', 'meadow'].flatMap((id) => [0, 1, 2].map((i) => {
      const b = bird('#4d4250'); b.scale.setScalar(0.55); scene.add(b);
      return { b, home: DIST[id], phase: i * 2.1 + (id === 'meadow' ? 1 : 0) };
    }));
    animators.push((t, dt, env) => bats.forEach(({ b, home, phase }) => {
      b.visible = env.night > 0.35 && env.rain < 0.2 && env.season !== 'winter';
      if (!b.visible) return;
      const a = t * 0.9 + phase, r = 3 + Math.sin(t * 0.7 + phase) * 1.5; // wobbly loops, not neat circles
      b.position.set(home.x + Math.cos(a) * r + Math.sin(t * 3.1 + phase) * 0.4, 4 + Math.sin(t * 1.9 + phase) * 0.8, home.z + Math.sin(a) * r);
      b.rotation.y = -a;
      b.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 30 + phase) * 0.9; });
    }));
  }

  // Rain splashes: little rings pop around the feet of residents walking in the rain.
  {
    const ringGeo = new THREE.RingGeometry(0.05, 0.08, 16).rotateX(-Math.PI / 2);
    const rings = Array.from({ length: 16 }, (_, i) => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#e3edf1', transparent: true, depthWrite: false }));
      m.visible = false; m.raycast = () => {}; scene.add(m);
      return { m, age: 1 + i / 16 };
    });
    animators.push((t, dt, env) => {
      const walking = env.rain > 0.3 ? Object.values(env.people).filter((s) => s.walking && !s.hidden) : [];
      for (const r of rings) {
        r.age += dt * 2.2;
        if (r.age >= 1 && walking.length) {
          const s = walking[Math.floor(Math.random() * walking.length)];
          r.m.position.set(s.x + (Math.random() - 0.5) * 0.6, 0.05, s.z + (Math.random() - 0.5) * 0.6);
          r.age = 0;
        }
        r.m.visible = r.age < 1 && walking.length > 0;
        r.m.scale.setScalar(1 + r.age * 3);
        r.m.material.opacity = (1 - r.age) * 0.6 * env.rain;
      }
    });
  }

  // Moths circle the actual pleasure-district lamps only on dry mild nights.
  {
    const lamps = ['teahouse', 'bathhouse', 'theater', 'boardwalk'].map((id, i) => {
      const moth = bird('#e5d2ac'), home = LANTERNS[id];
      moth.scale.setScalar(0.4); scene.add(moth);
      return { moth, home, phase: i * 1.8 };
    });
    animators.push((t, dt, env) => lamps.forEach(({ moth, home, phase }) => {
      moth.visible = env.night > 0.5 && env.rain < 0.2 && env.season !== 'winter';
      if (!moth.visible) return;
      const a = t * 2.4 + phase;
      moth.position.set(home.x + Math.sin(a) * 0.45, 1.15 + Math.cos(a * 1.7) * 0.25, home.z + Math.cos(a) * 0.35);
      moth.rotation.y = a;
      moth.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 42 + phase); });
    }));
  }
  scene.add(mergeStatic(statics)); // lantern light comes from the scene's real lights placed at `lights`

  // drifting petals in spring, falling leaves in autumn (switches live when season changes)
  {
    const N = 180, { pts, pos, geo } = particles(N, 9, '#f4a9bf', 0);
    pts.material.map = tx.petal;
    const respawn = (i, y = 1.5 + Math.random() * 2.5) => {
      const p = sakuras[Math.floor(Math.random() * sakuras.length)];
      pos.set([p.x + (Math.random() - 0.5) * 2.4, y, p.z + (Math.random() - 0.5) * 2.4], i * 3);
    };
    for (let i = 0; i < N; i++) respawn(i, Math.random() * 4);
    scene.add(pts);
    let lastSeason = season;
    animators.push((t, dt, env) => {
      const sNow = env?.season ?? season;
      if (sNow !== lastSeason) { lastSeason = sNow; syncCanopy(sNow); }
      const col = { spring: '#f4a9bf', autumn: '#ee9a62' }[sNow];
      pts.visible = Boolean(col);
      if (!col) return;
      pts.material.color.set(col);
      for (let i = 0; i < N; i++) {
        pos[i * 3] += Math.sin(t * 1.3 + i) * 0.4 * dt;
        pos[i * 3 + 1] -= 0.45 * dt;
        pos[i * 3 + 2] += 0.15 * dt;
        if (pos[i * 3 + 1] < 0.05) respawn(i);
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // a shower of petals over the shrine during a wedding
  {
    const N = 90, { pts, pos, geo } = particles(N, 9, '#f7c6d3', 0), S = LOCATIONS.find((l) => l.id === 'shrine');
    pts.material.map = tx.petal;
    const drop = (i, y = 3 + Math.random() * 3) => pos.set([S.door.x + (Math.random() - 0.5) * 5, y, S.door.z + (Math.random() - 0.5) * 5], i * 3);
    for (let i = 0; i < N; i++) drop(i, Math.random() * 6);
    scene.add(pts);
    animators.push((t, dt, env) => {
      pts.visible = !!env.wedding;
      if (!pts.visible) return;
      for (let i = 0; i < N; i++) {
        pos[i * 3] += Math.sin(t * 1.7 + i) * 0.5 * dt;
        pos[i * 3 + 1] -= 0.7 * dt;
        if (pos[i * 3 + 1] < 0.05) drop(i);
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  // fireflies over the bushes on summer nights
  {
    const N = 60, { pts, pos, geo } = particles(N, 5, '#ffe58a', 0), home = [];
    for (let i = 0; i < N; i++) { const b = bushes[i % bushes.length]; home.push(b); pos.set([b.x, 1, b.z], i * 3); }
    scene.add(pts);
    animators.push((t, dt, env) => {
      const sNow = env?.season ?? season;
      pts.visible = sNow === 'summer' && env.night > 0.01;
      if (!pts.visible) return;
      pts.material.opacity = env.night * (0.6 + 0.4 * Math.sin(t * 3));
      for (let i = 0; i < N; i++) pos.set([home[i].x + Math.sin(t * 0.7 + i) * 1.2, 0.8 + Math.sin(t * 1.1 + i * 2) * 0.4, home[i].z + Math.cos(t * 0.6 + i * 3) * 1.2], i * 3);
      geo.attributes.position.needsUpdate = true;
    });
  }

  // a starry night sky and a moon behind the island, on a backdrop facing the camera (which looks along -(40, 46, 40))
  const sky = new THREE.Group();
  {
    const d = new THREE.Vector3(-40, -46, -40).normalize(), u = new THREE.Vector3(1, 0, -1).normalize(), v = new THREE.Vector3().crossVectors(u, d).normalize();
    const N = 400, pos = new Float32Array(N * 3), at = (a, b, out = new THREE.Vector3()) => out.copy(d).multiplyScalar(90).addScaledVector(u, a).addScaledVector(v, b);
    for (let i = 0; i < N; i++) at((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 200).toArray(pos, i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff6d8', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const moon = new THREE.Group();
    moon.add(new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false })));
    moon.add(new THREE.Mesh(new THREE.CircleGeometry(6.5, 32), new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, fog: false })));
    moon.children[1].position.z = -0.1;
    at(60, 40, moon.position); // upper right, clear of the clock card
    moon.lookAt(moon.position.clone().sub(d));
    sky.add(stars, moon);
    sky.visible = false;
    scene.add(sky);
    animators.push((t, dt, env) => {
      const o = Math.max(0, env.night - 0.35) / 0.65 * (1 - Math.max(env.rain, env.snow, 0)); // clouds hide the sky
      sky.visible = o > 0.02;
      if (!sky.visible) return;
      sky.position.set(env.center.x, 0, env.center.z); // stays put behind the town as the camera pans
      sky.rotation.y = env.turn ?? 0; // and turns with it
      stars.material.opacity = o * (0.6 + Math.sin(t * 0.8) * 0.1);
      moon.children[0].material.opacity = o * 0.95;
      moon.children[1].material.opacity = o * 0.12;
    });
  }

  // now and then a shooting star streaks across a clear night sky
  {
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.01, 7, 5).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    star.visible = false;
    scene.add(star);
    let start = -100, from = null;
    animators.push((t, dt, env) => {
      const clear = env.night > 0.6 && env.rain < 0.1 && env.snow < 0.1;
      if (clear && t - start > 25 + Math.random() * 400) { // a rare treat: roughly one a minute or two of a clear night
        start = t;
        from = { x: -25 + Math.random() * 30, y: 12 + Math.random() * 6, z: -30 + Math.random() * 25 };
      }
      const k = (t - start) / 1.1;
      star.visible = clear && k < 1;
      if (!star.visible) return;
      star.position.set(from.x + k * 22, from.y - k * 6, from.z - k * 4);
      star.rotation.set(0, 0.18, -0.26);
      star.material.opacity = Math.sin(k * Math.PI) * 0.9;
    });
  }

  // a rainbow over the far side of the island when a daytime shower clears, fading after a minute or so
  {
    const bands = ['#f4a6a6', '#f7c99a', '#f5e3a0', '#bfe0b0', '#a9cfe6', '#c3b4e3'];
    const bow = new THREE.Group();
    bands.forEach((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
      bow.add(new THREE.Mesh(new THREE.TorusGeometry(17 - i * 0.6, 0.32, 4, 64, Math.PI), m));
    });
    bow.position.set(-WORLD_SIZE * 0.33, -1, -WORLD_SIZE * 0.33);
    bow.rotation.y = Math.PI / 4; // faces the isometric camera
    bow.visible = false;
    const arc = new THREE.Group(); // swings the rainbow round the island to stay opposite the camera as it turns
    arc.add(bow);
    scene.add(arc);
    let wasWet = 0, glow = 0;
    animators.push((t, dt, env) => {
      if (wasWet > 0.5 && env.rain < 0.5 && env.night < 0.3) glow = 1; // the shower just broke in daylight
      wasWet = env.rain;
      glow = Math.max(0, glow - dt / 90);
      const o = Math.min(1, glow * 3) * 0.45 * (1 - env.night);
      bow.visible = o > 0.01;
      arc.rotation.y = env.turn ?? 0;
      bow.children.forEach((m) => (m.material.opacity = o));
    });
  }

  // weather: rain streaks or snowflakes over the whole island, faded by the scene's env.rain / env.snow
  const AREA = 60, rainN = 900, rainPos = new Float32Array(rainN * 6); // around the camera's focus, so it stays dense when zoomed in
  for (let i = 0; i < rainN; i++) {
    const x = (Math.random() - 0.5) * AREA, y = Math.random() * 30, z = (Math.random() - 0.5) * AREA;
    rainPos.set([x, y, z, x - 0.12, y - 0.9, z - 0.12], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#6f88b0', transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false;
  const snow = particles(700, 4, '#ffffff', AREA);
  snow.pts.frustumCulled = false;
  scene.add(rain, snow.pts);
  animators.push((t, dt, env) => {
    rain.visible = env.rain > 0.01;
    rain.material.opacity = env.rain * 0.7;
    if (rain.visible) {
      for (let i = 0; i < rainN; i++) {
        let y = rainPos[i * 6 + 1] - 28 * dt;
        const k = i * 6;
        if (y < 0) { y += 30; rainPos[k] = env.center.x + (Math.random() - 0.5) * AREA; rainPos[k + 2] = env.center.z + (Math.random() - 0.5) * AREA; rainPos[k + 3] = rainPos[k] - 0.12; rainPos[k + 5] = rainPos[k + 2] - 0.12; }
        rainPos[k + 1] = y;
        rainPos[k + 4] = y - 0.9;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    snow.pts.visible = env.snow > 0.01;
    snow.pts.material.opacity = env.snow;
    if (snow.pts.visible) {
      const p = snow.pos;
      for (let i = 0; i < p.length / 3; i++) {
        p[i * 3] += Math.sin(t + i) * 0.3 * dt;
        p[i * 3 + 1] -= 1.6 * dt;
        if (p[i * 3 + 1] < 0) { p[i * 3 + 1] += 24; p[i * 3] = env.center.x + (Math.random() - 0.5) * AREA; p[i * 3 + 2] = env.center.z + (Math.random() - 0.5) * AREA; }
      }
      snow.geo.attributes.position.needsUpdate = true;
    }
  });

  // fireworks over the pleasure district on festival nights
  const COLORS = [C.gold, C.blossom2, C.teal, C.coral, '#ffffff'];
  const bursts = [0, 1, 2].map((i) => {
    const N = 48, b = particles(N, 6, COLORS[i], 0), vel = new Float32Array(N * 3);
    b.pts.visible = false;
    scene.add(b.pts);
    return { ...b, vel, N, age: 1.8 + i * 0.6 };
  });
  animators.push((t, dt, env) => {
    festival.visible = env.festival;
    for (const b of bursts) {
      b.age += dt;
      if (b.age > 2.2 && env.festival && env.night > 0.5) { // relaunch
        b.age = 0;
        const cx = P.x + (Math.random() - 0.5) * 14, cy = 13 + Math.random() * 5, cz = P.z + (Math.random() - 0.5) * 14;
        b.pts.material.color.set(COLORS[Math.floor(Math.random() * COLORS.length)]);
        for (let i = 0; i < b.N; i++) {
          const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = 4 + Math.random();
          b.vel.set([s * Math.cos(a) * v, u * v, s * Math.sin(a) * v], i * 3);
          b.pos.set([cx, cy, cz], i * 3);
        }
      }
      b.pts.visible = b.age < 1.8;
      if (!b.pts.visible) continue;
      b.pts.material.opacity = 1 - b.age / 1.8;
      for (let i = 0; i < b.N * 3; i++) {
        if (i % 3 === 1) b.vel[i] -= 3 * dt; // gravity
        b.pos[i] += b.vel[i] * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
    }
  });

  animators.push((t, dt, env) => { wind.time.value = t; wind.gust.value = 1 + env.rain * 1.5 + env.snow * 0.5; });

  return { locs, lights, festLights, animate: (t, dt, env) => animators.forEach((a) => a(t, dt, env)) };
}

// ---------- residents: Kenney "Mini Characters" (CC0, public/models) ----------
// Their own palette texture, re-shaded with the town's toon ramp plus a skinned outline hull.
const skinOutline = new THREE.MeshBasicMaterial({ color: C.outline, side: THREE.BackSide });
skinOutline.onBeforeCompile = (sh) => {
  // push the hull out along the normal before skinning, so the outline follows the animation
  sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * 0.02;');
};

// Residents who share a model with someone else get an accessory so every face is tellable apart.
// (x, y, z) are in the scaled model's space; the piece is then parented to the head bone so it follows the animation.
const ACCESSORIES = {
  sato: (hb) => { // straw kasa hat
    const g = new THREE.Group();
    g.add(part(new THREE.ConeGeometry(0.62, 0.3, 16), '#e9cf8f', [0, 0.15, 0], { t: 0.03 }));
    g.add(part(cyl(0.18, 0.2, 0.08, 12), '#d9b46a', [0, 0.32, 0], { t: 0.02 }));
    g.position.set(hb.c.x, hb.max.y - 0.08, hb.c.z);
    return g;
  },
  kaede: (hb) => { // kanzashi hair flower
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(part(ball(0.07, 8, 6), C.blossom2, [Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0], { t: 0.02 })); }
    g.add(part(ball(0.05, 8, 6), C.gold, [0, 0, 0.03], { t: 0.015 }));
    g.position.set(hb.max.x - 0.04, hb.c.y + hb.size.y * 0.22, hb.c.z);
    g.rotation.y = Math.PI / 2;
    return g;
  },
  momo: (hb) => { // ribbon bow at the back of the head
    const g = new THREE.Group();
    for (const sx of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.12, 0.26, 8).rotateZ((sx * Math.PI) / 2), C.teal, [sx * 0.13, 0, 0], { t: 0.02 }));
    g.add(part(ball(0.06, 8, 6), C.teal, [0, 0, 0], { t: 0.02 }));
    g.position.set(hb.c.x, hb.max.y - hb.size.y * 0.18, hb.min.z + 0.02);
    return g;
  },
};

// The newer neighbours share the shipped meshes, with small, distinct headwear.
for (const [id, color, style] of [['akira', '#536d81', 'cap'], ['fumi', C.cream, 'cap'], ['nao', C.teal, 'band'], ['chika', C.coral, 'bow'], ['itsuki', '#ad90b6', 'cap'], ['hotaru', C.gold, 'band']]) {
  ACCESSORIES[id] = (hb) => {
    const g = new THREE.Group();
    if (style === 'cap') {
      g.add(part(cyl(0.25, 0.29, 0.13, 12), color, [0, 0, 0], { t: 0.02 }));
      g.add(part(box(0.3, 0.035, 0.22), color, [0, -0.04, 0.2], { t: 0.01 }));
    } else if (style === 'band') g.add(part(box(0.5, 0.07, 0.035), color, [0, -0.1, hb.size.z * 0.5], { t: 0.01 }));
    else {
      for (const sx of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.1, 0.2, 6).rotateZ(sx * Math.PI / 2), color, [sx * 0.1, 0, 0], { t: 0.015 }));
    }
    g.position.set(hb.c.x, hb.max.y - 0.03, hb.c.z);
    return g;
  };
}

// small paper lantern on a pole, carried after dark
function carriedLantern() {
  const g = new THREE.Group();
  g.add(part(cyl(0.025, 0.025, 0.55, 5).rotateX(Math.PI / 2), C.woodDark, [0, 0, 0.27], { t: 0.02 }));
  const c = chochin(0, -0.22, 0.52);
  c.scale.setScalar(0.7);
  g.add(c);
  return g;
}

function carriedUmbrella() {
  const g = new THREE.Group();
  g.add(part(cyl(0.015, 0.015, 1.1, 6), C.woodDark, [0.2, 1.0, 0.05], { t: 0.012 }));
  g.add(part(new THREE.ConeGeometry(0.65, 0.25, 12), C.teal, [0.2, 1.62, 0.05], { t: 0.025 }));
  return g;
}

// Base posture clips and periodic one-shot gestures so residents never loop a robotic 1s point/nod forever.
const BASE_CLIPS = {
  'fish-casting': 'fishing-cast', 'fish-waiting': 'holding-both', 'fish-reeling': 'fishing-reel',
  'cook-fish': 'holding-both', 'eat-fish': 'holding-right',
  soak: 'sit',
  idle: 'idle', watch: 'idle', walk: 'walk', stroll: 'walk', hurry: 'walk', move: 'moving-walk', sit: 'sit', garden: 'crouch',
  carry: 'holding-both', read: 'holding-both', play: 'holding-both', work: 'holding-both',
  eat: 'holding-right', sweep: 'holding-right', hammer: 'holding-right', perform: 'holding-right',
  buy: 'idle', browse: 'idle', pray: 'idle', talk: 'idle', argue: 'idle', give: 'holding-right',
  chop: 'holding-right', logs: 'holding-both', cheer: 'idle',
  sketch: 'holding-both', flute: 'holding-both', knit: 'holding-both',
  wash: 'holding-both', fold: 'holding-both', prune: 'holding-right',
};
const GESTURE_CLIPS = {
  'cook-fish': 'interact-right', 'eat-fish': 'interact-right',
  wash: 'interact-right', fold: 'interact-left',
  work: 'interact-right', sweep: 'interact-right', give: 'interact-right', prune: 'interact-right',
  buy: 'interact-left', browse: 'interact-left', play: 'interact-left', pray: 'interact-left',
  garden: 'pick-up', hammer: 'attack-melee-right', perform: 'attack-melee-left',
  talk: 'emote-yes', argue: 'emote-no', watch: 'emote-yes',
  chop: 'attack-melee-right', cheer: 'jump', sketch: 'interact-right', knit: 'interact-left',
};
const GESTURE_GAP = { talk: 1.8, argue: 1.8, chop: 1.5, cheer: 99 }; // seconds between one-shots (a cheer is a single hop)

// A workplace's own tool for a shared animation: ledgers, towels, the pan, the hot spring's stone rake.
const PROP_AT = { 'work@library': 'read', 'work@bathhouse': 'fold', 'work@onsen': 'fold', 'work@cookhouse': 'cook-fish', 'sweep@onsen': 'rake' };
function handProps() {
  const t = 0.02, broom = new THREE.Group(), eat = new THREE.Group(), read = new THREE.Group();
  const carry = new THREE.Group(), hammer = new THREE.Group(), perform = new THREE.Group(), play = new THREE.Group(), work = new THREE.Group();
  broom.add(part(cyl(0.02, 0.02, 0.85, 6), C.wood, [0.16, 0.42, 0.24], { t }), part(new THREE.ConeGeometry(0.11, 0.24, 8), C.gold, [0.16, 0.08, 0.24], { t }));
  eat.add(part(cyl(0.012, 0.012, 0.24, 5).rotateX(0.9), C.wood, [0.15, 0.56, 0.28], { t: 0.01 }));
  [C.pink, C.cream, C.sage].forEach((c, i) => eat.add(part(ball(0.045, 8, 6), c, [0.15, 0.52 + i * 0.04, 0.24 + i * 0.04], { t: 0.015 })));
  read.add(part(box(0.28, 0.03, 0.22).rotateX(0.45), C.teal, [0, 0.52, 0.28], { t }), part(box(0.25, 0.035, 0.19).rotateX(0.45), C.cream, [0, 0.535, 0.28], { t: 0.01 }));
  carry.add(part(box(0.36, 0.24, 0.28), C.wood, [0, 0.54, 0.3], { t: 0.025 }));
  hammer.add(part(cyl(0.02, 0.02, 0.28, 6).rotateX(1.1), C.woodDark, [0.16, 0.56, 0.26], { t }), part(cyl(0.055, 0.055, 0.16, 8).rotateZ(Math.PI / 2), C.wood, [0.16, 0.64, 0.35], { t }));
  perform.add(part(new THREE.CircleGeometry(0.18, 12, 0.3, 2.5), toon(C.coral), [0.18, 0.64, 0.28], { t: 0 }));
  play.add(part(box(0.14, 0.14, 0.05), C.cream, [-0.06, 0.52, 0.28], { t }), part(cyl(0.016, 0.016, 0.42, 6).rotateZ(-1.1), C.woodDark, [0.08, 0.58, 0.28], { t: 0.015 }));
  work.add(part(box(0.32, 0.04, 0.22), C.wood, [0, 0.5, 0.28], { t }), part(ball(0.06, 8, 6), C.gold, [-0.06, 0.55, 0.28], { t: 0.015 }), part(ball(0.055, 8, 6), C.pink, [0.07, 0.55, 0.28], { t: 0.015 }));
  const axe = new THREE.Group(), logs = new THREE.Group();
  axe.add(part(cyl(0.022, 0.022, 0.5, 6).rotateX(1.2), C.wood, [0.16, 0.6, 0.3], { t }), part(box(0.04, 0.13, 0.16), C.stoneDark, [0.16, 0.69, 0.53], { t }));
  for (const [y, z] of [[0.5, 0.26], [0.5, 0.36], [0.6, 0.31]]) logs.add(part(cyl(0.065, 0.065, 0.42, 8).rotateZ(Math.PI / 2), C.wood, [0, y, z], { t: 0.015 }));
  const bag = new THREE.Group(); // a cloth grocery bag swinging at the side, a leek poking out
  bag.add(part(box(0.2, 0.22, 0.1), C.cream, [0.27, 0.3, 0.02], { t }), part(cyl(0.012, 0.012, 0.16, 5), C.sage, [0.3, 0.46, 0.02], { t: 0.008 }), part(cyl(0.008, 0.008, 0.12, 4).rotateZ(Math.PI / 2), C.woodDark, [0.27, 0.43, 0.02], { t: 0.005 }));
  const sketch = new THREE.Group(), flute = new THREE.Group(), knit = new THREE.Group();
  sketch.add(part(box(0.26, 0.025, 0.32).rotateX(0.7), C.cream, [0, 0.55, 0.3], { t }), part(cyl(0.01, 0.01, 0.16, 5).rotateZ(0.8), C.coral, [0.12, 0.6, 0.33], { t: 0.008 }));
  flute.add(part(cyl(0.018, 0.018, 0.5, 6).rotateZ(Math.PI / 2 - 0.25), C.wood, [0.1, 0.62, 0.3], { t: 0.012 }));
  knit.add(part(ball(0.08, 10, 8), C.blossom2, [0, 0.5, 0.3], { t: 0.015 }), ...[-0.05, 0.05].map((x) => part(cyl(0.008, 0.008, 0.3, 4).rotateX(0.9).rotateZ(x * 6), C.woodDark, [x, 0.58, 0.3], { t: 0.006 })));
  const cooking = new THREE.Group(), fishMeal = new THREE.Group();
  cooking.add(part(cyl(0.22, 0.22, 0.035, 14), C.woodDark, [0, 0.57, 0.4], { t: 0.015 }), fishMesh(C.gold, [0, 0.63, 0.4]));
  fishMeal.add(part(cyl(0.16, 0.13, 0.05, 12), C.cream, [0.12, 0.55, 0.28], { t: 0.015 }), fishMesh(C.gold, [0.12, 0.61, 0.28], 0.7));
  const rake = new THREE.Group(); // bamboo handle down to a wide wooden head
  rake.add(part(cyl(0.018, 0.018, 0.95, 6), C.wood, [0.16, 0.45, 0.26], { t }), part(box(0.34, 0.04, 0.05), C.woodDark, [0.16, 0.0, 0.26], { t: 0.01 }));
  for (let k = 0; k < 5; k++) rake.add(part(box(0.015, 0.06, 0.015), C.woodDark, [0.03 + k * 0.065, -0.04, 0.26], { t: 0 }));
  const prune = new THREE.Group(), garden = new THREE.Group(); // shears held up to a branch; a trowel at the soil
  for (const a of [-0.25, 0.25]) prune.add(part(box(0.02, 0.2, 0.012).rotateZ(a), C.stoneDark, [0.17 + a * 0.12, 0.98, 0.3], { t: 0.006 }));
  prune.add(part(cyl(0.02, 0.02, 0.14, 6), C.coral, [0.17, 0.83, 0.3], { t: 0.008 }));
  garden.add(part(cyl(0.015, 0.015, 0.14, 5).rotateX(1.1), C.wood, [0.15, 0.3, 0.3], { t: 0.006 }), part(new THREE.ConeGeometry(0.045, 0.1, 6).rotateX(2.3), C.stoneDark, [0.15, 0.24, 0.39], { t: 0.006 }));
  const domestic = domesticProps();
  return { sweep: broom, rake, prune, garden, eat, read, carry, hammer, perform, play, work, chop: axe, logs, sketch, flute, knit, bag, ...domestic, 'cook-fish': cooking, 'eat-fish': fishMeal };
}

export function domesticProps() {
  const wash = new THREE.Group(), fold = new THREE.Group();
  wash.add(part(cyl(0.19, 0.15, 0.14, 14), C.wood, [0, 0.52, 0.4], { t: 0.02 }));
  wash.add(part(cyl(0.16, 0.16, 0.012, 14), C.water, [0, 0.59, 0.4], { t: 0 }));
  wash.add(part(box(0.18, 0.035, 0.12), C.cream, [0.05, 0.61, 0.42], { t: 0.01 }));
  [C.teal, C.cream, C.blossom].forEach((color, i) => fold.add(part(box(0.34 - i * 0.025, 0.045, 0.24), color, [0, 0.5 + i * 0.05, 0.31], { t: 0.015 })));
  return { wash, fold };
}

function fishMesh(color, at = [0, 0, 0], scale = 1) {
  const g = new THREE.Group();
  g.add(part(ball(1, 10, 6).scale(0.19, 0.075, 0.065), color, [0, 0, 0], { t: 0.012 }));
  g.add(part(new THREE.ConeGeometry(0.09, 0.14, 3).rotateZ(-Math.PI / 2), color, [-0.2, 0, 0], { t: 0.01 }));
  g.add(part(ball(0.015, 6, 4), C.woodDark, [0.12, 0.03, 0.055], { t: 0 }));
  g.position.set(...at); g.scale.setScalar(scale);
  return g;
}

// Sample the arms from the shipped holding pose. The simulation phase controls
// the animation time, keeping the cast and landed fish in sync after a reload.
export function fishingClips(animations) {
  const holding = THREE.AnimationClip.findByName(animations, 'holding-both');
  return ['cast', 'reel'].map((kind) => {
    const tracks = holding.tracks.map((track) => {
      if (!['arm-right.quaternion', 'arm-left.quaternion'].includes(track.name)) return track.clone();
      const values = [], times = [], base = new THREE.Quaternion().fromArray(track.values);
      for (let i = 0; i <= 40; i++) {
        const p = i / 40, right = track.name.startsWith('arm-right');
        const angle = kind === 'cast' ? Math.sin(p * Math.PI * 2) * (right ? 0.95 : 0.6) : Math.sin(p * Math.PI * 8) * (right ? 0.23 : -0.17);
        const q = base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle));
        times.push(p); values.push(...q.toArray());
      }
      return new THREE.QuaternionKeyframeTrack(track.name, times, values);
    });
    return new THREE.AnimationClip(`fishing-${kind}`, 1, tracks);
  });
}

export function carryingClip(animations) {
  const walk = THREE.AnimationClip.findByName(animations, 'walk').clone();
  const hold = THREE.AnimationClip.findByName(animations, 'holding-both');
  walk.name = 'moving-walk';
  const arms = hold.tracks.filter((t) => /^(arm|hand)-/.test(t.name)).map((t) => {
    const track = t.clone(), n = track.getValueSize();
    for (let i = n; i < track.values.length; i++) track.values[i] = track.values[i % n];
    return track;
  });
  const names = new Set(arms.map((t) => t.name));
  walk.tracks = [...walk.tracks.filter((t) => !names.has(t.name)), ...arms];
  return walk;
}

export function fishingRig() {
  const g = new THREE.Group(), pole = new THREE.Group();
  pole.position.set(0.18, 0.65, 0.2);
  pole.add(part(cyl(0.013, 0.028, 1.9, 7), C.wood, [0, 0.95, 0], { t: 0.01 }));
  pole.add(part(cyl(0.065, 0.065, 0.05, 10).rotateX(Math.PI / 2), C.stoneDark, [0, 0.12, 0.035], { t: 0.01 }));
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f9f1d8' }));
  const float = part(ball(0.055, 8, 6), C.coral, [0, 0, 0], { t: 0.01 });
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.14, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#edf9ed', transparent: true, opacity: 0.7, depthWrite: false }));
  const fish = fishMesh('#c8d6e8');
  g.add(pole, line, float, ripple, fish);
  function animate(phase, progress, time) {
    const p = Math.max(0, Math.min(1, progress));
    pole.rotation.x = phase === 'casting' ? 0.9 - Math.sin(p * Math.PI * 2) * 1.1 : 0.9 + Math.sin(time * (phase === 'reeling' ? 9 : 1.4)) * (phase === 'reeling' ? 0.14 : 0.015);
    const tip = new THREE.Vector3(0, 1.9, 0).applyEuler(pole.rotation).add(pole.position);
    float.position.set(0.18, -0.01 + Math.sin(time * 3) * 0.015, 3.1);
    if (phase === 'casting') float.position.lerpVectors(tip, new THREE.Vector3(0.18, -0.01, 3.1), Math.min(1, p * 1.7));
    if (phase === 'reeling') float.position.lerp(new THREE.Vector3(0.18, 0.8, 0.4), p * p);
    const mid = tip.clone().lerp(float.position, 0.5); mid.y -= 0.14;
    [tip, mid, float.position].forEach((v, i) => lineGeo.attributes.position.setXYZ(i, v.x, v.y, v.z));
    lineGeo.attributes.position.needsUpdate = true; lineGeo.computeBoundingSphere();
    fish.visible = phase === 'reeling'; fish.position.copy(float.position); fish.position.y -= 0.14; fish.rotation.z = Math.sin(time * 14) * 0.18;
    ripple.visible = phase === 'waiting'; ripple.position.set(0.18, -0.005, 3.1); ripple.scale.setScalar(1 + (time * 0.6 % 1));
  }
  return { g, animate, pole, float, line, fish };
}

const gltfs = new Map();
export const RESIDENT_H = 1.3; // residents' height in world units (doors are about 1.25)

// Kenney's sit clip is authored near the ground. Fit each model's actual hips
// above the outlined seat and in front of its backrest, including bulky clothing.
export function seatedOffset(model, animations) {
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(THREE.AnimationClip.findByName(animations, 'sit')).play();
  mixer.update(0);
  model.updateMatrixWorld(true);
  const body = model.getObjectByName('body-mesh'), bounds = new THREE.Box3(), p = new THREE.Vector3();
  body.skeleton.update();
  const joints = body.geometry.attributes.skinIndex;
  for (let i = 0; i < joints.count; i++) {
    if (body.skeleton.bones[joints.getX(i)].name !== 'torso') continue;
    body.getVertexPosition(i, p);
    bounds.expandByPoint(p.applyMatrix4(body.matrixWorld));
  }
  const outline = 0.02 * model.scale.x;
  const offset = new THREE.Vector3(0, SEAT_H + 0.04 + 0.03 - bounds.min.y + outline, Math.max(0, -0.28 + 0.035 + 0.03 - bounds.min.z + outline));
  mixer.stopAllAction(); // restore the unposed model before the live mixer takes over
  model.updateMatrixWorld(true);
  return offset;
}

export async function loadResident(r) {
  if (!gltfs.has(r.model)) gltfs.set(r.model, new GLTFLoader().loadAsync(`/models/${r.model}.glb`));
  const gltf = await gltfs.get(r.model);
  const model = cloneSkinned(gltf.scene);
  const meshes = [];
  model.traverse((o) => o.isSkinnedMesh && meshes.push(o));
  for (const m of meshes) {
    m.material = toon('#ffffff', m.material.map);
    const o = m.clone();
    o.material = skinOutline;
    o.raycast = () => {};
    m.parent.add(o);
  }
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.scale.setScalar(RESIDENT_H / height);
  model.updateMatrixWorld(true);
  const seatOffset = seatedOffset(model, gltf.animations);
  const headBone = model.getObjectByName('head');
  if (ACCESSORIES[r.id] && headBone) {
    const box3 = new THREE.Box3().setFromObject(model.getObjectByName('head-mesh') ?? model);
    const acc = ACCESSORIES[r.id]({ min: box3.min, max: box3.max, c: box3.getCenter(new THREE.Vector3()), size: box3.getSize(new THREE.Vector3()) });
    model.add(acc); // place in model space first, then keep the world pose while moving under the bone
    acc.position.divideScalar(model.scale.x);
    acc.scale.divideScalar(model.scale.x);
    headBone.attach(acc);
    model.userData.accessory = acc;
  }

  const g = new THREE.Group(), props = handProps();
  const bath = bathDetails();
  fitBathDetails(model, bath, headBone);
  const working = workingDetails();
  g.add(bath.g, working.g);
  for (const p of Object.values(props)) { p.visible = false; g.add(p); }
  const lamp = carriedLantern();
  const umbrella = carriedUmbrella();
  umbrella.visible = false;
  lamp.position.set(0.3, 0.6, 0.1);
  lamp.scale.setScalar(0.75);
  lamp.visible = false;
  g.add(model, blob(0.36), lamp, umbrella);
  const hit = new THREE.Mesh(cyl(0.55, 0.55, 1.5, 8), new THREE.MeshBasicMaterial());
  hit.visible = false; // invisible meshes still raycast: a bigger, easier click target
  hit.position.y = 0.75;
  g.add(hit);

  const mixer = new THREE.AnimationMixer(model);
  const animations = [...gltf.animations, ...fishingClips(gltf.animations), carryingClip(gltf.animations)];
  const clip = (n) => mixer.clipAction(THREE.AnimationClip.findByName(animations, n));
  const rod = fishingRig(), basket = new THREE.Group();
  basket.add(part(cyl(0.23, 0.19, 0.26, 12), C.wood, [0.32, 0.18, -0.1], { t: 0.02 }), fishMesh('#b8dce0', [0.32, 0.32, -0.1], 0.8));
  g.add(rod.g, basket); rod.g.visible = basket.visible = false;
  let current = null, gesture = null, nextGesture = 0, last = null;
  const seed = [...r.id].reduce((a, c) => a + c.charCodeAt(0) * 1.7, 0);
  const pace = 0.9 + (seed % 5) * 0.05; // each resident has their own natural walking cadence

  const play = (name, dt = 0, t = 0, lookYaw = null, state = null, simTime = 0) => {
    bath.animate(name === 'soak', state?.bathWarmUntil ?? 0, simTime, t);
    if (model.userData.accessory) model.userData.accessory.visible = name !== 'soak';
    const fishing = name.startsWith('fish-') && state?.fishing;
    rod.g.visible = !!fishing; basket.visible = (state?.fish?.length ?? 0) > 0;
    if (fishing) rod.animate(fishing.phase, (simTime - fishing.started) / Math.max(0.001, fishing.until - fishing.started), t);
    const walk = clip('walk');
    if (name === 'walk' || name === 'stroll' || name === 'hurry') walk.timeScale = (name === 'stroll' ? 0.58 : name === 'hurry' ? 1.14 : 0.95) * (state?.stride || pace); // feet keep time with the sim's actual stride
    const baseName = BASE_CLIPS[name] ?? 'idle';
    const action = clip(baseName);
    if (current !== action) {
      action.timeScale = baseName === 'idle' ? 0.75 : 0.85;
      action.reset().fadeIn(0.28).play();
      current?.fadeOut(0.28);
      current = action;
      nextGesture = t + 0.4 + (seed % 1.2);
    }
    if (name !== last) { if (last !== null && current === action) nextGesture = t + 0.3; last = name; } // a new activity gets its own gesture rhythm
    action.paused = !!fishing && baseName.startsWith('fishing-');
    if (action.paused) action.time = Math.max(0, Math.min(1, (simTime - fishing.started) / Math.max(0.001, fishing.until - fishing.started)));
    const walking = name === 'walk' || name === 'stroll' || name === 'hurry' || name === 'move';
    const shown = PROP_AT[`${name}@${state?.at}`] ?? name;
    for (const [k, p] of Object.entries(props)) p.visible = k === shown || (k === 'carry' && name === 'move') || (k === 'bag' && walking && !!state?.bag);
    if (working.animate(state, t)) props.work.visible = props.garden.visible = false; // the farm's watering can replaces the trowel
    if (props.read.visible) props.read.children[1].rotation.z = Math.max(0, Math.sin(t * 0.7 + seed) - 0.8) * 7;
    if (!dt) return;

    // Trigger calm, occasional one-shot gestures instead of looping a 1-second clip forever
    const gClipName = GESTURE_CLIPS[name];
    if (gClipName && t >= nextGesture) {
      const ga = clip(gClipName);
      if (ga !== current) {
        ga.setLoop(THREE.LoopOnce, 1);
        ga.clampWhenFinished = false;
        ga.timeScale = name === 'talk' || name === 'argue' ? 0.65 : name === 'chop' ? 0.7 : 0.55;
        ga.reset().fadeIn(0.2).play();
        gesture = ga;
      }
      nextGesture = t + (GESTURE_GAP[name] ?? 2.8 + (seed % 1.7));
    } else if (!gClipName && gesture) {
      gesture.fadeOut(0.2);
      gesture = null;
    }

    mixer.update(dt);
    // Follow the animation's blend weight so sitting down and standing up stay smooth.
    model.position.copy(seatOffset).multiplyScalar(clip('sit').getEffectiveWeight() * (clip('sit').isRunning() ? 1 : 0));

    // Subtle whole-body orientation/sway on `model` (never mutating skinned bone Euler angles)
    const ph = t * 2.0 + seed, s1 = Math.sin(ph);
    if (name === 'sit' || fishing) model.rotation.y = 0; // keep hips against the seat while neighbours pass
    else if (name === 'walk' || name === 'stroll' || name === 'hurry') model.rotation.y = lookYaw ? lookYaw * 0.35 : 0;
    else if (name === 'perform') model.rotation.y = s1 * 0.45;
    else if (name === 'sweep' || name === 'work' || name === 'buy' || name === 'browse') model.rotation.y = s1 * 0.18;
    else model.rotation.y = lookYaw ? lookYaw * 0.5 : Math.sin(t * 0.7 + seed) * 0.12;
  };
  play('idle');
  return { g, mixer, play, lamp, umbrella };
}
