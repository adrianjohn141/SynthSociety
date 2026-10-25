// Talking with a resident yourself. The visitor types; the resident answers from who they are (lib/profiles.js) and
// their own state (mood, needs, what they are doing, who is around, their friends, goal and lessons). With Live minds
// on, Azure words the answer (lib/mind.js replyAsk); otherwise, or whenever it is slow or failing, a written reply does.
// History is the visitor's own (saved in their browser, capped).
import { RESIDENTS, PEOPLE, LOC, LOCATIONS, HOUSE_NAMES, moodOf, clockOf, weatherNow, personalityOf, goalProgress, partnerOf, relationsOf, isBirthday } from './sim.js';
import { PETS, favouriteOf } from './pets.js';
import { PROFILES } from './profiles.js';

export const HISTORY = 40; // messages kept per resident
export const MAX_TEXT = 200; // characters per typed message
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const residentNames = [...RESIDENTS].sort((a, b) => b.name.length - a.name.length);
const residentMentions = residentNames.flatMap((r) => [r.name, ...(r.name.includes(' ') ? [r.name.split(' ').at(-1)] : [])].map((name) => ({ r, name })));
export function mentionedResident(text, speakerId) {
  return residentMentions.map(({ r, name }) => ({ r, name, at: r.id === speakerId ? -1 : text.search(new RegExp(`\\b${escapePattern(name)}\\b`, 'i')) }))
    .filter((entry) => entry.at >= 0).sort((a, b) => a.at - b.at || b.name.length - a.name.length)[0]?.r ?? null;
}

const asks = (text) => /\b(?:why (?:not|don['’]t you)|(?:can|could|would|will) you|you (?:could|might|should|ought to|need to|have to)|how about you|please|let['’]s|(?:would|do) you mind)\b/i.test(text)
  || /^(?:please\s+)?(?:mind\b|go\b|(?:head|walk)\s+(?:over\s+)?to\b)/i.test(text);

// A place the visitor asks the resident to go to: its id, full name or a distinctive last word ("bakery", "pier").
const lastWord = (l) => l.name.split(' ').at(-1);
const placeMentions = LOCATIONS.flatMap((l) => [l.id, l.name, ...(LOCATIONS.filter((o) => lastWord(o) === lastWord(l)).length === 1 && !['Walk', 'Close', 'Row', 'House'].includes(lastWord(l)) ? [lastWord(l)] : [])].map((name) => ({ loc: l.id, name })));
// "Go take a bath", "go fishing": an errand names the place it happens at.
const ERRANDS = [[/\b(?:hot spring|onsen)\b/i, 'onsen'], [/\b(?:bath|soak)\b/i, 'bathhouse'], [/\bfish(?:ing)?\b/i, 'fishing'], [/\b(?:read|books?|study)\b/i, 'library'],
  [/\b(?:pray|make a wish)\b/i, 'shrine'], [/\b(?:shopping|groceries)\b/i, 'store'], [/\b(?:tea|matcha|dango)\b/i, 'teahouse'], [/\b(?:bread|pastr(?:y|ies)|melon pan)\b/i, 'bakery'], [/\b(?:show|play|theat(?:er|re))\b/i, 'theater']];
export function suggestedPlace(text, home = null) {
  if (home && asks(text) && /\b(?:go(?:ing)?|head(?:ing)?|walk(?:ing)?)\s+(?:back\s+)?home\b|\bgo(?:ing)?\s+(?:to\s+)?(?:sleep|bed)\b|\b(?:get|have|take)\s+some\s+rest\b/i.test(text)) return home;
  const errand = asks(text) && /\bgo(?:ing)?\b/i.exec(text), doing = errand && ERRANDS.find(([re]) => re.test(text.slice(errand.index)));
  if (doing) return doing[1];
  const go = /\b(?:go(?:ing)?|head(?:ing)?|walk(?:ing)?|pop(?:ping)?)\s+(?:over\s+|down\s+|up\s+|out\s+)?(?:to|into)\b|\bvisit(?:ing)?\b/i.exec(text);
  if (!go || !asks(text)) return null;
  const rest = text.slice(go.index + go[0].length);
  return placeMentions.map(({ loc, name }) => ({ loc, name, at: rest.search(new RegExp(`\\b${escapePattern(name)}s?\\b`, 'i')) }))
    .filter((m) => m.at >= 0).sort((a, b) => a.at - b.at || b.name.length - a.name.length)[0]?.loc ?? null;
}

// Only a clear visitor suggestion becomes a town request. Keep its topic bounded so the town
// can carry it into the actual exchange without treating unverified visitor claims as facts.
export function suggestedMeetingRequest(text, speakerId, context = {}) {
  const defer = /\b(?:make|made|set up|arrange|schedule)\s+(?:a\s+)?(?:plans?|meeting|time)\b|\b(?:later|tomorrow|after (?:work|your shift|the shift|the meal|lunch|dinner|breakfast))\b/i.test(text);
  const inquiry = /\b(?:he|she|they|[A-Z][a-z]+)\s+(?:really\s+)?(?:wants?|needs?)\s+to\s+(?:talk|speak|chat)\s+to\s+you\b/i.test(text);
  const request = asks(text)
    || /^(?:well\s*,?\s*)?(?:just\s+)?(?:go\s+)?(?:talk|speak|chat|meet|see|greet|visit|check|say)\b/i.test(text)
    || (defer && /^(?:well\s*,?\s*)?(?:just\s+)?(?:make|made|set up|arrange|schedule)\b/i.test(text));
  const talk = /\b(?:(?:talk|speak|chat)\s+(?:to|with)|go(?:ing)?\s+(?:over\s+)?to|meet|see|greet|visit|check\s+on|say\s+(?:hello|hi)\s+to)\b/i.exec(text);
  if (!request) return null;
  if (talk) {
    const target = (mentionedResident(text.slice(talk.index + talk[0].length), speakerId) ?? mentionedResident(text, speakerId))?.id;
    if (target) return { target, topic: /^check\s+on$/i.test(talk[0]) ? 'check-in' : /^(?:greet|say\s+(?:hello|hi)\s+to)$/i.test(talk[0]) ? 'greeting' : inquiry ? 'inquiry' : 'conversation', ...(defer && { defer: true }) };
  }
  if (defer) {
    const target = mentionedResident(text, speakerId)?.id;
    if (target) return { target, topic: inquiry ? 'inquiry' : 'conversation', defer: true };
  }
  // A pronoun can carry a clear request only from the NPC's immediately previous,
  // recent reply, and only when that reply names one other resident.
  const action = /\b(?:(talk|speak|chat)\s+(?:to|with)|(check)\s+on|(say)\s+(?:hello|hi)\s+to|go\s+to|go\s+(?:see|meet|visit)|meet|see|visit)\s+(him|her|them)\b/i.exec(text);
  const last = context.history?.at(-1);
  if ((!action && !defer) || !last || last.me || last.epoch !== context.epoch || !Number.isFinite(last.at) || !Number.isFinite(context.now) || context.now - last.at < 0 || context.now - last.at > 30) return null;
  const mentioned = [...new Set(residentMentions.filter(({ r, name }) => r.id !== speakerId && new RegExp(`\\b${escapePattern(name)}\\b`, 'i').test(last.text)).map(({ r }) => r.id))];
  return mentioned.length === 1 ? { target: mentioned[0], topic: action?.[2] ? 'check-in' : action?.[3] ? 'greeting' : inquiry ? 'inquiry' : 'conversation', ...(defer && { defer: true }) } : null;
}
export const suggestedMeeting = (text, speakerId) => suggestedMeetingRequest(text, speakerId)?.target ?? null;
const lower = (t) => t[0].toLowerCase() + t.slice(1);
const seeded = (seed) => Math.abs([...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
const pick = (list, seed) => list[seeded(seed) % list.length];
const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? '');
// The sheet is written about them; spoken aloud it is about "me" (a casual fragment like "Grew up by the sea" reads fine).
const spoken = (t) => `${t.replace(/\b(his|her)\b/g, 'my').replace(/\b(His|Her)\b/g, 'My').replace(/\bhim\b/g, 'me').replace(/\b(he|she)\b/g, 'I')}.`;

export const tidyText = (text) => String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

// Who is close by: in the same building, or within a short walk outdoors.
export const nearbyOf = (sim, id) => {
  const s = sim.people[id];
  return RESIDENTS.filter((o) => {
    const q = sim.people[o.id];
    return o.id !== id && q.act !== 'Sleeping' && (s.hidden || q.hidden ? s.at && q.at === s.at && s.hidden === q.hidden : Math.hypot(q.x - s.x, q.z - s.z) < 7);
  }).map((o) => o.name);
};

// Their character sheet with the parts that change as the town lives (partner, friends, pets) filled in now.
export function profileOf(sim, id) {
  const sheet = PROFILES[id], p = partnerOf(sim, id), rels = relationsOf(sim, id);
  const partner = p && PEOPLE[p.id].name;
  const close = rels.filter((x) => x.other.id !== p?.id && x.value >= 40).slice(0, 3).map((x) => `${x.other.name} (${x.tier.toLowerCase()})`);
  const cold = rels.filter((x) => x.value < 0).slice(-1).map((x) => `${x.other.name} (${x.tier.toLowerCase()})`);
  const pets = PETS.filter((pt) => favouriteOf(sim, pt.id) === id).map((pt) => `${pt.name} the ${pt.kind} has picked them as a favourite`);
  return {
    ...sheet,
    maritalStatus: p?.married ? `Married to ${partner}` : p?.engaged ? `Engaged to ${partner}` : p ? `Single, ${p.stage === 'dating' ? 'dating' : 'together with'} ${partner}` : id === 'haru' ? 'Widowed' : 'Single',
    relationship: [partner && `${partner} (${p.married ? 'spouse' : 'partner'})`, ...close, ...cold].filter(Boolean).join(', ') || 'Knows most people only to nod to so far',
    pets: pets.length ? `No pet of their own; ${pets.join('; ')}` : 'No pet of their own',
  };
}

// What a resident knows about themselves right now, as plain fields for the prompt builder.
// Their written profile is looked up by id on the server, so it is not sent from the browser.
export function chatAbout(sim, id) {
  const r = PEOPLE[id], s = sim.people[id], g = s.brain?.goal, partner = partnerOf(sim, id), rels = relationsOf(sim, id);
  return {
    id, name: r.name, job: r.job, work: LOC[r.work].name, personality: personalityOf(sim, id), mood: moodOf(s).label,
    doing: s.act, at: LOC[s.at]?.name ?? 'the village paths', why: s.intent?.plan.reason ?? '',
    goal: g ? `${lower(g.name)} (${Math.round(goalProgress(sim, id) * 100)}% there)` : '',
    lessons: (s.brain?.lessons ?? []).slice(0, 3).map((l) => l.text),
    partner: partner ? PEOPLE[partner.id].name : '',
    relations: [...rels.slice(0, 5), ...rels.filter((x) => x.value < 0).slice(-1)].map((x) => `${x.other.name}: ${x.tier.toLowerCase()}`),
    nearby: nearbyOf(sim, id).slice(0, 6),
    pets: PETS.filter((pt) => favouriteOf(sim, pt.id) === id).map((pt) => `${pt.name} the ${pt.kind}`),
    needs: s.needs.food < 35 ? 'hungry' : s.needs.energy < 35 ? 'tired' : s.needs.fun < 30 ? 'bored' : '',
    birthday: isBirthday(sim, id),
    recent: s.diary.slice(0, 5).map((d) => ({ text: d.text, ageMinutes: Number.isFinite(d.at) && d.at <= sim.t ? Math.floor(sim.t - d.at) : null })),
    visitorContact: s.visitorContact ? { times: s.visitorContact.times, ageMinutes: Number.isFinite(s.visitorContact.lastAt) && s.visitorContact.lastAt <= sim.t ? Math.floor(sim.t - s.visitorContact.lastAt) : null } : null,
    visitorMemories: (s.visitorMemories ?? []).slice(0, 3).map((m) => ({
      role: m.role, target: PEOPLE[m.target]?.name, topic: m.topic, status: m.status, reason: m.reason,
      ageMinutes: Number.isFinite(m.when) && m.when <= sim.t ? Math.floor(sim.t - m.when) : null,
      exchange: (m.exchange ?? []).filter((line) => PEOPLE[line.speaker] && typeof line.text === 'string').slice(0, 2).map((line) => ({ name: PEOPLE[line.speaker].name, text: line.text })),
    })),
    plannedMeeting: s.visitorMeet?.status === 'scheduled' ? { target: PEOPLE[s.visitorMeet.target]?.name, at: clockOf({ t: s.visitorMeet.startAt }).hhmm, day: clockOf({ t: s.visitorMeet.startAt }).day } : null,
    lastMeeting: s.lastVisitorMeet && sim.t - s.lastVisitorMeet.when < 1440 ? {
      target: PEOPLE[s.lastVisitorMeet.target]?.name,
      status: s.lastVisitorMeet.status,
      reason: s.lastVisitorMeet.reason,
      topic: s.lastVisitorMeet.topic,
      ageMinutes: Number.isFinite(s.lastVisitorMeet.when) && s.lastVisitorMeet.when <= sim.t ? Math.floor(sim.t - s.lastVisitorMeet.when) : null,
    } : null,
  };
}

// A follow-up uses a recorded visit when the question points to it.
// The exchange comes from what both residents actually heard, never from the original promise.
export function meetingFollowUp(sim, id, text) {
  const s = sim.people[id], current = s.visitorMeet, last = s.lastVisitorMeet;
  const target = mentionedResident(text, id)?.id;
  if (!/\b(?:did you|have you|were you able to|when will you|how did it go|what happened|what did .+ say|any (?:news|update))\b/i.test(text)
    && !(target && /\bremember\b.{0,50}\b(?:check(?:ed|ing)?|talk(?:ed|ing)?|speak|spoke|said|say|greet(?:ed|ing)?|visit(?:ed|ing)?|meet|met|see|saw)\b/i.test(text))
    && !(target && /\b(?:did|has|have)\b.{0,40}\b(?:check|talk|speak|say|greet|visit|meet|see)\b/i.test(text))) return null;
  if (!/\b(?:talk|talked|talking|speak|spoke|spoken|chat|meet|met|see|saw|greet|visit|check|checked|checking|say|said|go|it|news|update)\b/i.test(text)) return null;
  const general = /\b(?:how did it go|what happened|did you do it|any (?:news|update))\b/i.test(text);
  const remembered = (s.visitorMemories ?? []).find((m) => m.kind === 'meeting' && (target ? m.target === target : general && m.role === 'initiator'));
  const relevant = target ? (current?.target === target ? current : remembered ?? (last?.target === target ? last : null)) : general ? current ?? remembered ?? last : null;
  const received = !relevant && target ? s.chats.find((chat) => chat.visitorTopic && chat.participants.includes(target)) : null;
  if (!relevant && !received) return null;
  const targetId = relevant?.target ?? target;
  if (!PEOPLE[targetId]) return null;
  const exchange = received?.messages ?? (relevant === current ? [] : relevant.exchange ?? []);
  return {
    target: targetId, targetName: PEOPLE[targetId].name, topic: received?.visitorTopic ?? relevant?.topic ?? 'conversation', role: received ? 'recipient' : relevant?.role ?? 'initiator',
    status: received ? 'completed' : relevant === current ? 'pending' : relevant.status, phase: relevant === current ? relevant.status : '', reason: relevant === current || received ? '' : relevant.reason ?? '',
    ...(relevant === current && current.status === 'scheduled' ? { at: clockOf({ t: current.startAt }).hhmm, day: clockOf({ t: current.startAt }).day } : {}),
    exchange: exchange.filter((line) => PEOPLE[line.speaker] && typeof line.text === 'string').slice(0, 2).map((line) => ({ speaker: line.speaker, name: PEOPLE[line.speaker].name, text: line.text })),
  };
}

// A written answer, used whenever the model is off or did not answer. It picks among things this resident
// could truly say about the topic, skipping what they already said in this conversation.
export function writtenReply(sim, id, text, you, history = [], meeting = null) {
  const r = PEOPLE[id], s = sim.people[id], sheet = PROFILES[id], q = text.toLowerCase(), mood = moodOf(s), g = s.brain?.goal;
  if (meeting?.place) {
    const place = meeting.place === s.home ? 'home' : LOC[meeting.place]?.name ?? 'there';
    if (meeting.already) return `I'm already headed to ${place}, ${you}.`;
    if (meeting.status === 'accepted') return s.traits.social < 0.4 ? `All right, ${you}. I'll go to ${place}.` : `Sure, ${you}! I'll head over to ${place}.`;
    return `I'd like to, ${you}, but ${meeting.reason}. Maybe another time.`;
  }
  if (meeting) {
    const name = PEOPLE[meeting.target]?.name ?? 'them';
    const action = meeting.topic === 'check-in' ? `check on ${name}` : meeting.topic === 'greeting' ? `say hello to ${name}` : meeting.topic === 'inquiry' ? `ask ${name} if they wanted to talk` : `talk to ${name}`;
    const when = meeting.day > clockOf(sim).day ? `tomorrow at ${meeting.at}` : `at ${meeting.at}`;
    if (meeting.status === 'scheduled') return `I have a plan to ${action} ${when}, ${you}. I'll try when we're both free.`;
    if (meeting.already) return `I'm already on my way to see ${name}, ${you}.`;
    if (meeting.status === 'accepted') return s.traits.social < 0.4 ? `All right, ${you}. I'll ${action}.` : `That's a kind idea, ${you}. I'll go ${action}.`;
    return `I'd like to, ${you}, but ${meeting.reason} Maybe another time.`;
  }
  const followUp = meetingFollowUp(sim, id, text);
  if (followUp) {
    const name = followUp.targetName;
    if (followUp.phase === 'scheduled') {
      const action = followUp.topic === 'check-in' ? `check on ${name}` : followUp.topic === 'greeting' ? `say hello to ${name}` : followUp.topic === 'inquiry' ? `ask ${name} whether they wanted to talk` : `speak with ${name}`;
      return `Not yet, ${you}. I plan to ${action} ${followUp.day > clockOf(sim).day ? `tomorrow at ${followUp.at}` : `at ${followUp.at}`}. I'll try when we're both free.`;
    }
    if (followUp.status === 'pending') return followUp.phase === 'talking' ? `I'm speaking with ${name} now, ${you}. I'll tell you how it went afterward.` : `Not yet, ${you}. I'm on my way to ${followUp.topic === 'check-in' ? 'check on' : followUp.topic === 'greeting' ? 'say hello to' : 'speak with'} ${name}.`;
    if (followUp.status === 'cancelled') return `I couldn't meet ${name}, ${you}; ${(followUp.reason || 'we missed each other').replace(/[.!?]+$/, '')}.`;
    if (followUp.role === 'recipient') {
      const action = followUp.topic === 'check-in' ? 'checked on me' : followUp.topic === 'greeting' ? 'said hello to me' : followUp.topic === 'inquiry' ? 'came to ask whether I wanted to talk' : 'came to talk with me';
      const said = followUp.exchange.find((line) => line.speaker === followUp.target)?.text;
      return `${name} ${action}, ${you}.${said ? ` ${name} said, “${said}”` : ''}`;
    }
    const action = followUp.topic === 'check-in' ? 'checked on' : followUp.topic === 'greeting' ? 'said hello to' : 'spoke with';
    const answer = followUp.exchange.find((line) => line.speaker === followUp.target)?.text;
    if (followUp.topic === 'inquiry') return `I asked ${name} whether they wanted to talk, ${you}.${answer ? ` ${name} said, “${answer}”` : ''}`;
    return `I ${action} ${name}, ${you}.${answer ? ` ${name} said, “${answer}”` : ''}`;
  }
  if (/\b(?:remember me|know me|met before|spoken before|talked before)\b/.test(q)) {
    return s.visitorContact?.times ? `Of course, ${you}. We spoke ${Math.floor(sim.t - s.visitorContact.lastAt) < 60 ? 'a little while ago' : 'before'}.` : `I don't think we've spoken before, ${you}. It's nice to meet you.`;
  }
  const seed = `${id}|${q}|${Math.floor(sim.t)}`, where = LOC[s.at]?.name, said = new Set(history.filter((h) => !h.me).slice(-8).map((h) => h.text));
  const fresh = (...lines) => { const l = lines.flat().filter(Boolean); return l.find((x) => !said.has(x)) ?? pick(l, seed); }; // most direct answer first
  if (s.act === 'Sleeping') return pick(['Mm... so sleepy. Can we talk tomorrow?', 'Zzz... oh, sorry. It is late. Good night.'], seed);
  const rels = relationsOf(sim, id), p = partnerOf(sim, id), around = nearbyOf(sim, id);
  const friends = rels.filter((x) => x.other.id !== p?.id && x.value >= 40).slice(0, 3);
  const feeling = s.needs.food < 35 ? 'Honestly, I am starving.' : s.needs.energy < 35 ? 'I am worn out today.' : s.needs.fun < 30 ? 'A bit bored, if I am honest.'
    : { Cheerful: 'I feel wonderful today!', Content: 'I am doing well, thanks.', Glum: 'A little low today, but I will manage.' }[mood.label] ?? 'I am alright.';
  const doing = `${s.act}${where ? ` at ${where}` : ''}.`;
  const friendLine = friends.length ? `${friends[0].other.name} is a ${friends[0].tier.toLowerCase()} of mine${friends.length > 1 ? `, and I get on well with ${names(friends.slice(1).map((x) => x.other.name))}` : ''}.`
    : `I am still getting to know people. ${names(rels.slice(0, 2).map((x) => x.other.name))} ${rels.length > 1 ? 'are' : 'is'} who I talk to most.`;
  const aroundLine = around.length ? `${names(around.slice(0, 3))} ${around.length > 1 ? 'are' : 'is'} nearby.` : 'Nobody else is around right now.';
  const pets = PETS.filter((pt) => favouriteOf(sim, pt.id) === id);
  const story = [spoken(sheet.earlyLife), spoken(sheet.keyEvents), spoken(sheet.turningPoints)];

  const other = mentionedResident(text, id), hhmm = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  if (other && /\bwhere\b|\bseen\b/.test(q)) {
    const o = sim.people[other.id], seen = around.includes(other.name);
    return o.act === 'Sleeping' ? `${other.name} is asleep at home, I think.` : `${seen ? `${other.name} is right over there,` : `Last I heard, ${other.name} was`} ${lower(o.act)}${LOC[o.at] ? ` at ${LOC[o.at].name}` : ''}.`;
  }
  if (other && /what does .+ do|\bjob\b|work(?:s)? (?:at|as)/.test(q)) return `${other.name} is the ${other.job.toLowerCase()} at ${LOC[other.work].name}.`;
  if (other && /think (?:of|about)|feel about|opinion|what(?:'s| is) .+ like|do you like|get (?:on|along)|\bknow\b|\bnice\b|\bkind\b/.test(q)) {
    if (p?.id === other.id) return `${other.name}? You know how I feel. We're ${p.married ? 'married' : 'together'}.`;
    const tier = rels.find((x) => x.other.id === other.id)?.tier ?? 'Stranger';
    return { Rival: `${other.name} and I don't see eye to eye.`, Frosty: `We're a bit cool with each other, ${other.name} and me.`, Stranger: `I hardly know ${other.name} yet.`, Acquaintance: `${other.name}? Nice enough. We say hello.`, Friend: `${other.name} is a good friend.`, 'Close friend': `${other.name} is one of my closest friends.` }[tier];
  }
  const shop = LOCATIONS.find((l) => q.includes(l.name.toLowerCase()) || q.includes(lastWord(l).toLowerCase()) && ['Bakery', 'Store', 'Bathhouse', 'Theater', 'Library', 'Market'].includes(lastWord(l)));
  if (shop && /\bopen\b|\bclosed?\b/.test(q)) {
    const h = clockOf(sim).h, staff = RESIDENTS.filter((o) => o.work === shop.id && o.hours);
    const on = staff.find((o) => h >= o.hours[0] && h < o.hours[1]);
    return on ? `${shop.name} is open. ${on.name} is working there now.` : staff.length ? `${shop.name} is closed now. It opens again at ${hhmm(Math.min(...staff.map((o) => o.hours[0])))}.` : `${shop.name} is always open to anyone.`;
  }
  if (/\bsorry\b|apologi/.test(q)) return fresh([`No need to apologise, ${you}.`, "Don't worry about it."]);
  if (/can i help|need (?:any )?help|help you/.test(q)) return fresh([`That's kind, ${you}, but I've got it.`, `Just keeping me company helps, ${you}.`]);
  if (/your name|who are you/.test(q)) return `I'm ${r.name}, the ${r.job.toLowerCase()} at ${LOC[r.work].name}.`;
  if (/where do you live|your (?:house|home)/.test(q)) return `I live in the ${HOUSE_NAMES[s.home]?.[s.house] ?? 'house'} at ${LOC[s.home].name}.`;
  if (/tired|sleepy|exhausted|energy/.test(q)) return s.needs.energy < 35 ? 'Yes, I could use a long rest.' : s.needs.energy < 65 ? 'A little, but I am fine.' : 'Not at all. Plenty of energy today!';
  if (/look (?:sad|down|upset|happy|tired)|are you (?:sad|happy|upset|ok)/.test(q)) return feeling;
  if (/\b(bye|goodbye|see you|good night)\b/.test(q)) return fresh([`See you around, ${you}!`, `Take care, ${you}.`, 'Come and chat again soon.']);
  if (/good job|well done|nice work|thank/.test(q)) return fresh([`Thank you, ${you}!`, `That's kind of you, ${you}.`]);
  if (/how are you|how do you feel|are you (ok|okay|alright)|how's it going|how is it going/.test(q)) return fresh([feeling, `${feeling} ${doing}`]);
  if (/\b(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(q)) return fresh([`Hello, ${you}! ${feeling}`, `Oh, hi ${you}. ${doing}`, `${you}! Nice to see you. ${aroundLine}`]);
  if (/\b(why|how come)\b/.test(q)) return fresh([s.intent?.plan.reason, spoken(sheet.turningPoints), `It is just how I am. ${sheet.traits}.`]);
  if (/famil|parent|mother|father|\bmom\b|\bdad\b|grand|brother|sister|sibling|cousin|son\b|daughter/.test(q)) return fresh([spoken(sheet.families), spoken(sheet.earlyLife)]);
  if (/\b(love|partner|married|marry|dating|date|single|boyfriend|girlfriend|wife|husband)\b/.test(q)) return p ? `${PEOPLE[p.id].name} and I are ${p.married ? 'married' : p.engaged ? 'engaged' : p.stage === 'dating' ? 'dating' : 'together'}.` : fresh(['No one special yet.', `Not at the moment. ${friendLine}`]);
  if (/friend|close to|get on|get along|who do you (know|like|talk)/.test(q)) return fresh([friendLine, friends[0] && `${friends[0].other.name}, mostly. ${friends[0].other.job} at ${LOC[friends[0].other.work].name}.`]);
  if (/around|nearby|who('s| is) (here|there|with)|anyone (here|else)|alone/.test(q)) return fresh([aroundLine, `${aroundLine} ${doing}`]);
  if (/\b(pet|pets|cat|cats|dog|dogs)\b/.test(q)) return pets.length ? `No pet of my own, but ${pets[0].name} the ${pets[0].kind} follows me about.` : 'No pet of my own. I give the village cats a scratch when they let me.';
  if (/birthday|how old|your age|\bage\b|born/.test(q)) return `I am ${sheet.age}, born ${sheet.birthdate}.${isBirthday(sim, id) ? ' It is my birthday today, actually!' : ''}`;
  if (/dislike|hate|can't stand|cannot stand|annoy|bother/.test(q)) return fresh([`${sheet.dislikes}.`, `Honestly? ${lower(sheet.dislikes)}.`]);
  if (/hobby|hobbies|free time|spare time|for fun|day off/.test(q)) return fresh([`${sheet.hobbies}.`, `When I am free? ${lower(sheet.hobbies)}.`]);
  if (/when .*(?:start|finish|done|off)|what time .*(?:work|shift)|your hours/.test(q) && r.hours) {
    const [from, to] = r.hours, h = clockOf(sim).h, on = from < to ? h >= from && h < to : h >= from || h < to;
    return `My shift runs ${hhmm(from)} to ${hhmm(to)}. ${on ? `I finish at ${hhmm(to)}.` : `The next one starts at ${hhmm(from)}.`}`;
  }
  if (/weather|rain|snow|sunny|cloud/.test(q)) return { rain: 'This rain! I hope it clears soon.', snow: 'Snow again. Pretty, but cold.', cloudy: 'A grey sky today. Not bad for a walk.' }[weatherNow(sim)] ?? 'Lovely weather, is it not?';
  if (/gossip|news|heard anything|what's new|anything new/.test(q)) {
    const c = s.chats.find((x) => x.participants.some((o) => o !== id && PEOPLE[o])), name = c && PEOPLE[c.participants.find((o) => o !== id)].name;
    const line = c?.messages.find((m) => m.speaker !== id)?.text;
    return c ? fresh([`I was chatting with ${name}${LOC[c.at] ? ` at ${LOC[c.at].name}` : ''}.${line ? ` ${name} said, “${line}”` : ''}`, `Not much. ${name} and I talked earlier, that's all.`]) : 'All quiet, as far as I know.';
  }
  if (/money|savings|rich|afford|broke|\bpaid\b|\bwages?\b/.test(q)) return s.money < 300 ? 'Money is tight right now, honestly.' : g ? `I get by. Saving a little toward my goal: ${lower(g.name)}.` : s.money > 5000 ? 'I am comfortable, thanks for asking.' : 'Enough to get by.';
  if (/what should i|recommend|suggest|where should i|anything to do/.test(q)) return fresh([`Try ${lower(sheet.likes.split(', ')[0])}. It always cheers me up.`, `${sheet.likes.split(', ').at(-1)}, if you ask me.`]);
  if (/\b(job|work|shift)\b/.test(q)) return fresh([`I work as the ${r.job.toLowerCase()} at ${LOC[r.work].name}.`, spoken(sheet.keyEvents)]);
  if (/\b(like|likes|favou?rite|enjoy)\b/.test(q)) return fresh([`${sheet.likes}.`, `Let me think... ${lower(sheet.likes.split(', ')[0])}, for a start.`]);
  if (/what.*(doing|up to)|busy|right now/.test(q)) return fresh([`${doing} ${s.intent?.plan.reason ?? ''}`.trim(), `${doing} ${aroundLine}`]);
  if (/goal|dream|plan|hope|wish|want|toward|working on|aim/.test(q)) return g ? fresh([`I am trying to ${lower(g.name)}. About ${Math.round(goalProgress(sim, id) * 100)}% of the way there.`, spoken(sheet.turningPoints)]) : 'I am between goals right now. Something will come to me.';
  if (/yourself|about you|who are you|grow up|grew up|childhood|past|story|where.*from|before/.test(q)) return fresh(story);
  if (/learn|lesson|regret|mistake/.test(q)) return s.brain?.lessons[0]?.text ?? 'Nothing much has gone wrong lately.';
  if (/hungry|food|eat/.test(q)) return s.needs.food < 50 ? 'I could really use a meal.' : 'I ate not long ago, thanks.';
  return fresh([s.intent?.plan.reason, s.diary[0] && `${s.diary[0].text} That was my day, more or less.`, aroundLine, ...story, `${sheet.likes.split(', ')[0]}, that is what I am thinking about.`, 'Hmm, I had not thought about that.']);
}

// The resident remembers being spoken to (once an hour at most), and says the answer out loud in the town.
export function heard(sim, id, you, answer) {
  const s = sim.people[id];
  if (!(sim.t - (s.talkedWith ?? -Infinity) < 60)) {
    s.talkedWith = sim.t;
    s.visitorContact = { times: Math.min(999, (s.visitorContact?.times ?? 0) + 1), lastAt: sim.t };
    s.diary.unshift({ when: clockOf(sim).hhmm, at: sim.t, text: `Had a chat with ${you}.` });
    s.diary.length = Math.min(s.diary.length, 40);
  }
  if (!s.hidden) s.bubble = { kind: 'reply', text: answer, until: sim.t + 0.5 }; // the whole answer, wrapped (globals.css .bubble.reply)
}
