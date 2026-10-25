import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, RESIDENTS, LOC, clockOf, planFor, PEOPLE } from './sim.js';
import { onIsland, inFishingWater } from './world.js';

const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);
const run = (sim, minutes) => { for (let i = 0; i < minutes * 60; i++) step(sim, 1 / 60); };
const snapshots = new Map();
let cookedAtWaterfront = false;

// Exercise real travel, all three phases, actual worker service and self-caught
// meals. No catch, sale, or meal is injected by the test.
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 10 * 60), total = wealth(sim);
  sim.today.weather = { kind: 'clear' };
  const phases = new Set(), destinations = new Set();
  for (let second = 0; second < 6 * 60 * 60; second++) {
    const before = Object.fromEntries(RESIDENTS.map((r) => [r.id, { caught: sim.people[r.id].fishStats.caught, food: sim.people[r.id].needs.food, task: sim.people[r.id].task?.kind, reached: sim.people[r.id].task?.reached }]));
    step(sim, 1 / 60);
    const slots = new Set();
    for (const r of RESIDENTS) {
      const s = sim.people[r.id], b = before[r.id];
      assert.ok(onIsland(s.x, s.z, 0.35));
      const dx = s.x - LOC.fishing.x, dz = s.z - LOC.fishing.z;
      const x = dx * LOC.fishing.uz - dz * LOC.fishing.ux, z = dx * LOC.fishing.ux + dz * LOC.fishing.uz;
      assert.ok(!inFishingWater(x, z), `${r.id} stays on shore or the wooden deck`);
      if (s.fishing) { assert.ok(!slots.has(s.fishing.slot), 'each angler reserves a different space'); slots.add(s.fishing.slot); }
      if (s.fishing && s.task?.reached && !s.walking) {
        phases.add(s.fishing.phase);
        if (!snapshots.has(s.fishing.phase)) snapshots.set(s.fishing.phase, saveState(sim));
        assert.ok(r.hobbies?.includes('fishing'), 'fishing follows a resident hobby');
        assert.equal(s.at, 'fishing');
        assert.ok(s.needs.food <= b.food, 'waiting for a bite never feeds a resident');
      }
      if (s.fishStats.caught > b.caught) assert.ok(b.task === 'fishing' && b.reached, 'a catch requires an arrived fishing activity');
      if (s.fishSale && !snapshots.has('sale')) snapshots.set('sale', saveState(sim));
      if (s.meal?.fish) {
        destinations.add(s.meal.loc);
        if (!snapshots.has(s.meal.phase)) snapshots.set(s.meal.phase, saveState(sim));
        if (s.meal.phase === 'cooking') assert.ok(s.needs.food <= b.food, 'cooking is not eating');
      }
      assert.ok(s.fish.length <= 3, 'baskets have a finite capacity');
      assert.equal(s.fishStats.caught, s.fish.length + s.fishStats.sold + s.fishStats.cooked + s.fishStats.spoiled, 'every landed fish has exactly one owner or disposition');
      assert.ok(s.fishStats.eaten <= s.fishStats.cooked);
    }
  }
  assert.deepEqual([...phases].sort(), ['casting', 'reeling', 'waiting']);
  assert.ok(sim.waterfront.caught >= 6 && sim.waterfront.sold > 0 && sim.waterfront.eaten > 0, `the whole fishing economy emerges (seed ${seed})`);
  cookedAtWaterfront ||= destinations.has('cookhouse');
  assert.equal(sim.waterfront.marketStock, sim.waterfront.sold);
  assert.ok(sim.waterfront.marketServed >= 0 && sim.waterfront.marketServed <= sim.waterfront.marketStock, 'market fish meals never exceed stock bought from anglers');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-5, 'fish sales transfer existing money from a market till');
}

assert.ok(cookedAtWaterfront, 'autonomous anglers actually use the communal kitchen');

// Fish retained from a real trip cannot be cooked or sold after a long absence.
{
  const sim = loadState(snapshots.get('cooking'));
  const r = RESIDENTS.find((o) => sim.people[o.id].fish.length);
  assert.ok(r, 'a landed fish is still in a basket');
  const s = sim.people[r.id], before = { ...s.fishStats }, held = s.fish.length;
  sim.t += 1441;
  step(sim, 1 / 60);
  assert.equal(s.fish.length, 0);
  assert.equal(s.fishStats.spoiled - before.spoiled, held);
  assert.equal(s.fishStats.sold, before.sold);
  assert.equal(s.fishStats.cooked, before.cooked);
}

for (const stage of ['casting', 'waiting', 'reeling', 'sale', 'cooking', 'eating']) {
  assert.ok(snapshots.has(stage), `${stage} was exercised`);
  const original = loadState(snapshots.get(stage)), copy = loadState(saveState(original));
  run(original, 15); run(copy, 15);
  assert.equal(saveState(copy), saveState(original), `saving during ${stage} resumes identically`);
}

// Bad weather, darkness, urgent needs and the next shift supersede the hobby.
for (const kind of ['rain', 'snow', 'night', 'work', 'hunger', 'rest']) {
  const sim = loadState(snapshots.get('waiting'));
  // Use whichever real angler produced this snapshot.
  const r = RESIDENTS.find((o) => sim.people[o.id].fishing?.phase === 'waiting');
  const angler = sim.people[r.id], caught = angler.fishStats.caught;
  if (['rain', 'snow'].includes(kind)) sim.today.weather = { kind };
  else if (kind === 'night') sim.t = Math.floor(sim.t / 1440) * 1440 + 21 * 60;
  else if (kind === 'work') sim.t = Math.floor(sim.t / 1440) * 1440 + r.hours[0] * 60 + 1;
  else if (kind === 'hunger') { angler.needs.food = 20; angler.wants = 'food'; }
  else { angler.needs.energy = 15; angler.wants = 'rest'; }
  step(sim, 1 / 60);
  assert.equal(angler.fishing, null, `${kind} interrupts fishing and frees its space`);
  assert.equal(angler.fishStats.caught, caught, 'an interrupted reel awards no fish');
}

// A meal that ran into bedtime must restore its eating task at the same home.
{
  const sim = createSim(42, 20 * 60 + 52), s = sim.people.sato;
  s.money = 0; s.needs.food = 30; s.wants = 'food';
  run(sim, 20);
  assert.ok(s.meal?.phase === 'eating', 'bedtime interrupts a real home meal');
  sim.t = Math.floor(sim.t / 1440) * 1440 + 1440 + 6.5 * 60;
  const before = s.needs.food;
  run(sim, 15);
  assert.ok(s.needs.food > before, 'morning resumes the food task rather than leaving a hungry resident hidden');
  assert.ok(!planFor(PEOPLE.sato, sim).inside || clockOf(sim).h >= 21);
}

// Old towns receive empty hobby state without resetting any existing progress.
{
  const old = createSim(7, 600);
  delete old.waterfront;
  for (const s of Object.values(old.people)) for (const k of ['fish', 'fishStats', 'fishing', 'nextFishing', 'nextFishSale', 'fishSale']) delete s[k];
  const json = saveState(old), upgraded = loadState(json);
  for (const r of RESIDENTS) {
    for (const key of Object.keys(old.people[r.id])) assert.deepEqual(upgraded.people[r.id][key], old.people[r.id][key], `${key} is preserved`);
    assert.deepEqual(upgraded.people[r.id].fish, []);
  }
  assert.equal(upgraded.seed, old.seed);
  assert.equal(saveState(loadState(saveState(upgraded))), saveState(upgraded), 'additive upgrade is idempotent');
}
console.log('fishing ok — real catches, sales, cooking, eating, water safety, interruptions, saves and conserved money');
