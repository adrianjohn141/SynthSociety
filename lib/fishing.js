// A saved, arrival-driven hobby: a catch is created only after an actual reel-in.
export const FISH = [
  { name: 'River dace', value: 180, nutrition: 38, color: '#b8dce0' },
  { name: 'Silver trout', value: 360, nutrition: 55, color: '#c8d6e8' },
  { name: 'Golden carp', value: 520, nutrition: 65, color: '#efc278' },
];
export const FISHING_SPACES = [-2, 0, 2].map((x) => [x, -2.3]);

export function createFishing(c) {
  const { RESIDENTS, LOC, PLACES, clockOf, isWet, hash, working, note, moveTo, remember, shopOpen } = c;
  const counters = () => ({ caught: 0, sold: 0, cooked: 0, eaten: 0, spoiled: 0 });
  function initialize(sim) {
    sim.waterfront ??= { ...counters(), marketStock: 0, marketServed: 0, paid: 0 };
    sim.waterfront.marketServed ??= 0;
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.fish ??= [];
      s.fishStats ??= counters();
      s.fishing ??= null;
      s.nextFishing ??= 0;
      s.nextFishSale ??= 0;
      s.fishSale ??= null;
    }
  }
  function count(sim, s, kind) { s.fishStats[kind]++; sim.waterfront[kind]++; }
  function freshen(sim, r) {
    const s = sim.people[r.id];
    if (!s.fish.some((fish) => sim.t - fish.caught > 1440)) return;
    s.fish = s.fish.filter((fish) => {
      if (sim.t - fish.caught <= 1440) return true;
      count(sim, s, 'spoiled'); note(sim, r.id, 'Composted yesterday’s fish; fresh food comes first.'); return false;
    });
  }
  const open = (sim) => !isWet(sim) && clockOf(sim).h >= 6.5 && clockOf(sim).h < 20;
  function plan(r, sim) {
    const s = sim.people[r.id], h = clockOf(sim).h;
    if (s.fishing && open(sim)) return fishingPlan();
    if (s.fish.length) {
      // A stable preference per fishing trip, with budget and hunger taking priority.
      const sell = s.needs.food > 60 && (s.money < 1800 || hash(r.id, s.fish[0].id, 'sell') < 0.6);
      if (sell && h < 15.8 && shopOpen(sim, 'market') && sim.t >= s.nextFishSale) {
        return { loc: 'market', act: 'Selling the fresh catch', fishSale: true, reason: 'Taking fresh fish to the market while a buyer is working.' };
      }
      if (s.needs.food < 85) return { loc: 'cookhouse', act: 'Cooking the fresh catch', meal: true, fishMeal: true, reason: 'Grilling my own catch, then sitting down to enjoy it.' };
    }
    if (!r.hobbies?.includes('fishing') || !open(sim) || h > 19.3 || sim.t < s.nextFishing || s.needs.food < 65 || s.needs.energy < 45 || s.fish.length >= 2) return null;
    // Do not begin a trip just before a shift or a scheduled meal break.
    if (r.hours[0] > h && r.hours[0] - h < 0.6) return null;
    const taken = new Set(RESIDENTS.map((o) => sim.people[o.id].fishing?.slot).filter((v) => v !== undefined));
    const slot = FISHING_SPACES.findIndex((_, i) => !taken.has(i));
    if (slot < 0) { s.nextFishing = sim.t + 10; return null; }
    s.fishing = { slot, phase: 'casting', started: null, until: null, landed: 0, stopAt: null };
    return fishingPlan();
  }
  const fishingPlan = () => ({ loc: 'fishing', act: 'Fishing at Reedwater', fishing: true, reason: 'A quiet fishing trip before the next meal or shift.' });
  function activity(sim, r, s, i, plan) {
    if (plan.fishSale) return sellActivity(sim, r, s, i);
    if (!plan.fishing) return false;
    const f = s.fishing;
    if (!f) return true;
    moveTo(sim, s, i, { at: FISHING_SPACES[f.slot], face: Math.PI, anim: `fish-${f.phase}`, kind: 'fishing', reserved: true, y: 0.12, duration: 20 });
    if (!s.task.reached) return true;
    f.stopAt ??= sim.t + 20;
    if (f.started === null) setPhase(sim, f, 'casting', 0.06);
    if (sim.t >= f.until) {
      if (f.phase === 'casting') setPhase(sim, f, 'waiting', 2 + hash(r.id, s.fishStats.caught, 'bite') * 4);
      else if (f.phase === 'waiting') {
        setPhase(sim, f, 'reeling', 0.09);
        s.bubble = { kind: 'chat', text: 'A bite!', until: sim.t + 0.12 };
      } else {
        const n = s.fishStats.caught;
        const pick = hash(r.id, n, 'species'), spec = FISH[pick < 0.5 ? 0 : pick < 0.87 ? 1 : 2];
        const fish = { ...spec, id: `${r.id}-${n + 1}`, caught: sim.t };
        s.fish.push(fish); count(sim, s, 'caught'); f.landed++;
        remember(sim, r.id, 'place', 'fishing', 2, `Caught a ${fish.name.toLowerCase()} at Reedwater. Taking it back fresh.`);
        s.bubble = { kind: 'gift', text: `${fish.name}!`, until: sim.t + 0.2 };
        if (f.landed >= 2 || s.fish.length >= 3 || sim.t >= f.stopAt) finish(sim, s);
        else setPhase(sim, f, 'casting', 0.06);
      }
    }
    if (s.fishing) s.task.anim = `fish-${f.phase}`;
    return true;
  }
  function setPhase(sim, f, phase, duration) { f.phase = phase; f.started = sim.t; f.until = sim.t + duration; }
  function finish(sim, s) { s.fishing = null; s.nextFishing = sim.t + 180; s.nextAct = sim.t; s.intent = null; }

  function sellActivity(sim, r, s, i) {
    if (!s.fish.length) { s.fishSale = null; return false; }
    s.fishSale ??= { joined: sim.t, ready: null };
    const sale = s.fishSale, station = PLACES.market.visit[1];
    moveTo(sim, s, i, { ...station, buy: false, anim: 'carry', kind: 'fish-sale', reserved: true, duration: 2 });
    const worker = RESIDENTS.find((o) => {
      const ws = sim.people[o.id];
      return o.work === 'market' && ws.work && ws.at === 'market' && (!ws.serving || ws.serving === r.id);
    });
    if (!worker || sim.t - sale.joined > 5) {
      if (sim.t - sale.joined > 5) { s.nextFishSale = sim.t + 90; s.fishSale = null; s.intent = null; note(sim, r.id, 'No buyer was free. Keeping the catch for supper.'); }
      return true;
    }
    if (!s.task.reached) return true;
    const ws = sim.people[worker.id], counter = PLACES.market.work[1];
    ws.serving = r.id;
    if (!ws.task?.reached || ws.task.at?.[0] !== counter.at[0] || ws.task.at?.[1] !== counter.at[1]) { ws.serve = 1; ws.nextAct = sim.t; sale.ready = null; return true; }
    sale.ready ??= sim.t + 0.5;
    ws.nextAct = Math.max(ws.nextAct, sale.ready + 0.1);
    if (sim.t < sale.ready) return true;
    const fish = s.fish[0], till = c.tillOf(sim, 'market');
    if (sim.tills[till] >= fish.value) {
      sim.tills[till] -= fish.value; s.money += fish.value;
      s.fish.shift(); count(sim, s, 'sold'); sim.waterfront.marketStock++; sim.waterfront.paid += fish.value;
      c.onCustomer?.(sim, worker.id);
      note(sim, r.id, `Sold a ${fish.name.toLowerCase()} to ${worker.name} for ${c.yen(fish.value)}.`);
      ws.bubble = { kind: 'coin', text: 'A fine fresh catch!', until: sim.t + 0.2 };
    } else { s.nextFishSale = sim.t + 120; note(sim, r.id, 'The market could not afford my catch. I’ll cook it instead.'); }
    ws.serving = null; s.fishSale = null; s.nextAct = sim.t; s.intent = null;
    return true;
  }
  function takeForMeal(sim, s) {
    const fish = s.fish.shift();
    if (fish) count(sim, s, 'cooked');
    return fish;
  }
  function update(sim) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (s.fishing && (!s.intent?.plan.fishing || !open(sim) || working(r, clockOf(sim).h))) finish(sim, s);
      if (s.fishSale && !s.intent?.plan.fishSale) s.fishSale = null;
    }
  }
  function serveMarketFish(sim) {
    if ((sim.waterfront.marketServed ?? 0) >= sim.waterfront.marketStock) return false;
    sim.waterfront.marketServed = (sim.waterfront.marketServed ?? 0) + 1;
    return true;
  }
  return { initialize, freshen, plan, activity, update, takeForMeal, serveMarketFish, eaten: (sim, s) => count(sim, s, 'eaten') };
}
