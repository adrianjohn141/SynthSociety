import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, paceOf, RESIDENTS, LOC } from './sim.js';

const R = (id) => RESIDENTS.find((r) => r.id === id);

// Personal stride: steady Fumi (routine 0.95, curiosity 0.3) outwalks bookish Itsuki (curiosity 0.95), and tiredness slows both.
{
  const sim = createSim(7, 9 * 60), fumi = sim.people.fumi, itsuki = sim.people.itsuki;
  fumi.needs.energy = itsuki.needs.energy = 90;
  assert.ok(paceOf(R('fumi'), fumi) > paceOf(R('itsuki'), itsuki) + 0.08, 'residents walk at their own pace');
  const rested = paceOf(R('fumi'), fumi);
  fumi.needs.energy = 5;
  assert.ok(paceOf(R('fumi'), fumi) < rested * 0.9, 'a tired resident walks slower');
}

// Two residents set off from the same doorstep for the same door home.
function journey(ids) {
  const sim = createSim(7, 9 * 60);
  for (const id of ids) Object.assign(sim.people[id], LOC.library.door, { home: 'maple', house: 0, at: 'library', target: 'library', path: [], hidden: false, task: null, intent: null, wants: 'rest', speed: 0 });
  for (const id of ids) sim.people[id].needs.energy = 10;
  step(sim, 0.0001);
  return sim;
}

// Smooth start and stop: a slow first step, a steady cruise, a slower last approach to an open spot (doorways are walked through).
{
  const sim = journey(['sora']), s = sim.people.sora, moved = [];
  s.path = [LOC.library.entry]; s.goal = LOC.library.entry;
  for (let k = 0; k < 6000 && s.walking; k++) {
    const x = s.x, z = s.z;
    step(sim, 0.1 / 60);
    moved.push(Math.hypot(s.x - x, s.z - z));
  }
  assert.ok(!s.walking && moved.length > 20, 'sora reaches the plaza');
  const cruise = moved.slice().sort((a, b) => a - b)[Math.floor(moved.length / 2)];
  assert.ok(moved[0] < cruise * 0.5, `the first step is a slow start (${moved[0].toFixed(3)} vs ${cruise.toFixed(3)})`);
  assert.ok(moved.slice(0, 12).some((d) => d > cruise * 0.9), 'full stride within about a second');
  assert.ok(moved.at(-1) < cruise * 0.8, 'the walker slows before stopping');
}

// Soft path following: each resident keeps their own line, a little to one side of the shared road.
{
  const sim = journey(['sora', 'akira']), a = sim.people.sora.path, b = sim.people.akira.path;
  assert.equal(a.length, b.length, 'same route over the road graph');
  const gaps = a.map((p, k) => Math.hypot(p.x - b[k].x, p.z - b[k].z));
  assert.ok(gaps.some((g) => g > 0.05), 'their lines differ');
  assert.ok(gaps.every((g) => g <= 0.71), 'nobody strays more than one lane width from another');
  assert.ok(gaps.at(-1) < 1e-9 && gaps.at(-2) < 1e-9, 'both arrive at the exact doorway');
}

// Old saves have no speed or stride: a walker carries on at full stride, and the save resumes identically.
{
  const sim = journey(['sora']);
  for (let k = 0; k < 20; k++) step(sim, 1 / 60);
  const raw = JSON.parse(saveState(sim));
  delete raw.people.sora.speed; delete raw.people.sora.stride;
  const old = loadState(JSON.stringify(raw)), s = old.people.sora, x = s.x, z = s.z;
  assert.ok(old && s.walking, 'the old save loads mid-walk');
  step(old, 0.1 / 60);
  assert.ok(Math.hypot(s.x - x, s.z - z) > 0.1, 'it does not restart from standing');
  assert.ok(Number.isFinite(s.stride) && s.speed === 1);
  const copy = loadState(saveState(old));
  for (let k = 0; k < 60; k++) { step(old, 1 / 60); step(copy, 1 / 60); }
  assert.equal(saveState(old), saveState(copy), 'gait state saves and resumes identically');
}

console.log('gait ok — personal pace, eased starts and stops, own lanes, old saves keep walking');
