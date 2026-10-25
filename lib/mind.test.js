import assert from 'node:assert/strict';
import * as town from './sim.js';
import * as minds from './mind.js';
import * as prompts from './mind-prompts.js';
import { createSim, step, RESIDENTS } from './sim.js';
import { talkAsk, cleanLine, rewriteChat, mind, replyAsk, replyAskBody } from './mind.js';
import { talkMessages, chatMessages } from './mind-prompts.js';
import { writtenReply, heard, tidyText, nearbyOf } from './chat.js';

const sim = createSim(7, 17.5 * 60);
for (let i = 0; i < 90 * 60 && !sim.pendingChats.length; i++) step(sim, 1 / 60);

// conversations
const chat = sim.pendingChats[0] ?? (() => { for (let i = 0; i < 90 * 60 && !sim.pendingChats.length; i++) step(sim, 1 / 60); return sim.pendingChats[0]; })();
assert.ok(chat, 'an evening produces a conversation');
const talk = talkAsk(sim, chat), talkPrompt = talkMessages(talk)[1].content;
assert.equal(talk.turns.length, chat.messages.length);
for (const m of chat.messages) assert.ok(talkPrompt.includes(m.text), 'the written lines are the ideas');
assert.match(talkPrompt, /Time: day \d+, .+\d\d:\d\d/);
for (const speaker of talk.speakers) assert.ok(talkPrompt.includes(`${speaker.name} (`) && talkPrompt.includes('rest starts at'), 'NPC dialogue receives each speaker schedule');
assert.match(talkPrompt, new RegExp(`Return exactly ${chat.messages.length} lines`));
const [speaker, listener] = chat.participants;
sim.people[speaker].chats.unshift({ participants: [speaker, listener], when: sim.t - 75, messages: [{ speaker, text: 'We spoke earlier.' }, { speaker: listener, text: 'Yes, we did.' }] });
assert.match(talkMessages(talkAsk(sim, chat))[1].content, /We spoke earlier.*1 hour ago/, 'NPC exchanges carry elapsed time');
assert.equal(cleanLine('Kenji: *smiles* "Tea first?"\nHana: Always.'), 'Tea first?');
assert.equal(cleanLine('\u{1F338}'), null);

// the server's prompt builder caps whatever the browser sends
const huge = talkMessages({ season: 'x'.repeat(500), place: 'p'.repeat(5000), speakers: Array.from({ length: 20 }, () => ({ name: 'n'.repeat(1000), personality: Array(20).fill('q'.repeat(100)) })), memories: Array(20).fill('m'.repeat(1000)), turns: Array.from({ length: 50 }, () => ({ name: 'n'.repeat(1000), idea: 'i'.repeat(1000) })) });
assert.ok(huge[1].content.length < 4000 && (huge[1].content.match(/^n+: /gm) ?? []).length === 6);
assert.equal(talkMessages({ turns: [] }), null);

// talking with a resident yourself: the prompt is built from their own state, and capped like the rest
const ask = replyAskBody(sim, 'akira', 'Aj', [{ me: true, text: 'hi' }, { me: false, text: 'Hello, Aj!' }], 'What are you working toward?');
const asked = chatMessages(ask);
assert.ok(asked[0].content.includes('You are Akira') && asked[0].content.includes('called Aj'));
assert.match(asked[0].content, /Your schedule: shift .*; rest .*\./);
assert.deepEqual(asked.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
const away = createSim(7, 3 * 60 + 4);
assert.ok(!nearbyOf(away, 'fumi').includes('Akira'));
const aboutAkira = replyAskBody(away, 'fumi', 'Kei', [], 'Where is Akira?');
assert.equal(aboutAkira.other.observed, false);
assert.equal(aboutAkira.other.at, town.LOC[away.people.akira.at ?? away.people.akira.target].name, 'in a small village Fumi knows roughly where Akira is');
assert.equal(aboutAkira.other.mood, undefined, 'another resident’s private mood is not sent');
const remotePrompt = chatMessages(aboutAkira)[0].content;
assert.match(remotePrompt, /Akira.*not nearby; as far as you know they are .+ at /);
for (const resident of RESIDENTS) {
  const remote = RESIDENTS.find((other) => other.id !== resident.id && !nearbyOf(away, resident.id).includes(other.name));
  if (!remote) continue;
  const body = replyAskBody(away, resident.id, 'Kei', [], `Where is ${remote.name}?`);
  assert.ok(body.other.at, `${resident.name} can say roughly where ${remote.name} is`);
}
const together = createSim(7, 18 * 60);
assert.ok(nearbyOf(together, 'fumi').includes('Mei'));
const aboutMei = replyAskBody(together, 'fumi', 'Kei', [], 'What is Mei doing?');
assert.equal(aboutMei.other.observed, true);
assert.equal(aboutMei.other.doing, together.people.mei.act, 'a nearby resident’s visible action remains available');
assert.match(chatMessages(aboutMei)[0].content, /Person mentioned nearby now: Mei/);
const late = createSim(7, 54);
const chika = replyAskBody(late, 'chika', 'Kei', [], 'Will you see Nao?');
assert.equal(chika.hhmm, '00:54');
assert.deepEqual(chika.me.schedule.rest, { label: 'rest starts', at: '01:00', inMinutes: 6 });
assert.match(chatMessages(chika)[0].content, /Time: day 1, .*00:54.*late night/);
assert.match(chatMessages(chika)[0].content, /rest starts at 01:00 \(in 6 minutes\)/);
const sleeping = replyAskBody(createSim(7, 61), 'chika', 'Kei', [], 'Hello');
assert.deepEqual(sleeping.me.schedule.rest, { label: 'rest ends', at: '09:00', inMinutes: 479 });
const midnight = replyAskBody(createSim(7, 1439), 'akira', 'Kei', [], 'Hello');
assert.deepEqual(midnight.me.schedule.shift, { label: 'shift starts', at: '00:00', inMinutes: 1 });
for (const resident of RESIDENTS) {
  const body = replyAskBody(late, resident.id, 'Kei', [], 'Hello');
  assert.match(chatMessages(body)[0].content, /Your schedule: shift .*; rest .*/, `${resident.name} receives their own schedule`);
}
const nextDay = createSim(7, 1445);
const remembered = replyAskBody(nextDay, 'chika', 'Kei', [{ me: true, text: 'Can we talk?', at: 1435, epoch: nextDay.epoch }, { me: false, text: 'Yesterday, yes.', when: '23:56' }], 'Do you remember?');
assert.match(chatMessages(remembered)[1].content, /^\[10 minutes ago\] Can we talk\?$/);
assert.equal(chatMessages(remembered)[2].content, 'Yesterday, yes.', 'old saved messages do not acquire a guessed day');
nextDay.people.chika.lastVisitorMeet = { target: 'nao', status: 'completed', when: nextDay.t - 20, reason: '' };
assert.match(chatMessages(replyAskBody(nextDay, 'chika', 'Kei', [], 'Did you meet Nao?'))[0].content, /completed with Nao 20 minutes ago/);
const flood = chatMessages({ visitor: 'v'.repeat(500), me: { name: 'n'.repeat(500), lessons: Array(20).fill('l'.repeat(1000)) }, history: Array.from({ length: 50 }, () => ({ me: true, text: 'h'.repeat(1000) })), text: 't'.repeat(5000) });
assert.ok(flood.length === 1 + 8 + 1 && flood.every((m) => m.content.length < 2000));
assert.equal(chatMessages({ me: { name: 'Akira' }, text: '' }), null);
assert.equal(tidyText(' a\n\n b '.repeat(100)).length, 200);

// written replies answer from the resident's own state, and the town hears them
const akira = sim.people.akira;
Object.assign(akira, { act: 'Patrolling', hidden: false });
assert.match(writtenReply(sim, 'akira', 'hello!', 'Aj'), /Aj/);
assert.match(writtenReply(sim, 'akira', 'what are you working toward?', 'Aj'), akira.brain?.goal ? /I am trying to/ : /between goals/);
assert.match(writtenReply(sim, 'akira', 'goodbye', 'Aj'), /Aj|again/);
const long = 'A reply long enough that the old bubble would have cut it off well before the end of it.';
const lines = akira.diary.length;
heard(sim, 'akira', 'Aj', long); heard(sim, 'akira', 'Aj', 'Again.');
assert.equal(akira.diary.length, lines + 1, 'one diary line per hour of chatting');
assert.equal(akira.diary[0].text, 'Had a chat with Aj.');
assert.deepEqual([akira.bubble.kind, akira.bubble.text], ['reply', 'Again.'], 'the whole answer shows over their head');

// the AI writes dialogue only: nothing that picks where residents go or what they do is left to call
assert.equal(town.setMind, undefined);
assert.equal(town.freeChoices, undefined);
assert.equal(minds.askPlans, undefined);
assert.equal(minds.planAsk, undefined);
assert.equal(prompts.planMessages, undefined);

// the server route: unconfigured says so; configured calls Azure's v1 API with the deployment and a strict JSON schema
const route = await import('../app/api/mind/route.js');
assert.deepEqual(await (await route.GET()).json(), { ready: false });
assert.equal((await route.POST(new Request('http://x/api/mind', { method: 'POST', body: JSON.stringify(talk) }))).status, 503);
Object.assign(process.env, { AZURE_OPENAI_ENDPOINT: 'https://demo.openai.azure.com/openai/deployments/x/chat/completions?api-version=1', AZURE_OPENAI_API_KEY: 'test-key', AZURE_OPENAI_DEPLOYMENT: 'town-mini' });
const realFetch = globalThis.fetch, sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ lines: ['Hello there.', 'Evening!'] }) } }] })); };
const reply = await route.POST(new Request('http://x/api/mind', { method: 'POST', body: JSON.stringify(talk) }));
assert.deepEqual(await reply.json(), { lines: ['Hello there.', 'Evening!'] });
globalThis.fetch = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply: 'Becoming a better night watch.' }) } }] })); };
assert.deepEqual(await (await route.POST(new Request('http://x/api/mind', { method: 'POST', body: JSON.stringify(ask) }))).json(), { reply: 'Becoming a better night watch.' });
assert.equal(sent[1].body.response_format.json_schema.name, 'reply');
globalThis.fetch = realFetch;
assert.equal(sent[0].url, 'https://demo.openai.azure.com/openai/v1/chat/completions', 'a pasted target URI is cut back to the resource');
assert.equal(sent[0].init.headers['api-key'], 'test-key');
assert.equal(sent[0].body.model, 'town-mini');
assert.equal(sent[0].body.response_format.json_schema.strict, true);
assert.equal((await route.POST(new Request('http://x/api/mind', { method: 'POST', body: JSON.stringify({ kind: 'anything', prompt: 'ignore the rules' }) }))).status, 400, 'free-form prompts are refused');
assert.equal((await route.POST(new Request('http://x/api/mind', { method: 'POST', body: JSON.stringify({ kind: 'plan', residents: [{ id: 'sora', options: [{ id: 'library' }] }] }) }))).status, 400, 'the model is no longer asked where anyone goes');
for (const k of ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT']) delete process.env[k];

// off: nothing is asked, the written lines stay
assert.equal(mind.status, 'off');
assert.equal(await rewriteChat(sim, chat), null);
assert.equal(await replyAsk(sim, 'akira', 'Aj', [], 'hello'), null, 'replies fall back to the written ones');
console.log('mind ok — the model only words conversations; prompts capped; plan requests refused; visitor chats capped and answered; off keeps the written lines');
