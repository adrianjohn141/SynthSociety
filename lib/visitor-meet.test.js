import assert from 'node:assert/strict';
import { createSim, loadState, saveState, step, RESIDENTS, PEOPLE, requestVisitorMeet, requestVisitorTrip } from './sim.js';
import { mentionedResident, suggestedMeeting, suggestedMeetingRequest, suggestedPlace, meetingFollowUp, writtenReply, heard } from './chat.js';
import { replyAskBody, talkAsk } from './mind.js';
import { chatMessages, talkMessages } from './mind-prompts.js';

const run = (sim, minutes) => { for (let i = 0; i < minutes * 60; i++) step(sim, 1 / 60); };

// Names and requests are data-driven across the whole cast, rather than special cases for one pair.
for (const target of RESIDENTS) {
  const speaker = RESIDENTS.find((r) => r.id !== target.id);
  assert.equal(mentionedResident(`How is ${target.name}?`, speaker.id)?.id, target.id);
  assert.equal(suggestedMeeting(`Why not talk to ${target.name}?`, speaker.id), target.id);
  assert.equal(suggestedMeeting(`Talk to ${target.name}.`, speaker.id), target.id);
  assert.equal(suggestedMeeting(`Go to ${target.name}.`, speaker.id), target.id);
  assert.equal(suggestedMeeting(`Could you say hello to ${target.name}?`, speaker.id), target.id);
  assert.deepEqual(suggestedMeetingRequest(`Could you say hello to ${target.name}?`, speaker.id), { target: target.id, topic: 'greeting' });
  assert.deepEqual(suggestedMeetingRequest(`Please check on ${target.name}.`, speaker.id), { target: target.id, topic: 'check-in' });
  assert.deepEqual(suggestedMeetingRequest(`Talk to ${target.name}.`, speaker.id), { target: target.id, topic: 'conversation' });
  assert.equal(suggestedMeeting(`How often do you talk to ${target.name}?`, speaker.id), null);
}
assert.equal(suggestedMeeting("Why not talk to Nao's?", 'chika'), 'nao', 'possessive punctuation in the reported exchange still names Nao');
assert.deepEqual(suggestedMeetingRequest('Nao seems lonely; please check on Nao.', 'chika'), { target: 'nao', topic: 'check-in' }, 'a visitor concern becomes a check-in, not an assumed feeling');
assert.equal(suggestedMeeting('Nao is here; could you speak to Haru?', 'chika'), 'haru', 'the named person after the requested action is its target');
assert.equal(suggestedMeeting("Let's talk about Nao", 'chika'), null, 'discussing someone with the visitor does not send the NPC away');
const akiraContext = { history: [{ me: false, text: 'Akira is out on the paths. Do you know what he wants to discuss?', at: 184, epoch: 42 }], now: 184, epoch: 42 };
assert.deepEqual(suggestedMeetingRequest("Idk, that's why you need to go to him.", 'fumi', akiraContext), { target: 'akira', topic: 'conversation' }, 'a clear follow-up request resolves the one resident Fumi just named');
assert.deepEqual(suggestedMeetingRequest('Please check on him.', 'fumi', akiraContext), { target: 'akira', topic: 'check-in' });
assert.deepEqual(suggestedMeetingRequest('Say hello to him.', 'fumi', akiraContext), { target: 'akira', topic: 'greeting' });
assert.equal(suggestedMeetingRequest('I will go to him.', 'fumi', akiraContext), null, 'the visitor’s own plan does not command an NPC');
assert.equal(suggestedMeetingRequest('You need to go to him.', 'fumi', { ...akiraContext, now: 215 }), null, 'a stale mention does not resolve a pronoun');
assert.equal(suggestedMeetingRequest('You need to go to him.', 'fumi', { ...akiraContext, epoch: 43 }), null, 'a previous town session is not current context');
assert.equal(suggestedMeetingRequest('You need to go to him.', 'fumi', { ...akiraContext, history: [{ ...akiraContext.history[0], text: 'Akira and Mei might know.' }] }), null, 'two possible residents leave the pronoun ambiguous');
assert.equal(suggestedMeetingRequest('You need to go to him.', 'fumi', { ...akiraContext, history: [{ ...akiraContext.history[0], me: true }] }), null, 'visitor claims alone do not identify whom to send Fumi to');
const fumiScene = createSim(7, 184);
const fumiHistory = [{ ...akiraContext.history[0], epoch: fumiScene.epoch }];
const fumiRequest = suggestedMeetingRequest("Idk, that's why you need to go to him.", 'fumi', { history: fumiHistory, now: fumiScene.t, epoch: fumiScene.epoch });
const fumiDecision = requestVisitorMeet(fumiScene, 'fumi', fumiRequest.target, { commit: false, topic: fumiRequest.topic });
assert.match(chatMessages(replyAskBody(fumiScene, 'fumi', 'Kei', fumiHistory, 'Idk, that is why you need to go to him.', fumiDecision))[0].content, /meeting suggestion: (?:accepted|scheduled|declined) with Akira/, 'the follow-up reaches the ordinary town decision and live reply prompt');

// Each resident can accept the same kind of request when the town actually leaves them free.
const able = new Set();
for (let h = 7; h < 23 && able.size < RESIDENTS.length; h += 0.5) {
  const base = createSim(7, h * 60);
  for (const project of base.projects) project.status = 'complete';
  for (const speaker of RESIDENTS) {
    if (able.has(speaker.id)) continue;
    const sim = loadState(saveState(base));
    for (const target of RESIDENTS) {
      if (target.id === speaker.id) continue;
      if (requestVisitorMeet(sim, speaker.id, target.id).status === 'accepted') { able.add(speaker.id); break; }
    }
  }
}
assert.equal(able.size, RESIDENTS.length, 'every NPC uses the shared meeting path when available');

const original = createSim(7, 7.5 * 60);
assert.equal(requestVisitorMeet(original, 'kenji', 'mei', { commit: false, topic: 'check-in' }).status, 'accepted');
assert.equal(original.people.kenji.visitorMeet, undefined, 'preview does not move someone before they answer');
const accepted = requestVisitorMeet(original, 'kenji', 'mei', { topic: 'check-in' });
assert.equal(accepted.status, 'accepted');
assert.equal(accepted.topic, 'check-in');
assert.equal(requestVisitorMeet(original, 'kenji', 'mei').already, true, 'repeated requests do not reset the trip');
assert.equal(requestVisitorMeet(original, 'kenji', 'mei').topic, 'check-in', 'a repeated request keeps the original topic');
assert.equal(original.people.kenji.visitorMeet.target, 'mei');
assert.equal(meetingFollowUp(original, 'kenji', 'Did you check on Mei?').status, 'pending');
assert.match(writtenReply(original, 'kenji', 'Did you check on Mei?', 'Kei'), /Not yet.*on my way/);
const prompt = chatMessages(replyAskBody(original, 'kenji', 'Kei', [], 'Could you talk to Mei?', accepted))[0].content;
assert.match(prompt, /Person mentioned: Mei/);
assert.match(prompt, /meeting suggestion: accepted with Mei/);
assert.match(prompt, /accepted with Mei \(check-in\)/);
assert.match(prompt, /plan has been saved in the town/);
assert.match(writtenReply(original, 'kenji', 'Could you talk to Mei?', 'Kei', [], accepted), /Mei/);
assert.match(writtenReply(original, 'kenji', 'Please check on Mei', 'Kei', [], accepted), /check on Mei/);

const changed = createSim(7, 7.5 * 60);
assert.equal(requestVisitorMeet(changed, 'kenji', 'mei', { commit: false }).status, 'accepted');
changed.people.kenji.wants = 'rest';
assert.equal(requestVisitorMeet(changed, 'kenji', 'mei').status, 'scheduled', 'availability is checked again before a spoken promise; busy now becomes later');
assert.equal(changed.people.kenji.visitorMeet.status, 'scheduled');

const restored = loadState(saveState(original));
assert.equal(restored.people.kenji.visitorMeet.target, 'mei', 'a promised visit survives a reload');
run(original, 2); run(restored, 2);
assert.equal(saveState(original), saveState(restored), 'travel and conversation replay identically after reload');
assert.equal(original.people.kenji.lastVisitorMeet.status, 'completed');
assert.equal(original.people.kenji.lastVisitorMeet.topic, 'check-in');
assert.match(original.people.kenji.lastVisitorMeet.exchange[0].text, /How are you doing/);
assert.equal(original.people.kenji.lastVisitorMeet.exchange[1].text, original.people.mei.chats.find((c) => c.id === original.people.kenji.chats.find((c) => c.visitorTopic).id).messages[1].text, 'the follow-up uses Mei’s heard reply');
assert.equal(original.people.mei.chats.find((c) => c.id === original.people.kenji.chats.find((c) => c.visitorTopic).id).visitorTopic, 'check-in', 'both residents remember why they talked');
assert.ok(original.people.kenji.chats.filter((c) => c.participants.includes('mei')).length >= 4, 'they keep talking for a few rounds before going back to their day');
assert.match(original.people.kenji.chats[0].messages[0].text, /Good talking, Mei/, 'the talk closes with a goodbye');
const report = writtenReply(original, 'kenji', 'What did Mei say?', 'Kei');
assert.match(report, /checked on Mei/);
assert.ok(report.includes(original.people.kenji.lastVisitorMeet.exchange[1].text), 'written follow-up reports only what Mei said');
assert.equal(writtenReply(loadState(saveState(original)), 'kenji', 'What did Mei say?', 'Kei'), report, 'the actual exchange survives a town reload');
const received = meetingFollowUp(original, 'mei', 'Did Kenji check on you?');
assert.equal(received.role, 'recipient');
assert.equal(received.status, 'completed');
const recipientReport = writtenReply(original, 'mei', 'Did Kenji check on you?', 'Kei');
assert.match(recipientReport, /Kenji checked on me/);
assert.ok(recipientReport.includes(original.people.kenji.lastVisitorMeet.exchange[0].text), 'Mei reports the line she actually heard');
assert.equal(writtenReply(loadState(saveState(original)), 'mei', 'Did Kenji check on you?', 'Kei'), recipientReport);
assert.match(chatMessages(replyAskBody(original, 'mei', 'Kei', [], 'Did Kenji check on you?'))[0].content, /Kenji came to you/);
const reportPrompt = chatMessages(replyAskBody(original, 'kenji', 'Kei', [], 'Did you check on Mei?'))[0].content;
assert.match(reportPrompt, /Follow-up.*check-in with Mei: completed/);
assert.ok(reportPrompt.includes(original.people.kenji.lastVisitorMeet.exchange[1].text), 'Live minds sees the actual exchange');
assert.ok(original.people.kenji.chats.some((chat) => chat.participants.includes('mei')), 'both residents actually spoke nearby');
assert.ok(original.people.mei.chats.some((chat) => chat.participants.includes('kenji')));
assert.deepEqual(original.people.kenji.visitorMemories[0].exchange, original.people.kenji.lastVisitorMeet.exchange, 'the initiator keeps only lines both residents heard');
assert.equal(original.people.mei.visitorMemories[0].role, 'recipient');
assert.deepEqual(original.people.mei.visitorMemories[0].exchange, original.people.kenji.lastVisitorMeet.exchange);
const older = loadState(saveState(original));
older.people.kenji.lastVisitorMeet = { target: 'nao', status: 'cancelled', when: older.t, reason: 'missed them' };
older.people.kenji.chats = [];
older.people.mei.chats = [];
assert.equal(meetingFollowUp(older, 'kenji', 'Did you check on Mei?').status, 'completed', 'confirmed history survives displacement of the last meeting');
assert.equal(meetingFollowUp(older, 'kenji', 'Do you remember checking on Mei?').status, 'completed', 'natural recall questions use the confirmed older event');
assert.equal(meetingFollowUp(older, 'mei', 'Did Kenji check on you?').role, 'recipient', 'the listener keeps a personally heard visit after short chat history expires');
assert.ok(writtenReply(loadState(saveState(older)), 'kenji', 'What did Mei say?', 'Kei').includes(original.people.kenji.lastVisitorMeet.exchange[1].text), 'an older confirmed exchange survives reload');
const memoryPrompt = chatMessages(replyAskBody(older, 'kenji', 'Kei', [], 'Do you remember checking on Mei?'))[0].content;
assert.match(memoryPrompt, /Confirmed past outcomes: You met Mei for a check-in: completed/);
assert.ok(memoryPrompt.includes(original.people.kenji.lastVisitorMeet.exchange[1].text));
const oldSave = JSON.parse(saveState(original));
for (const person of Object.values(oldSave.people)) delete person.visitorMemories;
const migrated = loadState(JSON.stringify(oldSave));
assert.ok(RESIDENTS.every((r) => Array.isArray(migrated.people[r.id].visitorMemories)), 'older town saves gain memory without losing residents');
assert.equal(migrated.people.kenji.visitorMemories[0].role, 'initiator', 'the last recorded outcome is carried into new memory');
assert.equal(migrated.people.mei.visitorMemories[0].role, 'recipient', 'an older conversation enters the listener’s memory only when they heard it');
assert.equal(meetingFollowUp(migrated, 'kenji', 'Did you check on Mei?').status, 'completed', 'older meeting records still answer follow-ups');

const contact = createSim();
assert.match(writtenReply(contact, 'akira', 'Do you remember me?', 'Kei'), /don't think we've spoken before/);
heard(contact, 'akira', 'Kei', 'Nice to see you.');
heard(contact, 'akira', 'Kei', 'Another reply.');
assert.equal(contact.people.akira.visitorContact.times, 1, 'several messages in one sitting count as one contact');
assert.match(writtenReply(loadState(saveState(contact)), 'akira', 'Do you remember me?', 'Kei'), /Of course/);
const oldContact = JSON.parse(saveState(contact));
delete oldContact.people.akira.visitorContact;
assert.equal(loadState(JSON.stringify(oldContact)).people.akira.visitorContact.times, 1, 'previously saved visitor chats are recognized after upgrade');
assert.match(chatMessages(replyAskBody(contact, 'akira', 'Kei', [], 'Do you remember me?'))[0].content, /spoken with the visitor before/);
assert.ok(!saveState(contact).includes('Do you remember me?'), 'a contact record does not copy visitor messages into the town save');

for (const [hour, speaker, target, topic] of [[14, 'riku', 'taro', 'greeting'], [17.5, 'hana', 'sora', 'conversation']]) {
  const sim = createSim(7, hour * 60);
  assert.equal(requestVisitorMeet(sim, speaker, target, { topic }).status, 'accepted');
  run(sim, 3);
  assert.equal(sim.people[speaker].lastVisitorMeet.status, 'completed', `${speaker} reaches ${target} and speaks`);
  assert.ok(sim.people[target].chats.some((chat) => chat.participants.includes(speaker)));
  assert.equal(sim.people[speaker].lastVisitorMeet.topic, topic);
  if (topic === 'greeting') assert.match(sim.people[speaker].lastVisitorMeet.exchange[0].text, /say hello/);
}

const liveTopic = createSim(7, 7.5 * 60);
assert.equal(requestVisitorMeet(liveTopic, 'kenji', 'mei', { topic: 'check-in' }).status, 'accepted');
for (let i = 0; i < 2 * 60 && !liveTopic.pendingChats.some((c) => c.visitorTopic); i++) step(liveTopic, 1 / 60);
const pending = liveTopic.pendingChats.find((c) => c.visitorTopic === 'check-in');
assert.ok(pending, 'the requested topic reaches the visible pending conversation');
assert.match(talkMessages(talkAsk(liveTopic, pending))[1].content, /visitor suggested this check-in/i);

const interrupted = createSim(7, 7.5 * 60);
assert.equal(requestVisitorMeet(interrupted, 'kenji', 'mei').status, 'accepted');
interrupted.people.kenji.visitorMemories = Array.from({ length: 8 }, (_, n) => ({ kind: 'meeting', role: 'initiator', target: 'nao', topic: 'conversation', status: 'cancelled', when: 8 - n, reason: 'missed them', exchange: [] }));
interrupted.people.kenji.wants = 'rest';
run(interrupted, 1);
assert.equal(interrupted.people.kenji.lastVisitorMeet.status, 'cancelled', 'an urgent need takes priority');
assert.ok(!interrupted.people.kenji.chats.some((chat) => chat.participants.includes('mei')), 'an interrupted promise does not create a false conversation');
assert.equal(interrupted.people.kenji.lastVisitorMeet.exchange.length, 0);
assert.equal(interrupted.people.kenji.visitorMemories.length, 8, 'resident memory remains bounded after a real outcome');
assert.equal(interrupted.people.kenji.visitorMemories[0].target, 'mei');
assert.equal(interrupted.people.kenji.visitorMemories.at(-1).when, 2, 'the oldest event is displaced');
assert.equal(interrupted.people.mei.visitorMemories.length, 0, 'the listener cannot remember a visit that never happened');
assert.equal(meetingFollowUp(interrupted, 'mei', 'Did Kenji check on you?'), null, 'the intended listener cannot remember a visit that never happened');
assert.match(writtenReply(interrupted, 'kenji', 'Did you talk to Mei?', 'Kei'), /couldn't meet Mei.*another need or commitment came first/);
assert.match(chatMessages(replyAskBody(interrupted, 'kenji', 'Kei', [], 'Did you talk to Mei?'))[0].content, /visit did not happen/);
assert.match(chatMessages(replyAskBody(interrupted, 'kenji', 'Kei', [], 'Do you remember talking to Mei?'))[0].content, /Your planned conversation with Mei: cancelled/);

const busy = createSim(7, 0.9 * 60);
const refused = requestVisitorMeet(busy, 'chika', 'nao');
assert.equal(refused.status, 'scheduled', 'resting residents put the visitor’s request off until they are free');
assert.equal(busy.people.chika.visitorMeet.status, 'scheduled');
assert.match(writtenReply(busy, 'chika', 'Why not talk to Nao?', 'Kei', [], refused), /plan to talk to Nao/);
assert.equal(requestVisitorMeet(busy, 'chika', 'haru').status, 'declined', 'one visitor plan at a time');

// The visitor's exact phrasings from play reach the town.
assert.deepEqual(suggestedMeetingRequest('Mind going to Riku and talk?', 'akira'), { target: 'riku', topic: 'conversation' });
assert.deepEqual(suggestedMeetingRequest('Meet fumi at bakery she said', 'akira'), { target: 'fumi', topic: 'conversation' });
assert.equal(suggestedPlace('Can you go to the bakery?'), 'bakery');
assert.equal(suggestedPlace('Mind heading over to the pier?'), 'fishing');
assert.equal(suggestedPlace('Please visit Kitsune Shrine.'), 'shrine');
assert.equal(suggestedPlace('I went to the bakery today.'), null, 'a story is not a request');
assert.equal(suggestedPlace('You ought to go to sleep'), null);
assert.equal(suggestedPlace('You ought to go to sleep ya know', 'maple'), 'maple', 'go to sleep sends a resident home');
assert.equal(suggestedPlace('Please go home.', 'willow'), 'willow');
assert.equal(suggestedPlace('go take a bath'), 'bathhouse', 'an errand names its place');
assert.equal(suggestedPlace('Could you go get some bread?'), 'bakery');
assert.equal(suggestedPlace('I went fishing yesterday'), null, 'a story is not an errand');
assert.equal(suggestedPlace('Tell me about the books you read'), null);

// Written answers use what the town knows about the other resident and the speaker's own shift.
{
  const sim = createSim(7, 14 * 60);
  assert.match(writtenReply(sim, 'kenji', 'where is Mei?', 'Kei'), /Mei .*serving|Mei .*at /i);
  assert.match(writtenReply(sim, 'kenji', 'what time do you finish work?', 'Kei'), /shift runs 09:00 to 18:00/);
  assert.match(writtenReply(sim, 'kenji', 'what is the weather like', 'Kei'), /rain|snow|sky|weather/i, 'weather is not read as a "like" question');
  assert.match(writtenReply(sim, 'kenji', 'what does Hana do?', 'Kei'), /Hana is the baker at Mochi Bakery/);
  assert.match(writtenReply(sim, 'kenji', 'where do you live?', 'Kei'), /house at /);
  assert.match(writtenReply(sim, 'kenji', 'thanks, bye', 'Kei'), /See you|Take care|chat again/, 'a goodbye wins over thanks');
}

// A shift no longer stops a resident from doing what the visitor asks.
let onShift = null;
for (let h = 8; h < 20 && !onShift; h += 0.5) {
  const sim = createSim(7, h * 60);
  for (const project of sim.projects) project.status = 'complete';
  const worker = RESIDENTS.find((r) => sim.people[r.id].work && !sim.people[r.id].wants && sim.people[r.id].needs.food >= 35 && sim.people[r.id].needs.energy >= 35);
  if (worker && requestVisitorTrip(sim, worker.id, 'boardwalk', { commit: false }).status === 'accepted') onShift = { sim, id: worker.id };
}
assert.ok(onShift, 'a working resident accepts a visitor errand');
const shiftMeet = RESIDENTS.map((r) => requestVisitorMeet(onShift.sim, onShift.id, r.id, { commit: false })).filter((d) => d.target !== onShift.id);
assert.ok(shiftMeet.every((d) => d.reason !== "I'm working right now"));
assert.ok(shiftMeet.some((d) => d.status !== 'declined'), 'a working resident can meet someone now or later');

// A visitor can send a resident to a place, and they walk there.
const tripTown = createSim(7, 7.5 * 60);
assert.equal(requestVisitorTrip(tripTown, 'kenji', 'fishing', { commit: false }).status, 'accepted');
assert.equal(tripTown.people.kenji.visitorTrip, undefined, 'a preview does not move anyone');
assert.equal(requestVisitorTrip(tripTown, 'kenji', 'fishing').status, 'accepted');
assert.equal(requestVisitorTrip(tripTown, 'kenji', 'fishing').already, true);
assert.match(writtenReply(tripTown, 'kenji', 'Go to the pier', 'Kei', [], { status: 'accepted', place: 'fishing' }), /Reedwater Fishing Pier/);
assert.match(chatMessages(replyAskBody(tripTown, 'kenji', 'Kei', [], 'Go to the pier', { status: 'accepted', place: 'fishing' }))[0].content, /suggestion to go to Reedwater Fishing Pier: accepted/);
const tripReload = loadState(saveState(tripTown));
run(tripTown, 10); run(tripReload, 10);
assert.equal(tripTown.people.kenji.at, 'fishing', 'Kenji walks to the pier');
assert.equal(saveState(tripTown), saveState(tripReload), 'a trip survives a reload');
run(tripTown, 30);
assert.equal(tripTown.people.kenji.visitorTrip, null, 'the trip ends and normal life resumes');
const tired = createSim(7, 6.95 * 60);
assert.equal(requestVisitorTrip(tired, 'akira', 'maple').status, 'accepted', 'a tired resident still goes home when asked');
assert.match(writtenReply(tired, 'akira', 'Go home', 'Kei', [], { status: 'accepted', place: 'maple' }), /home/);

console.log('visitor meetings ok — all NPCs share request parsing, grounded replies, validated travel, real conversation, cancellation, and saved continuity');
