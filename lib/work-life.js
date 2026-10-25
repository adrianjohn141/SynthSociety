// Workday rhythms and practice are saved data. Wages keep using the town's
// existing payroll; preparation and closing never manufacture goods or money.
const ROUTINES = {
  bakery: ['Preparing the baking bench', 'Brushing flour off the bench', 'work', 'sweep'],
  teahouse: ['Arranging the tea bowls', 'Washing the tea bowls', 'work', 'wash'],
  market: ['Setting out the market stall', 'Packing away the market stall', 'carry', 'carry'],
  store: ['Checking the shop shelves', 'Tidying the shop shelves', 'read', 'carry'],
  library: ['Sorting the morning books', 'Putting the books away', 'read', 'carry'],
  shrine: ['Preparing the shrine grounds', 'Sweeping the shrine grounds', 'sweep', 'sweep'],
  willow: ['Checking the tools and timber', 'Packing away the tools', 'hammer', 'carry'],
  bathhouse: ['Preparing the bath supplies', 'Washing the bath cloths', 'work', 'wash'],
  onsen: ['Checking the spring supplies', 'Raking the spring path', 'work', 'sweep'],
  theater: ['Warming up for the evening', 'Putting away the costumes', 'perform', 'carry'],
  farm: ['Sorting the seed trays', 'Putting the tools in the barn', 'work', 'carry'],
  woodlot: ['Checking the axe and gloves', 'Stacking the last firewood', 'work', 'logs'],
};
export const experienceOf = (s) => {
  const hours = (s.career?.minutes ?? 0) / 60;
  return hours >= 200 ? 'Seasoned' : hours >= 100 ? 'Experienced' : hours >= 40 ? 'Settled in' : 'Learning the rhythm';
};
export const serviceFactor = (s) => Math.max(0.75, 1 - (s.career?.minutes ?? 0) / (60 * 400));

export function createWorkLife(c) {
  const { RESIDENTS, LOC, clockOf, working, note, moveTo, workStations } = c;
  function initialize(sim) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.career ??= { minutes: 0, customers: 0, shifts: 0, recent: [] };
      s.career.missed ??= 0;
      s.shiftLife ??= null;
    }
  }
  function shift(sim, r, s) {
    const day = Math.floor(sim.t / 1440);
    if (!s.shiftLife || s.shiftLife.day !== day) s.shiftLife = { day, arrived: null, prep: 0, closing: 0, minutes: 0, customers: 0, breakMinutes: 0, finished: false };
    return s.shiftLife;
  }
  function activity(sim, r, s, i, plan) {
    if (!plan.work || plan.delivery || plan.sheltered || s.at !== r.work || s.serving || s.serve != null) return false;
    const record = shift(sim, r, s), routines = ROUTINES[r.work];
    if (!routines) return false;
    const closing = clockOf(sim).h * 60 >= r.hours[1] * 60 - 8;
    if (!closing && record.prep >= 4) return false;
    const stations = workStations(r, r.work);
    const staff = RESIDENTS.filter((o) => o.work === r.work).indexOf(r);
    const station = stations[staff % stations.length];
    // a job's own station keeps its own work (the gardener's pruning)
    moveTo(sim, s, i, { ...station, anim: station.job ? station.anim : routines[closing ? 3 : 2], kind: closing ? 'work-close' : 'work-open', duration: closing ? 8 : 4 });
    s.workDetail = routines[closing ? 1 : 0];
    return true;
  }
  function customer(sim, id) {
    const r = RESIDENTS.find((p) => p.id === id), s = sim.people[id];
    if (!r || !s.work) return;
    const record = shift(sim, r, s);
    record.customers++; s.career.customers++;
  }
  function update(sim, dt) {
    const hour = clockOf(sim).h;
    for (const r of RESIDENTS) {
      const s = sim.people[r.id], plan = s.intent?.plan, onShift = working(r, hour);
      if (!onShift) {
        const record = s.shiftLife;
        if (record && !record.finished) {
          record.finished = true;
          if (record.minutes > 0) s.career.shifts++;
          else s.career.missed++;
          s.career.recent.unshift({ day: record.day, minutes: record.minutes, customers: record.customers, breakMinutes: record.breakMinutes });
          s.career.recent.length = Math.min(s.career.recent.length, 5);
          if (record.minutes > 0) note(sim, r.id, `My day at ${LOC[r.work].name}: ${Math.round(record.minutes)} minutes on duty${record.customers ? ` and ${record.customers} customers helped` : ''}.`);
          else note(sim, r.id, `I couldn’t spend time at ${LOC[r.work].name} today.`);
        }
        s.workDetail = null;
        if (s.brain.goal?.kind === 'skill' && s.at === r.work && s.task?.reached && !s.walking) s.career.minutes += dt * 0.25; // practising in my own time
        continue;
      }
      const record = shift(sim, r, s);
      if (plan?.break && s.at && !s.walking) record.breakMinutes += dt;
      if (!s.work || !(s.at === r.work || (plan?.patrol && s.at === plan.loc) || plan?.delivery || (plan?.sheltered && s.at === plan.loc))) { s.workDetail = null; continue; }
      record.arrived ??= sim.t;
      record.minutes += dt; s.career.minutes += dt;
      if (s.task?.reached && !s.walking && !s.hidden && !s.serving) {
        if (s.task.kind === 'work-open') record.prep = Math.min(4, record.prep + dt);
        if (s.task.kind === 'work-close') record.closing += dt;
      }
      if (s.task?.kind !== 'work-open' && s.task?.kind !== 'work-close') s.workDetail = null;
      if (record.prep >= 4 && s.task?.kind === 'work-open') s.nextAct = Math.min(s.nextAct, sim.t);
    }
  }
  return { initialize, activity, update, customer };
}
