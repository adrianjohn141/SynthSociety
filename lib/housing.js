// Private homes, moving days and titles. A saved reservation belongs to a real
// household; changing an address requires packing, travel and unpacking.
export const HOME_PRICE = 12000;
const address = (loc, house) => `${loc}:${house}`;
export const propertyOf = (sim, id) => {
  const s = sim.people[id];
  return sim.housing?.properties[address(s.home, s.house)] ?? null;
};
export const housingSummary = (sim) => ({
  homes: Object.keys(sim.housing?.properties ?? {}).length,
  owned: Object.values(sim.housing?.properties ?? {}).filter((p) => p.owner).length,
  moving: sim.housing?.moves.length ?? 0,
});

export function createHousing(c) {
  const { RESIDENTS, PEOPLE, LOC, HOUSES, houseAt, houseTurn, HOUSE_NAMES, working, clockOf, isWet, partnerOf, note, moveTo } = c;
  const units = Object.entries(HOUSES).flatMap(([loc, houses]) => houses.map((_, house) => ({ loc, house, key: address(loc, house) })));
  const same = (s, u) => s.home === u.loc && s.house === u.house;
  const moving = (sim, id) => sim.housing.moves.find((m) => m.members.includes(id));
  const together = (sim, id) => { const p = partnerOf(sim, id); return p?.stage === 'together' ? p.id : null; };
  const free = (sim, id) => {
    const s = sim.people[id], r = PEOPLE[id], hour = clockOf(sim).h;
    const household = sim.households[address(s.home, s.house)];
    const asleep = r.sleepHours && (r.sleepHours[0] < r.sleepHours[1] ? hour >= r.sleepHours[0] && hour < r.sleepHours[1] : hour >= r.sleepHours[0] || hour < r.sleepHours[1]);
    // The last tea shift ends at 20:00. A quiet hour before ordinary bedtimes
    // lets those couples move together; daytime sleepers keep their own rest.
    return hour >= 10 && hour < 21 && !asleep && !working(r, hour) && !working(r, hour + 0.5) && !s.wants && s.needs.food >= 50 && s.needs.energy >= 45 && !household?.laundry && household?.chore?.who !== id && !['queue', 'serving', 'cooking', 'eating'].includes(s.meal?.phase) && !sim.outings.some((o) => ['invited', 'together'].includes(o.status) && [o.host, o.guest].includes(id));
  };
  function initialize(sim) {
    sim.housing ??= { properties: {}, moves: [], history: [], next: Math.floor(sim.t / 1440) * 1440 + 18 * 60 };
    for (const u of units) sim.housing.properties[u.key] ??= { owner: null, bought: null };
  }
  function plan(r, sim) {
    const m = moving(sim, r.id);
    if (!m || isWet(sim) || !free(sim, r.id)) return null;
    const required = m.phase === 'packing' ? 4 : m.phase === 'unpacking' ? 6 : 0.1;
    if ((m.progress[r.id] ?? 0) >= required) return null;
    // Keep the commitments that existed when the move was booked. Comparing
    // both partners' continually renewed leisure deadlines would make each wait
    // for the other forever, so their agreed moving time is fixed once.
    if (sim.t < (m.ready ?? m.booked)) return null;
    const from = m.from[r.id], packing = m.phase === 'packing';
    return { loc: packing ? from.loc : m.to.loc, act: packing ? 'Packing for my new home' : m.phase === 'carrying' ? 'Carrying belongings to my new home' : 'Unpacking in my new home', moving: m.id, carryMove: m.phase === 'carrying', reason: 'Making a little place of our own, one box at a time.' };
  }
  function activity(sim, r, s, i, plan) {
    if (!plan.moving) return false;
    const m = moving(sim, r.id);
    if (!m) return false;
    const unit = m.phase === 'packing' ? m.from[r.id] : m.to;
    const member = m.members.indexOf(r.id);
    moveTo(sim, s, i, { at: houseAt(unit.loc, unit.house, [-0.8 + member * 0.9, 4.6]), face: houseTurn(unit.loc, unit.house) + Math.PI, anim: m.phase === 'carrying' ? 'carry' : 'work', kind: `move-${m.phase}`, reserved: true, duration: 10 });
    return true;
  }
  function arrange(sim) {
    // Retain one quiet daily rhythm instead of evaluating vacancies every frame.
    if (sim.t < sim.housing.next) return;
    sim.housing.next = sim.t + 30;
    if (isWet(sim)) return;
    for (const r of RESIDENTS) {
      if (moving(sim, r.id) || !free(sim, r.id)) continue;
      const s = sim.people[r.id], partner = together(sim, r.id), members = partner ? [r.id, partner].sort() : [r.id];
      if (!members.every((id) => !moving(sim, id))) continue;
      const occupants = RESIDENTS.filter((o) => same(sim.people[o.id], { loc: s.home, house: s.house }));
      const privateHome = occupants.every((o) => members.includes(o.id));
      const united = members.every((id) => same(sim.people[id], { loc: s.home, house: s.house }));
      if (privateHome && united) {
        const p = propertyOf(sim, r.id);
        if (!p.owner && s.at === s.home && !s.walking && !s.hidden && s.task?.reached && s.money >= HOME_PRICE + 4000) {
          s.money -= HOME_PRICE; sim.tills.town += HOME_PRICE;
          p.owner = r.id; p.bought = sim.t;
          s.ownedHome = { loc: s.home, house: s.house };
          note(sim, r.id, `Bought the ${HOUSE_NAMES[s.home][s.house]} at ${LOC[s.home].name} for ¥${HOME_PRICE.toLocaleString('en-US')}. A home of my own!`);
        }
        continue;
      }
      if (propertyOf(sim, r.id)?.owner === r.id && !partner) continue;
      const reserved = new Set(sim.housing.moves.map((m) => address(m.to.loc, m.to.house)));
      const available = units.filter((u) => !reserved.has(u.key) && (!sim.housing.properties[u.key].owner || members.includes(sim.housing.properties[u.key].owner)) && RESIDENTS.every((o) => !same(sim.people[o.id], u) || members.includes(o.id)));
      // Keep a purchased home, then a partner's private home; otherwise choose
      // the vacant cottage with the shortest combined commute.
      const score = (u) => (members.includes(sim.housing.properties[u.key].owner) ? -1000 : 0) + members.reduce((n, id) => n + Math.hypot(LOC[u.loc].x - LOC[PEOPLE[id].work].x, LOC[u.loc].z - LOC[PEOPLE[id].work].z), 0);
      available.sort((a, b) => score(a) - score(b) || a.key.localeCompare(b.key));
      const to = available[0];
      if (!to) continue;
      const ready = Math.max(sim.t, ...members.map((id) => sim.people[id].intent?.plan.flexible ? sim.people[id].intent.until : sim.t));
      const m = { id: `${Math.floor(sim.t)}-${members.join('-')}`, members, from: Object.fromEntries(members.map((id) => [id, { loc: sim.people[id].home, house: sim.people[id].house }])), to: { loc: to.loc, house: to.house }, phase: 'packing', progress: {}, booked: sim.t, ready };
      sim.housing.moves.push(m);
      for (const id of members) note(sim, id, `Reserved the ${HOUSE_NAMES[to.loc][to.house]} at ${LOC[to.loc].name}. Time to pack for a place of our own.`);
    }
  }
  function update(sim, dt) {
    for (const m of [...sim.housing.moves]) {
      const valid = m.members.every((id) => same(sim.people[id], m.from[id])) && (m.members.length === 1 || together(sim, m.members[0]) === m.members[1]);
      if (!valid) {
        sim.housing.moves.splice(sim.housing.moves.indexOf(m), 1);
        for (const id of m.members) note(sim, id, 'Put the moving plans on hold. Things have changed.');
        continue;
      }
      for (const id of m.members) {
        const s = sim.people[id];
        if (!free(sim, id) || isWet(sim) || s.intent?.plan.moving !== m.id || s.walking || s.hidden || !s.task?.reached || s.task.kind !== `move-${m.phase}`) continue;
        m.progress[id] = (m.progress[id] ?? 0) + dt;
      }
      if (!m.members.every((id) => (m.progress[id] ?? 0) >= (m.phase === 'packing' ? 4 : m.phase === 'unpacking' ? 6 : 0.1))) continue;
      if (m.phase !== 'unpacking') {
        m.phase = m.phase === 'packing' ? 'carrying' : 'unpacking'; m.progress = {};
        for (const id of m.members) { sim.people[id].nextAct = sim.t; sim.people[id].intent = null; }
        continue;
      }
      for (const id of m.members) {
        const s = sim.people[id];
        Object.assign(s, { home: m.to.loc, house: m.to.house, task: null, nextAct: sim.t, intent: null, moving: false });
        note(sim, id, `Moved into the ${HOUSE_NAMES[m.to.loc][m.to.house]} at ${LOC[m.to.loc].name}. Unpacked and made it home${m.members.length > 1 ? ' together' : ''}.`);
      }
      sim.housing.history.unshift({ members: m.members, from: m.from, to: m.to, when: sim.t });
      sim.housing.history.length = Math.min(10, sim.housing.history.length);
      sim.housing.moves.splice(sim.housing.moves.indexOf(m), 1);
    }
    arrange(sim);
  }
  return { initialize, plan, activity, update };
}
