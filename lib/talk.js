// What two residents say when they stop to chat: an opening line and a reply, drawn from what is
// actually around them — the weather and hour, where they are, each other's work, how close they are,
// and the news of the day (a fish caught, a cat petted, the festival tonight). Hand-written lines only.
const PLACE = {
  onsen: [['The water is perfect today~', 'I could stay here all evening.'], ['Look at the steam over the cedars.', 'Like clouds coming down the hill.']],
  bathhouse: [['Nothing beats a yuzu soak.', 'My shoulders say thank you.'], ['Ren keeps the water just right.', 'Never too hot, never too cold.']],
  bakery: [['That melon pan smells amazing.', 'I already ate two...'], ['Warm bread on a cool day~', 'The best kind of comfort.']],
  teahouse: [['This matcha is so smooth.', 'Kenji whisks it like magic.'], ['Shall we get another pot?', 'Only if you share the wagashi.']],
  market: [['The peaches are so ripe today!', 'Aiko picked the best ones.'], ['Fresh from Sunfield this morning.', 'You can taste the sunshine.']],
  store: [['They finally restocked the miso.', 'Just in time for dinner.']],
  library: [['Any good books lately?', 'A mystery. I stayed up too late!'], ['It is so quiet in here~', 'Shh, the cat is asleep.']],
  shrine: [['Did you draw a fortune?', 'Great blessing! I think.'], ['The cherry trees are lovely here.', 'Haru takes good care of them.']],
  theater: [['I hope the play is a comedy.', 'Last time I cried for an hour.']],
  fishing: [['Anything biting?', 'Just my patience, so far.'], ['The river is calm today.', 'Perfect for a big catch.']],
  farm: [['The rows look so neat!', 'Kiyo is up before the sun.'], ['Are those daikon?', 'The biggest ones yet!']],
  woodlot: [['It smells like cedar here.', 'Takumi says it never gets old.']],
  willow: [['The willow is swaying nicely.', 'It always calms me down.']],
  homes: [['Your flowers are blooming!', 'I talk to them every morning.']],
  boardwalk: [['Look at the light on the water.', 'Like scattered coins.']],
};
const WEATHER = {
  rain: [['What a downpour!', 'Good day for tea indoors.'], ['My umbrella has a hole...', 'Share mine, then.']],
  snow: [['Snow already!', 'Let’s build a snow rabbit later.'], ['My fingers are frozen.', 'The onsen will fix that.']],
  cloudy: [['Grey skies today.', 'Still cosy, though.']],
  clear: [['Lovely weather!', 'Perfect for a walk.'], ['Not a cloud in the sky.', 'Let’s make the most of it.']],
};
const SEASON = {
  spring: [['The blossoms are falling like snow.', 'Make a wish if one lands on you!']],
  summer: [['It is so warm today.', 'Shaved ice later?'], ['The cicadas are loud!', 'Summer’s music~']],
  autumn: [['The maples are turning red.', 'My favourite time of year.'], ['Sweet potatoes are in season!', 'Roasted ones, please.']],
  winter: [['I can see my breath!', 'Hot cocoa weather.']],
};
const HOUR = [
  [5, 10, [['Good morning!', 'Morning! Sleep well?'], ['Early start today?', 'The early bird gets the bread.']]],
  [11, 14, [['Have you had lunch?', 'Not yet, I’m starving!']]],
  [17, 20, [['Long day?', 'Long, but a good one.'], ['What a pretty sunset.', 'The sky looks like peaches.']]],
  [20, 24, [['Still up?', 'The stars are too pretty to sleep.']]],
];
const JOB = {
  Baker: 'How’s the oven today?', 'Tea Master': 'Any new teas lately?', Grocer: 'Busy at the market?', Farmer: 'How are the fields?',
  Farmhand: 'Big harvest coming?', Woodcutter: 'Chopped a whole forest yet?', 'Onsen Keeper': 'Is the spring hot today?', 'Bath Attendant': 'Are the baths busy?',
  Gardener: 'How are the cherry trees?', Porter: 'Heavy crates today?', Librarian: 'Any new books in?', Carpenter: 'Building anything new?',
  Fishmonger: 'What’s fresh today?', Musician: 'Learning a new song?', Actor: 'How are rehearsals?', Shopkeeper: 'Busy at the shop?',
  'Shrine Keeper': 'Many visitors at the shrine?', Student: 'How was school?', 'Tea Server': 'Lots of guests today?',
};
const WORK_REPLY = ['Busy, but I love it.', 'Can’t complain!', 'Tiring, but worth it.', 'Come and see for yourself!'];
const CLOSE = [['I saved you a seat.', 'You always do~'], ['Remember the umbrella incident?', 'Never tell anyone!'], ['You look happy today.', 'It’s the company.']];
const DATING = [['I was hoping I’d see you.', 'I was looking for you too.'], ['Walk me home later?', 'I’d like that.'], ['You have flour on your cheek.', 'Leave it, it’s cute.']];
const TOGETHER = [['What shall we cook tonight?', 'Something warm, together.'], ['Thank you for this morning.', 'Anything for you~']];
const STRANGER = [['Hello there!', 'Oh, hello!'], ['Nice to see a friendly face.', 'Likewise!']];
const TIRED = [['I’m so sleepy...', 'Go home and rest!']];
const HUNGRY = [['My stomach is growling.', 'Let’s find something to eat.']];

// Give the new neighbours their own selections from the existing authored
// pools. Dialogue remains local static text; no generated lines are introduced.
const PERSONAL = {
  akira: HOUR[3][2], fumi: [PLACE.bakery[0]], nao: [PLACE.bathhouse[0]],
  chika: [PLACE.teahouse[1]], itsuki: [PLACE.library[0]], hotaru: [PLACE.market[0]],
};

// pick(list) chooses with the simulation's own random numbers, so runs stay reproducible.
export function chatLines({ A, B, SA, SB, loc, h, weather, season, festival, rel, couple, wedding = null, news: town = [], recent = [], pick, chance }) {
  const options = [];
  const add = (pairs, w = 1) => { for (const p of pairs ?? []) options.push({ p, w }); };
  if (couple) add(couple.stage === 'together' ? TOGETHER : DATING, 3);
  else if (rel >= 70) add(CLOSE, 2);
  else if (rel < 15) add(STRANGER, 2);
  if (wedding) {
    if (wedding.includes(A.id) && wedding.includes(B.id)) add([['I choose you, every day.', 'And I choose you.'], ['Ready for our next chapter?', 'With you, always.']], 8);
    else if (wedding.includes(B.id)) add([['You look so happy together.', 'Thank you for being here.']], 8);
    else if (wedding.includes(A.id)) add([['I’m glad you could come.', 'I wouldn’t miss your wedding.']], 8);
    else add([['What a lovely ceremony.', 'They look so happy.'], ['Friends, flowers, and happy tears.', 'A day to remember.']], 8);
  }
  add(PLACE[loc], 2);
  add(PERSONAL[A.id], 1.5);
  add(WEATHER[weather]);
  add(SEASON[season]);
  for (const [from, to, pairs] of HOUR) if (h >= from && h < to) add(pairs);
  if (festival) add([['The lanterns are lit!', 'Let’s watch the fireworks together.']], 3);
  if (SA.needs.energy < 30) add(TIRED, 2);
  if (SA.needs.food < 30) add(HUNGRY, 2);
  if (JOB[B.job] && rel >= 15) add([[`${JOB[B.job]}`, pick(WORK_REPLY)]], 1.5);
  // the other resident's latest news, if it is fresh and worth mentioning
  const news = SB.diary[0]?.text ?? '';
  if (/^Caught (a|an) /.test(news)) add([[`I heard you caught a fish!`, `${news.replace(/^Caught (a|an) /, 'A ').replace(/[.!].*$/, '')}! So proud.`]], 3);
  if (/stroke|scratch behind the ears/.test(news)) add([[`Was that ${news.match(/(Mochi|Kuro|Tama|Hachi|Sumi)/)?.[1] ?? 'the cat'} with you?`, 'We’re best friends now.']], 3);
  if (/^Delivered /.test(news)) add([['Saw you with the cart earlier!', 'Deliveries keep the town going.']], 2);
  if (/^Moved in/.test(news)) add([['Settled into the new place?', 'It already feels like home.']], 3);
  if (/^Reserved the .*place of our own/.test(news)) add([['Do you need a hand with the move?', 'Thank you! I’m packing a box at a time.']], 3);
  if (/^Bought the .*home of my own/.test(news)) add([['You got the keys to your own house?', 'Saved up for it. I can hardly believe it!']], 3);
  if (/^What a busy day/.test(news)) add([['You look worn out!', 'Busy day. Run off my feet!']], 2);
  if (/introduced me to/.test(news)) add([['Making new friends?', 'This town is full of nice people.']], 2);
  if (/^Sketched /.test(news)) add([['Can I see your sketchbook?', 'Only if you promise not to laugh.']], 2);
  if (/^Played my flute/.test(news)) add([['I heard your flute earlier.', 'I’m still practising!']], 2);
  if (/^Knitted /.test(news)) add([['What are you knitting?', 'A scarf. It may be for you.']], 2);
  if (/^Read a few chapters/.test(news)) add([['Good book?', 'I couldn’t put it down.']], 2);
  const sameHouse = SA.home && SA.home === SB.home && SA.house === SB.house;
  if (/^Washed /.test(news)) add([sameHouse ? ['Thanks for doing the washing.', 'Fresh clothes for everyone.'] : ['Laundry day?', 'All washed and hanging out to dry.']], 3);
  if (/^Folded the dry laundry/.test(news)) add([sameHouse ? ['The clean clothes are put away?', 'Folded and ready for everyone.'] : ['All your chores done?', 'The laundry is finally put away.']], 3);
  if (/^Swept our front path/.test(news)) add([['Your front path looks lovely.', 'A little sweeping goes a long way.']], 2);
  if (/^My day at /.test(news)) add([['How did your shift go?', SB.career?.recent?.[0]?.customers > 4 ? 'Busy, but I helped a few neighbours.' : SB.career?.recent?.[0]?.customers > 0 ? 'A quiet day, with a friendly face.' : 'A good day’s work.']], 2);
  if (SB.work && SB.workDetail) add([['Nearly ready?', SB.task?.kind === 'work-close' ? 'Just packing up for the day.' : 'Getting everything ready for work.']], 2);
  if ((SB.pot ?? 0) >= 8 && loc === SB.home) add([['Your flowers look lovely!', 'I water them every morning.']], 2);
  if (couple?.engaged && !couple.married) add([['Not long until the wedding!', 'I can’t wait to marry you.'], ['Have you chosen a kimono?', 'It’s a surprise!'], ['Who should we invite?', 'Everyone, of course.']], 4);
  if (couple?.married) add([['Home for dinner, dear?', 'Always, love.'], ['Best decision I ever made.', 'Marrying me? I agree.']], 2);
  // town gossip: other people's news, or kind words when the news is the listener's own
  for (const n of town) {
    const mine = [n.a, n.b].find((x) => x?.id === B.id), other = mine && (mine === n.a ? n.b : n.a);
    if ([n.a, n.b].some((x) => x?.id === A.id) || !n.a || !n.b) continue;
    if (mine) add([{ dating: [`I heard about you and ${other.name}!`, 'Word travels fast here!'], together: ['How is the new home?', `${other.name} and I love it.`], married: ['Congratulations again!', 'Thank you for coming!'], engaged: ['Let me see the ring!', 'We’re so happy.'], breakup: ['Are you doing okay?', 'I will be. Thank you.'] }[n.kind]], 3);
    else add([{ dating: [`${n.a.name} and ${n.b.name} are dating!`, 'I saw that coming!'], together: [`${n.a.name} and ${n.b.name} live together now.`, 'Good for them!'], married: ['What a lovely wedding that was!', `${n.a.name} looked so happy.`], engaged: [`${n.a.name} and ${n.b.name} are engaged!`, 'A wedding at the shrine soon!'], breakup: [`Poor ${n.a.name}. And ${n.b.name} too.`, 'Breakups are never easy.'] }[n.kind]], 2.5);
  }
  const fresh = options.filter((o) => !recent.includes(o.p.join('|')) && !recent.includes([...o.p].reverse().join('|')));
  const choices = fresh.length ? fresh : options;
  const total = choices.reduce((n, o) => n + o.w, 0);
  let u = chance() * total;
  for (const o of choices) if ((u -= o.w) <= 0) return o.p;
  return choices[0]?.p ?? ['Hello!', 'Hi there!'];
}
