// Optional live minds: Azure OpenAI, reached through this app's own server route (app/api/mind/route.js), words what
// residents say in conversations. It never decides where anyone goes or what they do (residents plan for themselves,
// see lib/goals.js), and the written lines stay whenever the model is off, unconfigured, slow, failing or unusable.
import { PEOPLE, LOC, tier, personalityOf, clockOf, weatherNow, moodOf, relationsOf, bedtimeOf } from './sim.js';
import { chatAbout, nearbyOf, mentionedResident, meetingFollowUp } from './chat.js';

const RELATION = { Rival: 'rivals', Frosty: 'on frosty terms', Stranger: 'near strangers', Acquaintance: 'acquaintances', Friend: 'friends', 'Close friend': 'close friends' };
const MOODS = { chat: 'a friendly chat', heart: 'sweethearts talking softly', storm: 'a small, mild quarrel' };
const PERIOD = (h) => (h < 5 ? 'late night' : h < 11 ? 'morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : h < 20 ? 'evening' : 'night');
const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const mind = { status: 'off', error: '' }; // off | checking | on | no-key | failed
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...mind }));
export const onMind = (f) => { listeners.add(f); f({ ...mind }); return () => listeners.delete(f); };

let failures = 0;
export async function startMind() {
  Object.assign(mind, { status: 'checking', error: '' }); emit();
  try {
    const { ready } = await (await fetch('/api/mind')).json();
    if (mind.status !== 'checking') return; // switched off meanwhile
    failures = 0;
    Object.assign(mind, { status: ready ? 'on' : 'no-key' }); emit();
  } catch {
    Object.assign(mind, { status: 'failed', error: 'The app server did not answer' }); emit();
  }
}
export function stopMind() { Object.assign(mind, { status: 'off', error: '' }); emit(); }

async function post(body) {
  const res = await fetch('/api/mind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (res.status === 429) return null; // over the server's per-minute budget: the rules cover this turn
  if (!res.ok) {
    if (++failures >= 3 && mind.status === 'on') { Object.assign(mind, { status: 'failed', error: out.error ?? `HTTP ${res.status}` }); emit(); }
    return null;
  }
  failures = 0;
  return out;
}

const scene = (sim) => {
  const clock = clockOf(sim);
  return { day: clock.day, date: sim.today.label, hhmm: clock.hhmm, season: sim.today.season, period: PERIOD(clock.h), weather: weatherNow(sim) };
};
const ageOf = (sim, at) => Number.isFinite(at) && at <= sim.t ? Math.floor(sim.t - at) : null;
const scheduleOf = (sim, id) => {
  const r = PEOPLE[id], now = clockOf(sim).h * 60;
  const event = (label, hour) => {
    const at = Math.ceil(hour * 60), minutes = (at - now + 1440) % 1440;
    return { label, at: `${String(Math.floor((at % 1440) / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`, inMinutes: Math.ceil(minutes) };
  };
  const shift = now >= r.hours[0] * 60 && now < r.hours[1] * 60
    ? event('shift ends', r.hours[1]) : event('shift starts', r.hours[0]);
  const bed = r.sleepHours?.[0] ?? bedtimeOf(id), wake = r.sleepHours?.[1] ?? 6;
  const asleep = bed < wake ? now >= bed * 60 && now < wake * 60 : now >= bed * 60 || now < wake * 60;
  const rest = asleep ? event('rest ends', wake) : event('rest starts', bed);
  return { shift, rest };
};
const nameOf = (id) => PEOPLE[id].name;

// ---------- conversations ----------
export function talkAsk(sim, chat) {
  const [a, b] = chat.participants, rel = sim.rel?.[key(a, b)] ?? 0;
  const memories = sim.people[a].chats.filter((c) => c.participants.includes(b)).slice(0, 2)
    .map((c) => ({ text: c.messages.map((m) => `${nameOf(m.speaker)}: ${m.text}`).join(' / '), ageMinutes: ageOf(sim, c.when) }));
  return {
    kind: 'talk', ...scene(sim), place: LOC[chat.at]?.name ?? 'the village paths', visitorTopic: chat.visitorTopic,
    mood: MOODS[sim.people[a].bubble?.kind] ?? MOODS.chat,
    relation: sim.couples?.[key(a, b)] ? 'a couple' : RELATION[tier(rel)],
    speakers: chat.participants.map((id) => ({ name: nameOf(id), job: PEOPLE[id].job, personality: personalityOf(sim, id), mood: moodOf(sim.people[id]).label, schedule: scheduleOf(sim, id) })),
    memories,
    turns: chat.messages.map((m) => ({ name: nameOf(m.speaker), idea: m.text })),
  };
}

// The model's line for a bubble, or null to keep the written one.
export function cleanLine(text) {
  const line = String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean)?.replace(/^[^:]{1,20}:\s*/, '')
    .replace(/\*[^*]*\*|\([^)]*\)/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/["“”*_]/g, '').replace(/\s+/g, ' ').trim() ?? '';
  return line.length >= 2 && line.length <= 90 ? line : null;
}

let talking = 0;
// Lines for every turn of a conversation, or null (off, busy, failed, or the wrong number of usable lines).
export async function rewriteChat(sim, chat) {
  if (mind.status !== 'on' || talking >= 3) return null;
  talking++;
  try {
    const lines = (await post(talkAsk(sim, chat)))?.lines;
    const out = Array.isArray(lines) && lines.length === chat.messages.length ? lines.map(cleanLine) : null;
    return out?.every(Boolean) ? out : null;
  } catch { return null; } finally { talking--; }
}

// ---------- the visitor talking to a resident ----------
export const replyAskBody = (sim, id, visitor, history, text, meeting = null) => {
  const otherId = meeting?.target ?? mentionedResident(text, id)?.id;
  const observed = otherId && nearbyOf(sim, id).includes(PEOPLE[otherId]?.name);
  const other = otherId && PEOPLE[otherId] && sim.people[otherId] ? {
    name: PEOPLE[otherId].name, observed,
    doing: sim.people[otherId].act, at: LOC[sim.people[otherId].at ?? sim.people[otherId].target]?.name ?? 'on the village paths', // a small village: people know roughly where everyone is
    relationship: relationsOf(sim, id).find((rel) => rel.other.id === otherId)?.tier.toLowerCase() ?? 'unknown',
  } : null;
  return { kind: 'chat', ...scene(sim), visitor, me: { ...chatAbout(sim, id), schedule: scheduleOf(sim, id) }, other, meeting: meeting && { ...meeting, targetName: PEOPLE[meeting.target]?.name, placeName: meeting.place && meeting.place === sim.people[id].home ? 'your home' : LOC[meeting.place]?.name }, followUp: meetingFollowUp(sim, id, text), history: history.slice(-8).map((h) => ({ me: h.me, text: h.text, ageMinutes: h.epoch === sim.epoch ? ageOf(sim, h.at) : null })), text };
};
// The resident's answer worded by the model, or null (off, failed, or unusable) so the written reply is used.
export async function replyAsk(sim, id, visitor, history, text, meeting = null) {
  if (mind.status !== 'on') return null;
  try {
    const reply = (await post(replyAskBody(sim, id, visitor, history, text, meeting)))?.reply;
    const line = String(reply ?? '').replace(/\p{Extended_Pictographic}/gu, '').replace(/["“”*_]/g, '').replace(/\s+/g, ' ').trim();
    return line.length >= 2 && line.length <= 240 ? line : null;
  } catch { return null; }
}
