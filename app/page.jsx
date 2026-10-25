'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import TownScene from '../components/TownScene';
import {
  createSim, catchUp, alignClock, saveState, loadState, clockOf, relationsOf, statusOf, moodOf, partnerOf, weatherNow, festivalNow,
  priceAt, tillFor, TILL_NAME, yen, RESIDENTS, PEOPLE, LOC, DIST, DISTRICTS,
  personalityOf, queueAt, shopOpen, communityProject, groceryPriceAt, HOUSE_NAMES, HOUSES, isHome, housematesOf, birthdayLabel, isBirthday, hobbyOf, bedtimeOf, householdOf, experienceOf, propertyOf, housingSummary, HOME_PRICE, goalProgress, requestVisitorMeet, requestVisitorTrip,
} from '../lib/sim';
import { PETS, favouriteOf } from '../lib/pets';
import { onMind, startMind, stopMind, replyAsk } from '../lib/mind';
import { writtenReply, heard, tidyText, profileOf, suggestedMeetingRequest, suggestedPlace, HISTORY, MAX_TEXT } from '../lib/chat';
import { PROFILE_FORMAT } from '../lib/profiles';

const MIND_KEY = 'synthetic-society-minds';
const PREFS_KEY = 'synthetic-society-prefs'; // { nav, sound, name }
const TALKS_KEY = 'synthetic-society-talks'; // { [residentId]: [{ me, text, when }] }: the visitor's own chats, kept in this browser
const DEFAULT_NAME = 'Traveller';
const savePref = (k, v) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'), [k]: v })); } catch {} };
const MIND_LABEL = { off: 'Live minds: Off', checking: 'Live minds: …', on: 'Live minds: On', 'no-key': 'Live minds: set up Azure', failed: 'Live minds: failed, retry' };

const SAVE_KEY = 'synthetic-society-save';
const fmtH = (h) => `${String(h).padStart(2, '0')}:00`;
const PERIODS = [[5, 'Night'], [7, 'Dawn'], [12, 'Morning'], [17, 'Afternoon'], [21, 'Evening'], [24, 'Night']];
const WEATHER = { clear: 'Clear skies', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow' };

// Restore the saved town and fast-forward it to now, or found a new one at dawn and catch up to the current local time.
function openTown() {
  const d = new Date(), midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = (Date.now() - midnight) / 60000;
  let saved = null;
  try { if (typeof window !== 'undefined') saved = loadState(localStorage.getItem(SAVE_KEY)); } catch {} // storage can be blocked
  if (saved) {
    alignClock(saved);
    catchUp(saved, (Date.now() - saved.epoch) / 60000);
    return saved;
  }
  const sim = createSim(7, Math.min(now, 5.5 * 60), midnight);
  if (now > sim.t) catchUp(sim, now);
  return sim;
}

function TimeIndicator({ sim }) {
  const [info, setInfo] = useState(null); // client-only: server and browser clocks differ
  useEffect(() => {
    const tick = () => setInfo({ clock: clockOf(sim), weather: weatherNow(sim), date: sim.today.label, festival: sim.today.festival, live: festivalNow(sim), treasury: sim.tills.town });
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sim]);
  if (!info) return null;
  const { clock, weather } = info, day = clock.h >= 6 && clock.h < 19;
  return (
    <div className="panel time" role="timer" aria-label={`Town time ${clock.hhmm}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        {weather === 'rain' || weather === 'snow' ? (
          <g stroke="#8a6552" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 15a4.5 4.5 0 0 1 .8-9A5.5 5.5 0 0 1 18 7a4 4 0 0 1 1 8z" fill="#d6d8e4" />
            {weather === 'rain'
              ? [8, 13, 18].map((x) => <line key={x} x1={x} y1="18" x2={x - 1.5} y2="22.5" stroke="#7f9bbd" />)
              : [8, 13, 18].map((x) => <circle key={x} cx={x} cy="20.5" r="1.4" fill="#fff" />)}
          </g>
        ) : day ? (
          <g stroke="#8a6552" strokeWidth="1.6" strokeLinecap="round">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <line key={a} x1="13" y1="2.5" x2="13" y2="5.5" transform={`rotate(${a} 13 13)`} />)}
            <circle cx="13" cy="13" r="5.5" fill="#f2cf7a" />
          </g>
        ) : (
          <path d="M17 4a9 9 0 1 0 5 15A7.5 7.5 0 0 1 17 4z" fill="#c4c2ee" stroke="#8a6552" strokeWidth="1.6" strokeLinejoin="round" />
        )}
      </svg>
      <div>
        <b>{clock.hhmm}</b>
        <small>{PERIODS.find(([end]) => clock.h < end)[1]} · {WEATHER[weather]}</small>
        <small className="date">{info.date}{info.festival && (info.live ? ' · Lantern Festival now' : ' · Lantern Festival 17:00')}</small>
        <small className="money">Town treasury <b>{yen(info.treasury)}</b></small>
      </div>
    </div>
  );
}

function Need({ label, value }) {
  return (
    <div className="need">
      <span>{label}</span>
      <span className={`bar ${value < 30 ? 'low' : ''}`}><i style={{ width: `${value}%` }} /></span>
    </div>
  );
}

function ResidentCard({ sim, id, select, following, setFollowing }) {
  const r = PEOPLE[id], s = sim.people[id], mood = moodOf(s), p = partnerOf(sim, id), house = householdOf(sim, id), sheet = profileOf(sim, id);
  return (
    <>
      <h2>
        {r.name}
        <button className={`chip ${following ? 'on' : ''}`} onClick={() => setFollowing(following ? null : id)}>{following ? 'Following' : 'Follow'}</button>
      </h2>
      <p className="sub">{r.job} at {LOC[r.work].name}</p>
      <p className="status">{statusOf(sim, id)}</p>
      <div className="traits" aria-label="Personality">{[...personalityOf(sim, id), r.sleepHours ? (r.patrol || r.hours[0] >= 16 ? 'Late shift' : 'Early bird') : bedtimeOf(id) < 22 ? 'Early bird' : bedtimeOf(id) > 22.5 ? 'Night owl' : null].filter(Boolean).map((trait) => <span key={trait}>{trait}</span>)}</div>
      {s.visitorMeet && <p className="reason">Agreed to {s.visitorMeet.topic === 'check-in' ? 'check on' : s.visitorMeet.topic === 'greeting' ? 'say hello to' : 'speak with'} <button type="button" className="link" onClick={() => select({ type: 'resident', id: s.visitorMeet.target })}>{PEOPLE[s.visitorMeet.target].name}</button>.</p>}
      {s.intent?.plan.reason && <p className="reason">{s.intent.plan.reason}</p>}
      {s.brain?.goal && <label className="project-progress">{s.brain.goal.name} · {Math.round(goalProgress(sim, id) * 100)}%<progress value={goalProgress(sim, id)} max={1} /></label>}
      {s.brain?.lessons.slice(0, 2).map((l) => <p className="reason" key={`${l.kind}-${l.subj}`}>{l.text}</p>)}
      {sim.outings.filter((o) => ['invited', 'together'].includes(o.status) && [o.host, o.guest].includes(id)).map((o) => {
        const other = o.host === id ? o.guest : o.host;
        return <p className="status" key={o.id}>{o.status === 'invited' ? 'Agreed to meet' : 'Out together with'} <button className="link" onClick={() => select({ type: 'resident', id: other })}>{PEOPLE[other].name}</button> at {LOC[o.loc].name} · {timeAt(o.start)}</p>;
      })}
      <dl className="stats">
        <div><dt>Wallet</dt><dd>{yen(s.money)}</dd></div>
        <div><dt>Wage</dt><dd>{r.wage ? `${yen(r.wage)}/h` : 'Grant'}</dd></div>
        <div><dt>Hours</dt><dd>{fmtH(r.hours[0])}–{fmtH(r.hours[1])}</dd></div>
        <div><dt>Pantry</dt><dd>{s.pantry} {s.pantry === 1 ? 'portion' : 'portions'}</dd></div>
      </dl>
      <h3>Mood · {mood.label}</h3>
      <Need label="Food" value={s.needs.food} />
      <Need label="Energy" value={s.needs.energy} />
      <Need label="Fun" value={s.needs.fun} />
      <h3>Working life · {experienceOf(s)}</h3>
      <p className="sub">{Math.floor(s.career.minutes / 60)} hours of practice · {s.career.customers} customers helped · {s.career.shifts} shifts worked</p>
      {s.shiftLife && !s.shiftLife.finished && <p className="reason">This shift · {Math.round(s.shiftLife.minutes)} minutes on duty · {s.shiftLife.customers} customers · {Math.round(s.shiftLife.breakMinutes)} minutes of breaks</p>}
      <p className="sub">
        Lives in the {HOUSE_NAMES[s.home]?.[s.house] ?? 'house'} at {LOC[s.home].name}
        {p && <> {p.married ? '· married to' : p.engaged ? '· engaged to' : p.stage === 'together' ? 'with' : '· dating'} <button className="link" onClick={() => select({ type: 'resident', id: p.id })}>{PEOPLE[p.id].name}</button></>}
        {housematesOf(sim, id).filter((o) => o.id !== p?.id).length > 0 && <> · housemates {housematesOf(sim, id).filter((o) => o.id !== p?.id).map((o, k) => <span key={o.id}>{k ? ', ' : ''}<button className="link" onClick={() => select({ type: 'resident', id: o.id })}>{o.name}</button></span>)}</>}
      </p>
      <p className="reason">{propertyOf(sim, id)?.owner === id ? 'Owns this home · rent free' : propertyOf(sim, id)?.owner ? `Home owned by ${PEOPLE[propertyOf(sim, id).owner].name}` : `Renting · saving toward a ${yen(HOME_PRICE)} home`}{housematesOf(sim, id).length === 0 ? ' · a place of my own' : ''}</p>
      {sim.housing.moves.filter((m) => m.members.includes(id)).map((m) => <p className="status" key={m.id}>Moving to <button className="link" onClick={() => select({ type: 'location', id: m.to.loc })}>{LOC[m.to.loc].name}</button> · {m.phase}</p>)}
      <p className="sub">{(s.pot ?? 3) >= 8 ? 'The doorstep flowers are in full bloom.' : (s.pot ?? 3) >= 3 ? 'The doorstep pot is coming along nicely.' : 'The doorstep pot could use some water.'}</p>
      {house && <p className="reason">Household · {Math.round(house.tidiness)}% tidy · {house.dirtyLaundry} clothes waiting to wash{house.laundry ? house.laundry.remaining > 0 ? ` · laundry drying (${Math.ceil(house.laundry.remaining)} minutes of sun left)` : ' · clean laundry ready to fold' : ''}</p>}
      {p && sim.couples[[id, p.id].sort().join(':')]?.dates > 0 && <p className="sub">{sim.couples[[id, p.id].sort().join(':')].dates} dates together so far</p>}
      <p className="sub">Loves {r.likes.map((l) => LOC[l].name).join(' and ')} · enjoys {hobbyOf(id).name} · birthday {birthdayLabel(id)}{isBirthday(sim, id) ? ' (today!)' : ''}</p>
      {PETS.filter((pt) => favouriteOf(sim, pt.id) === id).map((pt) => <p className="sub" key={pt.id}>{pt.name} the {pt.kind} has picked {r.name} as a favourite person.</p>)}
      {r.hobbies?.includes('fishing') && <>
        <h3>Fishing hobby</h3>
        <p className="sub">{s.fishStats.caught} caught · {s.fishStats.sold} sold · {s.fishStats.eaten} cooked and eaten</p>
        <p className="reason">{s.fish.length ? `In the basket: ${s.fish.map((f) => f.name.toLowerCase()).join(', ')}.` : 'The basket is empty. Fishing trips fit around work, meals, and good weather.'}</p>
        <button className="link" onClick={() => select({ type: 'location', id: 'fishing' })}>Visit Reedwater Fishing Pier</button>
      </>}
      <details className="profile">
        <summary>Profile</summary>
        {PROFILE_FORMAT.map(([group, fields]) => <section key={group}>
          <h4>{group}</h4>
          <dl>{fields.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{sheet[k]}</dd></div>)}</dl>
        </section>)}
      </details>
      <h3>Relationships</h3>
      <ul className="rels">
        {relationsOf(sim, id).map(({ other, value, tier }) => (
          <li key={other.id}>
            <button onClick={() => select({ type: 'resident', id: other.id })}>
              <span>{other.name}</span>
              <span className={`bar ${value < 0 ? 'neg' : ''}`}><i style={{ width: `${Math.abs(value)}%` }} /></span>
              <em>{tier}</em>
            </button>
          </li>
        ))}
      </ul>
      {s.chats?.length > 0 && <>
        <h3>Recent conversations</h3>
        <ol className="conversation-history">{s.chats.slice(0, 3).map((chat) => <li key={chat.id}>
          <p className="sub">{LOC[chat.at].name} · {ago(sim, chat.when)}</p>
          {chat.messages.map((message, index) => <p key={`${message.speaker}-${index}`}><button className="link" onClick={() => select({ type: 'resident', id: message.speaker })}>{PEOPLE[message.speaker].name}</button>: “{message.text}”</p>)}
        </li>)}</ol>
      </>}
      <h3>Diary</h3>
      <ol className="diary">
        {s.diary.slice(0, 12).map((e, i) => <li key={e.when + e.text + i}><small>{e.when}</small>{e.text}</li>)}
      </ol>
      {s.memories.events.length > 0 && <><h3>Recent memories</h3><ul className="memories">{s.memories.events.slice(0, 4).map((m, i) => <li key={`${m.when}-${i}`}>{m.text}</li>)}</ul></>}
    </>
  );
}

function LocationCard({ sim, id, select }) {
  const l = LOC[id];
  const here = RESIDENTS.filter((r) => sim.people[r.id].at === id);
  const outside = here.filter((r) => !sim.people[r.id].hidden);
  const inside = here.filter((r) => sim.people[r.id].hidden && sim.people[r.id].act !== 'Sleeping');
  const asleep = here.length - outside.length - inside.length;
  const queue = queueAt(sim, id);
  const who = (r) => (
    <button key={r.id} className="who" onClick={() => select({ type: 'resident', id: r.id })}>
      <b>{r.name}</b>
      <small>{statusOf(sim, r.id)}</small>
    </button>
  );
  return (
    <>
      <h2>{l.name}</h2>
      <p className="sub">{DIST[l.district].name} · {l.blurb}</p>
      {sim.prices[id] !== undefined && (
        <dl className="stats">
          <div><dt>Price today</dt><dd>{yen(priceAt(sim, id))}</dd></div>
          <div><dt>Sales today</dt><dd>{yen(sim.sales[id])}</dd></div>
          <div><dt>{id === 'shrine' ? 'Treasury' : 'Till'}</dt><dd>{yen(tillFor(sim, id))}</dd></div>
        </dl>
      )}
      {['bakery', 'teahouse', 'market'].includes(id) && <>
        <p className="reason">{shopOpen(sim, id) ? 'Kitchen open · meals prepared to order' : 'Kitchen closed · residents can cook at home'}</p>
        {queue.length > 0 && <><h3>Meal queue · {queue.length}</h3><ol className="meal-queue">{queue.map((q) => <li key={q.id}><button className="link" onClick={() => select({ type: 'resident', id: q.id })}>{q.name}</button> · {q.phase === 'serving' ? 'being served' : 'waiting'}</li>)}</ol></>}
      </>}
      {id === 'fishing' && <p className="reason">{['rain', 'snow'].includes(weatherNow(sim)) ? 'Fishing paused while the weather passes.' : 'Three fishing spaces · open in dry weather, 06:30–20:00.'}<br />{sim.waterfront.caught} fish caught · {sim.waterfront.sold} sold · {sim.waterfront.eaten} cooked and eaten</p>}
      {id === 'cookhouse' && <p className="reason">A free communal kitchen. Residents bring their own fish, grill it, and enjoy a fresh meal.</p>}
      {id === 'market' && <p className="sub">Fish bought from residents: {sim.waterfront.marketStock} ({sim.waterfront.marketServed ?? 0} served) · paid {yen(sim.waterfront.paid)} from the market till.</p>}
      {id === 'farm' && <>
        <dl className="stats">
          <div><dt>In the barn</dt><dd>{sim.farm.produce} baskets</dd></div>
          <div><dt>Delivered</dt><dd>{sim.farm.delivered} baskets</dd></div>
          <div><dt>Till</dt><dd>{yen(tillFor(sim, id))}</dd></div>
        </dl>
        <p className="reason">Farmers carry produce to the market, the store, the bakery and the tea house, which pay the farm ¥300 a basket.</p>
      </>}
      {id === 'woodlot' && <>
        <dl className="stats">
          <div><dt>In the shed</dt><dd>{sim.woodlot.produce} bundles</dd></div>
          <div><dt>Delivered</dt><dd>{sim.woodlot.delivered} bundles</dd></div>
          <div><dt>Till</dt><dd>{yen(tillFor(sim, id))}</dd></div>
        </dl>
        <p className="reason">The woodcutter carries firewood to the bathhouse, the hot spring and the bakery ovens, which pay ¥200 a bundle.</p>
      </>}
      {id in (sim.firewood ?? {}) && <p className="sub">{sim.firewood[id] > 0 ? `Firewood on hand: ${sim.firewood[id]} bundles · a bundle burns every half hour while open` : 'The fires are out until more firewood arrives.'}</p>}
      {id in (sim.stock ?? {}) && <p className="sub">Fresh produce on hand: {sim.stock[id]} baskets{['market', 'store'].includes(id) ? ` · groceries ${yen(groceryPriceAt(sim, id))} a portion` : ' · every meal uses one'}</p>}
      {isHome(id) && <><h3>Homes on this lane</h3><ul className="memories">{HOUSES[id].map((_, house) => {
        const unit = sim.housing.properties[`${id}:${house}`], residents = RESIDENTS.filter((r) => sim.people[r.id].home === id && sim.people[r.id].house === house), reserved = sim.housing.moves.find((m) => m.to.loc === id && m.to.house === house);
        return <li key={house}>{HOUSE_NAMES[id][house]} · {residents.length ? residents.map((r, k) => <span key={r.id}>{k ? ', ' : ''}<button className="link" onClick={() => select({ type: 'resident', id: r.id })}>{r.name}</button></span>) : reserved ? 'reserved for a move' : 'vacant'}{unit.owner ? ` · owned by ${PEOPLE[unit.owner].name}` : ''}</li>;
      })}</ul></>}
      {isHome(id) && sim.harvest?.bushels > 0 && <p className="sub">Home gardens: {sim.harvest.bushels} baskets of vegetables grown for the pantry.</p>}
      <h3>Here now</h3>
      {outside.length ? outside.map(who) : <p className="sub">Nobody outside right now.</p>}
      {inside.length > 0 && <><h3>Inside</h3>{inside.map(who)}</>}
      {asleep > 0 && <p className="sub">{asleep} asleep inside</p>}
      {RESIDENTS.some((r) => r.work === id) && <><h3>Works here</h3>
      <p className="sub">{RESIDENTS.filter((r) => r.work === id).map((r) => `${r.name} (${r.job})`).join(', ')}</p>
      <p className="sub">Wages paid from the {TILL_NAME(sim, id).toLowerCase()}.</p></>}
    </>
  );
}

const ago = (sim, t) => { const d = Math.floor(sim.t / 1440) - Math.floor(t / 1440); return d <= 0 ? `today at ${timeAt(t)}` : d === 1 ? 'yesterday' : `${d} days ago`; };
const timeAt = (t) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function CommunityCard({ sim, select, soundOn, onToggleSound, onExport, onImport, onReset }) {
  const fileRef = useRef(null);
  const couples = Object.entries(sim.couples);
  const project = communityProject(sim);
  const outings = sim.outings.filter((o) => ['invited', 'together'].includes(o.status));
  const done = project.roles.reduce((n, role) => n + role.done, 0), total = project.roles.reduce((n, role) => n + role.need, 0);
  const dayOffset = Math.floor(project.deadline / 1440) - Math.floor(sim.t / 1440);
  return <>
    <h2>Town life</h2>
    <p className="sub">Small plans, shared work, and time together.</p>
    <h3>{project.title}</h3>
    <p className="status">{({ preparing: 'Neighbours are preparing', ready: 'Everything is ready', live: 'Happening now', complete: 'A memory to share', cancelled: 'Postponed for another time' })[project.status]}</p>
    <label className="project-progress">Preparation · {Math.round(done / total * 100)}%<progress value={done} max={total} /></label>
    <p className="reason">{project.event} · {LOC[project.loc].name}<br />{dayOffset > 0 ? `In ${dayOffset} ${dayOffset === 1 ? 'day' : 'days'}` : dayOffset === 0 ? 'Today' : 'Previously'} at {timeAt(project.deadline)}</p>
    <ul className="project-roles">{project.roles.map((role) => <li key={role.who}><button className="link" onClick={() => select({ type: 'resident', id: role.who })}>{PEOPLE[role.who].name}</button><span>{role.label}</span><small>{role.done >= role.need ? 'Ready' : `${Math.round(role.done / role.need * 100)}% prepared`}</small></li>)}</ul>
    <h3>Life by the water</h3>
    <p className="reason">{RESIDENTS.filter((r) => sim.people[r.id].fishing).length} residents on a fishing trip · {sim.waterfront.caught} catches · {sim.waterfront.eaten + (sim.waterfront.marketServed ?? 0)} fish meals enjoyed{sim.harvest?.bushels ? ` · ${sim.harvest.bushels} baskets from home gardens` : ''}.</p>
    <p className="sub"><button className="link" onClick={() => select({ type: 'location', id: 'fishing' })}>Fishing pier</button> · <button className="link" onClick={() => select({ type: 'location', id: 'cookhouse' })}>Cookhouse</button> · <button className="link" onClick={() => select({ type: 'location', id: 'boardwalk' })}>Boardwalk</button></p>
    <h3>A place of our own</h3>
    <p className="reason">{housingSummary(sim).homes} homes · {housingSummary(sim).owned} owned · {housingSummary(sim).moving} households moving. Residents pack and unpack around their work, meals and rest. A {yen(HOME_PRICE)} purchase goes to the town treasury.</p>
    <p className="sub">{['clover', 'blossom', 'maple'].map((loc, i) => <span key={loc}>{i ? ' · ' : ''}<button className="link" onClick={() => select({ type: 'location', id: loc })}>{LOC[loc].name}</button></span>)}</p>
    {sim.wedding && !['done', 'cancelled'].includes(sim.wedding.status) && (() => { const [a, b] = sim.wedding.couple.split(':'); return <>
      <h3>A wedding</h3>
      <p className="status"><button className="link" onClick={() => select({ type: 'resident', id: a })}>{PEOPLE[a].name}</button> and <button className="link" onClick={() => select({ type: 'resident', id: b })}>{PEOPLE[b].name}</button> {sim.wedding.status === 'live' ? 'are getting married now' : `marry at ${timeAt(sim.wedding.start)}`} · {LOC.shrine.name}</p>
      <p className="sub">{sim.wedding.guests.length} friends invited{sim.wedding.status === 'live' ? ` · ${Object.values(sim.wedding.attendance ?? {}).filter((minutes) => minutes >= 3).length} celebrating here` : ''}</p>
    </>; })()}
    {(sim.news ?? []).length > 0 && <>
      <h3>Town news</h3>
      {[...sim.news].reverse().map((n) => <p className="sub" key={`${n.kind}${n.t}`}>
        <button className="link" onClick={() => select({ type: 'resident', id: n.a })}>{PEOPLE[n.a].name}</button> and <button className="link" onClick={() => select({ type: 'resident', id: n.b })}>{PEOPLE[n.b].name}</button> {{ dating: 'started dating', together: 'moved in together', engaged: 'got engaged', married: 'got married', breakup: 'broke up' }[n.kind]} · {ago(sim, n.t)}
      </p>)}
    </>}
    {RESIDENTS.filter((r) => isBirthday(sim, r.id)).map((r) => <p className="sub" key={r.id}>Today is <button className="link" onClick={() => select({ type: 'resident', id: r.id })}>{r.name}</button>’s birthday.</p>)}
    <h3>Plans with friends</h3>
    {outings.length ? outings.map((o) => <div className="outing" key={o.id}><button className="link" onClick={() => select({ type: 'resident', id: o.host })}>{PEOPLE[o.host].name}</button> and <button className="link" onClick={() => select({ type: 'resident', id: o.guest })}>{PEOPLE[o.guest].name}</button><p className="sub">{o.status === 'together' ? 'Together now' : `Meeting at ${timeAt(o.start)}`} · {LOC[o.loc].name} · {o.date ? 'a date' : o.kind === 'home' ? 'tea at home' : o.kind === 'walk' ? 'a walk together' : 'time to sit and catch up'}</p></div>) : <p className="reason">No outings arranged right now. Residents make plans around work, meals, and rest.</p>}
    <details name="town-life" className="fold">
      <summary>Residents · {RESIDENTS.length}</summary>
      <div className="roster">
        {RESIDENTS.map((r) => {
          const s = sim.people[r.id], m = moodOf(s);
          return (
            <button type="button" key={r.id} className="who" onClick={() => select({ type: 'resident', id: r.id })}>
              <b>{r.name} · {m.label} · {yen(s.money)}</b>
              <small>{statusOf(sim, r.id)}</small>
            </button>
          );
        })}
      </div>
    </details>
    <details name="town-life" className="fold">
      <summary>Town ledger & couples</summary>
      <dl className="stats">
        <div><dt>Treasury</dt><dd>{yen(sim.tills.town)}</dd></div>
        <div><dt>Harvests</dt><dd>{sim.harvest?.bushels ?? 0}</dd></div>
        <div><dt>Couples</dt><dd>{couples.length}</dd></div>
      </dl>
      <ul className="ledger">
        {['bakery', 'teahouse', 'market', 'store', 'bathhouse', 'theater'].map((k) => (
          <li key={k}>
            <button type="button" className="link" onClick={() => select({ type: 'location', id: k })}>{LOC[k].name}</button>
            <span>{yen(priceAt(sim, k))} · till {yen(sim.tills[k])}</span>
          </li>
        ))}
      </ul>
      {couples.length > 0 && <p className="sub">Couples: {couples.map(([k, c], i) => { const [a, b] = k.split(':'); return <span key={k}>{i ? ', ' : ''}<button type="button" className="link" onClick={() => select({ type: 'resident', id: a })}>{PEOPLE[a].name}</button> & <button type="button" className="link" onClick={() => select({ type: 'resident', id: b })}>{PEOPLE[b].name}</button> ({c.stage})</span>; })}</p>}
    </details>
    <details name="town-life" className="fold">
      <summary>Saved town & atmosphere</summary>
      <div className="controls-row">
        <button type="button" className={`chip ${soundOn ? 'on' : ''}`} onClick={onToggleSound}>{soundOn ? 'Sound on' : 'Sound off'}</button>
      </div>
      <div className="controls-row">
        <button type="button" className="chip" onClick={onExport}>Export JSON</button>
        <button type="button" className="chip" onClick={() => fileRef.current?.click()}>Import JSON</button>
        <button type="button" className="chip" onClick={onReset}>New town</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
      </div>
    </details>
  </>;
}

// Talking with the selected resident: the history above, a message box below, docked to the bottom of the screen.
function ChatBar({ sim, id, you }) {
  const [talks, setTalks] = useState(() => { try { return JSON.parse(localStorage.getItem(TALKS_KEY) ?? '{}'); } catch { return {}; } });
  const [text, setText] = useState(''), [waiting, setWaiting] = useState(null), [open, setOpen] = useState(true);
  const bar = useRef(null), log = useRef(null), history = talks[id] ?? [];
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [history.length, id, open, waiting]);
  useEffect(() => { // phones: the resident card sits just above the chat bar
    const root = document.documentElement, size = new ResizeObserver(() => root.style.setProperty('--chat-h', `${bar.current?.offsetHeight ?? 0}px`));
    size.observe(bar.current);
    return () => { size.disconnect(); root.style.setProperty('--chat-h', '0px'); };
  }, []);
  const add = (who, msgs) => setTalks((all) => {
    const next = { ...all, [who]: [...(all[who] ?? []), ...msgs].slice(-HISTORY) };
    try { localStorage.setItem(TALKS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  const send = async (e) => {
    e.preventDefault();
    const said = tidyText(text), who = id; // the reply belongs to whoever was asked, even if another resident is selected meanwhile
    if (!said || waiting) return;
    setText(''); setWaiting(who); setOpen(true);
    add(who, [{ me: true, text: said, when: clockOf(sim).hhmm, at: sim.t, epoch: sim.epoch }]);
    const request = suggestedMeetingRequest(said, who, { history: talks[who] ?? [], now: sim.t, epoch: sim.epoch });
    const place = request ? null : suggestedPlace(said, sim.people[who].home);
    const decide = (commit) => request ? requestVisitorMeet(sim, who, request.target, { commit, topic: request.topic, defer: request.defer }) : place ? requestVisitorTrip(sim, who, place, { commit }) : null;
    const preview = decide(false);
    const generated = await replyAsk(sim, who, you, talks[who] ?? [], said, preview);
    const meeting = ['accepted', 'scheduled'].includes(preview?.status) && !preview.already ? decide(true) : preview;
    const answer = (meeting?.status === preview?.status && meeting?.startAt === preview?.startAt ? generated : null) ?? writtenReply(sim, who, said, you, talks[who] ?? [], meeting);
    heard(sim, who, you, answer);
    add(who, [{ me: false, text: answer, when: clockOf(sim).hhmm, at: sim.t, epoch: sim.epoch }]);
    setWaiting(null);
  };
  const clear = () => setTalks((all) => { const next = { ...all }; delete next[id]; try { localStorage.setItem(TALKS_KEY, JSON.stringify(next)); } catch {} return next; });
  const name = PEOPLE[id].name;
  return (
    <section ref={bar} className="panel chat" aria-label={`Talk with ${name}`}>
      <div className="chat-head">
        <b>Talking with {name}</b>
        {history.length > 0 && <button type="button" className="link" onClick={() => setOpen(!open)}>{open ? 'Hide history' : `History (${history.length})`}</button>}
        {history.length > 0 && open && <button type="button" className="link" onClick={clear}>Clear</button>}
      </div>
      {open && (history.length > 0 || waiting === id) && (
        <div className="chat-log" ref={log}>
          {history.map((m, i) => <p key={i} className={`msg ${m.me ? 'me' : ''}`}><small>{m.me ? you : name} · {m.when}</small>{m.text}</p>)}
          {waiting === id && <p className="msg typing"><small>{name}</small>…</p>}
        </div>
      )}
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_TEXT} placeholder={`Say something to ${name}`} aria-label={`Message to ${name}`} />
        <button type="submit" className="chip send" disabled={!text.trim() || !!waiting}>Send</button>
      </form>
    </section>
  );
}

function SettingsCard({ you, setYou }) {
  const [draft, setDraft] = useState(you);
  const save = (e) => { e.preventDefault(); setYou(tidyText(draft).slice(0, 24) || DEFAULT_NAME); };
  return <>
    <h2>Settings</h2>
    <form className="settings" onSubmit={save}>
      <label htmlFor="your-name">Your name</label>
      <p className="sub">Residents call you this when you talk with them.</p>
      <div className="row">
        <input id="your-name" value={draft} maxLength={24} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="chip send" disabled={tidyText(draft) === you}>Save</button>
      </div>
    </form>
  </>;
}

// On phones the card is a bottom sheet: drag the grip up to expand it, down to shrink or close it.
function Sheet({ children, onClose, selectionKey }) {
  const [expanded, setExpanded] = useState(false), [drag, setDrag] = useState(null);
  const panel = useRef(null);
  useEffect(() => { if (panel.current) panel.current.scrollTop = 0; }, [selectionKey]);
  const start = useRef(0);
  const grip = {
    onPointerDown: (e) => { start.current = e.clientY; setDrag(0); e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e) => drag !== null && setDrag(e.clientY - start.current),
    onPointerUp: () => {
      if (drag < -40) setExpanded(true);
      else if (drag > 60) expanded ? setExpanded(false) : onClose();
      else if (Math.abs(drag) < 6) setExpanded(!expanded); // a tap toggles
      setDrag(null);
    },
  };
  return (
    <aside ref={panel} className={`panel side ${expanded ? 'expanded' : ''}`} style={drag ? { transform: `translateY(${Math.max(drag, -80)}px)`, transition: 'none' } : undefined}>
      <div className="grip" {...grip} onPointerCancel={() => setDrag(null)} role="presentation"><i /></div>
      <button className="close" aria-label="Close" onClick={onClose}>×</button>
      {children}
    </aside>
  );
}

export default function Home() {
  const [sim, setSim] = useState(openTown);

  const selRef = useRef(null), camRef = useRef(null), followRef = useRef(null);
  const [sel, setSel] = useState(null);
  const [following, setFollowing] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [you, setYouState] = useState(DEFAULT_NAME);
  const setYou = (name) => { setYouState(name); savePref('name', name); };
  const soundWait = useRef(null);
  useEffect(() => { // restore view preferences; saved sound waits for the first click or key press, as browsers require
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'); } catch {}
    if (prefs.nav === false) setNavOpen(false);
    if (typeof prefs.name === 'string' && prefs.name.trim()) setYouState(prefs.name.trim().slice(0, 24));
    if (!prefs.sound) return;
    const start = (e) => { if (camRef.current && !e.target.closest?.('button')) onToggleSound(); }; // a button press may be the sound toggle itself
    soundWait.current = () => { window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); soundWait.current = null; };
    window.addEventListener('pointerdown', start); window.addEventListener('keydown', start);
    return () => soundWait.current?.();
  }, []);
  const [minds, setMinds] = useState({ status: 'off', error: '' });
  useEffect(() => {
    const off = onMind(setMinds);
    try { if (localStorage.getItem(MIND_KEY) === 'on') startMind(); } catch {}
    return off;
  }, []);
  const toggleMinds = () => {
    const on = ['off', 'failed'].includes(minds.status);
    try { localStorage.setItem(MIND_KEY, on ? 'on' : 'off'); } catch {}
    if (on) startMind(); else stopMind();
  };
  const [, rerender] = useReducer((x) => x + 1, 0);
  selRef.current = sel;
  followRef.current = following;

  useEffect(() => {
    if (!sel) return;
    const id = setInterval(rerender, 250); // keep the open card live
    return () => clearInterval(id);
  }, [sel]);

  // save every so often and whenever the page is hidden or closed
  useEffect(() => {
    const save = () => { try { localStorage.setItem(SAVE_KEY, saveState(sim)); } catch {} };
    const onHide = () => document.visibilityState === 'hidden' && save();
    const id = setInterval(save, 20000);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', save); };
  }, [sim]);

  const select = (s) => {
    setSel(s);
    if (s?.type !== 'resident' || s.id !== following) setFollowing(null);
  };
  const onToggleSound = () => {
    soundWait.current?.();
    const on = Boolean(camRef.current?.toggleSound());
    setSoundOn(on); savePref('sound', on);
  };
  const onExport = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([saveState(sim)], { type: 'application/json' }));
    a.download = `hinata-village-day-${clockOf(sim).day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const loaded = loadState(await f.text());
    if (loaded) alignClock(loaded);
    if (loaded) { try { localStorage.setItem(SAVE_KEY, saveState(loaded)); } catch {} setSim(loaded); }
  };
  const onReset = () => {
    const d = new Date(), midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const fresh = createSim(7, 7.5 * 60, midnight);
    try { localStorage.setItem(SAVE_KEY, saveState(fresh)); } catch {}
    setFollowing(null); setSim(fresh);
  };

  return (
    <main>
      <TownScene sim={sim} selRef={selRef} onSelect={select} camRef={camRef} followRef={followRef} onFollowEnd={() => setFollowing(null)} />
      <div className="grain" />
      <div className="hud">
        <TimeIndicator sim={sim} />
        <nav className={`panel jump${navOpen ? '' : ' closed'}`} aria-label="Jump to a district">
          <button type="button" className="fold" aria-expanded={navOpen} onClick={() => { savePref('nav', !navOpen); setNavOpen(!navOpen); }}>
            {navOpen ? 'Hide places' : 'Places'}
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d={navOpen ? 'M2.5 7.5 6 4l3.5 3.5' : 'M2.5 4.5 6 8l3.5-3.5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {navOpen && <>
            <button onClick={() => { setFollowing(null); camRef.current?.home(); }}>Whole town</button>
            {DISTRICTS.map((D) => (
              <button key={D.id} onClick={() => { setFollowing(null); camRef.current?.flyTo(D.x, D.z, 2.2); }}>{D.name.replace(' District', '')}</button>
            ))}
            <button onClick={() => select({ type: 'community' })}>Town life</button>
            <button type="button" onClick={onToggleSound}>{soundOn ? 'Sound: On' : 'Sound: Off'}</button>
            <button type="button" onClick={() => select({ type: 'settings' })}>Settings</button>
            <button type="button" onClick={toggleMinds} title={minds.error || (minds.status === 'no-key' ? 'Add the Azure OpenAI settings to .env.local (see .env.example) and restart the server.' : 'Azure OpenAI words what residents say, including their replies to you. It never decides where they go or what they do; the written lines take over whenever it is off or slow.')}>
              {MIND_LABEL[minds.status]}
            </button>
          </>}
        </nav>
      </div>
      {sel && (
        <Sheet onClose={() => select(null)} selectionKey={`${sel.type}:${sel.id ?? ''}`}>
          {sel.type === 'settings' ? <SettingsCard you={you} setYou={setYou} /> : sel.type === 'community' ? <CommunityCard sim={sim} select={select} soundOn={soundOn} onToggleSound={onToggleSound} onExport={onExport} onImport={onImport} onReset={onReset} /> : sel.type === 'resident'
            ? <ResidentCard sim={sim} id={sel.id} select={select} following={following === sel.id} setFollowing={setFollowing} />
            : <LocationCard sim={sim} id={sel.id} select={select} />}
        </Sheet>
      )}
      {sel?.type === 'resident' && <ChatBar sim={sim} id={sel.id} you={you} />}
    </main>
  );
}
