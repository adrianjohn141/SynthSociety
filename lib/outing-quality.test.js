import assert from 'node:assert/strict';
import { createSim, step } from './sim.js';

function date() {
  const sim = createSim(7, 17.5 * 60);
  sim.today.festival = false;
  sim.couples['riku:sora'] = { stage: 'dating', since: sim.t, dates: 0 };
  for (const id of ['riku', 'sora']) { sim.people[id].wants = null; sim.people[id].needs = { food: 90, energy: 90, fun: 90 }; }
  sim.outings.push({ id: 'agreed-date', host: 'riku', guest: 'sora', loc: 'boardwalk', kind: 'sit', date: true, status: 'together', start: sim.t, deadline: sim.t + 10, ends: sim.t + 0.05, minutes: 0, leg: 0 });
  return sim;
}
{
  const sim = date();
  for (let second = 0; second < 5; second++) step(sim, 1 / 60);
  assert.equal(sim.outings[0].status, 'cancelled');
  assert.equal(sim.couples['riku:sora'].dates, 0, 'time apart does not become a completed date');
  assert.ok(!sim.people.riku.diary.some((entry) => entry.text.includes('proper date')));
}
{
  const sim = date();
  sim.outings[0].ends = sim.t + 30;
  delete sim.couples['riku:sora'];
  step(sim, 1 / 60);
  assert.equal(sim.outings[0].status, 'cancelled', 'former partners stop a scheduled romantic outing');
}
console.log('outing quality ok — dates require real time together and end when a relationship ends');
