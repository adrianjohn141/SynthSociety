import assert from 'node:assert/strict';
import { createSim, catchUp, saveState, loadState, relationsOf, housematesOf, birthdayLabel, isBirthday, HOUSE_NAMES, RESIDENTS, HOUSES } from './sim.js';
import { chatLines } from './talk.js';
import { PETS, favouriteOf } from './pets.js';

// Everyone has a named house of their own on their lane, kept across saves.
{
  const sim = createSim(7);
  for (const r of RESIDENTS) {
    const s = sim.people[r.id];
    assert.ok(Number.isInteger(s.house) && s.house < HOUSES[s.home].length && HOUSE_NAMES[s.home][s.house], `${r.id} has a house`);
    assert.ok(housematesOf(sim, r.id).length <= 2, 'no house is crowded');
  }
  const old = JSON.parse(saveState(sim));
  for (const p of Object.values(old.people)) delete p.house;
  const upgraded = loadState(JSON.stringify(old));
  assert.deepEqual(RESIDENTS.map((r) => upgraded.people[r.id].house), RESIDENTS.map((r) => sim.people[r.id].house), 'older saves are given the same houses');
}

// Conversation lines follow the moment: a couple flirts, an onsen chat is about the spring, news gets mentioned.
{
  const base = { A: RESIDENTS[0], B: RESIDENTS[1], SA: { needs: { food: 80, energy: 80, fun: 80 } }, SB: { needs: { food: 80, energy: 80, fun: 80 }, diary: [] }, h: 15, weather: 'clear', season: 'spring', festival: false, rel: 50, couple: null, pick: (l) => l[0] };
  const lines = (over, n = 200) => new Set(Array.from({ length: n }, (_, i) => chatLines({ ...base, ...over, chance: () => (i + 0.5) / n }).join(' / ')));
  assert.ok([...lines({ loc: 'onsen' })].some((l) => /water|steam/.test(l)), 'place lines at the onsen');
  assert.ok([...lines({ loc: 'plaza', couple: { stage: 'dating' } })].some((l) => /hoping|home|cheek/.test(l)), 'couples have their own lines');
  assert.ok([...lines({ loc: 'plaza', SB: { ...base.SB, diary: [{ text: 'Caught a carp at Reedwater. Taking it back fresh.' }] } })].some((l) => /caught a fish/.test(l)), 'fresh news comes up');
  const gossip = (b) => [...lines({ loc: 'plaza', news: [{ kind: 'dating', a: RESIDENTS[2], b }] })];
  assert.ok(gossip(RESIDENTS[3]).some((l) => /are dating!/.test(l)), 'town news gets passed around');
  assert.ok(gossip(RESIDENTS[1]).some((l) => /heard about you and/.test(l)), 'and the people in it hear kind words');
  for (const a of RESIDENTS) for (const b of RESIDENTS) if (a !== b) for (const kind of ['dating', 'together', 'engaged', 'married', 'breakup'])
    for (const l of lines({ loc: 'plaza', news: [{ kind, a, b }] }, 40)) assert.ok(l.split(' / ').every((t) => t.length <= 44), `gossip stays short: ${l}`);
  for (const l of lines({ loc: 'market', weather: 'rain', festival: true })) assert.ok(l.split(' / ').every((t) => t.length <= 40), `bubble lines stay short: ${l}`);
}

// A few weeks of town life: pets get petted, friends greet, couples date, mark anniversaries and share a house.
{
  const sim = createSim(7), diary = new Set();
  for (let h = 0; h < 24 * 21; h++) {
    catchUp(sim, sim.t + 60, 9);
    for (const r of RESIDENTS) for (const e of sim.people[r.id].diary) diary.add(`${r.id}|${e.text}`);
  }
  const has = (re) => [...diary].some((t) => re.test(t));
  for (const p of PETS) assert.ok(Number.isFinite(sim.pets[p.id].x) && Number.isFinite(sim.pets[p.id].z), `${p.name} is somewhere`);
  assert.ok(has(/stroke|scratch behind the ears/), 'residents stop to pet the animals');
  assert.ok(PETS.some((p) => favouriteOf(sim, p.id)) && has(/picked me as a favourite/), 'pets warm to the residents who stop for them');
  for (const re of [/Sketched /, /Played my flute/, /Knitted /, /Read a few chapters/]) assert.ok(has(re), `hobbies show up: ${re}`);
  assert.ok(Object.keys(sim.greets ?? {}).length > 0, 'friends greet each other in passing');
  assert.ok(has(/proper friends now/) && has(/closest friends/), 'friendships reach milestones');
  assert.ok(has(/introduced me to/), 'friends introduce friends');
  assert.ok(has(/over for tea\. The house felt cosy/) && has(/place for tea\./), 'friends visit each other at home');
  assert.ok(has(/date at /) && has(/first proper date/), 'couples go on dates');
  assert.ok(has(/week(s)? with /), 'couples mark their anniversaries');
  assert.ok(has(/proposed at .* engaged!/) && has(/Married /), 'a couple gets engaged on a date, then marries');
  for (const [k, c] of Object.entries(sim.couples)) if (c.stage === 'together') {
    const [a, b] = k.split(':');
    assert.equal(sim.people[a].home, sim.people[b].home);
    assert.equal(sim.people[a].house, sim.people[b].house, `${k} share a house`);
  }
  for (const r of RESIDENTS) assert.ok(relationsOf(sim, r.id).filter((x) => x.tier === 'Best friend').length <= 1, 'at most one best friend');
}
// A devoted couple who share a home marry at the shrine the next afternoon; friends come and the town remembers.
{
  const sim = createSim(7, 20 * 60), k = 'hana:kenji';
  sim.couples[k] = { since: 0, stage: 'together', day: -9, togetherDay: -8, engaged: -2 };
  sim.rel[k] = 99;
  catchUp(sim, Math.ceil(sim.t / 1440) * 1440 + 18 * 60, 9);
  assert.ok(sim.couples[k].married, 'they are married');
  assert.equal(relationsOf(sim, 'hana').find((x) => x.other.id === 'kenji').tier, 'Spouse');
  const diary = (id) => sim.people[id].diary.map((e) => e.text).join('\n');
  assert.match(diary('hana'), /Married Kenji/);
  assert.ok(sim.wedding.guests.some((g) => /Celebrated Hana and Kenji/.test(diary(g))), 'friends came to celebrate');
}

// On a birthday, friends who meet the resident wish them well (and close friends bring a present).
{
  const r = RESIDENTS.find((x) => x.id === 'aiko'), sim = createSim(7, 9 * 60);
  const [month] = birthdayLabel(r.id).split(' ');
  sim.today.md = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(month) + 1}-${birthdayLabel(r.id).split(' ')[1]}`;
  assert.ok(isBirthday(sim, r.id));
  for (const o of RESIDENTS) if (o.id !== r.id) sim.rel[[o.id, r.id].sort().join(':')] = 60;
  catchUp(sim, sim.t + 10 * 60, 1);
  assert.ok(sim.people.aiko.diary.some((e) => /wished me a happy birthday/.test(e.text)), 'birthday wishes');
}
console.log('social ok — own houses, contextual chats, pets, greetings, dates, anniversaries, shared homes, weddings, birthdays, hobbies, friendship milestones, tea at home and proposals');
