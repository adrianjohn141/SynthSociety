import assert from 'node:assert/strict';
import { createSim, step, catchUp, saveState, loadState, RESIDENTS, PEOPLE, LOC, HOUSES, planFor, overlap } from './sim.js';

const wealth = (s) => Object.values(s.people).reduce((n, p) => n + p.money, 0) + Object.values(s.tills).reduce((a, b) => a + b, 0);
const advance = (s, minutes) => { for (let i = 0; i < Math.round(minutes * 60); i++) step(s, 1 / 60); };

// An ordinary walk across a cottage lane must go around closed entrances.
// Recesses are available only to the real threshold journeys tested below.
for (const [seed, id] of [[1, 'nori'], [7, 'aiko'], [42, 'haru']]) {
  const sim = createSim(seed, 20.25 * 60), l = LOC.maple;
  sim.today.weather = { kind: 'clear' }; sim.today.festival = false;
  sim.projects.forEach((p) => { p.status = 'complete'; }); sim.lifeNext = sim.t + 60;
  const world = ([x, z]) => ({ x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz });
  const start = world([-3.05, 1.9]), goal = world([8.95, -4.7]), s = sim.people[id];
  Object.assign(s, start, { at: 'maple', target: 'maple', goal, from: start, path: [goal], walking: true, ambling: true, hidden: false, wants: null, task: { at: [8.95, -4.7], anim: 'garden', duration: 5, reached: false }, intent: { plan: { loc: 'maple', act: 'Pottering in the garden', flexible: true }, until: sim.t + 60, wet: false } });
  s.needs = { food: 95, energy: 90, fun: 90 };
  let arrived = false;
  for (let second = 0; second < 180; second++) {
    step(sim, 1 / 60);
    if (sim.t >= s.squeeze) assert.ok(overlap(s) < 0.35, 'a passer-by never gets trapped inside a closed doorway');
    if (s.task?.reached) { arrived = true; break; }
  }
  assert.ok(arrived && Math.hypot(s.x - goal.x, s.z - goal.z) < 0.8, `${id} walks around the cottage to the actual garden`);
}

for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 19 * 60);
  sim.today.festival = false; sim.today.weather = { kind: 'clear' };
  sim.projects.forEach((p) => { p.status = 'complete'; });
  sim.lifeNext = sim.t + 60; // no new outing invitations during this focused bath visit
  for (const id of ['aiko', 'hana', 'haru']) {
    const s = sim.people[id], door = LOC.bathhouse.door;
    const allowance = Math.max(0, 6000 - s.money);
    s.money += allowance; sim.tills.town -= allowance;
    Object.assign(s, door, { at: 'bathhouse', target: 'bathhouse', goal: door, path: [], walking: false, hidden: false, task: null, wants: null, needs: { food: 95, energy: 70, fun: 90 }, intent: { plan: { loc: 'bathhouse', act: 'Relaxing in the bath', flexible: true }, until: sim.t + 60, wet: false } });
  }
  const total = wealth(sim), phases = new Set();
  let seenInside = false, seenTravel = false, seenSoak = false;
  for (let second = 0; second < 22 * 60; second++) {
    step(sim, 1 / 60);
    const bathers = ['aiko', 'hana', 'haru'].map((id) => sim.people[id]);
    const slots = bathers.filter((s) => s.bath).map((s) => s.bath.slot);
    assert.equal(new Set(slots).size, slots.length, 'bath places are exclusive');
    for (const s of bathers) {
      phases.add(s.bath?.phase);
      if (s.bath?.phase === 'changing' && s.hidden) seenInside = true;
      if (s.bath?.phase === 'soaking' && s.walking) { seenTravel = true; assert.equal(s.bath.minutes, 0, 'walking to the pool earns no soaking'); }
      if (s.task?.kind === 'bath-soak' && s.task.reached) { seenSoak = true; assert.ok(!s.hidden && s.y < 0, 'a real bather sits partly below the water'); }
    }
    if ([20, 65, 150].includes(second)) {
      const copy = loadState(saveState(sim));
      for (let n = 0; n < 5; n++) { step(sim, 1 / 60); step(copy, 1 / 60); }
      assert.equal(saveState(sim), saveState(copy), 'changing, pool travel and soaking survive saving exactly');
    }
  }
  assert.ok(seenInside && seenTravel && seenSoak && phases.has('resting'), `the complete bath sequence is observed (seed ${seed})`);
  const s = sim.people.aiko;
  assert.ok(s.shopped && s.paid?.bathhouse > 0 && s.bath.minutes >= 18 && s.bathWarmUntil > sim.t);
  s.wants = 'rest'; s.needs.energy = 10;
  step(sim, 1 / 60);
  assert.equal(s.bath, null, 'urgent rest releases the bath reservation');
  assert.ok(s.bathWarmUntil > sim.t, 'the warm towel effect follows an actual completed soak');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-5, 'bath visits and shifts only transfer money');
}

// A genuine version-7 roster gains six neighbours using existing treasury funds.
// Established people, relationships and random state retain their saved values.
{
  const old = createSim(42), added = RESIDENTS.slice(19).map((r) => r.id);
  old.version = 7;
  for (const id of added) delete old.people[id];
  for (const pair of Object.keys(old.rel)) if (pair.split(':').some((id) => added.includes(id))) delete old.rel[pair];
  const total = wealth(old), upgraded = loadState(saveState(old));
  assert.ok(upgraded);
  assert.equal(upgraded.seed, old.seed);
  for (const [id, s] of Object.entries(old.people)) for (const field of ['money', 'earned', 'diary', 'x', 'z', 'home', 'house']) assert.deepEqual(upgraded.people[id][field], s[field]);
  for (const [pair, value] of Object.entries(old.rel)) assert.equal(upgraded.rel[pair], value);
  assert.equal(Object.keys(upgraded.people).length, 25);
  assert.ok(Math.abs(wealth(upgraded) - total) < 1e-6, 'newcomer wallets are funded from the treasury');
  assert.equal(saveState(loadState(saveState(upgraded))), saveState(upgraded), 'the upgrade never repeats funding');
}

for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 0), total = wealth(sim), patrolled = new Set();
  for (let minute = 0; minute < 6 * 60; minute++) {
    catchUp(sim, sim.t + 1);
    const watch = sim.people.akira;
    if (watch.at && watch.work) patrolled.add(watch.at);
  }
  assert.ok(patrolled.size >= 3, 'the watch actually travels between districts');
  assert.ok(sim.people.akira.career.minutes > 60 && sim.people.akira.earned > 0, 'real patrol time earns wages and career progress');
  assert.ok(sim.people.fumi.career.minutes > 60, 'the baker really works before dawn');
  catchUp(sim, 11 * 60);
  assert.equal(planFor(PEOPLE.akira, sim).sleep, true, 'the night watch gets daytime sleep');
  assert.ok(sim.people.akira.hidden && sim.people.akira.at === sim.people.akira.home);
  catchUp(sim, 22.5 * 60);
  for (const id of ['nao', 'chika', 'itsuki']) assert.ok(sim.people[id].work && sim.people[id].at === PEOPLE[id].work, `${id} is actually at the late shift`);
  const sleepers = RESIDENTS.filter((r) => sim.people[r.id].hidden && sim.people[r.id].act === 'Sleeping').length;
  assert.ok(sleepers >= RESIDENTS.length / 2, 'late workers and wanderers remain a minority');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-3, 'night wages, meals and rent conserve the total');
}

// Evening staff need a real shared moving window after the tea service ends.
// Their addresses must change only after observed packing/travel/unpacking.
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 20 * 60);
  sim.today.festival = false; sim.today.weather = { kind: 'clear' };
  sim.projects.forEach((p) => { p.status = 'complete'; });
  sim.lifeNext = sim.t + 60; sim.housing.next = sim.t;
  sim.couples['kenji:mei'] = { stage: 'together', since: sim.t - 3 * 1440, togetherDay: -2 };
  sim.rel['kenji:mei'] = 99;
  sim.people.mei.house = (sim.people.kenji.house + 1) % HOUSES[sim.people.mei.home].length;
  for (const id of ['kenji', 'mei']) {
    const s = sim.people[id], household = sim.households[`${s.home}:${s.house}`];
    s.needs = { food: 95, energy: 90, fun: 90 }; s.wants = null; s.intent = null; s.meal = null;
    household.laundry = null; household.chore = null; household.tidiness = 100; household.dirtyLaundry = 0;
  }
  assert.notEqual(sim.people.kenji.house, sim.people.mei.house);
  advance(sim, 45);
  assert.equal(sim.people.kenji.home, sim.people.mei.home);
  assert.equal(sim.people.kenji.house, sim.people.mei.house);
  assert.ok(sim.housing.history.some((m) => m.members.includes('kenji') && m.members.includes('mei')), 'late staff finish the actual shared move before bedtime');
}

// Opposite shifts cannot require both partners to be free in the same tick.
// Each still does real work on every stage; only completed stages may advance.
{
  const sim = createSim(7, 15 * 60), total = wealth(sim);
  sim.couples['kenji:nao'] = { stage: 'together', since: sim.t - 3 * 1440, togetherDay: -2 };
  sim.rel['kenji:nao'] = 99; sim.housing.next = sim.t; sim.lifeNext = sim.t + 6 * 1440;
  for (const id of ['kenji', 'nao']) {
    const s = sim.people[id], household = sim.households[`${s.home}:${s.house}`];
    s.needs = { food: 95, energy: 95, fun: 90 }; s.wants = null; s.intent = null; s.meal = null;
    household.laundry = null; household.chore = null; household.tidiness = 100; household.dirtyLaundry = 0;
  }
  const observed = new Set();
  for (let tick = 0; tick < 5 * 1440 * 4; tick++) {
    sim.today.weather = { kind: 'clear' }; sim.today.festival = false;
    sim.projects.forEach((p) => { p.status = 'complete'; });
    catchUp(sim, sim.t + 0.25);
    for (const id of ['kenji', 'nao']) {
      const s = sim.people[id];
      if (s.task?.kind?.startsWith('move-') && s.task.reached && !s.walking) observed.add(`${id}:${s.task.kind}`);
    }
    if (sim.housing.history.some((m) => m.members.includes('kenji') && m.members.includes('nao'))) break;
  }
  for (const id of ['kenji', 'nao']) for (const stage of ['packing', 'carrying', 'unpacking']) assert.ok(observed.has(`${id}:move-${stage}`), `${id} actually completes ${stage} around their shift`);
  assert.equal(sim.people.kenji.home, sim.people.nao.home);
  assert.equal(sim.people.kenji.house, sim.people.nao.house);
  assert.ok(Math.abs(wealth(sim) - total) < 1e-4);
}
console.log('living polish ok — real bath phases, exclusive spots, saved continuity, funded newcomers, patrols, early baking and late shifts');
