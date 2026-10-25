// A visit has real changing, travel and soaking time. Rendering reads this
// saved state; it never invents bathers at an empty pool.
export const BATH_SPOTS = [[3.65, 0.7], [4.7, 0.7], [4.2, -0.4]];

export function createBaths({ RESIDENTS, moveTo, priceAt }) {
  function initialize(sim) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      s.bath ??= null;
      s.bathWarmUntil ??= 0;
    }
  }
  function leave(sim, s) {
    if (s.bath?.minutes > 0) s.bathWarmUntil = sim.t + 12;
    s.bath = null;
  }
  function activity(sim, r, s, i, plan) {
    if (s.at !== 'bathhouse' || plan.work || plan.inside || plan.outing || plan.contribution) return false;
    if (!s.bath) {
      if (s.money < priceAt(sim, 'bathhouse')) return false;
      const slot = BATH_SPOTS.findIndex((_, k) => !RESIDENTS.some((o) => o !== r && sim.people[o.id].bath?.slot === k));
      if (slot < 0) return false;
      s.bath = { phase: 'changing', slot, minutes: 0 };
      moveTo(sim, s, i, { inside: true, buy: true, kind: 'bath-change', duration: 1 });
      return true;
    }
    const bath = s.bath;
    if (bath.phase === 'changing') {
      if (!s.task?.reached || sim.t < s.nextAct) return true;
      if (sim.t - (s.paid?.bathhouse ?? -Infinity) >= 90) {
        bath.phase = 'resting'; bath.slot = null;
        moveTo(sim, s, i, { at: [3.8, 2.7], anim: 'idle', kind: 'bath-rest', duration: 4 });
        return true;
      }
      bath.phase = 'soaking';
      moveTo(sim, s, i, { at: BATH_SPOTS[bath.slot], anim: 'soak', kind: 'bath-soak', reserved: true, y: -0.2, face: 0, duration: 18 });
    } else if (bath.phase === 'soaking' && bath.minutes >= 18) {
      bath.phase = 'resting';
      s.bathWarmUntil = sim.t + 12;
      moveTo(sim, s, i, { at: [3.8, 2.7], anim: 'idle', kind: 'bath-rest', duration: 4 });
    }
    return true;
  }
  function update(sim, dt) {
    for (const r of RESIDENTS) {
      const s = sim.people[r.id];
      if (s.bath && (s.at !== 'bathhouse' || s.work || !s.task?.kind?.startsWith('bath-'))) { leave(sim, s); continue; }
      if (s.bath?.phase === 'soaking' && s.task?.kind === 'bath-soak' && s.task.reached && !s.walking && !s.hidden) s.bath.minutes += dt;
    }
  }
  return { initialize, activity, update, leave };
}
