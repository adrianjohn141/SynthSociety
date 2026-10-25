import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { seatedOffset, RESIDENT_H, SEAT_H, fishingClips, fishingRig, domesticProps, carryingClip, rowboat, animateBoat, hingedDoor, animateDoor, doorwayWall, bathDetails, fitBathDetails, workingDetails } from './art.js';
import { RESIDENTS } from './sim.js';

globalThis.ProgressEvent ??= class { constructor(type, values) { Object.assign(this, values); } };

// Load the shipped meshes, skeletons and clips. Textures are the external rendering
// boundary; they do not affect the skinned vertex positions being checked here.
for (const name of new Set(RESIDENTS.map((r) => r.model))) {
  const buffer = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength));
  json.buffers[0].uri = `data:application/octet-stream;base64,${buffer.subarray(28 + jsonLength).toString('base64')}`;
  json.materials = json.materials.map(() => ({}));
  delete json.images;
  delete json.textures;
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  for (const clip of fishingClips(gltf.animations)) {
    assert.ok(clip.validate(), `${name}: fishing clip is valid`);
    const arm = clip.tracks.find((t) => t.name === 'arm-right.quaternion');
    assert.ok(arm && arm.values.some((v, i) => Math.abs(v - arm.values[i % 4]) > 0.05), `${name}: fishing moves the actual skinned arm`);
  }
  const model = gltf.scene;
  const moving = carryingClip(gltf.animations), walk = THREE.AnimationClip.findByName(gltf.animations, 'walk');
  assert.ok(moving.validate() && moving.duration === walk.duration, `${name}: moving animation preserves the walking cycle`);
  const leg = walk.tracks.find((t) => t.name.startsWith('leg-'));
  assert.ok(leg && moving.tracks.some((t) => t.name === leg.name && Array.from(t.values).every((v, i) => v === leg.values[i])), `${name}: legs keep walking while carrying a box`);
  for (const arm of moving.tracks.filter((t) => /^arm-/.test(t.name))) assert.ok(Array.from(arm.values).every((v, i) => v === arm.values[i % arm.getValueSize()]), `${name}: both arms hold the moving box steady`);
  model.scale.setScalar(RESIDENT_H / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
  const offset = seatedOffset(model, gltf.animations);
  const mixer = new THREE.AnimationMixer(model);
  const sit = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'sit')).play();
  const body = model.getObjectByName('body-mesh'), p = new THREE.Vector3();
  for (const time of [0, 0.08, 0.3, 1, 5]) {
    mixer.setTime(time);
    model.position.copy(offset);
    model.updateMatrixWorld(true);
    body.skeleton.update();
    const hips = new THREE.Box3();
    for (let i = 0; i < body.geometry.attributes.position.count; i++) {
      if (body.skeleton.bones[body.geometry.attributes.skinIndex.getX(i)].name !== 'torso') continue;
      body.getVertexPosition(i, p);
      hips.expandByPoint(p.applyMatrix4(body.matrixWorld));
    }
    const outline = 0.02 * model.scale.x;
    for (const lift of [0, 0.15]) {
      const surface = SEAT_H + 0.04 + 0.03 + lift;
      assert.ok(Math.abs(hips.min.y + lift - outline - surface) < 1e-6, `${name}: hips rest on seat at ${time}s, lift ${lift}`);
    }
    assert.ok(hips.min.z - outline >= -0.28 + 0.035 + 0.03 - 1e-6, `${name}: torso clears backrest at ${time}s`);
  }
  sit.stop();
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y - RESIDENT_H) < 1e-6, `${name}: standing pose restored`);
  const bath = bathDetails();
  fitBathDetails(model, bath, model.getObjectByName('head'));
  sit.reset().play(); mixer.update(1); model.position.copy(offset); model.updateMatrixWorld(true);
  const head = model.getObjectByName('head-mesh'), headBounds = new THREE.Box3();
  head.skeleton.update();
  for (let i = 0; i < head.geometry.attributes.position.count; i++) {
    head.getVertexPosition(i, p); headBounds.expandByPoint(p.applyMatrix4(head.matrixWorld));
  }
  const towel = new THREE.Box3().setFromObject(bath.headTowel);
  assert.ok(towel.min.y >= headBounds.max.y - 0.03 && towel.min.y <= headBounds.max.y + 0.09, `${name}: the bath towel follows the actual seated head`);
}
console.log('seating ok — all 12 shipped character models clear plaza and tea-house seats and backrests');

// The cast moves the line outward; reeling lifts the visible fish back to hand.
{
  const rod = fishingRig();
  rod.animate('casting', 0, 0);
  const start = rod.float.position.clone();
  rod.animate('casting', 1, 1);
  assert.ok(rod.float.position.z > start.z + 1 && rod.float.position.y < start.y - 0.5);
  rod.animate('waiting', 0.5, 2);
  assert.equal(rod.fish.visible, false);
  rod.animate('reeling', 0, 3);
  const water = rod.fish.position.clone();
  rod.animate('reeling', 1, 4);
  assert.ok(rod.fish.visible && rod.fish.position.y > water.y + 0.6 && rod.fish.position.z < water.z - 2);
  for (const value of rod.line.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
}
console.log('fishing art ok — all character arm clips move, casting extends the line, and reeling lifts a fish');

// Domestic activity props remain near the character's hands, above the ground.
for (const [kind, group] of Object.entries(domesticProps())) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y > 0.3 && bounds.max.y < 0.8 && bounds.min.z > 0.1 && bounds.max.z < 0.65, `${kind} fits the standing character's hand space`);
}
console.log('domestic art ok — washing basin and folded clothes fit the hand pose');

// The moving leaf stays attached to its jamb, and the boat's shadow stays on
// the surface while its wooden interior remains above the lake (y = 0.1).
{
  const door = hingedDoor(), hinge = door.userData.door.hinge, jamb = hinge.position.clone();
  animateDoor(door, true, 0.1);
  assert.ok(hinge.rotation.y < -0.4 && hinge.rotation.y > -Math.PI * 0.54);
  for (let i = 0; i < 60; i++) animateDoor(door, true, 1 / 60);
  assert.ok(hinge.rotation.y < -1.5);
  assert.deepEqual(hinge.position, jamb, 'opening rotates around the fixed hinge');
  for (let i = 0; i < 180; i++) animateDoor(door, false, 1 / 60);
  assert.ok(Math.abs(hinge.rotation.y) < 0.001);
  for (const [w, h, d] of [[2.6, 1.7, 2.6], [5, 3.2, 4]]) {
    const shell = new THREE.Mesh(doorwayWall(w, h, d), new THREE.MeshBasicMaterial());
    const center = new THREE.Raycaster(new THREE.Vector3(0, 0.7, d / 2 + 1), new THREE.Vector3(0, 0, -1)).intersectObject(shell);
    const jamb = new THREE.Raycaster(new THREE.Vector3(0.8, 0.7, d / 2 + 1), new THREE.Vector3(0, 0, -1)).intersectObject(shell);
    assert.ok(center[0].distance > 1.95 && jamb[0].distance < 1.05, 'the visible shell has a real doorway recess between solid jambs');
  }
  const boat = rowboat(), hull = boat.userData.float, shadow = boat.children[0], y = shadow.position.y;
  const colors = new Set(); hull.traverse((m) => { if (m.isMesh) colors.add(m.material.color.getHexString()); });
  assert.ok(colors.size >= 5 && !colors.has('a9d8d6'), 'wood, planks, trim and waterline have distinct warm colors');
  for (const t of [0, 1, 3, 9]) {
    animateBoat(boat, t); boat.updateMatrixWorld(true);
    assert.equal(shadow.position.y, y);
    const deck = hull.children.find((m) => m.material?.color.getHexString() === 'd7ad77');
    assert.ok(new THREE.Box3().setFromObject(deck).min.y > 0.2, 'planks remain above water throughout the bob');
  }
  const bath = bathDetails();
  bath.animate(false, 0, 1, 1); assert.equal(bath.g.visible, false);
  bath.animate(true, 0, 1, 1); assert.equal(bath.g.visible, true);
  bath.animate(false, 13, 14, 2); assert.equal(bath.g.visible, false);
  const work = workingDetails(), state = { at: 'teahouse', work: true, task: { anim: 'work', reached: true } };
  assert.ok(work.animate(state, 1), 'reached tea work shows preparation');
  assert.equal(work.animate({ ...state, walking: true }, 2), false, 'walking never produces tea');
  assert.equal(work.animate({ ...state, task: { ...state.task, kind: 'work-close' } }, 3), false, 'washing up never whisks fresh matcha');
}
console.log('living art ok — hinged doors, visible wooden boat, bath details and activity-gated work props');
