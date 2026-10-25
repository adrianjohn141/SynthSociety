// A workplace that makes goods while its workers are on the job, and carries cartloads to the shops that use them.
// The shops pay the workplace's till; their stock runs down per sale (use) or while they're open (burn).
// spec: { at, state, shelves, customers, grow, max, shelf, price, cart, unit, act, reason, line }
export function createSupply(c, spec) {
  const { RESIDENTS, PLACES, note, moveTo, shopOpen, tillOf, yen } = c;
  const workers = RESIDENTS.filter((r) => r.work === spec.at);

  function initialize(sim) {
    sim[spec.state] ??= { produce: 20, growth: 0, grown: 0, delivered: 0, deliverer: null };
    sim[spec.shelves] ??= Object.fromEntries(spec.customers.map((loc) => [loc, 12]));
    if (spec.burn) sim[spec.state].burnt ??= Object.fromEntries(spec.customers.map((loc) => [loc, 0]));
  }

  function update(sim, dt) {
    const st = sim[spec.state], shelves = sim[spec.shelves];
    for (const r of workers) {
      const s = sim.people[r.id];
      if (s.work && s.at === spec.at && !s.hidden && !s.walking && s.task?.reached && !['work-open', 'work-close'].includes(s.task.kind)) st.growth += dt;
    }
    while (st.growth >= spec.grow) {
      st.growth -= spec.grow;
      if (st.produce < spec.max) { st.produce++; st.grown++; }
    }
    if (spec.burn) for (const loc of spec.customers) { // a lit fire burns a bundle every so often while the shop is open
      if (!shopOpen(sim, loc) || shelves[loc] <= 0) continue;
      st.burnt[loc] += dt;
      if (st.burnt[loc] >= spec.burn) { st.burnt[loc] -= spec.burn; shelves[loc]--; }
    }
    if (st.deliverer && !sim.people[st.deliverer].intent?.plan.delivery) st.deliverer = null;
  }

  // On shift, a worker takes a cartload to whichever customer is running low and can pay for it.
  function deliveryPlan(r, sim) {
    const st = sim[spec.state], shelves = sim[spec.shelves];
    if (r.work !== spec.at || st.produce < 10 || (st.deliverer && st.deliverer !== r.id)) return null;
    const s = sim.people[r.id];
    if (s.intent?.plan.delivery) return s.intent.plan;
    const loc = spec.customers.filter((g) => shelves[g] < spec.shelf / 2 && shopOpen(sim, g) && sim.tills[tillOf(sim, g)] >= spec.price * 10)
      .sort((a, b) => shelves[a] - shelves[b])[0];
    if (!loc) return null;
    st.deliverer = r.id;
    return { loc, act: spec.act, work: true, delivery: true, supply: spec.at, reason: spec.reason };
  }

  const counter = (loc) => PLACES[loc].visit.find((v) => v.buy) ?? PLACES[loc].visit[0];
  function activity(sim, r, s, i) {
    moveTo(sim, s, i, { ...counter(s.at), buy: false, anim: 'carry', kind: 'delivery', reserved: true, duration: 1 });
    if (!s.task.reached) return true;
    const st = sim[spec.state], shelves = sim[spec.shelves], till = tillOf(sim, s.at);
    const n = Math.min(spec.cart, st.produce, spec.shelf - shelves[s.at], Math.floor(sim.tills[till] / spec.price));
    if (n > 0) {
      const pay = n * spec.price;
      sim.tills[till] -= pay;
      sim.tills[spec.at] += pay;
      st.produce -= n;
      st.delivered += n;
      shelves[s.at] += n;
      note(sim, r.id, `Delivered ${n} ${spec.unit} to ${c.LOC[s.at].name} for ${yen(pay)}.`);
      s.bubble = { kind: 'gift', text: spec.line, until: sim.t + 0.2 };
    }
    st.deliverer = null;
    s.intent = null;
    s.nextAct = sim.t;
    return true;
  }

  const has = (sim, loc) => !(loc in sim[spec.shelves]) || sim[spec.shelves][loc] > 0;
  const use = (sim, loc) => { if (loc in sim[spec.shelves]) sim[spec.shelves][loc] = Math.max(0, sim[spec.shelves][loc] - 1); };
  return { initialize, update, deliveryPlan, activity, has, use };
}
