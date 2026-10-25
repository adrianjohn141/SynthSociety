import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, RESIDENTS, experienceOf } from './sim.js';
import { serviceFactor } from './work-life.js';

const run = (sim, minutes) => { for (let second = 0; second < minutes * 60; second++) step(sim, 1 / 60); };
const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);
const snapshots = new Map();
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 5.75 * 60), total = wealth(sim);
  for (let second = 0; second < 11 * 60 * 60; second++) {
    step(sim, 1 / 60);
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (['work-open', 'work-close'].includes(s.task?.kind) && !snapshots.has(s.task.kind)) snapshots.set(s.task.kind, saveState(sim));
      assert.ok(s.career.minutes >= 0 && s.career.customers >= 0 && s.career.recent.length <= 5);
    }
  }
  assert.ok(sim.people.hana.career.minutes > 300 && sim.people.hana.career.customers > 0, `the baker actually works and serves customers (seed ${seed})`);
  const recent = sim.people.hana.career.recent[0];
  assert.ok(recent.minutes > 300 && recent.breakMinutes > 0 && recent.customers > 0, 'the shift summary includes real work, a break and customers');
  assert.ok(sim.people.hana.diary.some((entry) => entry.text.includes('minutes on duty')));
  assert.ok(Math.abs(wealth(sim) - total) < 1e-4, 'workday routines preserve payroll and money conservation');
}
for (const phase of ['work-open', 'work-close']) {
  assert.ok(snapshots.has(phase));
  const sim = loadState(snapshots.get(phase)), copy = loadState(saveState(sim));
  run(sim, 15); run(copy, 15);
  assert.equal(saveState(sim), saveState(copy), `${phase} resumes without repeating the shift`);
}
{
  const sim = loadState(snapshots.get('work-open'));
  const r = RESIDENTS.find((person) => sim.people[person.id].task?.kind === 'work-open');
  const s = sim.people[r.id], prep = s.shiftLife.prep;
  s.needs.food = 20; s.wants = 'food';
  step(sim, 1 / 60);
  assert.equal(s.shiftLife.prep, prep, 'a meal break does not count as workstation preparation');
}
{
  const newcomer = { career: { minutes: 0 } }, experienced = { career: { minutes: 120 * 60 } };
  assert.notEqual(experienceOf(newcomer), experienceOf(experienced));
  assert.ok(serviceFactor(experienced) < serviceFactor(newcomer) && serviceFactor(experienced) >= 0.75, 'actual practice modestly improves preparation speed');
}

// Exercise the real kitchen queue with two saved experience levels. Practice
// changes the worker's preparation interval, not the food quote or nutrition.
function servedMeal(hours) {
  const sim = createSim(7, 10 * 60), eater = sim.people.riku;
  for (const s of Object.values(sim.people)) s.career.minutes = hours * 60;
  eater.needs.food = 20; eater.wants = 'food';
  eater.foodAvoid.market = eater.foodAvoid.teahouse = sim.t + 60;
  let started;
  for (let second = 0; second < 30 * 60; second++) {
    step(sim, 1 / 60);
    if (eater.meal?.phase === 'serving') started ??= sim.t;
    if (started && eater.meal?.phase === 'eating') return { minutes: sim.t - started, price: eater.meal.price, remaining: eater.meal.remaining, loc: eater.meal.loc };
  }
  assert.fail('the resident should receive a real meal');
}
const noviceMeal = servedMeal(0), skilledMeal = servedMeal(120);
assert.equal(noviceMeal.loc, 'bakery');
assert.equal(skilledMeal.loc, noviceMeal.loc);
assert.equal(skilledMeal.price, noviceMeal.price);
assert.ok(skilledMeal.minutes < noviceMeal.minutes - 0.03, 'the experienced baker actually finishes serving sooner');
assert.ok(Math.abs(skilledMeal.remaining - noviceMeal.remaining) < 0.2, 'practice does not reduce the meal');
console.log('work life ok — preparation, service, closing, breaks, practice, shift summaries, saved continuity and conserved wages');
