export const householdKey = (loc, house) => `${loc}:${house}`;
export const householdOf = (sim, id) => {
  const s = sim.people[id];
  return sim.households?.[householdKey(s.home, s.house)] ?? null;
};

export function createHouseholds(c) {
  const { RESIDENTS, houseAt, houseTurn, LOC, clockOf, working, isWet, note, moveTo } = c;
  function address(sim, s) {
    return sim.households[householdKey(s.home, s.house)] ??= { tidiness: 85, dirtyLaundry: 0, laundry: null, chore: null, washed: 0, folded: 0, swept: 0, day: Math.floor(sim.t / 1440) };
  }
  function ensure(sim) {
    sim.households ??= {};
    for (const r of RESIDENTS) {
      address(sim, sim.people[r.id]);
    }
  }
  function initialize(sim) { ensure(sim); }

  function plan(r, sim) {
    const s = sim.people[r.id], h = address(sim, s), { h: hour } = clockOf(sim);
    const busy = h.chore && h.chore.who !== r.id;
    if (busy || working(r, hour) || s.wants || s.needs.food < 55 || s.needs.energy < 40 || hour < 6.5 || hour >= 20.5) return null;
    if (r.hours[0] > hour && (r.hours[0] - hour) * 60 < 20) return null;
    let kind = h.chore?.kind;
    // A resident already at home does a small job before going out. After work,
    // a waiting load or an untidy doorstep is a reason to return to their house;
    // dry laundry brings them straight home, since it holds up any move (housing.js free).
    if (!kind && s.at !== s.home && hour < 18 && !(h.laundry?.remaining <= 0)) return null;
    kind ??= h.laundry?.remaining <= 0 ? 'fold' : h.tidiness < 65 ? 'sweep' : !h.laundry && h.dirtyLaundry >= 2 && !isWet(sim) ? 'wash' : null;
    if (!kind || (kind === 'wash' && isWet(sim))) return null;
    h.chore ??= { who: r.id, kind, address: householdKey(s.home, s.house), minutes: 0, amount: kind === 'wash' ? Math.min(3, h.dirtyLaundry) : 0 };
    return { loc: s.home, act: { fold: 'Folding the clean laundry', sweep: 'Sweeping our front path', wash: 'Washing the household laundry' }[kind], housework: kind, reason: 'A little care makes our house a nicer place to come home to.' };
  }

  function activity(sim, r, s, i, plan) {
    if (!plan.housework) return false;
    const h = householdOf(sim, r.id), chore = h?.chore;
    if (!chore || chore.who !== r.id) return false;
    const at = houseAt(s.home, s.house, [-0.8, 4.6]); // the open front path, clear of the wall, flowerpot and neighbouring eaves
    const indoors = chore.kind === 'fold' && isWet(sim);
    moveTo(sim, s, i, { ...(indoors ? { inside: true, door: s.house } : { at }), face: houseTurn(s.home, s.house) + Math.PI, anim: chore.kind, kind: `housework-${chore.kind}`, duration: { wash: 8, sweep: 6, fold: 4 }[chore.kind] });
    return true;
  }

  function update(sim, dt) {
    const byHouse = new Map();
    for (const r of RESIDENTS) {
      const s = sim.people[r.id], key = householdKey(s.home, s.house);
      address(sim, s);
      if (!byHouse.has(key)) byHouse.set(key, []);
      byHouse.get(key).push(r);
    }
    const day = Math.floor(sim.t / 1440), wet = isWet(sim), hour = clockOf(sim).h;
    for (const [key, h] of Object.entries(sim.households)) {
      const residents = byHouse.get(key) ?? [];
      if (h.day !== day) {
        // An offline skip adds one current load, not years of unworn clothes.
        h.dirtyLaundry = Math.min(12, h.dirtyLaundry + residents.length);
        h.day = day;
      }
      const atHome = residents.filter((r) => {
        const s = sim.people[r.id], l = LOC[s.home], [x, z] = houseAt(s.home, s.house, [0, 2.3]);
        const porch = { x: l.x + x * l.uz + z * l.ux, z: l.z - x * l.ux + z * l.uz };
        const insideOwnDoor = s.hidden && (s.inDoor == null || s.inDoor === s.house);
        return s.at === s.home && !s.work && !s.walking && !s.intent?.plan.sleep && (insideOwnDoor || (!s.hidden && Math.hypot(s.x - porch.x, s.z - porch.z) < 2.5));
      });
      h.tidiness = Math.max(0, h.tidiness - atHome.length * dt / 60 * 0.8);
      if (h.laundry?.remaining > 0 && !wet && hour >= 7 && hour < 19) h.laundry.remaining = Math.max(0, h.laundry.remaining - dt);
      const job = h.chore;
      if (!job) continue;
      const s = sim.people[job.who], r = RESIDENTS.find((p) => p.id === job.who);
      const available = residents.some((p) => p.id === job.who) && !working(r, hour) && !s.wants && s.needs.food >= 55 && s.needs.energy >= 40 && s.intent?.plan.housework === job.kind && (job.kind !== 'wash' || !wet);
      if (!available) { h.chore = null; continue; }
      if (s.at !== s.home || s.walking || (s.hidden && job.kind !== 'fold') || !s.task?.reached || s.task.kind !== `housework-${job.kind}`) continue;
      job.minutes += dt;
      const need = { wash: 8, sweep: 6, fold: 4 }[job.kind];
      if (job.minutes < need) continue;
      if (job.kind === 'wash') {
        const amount = Math.min(h.dirtyLaundry, job.amount);
        h.dirtyLaundry -= amount; h.washed += amount;
        h.laundry = { amount, remaining: 45, washed: sim.t };
        note(sim, r.id, `Washed ${amount} portions of household laundry and hung it out to dry.`);
      } else if (job.kind === 'fold') {
        if (h.laundry && h.laundry.remaining <= 0) {
          h.folded += h.laundry.amount; h.laundry = null;
          note(sim, r.id, 'Folded the dry laundry and put it away. Fresh clothes for the household.');
        }
      } else {
        h.tidiness = Math.min(100, h.tidiness + 35); h.swept++;
        note(sim, r.id, 'Swept our front path. It feels lovely to have the house in order.');
      }
      s.needs.fun = Math.min(100, s.needs.fun + 2);
      s.nextAct = sim.t; s.intent = null; h.chore = null;
    }
  }
  return { initialize, plan, activity, update };
}
