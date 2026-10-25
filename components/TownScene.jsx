'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LOCATIONS, DISTRICTS, RESIDENTS, step, catchUp, clockOf, weatherNow, festivalNow, fireLit, weddingNow } from '../lib/sim';
import { WORLD_SIZE } from '../lib/world';
import { buildTown, loadResident, petModel, windowMat, lanternMat } from '../lib/art';
import { PETS } from '../lib/pets';
import { mind, rewriteChat } from '../lib/mind';

const DAY_BG = new THREE.Color('#f5ead8'), DUSK_BG = new THREE.Color('#f3c9b0'), NIGHT_BG = new THREE.Color('#8c8fb8'), RAIN_BG = new THREE.Color('#c3c8d2');
const WIN_DAY = new THREE.Color('#d7e7e4'), WIN_NIGHT = new THREE.Color('#ffd88a');
const WIN_DARK = new THREE.Color('#586779');
const AMB_NIGHT = new THREE.Color('#c4c2ee'), WHITE = new THREE.Color('#ffffff');
const LANTERN_DAY = new THREE.Color('#e8907e'), LANTERN_NIGHT = new THREE.Color('#ffb070'), LANTERN_DARK = new THREE.Color('#8f5f5a');
const TALK = { chat: 'talk', reply: 'talk', heart: 'cheer', storm: 'argue', gift: 'give' }; // gestures while a bubble shows
const SIGN_ZOOM = 1.7; // building signs appear once zoomed in past this
const FOLLOW_ZOOM = 3.7;
const PENTATONIC = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33]; // D4, E4, G4, A4, B4, D5 (Japanese Yo scale)
function createSound() {
  let ctx = null, rainGain = null, waterGain = null, on = false, nextNote = 0, nextFlute = 0, phrase = 0;
  function toggle() {
    on = !on;
    if (on && !ctx && typeof window !== 'undefined') {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        const makeLoop = (freq, q) => {
          const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
          src.buffer = buf; src.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
          src.connect(f).connect(g).connect(ctx.destination); src.start();
          return g;
        };
        rainGain = makeLoop(950, 0.7);
        waterGain = makeLoop(420, 1.4);
      }
    }
    if (ctx) on ? ctx.resume() : ctx.suspend();
    return on;
  }
  function update(t, { rain, night, festival, center, flute = 0 }) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const waterNear = Math.max(0, 1 - Math.hypot(center.x - 29.7, center.z - 29.7) / 28);
    rainGain.gain.setTargetAtTime(rain * 0.045, ctx.currentTime, 0.15);
    waterGain.gain.setTargetAtTime((0.008 + waterNear * 0.022) * (1 - rain * 0.5), ctx.currentTime, 0.15);
    if (t >= nextNote) {
      nextNote = t + (festival ? 1.2 + Math.random() * 1.6 : 2.8 + Math.random() * 3.5);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = night > 0.5 ? 'sine' : 'triangle';
      osc.frequency.value = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] * (night > 0.5 ? 1 : 2);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(festival ? 0.028 : 0.015, ctx.currentTime + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
      osc.connect(g).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 1.45);
    }
    if (flute > 0.05 && t >= nextFlute) { // a resident practising the flute nearby: a soft, wandering tune that fades with distance
      phrase = Math.max(0, Math.min(PENTATONIC.length - 1, phrase + Math.floor(Math.random() * 3) - 1));
      const end = Math.random() < 0.2, len = end ? 1.1 : 0.35 + Math.random() * 0.3;
      nextFlute = t + len + (end ? 1.5 + Math.random() * 2 : 0.05);
      const osc = ctx.createOscillator(), vib = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain(), now = ctx.currentTime;
      osc.type = 'sine'; osc.frequency.value = PENTATONIC[phrase] * 2;
      vib.frequency.value = 5.5; depth.gain.value = 4; vib.connect(depth).connect(osc.frequency);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.02 * flute, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + len);
      osc.connect(g).connect(ctx.destination);
      osc.start(); vib.start(); osc.stop(now + len + 0.05); vib.stop(now + len + 0.05);
    }
  }
  return { toggle, update, dispose: () => ctx?.close() };
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const daylight = (h) => ss(5, 7, h) * (1 - ss(17.5, 19.5, h));
const turn = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
// Sun by day (6:00 to 19:00), moon by night, on one arc from screen-right to screen-left, tipped toward the camera
// so lit faces stay bright and even midday shadows read behind houses and trees.
const SUN_WARM = new THREE.Color('#ffc58f'), SUN_NOON = new THREE.Color('#fff3df'), MOON = new THREE.Color('#b9c7ff');
const skyArc = (h) => {
  const day = h >= 6 && h < 19, a = Math.PI * (day ? (h - 6) / 13 : ((h - 19 + 24) % 24) / 11), up = Math.sin(a);
  return { day, up, x: 25 * Math.cos(a) + 14, y: 6 + 30 * up, z: -25 * Math.cos(a) + 14 };
};
const LAMP_SLOTS = 16, LAMP_SHADOWS = 2; // nearest night lights that really light the scene; the first few also cast shadows
const LAMP_COLOR = '#ffb36b';
const THINK = 5000; // ms a speaker may 'think' while the model writes; after that the written lines stay
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// hand-drawn speech bubbles (inline SVG, no emoji)
const BUBBLES = {
  chat: '<svg width="22" height="10" viewBox="0 0 22 10"><g fill="#8a6552"><circle cx="4" cy="5" r="2.5"/><circle cx="11" cy="5" r="2.5"/><circle cx="18" cy="5" r="2.5"/></g></svg>',
  heart: '<svg width="16" height="14" viewBox="0 0 16 14"><path d="M8 13S1 8.6 1 4.4A3.4 3.4 0 0 1 8 2.6a3.4 3.4 0 0 1 7 1.8C15 8.6 8 13 8 13z" fill="#eda8bb" stroke="#8a6552" stroke-width="1.4"/></svg>',
  coin: '<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="#f2cf7a" stroke="#8a6552" stroke-width="1.4"/><circle cx="8" cy="8" r="3.2" fill="none" stroke="#c99a3c" stroke-width="1.2"/></svg>',
  storm: '<svg width="20" height="14" viewBox="0 0 20 14"><path d="M5 9a3.5 3.5 0 0 1 .6-7A4.5 4.5 0 0 1 14 3a3 3 0 0 1 1 6z" fill="#c9c6d6" stroke="#8a6552" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 9l-2 3h3l-1.5 2" fill="none" stroke="#e0a43c" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gift: '<svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="6" width="12" height="8.5" rx="1.5" fill="#eab1b5" stroke="#8a6552" stroke-width="1.3"/><rect x="1.2" y="4" width="13.6" height="3" rx="1" fill="#f6c3a3" stroke="#8a6552" stroke-width="1.3"/><path d="M8 4v10.5M8 4C6 1 3.5 2 5 4M8 4c2-3 4.5-2 3 0" fill="none" stroke="#8a6552" stroke-width="1.3" stroke-linecap="round"/></svg>',
  note: '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 12.5V3.5l7-1.5v9" fill="none" stroke="#8a6552" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="4.4" cy="12.6" rx="2.2" ry="1.7" fill="#a9cfe6" stroke="#8a6552" stroke-width="1.2"/><ellipse cx="11.4" cy="11.1" rx="2.2" ry="1.7" fill="#a9cfe6" stroke="#8a6552" stroke-width="1.2"/></svg>',
};

export default function TownScene({ sim, selRef, onSelect, camRef, followRef, onFollowEnd }) {
  const host = useRef(null);
  const cb = useRef({});
  cb.current = { onSelect, onFollowEnd };

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // soft edges come from each shadow's radius
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = DAY_BG.clone();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    cam.position.set(40, 46, 40);
    cam.lookAt(0, 0, 0);
    const controls = new MapControls(cam, renderer.domElement);
    Object.assign(controls, { enableDamping: true, minZoom: 0.8, maxZoom: 6 });
    controls.minPolarAngle = controls.maxPolarAngle = cam.position.angleTo(THREE.Object3D.DEFAULT_UP); // turns all the way round (right-drag, or two-finger twist) at the same isometric tilt
    controls.update(); // so the view angle reads right from the first frame

    const amb = new THREE.AmbientLight('#ffffff', 0.55), sun = new THREE.DirectionalLight('#fff3df', 0.55);
    sun.position.set(14, 30, 8);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -WORLD_SIZE * 0.75, right: WORLD_SIZE * 0.75, top: WORLD_SIZE * 0.75, bottom: -WORLD_SIZE * 0.75, near: 1, far: 160 });
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow, { bias: -0.0004, normalBias: 0.04, radius: 3 });
    scene.add(amb, sun, sun.target);

    // A small pool of real point lights hops between the lanterns, lit doorways and carried lamps nearest the view.
    const lamps = Array.from({ length: LAMP_SLOTS }, (_, i) => {
      const light = new THREE.PointLight(LAMP_COLOR, 0, 7, 1.6);
      if (i < LAMP_SHADOWS) {
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        Object.assign(light.shadow, { bias: -0.002, normalBias: 0.05, radius: 2 });
        light.shadow.camera.far = 7;
        light.shadow.needsUpdate = true; // allocate the shadow map on the first frame even if the lamp starts unlit

      }
      scene.add(light);
      return { light, spot: null, level: 0 };
    });
    let lampPick = 0, wanted = [], occupied = new Set();
    const said = new Map(), asked = new Set(); // live chatter: `${speaker}|${written line}` -> { text } from the model, or {} while it writes ({ wait } once that bubble shows)
    const glowLevel = new Map(); // each street lamp head eases toward lit while a resident is beside it

    const town = buildTown(scene, sim.today.season);
    const shade = (root) => root.traverse((o) => { // solid toon meshes cast and catch shadows; glows, outlines and particles don't
      if (o.isMesh && [o.material].flat().every((m) => m?.isMeshToonMaterial && !m.transparent)) o.castShadow = o.receiveShadow = true;
    });
    shade(scene);    const districtLabels = {}, districtMarkers = [];
    for (const D of DISTRICTS) {
      const div = document.createElement('div');
      div.className = 'district-label';
      div.textContent = D.name;
      const o = new CSS2DObject(div);
      o.position.set(D.x, 6.5, D.z);
      scene.add(o);
      districtLabels[D.id] = div;
      districtMarkers.push(o);
    }
    const signs = [];
    for (const l of LOCATIONS) {
      const b = document.createElement('button');
      b.className = 'sign';
      b.textContent = l.name;
      b.onclick = () => cb.current.onSelect({ type: 'location', id: l.id });
      const o = new CSS2DObject(b);
      o.position.set(l.x, town.locs[l.id].userData.top + 0.9, l.z);
      scene.add(o);
      signs.push(o);
    }

    // name tag shown above whichever resident the pointer is over
    const tagDiv = document.createElement('div');
    tagDiv.className = 'name-tag';
    const tag = new CSS2DObject(tagDiv);
    tag.position.y = 2.2;
    tag.visible = false;

    const pets = PETS.map((p) => { const m = petModel(p.kind, p.coat); shade(m.g); scene.add(m.g); return { ...m, id: p.id }; });
    const people = [];
    let disposed = false;
    for (const r of RESIDENTS)
      loadResident(r).then(({ g, mixer, play, lamp, umbrella }) => {
        if (disposed) return;
        g.userData.pick = { type: 'resident', id: r.id };
        const anchor = document.createElement('div'), div = document.createElement('div');
        anchor.appendChild(div); // the inner bubble is lifted clear of its neighbours; the anchor stays over the head
        const bubble = new CSS2DObject(anchor);
        bubble.position.y = 1.75;
        bubble.renderOrder = 1; // CSS2DRenderer stacks by renderOrder first: speech sits above building signs and district labels
        g.add(bubble);
        shade(g);
        scene.add(g);
        people.push({ r, g, div, bubble, mixer, play, lamp, umbrella, kind: null, w: 0, h: 0, lift: 0 });
      });

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: '#f2b84b', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight, a = w / h;
      const view = Math.max(WORLD_SIZE * 0.9, (w <= 720 ? WORLD_SIZE * 0.9 : WORLD_SIZE * 1.45) / a); // phones crop the island's corners; pan to see them
      renderer.setSize(w, h);
      labels.setSize(w, h);
      Object.assign(cam, { left: (-view * a) / 2, right: (view * a) / 2, top: view / 2, bottom: -view / 2 });
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // camera flights: district jumps and following a resident
    let goal = null;
    const sound = createSound();
    camRef.current = {
      flyTo: (x, z, zoom) => { goal = { x, z, zoom }; },
      home: () => { goal = { x: 0, z: 0, zoom: 1 }; },
      toggleSound: () => sound.toggle(),
    };
    controls.addEventListener('start', () => (goal = null));

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e, withBuildings) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const targets = [...people.filter((p) => p.g.visible).map((p) => p.g), ...(withBuildings ? Object.values(town.locs) : [])];
      let o = ray.intersectObjects(targets, true)[0]?.object;
      while (o && !o.userData.pick) o = o.parent;
      return o;
    };
    // click (not drag) picks a resident or building; a drag pans and stops following
    let down = null, hoverEvent = null;
    const onDown = (e) => (down = [e.clientX, e.clientY]);
    const onUp = (e) => {
      if (!down) return;
      const dragged = Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6;
      down = null;
      if (e.button !== 0) return; // right-drag turns the view and keeps following
      if (dragged) { if (followRef.current) cb.current.onFollowEnd(); return; }
      const o = pick(e, true);
      cb.current.onSelect(o ? o.userData.pick : null);
    };
    const onMove = (e) => (hoverEvent = e.pointerType === 'mouse' ? e : null);
    const onLeave = () => (hoverEvent = null);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    // Speech bubbles never cover each other: working up from the lowest on screen, each one is lifted
    // above any bubble it would overlap, easing there so passers-by don't make them jump.
    const v = new THREE.Vector3();
    const layoutBubbles = (shown) => {
      const W = el.clientWidth, H = el.clientHeight, placed = [];
      for (const p of shown) {
        if (!p.w) { p.w = p.div.offsetWidth; p.h = p.div.offsetHeight; }
        p.bubble.getWorldPosition(v).project(cam);
        p.sx = ((v.x + 1) / 2) * W;
        p.sy = ((1 - v.y) / 2) * H;
      }
      shown.sort((a, b) => b.sy - a.sy);
      for (const p of shown) {
        let lift = 0;
        for (let pass = 0; pass < 12; pass++) {
          const cy = p.sy - lift, hit = placed.find((q) => Math.abs(q.x - p.sx) < (q.w + p.w) / 2 + 3 && Math.abs(q.y - cy) < (q.h + p.h) / 2 + 2);
          if (!hit) break;
          lift = p.sy - (hit.y - hit.h / 2 - p.h / 2 - 3);
        }
        placed.push({ x: p.sx, y: p.sy - lift, w: p.w, h: p.h });
        p.lift += (lift - p.lift) * 0.25;
        p.div.style.transform = p.lift > 0.5 ? `translateY(${-p.lift.toFixed(1)}px)` : '';
        p.div.classList.toggle('lifted', p.lift > 6);
      }
    };

    const timer = new THREE.Timer();
    timer.connect(document); // ignores time spent in a hidden tab
    let wet = 0, snowy = 0, hovered = null, slow = 0, lean = false; // lean: dropped to cheaper settings for a slow device
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      const raw = timer.getDelta(), dt = Math.min(raw, 0.1), t = timer.getElapsed();
      // Slow device: after ~4 s under ~28 fps, render at 1x pixels, then drop lamp shadows. Throttled background frames (>0.25 s) don't count.
      if (!lean && raw < 0.25) {
        slow = raw > 1 / 28 ? slow + raw : Math.max(0, slow - raw);
        if (slow > 4) {
          slow = 0;
          if (renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); }
          else { lean = true; for (const s of lamps.slice(0, LAMP_SHADOWS)) s.light.castShadow = false; }
        }
      }
      // follow the real clock; after the tab slept, fast-forward coarsely, then step finely
      const now = (Date.now() - sim.epoch) / 60000;
      if (now - sim.t > 2) catchUp(sim, now - 1 / 60);
      while (sim.t < now) step(sim, Math.min(now - sim.t, 1));
      if (mind.status === 'on') {
        for (const chat of sim.pendingChats ?? []) { // each new conversation is offered to the model once
          if (asked.has(chat.id)) continue;
          asked.add(chat.id);
          if (!['chat', 'heart', 'storm'].includes(sim.people[chat.participants[0]].bubble?.kind)) continue;
          const keys = chat.messages.map((m) => `${m.speaker}|${m.text}`);
          keys.forEach((k) => said.set(k, {}));
          rewriteChat(sim, chat).then((out) => keys.forEach((k, i) => { // a line that misses its speaker's thinking time is dropped
            const live = said.get(k);
            if (live && out && !(performance.now() - live.wait > THINK)) { said.set(k, { text: out[i] }); chat.messages[i].said = out[i]; } else said.delete(k);
          }));
        }
      }
      else if (said.size) said.clear(); // minds switched off: never show an old line for a new chat
      while (said.size > 300) said.delete(said.keys().next().value);
      if (asked.size > 500) asked.clear();

      const d = daylight(clockOf(sim).h), night = 1 - d, w = weatherNow(sim), festival = festivalNow(sim);
      const k = Math.min(1, dt * 0.4); // weather fades in and out over a few seconds
      wet += ((w === 'rain' ? 1 : 0) - wet) * k;
      snowy += ((w === 'snow' ? 1 : 0) - snowy) * k;
      const grey = Math.max(wet, snowy * 0.6, w === 'cloudy' ? 0.25 : 0);
      scene.background.copy(NIGHT_BG).lerp(DAY_BG, d).lerp(DUSK_BG, 4 * d * (1 - d) * 0.5).lerp(RAIN_BG, grey * 0.55 * d);
      amb.color.copy(AMB_NIGHT).lerp(WHITE, d);
      // three's lights scale albedo by intensity/π, so π ≈ the flat, unshaded pastel colour
      amb.intensity = Math.PI * (0.6 + 0.12 * d - 0.06 * grey);
      sun.intensity = Math.PI * (0.12 + 0.36 * d * (1 - 0.5 * grey));
      const sky = skyArc(clockOf(sim).h);
      sun.position.set(sky.x, sky.y, sky.z);
      sun.color.copy(sky.day ? SUN_WARM : MOON).lerp(sky.day ? SUN_NOON : MOON, ss(0.1, 0.6, sky.up));
      // shadows soften under cloud and vanish as the sun or moon meets the horizon, so the hand-over never jumps
      sun.shadow.intensity = ss(0.05, 0.3, sky.up) * (sky.day ? 0.85 : 0.45) * (1 - 0.8 * grey);

      if (t >= lampPick) { // twice a second: lamps light up only while a resident is beside them (or carrying one)
        lampPick = t + 0.5;
        const c = controls.target, spots = [...town.lights, ...(festival ? town.festLights : [])].map((l) => ({ key: l, x: l.x, y: l.y ?? 1.5, z: l.z, r: l.r }));
        for (const p of people) if (p.lamp.visible) spots.push({ key: p, x: p.g.position.x, y: 0.9, z: p.g.position.z, r: 1.4, carried: p });
        const near = (s) => people.some((p) => p.g.visible && Math.hypot(p.g.position.x - s.x, p.g.position.z - s.z) < s.r + 3);
        // shortcut: only LAMP_SLOTS real lights exist; if more lamps are in use, those nearest the view win
        const inUse = night > 0.15 ? spots.filter((s) => s.carried || near(s)) : [];
        occupied = new Set(inUse.map((s) => s.key));
        wanted = inUse.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, LAMP_SLOTS);
      }
      lamps.forEach((s, i) => { // keep a slot on its source while wanted; fade it out before moving it to a new one
        const keep = s.spot && (!s.spot.carried || s.spot.carried.lamp.visible) && wanted.find((w) => w.key === s.spot.key);
        if (keep) s.spot = keep;
        // shadow-casting slots stay on fixed lamps: a light inside a walker's lantern would be blacked out by their own body
        else if (s.level < 0.02) s.spot = wanted.find((w) => !(i < LAMP_SHADOWS && w.carried) && !lamps.some((o) => o.spot?.key === w.key)) ?? null;
        s.level += ((keep ? 1 : 0) - s.level) * Math.min(1, dt * 3);
        if (!s.spot) { s.light.intensity = 0; return; }
        if (s.spot.carried) s.spot.carried.lamp.localToWorld(s.light.position.set(0, -0.22, 0.52)); // the paper lantern itself
        else s.light.position.set(s.spot.x, s.spot.y, s.spot.z);
        const src = s.light.position;
        s.light.distance = 3 + s.spot.r * 2.2;
        s.light.intensity = Math.PI * 1.6 * ss(0.15, 0.7, night) * s.level * (0.96 + Math.sin(t * 7 + (s.spot.carried ? i : src.x) * 3) * 0.04);
      });
      for (const l of town.lights) {
        if (!l.glow) continue;
        const v = (glowLevel.get(l) ?? 0) + ((occupied.has(l) ? 1 : 0) - (glowLevel.get(l) ?? 0)) * Math.min(1, dt * 3);
        glowLevel.set(l, v);
        if (l.paper) l.glow.color.copy(LANTERN_DAY).lerp(LANTERN_DARK, night).lerp(LANTERN_NIGHT, v * night);
        else l.glow.color.copy(WIN_DAY).lerp(WIN_DARK, night).lerp(WIN_NIGHT, v * night);
      }
      for (const s of lamps.slice(0, LAMP_SHADOWS)) s.light.shadow.autoUpdate = s.light.intensity > 0.01; // no shadow passes for unlit lamps by day
      windowMat.color.copy(WIN_DAY).lerp(WIN_NIGHT, night);
      for (const l of LOCATIONS) { // a home's windows glow at night only while someone is in and awake
        const awake = RESIDENTS.some((r) => { const s = sim.people[r.id]; return s.at === l.id && !s.walking && s.act !== 'Sleeping'; });
        const lu = town.locs[l.id].userData;
        lu.lanternGlow?.color.copy(LANTERN_DAY).lerp(awake ? LANTERN_NIGHT : LANTERN_DARK, night);
        lu.stoneGlow?.color.copy(WIN_DAY).lerp(awake ? WIN_NIGHT : WIN_DARK, night);
        for (const m of town.locs[l.id].userData.businessWindows ?? []) m.color.copy(WIN_DAY).lerp(awake ? WIN_NIGHT : WIN_DARK, night).multiplyScalar(awake ? 0.99 + Math.sin(t * 1.7 + l.x) * 0.01 : 1);
        const wins = town.locs[l.id].userData.windows;
        if (!wins) continue;
        const drying = d > 0.6 && w !== 'rain' && w !== 'snow';
        town.locs[l.id].userData.laundry?.forEach((g, h) => {
          g.visible = drying && !!sim.households?.[`${l.id}:${h}`]?.laundry;
          g.children.slice(3).forEach((c, i) => (c.rotation.x = Math.sin(t * 1.6 + i + h) * 0.18));
        });
        town.locs[l.id].userData.blooms?.forEach((b, h) => { // a pot blooms with its owners' care: from a few buds to full flower
          const care = Math.max(0, ...RESIDENTS.map((r) => sim.people[r.id]).filter((s) => s.home === l.id && s.house === h).map((s) => s.pot ?? 3));
          b.scale.setScalar(0.55 + care * 0.07);
          b.children.forEach((c, i) => (c.visible = i === 0 || care >= 3 + i * 2));
        });
        wins.forEach((m, h) => {
          const home = RESIDENTS.some((r) => { const s = sim.people[r.id]; return s.home === l.id && s.house === h && s.hidden && s.at === l.id && s.act !== 'Sleeping'; });
          m.color.copy(WIN_DAY).lerp(home ? WIN_NIGHT : WIN_DARK, night);
        });
      }
      lanternMat.color.copy(LANTERN_DAY).lerp(LANTERN_NIGHT, night);
      districtLabels.pleasure.textContent = festival ? 'Lantern Festival tonight' : 'Pleasure District';
      for (const o of signs) o.visible = cam.zoom >= SIGN_ZOOM;
      for (const marker of districtMarkers) marker.visible = cam.zoom < 2.8;

      for (const p of people) {
        const s = sim.people[p.r.id];
        p.g.visible = !s.hidden;
        p.g.position.set(s.x, s.y ?? 0, s.z);
        const sitting = s.task?.reached && s.task.anim === 'sit';
        p.g.rotation.y = (sitting || (s.fishing && s.task?.reached && !s.walking)) ? s.face : turn(p.g.rotation.y, s.face, 0.2);
        // a short gesture when a chat starts, then back to what they were doing
        const speaking = s.bubble && (s.bubble.from ?? 0) <= sim.t && s.bubble.until > sim.t ? s.bubble : null; // a reply waits its turn
        const taskAnim = s.task?.reached ? s.task.anim ?? 'idle' : 'idle';
        const handsFree = ['idle', 'watch', 'browse', 'buy'].includes(taskAnim);
        // Residents keep holding their bowl, book, laundry or tools while talking.
        const gesture = handsFree && !s.walking && !sitting && !s.fishing && speaking && sim.t < speaking.until - 0.1 && TALK[speaking.kind];
        // turn head toward the nearest nearby resident if within conversational range
        let lookYaw = null, bestD = 3.2;
        for (const q of people) {
          if (q === p || !q.g.visible) continue;
          const d2 = Math.hypot(q.g.position.x - s.x, q.g.position.z - s.z);
          if (d2 < bestD) {
            const rel = Math.atan2((q.g.position.x - s.x), (q.g.position.z - s.z)) - p.g.rotation.y;
            const wrapped = Math.atan2(Math.sin(rel), Math.cos(rel));
            if (Math.abs(wrapped) < 1.2) { bestD = d2; lookYaw = wrapped * 0.7; }
          }
        }
        p.play(s.walking ? (s.moving ? 'move' : s.ambling ? 'stroll' : w === 'rain' || w === 'snow' ? 'hurry' : 'walk') : gesture || taskAnim, dt, t, lookYaw, s, sim.t);
        p.lamp.visible = night > 0.5 && !s.hidden && (s.walking || s.intent?.plan.patrol);
        p.umbrella.visible = (w === 'rain' || w === 'snow') && s.walking && !s.hidden;
        const b = !s.hidden ? speaking : null;
        const live = b?.text && said.get(`${p.r.id}|${b.text}`);
        if (live && !live.text) live.wait ??= performance.now(); // a speaker's thinking time starts when their bubble appears
        const shown = live?.text ?? (live && performance.now() - live.wait < THINK ? '…' : b?.text);
        const sig = b ? `${b.kind}:${shown ?? ''}` : null;
        p.bubble.visible = !!b;
        if (sig !== p.kind) {
          p.kind = sig;
          p.div.className = `bubble ${b?.kind ?? ''}`;
          p.div.innerHTML = b ? `${BUBBLES[b.kind] ?? ''}${shown ? `<span>${esc(shown)}</span>` : ''}` : '';
          p.w = 0; // re-measured once it has rendered
        }
      }
      layoutBubbles(people.filter((p) => p.bubble.visible));
      for (const m of pets) {
        const pet = sim.pets?.[m.id];
        if (!pet) continue;
        m.g.position.set(pet.x, 0, pet.z);
        m.g.rotation.y = turn(m.g.rotation.y, pet.face, 0.15);
        m.pose(pet.state, !!pet.goal, t);
      }

      // hover: name tag over residents, pointer cursor over anything clickable
      const over = hoverEvent && !down ? pick(hoverEvent, true) : null;
      const who = over?.userData.pick.type === 'resident' ? over : null;
      if (who !== hovered) {
        hovered = who;
        tag.visible = !!who;
        if (who) { who.add(tag); tagDiv.textContent = RESIDENTS.find((r) => r.id === who.userData.pick.id).name; }
      }
      if (hovered) tag.visible = !people.find((p) => p.g === hovered)?.bubble.visible; // the tag would sit on their speech
      renderer.domElement.style.cursor = over ? 'pointer' : '';

      const sel = selRef.current, sp = sel?.type === 'resident' && sim.people[sel.id];
      ring.visible = !!sp && !sp.hidden;
      if (sp) ring.position.set(sp.x, 0.04, sp.z), ring.scale.setScalar(0.95 + Math.sin(t * 4) * 0.06);

      const fid = followRef.current;
      if (fid) goal = { x: sim.people[fid].x, z: sim.people[fid].z, zoom: Math.max(cam.zoom, FOLLOW_ZOOM), follow: true };
      if (goal) {
        const f = Math.min(1, dt * (goal.follow ? 6 : 3));
        const dx = (goal.x - controls.target.x) * f, dz = (goal.z - controls.target.z) * f;
        controls.target.x += dx; controls.target.z += dz;
        cam.position.x += dx; cam.position.z += dz;
        cam.zoom += (goal.zoom - cam.zoom) * f;
        cam.updateProjectionMatrix();
        if (!goal.follow && Math.hypot(goal.x - controls.target.x, goal.z - controls.target.z) < 0.05 && Math.abs(goal.zoom - cam.zoom) < 0.01) goal = null;
      }

      const flute = Math.max(0, ...people.filter((p) => p.g.visible && sim.people[p.r.id].task?.reached && sim.people[p.r.id].task.anim === 'flute').map((p) => 1 - Math.hypot(p.g.position.x - controls.target.x, p.g.position.z - controls.target.z) / 14));
      const walkers = people.filter((p) => p.g.visible).map((p) => p.g.position);
      const env = { flute, walkers, night, rain: wet, snow: snowy, festival: festival && night > 0.2, season: sim.today.season, center: controls.target, turn: controls.getAzimuthalAngle() - Math.PI / 4, wedding: !!weddingNow(sim), fires: { bathhouse: fireLit(sim, 'bathhouse'), onsen: fireLit(sim, 'onsen'), bakery: fireLit(sim, 'bakery') } };
      env.people = sim.people;
      town.animate(t, dt, env);
      sound.update(t, env);
      controls.update();
      renderer.render(scene, cam);
      labels.render(scene, cam);
    });

    return () => {
      disposed = true;
      sound.dispose();
      renderer.setAnimationLoop(null);
      timer.dispose();
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.replaceChildren();
    };
  }, [sim, selRef, camRef, followRef]);

  return <div ref={host} className="scene" />;
}
