// Hinata Village: town layout + autonomous resident simulation.
// Pure JS (no three.js / DOM) so `npm test` can run it in node.
import { createTownLife } from './town-life.js';
import { chatLines } from './talk.js';
import { advanceCeremony } from './ceremony.js';
import { propertyOf, HOME_PRICE } from './housing.js';
export { propertyOf, housingSummary, HOME_PRICE } from './housing.js';
import { initializeConversations, recentExchanges, scheduleConversation, updateConversations } from './conversations.js';
export { householdOf } from './households.js';
export { experienceOf } from './work-life.js';

// Sim time is real local time: 1 sim minute = 1 real minute.
const WALK = 1.4 * 60; // world units per minute (1.4 per real second, a gentle stroll)
const HURRY = 1.2; // a brisker pace in rain or snow
const BODY = 0.35; // collision radius of a resident
const AMBLE = 0.45; // milling about a place is slower than walking somewhere
const PACE_MIN = 0.82, PACE_MAX = 1.18; // slowest and fastest personal stride, as a share of WALK
const EASE = 75; // per minute: about 0.8 real seconds from standing still to a full stride
const BRAKE = 1.2; // world units before the end of a walk where residents start slowing to a stop
const LANE = 0.35; // how far either side of the path centre each resident keeps (meadow lane half width is 0.95)
const LOOK = 0.6; // a passing waypoint this close counts as reached, so walkers ease round corners instead of touching each point
export const HUB_R = 4.5; // district plaza radius
export const JUNCTION_R = 4; // central crossroads radius
export const HUB_DIST = 21; // crossroads centre to a district centre
export const RING = 11; // district centre to a building centre
const DOOR = 3.6; // gathering point in front of a building, from its centre
const rad = (d) => (d * Math.PI) / 180;

// Districts around a central crossroads, each with its own plaza and a road in.
export const DISTRICTS = [
  { id: 'village', name: 'Hinata Village', angle: 225 },
  { id: 'market', name: 'Market District', angle: 345 },
  { id: 'pleasure', name: 'Pleasure District', angle: 105 },
  { id: 'waterfront', name: 'Waterfront District', angle: 45, distance: 42 },
  { id: 'farmland', name: 'Sunfield Farmland', angle: 165, distance: 38 }, // out west, its fields filling the open land
  { id: 'hillside', name: 'Hillside Onsen', angle: 285, distance: 38 }, // out east among the cedar woods
  { id: 'meadow', name: 'Blossom Meadows', angle: 235, distance: 44 },
].map((d) => {
  const ux = -Math.cos(rad(d.angle)), uz = -Math.sin(rad(d.angle)); // towards the crossroads
  const distance = d.distance ?? HUB_DIST;
  const x = -ux * distance, z = -uz * distance;
  return { ...d, distance, x, z, ux, uz, rot: Math.atan2(ux, uz), gate: { x: x + ux * HUB_R, z: z + uz * HUB_R }, road: { x: -ux * JUNCTION_R, z: -uz * JUNCTION_R } };
});
export const DIST = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// offset: degrees around the district plaza, 0 = straight away from the crossroads
function site(id, name, district, offset, blurb) {
  const D = DIST[district], a = rad(D.angle + offset);
  const ux = -Math.cos(a), uz = -Math.sin(a); // towards the district plaza
  const x = D.x - ux * RING, z = D.z - uz * RING;
  return {
    id, name, district, blurb, x, z, ux, uz,
    rot: Math.atan2(ux, uz), // turns a model's +z front towards the plaza
    door: { x: x + ux * DOOR, z: z + uz * DOOR },
    entry: { x: D.x - ux * HUB_R, z: D.z - uz * HUB_R },
  };
}

export const LOCATIONS = [
  site('homes', 'Hinata Row', 'village', -105, 'Three little houses on the village lane.'),
  site('shrine', 'Kitsune Shrine', 'village', -35, 'A quiet shrine beneath the blossoms.'),
  site('library', 'Lantern Library', 'village', 35, 'Storybooks, scrolls and a sleepy cat.'),
  site('willow', 'Willow Lane', 'village', 105, 'Cottages under the willows by the village edge.'),
  site('market', 'Morning Market', 'market', -70, 'Peaches, fish and flowers under striped awnings.'),
  site('bakery', 'Mochi Bakery', 'market', 0, 'Melon pan fresh from the oven at dawn.'),
  site('store', 'Kumo General Store', 'market', 70, 'Rice, candles, thread and everything in between.'),
  site('bathhouse', 'Yuzu Bathhouse', 'pleasure', -70, 'Steaming baths scented with yuzu.'),
  site('theater', 'Hoshi Theater', 'pleasure', 0, 'Kabuki plays every evening under paper lanterns.'),
  site('teahouse', 'Sakura Tea House', 'pleasure', 70, 'Matcha, dango and gossip by the pond.'),
  site('fishing', 'Reedwater Fishing Pier', 'waterfront', 0, 'Three fishing spaces over the reed-fringed lake. Cast, wait for a bite, and reel in supper.'),
  site('cookhouse', 'Waterside Cookhouse', 'waterfront', -80, 'A covered kitchen and picnic tables where neighbours cook their fresh catch.'),
  site('boardwalk', 'Willow Boardwalk', 'waterfront', 80, 'A little pavilion for reading, watching the water, and catching up with friends.'),
  site('farm', 'Sunfield Farm', 'farmland', 0, 'A red barn among vegetable rows and rice paddies. Its produce stocks the market and the general store.'),
  site('farmhouse', 'Sunfield Farmhouse', 'farmland', -80, 'Two snug cottages where the farmers live beside their fields.'),
  site('onsen', 'Kumo Hot Spring', 'hillside', 0, 'A steaming rock pool fed by a little waterfall. Soak away the day under the cedars.'),
  site('woodlot', 'Cedar Woodlot', 'hillside', 80, 'Logs, a chopping block and a woodshed. Its firewood heats the baths and the bakery ovens.'),
  site('cabin', 'Cedar Cabins', 'hillside', -80, 'Two log cabins at the edge of the woods.'),
  site('clover', 'Clover Lane', 'meadow', -82, 'Five cottages with room for a quiet home of your own.'),
  site('blossom', 'Blossom Close', 'meadow', 0, 'Five pastel cottages around the meadow’s outer lane.'),
  site('maple', 'Maple Walk', 'meadow', 82, 'Five snug homes beside the path back into the village.'),
];
export const LOC = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

// Catmull-Rom curve through the given points, sampled about every `step` units
function spline(P, step) {
  const ext = [{ x: 2 * P[0].x - P[1].x, z: 2 * P[0].z - P[1].z }, ...P, { x: 2 * P.at(-1).x - P.at(-2).x, z: 2 * P.at(-1).z - P.at(-2).z }], out = [P[0]];
  for (let i = 1; i < ext.length - 2; i++) {
    const [a, b, c, d] = ext.slice(i - 1, i + 3), n = Math.max(1, Math.round(Math.hypot(c.x - b.x, c.z - b.z) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n, f = (p, q, r, s) => 0.5 * (2 * q + (r - p) * t + (2 * p - 5 * q + 4 * r - s) * t * t + (3 * q - p - 3 * r + s) * t * t * t);
      out.push({ x: f(a.x, b.x, c.x, d.x), z: f(a.z, b.z, c.z, d.z) });
    }
  }
  return out;
}

// Rendering and walking use these same road centre lines. The meadow lane
// curves gently up between the shrine and the library, through the gap by the
// bench, and joins the village plaza (lib/roads.test.js checks its clearance).
export const DISTRICT_ROADS = Object.fromEntries(DISTRICTS.map((d) => [d.id, { width: 2.6, points: [d.gate, d.road] }]));
DISTRICT_ROADS.meadow = { width: 1.9, points: [
  ...spline([
    DIST.meadow.gate, { x: DIST.meadow.gate.x + DIST.meadow.ux * 2, z: DIST.meadow.gate.z + DIST.meadow.uz * 2 },
    { x: -21.4, z: -25 }, { x: -21.15, z: -19 }, { x: -19.8, z: -16.2 }, { x: DIST.village.x, z: DIST.village.z },
  ], 0.8),
  DIST.village.gate, DIST.village.road, DIST.meadow.road,
] };

// model = Kenney Mini Characters file in public/models; wage in yen per hour; romance: false = never dates
export const RESIDENTS = [
  { id: 'hana', name: 'Hana', job: 'Baker', work: 'bakery', home: 'homes', hours: [6, 15], wage: 1150, task: 'Baking melon pan', model: 'character-female-a', likes: ['teahouse', 'shrine'] },
  { id: 'kenji', name: 'Kenji', job: 'Tea Master', work: 'teahouse', home: 'homes', hours: [9, 18], wage: 1300, task: 'Whisking matcha', model: 'character-male-a', likes: ['library', 'bathhouse'] },
  { id: 'yumi', name: 'Yumi', job: 'Shrine Keeper', work: 'shrine', home: 'homes', hours: [7, 16], wage: 1100, task: 'Sweeping the shrine steps', model: 'character-female-b', likes: ['teahouse', 'market'] },
  { id: 'sora', name: 'Sora', job: 'Librarian', work: 'library', home: 'homes', hours: [9, 17], wage: 1200, task: 'Shelving storybooks', model: 'character-male-b', likes: ['theater', 'bakery'] },
  { id: 'riku', hobbies: ['fishing'], name: 'Riku', job: 'Student', work: 'library', home: 'homes', hours: [8, 14], wage: 0, task: 'Studying for exams', model: 'character-male-c', likes: ['bakery', 'store'], romance: false },
  { id: 'aiko', name: 'Aiko', job: 'Grocer', work: 'market', home: 'homes', hours: [7, 16], wage: 1100, task: 'Selling peaches', model: 'character-female-c', likes: ['shrine', 'bathhouse'] },
  { id: 'taro', hobbies: ['fishing'], name: 'Taro', job: 'Fishmonger', work: 'market', home: 'homes', hours: [5, 12], wage: 1200, task: 'Calling out the catch', model: 'character-male-d', likes: ['teahouse', 'bakery'] },
  { id: 'mei', name: 'Mei', job: 'Tea Server', work: 'teahouse', home: 'homes', hours: [11, 20], wage: 1050, task: 'Serving dango', model: 'character-female-d', likes: ['market', 'library'] },
  { id: 'haru', hobbies: ['fishing'], name: 'Grandpa Haru', job: 'Gardener', work: 'shrine', home: 'willow', hours: [6, 10], wage: 1150, task: 'Pruning cherry trees', model: 'character-male-e', likes: ['teahouse', 'bathhouse'], romance: false },
  { id: 'nori', name: 'Nori', job: 'Carpenter', work: 'willow', home: 'willow', hours: [8, 16], wage: 1400, task: 'Fixing a roof', model: 'character-female-e', likes: ['market', 'theater'] },
  { id: 'jun', name: 'Jun', job: 'Shopkeeper', work: 'store', home: 'willow', hours: [8, 17], wage: 1150, task: 'Stocking the shelves', model: 'character-male-f', likes: ['bakery', 'theater'] },
  { id: 'sato', name: 'Sato', job: 'Porter', work: 'store', home: 'willow', hours: [6, 14], wage: 1100, task: 'Hauling crates for the shop', model: 'character-male-a', likes: ['bathhouse', 'store'] },
  { id: 'ren', hobbies: ['fishing'], name: 'Ren', job: 'Bath Attendant', work: 'bathhouse', home: 'willow', hours: [14, 22], wage: 1100, task: 'Stoking the bath fires', model: 'character-female-f', likes: ['bakery', 'shrine'] },
  { id: 'kaede', name: 'Kaede', job: 'Actor', work: 'theater', home: 'willow', hours: [15, 22], wage: 1500, task: 'Performing a kabuki scene', model: 'character-female-a', likes: ['teahouse', 'store'] },
  { id: 'momo', name: 'Momo', job: 'Musician', work: 'theater', home: 'willow', hours: [16, 22], wage: 1150, task: 'Playing the shamisen', model: 'character-female-c', likes: ['library', 'market'] },
  { id: 'kiyo', name: 'Kiyo', job: 'Farmer', work: 'farm', home: 'farmhouse', hours: [6, 15], wage: 1000, task: 'Tending the vegetable rows', model: 'character-female-b', likes: ['market', 'bathhouse'] },
  { id: 'yuki', name: 'Yuki', job: 'Onsen Keeper', work: 'onsen', home: 'cabin', hours: [14, 21], wage: 1100, task: 'Raking the hot spring stones', model: 'character-female-d', likes: ['teahouse', 'library'] },
  { id: 'takumi', name: 'Takumi', job: 'Woodcutter', work: 'woodlot', home: 'cabin', hours: [7, 15], wage: 1000, task: 'Splitting firewood', model: 'character-male-f', likes: ['onsen', 'bakery'] },
  { id: 'daichi', name: 'Daichi', job: 'Farmhand', work: 'farm', home: 'farmhouse', hours: [7, 16], wage: 950, task: 'Harvesting the fields', model: 'character-male-d', likes: ['bakery', 'teahouse'] },
  { id: 'akira', name: 'Akira', job: 'Night Watch', work: 'boardwalk', home: 'maple', hours: [0, 6], sleepHours: [7, 15], wage: 1050, task: 'Patrolling the lantern paths', patrol: true, model: 'character-male-e', likes: ['shrine', 'boardwalk'], traits: { social: 0.3, thrift: 0.7, curiosity: 0.6, routine: 0.9 } },
  { id: 'fumi', name: 'Fumi', job: 'Baker', work: 'bakery', home: 'clover', hours: [3, 10], sleepHours: [19, 3], wage: 1100, task: 'Kneading the morning dough', model: 'character-female-f', likes: ['farm', 'library'], traits: { social: 0.65, thrift: 0.8, curiosity: 0.3, routine: 0.95 } },
  { id: 'nao', name: 'Nao', job: 'Bath Attendant', work: 'bathhouse', home: 'blossom', hours: [18, 24], sleepHours: [1, 9], wage: 1100, task: 'Tending the late bath', model: 'character-male-c', likes: ['onsen', 'teahouse'], traits: { social: 0.8, thrift: 0.3, curiosity: 0.6, routine: 0.6 } },
  { id: 'chika', name: 'Chika', job: 'Tea Server', work: 'teahouse', home: 'blossom', hours: [18, 24], sleepHours: [1, 9], wage: 1100, task: 'Preparing late tea and dango', model: 'character-female-e', likes: ['theater', 'boardwalk'], traits: { social: 0.95, thrift: 0.2, curiosity: 0.8, routine: 0.4 } },
  { id: 'itsuki', name: 'Itsuki', job: 'Librarian', work: 'library', home: 'maple', hours: [16, 23], sleepHours: [0, 8], wage: 1150, task: 'Keeping the evening reading room', model: 'character-male-b', likes: ['shrine', 'onsen'], traits: { social: 0.2, thrift: 0.6, curiosity: 0.95, routine: 0.7 } },
  { id: 'hotaru', name: 'Hotaru', job: 'Grocer', work: 'market', home: 'clover', hours: [5, 12], sleepHours: [20, 4], wage: 1050, task: 'Weighing the dawn produce', model: 'character-female-d', likes: ['fishing', 'farm'], traits: { social: 0.7, thrift: 0.9, curiosity: 0.5, routine: 0.8 } },
];
export const bedtimeOf = (id) => RESIDENTS.find((r) => r.id === id)?.sleepHours?.[0] ?? 21.5 + hash('bed', id) * 1.5;
export const PEOPLE = Object.fromEntries(RESIDENTS.map((r) => [r.id, r]));

// Starting affinities that override the random 5–35 baseline.
const TIES = [['hana', 'kenji', 72], ['riku', 'haru', 80], ['aiko', 'taro', 58], ['yumi', 'mei', 66], ['sora', 'riku', 44], ['nori', 'hana', 38], ['kaede', 'momo', 70], ['jun', 'sato', 50], ['ren', 'kaede', 45], ['kiyo', 'daichi', 62], ['kiyo', 'aiko', 40], ['daichi', 'sato', 38], ['yuki', 'takumi', 55], ['yuki', 'ren', 50], ['takumi', 'nori', 45]];

const STARGAZE = { boardwalk: 'Stargazing from the boardwalk', shrine: 'Watching the stars by the shrine', onsen: 'Stargazing from the hot spring', fishing: 'Counting stars over the lake' };
const LEISURE = {
  farm: 'Watching the harvest', farmhouse: 'Pottering in the garden', cabin: 'Pottering in the garden',
  clover: 'Pottering in the garden', blossom: 'Pottering in the garden', maple: 'Pottering in the garden',
  onsen: 'Soaking in the hot spring', woodlot: 'Walking in the cedar woods',
  fishing: 'Watching the floats', cookhouse: 'Relaxing at the picnic tables', boardwalk: 'Enjoying the waterfront',
  homes: 'Pottering in the garden', willow: 'Pottering in the garden', shrine: 'Making a wish', library: 'Reading a novel',
  market: 'Browsing the stalls', bakery: 'Snacking on buns', store: 'Chatting with the shopkeeper',
  bathhouse: 'Relaxing in the bath', theater: 'Watching a play', teahouse: 'Sipping tea',
};
const NIGHTLIFE = ['teahouse', 'bathhouse', 'theater', 'onsen'];

// What a visitor (not a worker) buys on arriving somewhere: [base price in yen, diary line]
const SHOP = {
  bakery: [500, 'Bought a warm melon pan'],
  teahouse: [650, 'Treated myself to matcha and dango'],
  market: [850, 'Picked up a basket of peaches'],
  store: [600, 'Picked up candles and thread'],
  shrine: [150, 'Dropped a coin in the offering box'],
  bathhouse: [600, 'Soaked in the yuzu bath'],
  onsen: [800, 'Soaked in the hillside hot spring'],
  theater: [1500, 'Watched a kabuki play'],
};

// Walkable graph: door - plaza entry - other entries / district gate - crossroads - other districts.
const NODES = [], EDGES = [];
const node = (p) => {
  const existing = NODES.findIndex((q) => Math.hypot(q.x - p.x, q.z - p.z) < 1e-6);
  if (existing >= 0) return existing;
  NODES.push(p); EDGES.push([]); return NODES.length - 1;
};
const link = (a, b) => { if (a !== b && !EDGES[a].includes(b)) { EDGES[a].push(b); EDGES[b].push(a); } };
const DOOR_NODE = {}, ENTRY_NODE = {};
for (const D of DISTRICTS) {
  D.gateNode = node(D.gate);
  D.roadNode = node(D.road);
  const roadNodes = [D.gateNode, ...DISTRICT_ROADS[D.id].points.slice(1, -1).map(node), D.roadNode];
  for (let i = 1; i < roadNodes.length; i++) link(roadNodes[i - 1], roadNodes[i]);
  const entries = [D.gateNode];
  for (const l of LOCATIONS.filter((l) => l.district === D.id)) {
    const e = node(l.entry);
    ENTRY_NODE[l.id] = e;
    DOOR_NODE[l.id] = node(l.door);
    link(DOOR_NODE[l.id], e);
    for (const o of entries) link(e, o); // straight across the open plaza
    entries.push(e);
  }
}
const meadowJunction = node({ x: DIST.village.x, z: DIST.village.z });
for (const l of LOCATIONS.filter((l) => l.district === 'village')) link(meadowJunction, ENTRY_NODE[l.id]);
for (let a = 0; a < DISTRICTS.length; a++) for (let b = a + 1; b < DISTRICTS.length; b++) link(DISTRICTS[a].roadNode, DISTRICTS[b].roadNode);

function shortest(from, to) {
  const dist = NODES.map(() => Infinity), prev = [], done = new Set();
  dist[from] = 0;
  while (done.size < NODES.length) {
    let u = -1;
    for (let k = 0; k < NODES.length; k++) if (!done.has(k) && (u < 0 || dist[k] < dist[u])) u = k;
    if (u === to) break;
    done.add(u);
    for (const v of EDGES[u]) {
      const d = dist[u] + Math.hypot(NODES[u].x - NODES[v].x, NODES[u].z - NODES[v].z);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path.map((k) => NODES[k]);
}

export function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic 0..1 from any parts, so daily choices are stable within an hour.
function hash(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// The same generator, but its state lives in the sim so a saved town resumes the same stream.
function rand(sim) {
  let t = (sim.seed = (sim.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const tier = (v) => (v < -30 ? 'Rival' : v < 0 ? 'Frosty' : v < 15 ? 'Stranger' : v < 40 ? 'Acquaintance' : v < 70 ? 'Friend' : 'Close friend');
export const yen = (n) => `¥${Math.floor(n).toLocaleString('en-US')}`;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function clockOf(sim) {
  const m = Math.floor(sim.t % 1440);
  return { day: Math.floor(sim.t / 1440) + 1, h: m / 60, hhmm: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
}

function note(sim, id, text) {
  const d = sim.people[id].diary;
  d.unshift({ when: clockOf(sim).hhmm, at: sim.t, text });
  d.length = Math.min(d.length, 40);
}

// ---------- calendar: seasons, weather and the weekly festival follow the real date ----------
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const WET = { spring: 0.35, summer: 0.3, autumn: 0.35, winter: 0.3 };

function dayInfo(sim) {
  const day = Math.floor(sim.t / 1440);
  const d = new Date(sim.epoch + day * 86400000 + 12 * 3600000); // noon, clear of DST shifts
  const season = SEASONS[d.getMonth()], k = d.toDateString(), x = hash('wx', k);
  let weather = { kind: x < WET[season] + 0.25 ? 'cloudy' : 'clear' };
  if (x < WET[season]) {
    const from = 6 + Math.floor(hash('wx-from', k) * 12);
    weather = { kind: season === 'winter' ? 'snow' : 'rain', from, to: from + 3 + Math.floor(hash('wx-len', k) * 5) };
  }
  return { day, season, weather, festival: d.getDay() === 6, md: `${d.getMonth() + 1}-${d.getDate()}`, label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) };
}
// Everyone's birthday is fixed by their name, so it is the same in every town.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const birthdayOf = (id) => { const m = Math.floor(hash('birth-month', id) * 12), d = 1 + Math.floor(hash('birth-day', id) * 28); return { md: `${m + 1}-${d}`, label: `${MONTHS[m]} ${d}` }; };
export const birthdayLabel = (id) => birthdayOf(id).label;
export const isBirthday = (sim, id) => birthdayOf(id).md === (sim.today.md ?? dayInfo(sim).md);

// 'clear' | 'cloudy' | 'rain' | 'snow' right now
export function weatherNow(sim) {
  const w = sim.today.weather, { h } = clockOf(sim);
  if (w.from !== undefined) return h >= w.from && h < w.to ? w.kind : 'cloudy';
  return w.kind;
}
const isWet = (sim) => ['rain', 'snow'].includes(weatherNow(sim));
export const festivalNow = (sim) => sim.today.festival && clockOf(sim).h >= 17 && clockOf(sim).h < 22;

// ---------- economy: shops keep a till, the town treasury collects rent and pays public jobs ----------
const RENT = { homes: 2100, willow: 1700, farmhouse: 1500, cabin: 1500, clover: 1500, blossom: 1500, maple: 1500 }; // per resident per day, halved for a couple living together
const TAX = 0.1; // share of every wage that goes to the treasury
const GRANT = 1500; // daily study grant from the treasury for residents without a wage (rent-free)
const SHOP_TILLS = ['bakery', 'teahouse', 'market', 'store', 'bathhouse', 'theater', 'farm', 'onsen', 'woodlot'];
const tillOf = (sim, loc) => (loc in sim.tills ? loc : 'town');
export const priceAt = (sim, loc) => Math.round((SHOP[loc][0] * sim.prices[loc]) / 10) * 10;
export const TILL_NAME = (sim, loc) => (tillOf(sim, loc) === 'town' ? 'Town treasury' : `${LOC[loc].name} till`);
export const tillFor = (sim, loc) => sim.tills[tillOf(sim, loc)];

function setPrices(sim) {
  for (const loc of Object.keys(SHOP)) {
    const till = sim.tills[tillOf(sim, loc)];
    // daily wobble, nudged up when the till is low so shops can keep paying wages
    const f = 0.85 + 0.3 * hash('price', loc, sim.today.day) + (till < 15000 ? 0.15 : till > 60000 ? -0.1 : 0);
    sim.prices[loc] = loc === 'shrine' ? 1 : clamp(f, 0.75, 1.4);
    sim.sales[loc] = 0;
  }
}

function newDay(sim) {
  sim.today = dayInfo(sim);
  anniversaries(sim);
  for (const r of RESIDENTS) if (isBirthday(sim, r.id)) note(sim, r.id, 'It’s my birthday today!');
  for (const r of RESIDENTS) sim.people[r.id].pot = Math.max(0, (sim.people[r.id].pot ?? 3) - 1.5); // unwatered pots droop a little each day
  planWedding(sim);
  // the treasury taxes thriving shops and tops up struggling ones from what it holds beyond its wage reserve
  const shops = Object.keys(sim.tills).filter((k) => k !== 'town');
  for (const k of shops) if (sim.tills[k] > 30000) { const tax = (sim.tills[k] - 30000) / 2; sim.tills[k] -= tax; sim.tills.town += tax; }
  const payroll = (k) => Math.max(12000, RESIDENTS.filter((r) => tillOf(sim, r.work) === k).reduce((n, r) => n + r.wage * (r.hours[1] - r.hours[0]), 0)); // enough for a day of wages
  // half of what it holds beyond the reserve, shared by need so no shop starves for being late in the list
  const short = Object.fromEntries(shops.map((k) => [k, Math.max(0, payroll(k) - sim.tills[k])])), need = Object.values(short).reduce((a, b) => a + b, 0);
  const spare = Math.min(need, Math.max(0, sim.tills.town - 28000) / 2);
  for (const k of shops) if (short[k]) { const aid = spare * short[k] / need; sim.tills[k] += aid; sim.tills.town -= aid; }
  setPrices(sim);
  // on festival day the treasury shares out what it holds beyond its reserve
  const share = sim.today.festival ? Math.max(0, sim.tills.town - 45000) / 2 / RESIDENTS.length : 0;
  for (const r of RESIDENTS) {
    const s = sim.people[r.id], c = coupleOf(sim, r.id);
    if (share >= 100) {
      s.money += share;
      sim.tills.town -= share;
      note(sim, r.id, `The town shared its festival fund: ${yen(share)} for everyone.`);
    }
    if (!r.wage) {
      const grant = Math.min(GRANT, sim.tills.town);
      s.money += grant;
      sim.tills.town -= grant;
      note(sim, r.id, `Got my ${yen(grant)} study grant.`);
      continue;
    }
    const owner = propertyOf(sim, r.id)?.owner;
    const p = partnerOf(sim, r.id), ps = p && sim.people[p.id];
    if (owner === r.id || (owner === p?.id && p.stage === 'together' && ps.home === s.home && ps.house === s.house)) continue;
    const rent = RENT[s.home] / (c?.stage === 'together' ? 2 : 1), paid = Math.min(rent, s.money);
    s.money -= paid;
    sim.tills.town += paid;
    note(sim, r.id, paid < rent ? `Could only scrape together ${yen(paid)} of my ${yen(rent)} rent.` : `Paid ${yen(rent)} rent for ${LOC[s.home].name}.`);
  }
}

// ---------- relationships ----------
const coupleOf = (sim, id) => Object.entries(sim.couples).find(([k]) => k.split(':').includes(id))?.[1] ?? null;
export function partnerOf(sim, id) {
  const k = Object.keys(sim.couples).find((k) => k.split(':').includes(id));
  return k ? { id: k.split(':').find((x) => x !== id), ...sim.couples[k] } : null;
}

// ---------- daily plans ----------
const working = (r, h) => h >= r.hours[0] && h < r.hours[1];
function mealBreak(r, h) {
  if (r.hours[1] - r.hours[0] < 7) return false;
  const peers = RESIDENTS.filter((o) => o.work === r.work && o.hours[1] - o.hours[0] >= 7 && (o.hours[0] > 12) === (r.hours[0] > 12));
  const base = Math.min(r.hours[0] > 12 ? 17 : 12, Math.min(...peers.map((o) => o.hours[1])) - 1);
  const length = peers.length > 1 ? 0.5 : 1;
  const start = base + peers.indexOf(r) * length;
  return h >= start && h < start + length;
}
export const isHome = (loc) => Object.hasOwn(HOUSES, loc);
const INDOOR = new Set(['bakery', 'teahouse', 'library', 'store', 'bathhouse']); // staff work out of sight
const FOOD = ['bakery', 'teahouse', 'market'];
const MEET_MINUTES = 15;
const VISIT_ROUNDS = 4; // a visitor-asked talk: the asked-for exchange, two rounds of chat, then goodbyes
const TRIP_MINUTES = 30; // how long a resident stays somewhere a visitor sent them
const MEET_SCHEDULE_GRACE = 60;
const MEET_TOPICS = new Set(['greeting', 'check-in', 'conversation', 'inquiry']);
const VISITOR_MEMORY_LIMIT = 8;
function initializeVisitorMemory(sim) {
  for (const [id, s] of Object.entries(sim.people)) {
    if (!Array.isArray(s.visitorMemories)) {
      const last = s.lastVisitorMeet;
      const initiated = last && PEOPLE[last.target] && Number.isFinite(last.when)
        ? [{ kind: 'meeting', role: 'initiator', target: last.target, topic: last.topic ?? 'conversation', status: last.status, when: last.when, reason: last.reason ?? '', exchange: last.exchange ?? [] }] : [];
      const received = (s.chats ?? []).filter((chat) => chat.visitorTopic && chat.participants?.[1] === id && PEOPLE[chat.participants[0]] && Number.isFinite(chat.when))
        .map((chat) => ({ kind: 'meeting', role: 'recipient', target: chat.participants[0], topic: chat.visitorTopic, status: 'completed', when: chat.when, exchange: chat.messages ?? [] }));
      s.visitorMemories = [...initiated, ...received].sort((a, b) => b.when - a.when).slice(0, VISITOR_MEMORY_LIMIT);
    }
    if (!s.visitorContact && Number.isFinite(s.talkedWith)) s.visitorContact = { times: 1, lastAt: s.talkedWith };
  }
}
const minutesToBed = (r, h) => ((24 + (r.sleepHours?.[0] ?? bedtimeOf(r.id)) - h) % 24) * 60;
function freeForMeeting(r, t) {
  const h = ((t % 1440) + 1440) % 1440 / 60;
  const asleep = r.sleepHours
    ? (r.sleepHours[0] < r.sleepHours[1] ? h >= r.sleepHours[0] && h < r.sleepHours[1] : h >= r.sleepHours[0] || h < r.sleepHours[1]) && !working(r, h)
    : h < 6 || h >= bedtimeOf(r.id);
  return !asleep && !working(r, h) && minutesToBed(r, h) > MEET_MINUTES;
}
function nextVisitorMeetingTime(sim, a, b) {
  for (let t = Math.ceil((sim.t + 5) / 15) * 15; t <= sim.t + 1440; t += 15) {
    if (freeForMeeting(a, t) && freeForMeeting(a, t + MEET_MINUTES) && freeForMeeting(b, t) && freeForMeeting(b, t + MEET_MINUTES)) return t;
  }
  return null;
}

function finishVisitorMeet(sim, id, status, reason = '') {
  const s = sim.people[id], meeting = s.visitorMeet;
  if (!meeting) return;
  if (status === 'cancelled' && meeting.rounds) status = 'completed'; // the asked-for exchange happened; only the small talk after it was cut short
  const exchange = status === 'completed' ? (s.chats.find((chat) => chat.id === meeting.chat)?.messages ?? []).map(({ speaker, text }) => ({ speaker, text })) : [];
  s.visitorMeet = null;
  s.lastVisitorMeet = { target: meeting.target, topic: meeting.topic ?? 'conversation', status, when: sim.t, reason, exchange };
  const memory = { kind: 'meeting', role: 'initiator', target: meeting.target, topic: meeting.topic ?? 'conversation', status, when: sim.t, reason, exchange };
  s.visitorMemories ??= [];
  s.visitorMemories.unshift(memory);
  s.visitorMemories.length = Math.min(s.visitorMemories.length, VISITOR_MEMORY_LIMIT);
  if (status === 'completed') {
    const listener = sim.people[meeting.target];
    listener.visitorMemories ??= [];
    listener.visitorMemories.unshift({ kind: 'meeting', role: 'recipient', target: id, topic: memory.topic, status, when: sim.t, exchange });
    listener.visitorMemories.length = Math.min(listener.visitorMemories.length, VISITOR_MEMORY_LIMIT);
  }
  const name = PEOPLE[meeting.target].name;
  const did = meeting.topic === 'check-in' ? `Checked on ${name}` : meeting.topic === 'greeting' ? `Said hello to ${name}` : `Spoke with ${name}`;
  note(sim, id, status === 'completed' ? `${did}.` : `Could not meet ${name}${reason ? `: ${reason}` : ''}.`);
}

// A visitor may suggest a meeting, but only the simulation can accept and carry it out.
// This uses resident IDs and the same availability rules for every member of RESIDENTS.
export function requestVisitorMeet(sim, id, targetId, { commit = true, topic = 'conversation', defer = false } = {}) {
  topic = MEET_TOPICS.has(topic) ? topic : 'conversation';
  const r = PEOPLE[id], other = PEOPLE[targetId], s = sim.people[id], target = sim.people[targetId];
  if (!r || !other || id === targetId || !s || !target) return { status: 'declined', target: targetId, topic, reason: 'I cannot find that person' };
  const decline = (reason) => ({ status: 'declined', target: targetId, topic, reason });
  if (s.visitorMeet) return s.visitorMeet.target === targetId ? {
    status: s.visitorMeet.status === 'scheduled' ? 'scheduled' : 'accepted', target: targetId,
    topic: s.visitorMeet.topic ?? 'conversation', already: true,
    ...(s.visitorMeet.status === 'scheduled' ? { at: clockOf({ t: s.visitorMeet.startAt }).hhmm, day: clockOf({ t: s.visitorMeet.startAt }).day, startAt: s.visitorMeet.startAt } : {}),
  } : decline(`I already have plans to see ${PEOPLE[s.visitorMeet.target].name}`);
  if ((s.brain?.avoid?.[targetId] ?? 0) > sim.t) return decline(`I'd rather give ${other.name} some space`);
  // When now is not possible, the request becomes a plan for the next moment both are free.
  const later = (reason) => {
    const startAt = nextVisitorMeetingTime(sim, r, other);
    if (startAt == null) return decline(reason ?? `I can't find time to meet ${other.name} before tomorrow is over`);
    if (commit) s.visitorMeet = { target: targetId, topic, started: sim.t, startAt, status: 'scheduled', allowInside: true };
    return { status: 'scheduled', target: targetId, topic, at: clockOf({ t: startAt }).hhmm, day: clockOf({ t: startAt }).day, startAt };
  };
  if (defer) return later();
  const mine = planFor(r, sim), theirs = planFor(other, sim), h = clockOf(sim).h;
  const atWork = (theirs.work || target.work) && target.at === other.work; // staff can talk with a caller at their own workplace
  const busy = mine.sleep || s.act === 'Sleeping' || minutesToBed(r, h) < 3 ? 'I need to rest soon'
    : s.wants || s.needs.energy < 35 || s.needs.food < 35 ? 'I need to take care of myself first'
      : mine.meal ? "I'm in the middle of a meal"
        : !mine.flexible && !mine.work ? 'I have another plan I need to keep' // a shift can spare a short errand for the visitor
          : theirs.sleep || target.act === 'Sleeping' || minutesToBed(other, h) < 3 ? `${other.name} needs to rest soon`
            : ((theirs.work || target.work) && !atWork) || target.visitorMeet ? `${other.name} is busy right now`
              : theirs.meal ? `${other.name} is in the middle of a meal`
                : !atWork && (target.hidden || target.walking || !target.at || !theirs.flexible) ? `I can't catch ${other.name} right now` : '';
  if (busy) return later(busy);
  if (commit) {
    s.visitorMeet = { target: targetId, topic, started: sim.t, until: sim.t + MEET_MINUTES, status: 'going', ...(atWork && { allowInside: true }) };
    s.nextAct = sim.t;
  }
  return { status: 'accepted', target: targetId, topic };
}

// A visitor may also send a resident somewhere. The same needs still come first; a shift can spare the walk.
export function requestVisitorTrip(sim, id, loc, { commit = true } = {}) {
  const r = PEOPLE[id], s = sim.people[id], place = LOC[loc];
  if (!r || !s || !place) return { status: 'declined', place: loc, reason: 'I do not know that place' };
  const decline = (reason) => ({ status: 'declined', place: loc, reason });
  if (s.visitorTrip?.loc === loc && sim.t < s.visitorTrip.until) return { status: 'accepted', place: loc, already: true };
  if (s.visitorMeet) return decline(`I already have plans to see ${PEOPLE[s.visitorMeet.target].name}`);
  const mine = planFor(r, sim), home = loc === s.home; // going home to rest is always welcome
  if (!home && (mine.sleep || s.act === 'Sleeping' || minutesToBed(r, clockOf(sim).h) < 3)) return decline('I need to rest soon');
  if (!home && (s.wants || s.needs.energy < 35 || s.needs.food < 35)) return decline('I need to take care of myself first');
  if (mine.meal) return decline("I'm in the middle of a meal");
  if (commit) { s.visitorTrip = { loc, until: sim.t + TRIP_MINUTES }; s.nextAct = sim.t; }
  return { status: 'accepted', place: loc };
}
function visitorTripPlan(sim, r) {
  const s = sim.people[r.id], trip = s.visitorTrip;
  if (!trip) return null;
  if (sim.t >= trip.until || !LOC[trip.loc]) { s.visitorTrip = null; return null; }
  if (trip.loc === s.home) return { loc: s.home, act: 'Resting at home', inside: true, visitorTrip: true, reason: 'A visitor suggested I go home and rest.' };
  return { loc: trip.loc, act: LEISURE[trip.loc] ?? `Visiting ${LOC[trip.loc].name}`, visitorTrip: true, reason: `A visitor suggested I go to ${LOC[trip.loc].name}.` };
}
const visitorPlan = (sim, r) => visitorMeetPlan(sim, r) ?? visitorTripPlan(sim, r);

function visitorMeetPlan(sim, r) {
  const s = sim.people[r.id], meeting = s.visitorMeet;
  if (!meeting) return null;
  const other = PEOPLE[meeting.target], target = sim.people[meeting.target];
  if (meeting.status === 'scheduled') {
    if (sim.t < meeting.startAt) return null;
    if (sim.t >= meeting.startAt + MEET_SCHEDULE_GRACE) {
      finishVisitorMeet(sim, r.id, 'cancelled', 'we could not find a free moment after the planned time');
      return null;
    }
    if (!target || target.act === 'Sleeping' || (target.work && target.at !== other.work) || (target.hidden && !meeting.allowInside) || target.walking || target.visitorMeet || !target.at || target.wants || target.needs.energy < 35 || target.needs.food < 35) return null;
    meeting.status = 'going';
    meeting.until = sim.t + MEET_MINUTES;
    s.nextAct = sim.t;
  }
  if (!other || !target || sim.t >= meeting.until || target.act === 'Sleeping' || (target.work && target.at !== other.work) || (target.hidden && !meeting.allowInside) || target.visitorMeet || !LOC[target.at ?? target.target]) {
    finishVisitorMeet(sim, r.id, 'cancelled', 'the chance to talk passed');
    return null;
  }
  const reason = meeting.topic === 'check-in' ? `A visitor suggested checking on ${other.name}.` : meeting.topic === 'greeting' ? `A visitor suggested saying hello to ${other.name}.` : meeting.topic === 'inquiry' ? `A visitor said ${other.name} might want to talk; going to ask.` : `A visitor suggested talking with ${other.name}.`;
  const act = meeting.topic === 'check-in' ? `Going to check on ${other.name}` : meeting.topic === 'greeting' ? `Going to say hello to ${other.name}` : `Going to speak with ${other.name}`;
  return { loc: meeting.status === 'talking' ? s.at : target.at ?? target.target, act, visitorMeet: true, inside: !!(meeting.allowInside && target.hidden), reason };
}
export function planFor(r, sim) {
  const { day, h } = clockOf(sim), s = sim.people[r.id], wet = isWet(sim);
  const sleeping = r.sleepHours ? (r.sleepHours[0] < r.sleepHours[1] ? h >= r.sleepHours[0] && h < r.sleepHours[1] : h >= r.sleepHours[0] || h < r.sleepHours[1]) : h < 6 || h >= bedtimeOf(r.id);
  if (r.sleepHours && sleeping && !working(r, h)) return { loc: s.home, act: 'Sleeping', sleep: true, inside: true };
  const priority = life.priorityPlan(r, sim);
  if (priority) return priority;
  if (working(r, h)) {
    const visitor = visitorPlan(sim, r);
    if (visitor) return visitor;
    if (s.wants === 'rest') return { loc: s.home, act: 'Rest break', inside: true, nap: true, break: true };
    if (s.wants === 'food') {
      return life.foodPlan(r, sim, 'Meal break', true);
    }
    if (mealBreak(r, h)) {
      return life.foodPlan(r, sim, r.hours[0] > 12 ? 'Dinner break' : 'Lunch break', true);
    }
    if (r.patrol) {
      const circuit = ['boardwalk', 'teahouse', 'library', 'fishing'];
      return { loc: circuit[Math.floor((h - r.hours[0]) * 5) % circuit.length], act: r.task, work: true, patrol: true };
    }
    return { loc: r.work, act: r.task, work: true }; // indoor staff pop in and out between stations
  }
  const bedtime = bedtimeOf(r.id);
  const moonwalk = !r.sleepHours && h >= 21 && h < 23 && !wet && !s.wants && s.needs.energy > 45 && hash(r.id, day, 'moonwalk') < 0.12;
  if (moonwalk) return { loc: hash(r.id, day, 'moonplace') < 0.5 ? 'boardwalk' : 'teahouse', act: 'Taking a moonlit walk', nightWalk: true };
  if (sleeping) return { loc: s.home, act: 'Sleeping', sleep: true, inside: true };
  if (!r.sleepHours && h >= 21) return { loc: s.home, act: bedtime > 22.5 ? 'Reading late by lamplight' : 'Winding down', inside: true };
  if (!r.sleepHours && h < 6.5) return { loc: s.home, act: 'Waking up' };
  if (s.wants === 'rest') return { loc: s.home, act: 'Taking a nap', inside: true, nap: true };
  // Finish breakfast above the starting threshold so a few hungry steps don't send us straight back.
  const breakfast = h < 8.5 && h < r.hours[0] && s.needs.food < (s.act === 'Having breakfast' ? 90 : 85);
  if (s.wants === 'food' || breakfast) {
    return life.foodPlan(r, sim, h < 9 ? 'Having breakfast' : 'Grabbing a bite');
  }
  const visitor = visitorPlan(sim, r);
  if (visitor) return visitor;
  const slot = Math.floor(h * 2) / 2; // plans change every half hour, so people keep moving around town
  if (festivalNow(sim) && hash(r.id, day, slot, 'fest') < 0.8)
    return { loc: NIGHTLIFE[Math.floor(hash(r.id, day, slot, 'stall') * NIGHTLIFE.length)], act: 'Enjoying the Lantern Festival', fest: true };
  const committed = life.committed(r, sim);
  if (committed) return committed;
  const why = {};
  const loc = life.leisure(r, sim, slot, why);
  const stars = h >= 19.5 && weatherNow(sim) === 'clear' && STARGAZE[loc]; // clear evenings bring people out to look up
  return life.commit(r, sim, { loc, act: isHome(loc) && wet ? 'Staying in out of the rain' : stars || LEISURE[loc], inside: isHome(loc) && wet, ...(why.text && { reason: why.text }) });
}

export function spot(locId, i) {
  const l = LOC[locId], col = (i % 5) - 2, row = Math.floor(i / 5);
  return { x: l.door.x - l.uz * col + l.ux * row, z: l.door.z + l.ux * col + l.uz * row }; // 1 unit apart > 2 * BODY
}

// Round every corner of a polyline with a short quadratic curve, so walkers turn smoothly.
function smooth(pts) {
  const out = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1], p = pts[k], b = pts[k + 1];
    const la = Math.hypot(a.x - p.x, a.z - p.z), lb = Math.hypot(b.x - p.x, b.z - p.z);
    const r = Math.min(2.2, la * 0.45, lb * 0.45); // < half of each leg, so neighbouring curves never overlap
    if (r < 0.3) { out.push(p); continue; }
    const p0 = { x: p.x + ((a.x - p.x) / la) * r, z: p.z + ((a.z - p.z) / la) * r };
    const p1 = { x: p.x + ((b.x - p.x) / lb) * r, z: p.z + ((b.z - p.z) / lb) * r };
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const v = 1 - u;
      out.push({ x: v * v * p0.x + 2 * v * u * p.x + u * u * p1.x, z: v * v * p0.z + 2 * v * u * p.z + u * u * p1.z });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Shift a path sideways by off, so each resident keeps their own line; the last stretch before the goal stays exact.
function keepLane(path, off) {
  const end = path.at(-1);
  return path.map((p, k) => {
    const a = path[k - 1] ?? p, b = path[k + 1];
    if (!b || p.threshold || Math.hypot(p.x - end.x, p.z - end.z) < 2.5) return p;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dz / d) * off, z: p.z - (dx / d) * off };
  });
}

// Each resident's own stride: steady, routine people walk briskly, curious ones dawdle, and tiredness slows everyone.
export function paceOf(r, s) {
  const t = s.traits ?? r.traits ?? {}, base = 1 + 0.2 * ((t.routine ?? 0.5) - (t.curiosity ?? 0.5)) + 0.08 * (hash('pace', r.id) - 0.5);
  return clamp(base * (0.85 + 0.15 * Math.min(1, s.needs.energy / 50)), PACE_MIN, PACE_MAX);
}

// Shortest walk over the road graph from the nearest node, then to this resident's own spot (or in through the door).
function route(s, i, to, inside) {
  let start = 0;
  NODES.forEach((p, k) => { if (Math.hypot(p.x - s.x, p.z - s.z) < Math.hypot(NODES[start].x - s.x, NODES[start].z - s.z)) start = k; });
  const entrance = inside && PLACES[to]?.doors ? doorOf(s, to, i) : null;
  const path = keepLane(smooth([{ x: s.x, z: s.z }, ...shortest(start, DOOR_NODE[to]), entrance ?? spot(to, i)]).slice(1), LANE * (2 * hash('lane', i) - 1));
  if (entrance) {
    path[path.length - 1] = { ...entrance, threshold: true };
    path.push(insideDoor(to, entrance));
  }
  return path;
}

// ---------- what people do at each place ----------
// Points are in the building's own frame (x sideways, z towards the plaza, front wall near z = 2) and match the builders in art.js.
// face: 0 = looking out towards the plaza, IN = looking at the building. anim names are mapped to model clips by the scene.
// work = staff stations; visit = things visitors do (buy: pays there, serve: brings that staff station's worker over).
const IN = Math.PI;
const STALLS = [[-2.7, -0.4, 0.25], [0, 0.3, 0], [2.7, -0.4, -0.25]]; // market stall x, z, rotation
const stallPt = ([x, z, rot], d) => [x + d * Math.sin(rot), z + d * Math.cos(rot)];
// Meadow cottages stand evenly around the plaza (offsets in degrees, as for site()), each turned to face it,
// with a garden's width between neighbours; the open side towards the crossroads stays clear of Hinata Village.
// Entries are [x, z, rot] in the lane's own frame. Each lane's middle cottage sits at its site offset.
export const MEADOW_R = 16.5;
const MEADOW_OFFSETS = Array.from({ length: 15 }, (_, k) => -115 + (k * 230) / 14);
function meadowRing(id, offsets) {
  const D = DIST.meadow, l = LOC[id];
  return offsets.map((o) => {
    const a = rad(D.angle + o), dx = D.x + Math.cos(a) * MEADOW_R - l.x, dz = D.z + Math.sin(a) * MEADOW_R - l.z;
    const x = dx * l.uz - dz * l.ux, z = dx * l.ux + dz * l.uz;
    return [x, z, Math.atan2(-x, RING - z)];
  });
}
// Village rows curve around their plaza with a garden's width between cottages, so roofs never read as one block.
const row = (pts) => pts.map(([x, z]) => (x ? [x, z, Math.atan2(-x, RING - z)] : [x, z]));
export const HOUSES = { homes: row([[-5.4, 0.5], [0, -0.8], [5.4, 0.5]]), willow: row([[-5.4, 0.7], [0, -0.2], [5.4, 0.7]]), farmhouse: [[-2.6, -0.4], [2.6, -0.4]], cabin: [[-2.6, -0.4], [2.6, -0.4]], clover: meadowRing('clover', MEADOW_OFFSETS.slice(0, 5)), blossom: meadowRing('blossom', MEADOW_OFFSETS.slice(5, 10)), maple: meadowRing('maple', MEADOW_OFFSETS.slice(10)) };
// A point in a house's own frame (front door towards +z), in its lane's frame. Meadow cottages turn to face their plaza.
export const houseAt = (loc, k, [dx, dz] = [0, 0]) => {
  const [x, z, rot = 0] = HOUSES[loc][k];
  return [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)];
};
export const houseTurn = (loc, k) => HOUSES[loc][k][2] ?? 0;
// each house's name follows its roof colour in art.js
export const HOUSE_NAMES = {
  homes: ['teal-roofed house', 'pink-roofed house', 'gold-roofed house'], willow: ['sage-roofed house', 'rose-roofed house', 'teal-roofed house'],
  farmhouse: ['red-roofed cottage', 'green-roofed cottage'], cabin: ['dark cabin', 'green-roofed cabin'],
  clover: ['rose-roofed cottage', 'teal-roofed cottage', 'gold-roofed cottage', 'sage-roofed cottage', 'cream-roofed cottage'],
  blossom: ['coral-roofed cottage', 'sage-roofed cottage', 'rose-roofed cottage', 'teal-roofed cottage', 'gold-roofed cottage'],
  maple: ['cream-roofed cottage', 'coral-roofed cottage', 'teal-roofed cottage', 'rose-roofed cottage', 'sage-roofed cottage'],
};
const ownHouse = (r) => RESIDENTS.filter((o) => o.home === r.home).indexOf(r) % HOUSES[r.home].length;
// Everyone has a house of their own to come home to (shared with a housemate or two when the lane is full).
function settleHouses(sim) {
  for (const r of RESIDENTS) sim.people[r.id].house ??= ownHouse(r);
}
export const housematesOf = (sim, id) => RESIDENTS.filter((o) => o.id !== id && sim.people[o.id].home === sim.people[id].home && sim.people[o.id].house === sim.people[id].house);
const houses = (id) => ({
  doors: HOUSES[id].map((_, k) => [...houseAt(id, k, [0, 1.4]), houseTurn(id, k)]),
  visit: HOUSES[id].map((_, k) => ({ at: houseAt(id, k, [0.95, 2.3]), face: houseTurn(id, k) + IN, anim: 'garden' })), // the flowerpot by each door
});
const PLACES = {
  fishing: { visit: [[-2, 3], [0, 3.5], [2, 3]].map((at) => ({ at, face: IN, anim: 'watch' })) },
  cookhouse: { visit: [[-2, 2], [0, 2], [2, 2]].map((at) => ({ at, face: IN, anim: 'work' })) },
  boardwalk: { visit: [[-2, 1.5], [0, 2.5], [2, 1.5]].map((at) => ({ at, face: IN, anim: 'read' })) },
  homes: houses('homes'),
  farmhouse: houses('farmhouse'),
  cabin: houses('cabin'),
  clover: houses('clover'),
  blossom: houses('blossom'),
  maple: houses('maple'),
  onsen: { // changing hut on the left (front z = 0.15), rock pool centred at (0.4, 0.2); soakers sit down in the water
    work: [{ at: [-3.5, 0.9], face: 0, anim: 'work' }, { at: [2.9, 1.5], face: IN, anim: 'sweep' }, { at: [-1.9, -1.7], face: IN, anim: 'carry' }],
    visit: [
      { at: [-3.5, 1.9], face: IN, anim: 'buy', buy: true, serve: 0 },
      ...[[-0.9, 0.5, IN / 2], [0.4, 1.2, IN], [1.7, 0.5, -IN / 2], [0.4, -0.6, 0]].map(([x, z, face]) => ({ at: [x, z], face, anim: 'sit', y: -0.32 })),
      { at: [2.9, 2.6], face: IN, anim: 'idle' },
    ],
  },
  woodlot: { // woodshed right (front z = -0.05), log pile left, chopping block in front, a cedar to fell at (4.8, 0.4)
    work: [{ at: [0.2, 1.65], face: IN, anim: 'chop' }, { at: [-2.4, 0.3], face: IN, anim: 'logs' }, { at: [4.8, 1.3], face: IN, anim: 'chop' }],
    visit: [{ at: [-1, 2.8], face: IN, anim: 'idle' }, { at: [1.9, 2.6], face: IN, anim: 'idle' }, { at: [-4, 0.8], face: IN, anim: 'idle' }],
  },
  farm: { // barn front at z = 1.25, vegetable rows either side (x 3.4 to 6.4)
    work: [{ at: [-4.9, 0.2], face: IN, anim: 'garden' }, { at: [4.9, 0.6], face: IN, anim: 'garden' }, { at: [-1.6, 1.85], face: 0, anim: 'carry' }, { at: [1.8, 1.9], face: IN, anim: 'work' }, { at: [-4.9, -1.8], face: IN, anim: 'garden' }],
    visit: [{ at: [-2.4, 3.6], face: IN, anim: 'idle' }, { at: [2.4, 3.6], face: IN, anim: 'idle' }, { at: [0, 4.2], face: IN, anim: 'idle' }],
  },
  willow: {
    ...houses('willow'),
    work: [{ at: [-1.55, 0.2], face: -IN / 2, anim: 'hammer' }, { at: [1.55, 0.2], face: IN / 2, anim: 'hammer' }, { at: [0.9, 1.9], face: 0, anim: 'carry' }],
  },
  bakery: {
    doors: [[0, 2.15]],
    work: [{ at: [1.7, 2.3], face: 0, anim: 'work' }, { at: [-1.6, 2.7], face: 0, anim: 'carry' }],
    visit: [{ at: [1.7, 3.75], face: IN, anim: 'buy', buy: true, serve: 0 }, { at: [-1.3, 3.6], face: 0, anim: 'eat' }, { inside: true }],
  },
  teahouse: {
    doors: [[0, 2.15]],
    work: [{ at: [-2.2, 3.1], face: -IN / 2, anim: 'work' }, { at: [0.9, 2.45], face: 0, anim: 'work' }],
    visit: [
      { at: [0.9, 3.45], face: IN, anim: 'buy', buy: true, serve: 1 }, { at: [-4.8, 2.4], face: 0, anim: 'sit', y: 0.15 }, // outlined seat tops: red bench 0.52, plaza bench 0.37
      { at: [-3.8, 2.4], face: 0, anim: 'sit', y: 0.15 }, { inside: true }, // half a unit either side of the parasol pole
    ],
  },
  shrine: {
    work: [
      ...[[-1.7, 3.8], [1.7, 3.8], [0, 4.6], [-1.3, 2.5], [1.3, 2.5]].map((at) => ({ at, face: IN / 2, anim: 'sweep' })),
      // the gardener tends the two cherry trees (art.js shrine), crossing out front, clear of the offering box and lanterns
      ...[-4, 4].map((x) => ({ at: [x, 1.9], via: [0, 5.6], face: IN, anim: 'prune', job: 'Gardener' })),
    ],
    visit: [{ at: [0, 2.6], face: IN, anim: 'pray', buy: true }, { at: [-2.3, 3.2], face: IN, anim: 'idle' }, { at: [2.3, 3.2], face: IN, anim: 'idle' }],
  },
  library: {
    doors: [[0, 2.15]],
    work: [{ at: [2.1, 2.3], face: 0, anim: 'work' }, { at: [-1.6, 3.0], face: 0, anim: 'read' }],
    visit: [{ inside: true }, { inside: true }, { at: [2.1, 3.65], face: IN, anim: 'browse' }, { at: [-1.6, 3.2], face: 0, anim: 'read' }],
  },
  market: {
    work: STALLS.map((st) => ({ at: stallPt(st, -0.85), face: st[2], anim: 'work' })),
    visit: STALLS.map((st, k) => ({ at: stallPt(st, 1.05), face: st[2] + IN, anim: 'buy', buy: true, serve: k })),
  },
  store: {
    doors: [[0, 1.95]],
    work: [{ at: [0.6, 2.05], face: 0, anim: 'work' }, { at: [-1.0, 2.9], face: IN, anim: 'carry' }, { at: [2.6, 2.2], face: IN, anim: 'carry' }],
    visit: [{ at: [0.6, 3.1], face: IN, anim: 'buy', buy: true, serve: 0 }, { inside: true }, { at: [-1.7, 3.3], face: IN, anim: 'browse' }],
  },
  bathhouse: {
    doors: [[0, 2.15]],
    work: [{ at: [-3.3, 1.7], face: IN, anim: 'logs' }, { at: [1.95, 3.05], face: IN, anim: 'work' }], // feeding the firebox (art.js), then the tubs by the door
    visit: [{ inside: true, buy: true }, { inside: true, buy: true }, { at: [-1.6, 3.1], face: 0, anim: 'idle' }],
  },
  theater: { // actors step up onto the stage from its side
    work: [{ at: [-1.1, 2.75], via: [-3.1, 2.75], y: 0.5, face: 0, anim: 'perform' }, { at: [1.1, 2.75], via: [3.1, 2.75], y: 0.5, face: 0, anim: 'play' }],
    visit: [[-1.6, 5.3], [0, 5.7], [1.6, 5.3], [-0.8, 6.3], [0.8, 6.3]].map((at) => ({ at, face: IN, anim: 'watch', buy: true })),
  },
};

// two-seat benches around each plaza, facing it
export const BENCHES = DISTRICTS.flatMap((D) =>
  ({ village: [0, 145, -145], market: [35, -35, 140, -140], pleasure: [125, -125], waterfront: [40, -40, 150, -150], farmland: [55, 130, -140], hillside: [40, -40, 150, -150], meadow: [35, -35, 140, -140] })[D.id].map((o, k) => {
    const a = rad(D.angle + o), x = D.x + Math.cos(a) * (HUB_R + 1.5), z = D.z + Math.sin(a) * (HUB_R + 1.5);
    return { id: `${D.id}${k}`, district: D.id, x, z, a, face: Math.atan2(D.x - x, D.z - z) };
  }));
const SEATS = BENCHES.flatMap((b) => [-0.35, 0.35].map((t, k) => ({
  id: `${b.id}-${k}`, district: b.district, face: b.face, x: b.x - Math.sin(b.a) * t, z: b.z + Math.cos(b.a) * t,
})));

const toWorld = (l, [x, z]) => ({ x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz });
const faceWorld = (l, f) => Math.atan2(Math.sin(f) * l.uz + Math.cos(f) * l.ux, -Math.sin(f) * l.ux + Math.cos(f) * l.uz);
const doorOf = (s, loc, i) => doorway(loc, loc === s.home && s.house != null ? s.house : i); // home means one's own front door
function doorway(loc, i) {
  const d = PLACES[loc]?.doors;
  if (!d) return spot(loc, i);
  const [dx, dz, rot = 0] = d[i % d.length];
  return { ...toWorld(LOC[loc], [dx, dz]), rot };
}
const MEALS = new Set(['Having breakfast', 'Lunch break', 'Dinner break', 'Grabbing a bite', 'Meal break']);
// The short final leg crosses the wall before the resident becomes hidden.
function insideDoor(loc, door) {
  const l = LOC[loc], rot = door.rot ?? 0, inward = toWorldDir(l, -Math.sin(rot), -Math.cos(rot)); // a turned cottage is entered along its own axis
  return { x: door.x + inward.x * 0.65, z: door.z + inward.z * 0.65, threshold: true };
}
const canBuy = (sim, s, plan) => !s.shopped && (sim.t - s.boughtAt >= 20 || MEALS.has(plan.act)); // once per visit

// Leave whatever this resident is doing: step out of the door, off a bench or down from the stage.
function depart(sim, s, i) {
  const via = s.task?.via;
  let exit;
  if (s.hidden && s.at) {
    const door = s.inDoor != null ? doorway(s.at, s.inDoor) : doorOf(s, s.at, i);
    const point = PLACES[s.at]?.doors ? insideDoor(s.at, door) : door;
    s.x = point.x; s.z = point.z;
    if (PLACES[s.at]?.doors) exit = { ...door, threshold: true };
  }
  s.inDoor = null;
  s.hidden = false;
  s.task = null;
  s.seat = null;
  s.y = 0;
  return exit ? [exit] : via ? [via] : [];
}

function go(sim, s, i, act) {
  const pre = depart(sim, s, i), l = LOC[s.at];
  const local = !act.world && !act.inside;
  const door = act.door ?? (s.at === s.home ? s.house : undefined);
  const entrance = act.inside && doorway(s.at, door ?? i);
  const pts = act.inside ? (PLACES[s.at]?.doors ? [{ ...entrance, threshold: true }, insideDoor(s.at, entrance)] : [entrance]) : [local ? toWorld(l, act.at) : act.at];
  if (act.inside && door != null) s.inDoor = door; // remember the same address for leaving; guests may name the host's door
  const via = act.via && toWorld(l, act.via);
  if (via) pts.unshift(via);
  s.path = [...pre, ...pts];
  s.from = { x: s.x, z: s.z };
  s.goal = s.path[s.path.length - 1];
  s.task = { ...act, via, duration: Math.max(0.5, s.nextAct - sim.t), face: act.face === undefined ? undefined : local ? faceWorld(l, act.face) : act.face, reached: false };
  s.seat = act.seat ?? null;
  s.walking = s.ambling = true;
}

function plazaActivity(sim, s) {
  const D = DIST[LOC[s.at].district];
  if (rand(sim) < 0.5) {
    const taken = new Set(RESIDENTS.map((r) => sim.people[r.id].seat).filter(Boolean));
    for (const o of sim.outings) if (['invited', 'together'].includes(o.status)) for (const id of o.seats ?? []) taken.add(id);
    const free = SEATS.filter((q) => q.district === D.id && !taken.has(q.id));
    if (free.length) { const q = free[Math.floor(rand(sim) * free.length)]; return { world: true, at: q, face: q.face, anim: 'sit', seat: q.id }; }
  }
  const a = rand(sim) * Math.PI * 2, r = HUB_R * (0.45 + rand(sim) * 0.45);
  return { world: true, at: { x: D.x + Math.cos(a) * r, z: D.z + Math.sin(a) * r }, anim: 'idle' };
}

const sameAt = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const anchored = (s) => s.task?.reached && !s.walking && (s.task.anim === 'sit' || s.task.kind === 'bath-soak' || s.task.kind === 'fishing' || s.task.kind === 'wedding-vows' || s.task.kind?.startsWith('housework-'));

// Everyone has a pastime they reach for in a free moment outdoors (shown with a little prop).
export const HOBBIES = [
  { id: 'sketch', name: 'sketching', note: (at) => `Sketched ${at} for a while.` },
  { id: 'flute', name: 'the flute', note: (at) => `Played my flute at ${at}.` },
  { id: 'read', name: 'reading', note: (at) => `Read a few chapters at ${at}.` },
  { id: 'knit', name: 'knitting', note: (at) => `Knitted a few rows at ${at}.` },
];
export const hobbyOf = (id) => HOBBIES[Math.floor(hash('hobby', id) * HOBBIES.length)];
function takeUpHobby(sim, r, s, act) {
  const H = hobbyOf(r.id), { day } = clockOf(sim);
  s.needs.fun = Math.min(100, s.needs.fun + 4);
  if (s.hobbyDay !== day) { s.hobbyDay = day; note(sim, r.id, H.note(LOC[s.at].name)); }
  if (H.id === 'flute' && !(s.bubble?.until > sim.t)) s.bubble = { kind: 'note', until: sim.t + 0.3 }; // a little tune
  return { ...act, anim: H.id };
}

// A station marked for a job (the shrine's cherry trees) is that worker's own; everyone else shares the rest.
function workStations(r, loc) {
  const mine = PLACES[loc].work.filter((v) => v.job === r.job);
  return mine.length ? mine : PLACES[loc].work.filter((v) => !v.job);
}
function nextActivity(sim, r, s, i, plan) {
  const P = PLACES[s.at] ?? {}, x = rand(sim);
  const busySpot = (v) => v.at && RESIDENTS.some((o) => o !== r && sim.people[o.id].at === s.at && !sim.people[o.id].hidden && sameAt(sim.people[o.id].task?.at, v.at));
  const pickSpot = (list, u) => { const free = list.filter((v) => !busySpot(v)); const pool = free.length ? free : list; return pool[Math.floor(u * pool.length)]; };
  s.nextAct = sim.t + (plan.work ? 1 + rand(sim) * 2 : 2 + rand(sim) * 3);
  let act;
  if (plan.work) {
    if (!P.work) return;
    const stations = workStations(r, s.at), own = RESIDENTS.filter((w) => w.work === s.at).indexOf(r) % stations.length;
    if (s.serve != null) { act = P.work[s.serve]; s.serve = null; s.nextAct = sim.t + 0.75 + rand(sim) * 0.75; }
    else if (INDOOR.has(s.at) && x < 0.3) act = { inside: true }; // step inside briefly to fetch stock
    else act = x < 0.65 && !busySpot(stations[own]) ? stations[own] : pickSpot(stations, rand(sim));
  } else {
    const buyAt = (P.visit ?? []).filter((v) => v.buy);
    if (buyAt.length && canBuy(sim, s, plan)) act = pickSpot(buyAt, rand(sim));
    else if (x < 0.35 || !P.visit) act = plazaActivity(sim, s);
    else if (s.at === s.home && s.house != null && P.visit[s.house]) { act = P.visit[s.house]; s.pot = Math.min(10, (s.pot ?? 3) + 0.6); } // tending their own flowerpot
    else act = pickSpot(P.visit, rand(sim));
    if (act.anim === 'idle' && !act.buy && !isWet(sim) && !plan.fest && rand(sim) < 0.45) { act = takeUpHobby(sim, r, s, act); s.nextAct += 2; }
    if (act.inside) s.nextAct += 2; // a proper visit indoors
    if (act.anim === 'sit') s.nextAct += 3 + rand(sim) * 3; // settle in for a real rest
  }
  go(sim, s, i, act);
}

function atVisitorMeet(sim, r, s, i) {
  const meeting = s.visitorMeet, target = sim.people[meeting.target];
  if (meeting.status === 'talking') return;
  if (!target || !target.at || target.at !== s.at || target.hidden !== s.hidden || (s.hidden && !meeting.allowInside) || target.walking) return;
  const gap = Math.hypot(target.x - s.x, target.z - s.z);
  if (!s.hidden && gap > 3.2) {
    const d = Math.max(gap, 0.01);
    go(sim, s, i, { world: true, at: { x: target.x + (s.x - target.x) / d * 1.5, z: target.z + (s.z - target.z) / d * 1.5 }, kind: 'visitor-meet', anim: 'idle' });
    return;
  }
  if (s.bubble?.until > sim.t || target.bubble?.until > sim.t || s.chatUntil > sim.t || target.chatUntil > sim.t) return;
  const other = PEOPLE[meeting.target], k = key(r.id, other.id);
  const feeling = { Hungry: 'A little hungry, to be honest.', Sleepy: 'Tired, but thanks for asking.', Bored: 'A bit restless today.', Glum: 'A little low, but I appreciate you asking.', Content: 'I am doing all right, thanks.', Cheerful: 'Good, thanks! Nice to see you.' }[moodOf(target).label] ?? 'I am doing all right, thanks.';
  const round = meeting.rounds ?? 0, closing = round === VISIT_ROUNDS - 1;
  const [opening, reply] = closing ? [working(r, clockOf(sim).h) ? `I should get back to work. Good talking, ${other.name}!` : `I'll let you get on. Good talking, ${other.name}!`, `You too, ${r.name}. See you around!`]
    : round ? chatLines({
      A: r, B: other, SA: s, SB: target, loc: s.at, h: clockOf(sim).h,
      weather: weatherNow(sim), season: sim.today.season, festival: festivalNow(sim),
      rel: sim.rel[k], couple: sim.couples[k], recent: recentExchanges(sim, r.id, other.id),
      news: (sim.news ?? []).filter((n) => sim.t - n.t < 2 * 1440).map((n) => ({ kind: n.kind, a: PEOPLE[n.a], b: PEOPLE[n.b] })),
      chance: () => rand(sim), pick: (list) => list[Math.floor(rand(sim) * list.length)],
    })
    : meeting.topic === 'check-in' ? [`Hi ${other.name}. How are you doing?`, feeling]
    : meeting.topic === 'greeting' ? [`Hi ${other.name}! I wanted to say hello.`, `Hi ${r.name}! Nice to see you.`]
      : meeting.topic === 'inquiry' ? [`Hi ${other.name}. A visitor said you might want to talk. Did you?`, `I hadn't arranged a meeting, but I can talk now.`]
      : chatLines({
        A: r, B: other, SA: s, SB: target, loc: s.at, h: clockOf(sim).h,
        weather: weatherNow(sim), season: sim.today.season, festival: festivalNow(sim),
        rel: sim.rel[k], couple: sim.couples[k], recent: recentExchanges(sim, r.id, other.id),
        news: (sim.news ?? []).filter((n) => sim.t - n.t < 2 * 1440).map((n) => ({ kind: n.kind, a: PEOPLE[n.a], b: PEOPLE[n.b] })),
        chance: () => rand(sim), pick: (list) => list[Math.floor(rand(sim) * list.length)],
      });
  const kind = sim.couples[k] ? 'heart' : 'chat';
  s.bubble = { kind, text: opening, until: sim.t + 0.2 };
  target.bubble = { kind, text: reply, from: sim.t + 0.07, until: sim.t + 0.27 };
  scheduleConversation(sim, [r.id, meeting.target], s.at, { ...(!round && { visitorTopic: meeting.topic ?? 'conversation' }), visitorInside: s.hidden });
  meeting.status = 'talking';
  meeting.current = sim.pendingChats.at(-1).id;
  meeting.chat ??= meeting.current; // the asked-for exchange is what the visitor hears about later
  meeting.until = sim.t + 1;
  if (!closing) target.chatUntil = s.chatUntil = sim.t + 0.4; // both stay for the next round
  s.face = Math.atan2(target.x - s.x, target.z - s.z);
  if (!anchored(target)) target.face = Math.atan2(s.x - target.x, s.z - target.z);
}

function updateVisitorMeets(sim) {
  for (const r of RESIDENTS) {
    const s = sim.people[r.id], meeting = s.visitorMeet;
    if (meeting?.status === 'scheduled' && sim.t >= meeting.startAt + MEET_SCHEDULE_GRACE) {
      finishVisitorMeet(sim, r.id, 'cancelled', 'we could not find a free moment after the planned time');
      continue;
    }
    if (!meeting || meeting.status !== 'talking') continue;
    const target = sim.people[meeting.target];
    const current = meeting.current ?? meeting.chat; // older saves track only one exchange
    if (s.chats.some((c) => c.id === current) && target?.chats.some((c) => c.id === current)) {
      const k = key(r.id, meeting.target);
      sim.rel[k] = Math.min(100, sim.rel[k] + 0.6);
      life.remember(sim, r.id, 'person', meeting.target, 0.25);
      life.remember(sim, meeting.target, 'person', r.id, 0.25);
      meeting.rounds = (meeting.rounds ?? 0) + 1;
      if (meeting.rounds >= VISIT_ROUNDS || !meeting.current) finishVisitorMeet(sim, r.id, 'completed');
      else { meeting.status = 'going'; meeting.until = sim.t + 2; }
    } else if (sim.t >= meeting.until) finishVisitorMeet(sim, r.id, 'cancelled', 'we were interrupted');
  }
}

const SERVE_LINES = { bakery: 'Fresh from the oven!', teahouse: 'Here is your tea~', market: 'Freshly picked!', store: 'Thank you kindly!' };
// A sale brings the shopkeeper to the counter (out of the shop if need be).
function serve(sim, loc, k, buyer, who) {
  if (k === undefined) return;
  const w = RESIDENTS.find((w) => w.work === loc && sim.people[w.id].work && sim.people[w.id].at === loc);
  if (!w) return;
  const ws = sim.people[w.id], station = PLACES[loc].work[k];
  const regular = who && (buyer.memories?.places[loc]?.visits ?? 0) >= 6; // a familiar face gets a personal welcome
  ws.bubble = { kind: 'coin', text: regular ? `The usual, ${who.name}?` : SERVE_LINES[loc] ?? 'Thank you!', until: sim.t + 0.2 };
  if (sameAt(ws.task?.at, station.at) && ws.task.reached) ws.face = Math.atan2(buyer.x - ws.x, buyer.z - ws.z);
  else { ws.serve = k; ws.nextAct = sim.t; }
}

// What happens once a resident is at their destination: carry on with the current activity or start the next one.
function atPlace(sim, r, s, i, plan) {
  if (s.task?.y && s.task.via && s.path.length <= 1) s.y = s.task.y; // up on the stage
  if (s.walking) return;
  const task = s.task;
  if (task?.anim === 'sit' || anchored(s)) { s.x = s.goal.x; s.z = s.goal.z; } // keep seated residents and anglers at their reserved spots
  if (task && !task.reached) {
    task.reached = true;
    s.nextAct = sim.t + (task.duration ?? 0.5); // travel time doesn't consume the activity
    if (s.intent?.plan.flexible) s.intent.until = Math.max(s.intent.until, s.nextAct);
    if (task.inside) s.hidden = true;
    if (task.face !== undefined) s.face = task.face;
    s.y = task.y ?? 0;
    // a snack or treat; meals go through the kitchen queue
    if (task.buy && (!FOOD.includes(s.at) || !plan.meal) && !life.activeMeal(s) && canBuy(sim, s, plan)) { s.shopped = true; buy(sim, r, s); serve(sim, s.at, task.serve, s, r); }
  }
  if (plan.inside) { if (!s.hidden && !task?.inside) go(sim, s, i, { inside: true }); else if (plan.visitorMeet) atVisitorMeet(sim, r, s, i); return; }
  if (plan.visitorMeet) { atVisitorMeet(sim, r, s, i); return; }
  if (plan.work && s.at === r.work && s.serve != null && task?.reached && sameAt(task.at, PLACES[s.at].work[s.serve].at)) s.serve = null;
  if (life.activity(sim, r, s, i, plan)) return;
  if ((plan.work && s.serve != null) || (sim.t >= s.nextAct && sim.t >= (s.chatUntil ?? 0))) nextActivity(sim, r, s, i, plan);
}

// ---------- solid things residents walk around (footprints match the builders in art.js) ----------
// Boxes are in a building's frame: [centre x, centre z, half width, half depth, extra rotation]; circles: [x, z, radius].
const homeSolids = (id) => ({ boxes: HOUSES[id].map(([x, z, rot = 0]) => [x, z, 1.55, 1.55, rot]), circles: HOUSES[id].map((_, k) => [...houseAt(id, k, [0.95, 1.75]), 0.18]) }); // walls and doorstep pot
const SOLIDS = {
  // Water is solid to walkers; the central wooden pier remains open.
  fishing: { boxes: [[-5, -3, 2, 4], [5, -3, 2, 4], [0, -5.2, 3, 1.8]] },
  cookhouse: { boxes: [[0, 0, 3.2, 1.5], [-2, 4.5, 1, 0.4], [2, 4.5, 1, 0.4]] },
  boardwalk: { boxes: [[0, -1.4, 3.2, 0.15]], circles: [[-3, 0, 0.15], [3, 0, 0.15]] },
  bakery: { boxes: [[0, 0, 2.75, 2.25], [1.7, 2.95, 0.7, 0.35]] },
  teahouse: { boxes: [[0, 0, 2.85, 2.25], [-4.3, 2.4, 0.7, 0.3]], circles: [[-4.3, 1.85, 0.08]] },
  shrine: { boxes: [[0, -0.5, 2.6, 2.2], [0, 1.95, 0.8, 0.3]], circles: [[-1.25, 3, 0.15], [1.25, 3, 0.15], [-2.3, 2.5, 0.3], [2.3, 2.5, 0.3], [-4, 0.4, 0.3], [4, 0.4, 0.3]] },
  library: { boxes: [[0, 0, 2.75, 2.25], [2.1, 2.9, 0.6, 0.3]] },
  market: { boxes: STALLS.map(([x, z, r]) => [x, z, 0.9, 0.5, r]), circles: STALLS.map((st) => [...stallPt(st, 0.6).map((v, k) => v + (k ? 0 : 1.1 * Math.cos(st[2]))), 0.3]) },
  store: { boxes: [[0, 0, 2.55, 2.05]], circles: [[1.6, 2.5, 0.3], [2.05, 2.75, 0.3], [-1.5, 2.6, 0.3], [-1.95, 2.6, 0.3]] },
  bathhouse: { boxes: [[0, 0, 2.85, 2.25], [-3.3, 0.8, 0.5, 0.4]], circles: [[1.7, 2.5, 0.28], [2.2, 2.5, 0.28], [4.2, 0.35, 1.55], [-4.2, 1.62, 0.4]] },
  theater: { boxes: [[0, 0, 3.45, 2.35], [0, 2.75, 2.6, 0.7]], circles: [[-3.7, 2.9, 0.08], [3.7, 2.9, 0.08]] },
  homes: homeSolids('homes'),
  willow: { boxes: [...homeSolids('willow').boxes, [-1.7, 3.4, 0.85, 0.25]], circles: [...homeSolids('willow').circles, [-2.95, 3.3, 0.25]] }, // cottages, sawhorse, toolbox
  farmhouse: homeSolids('farmhouse'),
  farm: { boxes: [[0, -0.8, 2.55, 2.05], [2.9, 2.35, 0.45, 0.4]], circles: [[-2.9, 2.4, 0.5], [5.2, -1.6, 0.15]] }, // barn, crates, haystack, scarecrow
  cabin: homeSolids('cabin'),
  ...Object.fromEntries(['clover', 'blossom', 'maple'].map((id) => [id, homeSolids(id)])),
  onsen: { boxes: [[-3.5, -0.9, 1.25, 1.05], [1.2, -2.2, 1.6, 0.7]], circles: [[0.4, 0.2, 2.1]] }, // hut, rocks and waterfall, pool
  woodlot: { boxes: [[2.7, -1.2, 1.45, 1.15], [-2.4, -0.8, 1.0, 0.55]], circles: [[0.2, 0.9, 0.3], [-4.4, -2.2, 0.5], [-0.9, -2.6, 0.5], [4.8, 0.4, 0.5]] }, // shed, logs, block, cedars
};
// building-frame vector -> world vector
const toWorldDir = (l, a, b) => ({ x: a * l.uz + b * l.ux, z: -a * l.ux + b * l.uz });

// stone lanterns at each plaza entry (also drawn by art.js)
export const LANTERNS = Object.fromEntries(LOCATIONS.map((l) => {
  const D = DIST[l.district];
  return [l.id, { x: D.x - l.ux * (HUB_R + 1.3) - l.uz * 1.4, z: D.z - l.uz * (HUB_R + 1.3) + l.ux * 1.4 }];
}));

const OBSTACLES = [];
for (const l of LOCATIONS) {
  for (const [bx, bz, hw, hd, r = 0] of SOLIDS[l.id].boxes ?? []) {
    const c = Math.cos(r), sn = Math.sin(r); // the box's own frame, turned by r within the place's frame
    const inBox = ([x, z]) => [(x - bx) * c - (z - bz) * sn, (x - bx) * sn + (z - bz) * c];
    const door = PLACES[l.id]?.doors?.find((d) => { const [u, v] = inBox(d); return Math.abs(u) < hw && Math.abs(v - hd) < 0.25; });
    const entrance = door && inBox(door);
    const boxes = [[0, 0, hw, hd]];
    if (entrance) {
      const [dx, dz] = entrance, back = -hd, front = hd, recess = dz - 1.05;
      boxes.length = 0;
      boxes.push([0, (back + recess) / 2, hw, (recess - back) / 2]);
      for (const [left, right] of [[-hw, dx - 0.55], [dx + 0.55, hw]]) boxes.push([(left + right) / 2, (recess + front) / 2, (right - left) / 2, (front - recess) / 2]);
    }
    const makeBox = (u, v, w, d) => ({ box: true, ...toWorld(l, [bx + u * c + v * sn, bz - u * sn + v * c]), hw: w, hd: d, ax: toWorldDir(l, c, -sn), az: toWorldDir(l, sn, c) });
    const solid = makeBox(0, 0, hw, hd);
    if (entrance) {
      solid.door = toWorld(l, door);
      solid.passage = boxes.map(([x, z, w, d]) => makeBox(x, z, w, d));
    }
    OBSTACLES.push(solid);
  }
  for (const [cx, cz, r] of SOLIDS[l.id].circles ?? []) OBSTACLES.push({ ...toWorld(l, [cx, cz]), r });
}
for (const p of Object.values(LANTERNS)) OBSTACLES.push({ ...p, r: 0.35 });
for (const D of DISTRICTS) { // gate posts either side of each district road
  const gx = D.gate.x + D.ux * 1.6, gz = D.gate.z + D.uz * 1.6;
  for (const sgn of [-1, 1]) OBSTACLES.push({ x: gx + D.uz * 1.9 * sgn, z: gz - D.ux * 1.9 * sgn, r: 0.25 });
  if (D.id === 'pleasure') // lantern posts lining the road in
    for (let k = 3; k < HUB_DIST - HUB_R - JUNCTION_R - 0.4; k += 3)
      for (const sgn of [-1, 1]) OBSTACLES.push({ x: D.gate.x + D.ux * k - D.uz * 1.8 * sgn, z: D.gate.z + D.uz * k + D.ux * 1.8 * sgn, r: 0.08 });
}
for (const b of BENCHES) {
  const az = { x: Math.sin(b.face), z: Math.cos(b.face) };
  OBSTACLES.push({ box: true, x: b.x, z: b.z, hw: 0.65, hd: 0.25, ax: { x: az.z, z: -az.x }, az });
}
OBSTACLES.push({ x: 0, z: 0, r: 0.15 }); // crossroads signpost
{ // koi pond, an oval of stones
  const P = DIST.pleasure, a = rad(P.angle + 125);
  OBSTACLES.push({ box: true, x: P.x + Math.cos(a) * 12.5, z: P.z + Math.sin(a) * 12.5, hw: 2.9, hd: 2.2, ax: { x: Math.cos(a), z: Math.sin(a) }, az: { x: -Math.sin(a), z: Math.cos(a) } });
}

// nearest point of an obstacle to p
function nearest(o, p) {
  if (!o.box) {
    const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1e-6;
    return { x: o.x + (dx / d) * o.r, z: o.z + (dz / d) * o.r, inside: d < o.r };
  }
  const dx = p.x - o.x, dz = p.z - o.z, u = dx * o.ax.x + dz * o.ax.z, v = dx * o.az.x + dz * o.az.z;
  const cu = clamp(u, -o.hw, o.hw), cv = clamp(v, -o.hd, o.hd), inside = cu === u && cv === v;
  if (inside) { // push out through the nearest face
    if (o.hw - Math.abs(u) < o.hd - Math.abs(v)) return { x: o.x + o.ax.x * Math.sign(u) * o.hw + o.az.x * v, z: o.z + o.ax.z * Math.sign(u) * o.hw + o.az.z * v, inside };
    return { x: o.x + o.ax.x * u + o.az.x * Math.sign(v) * o.hd, z: o.z + o.ax.z * u + o.az.z * Math.sign(v) * o.hd, inside };
  }
  return { x: o.x + o.ax.x * cu + o.az.x * cv, z: o.z + o.ax.z * cu + o.az.z * cv, inside };
}
// Things within a step of where a walk starts or ends don't block it, so nobody is boxed into a nook between props.
const NEAR = 1;
const touches = (o, p) => { const q = nearest(o, p); return q.inside || Math.hypot(p.x - q.x, p.z - q.z) < NEAR; };

// A closed entrance remains part of the navigation boundary. Opening the
// recess only for an actual threshold journey keeps passers-by out of nooks.
function passageFor(o, s) {
  if (!o.passage || !s.walking || !s.path) return null;
  for (const p of s.path) if (p.threshold && Math.hypot(p.x - o.door.x, p.z - o.door.z) < 1.1) return o.passage;
  return null;
}

// How far a resident overlaps a solid thing that should be blocking them (0 = clear); used by the tests.
export function overlap(s) {
  let worst = 0;
  for (const o of OBSTACLES) {
    const passage = passageFor(o, s);
    for (let k = 0; k < (passage?.length ?? 1); k++) {
      const shape = passage ? passage[k] : o;
      if ((s.goal && touches(shape, s.goal)) || (s.from && touches(shape, s.from))) continue;
      const q = nearest(shape, s), d = Math.hypot(s.x - q.x, s.z - q.z);
      worst = Math.max(worst, q.inside ? BODY + d : BODY - d);
    }
  }
  return worst;
}

// coarse grid so each resident only tests the few obstacles near it
const CELL = 4, GRID = new Map(), cellKey = (cx, cz) => `${cx},${cz}`;
for (const o of OBSTACLES) {
  const ext = (o.box ? Math.hypot(o.hw, o.hd) : o.r) + BODY;
  for (let cx = Math.floor((o.x - ext) / CELL); cx <= Math.floor((o.x + ext) / CELL); cx++)
    for (let cz = Math.floor((o.z - ext) / CELL); cz <= Math.floor((o.z + ext) / CELL); cz++) {
      const k = cellKey(cx, cz);
      if (!GRID.has(k)) GRID.set(k, []);
      GRID.get(k).push(o);
    }
}

// Push residents out of solid things. Walkers also slide along the edge towards their next waypoint,
// so they go round a stall or a corner instead of pressing into it. An obstacle that holds a resident's
// own goal or the spot they set off from (a doorway in a wall, a seat on a bench, behind a counter, the stage) doesn't block them.
function collide(sim) {
  for (const r of RESIDENTS) {
    const s = sim.people[r.id];
    if (s.hidden || sim.t < s.squeeze) continue;
    for (const solid of GRID.get(cellKey(Math.floor(s.x / CELL), Math.floor(s.z / CELL))) ?? []) {
      const passage = passageFor(solid, s);
      for (let k = 0; k < (passage?.length ?? 1); k++) {
        const o = passage ? passage[k] : solid;
        const q = nearest(o, s), dx = s.x - q.x, dz = s.z - q.z, d = Math.hypot(dx, dz);
        if (!q.inside && d >= BODY) continue;
        if ((s.goal && touches(o, s.goal)) || (s.from && touches(o, s.from))) continue;
        const nx = q.inside ? -dx / (d || 1e-6) : dx / (d || 1e-6), nz = q.inside ? -dz / (d || 1e-6) : dz / (d || 1e-6);
        const depth = q.inside ? BODY + d : BODY - d;
        s.x += nx * depth;
        s.z += nz * depth;
        s.bumped = sim.t;
        const next = s.path[0];
        if (s.walking && next) {
          let tx = -nz, tz = nx;
          if (tx * (next.x - o.x) + tz * (next.z - o.z) < 0) { tx = -tx; tz = -tz; } // judged from the obstacle's centre, so the side doesn't flip-flop
          s.x += tx * depth;
          s.z += tz * depth;
        }
      }
    }
  }
}

// Random 5–35 affinity between every pair that has none yet, then the story ties.
function meet(sim) {
  const fresh = new Set();
  RESIDENTS.forEach((a, i) => RESIDENTS.slice(i + 1).forEach((b) => {
    const k = key(a.id, b.id);
    if (sim.rel[k] === undefined) { sim.rel[k] = Math.round(5 + rand(sim) * 30); fresh.add(k); }
  }));
  for (const [a, b, v] of TIES) if (fresh.has(key(a, b))) sim.rel[key(a, b)] = v;
}
function newPerson(sim, r) {
  return {
    home: r.home, needs: { food: 60 + rand(sim) * 30, energy: 70 + rand(sim) * 25, fun: 50 + rand(sim) * 30 }, wants: null,
    money: 3000 + Math.round(rand(sim) * 900) * 10, earned: 0, boughtAt: sim.t - 60, nextAct: sim.t, task: null, seat: null, y: 0, ambling: false, shiftPay: 0, diary: [], visitorMemories: [], bubble: null,
  };
}

// An older town (version 5 predates the farm, 6 the hillside) keeps everyone; newcomers move in and new workplaces open their tills.
function addNewcomers(sim, funded = false) {
  const seed = sim.seed;
  meet(sim);
  for (const loc of SHOP_TILLS) sim.tills[loc] ??= 30000;
  sim.prices = { ...sim.prices };
  RESIDENTS.forEach((r, i) => {
    if (sim.people[r.id]) return;
    const p = spot(r.home, i);
    const person = newPerson(sim, r);
    if (funded) { person.money = Math.min(person.money, sim.tills.town); sim.tills.town -= person.money; }
    sim.people[r.id] = { ...person, ...p, goal: p, from: null, stuck: 0, squeeze: 0, bumped: 0, best: 0, legs: 0, face: Math.PI / 4, target: r.home, at: r.home, path: [], walking: false, hidden: true, act: 'Settling in', work: false };
    note(sim, r.id, `Moved into ${LOC[r.home].name} to start work at ${LOC[r.work].name}.`);
  });
  sim.version = SAVE_VERSION;
  if (funded) sim.seed = seed;
}

export function createSim(seed = 7, start = 7.5 * 60, epoch = new Date(2026, 3, 4).getTime()) {
  const sim = { version: SAVE_VERSION, roadLayout: 2, seed, t: start, epoch, rel: {}, couples: {}, people: {}, socialTimer: 0, tills: {}, prices: {}, sales: {} };
  meet(sim);
  for (const loc of SHOP_TILLS) sim.tills[loc] = 30000;
  sim.tills.town = 60000;
  sim.today = dayInfo(sim);
  setPrices(sim);
  RESIDENTS.forEach((r) => (sim.people[r.id] = newPerson(sim, r)));
  settleHouses(sim);
  life.initialize(sim);
  initializeConversations(sim);
  initializeVisitorMemory(sim);
  RESIDENTS.forEach((r, i) => {
    const plan = planFor(r, sim);
    Object.assign(sim.people[r.id], {
      ...spot(plan.loc, i), goal: spot(plan.loc, i), from: null, stuck: 0, squeeze: 0, bumped: 0, best: 0, legs: 0, face: Math.PI / 4, target: plan.loc, at: plan.loc, path: [], walking: false,
      hidden: !!plan.inside, act: plan.act, work: !!plan.work,
    });
    note(sim, r.id, plan.work ? `Already busy at ${LOC[plan.loc].name} this morning.` : `A new day in Hinata Village. ${plan.act} at ${LOC[plan.loc].name}.`);
    life.recordPlan(sim, r, plan);
    life.arrival(sim, r, sim.people[r.id]);
  });
  return sim;
}

// Sub-steps so nobody moves more than one body radius per tick (collision can't be tunnelled).
export function step(sim, dt) {
  const n = Math.ceil((dt * WALK * HURRY * PACE_MAX) / BODY);
  for (let k = 0; k < n; k++) tick(sim, dt / n);
}

// Fast-forward after time away with coarse ticks: nobody is watching, so collisions needn't be exact.
// The old pace buttons pulled the epoch off local midnight, putting the town clock out of step with the
// device. Re-anchor it to a local midnight so the time of day matches; it catches up less than a day, never rewinds.
export function alignClock(sim, nowMs = Date.now()) {
  const e = new Date(sim.epoch), atMidnight = !(e.getHours() || e.getMinutes() || e.getSeconds() || e.getMilliseconds());
  if (atMidnight && (nowMs - sim.epoch) / 60000 >= sim.t) return;
  const d = new Date(nowMs), days = Math.floor(sim.t / 1440);
  const midnight = (back) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime();
  sim.epoch = midnight(days);
  if ((nowMs - sim.epoch) / 60000 < sim.t) sim.epoch = midnight(days + 1);
}

export function catchUp(sim, now, maxDays = 3) {
  if (now - sim.t > maxDays * 1440) sim.t = now - maxDays * 1440; // shortcut: longer absences skip ahead without wages or rent; simulate them if that ever matters
  while (sim.t < now) tick(sim, Math.min(0.25, now - sim.t));
}

function tick(sim, dt) {
  sim.t += dt;
  if (Math.floor(sim.t / 1440) !== sim.today.day) newDay(sim);
  const wet = isWet(sim);
  RESIDENTS.forEach((r, i) => {
    const s = sim.people[r.id], plan = planFor(r, sim);
    if (s.visitorMeet && s.visitorMeet.status !== 'scheduled' && !plan.visitorMeet) finishVisitorMeet(sim, r.id, 'cancelled', 'another need or commitment came first');
    life.recordPlan(sim, r, plan);
    if (s.act === 'Sleeping' && !plan.sleep) note(sim, r.id, s.needs.energy >= 80 ? 'Woke up feeling rested.' : s.needs.energy >= 55 ? 'Woke up. Could have used another hour.' : 'Woke up groggy after a short night.');
    const onShift = working(r, clockOf(sim).h);
    if ((s.onShift ?? s.work) && !onShift) {
      if (r.wage) note(sim, r.id, `Finished my shift and earned ${yen(s.shiftPay)}.`);
      const served = SHOP[r.work] && s.salesAt != null ? ((sim.sales?.[r.work] ?? 0) - s.salesAt) / SHOP[r.work][0] : null;
      if (served != null && served >= 14) note(sim, r.id, `What a busy day at ${LOC[r.work].name}! My feet ache, but I loved it.`);
      else if (served != null && served < 3) note(sim, r.id, `A quiet day at ${LOC[r.work].name}. Plenty of time to tidy up.`);
      s.salesAt = null;
      if (!s.hidden) s.bubble = { kind: 'chat', text: ['Done for the day!', 'Home time~', 'That’s a wrap!'][Math.floor(hash(r.id, clockOf(sim).day) * 3)], until: sim.t + 0.25 };
      else note(sim, r.id, `Done ${r.task.toLowerCase()} for today.`);
      s.shiftPay = 0;
      s.unpaid = false;
    }
    s.onShift = onShift;
    if (plan.loc !== s.target) {
      life.leave(sim, r, s);
      const pre = depart(sim, s, i);
      s.path = [...pre, ...route(s, i, plan.loc, plan.inside)];
      s.from = { x: s.x, z: s.z };
      s.goal = s.path[s.path.length - 1];
      s.ambling = false;
      s.target = plan.loc;
      s.at = null;
    }
    if (plan.act !== s.act && s.at && plan.loc === s.target) s.nextAct = sim.t;
    s.act = plan.act;
    s.work = !!plan.work;
    s.moving = !!plan.carryMove;
    // ease into a stride after standing (old saves have no speed: already walking), then slow over the last few steps.
    // No braking through a doorway or towards a spot someone else is at: slowed walkers bound for one point circle it forever.
    if (s.path.length) s.speed = Math.min(1, (s.speed ?? 1) + EASE * dt);
    const last = s.path.length === 1 && !s.path[0].threshold ? s.path[0] : null;
    let end = last ? Math.hypot(last.x - s.x, last.z - s.z) : Infinity;
    if (end < BRAKE && RESIDENTS.some((o) => o !== r && !sim.people[o.id].hidden && Math.hypot(sim.people[o.id].x - last.x, sim.people[o.id].z - last.z) < 1)) end = Infinity;
    s.stride = s.path.length ? paceOf(r, s) * Math.max(0.15, s.speed) * clamp(end / BRAKE, 0.3, 1) : 0;
    let budget = WALK * dt * s.stride * (s.ambling ? AMBLE : wet ? HURRY : 1); // nobody dawdles in the rain
    while (budget > 0 && s.path.length) {
      const p = s.path[0], dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz);
      if (!p.threshold && s.path.length > 2 && d < LOOK) { s.path.shift(); continue; }
      // shared waypoints (doors, plaza entries, or a counter spot someone is already standing on) count as reached nearby
      if (!p.threshold && d < 0.8 && (s.path.length > 1 || (!plan.inside && !s.task?.inside && !s.seat && !s.task?.reserved && s.task?.anim !== 'sit' && RESIDENTS.some((o) => o !== r && !sim.people[o.id].hidden && Math.hypot(sim.people[o.id].x - p.x, sim.people[o.id].z - p.z) < 0.55)))) { s.path.shift(); continue; }
      if (d > 1e-6) s.face = Math.atan2(dx, dz);
      if (d <= budget) { s.x = p.x; s.z = p.z; budget -= d; s.path.shift(); }
      else { s.x += (dx / d) * budget; s.z += (dz / d) * budget; budget = 0; }
    }
    s.walking = s.path.length > 0;
    if (!s.walking) { s.ambling = false; s.speed = 0; }
    if (!s.walking && !s.at) arrive(sim, r, s, plan);
    else if (s.at) atPlace(sim, r, s, i, plan);
    if (plan.work && (s.at === r.work || (plan.patrol && s.at === plan.loc) || plan.delivery || (plan.sheltered && s.at === plan.loc)) && r.wage) {
      const owed = (r.wage * dt) / 60, k = tillOf(sim, r.work), pay = Math.min(owed, sim.tills[k]);
      sim.tills[k] -= pay;
      sim.tills.town += pay * TAX; // income tax funds the treasury
      s.money += pay * (1 - TAX);
      s.earned += pay * (1 - TAX);
      s.shiftPay += pay * (1 - TAX);
      if (pay < owed && !s.unpaid) { s.unpaid = true; note(sim, r.id, `The ${TILL_NAME(sim, r.work).toLowerCase()} is empty, so I'm working unpaid for now.`); }
    }
    needs(sim, r, s, plan, dt, wet);
  });
  for (let k = 0; k < 3; k++) { collide(sim); separate(sim); } // a few relaxation passes untangle crowds (e.g. everyone heading home)
  collide(sim); // solids get the last word: two shoppers may brush shoulders, but nobody ends up inside a stall
  for (const r of RESIDENTS) { // a walker pressed against props who gets no closer to their next waypoint for a few seconds squeezes past
    const s = sim.people[r.id], p = s.path[0], d = p ? Math.hypot(p.x - s.x, p.z - s.z) : 0;
    if (!p || d < s.best - 0.05 || s.path.length !== s.legs) { s.best = d; s.legs = s.path.length; s.stuck = 0; }
    else if (s.bumped === sim.t && (s.stuck += dt) > 0.05) { s.squeeze = sim.t + 0.04; s.best = d; s.stuck = 0; }
  }
  updateWedding(sim, dt);
  updateConversations(sim);
  updateVisitorMeets(sim);
  sim.socialTimer += dt;
  while (sim.socialTimer >= 3) { sim.socialTimer -= 3; socialize(sim); }
  life.update(sim, dt);
}

// Hunger, energy and fun drift with what a resident is doing; low ones change their plans.
function needs(sim, r, s, plan, dt, wet) {
  const n = s.needs, k = dt / 60, here = !!s.at, sitting = s.task?.reached && s.task.anim === 'sit';
  if (plan.sleep && here) { n.energy += 15 * k; n.food -= 1.2 * k; }
  else {
    n.food -= 5.2 * k;
    n.energy -= (plan.work ? 5.2 : sitting ? -4 : 3.8) * k;
    if (plan.nap && here) n.energy += (plan.break ? 100 : 32) * k;
    if (here && !plan.work) {
      n.food += life.consumeMeal(sim, r, s, dt);
      if (s.at === 'bathhouse' && s.task?.kind === 'bath-soak' && s.task.reached && !s.walking) n.energy += 18 * k;
      else if (s.at === 'onsen' && sitting) n.energy += 24 * k; // a soak in the hot spring even more
      else if (isHome(s.at)) n.energy += 6 * k;
    }
    if (plan.work) n.fun -= 2.2 * k;
    else if (here) {
      const homeFun = coupleOf(sim, r.id)?.stage === 'together' ? 14 : 9;
      n.fun += (isHome(s.at) ? homeFun : r.likes.includes(s.at) ? 32 : 20) * (plan.fest ? 1.6 : 1) * k;
    }
    if (wet && !s.hidden) n.fun -= 3 * k;
  }
  for (const x of ['food', 'energy', 'fun']) n[x] = clamp(n[x], 0, 100);
  if (s.wants === 'food' && n.food > 90 && !life.activeMeal(s)) s.wants = null;
  if (s.wants === 'rest' && n.energy > (plan.break ? 55 : 75)) s.wants = null;
  if (!s.wants && clockOf(sim).h < 20.5) { // late in the evening bed is coming anyway
    if (n.energy < 22) { s.wants = 'rest'; note(sim, r.id, 'So sleepy. Heading home for a nap.'); }
    else if (n.food < 35) { s.wants = 'food'; note(sim, r.id, 'My tummy is rumbling. Time for a bite.'); }
  }
}

export function moodOf(s) {
  if (s.act === 'Sleeping' && s.at) return { value: 100, label: 'Asleep' };
  const { food, energy, fun } = s.needs, v = (food + energy + fun) / 3, low = Math.min(food, energy, fun);
  const label = low < 25 ? (low === food ? 'Hungry' : low === energy ? 'Sleepy' : 'Bored') : v > 72 ? 'Cheerful' : v > 50 ? 'Content' : 'Glum';
  return { value: v, label };
}

// Push overlapping residents apart. Walkers also sidestep to their right,
// so two people meeting head-on slide past each other instead of deadlocking.
function separate(sim) {
  const rs = RESIDENTS.map((r) => sim.people[r.id]).filter((s) => !s.hidden);
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j], dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz);
      if (d >= 2 * BODY) continue;
      const seatedA = anchored(a), seatedB = anchored(b);
      const push = (2 * BODY - d) / (seatedA || seatedB ? 1 : 2), nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
      for (const [s, sign] of [[a, 1], [b, -1]]) {
        if (anchored(s)) continue; // passers-by go around occupied seats and fishing spaces
        s.x += nx * push * sign;
        s.z += nz * push * sign;
        if (s.walking) { s.x += Math.cos(s.face) * push; s.z -= Math.sin(s.face) * push; }
      }
    }
}

function arrive(sim, r, s, plan) {
  s.at = s.target;
  s.face = Math.PI / 4; // turn to face the camera once arrived
  s.hidden = !!plan.inside; // the route crossed the threshold
  s.inDoor = null;
  s.task = plan.inside ? { inside: true, reached: true } : null;
  s.nextAct = sim.t;
  s.shopped = false;
  if (s.at === s.home) s.bag = false; // the groceries are put away
  life.arrival(sim, r, s);
  const where = LOC[s.at].name;
  const mate = partnerOf(sim, r.id);
  if (plan.sleep) note(sim, r.id, mate?.stage === 'together' && sim.people[mate.id].home === s.home ? `Said goodnight to ${PEOPLE[mate.id].name}. Sweet dreams.` : 'Tucked into bed. Goodnight!');
  else if (plan.work && s.shiftPay === 0) {
    note(sim, r.id, `Started my shift at ${where}.`);
    s.salesAt = sim.sales?.[s.at] ?? 0; // to judge how busy the day was
    s.bubble = { kind: 'chat', text: OPEN_LINES[s.at] ?? 'Time to get to work!', until: sim.t + 0.25 };
  }
}
// a word on arriving for a shift
const OPEN_LINES = {
  bakery: 'The ovens are warming up!', teahouse: 'Kettle on, cushions out.', shrine: 'Morning, little foxes.', library: 'Doors open, books ready.',
  market: 'Stalls up, fruit out!', store: 'Open for the day!', bathhouse: 'The water is lovely today.', theater: 'Places, everyone!',
  willow: 'Right, that roof.', farm: 'Morning, Hachi!', onsen: 'Steam is rising nicely.', woodlot: 'Axe sharp, sky clear.',
};

const BUY_LINES = {
  bakery: 'Warm melon pan!', teahouse: 'Matcha & dango~', market: 'Fresh peaches!',
  store: 'Just what I needed!', shrine: 'Good fortune, please~', bathhouse: 'Aah, warm yuzu~', onsen: 'Aah, mountain spring~', theater: 'Bravo!',
};
// How many treats a resident buys at once: one, plus one for every ¥6,000 saved beyond a ¥8,000 cushion.
// Spending rises with savings, so wages always find their way back to the tills instead of piling up in wallets.
const splurge = (s) => clamp(1 + Math.floor((s.money - (s.brain?.goal?.kind === 'home' ? HOME_PRICE + 8000 : 8000)) / 6000), 1, 5); // someone saving for a home keeps the cushion beyond its price

// Visitors pay at a counter, stall, offering box or door; the well-off splurge, which keeps money circulating back to the tills.
function buy(sim, r, s) {
  s.boughtAt = sim.t;
  if (!SHOP[s.at]) return;
  if (!life.fireLit(sim, s.at)) { note(sim, r.id, `The fires at ${LOC[s.at].name} have gone out until more firewood arrives.`); return; }
  const n = splurge(s), price = priceAt(sim, s.at) * n;
  if (sim.t - (s.paid?.[s.at] ?? -1e9) < 90) return; // one ticket, soak or offering per visit, not three in an evening
  if (s.money - price < (s.needs.food < 30 ? 0 : (RENT[s.home] ?? 0) * 1.5)) return; // keep enough back for tonight's rent
  (s.paid ??= {})[s.at] = sim.t;
  s.money -= price;
  sim.tills[tillOf(sim, s.at)] += price;
  sim.sales[s.at] += price;
  note(sim, r.id, `${SHOP[s.at][1]}${n > 1 ? ` (and a treat or two)` : ''} at ${LOC[s.at].name} (${yen(price)}).`);
  s.bubble = { kind: 'coin', text: BUY_LINES[s.at], until: sim.t + 0.2 };
}

const TOPICS = ['whose turn it was to sweep the lane', 'the best dango in town', 'a borrowed umbrella', 'the ending of last night\'s play', 'a noisy cat', 'how much to tip at the bathhouse'];
const GIFTS = ['a jar of honey', 'a folded paper crane', 'a tin of sencha', 'a little bouquet', 'a hand-knitted scarf', 'a box of mochi'];

const GIFT_PRICE = 500;
const CHIME = ['Ha! So true.', 'Mind if I join in?', 'I was just thinking that!', 'Oh, me too!', 'Really? Tell me more!', 'You two always make me laugh.'];

// Every few minutes, residents idling at the same place may chat, bicker, swap gifts or fall in love.
// Friends who pass each other on the road wave and call out, at most once an hour per pair.
const GREETS = [['Hi, {B}!', 'Hey, {A}!'], ['Off somewhere nice?', 'Just the shop!'], ['{TOD}, {B}!', '{TOD}~'], ['See you later!', 'Bye, {A}!']];
const HOME_GREETS = [['{TOD}, housemate!', '{TOD}, {A}!'], ['Need anything from town?', 'Just milk, thanks!'], ['Did you lock up?', 'Of course!'], ['See you at dinner?', 'Wouldn’t miss it.']];
function greet(sim) {
  sim.greets ??= {};
  const walkers = RESIDENTS.filter((r) => { const s = sim.people[r.id]; return s.walking && !s.hidden; });
  for (let a = 0; a < walkers.length; a++)
    for (let b = a + 1; b < walkers.length; b++) {
      const A = walkers[a], B = walkers[b], SA = sim.people[A.id], SB = sim.people[B.id], k = key(A.id, B.id);
      const mates = SA.home === SB.home && SA.house === SB.house; // housemates always say hello
      if ((sim.rel[k] < 40 && !mates) || Math.hypot(SA.x - SB.x, SA.z - SB.z) > 2.6 || sim.t - (sim.greets[k] ?? -1e9) < 60 || SA.bubble?.until > sim.t || SB.bubble?.until > sim.t) continue;
      sim.greets[k] = sim.t;
      const { h } = clockOf(sim), tod = h < 11 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
      const pool = mates && rand(sim) < 0.6 ? HOME_GREETS : GREETS;
      const [la, lb] = pool[Math.floor(rand(sim) * pool.length)].map((t) => t.replace('{A}', A.name).replace('{B}', B.name).replace('{TOD}', tod));
      SA.bubble = { kind: sim.couples[k] ? 'heart' : 'chat', text: la, until: sim.t + 0.12 };
      SB.bubble = { kind: sim.couples[k] ? 'heart' : 'chat', text: lb, from: sim.t + 0.04, until: sim.t + 0.16 };
    }
}

// Little things said aloud: shopkeepers calling to passers-by, a yawn on the way home, a remark on the weather.
const CALLS = {
  bakery: ['Fresh bread, hot from the oven!', 'Melon pan, just baked!'], teahouse: ['Matcha and sweets, come in!', 'A warm pot of sencha?'],
  market: ['Ripe peaches, sweet as honey!', 'Fresh from Sunfield today!'], store: ['Miso, rice and candles!'], onsen: ['The spring is lovely and hot!'],
  bathhouse: ['Yuzu baths, warm and ready!'], theater: ['Tonight’s play starts soon!'],
};
function chatter(sim) {
  const w = weatherNow(sim), quiet = (s) => !s.hidden && !(s.bubble?.until > sim.t);
  if (w !== sim.lastWeather) { // the first drops of rain or the first flakes get noticed
    const { h } = clockOf(sim), rainbow = sim.lastWeather === 'rain' && w !== 'snow' && h > 7 && h < 18; // the sky rewards a shower with a rainbow
    const line = rainbow ? 'Look, a rainbow!' : { rain: 'Oh! It’s starting to rain.', snow: 'Look, it’s snowing!', clear: 'The sun’s come out!' }[w];
    if (line && sim.lastWeather) for (const r of RESIDENTS) { const s = sim.people[r.id]; if (quiet(s) && !s.at && rand(sim) < 0.5) s.bubble = { kind: 'chat', text: line, until: sim.t + 0.15 }; }
    sim.lastWeather = w;
  }
  for (const r of RESIDENTS) {
    const s = sim.people[r.id];
    if (!quiet(s)) continue;
    if (s.work && CALLS[s.at] && life.shopOpen(sim, s.at) && rand(sim) < 0.12 && RESIDENTS.some((o) => o.work !== s.at && !sim.people[o.id].hidden && Math.hypot(sim.people[o.id].x - s.x, sim.people[o.id].z - s.z) < 9)) {
      s.bubble = { kind: 'coin', text: CALLS[s.at][Math.floor(rand(sim) * CALLS[s.at].length)], until: sim.t + 0.15 };
    } else if (s.walking && s.needs.energy < 25 && rand(sim) < 0.15) s.bubble = { kind: 'chat', text: 'Yaaawn... bed soon.', until: sim.t + 0.12 };
    else if (s.walking && s.needs.food < 25 && rand(sim) < 0.15) s.bubble = { kind: 'chat', text: 'So hungry...', until: sim.t + 0.12 };
  }
}

// Friendships that grow (or sour) past a milestone leave a line in both diaries.
const MILESTONES = {
  Friend: (o) => `${o.name} and I are proper friends now.`,
  'Close friend': (o) => `${o.name} has become one of my closest friends.`,
  Frosty: (o) => `Things have gone a bit frosty with ${o.name}.`,
  Rival: (o) => `${o.name} and I just can’t get along any more.`,
};
const RANK = ['Rival', 'Frosty', 'Stranger', 'Acquaintance', 'Friend', 'Close friend'];
function milestones(sim) {
  const quiet = !sim.tiers, { day } = clockOf(sim); // older saves start from today's standing without a flood of notes
  sim.tiers ??= {};
  RESIDENTS.forEach((A, i) => RESIDENTS.slice(i + 1).forEach((B) => {
    const k = key(A.id, B.id), name = tier(sim.rel[k]), now = RANK.indexOf(name);
    const t = sim.tiers[k] ??= [now, now, -99]; // [current, best ever, day of the last frosty note]
    const say = (line) => { if (!quiet) { note(sim, A.id, line(B)); note(sim, B.id, line(A)); } };
    if (now > t[1]) { t[1] = now; if (MILESTONES[name]) say(MILESTONES[name]); } // only a new high counts, so hovering at a threshold stays quiet
    if ((name === 'Frosty' || name === 'Rival') && t[0] > now && day - t[2] >= 7) { t[2] = day; say(MILESTONES[name]); }
    t[0] = now;
  }));
}

function socialize(sim) {
  greet(sim);
  chatter(sim);
  milestones(sim);
  const groups = {};
  for (const r of RESIDENTS) {
    const s = sim.people[r.id];
    if (s.at && !s.hidden && !s.walking) (groups[s.at] ??= []).push(r);
  }
  for (const [loc, rs] of Object.entries(groups))
    for (let a = 0; a < rs.length; a++)
      for (let b = a + 1; b < rs.length; b++) {
        if (rand(sim) > 0.3) continue;
        const A = rs[a], B = rs[b], SA = sim.people[A.id], SB = sim.people[B.id], k = key(A.id, B.id);
        if (SA.bubble?.until > sim.t || SB.bubble?.until > sim.t || SA.chatUntil > sim.t || SB.chatUntil > sim.t) continue;
        if (Math.hypot(SA.x - SB.x, SA.z - SB.z) > 3.2) continue;
        const both = (fn) => { fn(A, B, SA); fn(B, A, SB); };
        const grumpy = (moodOf(SA).value + moodOf(SB).value) / 2 < 45;
        let kind, textA, textB;
        if (rand(sim) < (grumpy ? 0.14 : 0.04)) {
          // a disagreement: moods sour and so does the friendship
          sim.rel[k] = Math.max(-100, sim.rel[k] - (2 + rand(sim) * 4));
          life.remember(sim, A.id, 'person', B.id, -1);
          life.remember(sim, B.id, 'person', A.id, -1);
          both((X, Y, S) => (S.needs.fun = Math.max(0, S.needs.fun - 4)));
          kind = 'storm'; textA = 'Hmph!'; textB = 'Hold on!';
          if (rand(sim) < 0.25) {
            const topic = TOPICS[Math.floor(rand(sim) * TOPICS.length)];
            both((X, Y) => note(sim, X.id, `Bickered with ${Y.name} about ${topic}.`));
          }
          const c = sim.couples[k];
          if (c && sim.rel[k] < (c.married ? 20 : 50)) breakUp(sim, A, B, c); // a marriage weathers more than a quarrel
        } else {
          sim.rel[k] = Math.min(100, sim.rel[k] + (1.2 + rand(sim) * 3) / 5); // ≈ +3.2/hour together
          life.remember(sim, A.id, 'person', B.id, 0.25);
          life.remember(sim, B.id, 'person', A.id, 0.25);
          both((X, Y, S) => (S.needs.fun = Math.min(100, S.needs.fun + 3)));
          kind = sim.couples[k] ? 'heart' : 'chat';
          [textA, textB] = chatLines({
            A, B, SA, SB, loc, h: clockOf(sim).h, weather: weatherNow(sim), season: sim.today.season, festival: festivalNow(sim),
            wedding: loc === 'shrine' && sim.wedding?.status === 'live' ? sim.wedding.couple.split(':') : null,
            rel: sim.rel[k], couple: sim.couples[k], recent: recentExchanges(sim, A.id, B.id), news: (sim.news ?? []).filter((n) => sim.t - n.t < 2 * 1440).map((n) => ({ kind: n.kind, a: PEOPLE[n.a], b: PEOPLE[n.b] })), chance: () => rand(sim), pick: (list) => list[Math.floor(rand(sim) * list.length)],
          });
          const bday = [A, B].find((X) => isBirthday(sim, X.id) && sim.people[X.id].bdayFrom?.[X === A ? B.id : A.id] !== clockOf(sim).day);
          if (bday && sim.rel[k] >= 30) { // friends wish them a happy birthday, and good friends bring a present
            const other = bday === A ? B : A, S = sim.people[bday.id];
            S.bdayFrom = { ...(S.bdayFrom ?? {}), [other.id]: clockOf(sim).day };
            const g = sim.rel[k] >= 55 && gift(sim, other, bday, k, true);
            kind = g || 'heart';
            [textA, textB] = bday === A ? ['Thank you so much!', `Happy birthday, ${A.name}!`] : [`Happy birthday, ${B.name}!`, 'You remembered!'];
            note(sim, bday.id, `${other.name} wished me a happy birthday${g ? ' and brought a present' : ''}.`);
          } else if (sim.rel[k] >= 45 && rand(sim) < 0.04) {
            const g = gift(sim, A, B, k);
            if (g) { kind = g; textA = 'A little gift for you!'; textB = 'Oh, thank you!'; }
          }
          romance(sim, A, B, k);
        }
        SA.bubble = { kind, text: textA, until: sim.t + 0.2 };
        SB.bubble = { kind, text: textB, from: sim.t + 0.07, until: sim.t + 0.27 }; // the reply comes a beat later
        const third = kind === 'chat' && rand(sim) < 0.35 && rs.find((C) => C !== A && C !== B && (() => { const SC = sim.people[C.id]; return !SC.walking && !SC.hidden && !SC.work && !(SC.bubble?.until > sim.t) && Math.hypot(SC.x - SA.x, SC.z - SA.z) < 3; })());
        if (third) { // a neighbour within earshot chimes in, and the chat becomes a little group
          const SC = sim.people[third.id];
          const intro = sim.rel[key(third.id, A.id)] >= 40 && sim.rel[key(third.id, B.id)] < 15; // A's friend meets B for the first time
          if (intro) {
            SA.bubble = { kind: 'chat', text: `Oh! ${B.name}, meet ${third.name}.`, until: sim.t + 0.2 };
            SC.bubble = { kind: 'chat', text: `Nice to meet you, ${B.name}!`, from: sim.t + 0.14, until: sim.t + 0.34 };
            sim.rel[key(third.id, B.id)] += 8;
            note(sim, B.id, `${A.name} introduced me to ${third.name}. They seem lovely.`);
            note(sim, third.id, `Met ${B.name} through ${A.name}.`);
          } else SC.bubble = { kind: 'chat', text: CHIME[Math.floor(rand(sim) * CHIME.length)], from: sim.t + 0.14, until: sim.t + 0.34 };
          if (!anchored(SC)) SC.face = Math.atan2(SA.x - SC.x, SA.z - SC.z);
          for (const X of [A, B]) sim.rel[key(third.id, X.id)] = Math.min(100, sim.rel[key(third.id, X.id)] + 0.3);
        }
        scheduleConversation(sim, [A.id, B.id, ...(third ? [third.id] : [])], loc);
        if (!SA.walking && !SB.walking && !anchored(SA) && !anchored(SB)) { // turn to each other
          SA.face = Math.atan2(SB.x - SA.x, SB.z - SA.z);
          SB.face = Math.atan2(SA.x - SB.x, SA.z - SB.z);
        }
        // (friendship milestones are noted by milestones(), which ignores a friendship hovering at a threshold)
        if (kind === 'chat' && rand(sim) < 0.04) both((X, Y) => note(sim, X.id, `Chatted with ${Y.name} at ${LOC[loc].name}.`));
      }
}

function gift(sim, A, B, k, ordered = false) {
  const [giver, taker] = ordered || rand(sim) < 0.5 ? [A, B] : [B, A], s = sim.people[giver.id];
  if (s.money < GIFT_PRICE * 6) return null;
  const what = GIFTS[Math.floor(rand(sim) * GIFTS.length)];
  s.money -= GIFT_PRICE;
  sim.tills.store += GIFT_PRICE; // gifts come from Kumo General Store
  sim.rel[k] = Math.min(100, sim.rel[k] + 4);
  note(sim, giver.id, `Gave ${taker.name} ${what}.`);
  note(sim, taker.id, `${giver.name} gave me ${what}!`);
  return 'gift';
}

// Big moments become town news for a few days, and come up when neighbours chat.
function gossip(sim, kind, a, b) {
  sim.news = [...(sim.news ?? []).filter((n) => sim.t - n.t < 3 * 1440), { kind, a, b, t: sim.t }].slice(-8);
}

function romance(sim, A, B, k) {
  const c = sim.couples[k];
  if (!c) {
    const lanterns = festivalNow(sim); // the festival lanterns make the bravest of us brave
    if (sim.rel[k] < 80 || A.romance === false || B.romance === false || partnerOf(sim, A.id) || partnerOf(sim, B.id) || rand(sim) > (lanterns ? 0.12 : 0.03)) return;
    sim.couples[k] = { since: sim.t, stage: 'dating', day: clockOf(sim).day };
    gossip(sim, 'dating', A.id, B.id);
    note(sim, A.id, lanterns ? `Confessed my feelings to ${B.name} under the festival lanterns. They feel the same!` : `Asked ${B.name} out, and they said yes!`);
    note(sim, B.id, lanterns ? `${A.name} confessed under the lanterns. My heart is racing!` : `${A.name} asked me out. I said yes!`);
  } else if (c.stage === 'dating' && sim.rel[k] >= 95 && sim.t - c.since >= 2 * 1440 && rand(sim) < 0.02) {
    c.stage = 'together';
    c.togetherDay = clockOf(sim).day;
    gossip(sim, 'together', A.id, B.id);
    for (const [X, Y] of [[A, B], [B, A]]) note(sim, X.id, `${Y.name} and I are making it official. We’re looking for a private home together.`);

  }
}

// A week to the day after a couple got together, and every week after, they mark the occasion.
function anniversaries(sim) {
  const day = clockOf(sim).day;
  for (const [k, c] of Object.entries(sim.couples)) {
    c.day ??= Math.floor(c.since / 1440);
    if (day > c.day && (day - c.day) % 7 === 0 && c.marked !== day) {
      c.marked = day;
      const [a, b] = k.split(':'), weeks = (day - c.day) / 7;
      sim.rel[k] = Math.min(100, sim.rel[k] + 3);
      for (const [x, y] of [[a, b], [b, a]]) note(sim, x, `${weeks === 1 ? 'One week' : `${weeks} weeks`} with ${PEOPLE[y].name} today. Time flies.`);
    }
  }
}

// A couple who have shared a home for a while and adore each other marry at the shrine the next afternoon,
// with their friends there to celebrate. The scene shows petals over the shrine while it happens.
function planWedding(sim) {
  if (sim.wedding && !['done', 'cancelled'].includes(sim.wedding.status)) return;
  const { day } = clockOf(sim);
  const ready = Object.entries(sim.couples).find(([, c]) => c.stage === 'together' && !c.married && c.engaged && day - c.engaged >= 2); // a couple of days after the proposal
  if (!ready) return;
  const [k] = ready;
  if (sim.rel[k] < 95) return;
  const [a, b] = k.split(':'), start = Math.floor(sim.t / 1440) * 1440 + 16 * 60;
  const guests = RESIDENTS.filter((r) => r.id !== a && r.id !== b && Math.max(sim.rel[key(r.id, a)], sim.rel[key(r.id, b)]) >= 25).map((r) => r.id);
  sim.wedding = { couple: k, start, ends: start + 60, guests, status: 'planned' };
  for (const [x, y] of [[a, b], [b, a]]) note(sim, x, `${PEOPLE[y].name} and I are getting married at ${LOC.shrine.name} this afternoon!`);
  for (const g of guests) note(sim, g, `Invited to ${PEOPLE[a].name} and ${PEOPLE[b].name}’s wedding at ${LOC.shrine.name} at four.`);
}
export const weddingNow = (sim) => (sim.wedding?.status === 'live' ? sim.wedding : null);
function updateWedding(sim, dt) {
  advanceCeremony(sim, dt, { PEOPLE, LOC, GIFT_PRICE, clockOf, key, note, rand, gossip });
}
// who goes to the wedding (the couple and any guest not on shift)
export function weddingPlan(sim, r) {
  const w = sim.wedding;
  if (!w || ['done', 'cancelled'].includes(w.status) || sim.t < w.start - 15 || sim.t >= w.ends) return null;
  const couple = w.couple.split(':').includes(r.id);
  if (!couple && (!w.guests.includes(r.id) || working(r, clockOf(sim).h))) return null;
  return { loc: 'shrine', act: couple ? 'Getting married' : 'At a wedding', wedding: true, reason: couple ? 'Our wedding day!' : 'Friends are getting married at the shrine.' };
}

function breakUp(sim, A, B, c) {
  delete sim.couples[key(A.id, B.id)];
  gossip(sim, 'breakup', A.id, B.id);
  for (const [X, Y] of [[A, B], [B, A]]) {
    note(sim, X.id, `${Y.name} and I broke up.`);
    // Housing arranges an actual move into a vacant or personally owned home.
    // A breakup must not silently assign someone else's occupied front door.
  }
}

export function relationsOf(sim, id) {
  const p = partnerOf(sim, id);
  const best = RESIDENTS.filter((o) => o.id !== id && o.id !== p?.id && sim.rel[key(id, o.id)] >= 70).sort((a, b) => sim.rel[key(id, b.id)] - sim.rel[key(id, a.id)])[0];
  return RESIDENTS.filter((o) => o.id !== id)
    .map((o) => {
      const value = Math.round(sim.rel[key(id, o.id)]);
      return { other: o, value, tier: p?.id === o.id ? (p.married ? 'Spouse' : p.engaged ? 'Engaged' : p.stage === 'together' ? 'Partner' : 'Dating') : best === o ? 'Best friend' : tier(value) };
    })
    .sort((a, b) => b.value - a.value);
}

export function statusOf(sim, id) {
  const s = sim.people[id];
  if (s.workDetail && s.work && s.at === PEOPLE[id].work && !s.walking && s.task?.reached) return `${s.workDetail} · ${LOC[s.at].name}`;
  if (life.activeMeal(s) && s.at === s.meal.loc) {
    if (s.meal.phase === 'queue') return `Waiting for a meal · ${LOC[s.at].name}${s.meal.rank ? ` · queue ${s.meal.rank}` : ''}`;
    if (s.meal.phase === 'serving') return `Being served · ${LOC[s.at].name}`;
    if (s.meal.phase === 'eating' && (s.walking || !s.task?.reached)) return `Taking a meal to the table · ${LOC[s.at].name}`;
    if (s.meal.phase === 'eating') return `Enjoying ${s.meal.fish ? 'grilled ' + s.meal.fish.name.toLowerCase() : s.meal.marketFish ? 'fresh market fish' : s.meal.portion === 'home' ? 'a home-cooked meal' : 'a meal'} · ${LOC[s.at].name}`;
    if (s.meal.phase === 'cooking') return `Cooking ${s.meal.fish ? s.meal.fish.name.toLowerCase() : 'a meal'} · ${LOC[s.at].name}`;
  }
  if (s.fishing && s.at === 'fishing' && s.task?.reached && !s.walking) return `${({ casting: 'Casting a line', waiting: 'Waiting for a bite', reeling: 'Reeling in a fish' })[s.fishing.phase]} · ${LOC.fishing.name}`;
  if (s.walking && !s.ambling) return `Walking to ${LOC[s.target].name}`;
  return s.hidden && s.act !== 'Sleeping' ? `${s.act} · inside ${LOC[s.at].name}` : `${s.act} · ${LOC[s.at].name}`;
}

// ---------- saving ----------
// The whole sim is plain data (the RNG state included), so it round-trips through JSON.
export const SAVE_VERSION = 8; // physical doorway crossings; older journeys are upgraded below
export const saveState = (sim) => JSON.stringify(sim);
export function loadState(json) {
  try {
    const sim = JSON.parse(json);
    const oldVersion = sim?.version;
    if ([5, 6].includes(oldVersion) && sim.people && sim.rel && sim.tills) addNewcomers(sim);
    if (oldVersion === 7 && sim.people && sim.rel && sim.tills) addNewcomers(sim, true);
    if ([5, 6, 7].includes(oldVersion) && sim.people && sim.rel && sim.tills) {
      RESIDENTS.forEach((r, i) => {
        const s = sim.people[r.id];
        if (!s) return;
        const loc = s.at ?? s.target;
        if (!PLACES[loc]?.doors || s.hidden || !s.path?.length) return;
        if (!(s.task?.inside || (!s.at && s.intent?.plan.inside))) return;
        const door = s.inDoor != null ? doorway(loc, s.inDoor) : doorOf(s, loc, i);
        s.path[s.path.length - 1] = { ...door, threshold: true };
        s.path.push(insideDoor(loc, door));
        s.goal = s.path[s.path.length - 1];
      });
      sim.version = SAVE_VERSION;
    }
    const ok = sim?.version === SAVE_VERSION && Number.isFinite(sim.t) && RESIDENTS.every((r) => Number.isFinite(sim.people?.[r.id]?.x));
    if (ok) settleHouses(sim);
    if (!ok) return null;
    life.initialize(sim);
    initializeConversations(sim);
    initializeVisitorMemory(sim);
    if (sim.roadLayout !== 2) {
      for (const [i, r] of RESIDENTS.entries()) {
        const s = sim.people[r.id];
        if (!s.walking || s.at || !LOC[s.target] || !s.path?.length) continue;
        s.from = { x: s.x, z: s.z };
        s.path = route(s, i, s.target, !!s.intent?.plan.inside);
        s.goal = s.path.at(-1); s.stuck = 0; s.best = 0;
      }
      sim.roadLayout = 2; // 2: smoothed meadow lane
    }
    return sim;
  } catch {
    return null;
  }
}

const life = createTownLife({ RESIDENTS, PEOPLE, LOC, LOCATIONS, HOUSES, HOUSE_NAMES, houseAt, houseTurn, workStations, DIST, HUB_R, RING, weddingPlan: (sim, r) => weddingPlan(sim, r), gossip: (...a) => gossip(...a), FOOD, PLACES, SEATS, SHOP, splurge, working, mealBreak, isWet, clockOf, hash, key, clamp, note, go, priceAt, tillOf, partnerOf, festivalNow, isHome, yen, moodOf });
export const personalityOf = (sim, id) => life.profile(sim, id);
export const goalProgress = (sim, id) => life.goalProgress(sim, id);
export const LEISURE_ACTS = LEISURE;
export const queueAt = (sim, loc) => life.queue(sim, loc);
export const shopOpen = (sim, loc) => life.shopOpen(sim, loc);
export const communityProject = (sim) => life.currentProject(sim);
export const groceryPriceAt = (sim, loc) => life.groceryPrice(sim, loc);
export const fireLit = (sim, loc) => life.fireLit(sim, loc);
