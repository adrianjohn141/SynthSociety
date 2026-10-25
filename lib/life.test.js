import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, RESIDENTS, spot } from './sim.js';

const wealth = (sim) => Object.values(sim.people).reduce((n, s) => n + s.money, 0) + Object.values(sim.tills).reduce((a, b) => a + b, 0);

for (const seed of [1, 7, 42]) {
  for (const [need, level, act, recovered] of [['energy', 21, 'Rest break', 50], ['food', 34, 'Meal break', 85]]) {
    const sim = createSim(seed, 10 * 60), s = sim.people.kenji;
    s.needs[need] = level;
    s.shiftPay = 123;
    const total = wealth(sim);
    step(sim, 1 / 60); // notice the need through the real needs update
    step(sim, 1 / 60);
    assert.equal(s.act, act, `critical ${need} interrupts work (seed ${seed})`);
    assert.ok(s.shiftPay >= 123, 'a break preserves wages already earned in this shift');
    const copy = loadState(saveState(sim));
    for (let second = 0; second < 45 * 60; second++) { step(sim, 1 / 60); step(copy, 1 / 60); }
    assert.ok(s.work && s.target === 'teahouse', `returns to work after ${act} (seed ${seed})`);
    assert.ok(s.needs[need] > recovered, `${act} restores ${need} (seed ${seed})`);
    assert.ok(Math.abs(wealth(sim) - total) < 1e-6, 'breaks conserve the town economy');
    assert.equal(saveState(copy), saveState(sim), 'an active break resumes identically after saving');
  }

  const evening = createSim(seed, 18 * 60);
  let arrivals = 0, rests = 0;
  for (let second = 0; second < 15 * 60; second++) {
    const before = Object.fromEntries(RESIDENTS.map((r) => {
      const s = evening.people[r.id];
      return [r.id, { task: s.task, reached: s.task?.reached }];
    }));
    step(evening, 1 / 60);
    for (const r of RESIDENTS) {
      const s = evening.people[r.id], task = s.task;
      if (s.work || !task?.reached || task !== before[r.id].task || before[r.id].reached) continue;
      arrivals++;
      const remaining = s.nextAct - evening.t;
      // Arrival can occur in any collision sub-step within this one-second step.
      assert.ok(remaining >= task.duration - 1 / 60 - 1e-8 && remaining <= task.duration + 1e-8, 'the full activity duration starts after arrival');
      if (task.anim === 'sit') {
        rests++;
        assert.ok(task.duration >= 5, 'sitting gives residents at least five minutes of rest');
      }
    }
  }
  assert.ok(arrivals >= 10 && rests > 0, `residents settle into visits and seats (seed ${seed})`);
}

// The same workplace is not enough for a conversation: people must be close and stationary.
for (const mode of ['nearby', 'far', 'walking']) {
  const sim = createSim(7, 9 * 60);
  // Let the real opening routine finish before isolating stationary workers.
  // Otherwise their first action is correctly to walk to their preparation spot.
  for (let second = 0; second < 15 * 60; second++) step(sim, 1 / 60);
  assert.ok(sim.people.yumi.shiftLife.prep >= 4 && sim.people.haru.shiftLife.prep >= 4);
  sim.pendingChats = [];
  for (const s of Object.values(sim.people)) {
    s.hidden = true;
    s.task = { inside: true, reached: true };
    s.nextAct = sim.t + 60;
    s.bubble = null;
    s.chatUntil = 0;
  }
  for (const [id, index] of [['yumi', 0], ['haru', mode === 'far' ? 4 : 1]]) {
    const s = sim.people[id], p = spot('shrine', index);
    Object.assign(s, p, { hidden: false, target: 'shrine', at: 'shrine', task: { anim: 'sweep', reached: true }, goal: p, from: p, path: [], walking: false });
  }
  if (mode === 'walking') {
    const s = sim.people.haru;
    s.path = [{ x: s.x + 8, z: s.z }];
    s.goal = s.path[0];
    s.walking = true;
  }
  const before = sim.rel['haru:yumi'];
  for (let attempt = 0; attempt < 40; attempt++) {
    sim.socialTimer = 3;
    step(sim, 1 / 600);
  }
  if (mode === 'nearby') assert.notEqual(sim.rel['haru:yumi'], before, 'nearby residents can socialize');
  else assert.equal(sim.rel['haru:yumi'], before, `${mode} residents do not have remote conversations`);
}
console.log('daily life ok — arrival-based activities, restorative work breaks, local conversations and saved continuity');
