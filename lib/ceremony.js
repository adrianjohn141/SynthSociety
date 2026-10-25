// Ceremonies are earned by being there. The saved attendance record also keeps
// a delayed ceremony and its gifts consistent across reloads and offline steps.
export function advanceCeremony(sim, dt, c) {
  const w = sim.wedding;
  if (!w || ['done', 'cancelled'].includes(w.status)) return;
  const couple = sim.couples[w.couple], [a, b] = w.couple.split(':');
  if (!couple || couple.stage !== 'together') {
    w.status = 'cancelled';
    for (const id of [a, b]) c.note(sim, id, 'We called off the ceremony. We need time to work things out.');
    return;
  }
  w.attendance ??= {};
  w.nextCheer ??= {};
  w.togetherMinutes ??= 0;
  w.graceEnds ??= w.ends + 15;
  if (w.status === 'planned' && sim.t >= w.start) w.status = 'live';
  if (w.status !== 'live') return;
  const here = (id) => {
    const s = sim.people[id];
    return s.at === 'shrine' && !s.hidden && !s.walking && s.task?.reached && s.task.kind?.startsWith('wedding-');
  };
  if (here(a) && here(b) && Math.hypot(sim.people[a].x - sim.people[b].x, sim.people[a].z - sim.people[b].z) <= 3.2) {
    w.togetherMinutes += dt;
    if (w.vowsAt == null) {
      w.vowsAt = sim.t;
      for (const [x, y] of [[a, b], [b, a]]) c.note(sim, x, `Standing beside ${c.PEOPLE[y].name} at the shrine. We’re ready to say our vows.`);
      sim.people[a].bubble = { kind: 'heart', text: 'I do.', until: sim.t + 0.2 };
      sim.people[b].bubble = { kind: 'heart', text: 'I do, too.', from: sim.t + 0.07, until: sim.t + 0.27 };
    }
  }
  for (const id of w.guests) if (here(id)) {
    w.attendance[id] = (w.attendance[id] ?? 0) + dt;
    if (!(sim.people[id].bubble?.until > sim.t) && sim.t >= (w.nextCheer[id] ?? 0)) {
      w.nextCheer[id] = sim.t + 2 + c.rand(sim) * 3;
      sim.people[id].bubble = { kind: 'heart', text: ['Congratulations!', 'So beautiful~', 'Cheers to you both!'][Math.floor(c.rand(sim) * 3)], until: sim.t + 0.15 };
    }
  }
  if (sim.t < w.ends) return;
  if (w.togetherMinutes < 5) {
    if (sim.t < w.graceEnds) {
      w.ends = Math.min(w.graceEnds, sim.t + 5);
      if (!w.waitingForCouple) {
        w.waitingForCouple = true;
        for (const id of [a, b]) c.note(sim, id, 'The ceremony can wait a little. We both need to be here.');
      }
    } else {
      const start = Math.floor(sim.t / 1440) * 1440 + 1440 + 16 * 60;
      Object.assign(w, { status: 'planned', start, ends: start + 60, graceEnds: start + 75, togetherMinutes: 0, attendance: {}, nextCheer: {}, vowsAt: null, waitingForCouple: false, postponements: (w.postponements ?? 0) + 1 });
      for (const id of [a, b, ...w.guests]) c.note(sim, id, 'The wedding is postponed until tomorrow afternoon so the couple can be there together.');
    }
    return;
  }
  w.status = 'done'; w.completed = sim.t;
  couple.married = c.clockOf(sim).day; sim.rel[w.couple] = 100;
  c.gossip(sim, 'married', a, b);
  for (const [x, y] of [[a, b], [b, a]]) c.note(sim, x, `Married ${c.PEOPLE[y].name} at ${c.LOC.shrine.name} today. The happiest day of my life.`);
  let gifts = 0;
  for (const id of w.guests) if ((w.attendance[id] ?? 0) >= 3) {
    const guest = sim.people[id], present = guest.money >= c.GIFT_PRICE * 8;
    if (present) { guest.money -= c.GIFT_PRICE * 2; sim.tills.store += c.GIFT_PRICE * 2; gifts++; }
    c.note(sim, id, `Celebrated ${c.PEOPLE[a].name} and ${c.PEOPLE[b].name}’s wedding${present ? ' and brought a present' : ''}. Such a lovely ceremony.`);
    guest.needs.fun = Math.min(100, guest.needs.fun + 15);
    for (const x of [a, b]) sim.rel[c.key(id, x)] = Math.min(100, sim.rel[c.key(id, x)] + 3);
  }
  if (gifts) for (const id of [a, b]) c.note(sim, id, `${gifts} ${gifts === 1 ? 'friend' : 'friends'} brought us wedding presents. We feel so loved.`);
}
