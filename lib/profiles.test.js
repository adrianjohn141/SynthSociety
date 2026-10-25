import assert from 'node:assert/strict';
import { createSim, step, RESIDENTS, LOC, birthdayLabel, hobbyOf, personalityOf } from './sim.js';
import { PROFILES, PROFILE_FORMAT, profileText } from './profiles.js';
import { profileOf, chatAbout, writtenReply, nearbyOf } from './chat.js';
import { chatMessages } from './mind-prompts.js';

const sim = createSim(7, 10 * 60);
for (let i = 0; i < 60 * 30; i++) step(sim, 1 / 60);
const places = Object.values(LOC).map((l) => l.name);

// every resident has a full character sheet that agrees with the sim
for (const r of RESIDENTS) {
  const p = profileOf(sim, r.id);
  for (const [, fields] of PROFILE_FORMAT) for (const [k, label] of fields) assert.ok(String(p[k] ?? '').trim(), `${r.id}: ${label}`);
  assert.ok(p.fullName.startsWith(r.name.replace('Grandpa ', '')) && p.fullName.endsWith(p.lastName), r.id);
  assert.equal(p.birthdate, birthdayLabel(r.id), `${r.id}: birthday`);
  assert.ok(p.hobbies.toLowerCase().includes(hobbyOf(r.id).name.replace('the ', '')), `${r.id}: hobby`);
  if (r.hobbies?.includes('fishing')) assert.match(p.hobbies, /fishing/, r.id);
  assert.equal(p.gender, r.model.includes('female') ? 'Female' : 'Male', `${r.id}: gender`);
  const traits = p.traits.toLowerCase();
  for (const t of personalityOf(sim, r.id)) assert.ok(traits.includes(t.toLowerCase()), `${r.id}: ${t}`);
  for (const name of p.affiliation.match(/[A-Z][a-z]+(?: [A-Z][a-z]+)+/g) ?? []) assert.ok(places.includes(name), `${r.id}: ${name} is a real place`);
}
assert.equal(new Set(RESIDENTS.map((r) => PROFILES[r.id].lastName)).size, RESIDENTS.length - 1, 'only Haru and Riku share a family name');

// the live parts follow the town
const a = profileOf(sim, 'akira');
assert.match(a.maritalStatus, /^(Single|Married|Engaged)/);
assert.ok(a.relationship.length > 0);

// the server reads the profile by id; the browser only sends live state
const about = chatAbout(sim, 'akira');
assert.equal(about.id, 'akira');
assert.ok(about.relations.length >= 5 && about.relations.every((x) => /: /.test(x)), 'who they know and how well');
assert.deepEqual(about.nearby, nearbyOf(sim, 'akira').slice(0, 6));
const prompt = chatMessages({ ...about, me: about, text: 'Who are your friends?' })[0].content;
assert.ok(prompt.includes(profileText('akira').split('\n')[0]) && prompt.includes('People you know best'));
assert.ok(!chatMessages({ me: { ...about, id: 'nobody' }, text: 'hi' })[0].content.includes('Your profile'), 'unknown ids get no profile');

// written replies use the profile and do not repeat themselves
const s = sim.people.akira;
Object.assign(s, { act: 'Patrolling', hidden: false });
assert.match(writtenReply(sim, 'akira', 'Tell me about your family', 'Aj'), /lighthouse keeper/);
assert.match(writtenReply(sim, 'akira', 'How old are you?', 'Aj'), /39, born November 3/);
assert.match(writtenReply(sim, 'akira', 'What do you like?', 'Aj'), /Kitsune Shrine/);
assert.ok(RESIDENTS.some((r) => writtenReply(sim, 'akira', 'Who are your friends?', 'Aj').includes(r.name)), 'names real people they know');
const history = [];
for (let i = 0; i < 3; i++) {
  const reply = writtenReply(sim, 'akira', 'Tell me about yourself', 'Aj', history);
  assert.ok(!history.some((h) => h.text === reply), `a new story each time: ${reply}`);
  history.push({ me: true, text: 'Tell me about yourself' }, { me: false, text: reply });
}
assert.match(history[1].text, /lighthouse stairs with my father/, 'told in their own voice');
console.log('profiles ok — full character sheets agree with the sim, reach the prompt by id, and give varied written replies');
