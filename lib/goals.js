// A resident's own aims and what they learn. A goal lasts days and only adds score terms to free-time choices
// (lib/town-life.js leisure); obligations, meals and promises still outrank it. Outcomes arrive through remember(),
// which updates the place/person memories and, here, a few small learned leanings. All of it is saved data.
import { propertyOf, HOME_PRICE } from './housing.js';

const DAY = 1440;
const DAYS = { home: 8, friend: 4, skill: 5 }; // how long a goal is pursued before it is reviewed
const lower = (text) => text[0].toLowerCase() + text.slice(1);

export function createGoals(c) {
  const { RESIDENTS, PEOPLE, LOC, hash, key, clamp, note, partnerOf, moodOf, working, clockOf } = c;

  function initialize(sim) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.brain ??= { goal: null, lessons: [], avoid: {}, w: { thrift: 0, social: 0, comfort: 0 }, skip: {} }; // (s.goal is already the walking destination)
      delete s.mind; // the retired AI free-time pick
    }
  }

  // temperament plus what experience has taught, 0..1
  const thrift = (s) => clamp(s.traits.thrift + s.brain.w.thrift, 0, 1);
  const social = (s) => clamp(s.traits.social + s.brain.w.social, 0, 1);
  // 0..1: how much the body and mood ask for somewhere familiar and easy
  const comfort = (s) => clamp(0.55 * Math.max(0, (65 - s.needs.energy) / 65) + 0.45 * Math.max(0, (55 - moodOf(s).value) / 55) + s.brain.w.comfort, 0, 1);
  const avoiding = (sim, s, id) => (s.brain.avoid[id] ?? 0) > sim.t;

  // ---------- learning ----------
  // felt: -3..3. One lesson per (kind, subject) every four hours, so a busy afternoon cannot flood the short list.
  function learn(sim, id, kind, subj, felt, text) {
    const b = sim.people[id].brain, same = b.lessons.find((l) => l.kind === kind && l.subj === subj && sim.t - l.t < 240);
    if (same) Object.assign(same, { t: sim.t, felt, text });
    else { b.lessons.unshift({ t: sim.t, kind, subj, felt, text }); b.lessons.length = Math.min(b.lessons.length, 6); }
    const lean = (k, d) => (b.w[k] = Math.round(clamp(b.w[k] + d, -0.3, 0.3) * 1000) / 1000);
    if (kind === 'cost') lean('thrift', -felt * 0.01); // a poor-value meal makes me a little thriftier; more would starve the shops' tills
    if (['outing', 'missed', 'quarrel', 'late', 'declined', 'chat'].includes(kind)) lean('social', felt * 0.01);
    if (kind === 'tired' || (kind === 'visit' && felt < 0)) lean('comfort', 0.03);
  }

  // Called by remember() after every memory change. value is that event's own feeling.
  function felt(sim, id, type, target, value, tag, was, now) {
    const s = sim.people[id], name = type === 'person' ? PEOPLE[target].name : LOC[target].name;
    if (type === 'person') {
      if (tag === 'late') learn(sim, id, 'late', target, -1, `I let ${name} down. Next time I'll be there on time.`);
      else if (tag === 'tired') learn(sim, id, 'tired', target, -1, 'I pushed myself too hard. I should rest before making plans.');
      else if (value <= -1) { // a quarrel or being stood up: keep my distance for a few hours
        const mate = partnerOf(sim, id)?.id === target, cool = (mate ? 45 : 180 + 300 * (1 - s.traits.social)) * (tag === 'stoodup' ? 1.5 : 1);
        s.brain.avoid[target] = Math.max(s.brain.avoid[target] ?? 0, sim.t + cool);
        const ids = Object.keys(s.brain.avoid).sort((a, b) => s.brain.avoid[b] - s.brain.avoid[a]);
        for (const old of ids.slice(3)) delete s.brain.avoid[old];
        if (tag === 'stoodup') learn(sim, id, 'missed', target, -3, `${name} left me waiting. I'll think twice before making plans with them.`);
        else learn(sim, id, 'quarrel', target, -2, `Things got tense with ${name}. I'll give it a few hours.`);
      } else if (value >= 3) learn(sim, id, 'outing', target, 2, `Time with ${name} lifts my spirits. I should do it more often.`);
      else if (value > 0 && was < 1 && now >= 1) learn(sim, id, 'chat', target, 1, `Every chat with ${name} leaves me smiling.`);
    } else if (tag === 'visit' && Math.abs(value) >= 2) learn(sim, id, 'visit', target, value > 0 ? 2 : -2, value > 0 ? `${name} always leaves me refreshed.` : `${name} left me drained. Somewhere gentler next time.`);
    else if (tag === 'cost') learn(sim, id, 'cost', target, clamp(value - 2, -3, -1), `A meal at ${name} was not worth the price. I'll watch my money.`); // value is 2 - regret, so felt = -regret
  }

  // ---------- goals ----------
  function options(sim, r) {
    const s = sim.people[r.id], t = s.traits, out = [], mate = partnerOf(sim, r.id)?.id;
    const roomies = RESIDENTS.some((o) => o.id !== r.id && sim.people[o.id].home === s.home && sim.people[o.id].house === s.house);
    if (r.wage && !propertyOf(sim, r.id)?.owner && s.money < HOME_PRICE + 4000) out.push({ kind: 'home', want: 0.1 + 0.55 * t.thrift + 0.1 * t.routine + (roomies ? 0.2 : 0), name: 'Save for a home of my own', base: 0, aim: HOME_PRICE + 4000 });
    let repair = null, know = null;
    for (const o of RESIDENTS) {
      if (o.id === r.id || o.id === mate) continue;
      const rel = sim.rel[key(r.id, o.id)], v = s.memories.people[o.id]?.value ?? 0;
      if ((v <= -2 || rel < 0) && (!repair || v < repair.v)) repair = { o, v, rel };
      else if (rel >= 15 && rel < 45 && v >= 0 && (!know || v + rel / 50 > know.v)) know = { o, v: v + rel / 50, rel };
    }
    if (repair) out.push({ kind: 'friend', who: repair.o.id, want: 0.45 + 0.6 * t.social - repair.v * 0.04, name: `Make peace with ${repair.o.name}`, base: repair.rel, aim: repair.rel < 15 ? 30 : repair.rel + 15 });
    else if (know) out.push({ kind: 'friend', who: know.o.id, want: 0.1 + 0.7 * t.social, name: `Get to know ${know.o.name} better`, base: know.rel, aim: know.rel + 15 });
    out.push({ kind: 'skill', want: 0.15 + 0.5 * t.routine + 0.3 * (1 - t.curiosity) + (s.career.missed > 0 ? 0.15 : 0), name: `Become a better ${r.job.toLowerCase()}`, base: s.career.minutes, aim: s.career.minutes + 25 * 60 });
    return out;
  }
  function pick(sim, r) {
    const s = sim.people[r.id], day = Math.floor(sim.t / DAY);
    const best = options(sim, r).filter((o) => (s.brain.skip[o.kind] ?? 0) <= sim.t)
      .map((o) => ({ ...o, want: o.want + 0.3 * hash('goala', r.id, day, o.kind) })).sort((a, b) => b.want - a.want)[0];
    if (!best) return null;
    const { want, ...goal } = best;
    note(sim, r.id, `New goal: ${lower(goal.name)}.`);
    return { ...goal, start: sim.t, due: sim.t + DAYS[goal.kind] * DAY, retry: 0 };
  }

  // 0..1 toward the aim, always read from the real state (wallet, relationship, career record)
  function progress(sim, id) {
    const s = sim.people[id], g = s.brain.goal;
    if (!g) return 0;
    if (g.kind === 'home') return propertyOf(sim, id)?.owner === id ? 1 : Math.min(0.99, s.money / g.aim); // the title, not the savings, completes it
    const now = g.kind === 'friend' ? sim.rel[key(id, g.who)] : s.career.minutes;
    return clamp((now - g.base) / (g.aim - g.base), 0, 1);
  }

  function finish(sim, r, how) {
    const s = sim.people[r.id], g = s.brain.goal;
    s.brain.goal = null;
    s.brain.next = sim.t + (how === 'done' ? 12 : 24) * 60; // a breather before the next aim
    if (how === 'done') { note(sim, r.id, `Goal reached: ${lower(g.name)}!`); learn(sim, r.id, 'goal', g.kind, 3, `I did it: ${lower(g.name)}. Setting my heart on something new.`); }
    else { s.brain.skip[g.kind] = sim.t + 2 * DAY; note(sim, r.id, `Letting go of my goal to ${lower(g.name)} for now.`); learn(sim, r.id, 'goal', g.kind, -1, `${g.name} was not the right goal this time.`); }
  }

  // once a minute (town-life update): review goals, expire cool-offs, let the learned leanings fade towards temperament
  function update(sim) {
    const day = Math.floor(sim.t / DAY);
    for (const r of RESIDENTS) {
      const s = sim.people[r.id], b = s.brain, g = b.goal;
      for (const id of Object.keys(b.avoid)) if (b.avoid[id] <= sim.t) delete b.avoid[id];
      if (b.day !== day) { b.day = day; for (const k of Object.keys(b.w)) b.w[k] = Math.round(b.w[k] * 0.9 * 1000) / 1000; }
      if (g) {
        const p = progress(sim, r.id);
        if (p >= 1) finish(sim, r, 'done');
        else if (sim.t >= g.due) { if (p >= 0.6 && !g.extended) { g.extended = true; g.due += 2 * DAY; } else finish(sim, r, 'drop'); }
      } else if (sim.t >= (b.next ?? 0)) b.goal = pick(sim, r);
    }
  }

  // ---------- what the goal and the day add to a place's score ----------
  function pull(sim, r, s, l) {
    const g = s.brain.goal;
    if (!g) return 0;
    if (g.kind === 'skill') return l.id === r.work ? 8 : 0;
    if (g.kind === 'home') return c.SHOP[l.id] ? -c.priceAt(sim, l.id) / Math.max(300, s.money) * 11 : l.id === s.home ? 3 : 0; // spending slows the savings
    const o = sim.people[g.who];
    return sim.t >= g.retry && !avoiding(sim, s, g.who) && o.at === l.id && !o.hidden && !working(PEOPLE[g.who], clockOf(sim).h) ? 10 : 0; // hoping to run into them
  }
  // how glad the resident is of someone's company: friends and good memories draw, tense ones repel (-2..2)
  const warmth = (sim, r, s, id) => {
    const w = clamp((sim.rel[key(r.id, id)] - 20) / 40 + (s.memories.people[id]?.value ?? 0) / 3, -2, 2);
    return Math.abs(w) < 0.5 ? 0 : w - Math.sign(w) * 0.5; // acquaintances are neutral: only real friends and real tension pull
  };
  const unwelcome = (sim, s, loc) => loc !== s.home && Object.keys(s.brain.avoid).some((id) => s.brain.avoid[id] > sim.t && sim.people[id].at === loc);

  // would this resident turn down an invitation from host right now?
  function declines(sim, guest, host) {
    const s = sim.people[guest.id];
    if (avoiding(sim, s, host.id)) return `${host.name} and I need a little more time apart.`;
    if (comfort(s) > 0.5 && hash('accept', guest.id, clockOf(sim).day) < 0.5) return 'I would rather have a quiet evening in.';
    return null;
  }

  return { initialize, learn, felt, update, progress, pull, warmth, unwelcome, declines, thrift, social, comfort, avoiding };
}
