// Only completed, nearby exchanges enter a resident's small conversation memory.
// Pending replies and short pauses are saved with the rest of the town.
export function initializeConversations(sim) {
  sim.pendingChats ??= [];
  for (const s of Object.values(sim.people)) { s.chats ??= []; s.chatUntil ??= 0; }
}

export function recentExchanges(sim, a, b) {
  return (sim.people[a].chats ?? []).filter((chat) => chat.participants.includes(b)).slice(0, 4).map((chat) => chat.messages.slice(0, 2).map((m) => m.text).join('|'));
}

export function scheduleConversation(sim, participants, loc, { visitorTopic, visitorInside = false } = {}) {
  const messages = participants.map((id) => {
    const bubble = sim.people[id].bubble;
    return { speaker: id, text: bubble.text, when: bubble.from ?? sim.t };
  }).sort((a, b) => a.when - b.when);
  const until = Math.max(...participants.map((id) => sim.people[id].bubble.until));
  for (const id of participants) sim.people[id].chatUntil = Math.max(sim.people[id].chatUntil ?? 0, until);
  sim.pendingChats.push({ id: `${sim.t}:${participants.join(':')}`, when: sim.t, at: loc, participants, messages, ready: messages.at(-1).when, ...(visitorTopic && { visitorTopic }), ...(visitorInside && { visitorInside }) });
}

export function updateConversations(sim) {
  sim.pendingChats = (sim.pendingChats ?? []).filter((chat) => {
    if (sim.t < chat.ready) return true;
    const host = sim.people[chat.participants[0]];
    const heard = chat.participants.every((id) => {
      const s = sim.people[id];
      const close = chat.visitorInside ? s.hidden && host.hidden : !s.hidden && Math.hypot(s.x - host.x, s.z - host.z) <= 3.2;
      return close && !s.walking && s.at === chat.at && s.bubble?.text === chat.messages.find((m) => m.speaker === id).text;
    });
    if (heard) for (const id of chat.participants) {
      const s = sim.people[id];
      s.chats.unshift({ id: chat.id, when: chat.when, at: chat.at, participants: [...chat.participants], messages: chat.messages.map(({ speaker, text, said }) => ({ speaker, text: said ?? text })), ...(chat.visitorTopic && { visitorTopic: chat.visitorTopic }) }); // what was actually said: a live-minds line, else the written one
      s.chats.length = Math.min(s.chats.length, 6);
    }
    return false;
  });
}
