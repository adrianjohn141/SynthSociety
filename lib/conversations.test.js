import assert from 'node:assert/strict';
import { createSim, step, saveState, loadState, RESIDENTS, LOC } from './sim.js';
import { chatLines } from './talk.js';
import { recentExchanges } from './conversations.js';

const run = (sim, minutes) => { for (let second = 0; second < minutes * 60; second++) step(sim, 1 / 60); };
const base = { A: RESIDENTS[0], B: RESIDENTS[1], SA: { needs: { food: 80, energy: 80 } }, SB: { needs: { food: 80, energy: 80 }, diary: [] }, loc: 'teahouse', h: 18, weather: 'clear', season: 'spring', rel: 50, pick: (items) => items[0], chance: () => 0 };
const recent = [];
for (let turn = 0; turn < 5; turn++) {
  const pair = chatLines({ ...base, recent });
  assert.ok(!recent.includes(pair.join('|')) && !recent.includes([...pair].reverse().join('|')), 'the pair finds a fresh subject instead of repeating its last four exchanges');
  recent.unshift(pair.join('|')); recent.length = Math.min(recent.length, 4);
}
for (const [news, pattern] of [['Washed 3 portions of household laundry and hung it out to dry.', /Thanks for doing the washing/], ['Folded the dry laundry and put it away.', /clean clothes are put away/], ['My day at Mochi Bakery: 400 minutes on duty and 3 customers helped.', /How did your shift go/]]) {
  const choices = Array.from({ length: 200 }, (_, i) => chatLines({ ...base, SA: { ...base.SA, home: 'homes', house: 1 }, SB: { ...base.SB, home: 'homes', house: 1, diary: [{ text: news }], career: { recent: [{ customers: 3 }] } }, chance: () => (i + 0.5) / 200 }).join('|'));
  assert.ok(choices.some((line) => pattern.test(line)), 'actual household and work events can become a conversation topic');
}

let pending;
for (const seed of [1, 7, 42]) {
  const sim = createSim(seed, 17.5 * 60);
  let completed = 0;
  // Observe individual physics ticks: after a reply finishes, the next tick may
  // legitimately send a resident back to work or a newly available home chore.
  for (let tick = 0; tick < 90 * 60 * 5; tick++) {
    const previous = new Set(Object.values(sim.people).flatMap((s) => s.chats.map((chat) => chat.id)));
    step(sim, 1 / 300);
    pending ??= sim.pendingChats.length ? saveState(sim) : null;
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      assert.ok(s.chats.length <= 6, 'conversation history is bounded');
      for (const chat of s.chats) {
        assert.ok(LOC[chat.at] && chat.participants.includes(r.id));
        assert.ok(chat.messages.length >= 2 && chat.messages.every((m) => m.text && chat.participants.includes(m.speaker)));
        if (previous.has(chat.id)) continue;
        completed++;
        for (const id of chat.participants) {
          const other = sim.people[id];
          assert.ok(!other.walking && !other.hidden && other.at === chat.at, 'a completed reply is actually heard');
          assert.ok(other.chats.some((m) => m.id === chat.id), 'all participants remember the same exchange');
        }
      }
    }
  }
  assert.ok(completed > 0, `real nearby conversations finish and are remembered (seed ${seed})`);
  const sample = RESIDENTS.find((r) => sim.people[r.id].chats.length);
  const chat = sim.people[sample.id].chats[0];
  assert.ok(recentExchanges(sim, sample.id, chat.participants.find((id) => id !== sample.id)).length > 0);
}

assert.ok(pending, 'a real delayed reply was captured');
{
  const original = loadState(pending), copy = loadState(saveState(original));
  run(original, 15); run(copy, 15);
  assert.equal(saveState(original), saveState(copy), 'mid-conversation reloads preserve replies, random choices and histories');
}
{
  const sim = loadState(pending), chat = sim.pendingChats[0], id = chat.participants.at(-1), s = sim.people[id];
  s.needs.energy = 10; s.wants = 'rest';
  run(sim, 1);
  assert.ok(!Object.values(sim.people).some((person) => person.chats.some((entry) => entry.id === chat.id)), 'an interrupted reply does not become a false conversation memory');
}
{
  const old = JSON.parse(pending);
  delete old.pendingChats;
  for (const s of Object.values(old.people)) { delete s.chats; delete s.chatUntil; }
  const upgraded = loadState(JSON.stringify(old));
  assert.ok(Object.values(upgraded.people).every((s) => s.chats.length === 0));
  assert.equal(upgraded.seed, old.seed);
  assert.deepEqual(upgraded.rel, old.rel);
}
console.log('conversations ok — fresh topics, actual replies, group memories, bounded history, interrupted speech and saved continuity');
