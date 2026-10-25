import { createFishing } from './fishing.js';
import { createFarm, PANTRY_MAX } from './farm.js';
import { createSupply } from './supply.js';
import { createPets } from './pets.js';
import { createHouseholds } from './households.js';
import { createWorkLife, serviceFactor } from './work-life.js';
import { createHousing } from './housing.js';
import { createBaths } from './baths.js';
import { createGoals } from './goals.js';
// Resident intentions, meals, shared outings and community projects. All state is
// plain saved data; the simulation supplies its existing movement/economy seams.
export function createTownLife(c) {
  const { RESIDENTS, PEOPLE, LOC, LOCATIONS, DIST, FOOD, PLACES, SEATS, working, isWet, clockOf, hash, key, clamp, note, go, priceAt, tillOf, partnerOf } = c;
  const work = createWorkLife({ ...c, moveTo });
  const fishing = createFishing({ ...c, moveTo, remember, shopOpen, onCustomer: work.customer });
  const farm = createFarm({ ...c, moveTo, shopOpen, onCustomer: work.customer });
  // Cedar Woodlot: firewood for the baths and the bakery ovens, which burn a bundle every half hour they're open
  const wood = createSupply({ ...c, moveTo, shopOpen }, {
    at: 'woodlot', state: 'woodlot', shelves: 'firewood', customers: ['bathhouse', 'onsen', 'bakery'],
    grow: 5, max: 60, shelf: 30, price: 200, cart: 12, burn: 30,
    unit: 'bundles of firewood', act: 'Delivering firewood', reason: 'The fires are burning low and the woodshed is full.', line: 'Dry cedar, ready to burn!',
  });
  const pets = createPets(c);
  const homes = createHouseholds({ ...c, moveTo });
  const housing = createHousing({ ...c, moveTo });
  const baths = createBaths({ ...c, moveTo });
  const goals = createGoals(c);
  const kitchenReady = (sim, loc) => farm.hasIngredients(sim, loc) && wood.has(sim, loc);
  const activeMeal = (s) => s.meal && !['done', 'cancelled'].includes(s.meal.phase);
  const distance = (s, l) => Math.hypot((s.x ?? LOC[s.home].door.x) - l.door.x, (s.z ?? LOC[s.home].door.z) - l.door.z);
  const traitNames = { social: ['Quiet', 'Sociable'], thrift: ['Generous', 'Thrifty'], curiosity: ['Familiar comforts', 'Curious'], routine: ['Spontaneous', 'Habitual'] };
  const projects = [
    { kind: 'performance', title: 'A play under the lanterns', loc: 'theater', event: 'Community performance', roles: [['nori', 'Repairing the stage', 'hammer', 25], ['kaede', 'Rehearsing the play', 'perform', 40], ['momo', 'Rehearsing the music', 'play', 40], ['kenji', 'Preparing refreshments', 'work', 20]] },
    { kind: 'garden', title: 'The shrine garden', loc: 'shrine', event: 'Garden gathering', roles: [['haru', 'Tending the community garden', 'garden', 30], ['yumi', 'Preparing the shrine grounds', 'sweep', 30], ['aiko', 'Arranging flowers', 'work', 25]] },
    { kind: 'market', title: 'Neighbours’ market day', loc: 'market', event: 'Community market', roles: [['sato', 'Delivering market supplies', 'carry', 25], ['hana', 'Preparing market treats', 'work', 30], ['aiko', 'Arranging the community stalls', 'work', 30], ['jun', 'Preparing market signs', 'work', 20]] },
    { kind: 'waterfront', title: 'Lanterns on Reedwater', loc: 'boardwalk', event: 'Waterfront lantern gathering', roles: [['taro', 'Rigging the lantern boats', 'work', 25], ['nori', 'Checking the boardwalk rails', 'hammer', 25], ['ren', 'Folding floating lanterns', 'work', 25], ['momo', 'Practising waterside music', 'play', 25]] },
  ];

  function initialize(sim) {
    sim.lifeVersion ??= 1;
    sim.outings ??= [];
    sim.projects ??= [];
    sim.harvest ??= { bushels: 0 };
    sim.lifeNext ??= Math.floor(sim.t);
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.traits ??= r.traits ? { ...r.traits } : Object.fromEntries(Object.keys(traitNames).map((k) => [k, hash('personality', r.id, k)]));
      s.memories ??= { places: {}, people: {}, events: [] };
      s.intent ??= null;
      s.meal ??= null;
      s.foodAvoid ??= {};
      s.lastInviteDay ??= -1;
      s.visit ??= null;
    }
    fishing.initialize(sim);
    farm.initialize(sim);
    wood.initialize(sim);
    pets.initialize(sim);
    homes.initialize(sim);
    housing.initialize(sim);
    work.initialize(sim);
    baths.initialize(sim);
    goals.initialize(sim);
    ensureProject(sim);
    return sim;
  }

  // tag names the kind of outcome for the lessons in goals.js: stoodup, late, tired, visit, cost, turned
  function remember(sim, id, type, target, value, text, tag) {
    const m = sim.people[id].memories;
    const bucket = type === 'place' ? m.places : m.people;
    const old = bucket[target] ?? { value: 0, visits: 0 };
    bucket[target] = { value: clamp(old.value * 0.8 + value, -10, 10), visits: old.visits + 1, when: sim.t };
    if (text) {
      m.events.unshift({ when: sim.t, text });
      m.events.length = Math.min(m.events.length, 12);
      note(sim, id, text);
    }
    goals.felt(sim, id, type, target, value, tag, old.value, bucket[target].value);
  }

  function shopOpen(sim, loc) {
    const { h } = clockOf(sim);
    return RESIDENTS.some((r) => {
      if (r.work !== loc || !working(r, h) || sim.people[r.id].wants) return false;
      return !c.mealBreak(r, h);
    });
  }

  function foodPlan(r, sim, act, onBreak = false) {
    const s = sim.people[r.id];
    let loc = activeMeal(s) ? s.meal.loc : null;
    if (!loc && s.fish.length) loc = s.at === 'cookhouse' ? 'cookhouse' : s.home;
    if (!loc) {
      const candidates = FOOD.filter((id) => shopOpen(sim, id) && kitchenReady(sim, id) && (s.foodAvoid[id] ?? 0) <= sim.t && s.money >= Math.round(priceAt(sim, id) * 0.6));
      loc = candidates.sort((a, b) => foodScore(s, sim, a) - foodScore(s, sim, b))[0] ?? s.home;
    }
    return { loc, act, meal: true, break: onBreak, reason: loc === s.home ? 'A simple meal at home fits my budget and the shops’ hours.' : 'A nearby open shop can serve a meal I can afford.' };
  }
  function foodScore(s, sim, id) {
    const queue = RESIDENTS.filter((r) => activeMeal(sim.people[r.id]) && sim.people[r.id].meal.loc === id).length;
    // a small pull toward the place already headed for, so near-ties don't flip the plan every step as distances change
    return distance(s, LOC[id]) + priceAt(sim, id) / 35 * goals.thrift(s) + queue * 4 - (s.memories.places[id]?.value ?? 0) * 3 - (s.target === id ? 3 : 0);
  }

  const SOAKS = { bathhouse: { draw: 0, tired: 0.35 }, onsen: { draw: 6, tired: 0.7 } };
  const OUTDOOR = ['shrine', 'market', 'fishing', 'boardwalk', 'farm', 'woodlot'];
  const freeChoices = (sim) => LOCATIONS.filter((l) => !isWet(sim) || !OUTDOOR.includes(l.id)); // where free time may go in this weather
  // Free time from the resident's own point of view: taste and habit, then what they want (goal), what they feel
  // (comfort, company, an argument they are keeping clear of) and what they can manage (money). `why` receives a
  // first-person reason when those extras, not plain preference, decided it.
  function leisure(r, sim, slot, why) {
    const s = sim.people[r.id], season = sim.today.season, b = s.brain, { h } = clockOf(sim);
    const seasonal = { spring: 'shrine', summer: 'teahouse', autumn: 'market', winter: 'bathhouse' }[season];
    const last = s.intent?.plan.loc, thrift = goals.thrift(s), social = goals.social(s), ease = goals.comfort(s);
    const early = r.hours[0] < 9 && h >= 18 ? clamp((h - 18) / 3, 0, 1) : 0; // an early shift tomorrow keeps people near their own bed
    const here = {};
    for (const o of RESIDENTS) { const q = sim.people[o.id]; if (o.id !== r.id && q.at && !q.hidden) (here[q.at] ??= []).push(o.id); }
    const scored = freeChoices(sim).filter((l) => !c.SHOP[l.id] || l.id === 'shrine' || s.money >= priceAt(sim, l.id)).map((l) => {
      const memory = s.memories.places[l.id], crowd = (here[l.id] ?? []).length;
      const familiarity = memory?.visits ?? 0;
      let score = (r.likes.includes(l.id) ? 15 : 0) + (memory?.value ?? 0) * 1.5;
      score += (familiarity ? Math.min(familiarity, 8) * s.traits.routine : 12 * s.traits.curiosity);
      score += (last === l.id ? s.traits.routine * 8 : 0) + (l.id === seasonal ? 8 : 0);
      score += Math.min(crowd, 4) * (social - 0.5) * 5;
      score -= distance(s, l) * 0.28;
      if (SOAKS[l.id]) score += SOAKS[l.id].draw + Math.max(0, 75 - s.needs.energy) * SOAKS[l.id].tired; // a tired body wants a hot soak; the hillside spring is worth the walk
      if (c.SHOP[l.id]) score -= priceAt(sim, l.id) / Math.max(300, s.money) * thrift * 14;
      score += hash(r.id, sim.today.day, slot, l.id) * (12 + s.traits.curiosity * 12);
      const fit = l.id === s.home ? 1 : SOAKS[l.id] ? 0.8 : (memory?.value ?? 0) >= 3 ? 0.6 : r.likes.includes(l.id) ? 0.4 : 0;
      const x = {
        goal: goals.pull(sim, r, s, l),
        company: clamp((here[l.id] ?? []).reduce((n, id) => n + goals.warmth(sim, r, s, id), 0) * 3 * (0.5 + social), -10, 10),
        keepAway: Object.keys(b.avoid).some((id) => l.id !== s.home && b.avoid[id] > sim.t && (sim.people[id].at === l.id || sim.people[id].target === l.id)) ? -30 : 0,
        comfort: ease * fit * 14,
        rest: l.id === s.home ? early * 10 : 0,
      };
      return { id: l.id, fit, x, base: score, score: score + x.goal + x.company + x.keepAway + x.comfort + x.rest };
    });
    scored.sort((a, z) => z.score - a.score);
    let pick = scored[0];
    const plain = scored.reduce((a, z) => (z.base > a.base ? z : a));
    // some days comfort wins even though something else scores higher
    const cosy = !why?.outing && ease > 0.4 && hash(r.id, sim.today.day, slot, 'comfort') < ease * 0.6 ? scored.find((q) => q.fit >= 0.6 && !q.x.keepAway) : null;
    if (cosy && cosy !== pick) { pick = cosy; if (why) why.text = s.needs.energy < 55 ? 'I am worn out. Somewhere familiar and easy sounds best.' : 'I am a bit low today. Somewhere comforting will do me good.'; }
    else if (why && pick !== plain) {
      const k = Object.keys(pick.x).reduce((a, z) => (pick.x[z] - plain.x[z] > pick.x[a] - plain.x[a] ? z : a));
      const who = Object.keys(b.avoid).find((id) => b.avoid[id] > sim.t && (sim.people[id].at === plain.id || sim.people[id].target === plain.id));
      const aim = PEOPLE[b.goal?.who ?? '']?.name;
      why.text = {
        keepAway: `I would rather not run into ${who ? PEOPLE[who].name : 'them'} just now.`,
        goal: { home: 'Saving for a home of my own, so I am keeping it cheap.', skill: 'Putting in some extra practice at my trade.', friend: `Hoping to run into ${aim} there.` }[b.goal?.kind],
        company: 'Good company is there, and I enjoy their time.',
        comfort: 'I need something familiar and easy today.',
        rest: 'Early start tomorrow, so I will stay close to my own bed.',
      }[k];
    }
    return pick.id;
  }

  function commit(r, sim, plan) {
    return committed(r, sim) ?? { reason: r.likes.includes(plan.loc) ? 'Some time at one of my favourite places.' : `Following my ${sim.today.season} routine and trying somewhere that suits my mood.`, ...plan, flexible: true };
  }

  // A flexible plan is kept until it runs out, the weather turns, or new information makes it a bad idea: here, someone
  // the resident is keeping clear of (after an argument or a no-show) has turned up at the place.
  const committed = (r, sim) => {
    const s = sim.people[r.id], old = s.intent;
    return old?.plan.flexible && sim.t < old.until && old.wet === isWet(sim) && !goals.unwelcome(sim, s, old.plan.loc) ? old.plan : null;
  };
  function recordPlan(sim, r, plan) {
    const s = sim.people[r.id], old = s.intent;
    if (!old || old.plan.loc !== plan.loc || old.plan.act !== plan.act || sim.t >= old.until) {
      if (plan.sheltered && !old?.plan.sheltered) note(sim, r.id, 'The weather turned. Taking my work indoors until it passes.');
      if (old?.plan.sheltered && !plan.sheltered && !isWet(sim)) note(sim, r.id, 'The weather cleared. Heading back outside.');
      s.intent = { plan: { ...plan }, started: sim.t, until: sim.t + 20 + s.traits.routine * 25, wet: isWet(sim), arrived: null };
    }
  }

  function priorityPlan(r, sim) {
    fishing.freshen(sim, r); // discard stale catch before selecting or preparing a meal
    const s = sim.people[r.id], { h } = clockOf(sim);
    if (s.wants || h >= 21 || (h < 6.5 && !working(r, h))) return null;
    const wedding = c.weddingPlan(sim, r); // even a shift waits for one's own wedding
    if (wedding) return wedding;
    if (working(r, h)) {
      if (c.mealBreak(r, h)) return null;
      if (isWet(sim) && ['market', 'shrine', 'willow'].includes(r.work)) {
        const loc = ['library', 'store', 'teahouse'].sort((a, b) => distance(s, LOC[a]) - distance(s, LOC[b]))[0];
        return { loc, act: 'Doing indoor preparation', work: true, sheltered: true, reason: 'Taking shelter until the bad weather passes.' };
      }
      return farm.deliveryPlan(r, sim) ?? wood.deliveryPlan(r, sim);
    }
    if (activeMeal(s)) return { loc: s.meal.loc, act: s.intent?.plan.meal ? s.intent.plan.act : 'Finishing a meal', meal: true, reason: 'Finishing the meal I already prepared.' };
    const project = currentProject(sim);
    if (project?.status === 'live') return { loc: project.loc, act: project.event, project: project.id, reason: 'Joining the event our neighbours prepared together.' };
    const role = project?.roles.find((v) => v.who === r.id && v.done < v.need && (!v.after || project.roles.find((q) => q.who === v.after).done >= project.roles.find((q) => q.who === v.after).need));
    if (role && project.status === 'preparing' && s.needs.food > 45 && s.needs.energy > 40 && h >= 10 && h < 20.5) {
      return { loc: project.loc, act: role.label, project: project.id, contribution: true, reason: `Helping with ${project.title.toLowerCase()}.` };
    }
    const outing = sim.outings.find((o) => ['invited', 'together'].includes(o.status) && [o.host, o.guest].includes(r.id) && sim.t >= o.start);
    if (outing && !c.festivalNow(sim)) {
      const other = PEOPLE[outing.host === r.id ? outing.guest : outing.host].name;
      return { loc: outing.loc, act: outing.kind === 'home' && outing.status === 'together' ? (outing.host === r.id ? `Having ${other} over for tea` : `Over for tea at ${other}’s`) : `${outing.status === 'together' ? 'Spending time' : 'Meeting up'} with ${other}`, outing: outing.id, reason: 'Keeping a plan we agreed on together.' };
    }
    return housing.plan(r, sim) ?? homes.plan(r, sim) ?? farm.errandPlan(r, sim) ?? fishing.plan(r, sim);
  }

  function moveTo(sim, s, i, act) {
    const same = s.task?.kind === act.kind && ((s.task?.at === act.at) || (Array.isArray(act.at) && s.task?.at?.[0] === act.at[0] && s.task?.at?.[1] === act.at[1]) || (act.world && s.task?.at?.x === act.at.x && s.task?.at?.z === act.at.z));
    if (!same) { s.nextAct = sim.t + (act.duration ?? 1); go(sim, s, i, act); }
  }
  function leave(sim, r, s) {
    baths.leave(sim, s);
    if (s.visit && sim.t - s.visit.started >= 3) {
      const value = clamp((s.needs.fun - s.visit.fun) / 10 + (s.needs.energy - s.visit.energy) / 20, -3, 3);
      remember(sim, r.id, 'place', s.visit.loc, value, undefined, 'visit');
    }
    s.visit = null;
    if (activeMeal(s)) {
      if (s.meal.phase !== 'eating') remember(sim, r.id, 'place', s.meal.loc, -1);
      s.meal.phase = 'cancelled';
    }
    s.meal = null;
  }

  function mealActivity(sim, r, s, i, plan) {
    // A past purchase (including one from an older save) cannot block a new
    // urgent meal. Ordinary visits still buy only once.
    if (s.shopped && plan.meal && (s.wants === 'food' || (plan.fishMeal && s.fish.length)) && !activeMeal(s)) s.shopped = false;
    const homeKitchen = s.at === s.home || (c.isHome(s.at) && activeMeal(s));
    if (plan.work || s.shopped || (!FOOD.includes(s.at) && !((homeKitchen || (s.at === 'cookhouse' && (s.fish.length || activeMeal(s)))) && (plan.meal || s.needs.food < 75)))) return false;
    if (!activeMeal(s)) {
      if (s.needs.food >= 90 && !plan.meal) return false;
      if (c.isHome(s.at) || s.at === 'cookhouse') {
        const fish = fishing.takeForMeal(sim, s);
        const stocked = !!fish || farm.takeForMeal(s);
        s.meal = { loc: s.at, phase: 'cooking', joined: sim.t, remaining: fish?.nutrition ?? (stocked ? 65 : 35), price: 0, portion: fish ? 'fish' : stocked ? 'home' : 'thin', fish };
        if (fish) note(sim, r.id, `Preparing grilled ${fish.name.toLowerCase()} from my own catch.`);
        else if (!stocked) note(sim, r.id, 'Only rice and pickles left at home. I need to buy groceries.');
      }
      else {
        const full = priceAt(sim, s.at), half = Math.round(full * 0.6);
        if (!shopOpen(sim, s.at) || s.money < half) { abandonMeal(sim, r, s, 'The shop could not serve me. I’ll make something at home.'); return true; }
        if (!farm.hasIngredients(sim, s.at)) { abandonMeal(sim, r, s, `${LOC[s.at].name} has run out of fresh produce until the farm delivers.`); return true; }
        if (!wood.has(sim, s.at)) { abandonMeal(sim, r, s, `The ovens at ${LOC[s.at].name} are cold until more firewood arrives.`); return true; }
        const small = s.money < full || (goals.thrift(s) > 0.65 && s.needs.food > 60 && c.splurge(s) === 1);
        const feast = small ? 1 : Math.min(3, c.splurge(s)); // savings above a comfort level go on bigger meals
        s.meal = { loc: s.at, phase: 'queue', joined: sim.t, remaining: small ? 35 : 65, price: small ? half : full * feast, portion: small ? 'small' : feast > 1 ? 'feast' : 'full' };
      }
    }
    const m = s.meal;
    if (m.phase === 'cooking') {
      const at = mealSpot(s, i);
      moveTo(sim, s, i, { at, face: s.at === 'cookhouse' ? Math.PI : undefined, anim: m.fish ? 'cook-fish' : 'work', kind: 'cook', duration: 3 });
      if (s.task.reached) {
        m.readyAt ??= sim.t + 3;
        if (sim.t >= m.readyAt) startEating(sim, r, s, i);
      }
    } else if (m.phase === 'eating') {
      // Sleep can replace a same-location meal's task without a departure.
      // Restore the actual eating task when breakfast resumes in the morning.
      if (s.task?.kind !== 'eat') startEating(sim, r, s, i);
    } else if (m.phase === 'queue' || m.phase === 'serving') {
      if (sim.t - m.joined > 6 || !shopOpen(sim, m.loc)) { abandonMeal(sim, r, s, 'The kitchen could not serve me in time. I’ll find another meal.'); return true; }
      const stations = PLACES[s.at].visit.filter((v) => v.buy && v.serve !== undefined);
      const queue = RESIDENTS.filter((o) => { const q = sim.people[o.id]; return q.at === s.at && activeMeal(q) && ['queue', 'serving'].includes(q.meal.phase); }).sort((a, b) => sim.people[a.id].meal.joined - sim.people[b.id].meal.joined || a.id.localeCompare(b.id));
      const rank = queue.findIndex((o) => o.id === r.id), station = stations[rank % stations.length];
      if (m.station !== undefined && m.station !== station.serve) { m.phase = 'queue'; m.readyAt = null; }
      m.rank = rank + 1;
      m.station = station.serve;
      const waiting = rank >= stations.length;
      const at = waiting ? [station.at[0], station.at[1] + Math.floor(rank / stations.length) * 0.95] : station.at;
      moveTo(sim, s, i, { at, face: station.face, anim: 'idle', kind: waiting ? 'queue' : 'order', reserved: true });
      if (!waiting && s.task.reached) {
        const worker = RESIDENTS.find((w) => { const ws = sim.people[w.id]; return w.work === m.loc && ws.work && ws.at === m.loc && (!ws.serving || ws.serving === r.id); });
        if (worker) {
          const ws = sim.people[worker.id], counter = PLACES[m.loc].work[m.station];
          ws.serving = r.id;
          const ready = ws.task?.reached && ws.task?.at?.[0] === counter.at[0] && ws.task?.at?.[1] === counter.at[1];
          if (!ready) { ws.serve = m.station; ws.nextAct = sim.t; }
          else {
            if (m.phase !== 'serving') { m.phase = 'serving'; m.readyAt = sim.t + 0.3 * serviceFactor(ws); }
            ws.nextAct = Math.max(ws.nextAct, m.readyAt + 0.05);
            if (sim.t >= m.readyAt) {
              if (s.money < m.price) { abandonMeal(sim, r, s, 'I decided to save my money and eat at home.'); return true; }
              s.money -= m.price;
              sim.tills[tillOf(sim, m.loc)] += m.price;
              sim.sales[m.loc] += m.price;
              s.boughtAt = sim.t;
              work.customer(sim, worker.id);
              if (m.loc === 'market' && fishing.serveMarketFish(sim)) m.marketFish = true;
              else farm.useIngredients(sim, m.loc);
              note(sim, r.id, `Paid ${c.yen(m.price)} for a ${m.marketFish ? 'fresh catch' : m.portion === 'small' ? 'small' : m.portion === 'feast' ? 'generous set' : 'fresh'} meal at ${LOC[m.loc].name}.`);
              ws.bubble = { kind: 'coin', text: m.marketFish ? 'Fresh Reedwater catch for you!' : 'Freshly prepared for you!', until: sim.t + 0.2 };
              ws.serving = null;
              startEating(sim, r, s, i);
            }
          }
        }
      }
    }
    return activeMeal(s);
  }

  function mealSpot(s, i) {
    const spots = PLACES[s.at].visit;
    return spots[(s.at === s.home ? s.house ?? i : i) % spots.length].at;
  }

  function abandonMeal(sim, r, s, text) {
    s.foodAvoid[s.at] = sim.t + 60;
    s.meal = null;
    s.intent = null;
    s.wants = 'food';
    remember(sim, r.id, 'place', s.at, -2, text, 'turned');
  }
  function startEating(sim, r, s, i) {
    s.meal.phase = 'eating';
    s.meal.rate = s.meal.remaining / (s.meal.portion === 'small' ? 6 : 10);
    const at = s.at === 'cookhouse' ? [[-2.6, 3.7], [-1.4, 3.7], [1.4, 3.7], [2.6, 3.7]][i % 4] : c.isHome(s.at) ? mealSpot(s, i) : [((i % 5) - 2) * 0.9, 4.8 + Math.floor(i / 5) * 0.85];
    moveTo(sim, s, i, { at, face: s.at === 'cookhouse' ? 0 : undefined, anim: (s.meal.fish || s.meal.marketFish) ? 'eat-fish' : 'eat', kind: 'eat', duration: 10 });
    s.bubble = { kind: 'coin', text: s.meal.fish ? 'Freshly grilled from my own catch!' : s.meal.marketFish ? 'Fresh Reedwater fish from the stall!' : s.meal.price ? 'Time to enjoy my meal.' : 'A simple home-cooked meal.', until: sim.t + 0.2 };
  }
  function consumeMeal(sim, r, s, dt) {
    const m = s.meal;
    if (m?.phase !== 'eating' || s.at !== m.loc || !s.task?.reached || s.task.kind !== 'eat' || s.walking) return 0;
    const gain = Math.min(m.remaining, m.rate * dt, 100 - s.needs.food);
    m.remaining -= gain;
    if (m.remaining < 1e-6 || s.needs.food + gain >= 95) {
      if (m.fish) fishing.eaten(sim, s);
      m.phase = 'done'; m.completed = sim.t; s.shopped = true; s.wants = s.wants === 'food' ? null : s.wants; s.nextAct = sim.t + 1;
      // a meal that swallowed a big share of the wallet is remembered as less satisfying, and teaches thrift
      const regret = clamp((m.price / (s.money + m.price) - 0.15) * 15, 0, 4);
      remember(sim, r.id, 'place', m.loc, 2 - regret, m.fish ? `Cooked and ate my ${m.fish.name.toLowerCase()} at ${LOC[m.loc].name}.` : `Finished a satisfying meal at ${LOC[m.loc].name}.`, regret >= 1 ? 'cost' : undefined);
    }
    return gain;
  }

  function arrival(sim, r, s) {
    s.visit = { loc: s.at, started: sim.t, fun: s.needs.fun, energy: s.needs.energy };
    if (s.intent) { s.intent.arrived = sim.t; s.intent.until = Math.max(s.intent.until, sim.t + 15); }
    const memory = s.memories.places[s.at];
    if (!memory || sim.t - memory.when > 120) remember(sim, r.id, 'place', s.at, r.likes.includes(s.at) ? 1 : 0);
  }

  function ensureProject(sim) {
    const cycle = Math.floor(sim.t / (3 * 1440));
    if (sim.projects.some((p) => p.cycle === cycle)) return;
    const spec = projects[cycle % projects.length];
    sim.projects.push({ id: `project-${cycle}`, cycle, kind: spec.kind, title: spec.title, loc: spec.loc, event: spec.event, status: 'preparing', deadline: cycle * 3 * 1440 + 2 * 1440 + 19 * 60, postponements: 0, roles: spec.roles.map(([who, label, anim, need], i) => ({ who, label, anim, need, done: 0, after: spec.kind === 'performance' && [1, 2].includes(i) ? spec.roles[0][0] : null })) });
    sim.projects = sim.projects.slice(-6);
  }
  const currentProject = (sim) => [...sim.projects].reverse().find((p) => !['complete', 'cancelled'].includes(p.status)) ?? sim.projects.at(-1);

  function updateProjects(sim, dt) {
    ensureProject(sim);
    for (const p of sim.projects) {
      if (p.status === 'preparing') {
        for (const role of p.roles) {
          const s = sim.people[role.who];
          if (role.done >= role.need || s.at !== p.loc || s.hidden || s.walking || !s.task?.reached) continue;
          if (role.after) { const prerequisite = p.roles.find((v) => v.who === role.after); if (prerequisite.done < prerequisite.need) continue; }
          if (!((s.intent?.plan.contribution && s.intent.plan.project === p.id) || (s.work && PEOPLE[role.who].work === p.loc))) continue;
          role.done = Math.min(role.need, role.done + dt);
          if (role.done === role.need) remember(sim, role.who, 'place', p.loc, 3, `${role.label} is finished for ${p.title.toLowerCase()}.`);
        }
        if (p.roles.every((v) => v.done >= v.need)) p.status = 'ready';
      }
      if (['ready', 'preparing'].includes(p.status) && sim.t >= p.deadline) {
        if (p.status === 'ready') { p.status = 'live'; p.ends = sim.t + 60; for (const role of p.roles) note(sim, role.who, `${p.event} has begun. We made it happen together!`); }
        else if (p.postponements < 2) { p.deadline += 1440; p.postponements++; for (const role of p.roles) note(sim, role.who, `${p.event} is postponed while we finish preparing.`); }
        else p.status = 'cancelled';
      }
      if (p.status === 'live' && sim.t >= p.ends) {
        p.status = 'complete';
        for (const r of RESIDENTS) if (sim.people[r.id].at === p.loc) remember(sim, r.id, 'place', p.loc, 4, `Enjoyed ${p.event.toLowerCase()} with our neighbours.`);
      }
    }
  }

  const DATE_SPOTS = ['onsen', 'boardwalk', 'willow', 'shrine', 'teahouse'];
  const DATE_LINES = [['This view is perfect.', 'So is the company.'], ['I’m glad you came.', 'I wouldn’t miss it.'], ['Your hand is cold.', 'Then hold it a little longer.'], ['Same time next week?', 'Every week, if you like.'], ['Look, a shooting star!', 'I already got my wish.']];
  function invite(sim) {
    const { day, h } = clockOf(sim);
    if (h < (sim.today.festival ? 10 : 16) || h >= 20) return;
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (s.lastInviteDay === day || s.intent?.plan.contribution || sim.housing.moves.some((m) => m.members.includes(r.id)) || working(r, h) || working(r, h + 0.75) || s.wants || s.needs.food < 50 || s.needs.energy < 40) continue;
      if (sim.outings.some((o) => ['invited', 'together'].includes(o.status) && [o.host, o.guest].includes(r.id))) continue;
      const partner = partnerOf(sim, r.id);
      const aim = s.brain.goal?.kind === 'friend' && sim.t >= s.brain.goal.retry ? s.brain.goal.who : null; // a friendship being repaired or deepened gets the invitation
      const friends = RESIDENTS.filter((o) => o.id !== r.id && !sim.housing.moves.some((m) => m.members.includes(o.id)) && !sim.people[o.id].intent?.plan.contribution && (sim.rel[key(r.id, o.id)] >= 40 || o.id === aim) && !goals.avoiding(sim, s, o.id) && (o.id === aim || (s.memories.people[o.id]?.value ?? 0) > -3) && !working(o, h) && !working(o, h + 0.75) && !sim.people[o.id].wants && sim.people[o.id].needs.food >= 50 && sim.people[o.id].needs.energy >= 40 && !sim.outings.some((q) => ['invited', 'together'].includes(q.status) && [q.host, q.guest].includes(o.id)));
      const liking = (o) => (partner?.id === o.id ? 100 : 0) + (aim === o.id ? 200 : 0) + sim.rel[key(r.id, o.id)] + (s.memories.people[o.id]?.value ?? 0);
      friends.sort((a, b) => liking(b) - liking(a));
      const friend = friends[0];
      if (!friend || (friend.id !== aim && hash('invite', r.id, day) > 0.4 + goals.social(s) * 0.55)) continue;
      const no = goals.declines(sim, friend, r); // the guest decides for themselves
      if (no) {
        s.lastInviteDay = day;
        if (aim === friend.id) s.brain.goal.retry = sim.t + 360;
        note(sim, r.id, `Asked ${friend.name} to join me, but they turned me down.`);
        note(sim, friend.id, `${r.name} asked me out. ${no}`);
        goals.learn(sim, r.id, 'declined', friend.id, -1, `${friend.name} was not ready to spend time together. I will wait a while.`);
        continue;
      }
      const date = partner?.id === friend.id; // a couple's outing is a date somewhere pretty
      const home = !date && s.house != null && hash('home', r.id, day) < (isWet(sim) ? 0.6 : 0.3); // or tea at home, more likely on a wet day
      const loc = home ? s.home : isWet(sim) ? (date ? 'teahouse' : 'library') : date ? DATE_SPOTS[Math.floor(hash('date', r.id, day) * DATE_SPOTS.length)] : leisure(r, sim, Math.floor(h), { outing: true });
      const kind = home ? 'home' : isWet(sim) || date ? 'sit' : hash('outing', r.id, day) < 0.45 ? 'walk' : 'sit';
      const o = { id: `${day}-${r.id}-${friend.id}`, host: r.id, guest: friend.id, loc, kind, date, status: 'invited', start: sim.t + 3, deadline: sim.t + 13, minutes: 0, leg: 0 };
      sim.outings.push(o);
      s.lastInviteDay = sim.people[friend.id].lastInviteDay = day;
      note(sim, r.id, home ? `Invited ${friend.name} over for tea at my place.` : date ? `Asked ${friend.name} on a date at ${LOC[loc].name}.` : `Invited ${friend.name} to ${LOC[loc].name}. We agreed to meet in a few minutes.`);
      note(sim, friend.id, home ? `${r.name} invited me over for tea.` : date ? `${r.name} asked me on a date at ${LOC[loc].name}!` : `Accepted ${r.name}’s invitation to ${LOC[loc].name}.`);
    }
    sim.outings = sim.outings.slice(-30);
  }

  function endOuting(sim, o, status) {
    if (status === 'complete' && o.minutes < 3) status = 'cancelled';
    o.status = status; o.finished = sim.t;
    const couple = sim.couples[key(o.host, o.guest)], first = o.date && status === 'complete' && !couple?.dates;
    for (const [a, b] of [[o.host, o.guest], [o.guest, o.host]]) {
      const text = status === 'complete'
        ? (o.kind === 'home' ? (a === o.host ? `Had ${PEOPLE[b].name} over for tea. The house felt cosy.` : `Went over to ${PEOPLE[b].name}’s place for tea.`) : o.date ? (first ? `Our first proper date, with ${PEOPLE[b].name} at ${LOC[o.loc].name}. I couldn’t stop smiling.` : `A lovely date with ${PEOPLE[b].name} at ${LOC[o.loc].name}.`) : `Spent time with ${PEOPLE[b].name} at ${LOC[o.loc].name}.`)
        : status === 'missed' ? `Missed meeting ${PEOPLE[b].name}. We’ll try another time.` : `Had to leave our outing early to take care of myself.`;
      const waited = status === 'missed' && sim.people[a].at === o.loc && sim.people[b].at !== o.loc; // the one who turned up and was left waiting
      const tag = status === 'cancelled' ? 'tired' : waited ? 'stoodup' : status === 'missed' ? 'late' : undefined;
      remember(sim, a, 'person', b, status === 'complete' ? (o.date ? 5 : 3) : status === 'missed' ? (waited ? -4 : -1) : 0, text, tag);
      sim.people[a].nextAct = sim.t;
    }
    if (status === 'complete' && o.kind === 'home') { // goodbyes at the door
      sim.people[o.guest].bubble = { kind: 'chat', text: 'Thanks for the tea!', until: sim.t + 0.3 };
      sim.people[o.host].bubble = { kind: 'chat', text: 'Come again soon!', from: sim.t + 0.08, until: sim.t + 0.38 };
    }
    if (status === 'complete') sim.rel[key(o.host, o.guest)] = clamp(sim.rel[key(o.host, o.guest)] + Math.min(o.date ? 6 : 4, o.minutes / 10), -100, 100);
    if (status === 'complete' && couple && o.date) couple.dates = (couple.dates ?? 0) + 1;
  }
  function updateOutings(sim, dt) {
    for (const o of sim.outings) {
      if (!['invited', 'together'].includes(o.status)) continue;
      const a = sim.people[o.host], b = sim.people[o.guest], { h } = clockOf(sim);
      if (o.date && !sim.couples[key(o.host, o.guest)]) { endOuting(sim, o, 'cancelled'); continue; }
      if ([o.host, o.guest].some((id) => working(PEOPLE[id], h) || sim.people[id].wants || h >= 21)) { endOuting(sim, o, o.minutes >= 3 ? 'complete' : 'cancelled'); continue; }
      if (isWet(sim) && ['shrine', 'market'].includes(o.loc)) { o.loc = 'library'; o.kind = 'sit'; o.deadline = Math.max(o.deadline, sim.t + 10); o.seats = null; }
      const both = a.at === o.loc && b.at === o.loc && !a.walking && !b.walking && ((!a.hidden && !b.hidden && Math.hypot(a.x - b.x, a.z - b.z) <= 3.2) || (o.kind === 'home' && o.status === 'together' && a.hidden && b.hidden));
      if (o.status === 'invited' && both && sim.t >= o.start) {
        o.status = 'together'; o.ends = sim.t + 20 + sim.people[o.host].traits.social * 15;
        for (const id of [o.host, o.guest]) note(sim, id, `Met up with ${PEOPLE[id === o.host ? o.guest : o.host].name}.`);
      }
      if (o.status === 'invited' && sim.t > o.deadline) endOuting(sim, o, 'missed');
      if (o.status === 'together') {
        if (both) o.minutes += dt;
        const couple = sim.couples[key(o.host, o.guest)], { day } = clockOf(sim);
        if (both && o.date && !o.proposed && o.minutes >= 5 && couple?.stage === 'together' && !couple.engaged && day - (couple.togetherDay ?? day) >= 2 && sim.rel[key(o.host, o.guest)] >= 95 && hash(o.id, 'propose') < 0.6) {
          o.proposed = true; // the question, asked at a pretty spot
          couple.engaged = day;
          o.nextHeart = sim.t + 1;
          a.bubble = { kind: 'heart', text: 'Will you marry me?', until: sim.t + 0.25 };
          b.bubble = { kind: 'heart', text: 'Yes! A thousand times yes!', from: sim.t + 0.1, until: sim.t + 0.4 };
          note(sim, o.host, `Asked ${PEOPLE[o.guest].name} to marry me at ${LOC[o.loc].name}. They said yes!`);
          note(sim, o.guest, `${PEOPLE[o.host].name} proposed at ${LOC[o.loc].name}. We’re engaged!`);
          c.gossip(sim, 'engaged', o.host, o.guest);
        }
        if (both && o.date && sim.t >= (o.nextHeart ?? 0)) { // sweet nothings every couple of minutes
          o.nextHeart = sim.t + 2 + hash(o.id, Math.floor(sim.t)) * 2;
          const [la, lb] = DATE_LINES[Math.floor(hash(o.id, 'line', Math.floor(sim.t)) * DATE_LINES.length)];
          a.bubble = { kind: 'heart', text: la, until: sim.t + 0.2 };
          b.bubble = { kind: 'heart', text: lb, from: sim.t + 0.07, until: sim.t + 0.27 };
        }
        if (o.kind === 'walk' && o.leg < 3 && both && a.task?.reached && b.task?.reached) {
          o.pauseUntil ??= sim.t + 1;
          if (sim.t >= o.pauseUntil) { o.leg++; o.pauseUntil = null; }
        }
        if (sim.t >= o.ends) endOuting(sim, o, 'complete');
      }
    }
  }

  function outingActivity(sim, r, s, i, plan) {
    const o = sim.outings.find((v) => v.id === plan.outing);
    if (!o) return false;
    const member = r.id === o.host ? 0 : 1, l = LOC[o.loc], d = DIST[l.district];
    if (o.kind === 'home') { // meet at the host's front step, then both go in for tea
      const hh = sim.people[o.host].house, v = PLACES[o.loc].visit[hh];
      if (o.status === 'together') moveTo(sim, s, i, { inside: true, door: hh, kind: 'outing-home', duration: 20 });
      else moveTo(sim, s, i, { at: member ? [v.at[0] + 0.7, v.at[1] + 0.2] : v.at, face: v.face, anim: 'idle', kind: 'outing-wait', reserved: true, duration: 20 });
    } else if (o.status === 'together' && o.kind === 'walk' && o.leg < 3) {
      const angle = o.leg * Math.PI * 2 / 3;
      const at = { x: d.x + Math.cos(angle) * 2.4 + (member ? 0.45 : -0.45), z: d.z + Math.sin(angle) * 2.4 };
      moveTo(sim, s, i, { world: true, at, anim: 'idle', kind: `outing-walk-${o.leg}`, duration: 1 });
    } else {
      if (o.status === 'together' && !o.seats) {
        const occupied = new Set(RESIDENTS.map((v) => sim.people[v.id].seat).filter(Boolean));
        for (const other of sim.outings) if (other !== o && ['invited', 'together'].includes(other.status)) for (const id of other.seats ?? []) occupied.add(id);
        const first = SEATS.find((q) => q.district === l.district && q.id.endsWith('-0') && !occupied.has(q.id) && !occupied.has(q.id.replace(/0$/, '1')));
        if (first) o.seats = [first.id, first.id.replace(/0$/, '1')];
      }
      const seat = o.seats && SEATS.find((q) => q.id === o.seats[member]);
      const at = seat ?? { x: l.entry.x + l.uz * (member ? 0.45 : -0.45), z: l.entry.z - l.ux * (member ? 0.45 : -0.45) };
      moveTo(sim, s, i, { world: true, at, anim: seat ? 'sit' : 'idle', kind: seat ? 'outing-seat' : 'outing-wait', seat: seat?.id, face: seat?.face, reserved: true, duration: 20 });
    }
    return true;
  }

  function activity(sim, r, s, i, plan) {
    if (plan.patrol) { moveTo(sim, s, i, { world: true, at: LOC[plan.loc].entry, anim: 'watch', kind: 'night-patrol', duration: 12 }); return true; }
    if (plan.moving) return housing.activity(sim, r, s, i, plan);
    if (plan.housework) return homes.activity(sim, r, s, i, plan);
    if (plan.wedding) {
      const w = sim.wedding, couple = w.couple.split(':'), member = couple.indexOf(r.id);
      const guest = w.guests.indexOf(r.id);
      const at = member >= 0 ? [member ? 0.55 : -0.55, 3.5] : [((guest % 5) - 2) * 0.95, 5.1 + Math.floor(guest / 5) * 1.05];
      const vows = member >= 0 && w.vowsAt != null;
      moveTo(sim, s, i, { at, face: vows ? (member ? -Math.PI / 2 : Math.PI / 2) : Math.PI, anim: vows ? 'pray' : 'watch', kind: vows ? 'wedding-vows' : 'wedding-gathering', reserved: true, duration: 75 });
      return true;
    }
    if (plan.delivery && plan.supply === 'woodlot') return wood.activity(sim, r, s, i);
    if (plan.delivery || plan.errand) return farm.activity(sim, r, s, i, plan);
    if (plan.fishing || plan.fishSale) return fishing.activity(sim, r, s, i, plan);
    if (mealActivity(sim, r, s, i, plan)) return true;
    if (plan.sheltered) { moveTo(sim, s, i, { inside: true, kind: 'shelter', duration: 5 }); return true; }
    if (plan.outing) return outingActivity(sim, r, s, i, plan);
    if (plan.contribution) {
      const p = currentProject(sim), role = p?.roles.find((v) => v.who === r.id);
      if (role) { const stations = PLACES[s.at].work ?? PLACES[s.at].visit, station = stations[p.roles.indexOf(role) % stations.length]; moveTo(sim, s, i, { ...station, anim: role.anim, kind: 'contribution', duration: role.need }); return true; }
    }
    if (work.activity(sim, r, s, i, plan)) return true;
    if (baths.activity(sim, r, s, i, plan)) return true;
    return false;
  }
  function update(sim, dt) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id], buyer = s.serving && sim.people[s.serving];
      if (s.serving && (!buyer || (!buyer.fishSale && (!activeMeal(buyer) || !['queue', 'serving'].includes(buyer.meal.phase))) || buyer.at !== s.at)) s.serving = null;
      // pottering in the garden at home now and then grows a portion of vegetables for the pantry
      if (c.isHome(s.at) && !s.work && s.task?.reached && s.task.anim === 'garden' && !s.walking && !s.hidden) {
        s.garden = (s.garden ?? 0) + dt;
        if (s.garden >= 90) {
          s.garden -= 90;
          sim.harvest.bushels++;
          s.pantry = Math.min(PANTRY_MAX, s.pantry + 1);
          s.bubble = { kind: 'gift', text: 'Home-grown vegetables!', until: sim.t + 0.2 };
        }
      }
    }
    fishing.update(sim);
    farm.update(sim, dt);
    wood.update(sim, dt);
    pets.update(sim, dt);
    homes.update(sim, dt);
    work.update(sim, dt);
    baths.update(sim, dt);
    housing.update(sim, dt);
    updateProjects(sim, dt);
    updateOutings(sim, dt);
    if (sim.t >= sim.lifeNext) { sim.lifeNext = Math.floor(sim.t) + 1; goals.update(sim); invite(sim); }
  }
  function profile(sim, id) {
    return Object.entries(sim.people[id].traits).map(([k, v]) => traitNames[k][v >= 0.5 ? 1 : 0]);
  }
  function queue(sim, loc) {
    return RESIDENTS.filter((r) => { const s = sim.people[r.id]; return activeMeal(s) && s.meal.loc === loc && ['queue', 'serving'].includes(s.meal.phase); }).sort((a, b) => sim.people[a.id].meal.joined - sim.people[b.id].meal.joined || a.id.localeCompare(b.id)).map((r) => ({ id: r.id, name: r.name, phase: sim.people[r.id].meal.phase }));
  }
  return { groceryPrice: farm.groceryPrice, fireLit: wood.has, initialize, remember, shopOpen, foodPlan, leisure, freeChoices, commit, committed, recordPlan, priorityPlan, leave, activity, consumeMeal, activeMeal, arrival, update, profile, queue, currentProject, goalProgress: goals.progress };
}
