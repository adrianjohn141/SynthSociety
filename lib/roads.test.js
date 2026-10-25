import assert from 'node:assert/strict';
import { DISTRICT_ROADS, DIST, LOC, createSim, step, overlap, saveState, loadState } from './sim.js';
import { onIsland } from './world.js';

const lane = DISTRICT_ROADS.meadow;
for (const p of lane.points) for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 32) assert.equal(overlap({ x: p.x + Math.cos(angle) * lane.width / 2, z: p.z + Math.sin(angle) * lane.width / 2 }), 0, 'rounded road corners also clear the props');
// Sample the centre and both paving edges with a resident's collision radius.
// Door/goal exemptions are absent here, so every wall and prop must be cleared.
for (let segment = 1; segment < lane.points.length; segment++) {
  const a = lane.points[segment - 1], b = lane.points[segment], dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
  const samples = Math.ceil(distance / 0.05);
  for (let i = 0; i <= samples; i++) for (const side of [-1, 0, 1]) {
    const p = { x: a.x + dx * i / samples + side * lane.width / 2 * dz / distance, z: a.z + dz * i / samples - side * lane.width / 2 * dx / distance };
    assert.ok(onIsland(p.x, p.z, 0.35));
    assert.equal(overlap(p), 0, `the full meadow lane clears walls, lanterns, benches and gate posts (segment ${segment})`);
  }
}
// Keep the original failure visible: the discarded straight road cut through
// the library itself, which checking only the cottage doorsteps failed to catch.
{
  const a = DIST.meadow.gate, b = DIST.meadow.road;
  assert.ok(Array.from({ length: 101 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / 100, z: a.z + (b.z - a.z) * i / 100 })).some((p) => overlap(p) > 0.35), 'the old straight route is blocked');
}

function journey() {
  const sim = createSim(7, 9 * 60), s = sim.people.sora;
  Object.assign(s, LOC.library.door, { home: 'maple', house: 0, at: 'library', target: 'library', path: [], hidden: false, task: null, intent: null, wants: 'rest' });
  s.needs.energy = 10;
  step(sim, 0.001);
  assert.equal(s.target, 'maple');
  assert.ok(s.path.length > 0 && s.path.every((p) => Math.hypot(p.x, p.z) > 10), 'the village junction connects directly to the meadow without a trip to the central crossroads and back');
  return sim;
}
for (const oldSave of [false, true]) {
  let sim = journey();
  if (oldSave) {
    const raw = JSON.parse(saveState(sim)), s = raw.people.sora;
    delete raw.roadLayout;
    s.path = [{ x: LOC.library.x, z: LOC.library.z }, DIST.meadow.gate, LOC.maple.door];
    const before = { money: s.money, needs: s.needs, home: s.home, house: s.house, t: raw.t, tills: raw.tills };
    sim = loadState(JSON.stringify(raw));
    const restored = sim.people.sora;
    assert.deepEqual({ money: restored.money, needs: restored.needs, home: restored.home, house: restored.house, t: sim.t, tills: sim.tills }, before, 'rerouting an old journey preserves the resident and economy');
    assert.ok(restored.path.every((p) => Math.hypot(p.x, p.z) > 10));
  }
  const copy = loadState(saveState(sim));
  for (let second = 0; second < 180; second++) {
    step(sim, 1 / 60); step(copy, 1 / 60);
    const s = sim.people.sora;
    if (!s.hidden) assert.equal(overlap(s), 0, 'the actual walker clears obstacles along the smoothed path');
    if (s.hidden) break;
  }
  assert.ok(sim.people.sora.hidden && sim.people.sora.at === 'maple', 'the resident reaches their meadow home');
  assert.equal(saveState(sim), saveState(copy), 'the corrected journey saves and resumes identically');
}
console.log('roads ok — shared paving/navigation, full-width clearance, direct village junction and rerouted saved journeys');
