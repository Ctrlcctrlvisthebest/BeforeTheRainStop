import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { isMode, newGame, LEVELS, type Mode, type Game } from "./game";
import { requirePlayerName, publicPlayerName } from "../server/name-policy";
import { regroupStatus } from "./regroup";
interface Player {
  slot: number;
  name: string;
  token: string;
  rankKey?: string;
  online: boolean;
  lastSeen: number;
}
export interface Room {
  version: 2;
  code: string;
  capacity: Mode;
  host: number;
  level: number;
  players: Player[];
  phase: "lobby" | "game";
  game: Game | null;
  revision: number;
  expiresAt: number;
  votes: number[];
  voteNext: boolean | null;
  rankingStatus?: "pending" | "saved" | "retry";
  regroupVotes?: number[];
  turnNotice?: { slot: number; at: number; gameId: string };
}
export type PublicRoom = Omit<Room, "players"> & {
  players: Omit<Player, "token" | "rankKey">[];
  serverTime?: number;
};
export const LIFE = 24 * 60 * 60 * 1000;
export class RoomError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function makeRoom(
  code: string,
  capacity: unknown,
  level: unknown,
  name: unknown,
  token: string,
  now: number,
): Room {
  if (!isMode(capacity) || capacity === 1)
    throw new RoomError("请选择 2、3 或 6 人房间");
  if (typeof level !== "number" || !Number.isInteger(level) || !LEVELS[level])
    throw new RoomError("关卡不存在");
  return {
    version: 2,
    code,
    capacity,
    level,
    host: 0,
    players: [
      {
        slot: 0,
        name: requirePlayerName(name),
        token,
        online: false,
        lastSeen: now,
      },
    ],
    phase: "lobby",
    game: null,
    revision: 0,
    expiresAt: now + LIFE,
    votes: [],
    voteNext: null,
  };
}
export function publicRoom(room: Room): PublicRoom {
  const now = Date.now();
  const { players, ...state } = room;
  return {
    ...structuredClone(state),
    serverTime: now,
    regroupVotes: regroupStatus(room, now).votes,
    players: players.map(({ token: _token, rankKey: _rankKey, ...p }) => ({
      ...p,
      name: publicPlayerName(p.name),
    })),
  };
}
/** Recheck consent at the moment the grace period ends. This is also called
 * after membership changes, so an already unanimous vote cannot get stuck. */
export function advanceRegroup(room: Room, now: number): Room {
  const status = regroupStatus(room, now);
  if (!status.unanimous || status.remainingMs > 0 || now >= room.expiresAt)
    return room;
  const r = structuredClone(room);
  // A finished chapter stays finished; an unfinished run starts fresh after
  // replacement players join. Never rank a run with mixed membership.
  if (r.game!.status === "won" && r.level < LEVELS.length - 1) r.level++;
  r.players = r.players.filter((p) => p.online);
  if (!r.players.some((p) => p.slot === r.host)) r.host = r.players[0].slot;
  r.game = null;
  r.phase = "lobby";
  r.votes = [];
  r.voteNext = null;
  delete r.regroupVotes;
  delete r.rankingStatus;
  delete r.turnNotice;
  r.revision++;
  return r;
}
export function authenticate(room: Room, token: string): Player {
  const supplied = Buffer.from(token);
  const p = room.players.find((p) => {
    const expected = Buffer.from(p.token);
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  });
  if (!p) throw new RoomError("房间凭证已失效，请重新加入", 401);
  return p;
}
export function joinRoom(
  room: Room,
  name: unknown,
  token: string,
  now: number,
): number {
  if (room.phase !== "lobby")
    throw new RoomError("游戏已经开始，请用原标签页重连", 409);
  if (room.players.length >= room.capacity)
    throw new RoomError("房间已满", 409);
  const slot = Array.from({ length: room.capacity }, (_, i) => i).find(
    (i) => !room.players.some((p) => p.slot === i),
  )!;
  room.players.push({
    slot,
    name: requirePlayerName(name),
    token,
    online: false,
    lastSeen: now,
  });
  room.revision++;
  return slot;
}
export function command(
  room: Room,
  token: string,
  body: Record<string, unknown>,
  now: number,
  id: string,
): Room {
  let r = structuredClone(room);
  const p = authenticate(r, token);
  p.lastSeen = now;
  if (body.type === "start") {
    if (p.slot !== r.host) throw new RoomError("由房主开始游戏", 403);
    if (r.phase !== "lobby") throw new RoomError("已经开始", 409);
    if (r.players.length !== r.capacity || r.players.some((p) => !p.online))
      throw new RoomError("等所有同伴连接后再出发", 409);
    r.phase = "game";
    r.game = newGame(r.capacity, r.level, id);
  } else if (body.type === "leave") {
    if (r.phase !== "lobby")
      throw new RoomError("游戏中保留座位，请关闭标签页暂离", 409);
    r.players = r.players.filter((x) => x.slot !== p.slot);
    if (p.slot === r.host) r.host = r.players[0]?.slot ?? 0;
  } else if (body.type === "regroup") {
    if (r.phase !== "game" || !r.game || body.gameId !== r.game.id)
      throw new RoomError("关卡已经更新", 409);
    if (!p.online) throw new RoomError("请连接房间后再操作", 409);
    r.regroupVotes = regroupStatus(r, now).votes;
    if (!r.regroupVotes.includes(p.slot)) r.regroupVotes.push(p.slot);
    r = advanceRegroup(r, now);
  } else if (body.type === "cancel-regroup") {
    if (
      r.phase !== "game" ||
      !r.game ||
      (body.gameId !== undefined && body.gameId !== r.game.id) ||
      !p.online
    )
      throw new RoomError("关卡已经更新", 409);
    r.regroupVotes = regroupStatus(r, now).votes.filter(
      (slot) => slot !== p.slot,
    );
  } else if (body.type === "turn-signal") {
    if (r.phase !== "game" || !r.game || body.gameId !== r.game.id || !p.online)
      throw new RoomError("关卡已经更新", 409);
    if (r.turnNotice && now - r.turnNotice.at < 3000)
      throw new RoomError("请稍后再提醒", 429);
    r.turnNotice = { slot: p.slot, at: now, gameId: r.game.id };
  } else if (body.type === "restart") {
    if (!r.game || body.gameId !== r.game.id)
      throw new RoomError("关卡已经更新", 409);
    const next = body.next === true && r.game.status === "won";
    if (r.voteNext !== null && r.voteNext !== next)
      throw new RoomError("先完成同伴发起的投票", 409);
    r.voteNext = next;
    if (!r.votes.includes(p.slot)) r.votes.push(p.slot);
    if (r.votes.length === r.capacity) {
      r.level = next ? (r.level + 1) % LEVELS.length : r.level;
      r.game = newGame(r.capacity, r.level, id);
      delete r.rankingStatus;
      r.votes = [];
      r.voteNext = null;
      delete r.regroupVotes;
      delete r.turnNotice;
    }
  } else throw new RoomError("未知操作");
  r.revision++;
  return r;
}
