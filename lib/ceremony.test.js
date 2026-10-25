import assert from 'node:assert/strict';
import { createSim, step, catchUp, clockOf, saveState, loadState, RESIDENTS } from './sim.js';

const run = (sim, minutes) => { for (let second = 0; second < minutes * 60; second++) step(sim, 1 / 60); };
const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);
const engaged = (sim) => {
  sim.couples['hana:kenji'] = { since: 0, stage: 'together', day: -9, togetherDay: -8, engaged: -2 };
  sim.rel['hana:kenji'] = 99;
};

for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 20 * 60); engaged(sim);
  const total = wealth(sim);
  catchUp(sim, 1440 + 15.75 * 60, 2);
  assert.equal(sim.wedding.status, 'planned');
  let snapshot;
  const actual = {};
  for (let second = 0; second < 90 * 60; second++) {
    const wasLive = sim.wedding.status === 'live';
    step(sim, 1 / 60);
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (wasLive && s.at === 'shrine' && !s.walking && !s.hidden && s.task?.reached && s.task.kind?.startsWith('wedding-')) actual[r.id] = (actual[r.id] ?? 0) + 1 / 60;
    }
    if (!snapshot && sim.wedding.vowsAt != null && sim.wedding.status === 'live') snapshot = saveState(sim);
  }
  const w = sim.wedding;
  assert.equal(w.status, 'done', `the couple actually celebrates a ceremony (seed ${seed})`);
  assert.ok(w.togetherMinutes >= 5 && actual.hana >= 5 && actual.kenji >= 5);
  assert.ok(w.vowsAt >= w.start && w.completed >= w.vowsAt + 5);
  assert.ok(sim.couples['hana:kenji'].married);
  for (const id of w.guests) {
    const celebration = sim.people[id].diary.some((entry) => entry.text.startsWith('Celebrated Hana and Kenji'));
    assert.equal(celebration, (w.attendance[id] ?? 0) >= 3, 'only actual attendees receive a ceremony memory');
  }
  assert.ok(Math.abs(wealth(sim) - total) < 1e-4, 'wedding presents transfer money rather than inventing it');
  assert.ok(snapshot, 'the simulation exercised an actual exchange of vows');
  const original = loadState(snapshot), restored = loadState(saveState(original));
  run(original, 75); run(restored, 75);
  assert.equal(saveState(restored), saveState(original), 'attendance, vows and gifts resume identically');
  const paid = original.people.hana.diary.filter((entry) => entry.text.startsWith('Married Kenji')).length;
  run(original, 10);
  assert.equal(original.people.hana.diary.filter((entry) => entry.text.startsWith('Married Kenji')).length, paid, 'completion cannot duplicate marriage or gifts');
}

// A delayed ceremony during the sleeping period cannot marry absent residents.
{
  const sim = createSim(7, 22 * 60); engaged(sim);
  sim.wedding = { couple: 'hana:kenji', start: sim.t, ends: sim.t + 30, guests: ['haru', 'sora'], status: 'planned' };
  run(sim, 50);
  assert.equal(sim.couples['hana:kenji'].married, undefined);
  assert.equal(sim.wedding.status, 'planned');
  assert.equal(sim.wedding.postponements, 1);
  assert.equal(sim.wedding.togetherMinutes, 0);
  assert.ok(sim.wedding.start > sim.t && sim.wedding.start % 1440 === 16 * 60);
  assert.ok(!sim.people.haru.diary.some((entry) => entry.text.startsWith('Celebrated Hana and Kenji')));
  assert.ok(sim.people.hana.diary.some((entry) => entry.text.includes('postponed')));
}

// A broken engagement does not become a wedding when its old timer expires.
{
  const sim = createSim(42, 16 * 60);
  sim.wedding = { couple: 'hana:kenji', start: sim.t, ends: sim.t + 60, guests: ['haru'], status: 'live' };
  delete sim.couples['hana:kenji'];
  step(sim, 1 / 60);
  assert.equal(sim.wedding.status, 'cancelled');
  assert.ok(!sim.news?.some((entry) => entry.kind === 'married'));
}
console.log('ceremonies ok — real vows and attendance, saved continuity, delayed arrivals, cancelled engagements and conserved gifts');
