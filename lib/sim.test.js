import assert from 'node:assert/strict';
import { onIsland } from './world.js';
import { createSim, step, catchUp, alignClock, clockOf, saveState, loadState, festivalNow, overlap, RESIDENTS, LOC, DISTRICTS } from './sim.js';

// Breakfast must finish before a resident leaves; crossing the starting threshold
// by a tiny amount used to make them reverse course every few walking steps.
for (const seed of [1, 7, 42]) {
  const morning = createSim(seed, 7.5 * 60);
  const eaters = RESIDENTS.filter((r) => r.hours[0] > 7.5 && morning.people[r.id].act !== 'Sleeping');
  const visits = Object.fromEntries(eaters.map((r) => [r.id, 0]));
  const eating = {};
  for (const r of eaters) morning.people[r.id].needs.food = 84.99;
  // Allow a service queue plus cooking at home when the kitchen cannot serve.
  // The full interval still requires exactly one breakfast, with no reversals.
  for (let second = 0; second < 25 * 60; second++) {
    step(morning, 1 / 60);
    for (const r of eaters) {
      const now = morning.people[r.id].act === 'Having breakfast';
      if (now && !eating[r.id]) visits[r.id]++;
      eating[r.id] = now;
    }
  }
  for (const r of eaters) {
    const s = morning.people[r.id];
    assert.equal(visits[r.id], 1, `${r.id} has one uninterrupted breakfast (seed ${seed})`);
    assert.ok(!eating[r.id], `${r.id} finishes breakfast (seed ${seed})`);
    assert.ok(s.needs.food > 85, `${r.id} leaves breakfast satisfied (seed ${seed})`);
  }
}

// Crowds cannot push seated residents away from their chairs, even after reloading.
for (const restored of [false, true]) {
  let evening = createSim(7, 18 * 60);
  let seatedTicks = 0;
  for (let second = 0; second < 60 * 60; second++) {
    step(evening, 1 / 60);
    if (restored && second === 1800) evening = loadState(saveState(evening));
    for (const r of RESIDENTS) {
      const s = evening.people[r.id];
      if (!s.task?.reached || s.task.anim !== 'sit') continue;
      seatedTicks++;
      assert.ok(Math.hypot(s.x - s.goal.x, s.z - s.goal.z) < 1e-6, `${r.id} stays on the seat (restored ${restored})`);
    }
  }
  assert.ok(seatedTicks > 0, 'the evening exercises occupied seats');
}

// starts on Saturday 4 April 2026, so the run includes a Lantern Festival evening
const sim = createSim();
const startRel = { ...sim.rel };
const startMoney = Object.fromEntries(RESIDENTS.map((r) => [r.id, sim.people[r.id].money]));
const wealth = (s) => RESIDENTS.reduce((m, r) => m + s.people[r.id].money, 0) + Object.values(s.tills).reduce((a, b) => a + b, 0);
const total = wealth(sim);
const visited = new Set();
let checkedNight = false, checkedWork = false, checkedFestival = false, closest = Infinity, wanted = 0, busy = 0, awakeTicks = 0, doors = 0, solid = 0;
const wasHidden = {};
const SEC = 1 / 60; // real-time sim: step one second at a time

for (let i = 0; i < 3 * 1440 * 60; i++) {
  step(sim, SEC);
  const { h } = clockOf(sim);
  const awake = RESIDENTS.map((r) => sim.people[r.id]).filter((s) => !s.hidden);
  for (let a = 0; a < awake.length; a++)
    for (let b = a + 1; b < awake.length; b++) closest = Math.min(closest, Math.hypot(awake[a].x - awake[b].x, awake[a].z - awake[b].z));
  for (const r of RESIDENTS) {
    const s = sim.people[r.id];
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z), `${r.id} position`);
    assert.ok(onIsland(s.x, s.z, 0.35), `${r.id} stays on the island`);
    if (s.at) visited.add(LOC[s.at].district);
    assert.ok(s.money >= 0, `${r.id} never goes into debt`);
    for (const v of Object.values(s.needs)) assert.ok(v >= 0 && v <= 100, `${r.id} needs in range`);
    if (s.wants) wanted++;
    if (!s.hidden) { if (sim.t >= s.squeeze) solid = Math.max(solid, overlap(s)); awakeTicks++; if (s.walking || (s.task?.reached && s.task.anim !== 'idle')) busy++; }
    if (h > 8 && h < 20 && wasHidden[r.id] !== undefined && wasHidden[r.id] !== s.hidden) doors++;
    wasHidden[r.id] = s.hidden;
  }
  if (i % 60 === 0 && Math.abs(h - 3) < 1e-6) {
    checkedNight = true;
    let sleepers = 0;
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (r.id === 'akira' || r.id === 'fumi') continue;
      assert.ok(s.hidden && s.at === s.home, `${r.id} asleep at 3am`);
      sleepers++;
    }
    assert.ok(sleepers >= RESIDENTS.length * 0.75, 'most residents sleep while the night watch and early baker are on duty');
  }
  if (i % 60 === 0 && Math.abs(h - 10.5) < 1e-6) {
    checkedWork = true;
    assert.equal(sim.people.hana.at, 'bakery');
    assert.equal(sim.people.sora.at, 'library');
  }
  if (i % 60 === 0 && clockOf(sim).day === 1 && Math.abs(h - 19.75) < 1e-6) {
    checkedFestival = true;
    assert.ok(festivalNow(sim));
    const there = RESIDENTS.filter((r) => sim.people[r.id].at && LOC[sim.people[r.id].at].district === 'pleasure').length;
    assert.ok(there >= 7, `the festival draws a crowd (${there})`);
  }
}

assert.ok(checkedNight && checkedWork && checkedFestival);
// bodies are 0.7 apart at rest; a walker squeezing past someone at a counter or against a wall can overlap for a moment
assert.ok(closest > 0.1, `residents never overlap (closest ${closest.toFixed(2)})`);
// buildings, stalls, benches and lanterns are solid; a crowd can squeeze someone against one for a moment, but never into it (except a walker wedged in a nook, who squeezes past for a moment)
assert.ok(solid < 0.35, `nobody walks through things (deepest ${solid.toFixed(2)})`);
assert.equal(clockOf(sim).day, 4);
for (const v of Object.values(sim.rel)) assert.ok(v >= -100 && v <= 100);
assert.ok(Object.keys(sim.rel).some((k) => sim.rel[k] > startRel[k]), 'relationships grow');
assert.ok(Object.keys(sim.rel).some((k) => sim.rel[k] < startRel[k]), 'and sometimes sour');
assert.ok(wanted > 0, 'hunger or tiredness changes plans');
assert.ok(busy / awakeTicks > 0.5, `people out and about are walking, working, shopping or sitting (${Math.round((100 * busy) / awakeTicks)}% of the time)`);
assert.ok(doors > 300, `people go in and out of buildings during the day (${doors} times)`);
// money only changes hands: wages, purchases, gifts and rent move it between wallets and tills
assert.ok(Math.abs(wealth(sim) - total) < 1e-3, `money is conserved (${wealth(sim) - total})`);
assert.ok(sim.people.hana.earned > 20000, `wages are paid (${Math.round(sim.people.hana.earned)})`);
assert.ok(sim.people.riku.money < startMoney.riku, 'the student still pays living costs');
const diary = RESIDENTS.flatMap((r) => sim.people[r.id].diary.map((e) => e.text));
assert.ok(diary.some((t) => t.startsWith('Paid ')), 'rent is due each night');
for (const r of RESIDENTS) assert.ok(sim.people[r.id].diary.length > 5, `${r.id} keeps a diary`);
assert.ok(!diary.some((t) => t.includes('Day ')) && /^\d\d:\d\d$/.test(sim.people.hana.diary[0].when), 'diary shows time of day only');
assert.equal(Object.keys(LOC).length, 21);
assert.equal(visited.size, DISTRICTS.length, 'residents travel between all districts');

// save and restore: the copy carries on exactly like the original
const copy = loadState(saveState(sim));
assert.ok(copy, 'save loads');
for (let i = 0; i < 600; i++) { step(sim, SEC); step(copy, SEC); }
assert.equal(saveState(copy), saveState(sim), 'restored town continues identically');
assert.equal(loadState('{"version":3}'), null, 'old saves are ignored');
assert.equal(loadState('not json'), null);

// a long absence fast-forwards
const t0 = copy.t;
catchUp(copy, t0 + 1440 * 5);
assert.ok(copy.t >= t0 + 1440 * 5 - 1e-9);
for (const r of RESIDENTS) assert.ok(Number.isFinite(copy.people[r.id].x) && onIsland(copy.people[r.id].x, copy.people[r.id].z, 0.35), `${r.id} fine after catch-up`);
assert.ok(Math.abs(wealth(copy) - total) < 1e-3, 'catch-up conserves money');

const couples = Object.entries(sim.couples).map(([k, c]) => `${k} ${c.stage}`);
console.log('sim ok — closest pair', closest.toFixed(2), '— couples:', couples.join(', ') || 'none',
  '— tills:', Object.entries(sim.tills).map(([k, v]) => `${k} ${Math.round(v)}`).join(' '));
console.log(RESIDENTS.map((r) => `${r.id} ${Math.round(sim.people[r.id].money)}`).join(' '));
console.log(sim.people.hana.diary.slice(0, 6).map((e) => `${e.when}: ${e.text}`).join(' | '));

{ // a town that ran ahead of local time (old pace buttons) snaps back to the device's time of day
  const now = new Date(2026, 9, 23, 22, 30).getTime(), today = new Date(2026, 9, 23).getTime();
  const ahead = createSim(7, 7.5 * 60, today);
  ahead.t = 1440 * 2 + 9 * 60; // day 3, 09:00, though only 22.5 real hours have passed
  alignClock(ahead, now);
  const target = (now - ahead.epoch) / 60000;
  assert.ok(target >= ahead.t && target - ahead.t < 1440, 'it catches up less than a day, never rewinds');
  assert.equal(clockOf({ t: target }).hhmm, '22:30', 'the town clock matches local time again');
  const fine = createSim(7, 7.5 * 60, today), epoch = fine.epoch;
  alignClock(fine, now);
  assert.equal(fine.epoch, epoch, 'a town in step with local time is left alone');
  const shifted = createSim(7, 7.5 * 60, today - 90 * 60000); // epoch pulled 90 minutes early by 4x pace
  shifted.t = (now - shifted.epoch) / 60000; // so it reads 00:00 next day while the device says 22:30
  alignClock(shifted, now);
  const caught = (now - shifted.epoch) / 60000;
  assert.ok(caught >= shifted.t && caught - shifted.t < 1440);
  assert.equal(clockOf({ t: caught }).hhmm, '22:30', 'an epoch off midnight is re-anchored too');
}
