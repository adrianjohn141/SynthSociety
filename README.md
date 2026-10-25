# Synthetic Society — Hinata Village

A local, autonomous town built with Next.js and Three.js. Town time follows the
device clock: one simulation minute is one real minute. Residents work, eat,
rest, socialize and prepare community events without player commands.

## Run

```sh
npm install
npm run dev
npm test
npm run build
```

Open the local development URL. Select a building to see its residents and meal
queue, select a resident to see their personality, current intention, memories
and diary, or open **Town life** for community projects and agreed outings.

## Waterfront expansion

Seven connected districts now contain twenty-one places and twenty-five residents. The waterfront adds
Reedwater Fishing Pier, the Waterside Cookhouse, and Willow Boardwalk, with a
covered pavilion, picnic tables, plaza benches, reeds, and a moored rowboat.
The larger island preserves the original districts' coordinates.

Taro, Haru, Riku, and Ren enjoy fishing. In dry daylight they reserve one of three
pier spaces, walk there, cast, wait for a bite, and reel in dace, trout, or carp.
The rod, line, float, ripples, arms, and landed fish follow the actual saved
activity phase. Their finite baskets remain visible while carrying a catch.
Fishing yields to work, urgent needs, agreed meetings, events, darkness, and bad
weather. Trips end after two catches, with a three-hour break before another.

Residents choose between selling to an available market worker and keeping fish
for a meal. A sale requires arriving at the counter, a working buyer, and enough
money in the market till. The buyer pays the species' value; fish cannot be sold
twice. Residents grill their catch at the communal cookhouse or at home, then
restore hunger only while eating. Unused fish is composted after a day. Catch,
sale, cooking, and meal memories appear in residents' diaries; their cards and
Town life show fishing totals. Use **Waterfront** to jump to the new district.

## A livelier village

The moored rowboat has a dark wooden hull, light floor planks, pale trim, a
waterline and a gentle bob above its stationary water shadow. Darker reeds and
lily pads, lake glints, swaying tea and bath curtains, and moths around lamps
keep the waterfront readable by day and night. Doors ease around a hinge while
residents walk across the actual threshold, then close behind them.

Bathhouse visitors change indoors, pay for admission, walk to one of three
reserved courtyard bath places, soak, and rest afterwards. Towels, ripples,
steam and fading rosy cheeks follow that visit. Energy improves only during
observed soaking. Reached work activities show matcha whisking and froth,
kettle steam, dough kneading, an oven glow, market scales, watering drops,
turning pages, and smoke and small sparks at occupied fish grills. Pets sniff,
stretch, scratch and curl up to sleep; startled plaza birds settle on roofs.

Akira patrols several districts from midnight to six, Fumi kneads dough from
three, Nao and Chika keep the baths and tea service open late, Itsuki keeps the
evening reading room, and Hotaru opens the market at dawn. They have distinct
accessories, personalities and sleep schedules, and reuse the existing authored
conversation pools. A few rested residents take moonlit walks; most still sleep.
Home and business windows follow actual awake occupants. Night shifts use the
ordinary wages, tills, needs, travel and saved career records.

## Light and shadow

The sun crosses the sky with the town clock and casts soft shadows from houses,
trees, residents and pets: long and warm at dawn and dusk, short at midday, and
faint under cloud. After dark the moon takes over on the same arc with pale, cool
shadows. Lanterns, lit doorways, festival chochin and carried lanterns use real
point lights instead of painted glow circles. A lamp lights only while a resident
is beside it or carrying it. Up to sixteen lamps glow at once, chosen nearest the
view when more are in use, and the first two also cast shadows. Street lantern
heads stay dim until someone passes, then brighten with their light; shop-front
lanterns glow only while someone awake is inside. Tree canopies and bushes sway
in the wind, harder in rain and snow. Home chimneys smoke while someone is in
and awake, bats flit over the hillside and meadow from dusk, and rain splashes
ring the feet of anyone walking through a shower. On a slow device the scene
first drops to 1x resolution, then turns off lamp shadows.

## Live minds

The **Live minds** button in the town header lets Azure OpenAI word what
residents say. Each new conversation goes to the model with the residents, their
relationship, the place, exact town time, each speaker's next shift and rest
boundary, weather and their last talks together with elapsed time, plus the
written lines as ideas. Bubbles show thinking dots for up to five seconds;
accepted lines are what the residents remember having said. The model never
decides where anyone goes or what they do: the route refuses anything but
dialogue, and the written lines stay whenever the model is off, unconfigured,
slow or failing.

Visitors can suggest that any resident speak with another resident by name,
for example, “Could you talk to Mei?” or “Go say hello to Nao.”
The town checks both people's work, sleep, needs, and existing plans before the
speaker agrees. An accepted suggestion is saved with the town: the resident
walks to the other person, speaks only when they meet, and remembers the outcome.
Work, rest, an interruption, or a
missed meeting can cancel it. Live minds receives the town's decision before
wording the reply; the same behavior works with written replies when it is off.
Requests to greet or check on someone carry that intent into the spoken exchange;
a general request to talk keeps an ordinary town conversation. Both residents
remember the lines they actually heard. Asking the visitor's NPC how it went
returns the completed exchange, an ongoing status, or the recorded reason a
meeting was cancelled.
A clear follow-up such as “go to him” can refer to the one resident named in
the NPC's immediately preceding reply. Residents know another person's current
activity and location only when that person is nearby; otherwise they can say
they do not know where to find them.
Each resident also keeps up to eight confirmed outcomes from visitor-suggested
meetings. A completed visit enters both participants' records with only the
lines they actually heard; a cancelled visit enters only the requester’s
record. These records survive reloads and remain available after the shorter
conversation history rotates out. They can remember that they spoke with the
visitor, but the town does not copy the visitor’s typed claims into its saved
memory or treat those claims as facts.

## Talking with residents

Click a resident (in the town or on a card) and a message box opens at the
bottom of the screen. They answer as themselves: each resident has a character
sheet in `lib/profiles.js` (basic information, appearance, personality,
family, backstory, likes, dislikes and hobbies; shown under **Profile** on their
card), and the town adds what they know right now: mood, needs, what they are
doing, who is nearby, the people they know and how well, their goal and lessons.
The model also sees the exact town time and that resident's upcoming shift and
rest boundaries. Recent visitor messages, diary notes and meeting outcomes carry
elapsed time when their saved records include it; older chat records without a
day remain readable without an invented age.
Marital status, relationships and pets on the sheet follow the town as it lives.
They try not to repeat what they already said in the chat. With Live minds on the model words the
answer; otherwise a written reply does. The full answer also shows in a speech
bubble over their head, and they note the chat in their diary. Each resident's
history (last 40 messages) is kept in this browser and can be hidden or
cleared. Clearing those messages does not erase a resident's saved meeting
outcomes or the fact that you spoke. **Settings** in the side menu sets the
name residents call you.
When another resident is mentioned, the reply also receives that person's
current activity, location, mood, and relationship to the speaker. This keeps
claims about other residents tied to what the town knows.

## Personal goals and learning

Each resident sets their own goal for several days: saving for a home of their
own, making peace with someone after a falling-out (or getting to know an
acquaintance better), or becoming better at their job. Progress is read from the
real wallet, relationship or work record and shows on the resident's card; a
goal that is reached is celebrated, and one that stalls is let go for a while.

Free time is chosen from the resident's own point of view. Taste, habit and
curiosity still count, and the goal adds to them: savers skip paid outings,
someone mending a friendship goes where that person is and invites them, and
someone practising their trade spends spare time at work. Tired or low residents
sometimes pick somewhere familiar and easy even when another place scores
higher. After an argument or being stood up, they keep clear of that person for
a few hours and may turn down an invitation from them, but an outing they have
already agreed to is kept.

A plan is held until it runs out, hunger or tiredness takes over, an invitation
arrives, the weather turns, or someone they are avoiding turns up there.
Outcomes are learned, not only written in the diary: a missed meeting, a pleasant
outing, a meal that cost too much or a draining visit changes how they feel about
that person or place and nudges how thrifty, sociable or comfort-seeking they
are. The latest lessons appear on their card in their own words.

The key never reaches the browser: the page talks to this app's own route,
`app/api/mind/route.js`, which builds capped prompts from structured town data
(`lib/mind-prompts.js`) and asks for a fixed JSON shape, within 40 calls a minute.
To set it up, copy `.env.example` to `.env.local`, fill in the endpoint, key and
deployment name from Azure AI Foundry, and restart `npm run dev`. Because of the
route, the app needs a Node server (`next dev`, `next start`, or a host such as
Vercel or Azure App Service) rather than static files.

## Daily life

- **Meals:** residents choose nearby open kitchens they can afford. Orders join
  a queue, reach a reserved counter, receive service from a worker, and are paid
  for before eating. Hunger improves while actually eating. Smaller portions
  cost less; residents cook a simple meal at home when their budget or shop hours
  prevent dining out. Queues have a six-minute patience limit and never charge
  abandoned orders. Coworkers stagger meal breaks so kitchens can stay staffed.
- **Intentions:** leisure plans last 20–45 minutes, with extra time to finish an
  activity already started. Work, urgent needs, sleep, weather and agreed meetings
  can override them. Distance, price, crowding and seasonal preferences influence
  destination choices.
- **Personality and memory:** each resident has stable social, thrift, curiosity
  and routine traits. Enjoyable or tiring visits, service experiences, arguments
  and outings affect their saved memories and later choices.
- **Outings:** available friends and partners can agree to meet. They travel to
  the same location, wait for each other, walk through the plaza together or
  reserve adjacent bench seats. Completed outings strengthen relationships;
  missed meetings leave a memory without inventing time together. Health and
  work can interrupt an outing.
- **Crowds:** meal counters serve in joining order; servers handle one customer
  at a time. Seats and paired seating are reserved, and passing walkers yield to
  seated residents. Seating is fitted to all twelve shipped character models.
- **Weather:** outdoor staff move to indoor preparation during rain or snow,
  continue receiving wages, and return when the weather clears. Walkers carry
  umbrellas. Outdoor meetings relocate to shelter. Spring, summer, autumn and
  winter influence leisure choices.
- **Community stories:** rotating three-day projects prepare a performance, a
  shrine garden gathering, a neighbours’ market, or a waterfront lantern gathering. Named residents must finish
  their contributions; performance rehearsals depend on stage repairs. Prepared
  events draw residents together and create memories. Unfinished events are
  postponed, then cancelled if preparation still cannot be completed.
- **Harvest & fresh market fish:** tending village gardens gathers harvest baskets used in home and cookhouse meals, while fish sold to the Morning Market are served as fresh catch meals to market diners.
- **Observer tools & soundscape:** **Town life** includes a full resident directory, town treasury & shop ledger, JSON backup export/import, and a procedural WebAudio soundscape (rain, waterfront water, and pentatonic chimes).

## Homes and relationships

Blossom Meadows adds Clover Lane, Blossom Close and Maple Walk: fifteen cottages,
bringing the town to twenty-five physical homes. Existing addresses and the old
districts stay in place when a saved town loads. Residents sharing with unrelated
housemates reserve an available home, spend four minutes packing, walk there
carrying their belongings, then spend six minutes unpacking before their address
changes. Work, food, rest, rain and agreed plans pause the move; progress and
reservations survive saving. Committed couples arrange a private home together.
Partners on different shifts can do their share of a moving stage at different
times; both must finish before the stage advances or their address changes.
Breakups release joint moving plans and allow a real move to a vacant home.

Residents in a private home can buy it for ¥12,000 once they have another ¥4,000
left in savings. The money goes to the town treasury. Titles remain saved and
owned homes are reserved for their owners; an owner and a cohabiting committed
partner pay no rent there. Moving itself costs nothing. The resident profile,
each residential lane, and Town life show actual residents, vacancies, moving
plans and ownership. Each cottage has its own window, flowers and washing line.

The meadow road bends around Lantern Library and enters through the village
plaza. Its paving and navigation share the same centre line; the lane and its
rounded corners clear buildings, benches, lanterns and gate posts. Older saved
journeys are rerouted on load without resetting residents or their money.

Each resident has a saved address within their home lane. Sleeping, naps,
cooking, meals, and flower care use that address, including after moving in with
a partner. Home visits use the host's own front door.

Housemates share a saved household with doorstep tidiness and a laundry load.
They sweep an untidy doorstep, wash a load, let it dry through 45 minutes of
fine daytime weather, then fold it and put it away. Roommates can do different
parts of the same load. A chore reserves one resident, starts counting only at
their own doorstep, and releases its reservation for work or urgent needs.
Rain pauses drying; washed clothes appear on the household's actual washing
line until someone folds them. The resident card shows the home's condition
and waiting chores.

Wedding guests gather in rows at the shrine while the couple stands together
for their vows. A marriage requires at least five minutes actually together at
the ceremony. Delayed couples get fifteen minutes of grace before postponing to
the next afternoon; a broken engagement cancels its old ceremony. Guests who
spend at least three minutes there remember it and may buy a present from the
store. Attendance and gifts survive reloading without duplication.

Residents pause briefly for a conversation and remember up to six completed
exchanges. Their cards show who spoke, what was said, and where they met.
Conversations avoid the last four exchanges with the same person. Urgent needs
can interrupt a reply; unheard exchanges do not enter the shared history. Group
conversations are remembered by the neighbours who actually took part. Dates
need real time together to count, and end if the relationship breaks up.

## Working life

Workers spend four minutes preparing their station and use the last eight
minutes of a shift for closing tasks appropriate to their job. Customer service,
deliveries, meal breaks, shelter and urgent needs take priority. Preparing and
closing do not produce farm goods or firewood.

Each resident keeps actual duty minutes, customers helped, breaks and five recent
shift summaries. Only shifts with observed work count as shifts worked; missed
shifts do not invent experience. Saved practice gradually improves meal service
speed, up to a 25% reduction in preparation time, with no change to food prices,
portions or wage rates. Work and household progress is additive for existing
towns, rather than estimating events that were never simulated.

## Saved towns

State stays in this browser's local storage. Version-5, version-6 and version-7 towns upgrade
to version 8 with the newer residents and districts. Version-7 newcomer wallets
are funded from the existing treasury, preserving the town's total money and
random stream. Existing addresses stay valid and new cottage titles start vacant.
Doorway journeys are upgraded in place. Existing towns also receive
additive personality, intention, meal, outing, project, fishing, conversation, household and working-life fields;
wallets, relationships, diaries, positions and the random stream are retained.
Reloading a town does not duplicate projects, orders, catches, or fish sales. Keep a copy of the full
JSON before manually editing or clearing browser storage.

Time away is simulated with coarser movement. By default, absences longer than
three days skip the excess time before simulating the latest three days; wages
and rent are not replayed for that skipped interval. All systems remain local
and deterministic from the saved state; no language model or network service is
required for NPC decisions.

## Verification

`npm test` checks the actual simulation and shipped character meshes: seating,
restorative breaks, meal service and FIFO queues, budgets, committed plans,
learned preferences, shelter, real outings, all four community projects,
compatible save upgrades, deterministic continuation and money conservation.
Fishing checks cover the whole catch/sale/cook/eat loop across three seeds,
saving during each stage, distinct pier reservations, water boundaries,
interruptions, basket conservation, and animated arm/rod/line/fish geometry.
The three-day run also checks schedules, island bounds, collisions, needs,
relationships, the festival and offline catch-up. Nine-day runs across three
seeds check that community events can emerge through residents' actual work.

Home-life checks trace every resident to their assigned door and cooking spot,
including changed addresses. Ceremony checks require actual vows and guest
attendance, exercise postponements and cancelled engagements, and verify saved
gifts. Conversation checks cover fresh subjects, real replies, group histories,
interrupted speech, bounded storage, and deterministic continuation.

Household checks trace sweep/wash/dry/fold activity, real travel time, rainy
weather, shared reservations, moved addresses and saved loads. Working-life
checks cover opening, service, closing, breaks, saved shifts and the actual meal
queue at two experience levels; all money remains in wallets and tills.

Housing checks exercise three-seed private moves, packing/carrying/unpacking,
saved reservations, joint moving appointments, purchases and rent exemption.
Liveliness checks cover real bath phases and reservations, saved continuation,
funded newcomers, paid patrols, daytime sleep, early baking, late shifts, and
money conservation across three seeds. Mesh checks also verify door hinges,
boat clearance above the lake, activity-gated props and towels fitted to all
twelve character heads in the actual sitting animation.
Road checks sample the meadow lane’s full width and rounded corners, then trace
a real walker and an older saved journey around the library into the meadow.
