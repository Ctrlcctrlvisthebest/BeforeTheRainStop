import type { PublicRoom, Room } from "./room";

const RECONNECT_GRACE_MS = 15000;

/** Shared by the server and the team panel. An offline vote never counts as
 * consent; reconnecting a seat must not revive a vote that was discarded. */
export function regroupStatus(room: Room | PublicRoom, now: number) {
  const online = room.players.filter((p) => p.online);
  const onlineSlots = new Set(online.map((p) => p.slot));
  const votes = [...new Set(room.regroupVotes ?? [])].filter((slot) =>
    onlineSlots.has(slot),
  );
  const reconnectUntil = room.players.reduce(
    (until, p) =>
      p.online ? until : Math.max(until, p.lastSeen + RECONNECT_GRACE_MS),
    0,
  );
  const unanimous =
    room.phase === "game" &&
    !!room.game &&
    online.length > 0 &&
    votes.length === online.length;
  return {
    votes,
    onlineCount: online.length,
    unanimous,
    reconnectUntil,
    remainingMs: Math.max(0, reconnectUntil - now),
  };
}
