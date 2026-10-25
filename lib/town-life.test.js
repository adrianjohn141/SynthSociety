import assert from 'node:assert/strict';
import { createSim, step, catchUp, saveState, loadState, planFor, priceAt, shopOpen, personalityOf, queueAt, clockOf, RESIDENTS, PEOPLE, LOC, LOCATIONS, spot } from './sim.js';

const wealth = (s) => Object.values(s.people).reduce((n, p) => n + p.money, 0) + Object.values(s.tills).reduce((a, b) => a + b, 0);
const run = (sim, minutes) => { for (let i = 0; i < minutes * 60; i++) step(sim, 1 / 60); };

// Staff breaks are staggered around the earliest ending shift, keeping an
// actual colleague on duty through both halves of the lunch period.
for (const [loc, times] of [['teahouse', [12.25, 12.75]], ['market', [11.25, 11.75]]]) {
  for (const h of times) {
    const sim = createSim(7, h * 60);
    const staff = RESIDENTS.filter((r) => r.work === loc).map((r) => planFor(r, sim));
    assert.ok(shopOpen(sim, loc) && staff.some((p) => p.work) && staff.some((p) => p.break), `${loc} stays staffed while colleagues eat at ${h}`);
  }
}

// Food is obtained through real service, payment and eating, never by standing
// near a food shop. An active order resumes through exactly the same lifecycle.
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 10 * 60), s = sim.people.kenji;
  s.needs.food = 34;
  const stages = new Set();
  let copy, paid = false;
  const total = wealth(sim);
  for (let second = 0; second < 30 * 60; second++) {
    const before = s.needs.food;
    const beforeMoney = s.money;
    step(sim, 1 / 60);
    if (copy) step(copy, 1 / 60);
    if (s.meal) stages.add(s.meal.phase);
    if (s.meal?.phase === 'queue' && !copy) {
      assert.ok(s.needs.food <= before, 'waiting at a food venue does not restore hunger');
      copy = loadState(saveState(sim));
    }
    if (s.meal?.phase === 'serving') assert.ok(s.needs.food <= before, 'being served does not count as eating');
    if (s.meal?.phase === 'eating' && s.meal.price > 0 && !paid) {
      assert.equal(s.money, beforeMoney - s.meal.price, 'the current meal quote is paid exactly once after service');
      paid = true;
    }
  }
  assert.ok(paid && ['queue', 'serving', 'eating'].every((v) => stages.has(v)) && s.diary.some((v) => v.text.startsWith('Finished a satisfying meal')), `complete meal lifecycle (seed ${seed})`);
  assert.ok(s.needs.food > 85, 'eating the purchased meal restores hunger');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-6, 'service only transfers money');
  assert.equal(saveState(copy), saveState(sim), 'saved queues and meals continue identically');

  const poor = createSim(seed, 10 * 60), p = poor.people.kenji;
  p.money = 0; p.needs.food = 34;
  const poorTotal = wealth(poor);
  const homeStages = new Set();
  for (let second = 0; second < 25 * 60; second++) { step(poor, 1 / 60); if (p.meal) homeStages.add(p.meal.phase); }
  // Completion may return the worker to work within the same collision step,
  // clearing the active meal. Its persisted diary is the completion evidence.
  assert.ok(homeStages.has('cooking') && homeStages.has('eating') && p.diary.some((v) => v.text === `Finished a satisfying meal at ${LOC[p.home].name}.`), 'an unaffordable meal is cooked and eaten at home');
  assert.ok(p.needs.food > 85 && p.money >= 0, 'a resident can eat without going into debt');
  assert.ok(Math.abs(wealth(poor) - poorTotal) < 1e-6, 'home cooking creates no money');
}

// Four saved orders compete for the actual single bakery counter and baker.
// The original joining order must be preserved through service and payment.
{
  const sim = createSim(7, 10 * 60), ids = ['kenji', 'riku', 'jun', 'mei'];
  const price = priceAt(sim, 'bakery');
  for (const [i, id] of ids.entries()) {
    const s = sim.people[id], p = spot('bakery', i);
    Object.assign(s, p, { at: 'bakery', target: 'bakery', goal: p, from: p, path: [], hidden: false, task: null, nextAct: sim.t, wants: 'food', shopped: false });
    s.needs.food = 34;
    s.meal = { loc: 'bakery', phase: 'queue', joined: sim.t + i * 0.001, remaining: 65, price, portion: 'full' };
  }
  const served = [], seen = new Set();
  assert.equal(queueAt(sim, 'bakery').length, 4);
  for (let second = 0; second < 12 * 60; second++) {
    step(sim, 1 / 60);
    for (const id of ids) if (!seen.has(id) && sim.people[id].meal?.phase === 'eating') { seen.add(id); served.push(id); }
  }
  assert.deepEqual(served, ids, 'one counter serves customers in joining order');
}

// A purchase recorded by an older town must not leave a hungry customer stuck
// forever in the same shop when hunger is now tied to actual meals.
{
  const sim = createSim(7, 10 * 60), s = sim.people.kenji, p = spot('bakery', 1);
  Object.assign(s, p, { at: 'bakery', target: 'bakery', goal: p, path: [], task: null, hidden: false, shopped: true, wants: 'food', meal: null });
  s.needs.food = 34;
  run(sim, 25);
  assert.ok(s.needs.food > 85 && s.diary.some((v) => v.text.startsWith('Finished a satisfying meal')), 'legacy purchases do not prevent restorative meals');
}

// Intentions survive a half-hour boundary; critical needs still interrupt them.
{
  const sim = createSim(7, 18.25 * 60), s = sim.people.sora;
  sim.today.festival = false; sim.today.weather = { kind: 'clear' };
  for (const p of Object.values(sim.people)) p.lastInviteDay = clockOf(sim).day;
  s.intent = null; s.needs.food = 95; s.needs.energy = 90;
  step(sim, 1 / 60);
  const target = s.target;
  assert.ok(s.intent.plan.flexible && s.intent.until > 18.5 * 60);
  run(sim, 6);
  assert.equal(s.target, target, 'an agreed activity is not replaced at the half-hour boundary');
  s.needs.energy = 21;
  step(sim, 1 / 60); step(sim, 1 / 60);
  assert.equal(s.target, s.home, 'urgent rest overrides a leisure commitment');
}

// Learned preferences change actual destination choices; profiles are stable
// across saves and across new towns, independent of transient RNG state.
{
  let influenced = 0;
  const sim = createSim(7, 18.25 * 60), r = PEOPLE.sora, s = sim.people.sora;
  sim.today.festival = false; sim.today.weather = { kind: 'clear' };
  s.needs.food = 95; s.intent = null;
  for (const l of LOCATIONS) {
    s.memories.places = { [l.id]: { value: -10, visits: 3, when: sim.t } };
    const avoid = planFor(r, sim).loc;
    s.memories.places[l.id].value = 10;
    if (planFor(r, sim).loc !== avoid) influenced++;
  }
  assert.ok(influenced >= 3, 'positive and negative visit memories influence multiple destination choices');
  assert.deepEqual(personalityOf(sim, r.id), personalityOf(loadState(saveState(sim)), r.id));
  assert.deepEqual(s.traits, createSim(42).people.sora.traits, 'personality belongs to a resident, not the random run');
}

// Outdoor workers shelter and continue useful paid preparation, then return.
{
  const sim = createSim(7, 9 * 60), s = sim.people.yumi, earned = s.earned;
  sim.today.weather = { kind: 'rain', from: 0, to: 24 };
  step(sim, 1 / 60);
  assert.equal(s.act, 'Doing indoor preparation');
  assert.notEqual(s.target, 'shrine');
  run(sim, 5);
  assert.ok(s.hidden && s.work && s.earned > earned, 'sheltered preparation is real work');
  sim.today.weather = { kind: 'clear' };
  step(sim, 1 / 60);
  assert.equal(s.target, 'shrine', 'the outdoor routine resumes when the rain ends');
  sim.today.weather = { kind: 'rain', from: 0, to: 24 };
  sim.t = Math.floor(sim.t / 1440) * 1440 + 12.25 * 60;
  assert.equal(planFor(PEOPLE.yumi, sim).act, 'Lunch break', 'outdoor staff still take their scheduled lunch break on rainy days');
}

// A missed agreement records disappointment without inventing time together.
{
  const sim = createSim(7, 18.25 * 60);
  sim.today.festival = false;
  for (const p of Object.values(sim.people)) p.lastInviteDay = clockOf(sim).day;
  for (const [i, id] of ['sora', 'riku'].entries()) {
    const s = sim.people[id], p = spot('willow', i);
    Object.assign(s, p, { at: 'willow', target: 'willow', goal: p, path: [], task: null, hidden: false, wants: null });
    s.needs.food = 95; s.needs.energy = 90;
  }
  const rel = sim.rel['riku:sora'];
  sim.outings.push({ id: 'late-meeting', host: 'sora', guest: 'riku', loc: 'library', kind: 'sit', status: 'invited', start: sim.t, deadline: sim.t + 1 / 60, minutes: 0, leg: 0 });
  run(sim, 1);
  assert.equal(sim.outings[0].status, 'missed');
  assert.equal(sim.outings[0].minutes, 0);
  assert.equal(sim.rel['riku:sora'], rel, 'a missed meeting earns no affinity');
  assert.ok(sim.people.sora.memories.people.riku.value < 0);
}

// Evolve nine actual days: all three projects must be prepared by their assigned
// residents before their events happen, alongside autonomous social outings.
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 5 * 60), total = wealth(sim);
  catchUp(sim, sim.t + 12 * 1440, 15);
  for (const kind of ['performance', 'garden', 'market', 'waterfront']) {
    const project = sim.projects.find((p) => p.kind === kind && p.status === 'complete');
    assert.ok(project, `${kind} is prepared and held autonomously (seed ${seed})`);
    assert.ok(project.roles.every((r) => r.done === r.need), 'the event requires every contribution');
  }
  for (const kind of ['walk', 'sit']) assert.ok(sim.outings.some((o) => o.kind === kind && o.status === 'complete' && o.minutes >= 3), `residents arrange and complete ${kind} outings`);
  for (const p of Object.values(sim.people)) assert.ok(p.memories.events.length <= 12 && Number.isFinite(p.x) && Number.isFinite(p.z));
  assert.ok(sim.harvest.bushels > 0, 'village gardening produces harvest baskets');
  assert.ok(Math.abs(wealth(sim) - total) < 1e-3, 'community life preserves money conservation');
}

// Expand old version-5 saves in place without resetting wallets, relationships,
// diaries, positions or RNG. Repeating the upgrade does not duplicate projects.
{
  const old = createSim(42);
  for (const field of ['lifeVersion', 'lifeNext', 'outings', 'projects']) delete old[field];
  for (const p of Object.values(old.people)) for (const field of ['traits', 'memories', 'intent', 'meal', 'foodAvoid', 'lastInviteDay', 'visit']) delete p[field];
  const raw = saveState(old), upgraded = loadState(raw);
  assert.ok(upgraded);
  assert.equal(upgraded.seed, old.seed);
  assert.deepEqual(upgraded.rel, old.rel);
  for (const r of RESIDENTS) {
    for (const field of ['money', 'diary', 'x', 'z', 'earned']) assert.deepEqual(upgraded.people[r.id][field], old.people[r.id][field]);
  }
  assert.equal(saveState(loadState(saveState(upgraded))), saveState(upgraded), 'save upgrade is idempotent');
}
console.log('town life ok — service/queues, budgets, commitments, memories, weather, real outings, all community stories and compatible saves');
