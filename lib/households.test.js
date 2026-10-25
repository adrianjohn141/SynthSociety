import assert from 'node:assert/strict';
import { createSim, step, clockOf, saveState, loadState, householdOf, RESIDENTS, HOUSES, LOC } from './sim.js';

const run = (sim, minutes) => { for (let second = 0; second < minutes * 60; second++) step(sim, 1 / 60); };
const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);
const phases = new Map();
function home(sim) {
  const s = sim.people.haru, l = LOC[s.home], [x, z] = HOUSES[s.home][s.house];
  const p = { x: l.x + x * l.uz + (z + 2.4) * l.ux, z: l.z - x * l.ux + (z + 2.4) * l.uz };
  Object.assign(s, p, { at: s.home, target: s.home, goal: p, from: p, path: [], walking: false, hidden: false, task: null, intent: null, wants: null, shopped: false });
  s.needs = { food: 90, energy: 90, fun: 70 };
  return s;
}

for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 17.5 * 60); sim.today.weather = { kind: 'clear' }; sim.today.festival = false;
  for (const s of Object.values(sim.people)) s.lastInviteDay = clockOf(sim).day;
  const s = home(sim), h = householdOf(sim, 'haru'), total = wealth(sim);
  h.tidiness = 50; h.dirtyLaundry = 3;
  for (let second = 0; second < 150 * 60; second++) {
    const before = { folded: h.folded, washed: h.washed, swept: h.swept }, was = h.chore?.kind;
    step(sim, 1 / 60);
    if (h.chore) {
      phases.set(h.chore.kind, phases.get(h.chore.kind) ?? saveState(sim));
      const person = sim.people[h.chore.who];
      if (was === h.chore.kind && (person.walking || !person.task?.reached)) assert.deepEqual({ folded: h.folded, washed: h.washed, swept: h.swept }, before, 'walking toward a chore does not complete it');
      assert.ok(Object.values(sim.households).filter((house) => house.chore?.who === h.chore.who).length === 1, 'a resident cannot do two household jobs at once');
    }
    if (h.laundry) phases.set('drying', phases.get('drying') ?? saveState(sim));
  }
  assert.ok(h.swept > 0 && h.washed >= 3 && h.folded >= 3, `a real sweep, wash, dry and fold cycle completes (seed ${seed})`);
  assert.ok(h.tidiness > 65 && h.dirtyLaundry === 0);
  assert.ok(RESIDENTS.some((r) => sim.people[r.id].diary.some((entry) => /Folded the dry laundry/.test(entry.text))), 'someone actually puts the clean clothes away');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-5, 'housework changes comfort rather than creating money');
}

for (const phase of ['sweep', 'wash', 'drying', 'fold']) {
  assert.ok(phases.has(phase));
  const original = loadState(phases.get(phase)), copy = loadState(saveState(original));
  run(original, 20); run(copy, 20);
  assert.equal(saveState(original), saveState(copy), `${phase} continues identically after a save`);
}

{
  const sim = loadState(phases.get('drying')), h = householdOf(sim, 'haru');
  sim.today.weather = { kind: 'rain' };
  const remaining = h.laundry.remaining;
  run(sim, 10);
  assert.equal(h.laundry.remaining, remaining, 'wet weather does not dry clothes');
}
{
  const sim = loadState(phases.get('wash')), h = householdOf(sim, 'haru'), who = h.chore.who;
  sim.people[who].needs.energy = 10; sim.people[who].wants = 'rest';
  const washed = h.washed;
  step(sim, 1 / 60);
  assert.ok(h.chore?.who !== who, 'an urgent rest need releases the shared chore');
  assert.equal(h.washed, washed, 'interrupted washing does not clean clothes');
}
{
  const sim = loadState(phases.get('sweep')), old = householdOf(sim, 'haru');
  const who = old.chore.who;
  sim.people[who].home = 'cabin'; sim.people[who].house = 0;
  step(sim, 1 / 60);
  assert.ok(old.chore?.who !== who, 'moving house releases work at the old address');
  assert.ok(householdOf(sim, who));
}
{
  const old = JSON.parse(phases.get('wash'));
  delete old.households;
  const upgraded = loadState(JSON.stringify(old));
  assert.ok(RESIDENTS.every((r) => householdOf(upgraded, r.id)));
  for (const r of RESIDENTS) for (const key of ['money', 'house', 'home', 'diary']) assert.deepEqual(upgraded.people[r.id][key], old.people[r.id][key]);
}
console.log('households ok — real shared chores, weather-dependent drying, saved loads, interruptions, moving house and conserved money');
