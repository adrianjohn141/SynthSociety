import assert from 'node:assert/strict';
import { createSim, catchUp, saveState, loadState, RESIDENTS, LOC } from './sim.js';

const wealth = (s) => RESIDENTS.reduce((m, r) => m + s.people[r.id].money, 0) + Object.values(s.tills).reduce((a, b) => a + b, 0);

// Two weeks of town life: the farm supplies the shops, people buy groceries, and money keeps circulating.
for (const seed of [7, 42]) {
  const sim = createSim(seed), total = wealth(sim);
  const broke = Object.fromEntries(Object.keys(sim.tills).map((k) => [k, 0]));
  let bought = 0, homeMeals = 0, richest = 0;
  for (let day = 0; day < 14; day++) {
    for (let h = 0; h < 24; h++) {
      catchUp(sim, sim.t + 60, 99);
      for (const k of Object.keys(sim.tills)) broke[k] = sim.tills[k] < 500 ? broke[k] + 1 : 0;
      for (const [k, hours] of Object.entries(broke)) assert.ok(hours < 24, `${k} till is never empty for a whole day (seed ${seed}, day ${day})`);
    }
    for (const r of RESIDENTS) richest = Math.max(richest, sim.people[r.id].money);
    const diary = RESIDENTS.flatMap((r) => sim.people[r.id].diary.map((e) => e.text));
    bought += diary.filter((t) => t.startsWith('Bought ') && t.includes('groceries')).length;
    homeMeals += RESIDENTS.filter((r) => sim.people[r.id].pantry < 4).length;
  }
  assert.ok(Math.abs(wealth(sim) - total) < 1e-3, `money is conserved (seed ${seed})`);
  assert.ok(sim.farm.grown > 300 && sim.farm.delivered > 300, `the farm grows and delivers produce (${sim.farm.grown} grown, ${sim.farm.delivered} delivered)`);
  assert.ok(bought > 0 && homeMeals > 0, 'residents buy groceries and cook them at home');
  assert.ok(richest < 40000, `savings get spent instead of piling up (richest ${Math.round(richest)})`);
  for (const r of RESIDENTS) assert.ok(sim.people[r.id].pantry >= 0 && sim.people[r.id].pantry <= 4);
  for (const loc of Object.keys(sim.stock)) assert.ok(sim.stock[loc] >= 0 && sim.stock[loc] <= 30, `${loc} stock in range`);
  assert.ok(sim.woodlot.delivered > 200 && sim.sales.onsen >= 0, `the woodlot keeps the fires fed (${sim.woodlot.delivered} bundles delivered)`);
  for (const loc of Object.keys(sim.firewood)) assert.ok(sim.firewood[loc] >= 0 && sim.firewood[loc] <= 30, `${loc} firewood in range`);
}

// A town saved before the farm keeps its residents and gains the farmers and the farm's till.
{
  const sim = createSim(3);
  delete sim.people.kiyo;
  delete sim.people.daichi;
  for (const k of Object.keys(sim.rel)) if (k.includes('kiyo') || k.includes('daichi')) delete sim.rel[k];
  delete sim.tills.farm;
  delete sim.farm;
  delete sim.stock;
  sim.version = 5;
  const upgraded = loadState(saveState(sim));
  assert.ok(upgraded, 'version-5 saves load');
  assert.equal(upgraded.people.kiyo.at, 'farmhouse');
  assert.equal(upgraded.tills.farm, 30000);
  assert.ok(Number.isFinite(upgraded.rel['daichi:kiyo']) && upgraded.people.hana.pantry === 3);
  for (const r of RESIDENTS.filter((r) => r.work !== 'farm')) assert.equal(upgraded.people[r.id].money, sim.people[r.id].money);
  catchUp(upgraded, upgraded.t + 1440, 2);
  assert.ok(Number.isFinite(upgraded.people.daichi.x), 'the newcomers settle in');
}
// A town saved before the hillside gains the onsen keeper, the woodcutter, their tills and the firewood.
{
  const sim = createSim(5);
  delete sim.people.yuki;
  delete sim.people.takumi;
  for (const k of Object.keys(sim.rel)) if (k.includes('yuki') || k.includes('takumi')) delete sim.rel[k];
  delete sim.tills.onsen;
  delete sim.tills.woodlot;
  delete sim.woodlot;
  delete sim.firewood;
  sim.version = 6;
  const upgraded = loadState(saveState(sim));
  assert.ok(upgraded, 'version-6 saves load');
  assert.equal(upgraded.people.takumi.at, 'cabin');
  assert.equal(upgraded.tills.woodlot, 30000);
  assert.equal(upgraded.firewood.bakery, 12);
  for (const r of RESIDENTS.filter((r) => r.home !== 'cabin')) assert.equal(upgraded.people[r.id].money, sim.people[r.id].money);
  catchUp(upgraded, upgraded.t + 1440, 2);
  assert.ok(upgraded.woodlot.grown > 0, 'the woodcutter gets to work');
}
console.log(`farm ok — ${LOC.farm.name} supplies the kitchens and grocers, groceries stock home cooking, tills stay funded, the woodlot fuels the baths and ovens, old saves gain both`);
