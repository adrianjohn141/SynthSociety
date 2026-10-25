import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, RESIDENTS, LOC, HOUSES, houseAt, overlap } from './sim.js';

const world = (loc, [x, z]) => { const l = LOC[loc]; return { x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz }; };
function placeAtHome(sim, r) {
  const s = sim.people[r.id], p = world(s.home, houseAt(s.home, s.house, [0.95, 2.3]));
  Object.assign(s, p, { at: s.home, target: s.home, goal: p, from: p, path: [], walking: false, hidden: false, task: null, intent: null, meal: null, shopped: false });
  s.needs = { food: 90, energy: 90, fun: 90 };
  return s;
}
const close = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 1e-6;

for (const [loc, houses] of Object.entries(HOUSES)) for (const k of houses.keys()) {
  const entrance = { ...world(loc, houseAt(loc, k, [0, 1.4])), threshold: true };
  for (const depth of [1.6, 1.4, 1.1, 0.75]) assert.ok(overlap({ ...world(loc, houseAt(loc, k, [0, depth])), walking: true, path: [entrance] }) < 0.01, `${loc} has a physically clear open doorway crossing`);
}

// Address assignment must control the actual front door, including an assigned
// house that differs from the resident's index in the town's roster.
for (const r of RESIDENTS) {
  const sim = createSim(7, 20 * 60), s = placeAtHome(sim, r);
  // A resident can change address without changing their global roster index.
  s.house = (s.house + 1) % HOUSES[s.home].length;
  placeAtHome(sim, r);
  s.wants = 'rest'; s.needs.energy = 10;
  step(sim, 1 / 60);
  const door = world(s.home, houseAt(s.home, s.house, [0, 1.4]));
  const inside = world(s.home, houseAt(s.home, s.house, [0, 0.75])); // 0.65 in through the door, along the house's own axis
  assert.ok(s.path.some((p) => p.threshold && close(p, door)), `${r.id} crosses their assigned front door`);
  assert.ok(close(s.goal, inside), `${r.id} enters their assigned house for a nap`);
  for (let second = 0; second < 20; second++) step(sim, 1 / 60);
  assert.ok(s.hidden && close(s, inside), `${r.id} rests beyond the threshold of that same house`);
  const copy = loadState(saveState(sim));
  assert.equal(copy.people[r.id].house, s.house, 'the address survives reloading');
}

// Home meals are prepared and eaten at the resident's own doorstep, including
// residents who have moved into a partner's house on a different lane.
for (const r of RESIDENTS) {
  // Early-shift workers are already asleep at 20:00. Exercise home cooking
  // during their own waking hours as well as the ordinary evening schedule.
  const hour = r.sleepHours && r.sleepHours[0] >= 19 ? r.sleepHours[0] - 1 : 20;
  const sim = createSim(42, hour * 60), s = sim.people[r.id];
  s.home = r.home === 'homes' ? 'cabin' : 'homes';
  s.house = HOUSES[s.home].length - 1;
  placeAtHome(sim, r);
  s.money = 0; s.pantry = 2; s.fish = []; s.wants = 'food'; s.needs.food = 20;
  const expected = world(s.home, houseAt(s.home, s.house, [0.95, 2.3]));
  const phases = new Set();
  for (let second = 0; second < 20 * 60; second++) {
    step(sim, 1 / 60);
    if (s.meal && ['cooking', 'eating'].includes(s.meal.phase)) {
      phases.add(s.meal.phase);
      assert.equal(s.meal.loc, s.home);
      assert.ok(close(s.goal, expected), `${r.id} ${s.meal.phase} belongs to their actual address`);
    }
  }
  assert.ok(phases.has('cooking') && phases.has('eating'), `${r.id} has a real meal at home`);
  assert.ok(s.needs.food > 60, 'the meal actually restores hunger');
}
console.log('home life ok — assigned doors, rest, cooking, meals, moved-in households and saved addresses');
