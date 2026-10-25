import assert from 'node:assert/strict';
import { createSim, step, catchUp, saveState, loadState, planFor, goalProgress, clockOf, RESIDENTS, PEOPLE, LOC } from './sim.js';

const run = (sim, minutes) => { for (let i = 0; i < Math.round(minutes * 60); i++) step(sim, 1 / 60); };
const evening = (seed = 7) => { // a quiet clear evening: nobody on shift for long, no festival, no invitations unless a test wants them
  const sim = createSim(seed, 18.25 * 60);
  sim.today.festival = false; sim.today.weather = { kind: 'clear' };
  sim.projects.forEach((p) => { p.status = 'complete'; });
  sim.lifeNext = sim.t + 6 * 1440;
  for (const s of Object.values(sim.people)) { s.lastInviteDay = clockOf(sim).day; s.needs = { food: 95, energy: 90, fun: 70 }; s.intent = null; s.wants = null; }
  return sim;
};
const free = (sim) => RESIDENTS.filter((r) => planFor(r, sim).flexible);
const place = (sim, id, loc) => Object.assign(sim.people[id], { at: loc, target: loc, hidden: false, walking: false });

// Goals are personal, come from the resident's own state, and last for days.
{
  const sim = createSim(7, 6 * 60);
  catchUp(sim, sim.t + 2 * 1440, 9);
  const goals = RESIDENTS.map((r) => sim.people[r.id].brain.goal).filter(Boolean);
  assert.ok(goals.length >= 20, 'nearly everyone has a goal of their own');
  assert.ok(new Set(goals.map((g) => g.kind)).size === 3, 'saving, friendship and craft all appear');
  assert.ok(goals.every((g) => g.due - g.start >= 4 * 1440 && Number.isFinite(g.aim)), 'a goal is meant to last days, not an outing');
  const started = Object.fromEntries(RESIDENTS.map((r) => [r.id, sim.people[r.id].brain.goal?.start]));
  catchUp(sim, sim.t + 1440, 9);
  assert.ok(RESIDENTS.filter((r) => started[r.id] && sim.people[r.id].brain.goal?.start === started[r.id]).length >= 12, 'most goals outlast another whole day');
  assert.ok(RESIDENTS.every((r) => { const p = sim.people[r.id].brain.goal && goalProgress(sim, r.id); return p === null || p === undefined || (p >= 0 && p <= 1); }));

  // the choice follows the person: a sociable resident with a falling-out wants to make peace, a frugal one with housemates saves
  const pick = (id, shape) => {
    const s = sim.people[id];
    shape(s);
    s.brain.goal = null; s.brain.next = 0; s.brain.skip = {};
    sim.lifeNext = sim.t;
    step(sim, 1 / 60);
    return s.brain.goal;
  };
  const rowdy = pick('sora', (s) => { Object.assign(s.traits, { social: 0.95, routine: 0.1, curiosity: 0.9, thrift: 0.1 }); s.memories.people.riku = { value: -6, visits: 3, when: sim.t }; sim.rel['riku:sora'] = -12; });
  assert.deepEqual([rowdy.kind, rowdy.who], ['friend', 'riku']);
  const saver = pick('nori', (s) => { Object.assign(s.traits, { social: 0.05, routine: 0.1, curiosity: 0.9, thrift: 0.95 }); s.money = 4000; });
  assert.equal(saver.kind, 'home');
}

// Plans come from the resident's own view: a goal, money, company and comfort each change where free time goes.
{
  const sim = evening(), crowd = free(sim);
  assert.ok(crowd.length >= 12);
  const scene = (fn) => crowd.map((r) => { fn(sim.people[r.id], r); return planFor(r, sim); });
  const base = scene(() => {});
  // hoping to meet a friend: they head where the friend is
  place(sim, 'kenji', 'bathhouse');
  const hopeful = scene((s, r) => { s.brain.goal = r.id === 'kenji' ? null : { kind: 'friend', who: 'kenji', name: 'Get to know Kenji better', base: 20, aim: 35, start: sim.t, due: sim.t + 4 * 1440, retry: 0 }; });
  const flipped = crowd.filter((r, i) => hopeful[i].loc === 'bathhouse' && base[i].loc !== 'bathhouse');
  assert.ok(flipped.length >= 2, `a friendship goal draws residents to where the friend is (${flipped.length})`);
  assert.ok(hopeful.some((p) => /Hoping to run into Kenji/.test(p.reason)), 'and the plan says why');
  // saving for a home turns residents away from costly outings
  const costly = (plans) => plans.filter((p) => ['theater', 'onsen', 'teahouse', 'bathhouse'].includes(p.loc)).length;
  const saving = scene((s) => { s.brain.goal = { kind: 'home', name: 'Save for a home of my own', base: 0, aim: 16000, start: sim.t, due: sim.t + 8 * 86400, retry: 0 }; s.money = 5000; });
  const spending = scene((s) => { s.brain.goal = null; s.money = 5000; });
  assert.ok(costly(saving) < costly(spending), `savers pick cheaper evenings (${costly(saving)} vs ${costly(spending)})`);
  // tired or low residents sometimes choose somewhere familiar even though another place scores higher
  const rested = scene((s) => { s.brain.goal = null; s.needs = { food: 95, energy: 90, fun: 80 }; });
  const worn = scene((s) => { s.needs = { food: 95, energy: 30, fun: 10 }; });
  const soft = (plans, rs) => plans.filter((p, i) => p.loc === PEOPLE[rs[i].id].home || ['onsen', 'bathhouse'].includes(p.loc)).length; // the easy, restful places
  assert.ok(soft(worn, crowd) >= soft(rested, crowd) + 3, `worn-out residents head for somewhere easy (${soft(worn, crowd)} vs ${soft(rested, crowd)})`);
}

// Keeping away from someone after an argument, and keeping a promise anyway.
{
  const sim = evening();
  const sora = sim.people.sora, riku = sim.people.riku;
  const plain = planFor(PEOPLE.sora, sim).loc;
  place(sim, 'riku', plain);
  sora.brain.avoid.riku = sim.t + 240;
  const away = planFor(PEOPLE.sora, sim);
  assert.notEqual(away.loc, plain, 'after a quarrel she plans around where he is');
  assert.match(away.reason, /rather not run into Riku/);
  // new information: he turns up where she already is, and she moves on
  sora.brain.avoid = {};
  run(sim, 2);
  const here = sora.target;
  assert.equal(sora.intent.plan.loc, here);
  run(sim, 6);
  assert.equal(sora.target, here, 'a few minutes of shifting scores do not change a committed plan');
  sora.brain.avoid.riku = sim.t + 240;
  place(sim, 'riku', here);
  step(sim, 1 / 60);
  assert.notEqual(sora.target, here, 'someone she is avoiding showing up is a reason to change plans');
  // a promise outranks both a more attractive plan and the wish to avoid
  sora.memories.places = { teahouse: { value: 10, visits: 8, when: sim.t }, willow: { value: -8, visits: 3, when: sim.t } };
  sim.outings.push({ id: 'promise', host: 'riku', guest: 'sora', loc: 'willow', kind: 'sit', status: 'invited', start: sim.t, deadline: sim.t + 13, minutes: 0, leg: 0 });
  const kept = planFor(PEOPLE.sora, sim);
  assert.equal(kept.outing, 'promise');
  assert.equal(kept.loc, 'willow', 'a promise is kept even when another place scores higher and the other person has been avoided');
}

// A real argument makes both people keep their distance for a while, and leaves a lesson.
{
  const sim = evening();
  const aiko = sim.people.aiko, taro = sim.people.taro;
  const hold = (full) => [aiko, taro].forEach((s) => Object.assign(s, { needs: { food: 60, energy: 30, fun: 15 }, intent: { plan: { loc: 'willow', act: 'Chatting', flexible: true }, started: sim.t, until: sim.t + 999, wet: false, arrived: true }, ...(full && { at: 'willow', target: 'willow', hidden: false, walking: false, x: LOC.willow.door.x, z: LOC.willow.door.z }) }));
  hold(true);
  for (let i = 0; i < 600; i++) { hold(false); step(sim, 1 / 60); } // let them settle at the willow
  let storm = false;
  for (let n = 0; n < 600 && !storm; n++) {
    hold(false);
    Object.assign(aiko, { bubble: null, chatUntil: 0 }); Object.assign(taro, { bubble: null, chatUntil: 0 });
    aiko.x = taro.x + 1; aiko.z = taro.z;
    sim.socialTimer = 3;
    step(sim, 1 / 600);
    storm = aiko.bubble?.kind === 'storm';
  }
  assert.ok(storm, 'the grumpy pair eventually quarrel');
  for (const [a, b] of [['aiko', 'taro'], ['taro', 'aiko']]) {
    const s = sim.people[a];
    assert.ok(s.brain.avoid[b] > sim.t + 120, `${a} keeps clear of ${b}`);
    assert.ok(s.memories.people[b].value < 0);
    assert.equal(s.brain.lessons[0].kind, 'quarrel');
  }
}

// Outcomes change later choices: a no-show, a costly meal, a good outing.
{
  const sim = evening();
  const host = sim.people.sora, guest = sim.people.riku;
  sim.rel['riku:sora'] = 60;
  Object.assign(host, { at: 'library', target: 'library' }); place(sim, 'sora', 'library'); place(sim, 'riku', 'willow');
  sim.outings.push({ id: 'noshow', host: 'sora', guest: 'riku', loc: 'library', kind: 'sit', status: 'invited', start: sim.t, deadline: sim.t + 1 / 60, minutes: 0, leg: 0 });
  const w = { ...host.brain.w };
  run(sim, 1);
  assert.equal(sim.outings[0].status, 'missed');
  assert.ok(host.memories.people.riku.value <= -3, 'the one left waiting feels it more');
  assert.equal(host.brain.lessons[0].kind, 'missed');
  assert.ok(host.brain.avoid.riku > sim.t + 200, 'and keeps their distance for a while');
  assert.ok(host.brain.w.social < w.social, 'and trusts the next invitation a little less');
  assert.equal(guest.brain.lessons[0].kind, 'late', 'the one who did not turn up feels they let the other down');
  assert.ok(guest.memories.people.sora.value > host.memories.people.riku.value);
}
{
  const meal = (money) => {
    const sim = createSim(7, 10 * 60), s = sim.people.kenji;
    s.money = money; s.needs.food = 34;
    run(sim, 30);
    return { s, value: s.memories.places[s.meal?.loc ?? 'bakery']?.value };
  };
  const rich = meal(20000), poor = meal(900);
  const lesson = poor.s.brain.lessons.find((l) => l.kind === 'cost');
  assert.ok(lesson && lesson.felt < 0, 'a meal that swallowed the wallet is a lesson');
  assert.ok(poor.s.brain.w.thrift > 0 && rich.s.brain.w.thrift === 0, 'and teaches thrift');
  assert.ok(poor.s.memories.places.bakery.value < rich.s.memories.places.bakery.value);
}
{
  const sim = evening();
  const crowd = free(sim), friend = 'sora';
  place(sim, friend, 'library');
  const choose = (rel, value) => crowd.filter((r) => { sim.rel[[r.id, friend].sort().join(':')] = rel; sim.people[r.id].memories.people[friend] = { value, visits: 4, when: sim.t }; return r.id !== friend && planFor(r, sim).loc === 'library'; }).length;
  assert.ok(choose(75, 5) > choose(5, 0), 'friends whose company has been pleasant are sought out');
}

// A reached goal is celebrated, remembered and replaced; the leaning towards thrift and company fades with time.
{
  const sim = evening();
  const s = sim.people.hana;
  s.brain.goal = { kind: 'skill', name: 'Become a better baker', base: 0, aim: 100, start: sim.t - 3 * 1440, due: sim.t + 1440, retry: 0 };
  s.career.minutes = 150;
  sim.lifeNext = sim.t;
  step(sim, 1 / 60);
  assert.equal(s.brain.goal, null);
  assert.equal(s.brain.lessons[0].kind, 'goal');
  assert.ok(s.diary.some((d) => /Goal reached/.test(d.text)));
  s.brain.w.thrift = 0.2;
  sim.lifeNext = sim.t + 1440; sim.t += 1440; sim.lifeNext = sim.t; step(sim, 1 / 60);
  assert.ok(s.brain.w.thrift < 0.2 && s.brain.w.thrift > 0.1);
}

// Saves: older towns gain a brain on load, state stays small, and a reloaded town thinks identically.
{
  const sim = createSim(7, 6 * 60);
  catchUp(sim, sim.t + 3 * 1440, 9);
  for (const r of RESIDENTS) {
    const b = sim.people[r.id].brain;
    assert.ok(b.lessons.length <= 6 && Object.keys(b.avoid).length <= 3 && JSON.stringify(b).length < 2500, `${r.id} keeps a small brain`);
    assert.ok(Object.values(b.w).every((v) => Math.abs(v) <= 0.3));
  }
  const raw = JSON.parse(saveState(sim));
  for (const p of Object.values(raw.people)) { delete p.brain; p.mind = { loc: 'shrine', act: 'Sketching', why: '', until: 0, used: true }; }
  const old = loadState(JSON.stringify(raw));
  assert.ok(old && RESIDENTS.every((r) => old.people[r.id].brain.goal === null && old.people[r.id].mind === undefined), 'an older save gets empty brains and drops AI picks');
  run(old, 5);
  const copy = loadState(saveState(sim));
  run(sim, 120); run(copy, 120);
  assert.equal(saveState(copy), saveState(sim), 'goals, lessons and grudges resume identically after saving');
}

// Residents commit: over a whole evening nobody flits between places.
{
  const sim = evening();
  const changes = Object.fromEntries(RESIDENTS.map((r) => [r.id, 0])), last = {};
  for (let m = 0; m < 180; m++) {
    run(sim, 1);
    for (const r of RESIDENTS) { const s = sim.people[r.id]; if (s.intent?.plan.flexible) { if (last[r.id] && last[r.id] !== s.intent.plan.loc) changes[r.id]++; last[r.id] = s.intent.plan.loc; } else last[r.id] = null; }
  }
  assert.ok(Math.max(...Object.values(changes)) <= 6, `free-time destinations change rarely (${Math.max(...Object.values(changes))} at most in three hours)`);
}
console.log('brain ok — personal goals, own-view plans, avoidance, kept promises, commitments, lessons that change later choices, compatible saves');
