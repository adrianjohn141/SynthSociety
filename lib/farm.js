// Sunfield Farm feeds the town: farmers grow produce and carry it to the shops, which pay the farm's till.
// Kitchens cook every meal they sell from it, and residents buy groceries at the market and store to cook at home.
import { createSupply } from './supply.js';

export const GROCERS = ['market', 'store'];
export const STOCKED = ['market', 'store', 'bakery', 'teahouse']; // shops that buy from the farm
export const PANTRY_MAX = 4; // portions a resident keeps at home
const GROCERY = 450; // shelf price per portion before the daily wobble

export function createFarm(c) {
  const { RESIDENTS, PLACES, clockOf, working, note, moveTo, shopOpen, tillOf, yen } = c;
  const supply = createSupply(c, {
    at: 'farm', state: 'farm', shelves: 'stock', customers: STOCKED,
    grow: 4, max: 80, shelf: 30, price: 300, cart: 12, // minutes of tending per portion; barn, shelf and cartload sizes; yen per portion
    unit: 'baskets of produce', act: 'Delivering fresh produce', reason: 'The shelves are running low and the barn is full.', line: 'Fresh from Sunfield!',
  });
  const groceryPrice = (sim, loc) => Math.round((GROCERY * sim.prices[loc]) / 10) * 10;

  function initialize(sim) {
    supply.initialize(sim);
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.pantry ??= 3;
      s.nextErrand ??= 0;
    }
  }

  // Off shift, a resident with an empty pantry goes grocery shopping while a grocer is open.
  function errandPlan(r, sim) {
    const s = sim.people[r.id], { h } = clockOf(sim);
    if (s.intent?.plan.errand && s.pantry < PANTRY_MAX) return s.intent.plan;
    if (s.pantry > 1 || sim.t < s.nextErrand || h < 6.5 || h > 20 || working(r, h)) return null;
    const loc = GROCERS.filter((g) => sim.stock[g] >= 2 && shopOpen(sim, g) && s.money >= groceryPrice(sim, g) * 2)
      .sort((a, b) => Math.hypot(s.x - c.LOC[a].door.x, s.z - c.LOC[a].door.z) - Math.hypot(s.x - c.LOC[b].door.x, s.z - c.LOC[b].door.z))[0];
    if (!loc) { s.nextErrand = sim.t + 30; return null; }
    return { loc, act: 'Buying groceries', errand: true, reason: 'The cupboard at home is nearly bare.' };
  }

  const worker = (sim, loc) => RESIDENTS.find((w) => w.work === loc && sim.people[w.id].work && sim.people[w.id].at === loc);
  const done = (sim, s) => { s.intent = null; s.nextAct = sim.t; };

  function activity(sim, r, s, i, plan) {
    if (plan.delivery) return supply.activity(sim, r, s, i);
    const counter = PLACES[s.at].visit.find((v) => v.buy) ?? PLACES[s.at].visit[0];
    moveTo(sim, s, i, { ...counter, buy: false, anim: 'buy', kind: 'groceries', reserved: true, duration: 1 });
    if (!s.task.reached) return true;
    const till = tillOf(sim, s.at), w = worker(sim, s.at);
    const price = groceryPrice(sim, s.at), n = Math.min(PANTRY_MAX - s.pantry, sim.stock[s.at], Math.floor(s.money / price));
    if (n > 0 && shopOpen(sim, s.at)) {
      s.money -= n * price;
      sim.tills[till] += n * price;
      sim.sales[s.at] += n * price;
      sim.stock[s.at] -= n;
      s.pantry += n;
      if (w) c.onCustomer?.(sim, w.id);
      s.bag = true; // carried home in a cloth bag
      note(sim, r.id, `Bought ${n} portions of groceries at ${c.LOC[s.at].name} (${yen(n * price)}).`);
      s.bubble = { kind: 'coin', text: 'Groceries for the week!', until: sim.t + 0.2 };
      if (w) sim.people[w.id].bubble = { kind: 'coin', text: 'Fresh from the farm today!', until: sim.t + 0.2 };
    } else {
      s.nextErrand = sim.t + 60;
      note(sim, r.id, `${c.LOC[s.at].name} had no groceries for me. I’ll try again later.`);
    }
    done(sim, s);
    return true;
  }

  // A home meal uses a pantry portion; with an empty pantry it's a thin meal of rice and pickles.
  const takeForMeal = (s) => (s.pantry > 0 ? (s.pantry--, true) : false);

  // A kitchen needs a portion of produce for every meal it sells.
  return { initialize, update: supply.update, deliveryPlan: supply.deliveryPlan, errandPlan, activity, takeForMeal, hasIngredients: supply.has, useIngredients: supply.use, groceryPrice };
}
