// The town's cats and the farm dog. Each keeps to its home district: it ambles about the plaza, naps in
// the sun, curls up at night, and now and then trots over to a resident who is standing about or sitting,
// who stops for a pet (a happy moment and a line in their diary).
export const PETS = [
  { id: 'mochi', name: 'Mochi', kind: 'cat', coat: '#f2c37a', home: 'village' },
  { id: 'kuro', name: 'Kuro', kind: 'cat', coat: '#5b4c4a', home: 'market' },
  { id: 'tama', name: 'Tama', kind: 'cat', coat: '#f4efe6', home: 'waterfront' },
  { id: 'hachi', name: 'Hachi', kind: 'dog', coat: '#e2b98a', home: 'farmland' },
  { id: 'sumi', name: 'Sumi', kind: 'cat', coat: '#9d9aa6', home: 'hillside' },
];
const SPEED = { cat: 30, dog: 45 }; // world units per minute
const PET_LINES = { cat: ['Who’s a good kitty?', 'Purr~', 'Soft fur!'], dog: ['Good boy, Hachi!', 'Fetch!', 'Woof~'] };

export function createPets(c) {
  const { RESIDENTS, DIST, HUB_R, RING, clockOf, hash, note, clamp, isWet } = c;

  function initialize(sim) {
    sim.pets ??= {};
    for (const p of PETS) {
      const D = DIST[p.home];
      sim.pets[p.id] ??= { x: D.x + 1.5, z: D.z + 1.5, goal: null, state: 'sit', until: sim.t, friend: null, face: 0 };
      sim.pets[p.id].bond ??= {}; // pettings per resident: the pet warms to the people who stop for it
    }
  }

  // a spot on the home plaza or just around it (the cat's own patch of town)
  const spotNear = (p, k, sim) => {
    const D = DIST[p.home], a = hash(p.id, k, sim.t.toFixed(1)) * Math.PI * 2, d = Math.sqrt(hash(k, p.id, sim.t.toFixed(1))) * (HUB_R - 0.6);
    return { x: D.x + Math.cos(a) * d, z: D.z + Math.sin(a) * d };
  };

  // someone standing about or seated in the pet's district, not hurrying anywhere, not petted today
  function findFriend(sim, p, pet) {
    const D = DIST[p.home], day = clockOf(sim).day;
    return RESIDENTS.map((r) => sim.people[r.id]).map((s, i) => ({ s, r: RESIDENTS[i] }))
      .filter(({ s }) => !s.hidden && !s.walking && !s.work && !s.fishing && s.petDay !== day && Math.hypot(s.x - D.x, s.z - D.z) < RING + 2 && Math.hypot(s.x - pet.x, s.z - pet.z) < 14)
      .sort((a, b) => score(pet, p, a.r.id, day) - score(pet, p, b.r.id, day))[0];
  }
  const score = (pet, p, id, day) => hash(p.id, id, day) - Math.min(pet.bond[id] ?? 0, 10) * 0.08;

  // a favourite out walking nearby gets company: the pet trots along at their heels for a bit
  function follower(sim, p, pet) {
    const id = favouriteOf(sim, p.id), s = id && sim.people[id], D = DIST[p.home];
    return s && s.walking && !s.hidden && Math.hypot(s.x - D.x, s.z - D.z) < RING && Math.hypot(s.x - pet.x, s.z - pet.z) < 10 ? id : null;
  }

  function next(sim, p, pet) {
    const { h } = clockOf(sim), u = hash(p.id, 'next', sim.t.toFixed(2));
    pet.friend = null;
    if (h < 6 || h >= 21.5 || isWet(sim)) { // curled up for the night (or out of the rain) in its usual corner
      if (pet.state !== 'sleep') { pet.goal = spotNear(p, 'bed', { t: Math.floor(sim.t / 1440) }); pet.state = 'tobed'; }
      pet.until = sim.t + (isWet(sim) ? 10 : 30);
      return;
    }
    const fav = u < 0.6 && follower(sim, p, pet);
    const friend = !fav && u < 0.35 && findFriend(sim, p, pet);
    if (fav) {
      pet.friend = fav;
      pet.state = 'follow';
      pet.until = sim.t + 3;
    } else if (friend) {
      const s = friend.s, a = hash(p.id, friend.r.id) * Math.PI * 2;
      pet.goal = { x: s.x + Math.cos(a) * 0.55, z: s.z + Math.sin(a) * 0.55 };
      pet.friend = friend.r.id;
      pet.state = 'visit';
      pet.until = sim.t + 6;
    } else if (u < 0.65) {
      pet.goal = spotNear(p, 'walk', sim);
      pet.state = 'walk';
      pet.until = sim.t + 8;
    } else {
      pet.goal = null;
      pet.state = u < 0.75 ? 'sniff' : u < 0.82 ? 'stretch' : u < 0.88 ? 'scratch' : u < 0.94 ? 'sit' : 'nap';
      pet.until = sim.t + (['stretch', 'scratch'].includes(pet.state) ? 0.2 : 3 + hash(p.id, 'rest', sim.t.toFixed(2)) * (pet.state === 'nap' ? 20 : 6));
    }
  }

  function update(sim, dt) {
    const day = clockOf(sim).day;
    for (const p of PETS) {
      const pet = sim.pets[p.id];
      if ((pet.state === 'sit' || pet.state === 'walk') && sim.t - (pet.followed ?? -99) > 30) { // spots a favourite passing by
        const fav = follower(sim, p, pet), s = fav && sim.people[fav];
        if (s && Math.hypot(s.x - pet.x, s.z - pet.z) < 6) Object.assign(pet, { friend: fav, state: 'follow', until: sim.t + 3, followed: sim.t });
      }
      if (pet.state === 'follow') {
        const s = sim.people[pet.friend], D = DIST[p.home];
        if (!s || s.hidden || Math.hypot(s.x - D.x, s.z - D.z) > RING + 2) pet.until = sim.t;
        else { const back = s.face + Math.PI; pet.goal = { x: s.x + Math.sin(back) * 0.8, z: s.z + Math.cos(back) * 0.8 }; }
      }
      if (pet.goal) {
        const dx = pet.goal.x - pet.x, dz = pet.goal.z - pet.z, d = Math.hypot(dx, dz), step = SPEED[p.kind] * dt;
        if (d > 1e-3) pet.face = Math.atan2(dx, dz);
        if (d <= step) {
          pet.x = pet.goal.x; pet.z = pet.goal.z; pet.goal = null;
          if (pet.state === 'follow') { /* keeps pace; the next step sets a new heel spot */ }
          else if (pet.state === 'tobed') pet.state = 'sleep';
          else if (pet.state === 'walk') { pet.state = 'sit'; pet.until = Math.min(pet.until, sim.t + 2); }
          else if (pet.state === 'visit') {
            const r = RESIDENTS.find((r) => r.id === pet.friend), s = r && sim.people[r.id];
            if (s && !s.walking && !s.hidden && Math.hypot(s.x - pet.x, s.z - pet.z) < 1.2) {
              pet.state = 'petted';
              pet.until = sim.t + 2 + hash(p.id, r.id, day) * 2;
              pet.face = Math.atan2(s.x - pet.x, s.z - pet.z);
              s.petDay = day;
              pet.bond[r.id] = (pet.bond[r.id] ?? 0) + 1;
              const cur = pet.bond[pet.fav] ?? 0; // a favourite is sticky: someone new must pull clearly ahead
              if (pet.fav !== r.id && pet.bond[r.id] >= 3 && pet.bond[r.id] >= cur + 2) { pet.fav = r.id; note(sim, r.id, `${p.name} the ${p.kind} seems to have picked me as a favourite.`); }
              s.needs.fun = clamp(s.needs.fun + 8, 0, 100);
              s.bubble = { kind: 'heart', text: PET_LINES[p.kind][Math.floor(hash(r.id, p.id, day) * PET_LINES[p.kind].length)], until: sim.t + 0.25 };
              note(sim, r.id, `${p.kind === 'cat' ? 'Stopped to stroke' : 'Gave a scratch behind the ears to'} ${p.name} the ${p.kind}.`);
            } else pet.until = sim.t; // they wandered off; find something else to do
          }
        } else { pet.x += (dx / d) * step; pet.z += (dz / d) * step; }
      }
      if (sim.t >= pet.until) next(sim, p, pet);
    }
  }

  return { initialize, update };
}

// the resident a pet has warmed to most (after a few pettings), if any
export const favouriteOf = (sim, petId) => sim.pets?.[petId]?.fav ?? null;
