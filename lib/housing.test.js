import assert from 'node:assert/strict';
import { createSim, catchUp, step, saveState, loadState, HOUSES, houseAt, HOUSE_NAMES, LOC, RESIDENTS, housematesOf, partnerOf, propertyOf, HOME_PRICE, overlap } from './sim.js';
import { onIsland } from './world.js';

const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);
const world = (l, x, z) => ({ x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz });
assert.equal(Object.values(HOUSES).flat().length, RESIDENTS.length, 'one physical home is available per resident');
for (const loc of ['clover', 'blossom', 'maple']) for (const i of HOUSES[loc].keys()) {
  assert.ok(HOUSE_NAMES[loc][i]);
  for (const [dx, dz] of [[-1.7, -2], [1.7, -2], [-1.7, 1.7], [1.7, 1.7], [-0.8, 4.6], [0.1, 4.6], [0.95, 2.3]]) {
    const p = world(LOC[loc], ...houseAt(loc, i, [dx, dz]));
    assert.ok(onIsland(p.x, p.z, 0.35), `${loc} house, washing line and activity spots stay on land`);
    if (dz > 2) assert.ok(overlap(p) < 0.01, `${loc} doorstep activity clears all town obstacles`);
  }
}

const snapshots = {};
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 18 * 60), total = wealth(sim), original = Object.fromEntries(RESIDENTS.map((r) => [r.id, `${sim.people[r.id].home}:${sim.people[r.id].house}`]));
  for (let minute = 0; minute < 3 * 1440; minute += 0.25) {
    catchUp(sim, sim.t + 0.25, 30);
    const reservations = sim.housing.moves.map((m) => `${m.to.loc}:${m.to.house}`);
    assert.equal(new Set(reservations).size, reservations.length, 'households never reserve the same vacant home');
    for (const m of sim.housing.moves) {
      snapshots[m.phase] ??= saveState(sim);
      for (const id of m.members) assert.equal(`${sim.people[id].home}:${sim.people[id].house}`, `${m.from[id].loc}:${m.from[id].house}`, 'the address changes after unpacking, not on reservation');
      assert.ok(RESIDENTS.every((r) => m.members.includes(r.id) || sim.people[r.id].home !== m.to.loc || sim.people[r.id].house !== m.to.house), 'a reserved destination has no unrelated occupant');
    }
    if (minute % 60 === 0) for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      assert.ok(onIsland(s.x, s.z, 0.35) && Number.isFinite(s.money) && s.money >= 0);
      if (!s.hidden && sim.t >= s.squeeze) assert.ok(overlap(s) < 0.35, `${r.id} walks around buildings while moving`);
    }
  }
  assert.ok(sim.housing.history.length >= 8, `residents actually settle into private homes (seed ${seed})`);
  for (const r of RESIDENTS) {
    const p = partnerOf(sim, r.id);
    assert.ok(housematesOf(sim, r.id).every((o) => p?.stage === 'together' && p.id === o.id), `${r.id} has privacy or shares with a committed partner (seed ${seed})`);
  }
  assert.ok(RESIDENTS.some((r) => `${sim.people[r.id].home}:${sim.people[r.id].house}` !== original[r.id]), 'new addresses are observable in the real simulation');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-5, 'moves and purchases conserve the town’s money');
}
for (const phase of ['packing', 'carrying', 'unpacking']) {
  assert.ok(snapshots[phase], `the simulation exercised ${phase}`);
  const a = loadState(snapshots[phase]), b = loadState(saveState(a));
  catchUp(a, a.t + 30, 30); catchUp(b, b.t + 30, 30);
  assert.equal(saveState(a), saveState(b), `${phase} resumes identically after saving`);
}

// Rain pauses an actual booked move; it does not silently finish a stage or
// change the address while the resident returns to their ordinary day.
{
  const sim = loadState(snapshots.packing), move = sim.housing.moves[0], before = JSON.stringify(move.progress), from = structuredClone(move.from);
  sim.today.weather = { kind: 'rain' }; sim.housing.next = sim.t + 60;
  catchUp(sim, sim.t + 10, 30);
  assert.equal(JSON.stringify(move.progress), before);
  for (const id of move.members) assert.deepEqual({ loc: sim.people[id].home, house: sim.people[id].house }, from[id]);
}

// Partners finish their previously agreed leisure, then keep one fixed moving
// appointment. Different new leisure deadlines must not leave both waiting.
{
  const sim = createSim(7, 1080);
  sim.couples['hana:kenji'] = { stage: 'together', since: 0, day: 0, togetherDay: 0 };
  sim.rel['hana:kenji'] = 99;
  for (const id of ['hana', 'kenji']) sim.people[id].needs = { food: 95, energy: 95, fun: 90 };
  let booked;
  for (let n = 0; n < 3 * 1440 * 4; n++) {
    catchUp(sim, sim.t + 0.25, 30);
    const move = sim.housing.moves.find((m) => m.members.includes('hana'));
    if (move && !booked) booked = { ready: move.ready, booked: move.booked };
    if (booked && sim.housing.history.some((m) => m.members.includes('hana') && m.members.includes('kenji'))) break;
  }
  assert.ok(booked && booked.ready >= booked.booked, 'partners agree when to start after their commitments');
  assert.equal(sim.people.hana.home, sim.people.kenji.home);
  assert.equal(sim.people.hana.house, sim.people.kenji.house);
  assert.deepEqual(housematesOf(sim, 'hana').map((r) => r.id), ['kenji']);
  assert.ok(sim.housing.history.some((m) => m.members.length === 2), 'both partners actually unpack in their private home');
}

// Older version-seven towns gain vacancies without changing an existing home,
// wallet, plant, pantry or relationship on load.
{
  const sim = createSim(7, 1080), raw = JSON.parse(saveState(sim)); delete raw.housing;
  const restored = loadState(JSON.stringify(raw));
  assert.ok(restored && Object.keys(restored.housing.properties).length === Object.values(HOUSES).flat().length);
  for (const r of RESIDENTS) for (const field of ['home', 'house', 'money', 'pot', 'pantry']) assert.equal(restored.people[r.id][field], raw.people[r.id][field]);
  assert.deepEqual(restored.rel, raw.rel);
}

// Ownership is earned through the actual purchase path. No test-only grants or
// success branches are used; the town runs its ordinary wages, spending and chores.
{
  const sim = createSim(7, 330), total = wealth(sim);
  catchUp(sim, sim.t + 14 * 1440, 30);
  const owned = Object.entries(sim.housing.properties).filter(([, p]) => p.owner);
  assert.ok(owned.length >= 3, 'residents save and buy their homes');
  assert.ok(owned.every(([, p]) => Number.isFinite(p.bought)));
  assert.ok(Math.abs(wealth(sim) - total) < 1e-5, 'purchase money reaches the treasury without creating or deleting currency');
  // an owner who could cover rent, so the renter copy pays it in full rather than scraping part of it
  const [unit, title] = owned.find(([, p]) => RESIDENTS.find((r) => r.id === p.owner).wage > 0 && propertyOf(sim, p.owner) === p && sim.people[p.owner].money > 2100);
  assert.ok(unit && title);
  // Compare the same resident's next midnight with and without the title.
  const midnight = (Math.floor(sim.t / 1440) + 1) * 1440;
  catchUp(sim, midnight - 1 / 60, 30);
  const renter = loadState(saveState(sim)); renter.housing.properties[unit].owner = null;
  sim.housing.next = renter.housing.next = midnight + 60;
  const id = title.owner, r = RESIDENTS.find((r) => r.id === id), p = partnerOf(sim, id);
  step(sim, 1 / 30); step(renter, 1 / 30);
  const rent = ({ homes: 2100, willow: 1700, farmhouse: 1500, cabin: 1500, clover: 1500, blossom: 1500, maple: 1500 })[sim.people[id].home] / (p?.stage === 'together' ? 2 : 1);
  assert.ok(Math.abs(sim.people[id].money - renter.people[id].money - rent) < 1e-6, `${r.name} pays no rent on their purchased home`);
  assert.equal(propertyOf(sim, id).owner, id);
  assert.ok(HOME_PRICE > 0);
}
console.log('housing ok — physical cottages, private households, real moving stages, saved reservations, weather, purchases and rent');
