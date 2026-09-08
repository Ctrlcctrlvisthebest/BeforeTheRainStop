import { DurableObject } from "cloudflare:workers";
import {
  authenticate,
  command,
  joinRoom,
  LIFE,
  makeRoom,
  publicRoom,
  RoomError,
  type Room,
  type PublicRoom,
} from "../src/room";
import { cleanInput, idleInput, stepGame, type Inputs } from "../src/game";
import { boardName, validPlayerToken } from "../src/leaderboard";
import { NamePolicyError } from "./name-policy";
import type { VerifiedScore } from "./leaderboard";
export { RainLeaderboard } from "./leaderboard";

async function rankIdentity(token: unknown) {
  if (!validPlayerToken(token)) throw new RoomError("玩家标识无效");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token.toLowerCase()),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
interface Reply {
  status: number;
  data: { room?: PublicRoom; token?: string; slot?: number; error?: string };
}
interface Attachment {
  slot: number;
  token?: string;
  seq: number;
  window: number;
  count: number;
}
export class RainRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private inputs: Inputs = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private publishing: Promise<void> | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS room(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL)",
      );
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS score_outbox(id TEXT PRIMARY KEY,data TEXT NOT NULL)",
      );
      const rows = this.ctx.storage.sql
        .exec<{ data: string }>("SELECT data FROM room WHERE id=1")
        .toArray();
      this.room = rows[0] ? (JSON.parse(rows[0].data) as Room) : null;
      if (this.room) {
        const online = new Set(
          this.ctx
            .getWebSockets()
            .filter((ws) => ws.readyState === 1)
            .map(
              (ws) =>
                this.member(
                  this.room!,
                  ws.deserializeAttachment() as Attachment,
                )?.slot,
            ),
        );
        for (const player of this.room.players)
          player.online = online.has(player.slot);
      }
      if (this.hasPendingScores())
        await this.ctx.storage.setAlarm(Date.now() + 1000);
      else if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + LIFE);
    });
  }
  private hasPendingScores() {
    return (
      this.ctx.storage.sql.exec("SELECT id FROM score_outbox LIMIT 1").toArray()
        .length > 0
    );
  }
  private enqueueScore(room: Room) {
    const g = room.game;
    if (!g || g.status !== "won" || room.rankingStatus) return;
    // Credentials are never exposed in the public room or leaderboard response.
    // Older rooms without persistent ranking identities use their private room tokens.
    const score: VerifiedScore = {
      id: g.id,
      level: g.level,
      mode: g.mode,
      participant: `${g.mode}:${room.players
        .map((p) => p.rankKey ?? p.token)
        .sort()
        .join(",")}`,
      names: [...room.players]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => p.name),
      timeMs: Math.round(g.time * 1000),
      achievedAt: Date.now(),
    };
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO score_outbox(id,data) VALUES(?,?)",
      g.id,
      JSON.stringify(score),
    );
    room.rankingStatus = "pending";
    room.revision++;
    this.save(room);
    this.ctx.waitUntil(this.publishScores());
  }
  private publishScores(): Promise<void> {
    return (this.publishing ??= this.flushScores().finally(() => {
      this.publishing = null;
    }));
  }
  private async flushScores() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const row = this.ctx.storage.sql
        .exec<{ id: string; data: string }>(
          "SELECT id,data FROM score_outbox LIMIT 1",
        )
        .toArray()[0];
      if (!row) break;
      try {
        const score = JSON.parse(row.data) as VerifiedScore;
        await this.env.LEADERBOARDS.getByName(
          boardName(score.level, score.mode),
        ).submitVerified(score);
        this.ctx.storage.sql.exec(
          "DELETE FROM score_outbox WHERE id=?",
          row.id,
        );
        if (this.room?.game?.id === row.id) {
          this.room.rankingStatus = "saved";
          this.room.revision++;
          this.save(this.room);
          this.broadcast();
        }
      } catch {
        console.error(
          JSON.stringify({ event: "leaderboard_publish_retry", runId: row.id }),
        );
        if (this.room?.game?.id === row.id) {
          this.room.rankingStatus = "retry";
          this.room.revision++;
          this.save(this.room);
          this.broadcast();
        }
        break;
      }
    }
    // Share the room's single alarm between expiry and durable score retries.
    const expiresAt = this.room?.expiresAt ?? Date.now() + LIFE;
    await this.ctx.storage.setAlarm(
      this.hasPendingScores()
        ? Date.now() + 60000
        : Math.max(Date.now() + 1000, expiresAt),
    );
  }
  private save(room: Room): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO room(id,data) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      JSON.stringify(room),
    );
    this.room = room;
  }
  private member(room: Room, attachment: Attachment) {
    if (attachment.slot < 0 || !attachment.token) return null;
    try {
      const player = authenticate(room, attachment.token);
      return player.slot === attachment.slot ? player : null;
    } catch (e) {
      if (e instanceof RoomError) return null;
      throw e;
    }
  }
  private revoke(ws: WebSocket, code: number, reason: string) {
    ws.serializeAttachment({
      ...ws.deserializeAttachment(),
      slot: -1,
      token: undefined,
    });
    ws.close(code, reason);
  }
  private applyCommand(
    token: string,
    body: Record<string, unknown>,
    now: number,
  ) {
    const previous = this.room!;
    const next = command(previous, token, body, now, crypto.randomUUID());
    if (next.game?.id !== previous.game?.id) this.inputs = {};
    for (const player of previous.players) {
      if (!next.players.some((p) => p.slot === player.slot))
        delete this.inputs[player.slot];
    }
    // Both HTTP and WebSocket commands revoke departed seats before reuse.
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (a.slot >= 0 && !this.member(next, a))
        this.revoke(ws, 1008, "此座位已离开房间");
    }
    this.save(next);
    this.broadcast();
    this.run();
    return next;
  }
  private packet() {
    return JSON.stringify({
      type: "state",
      room: publicRoom(this.room!),
      inputs: this.inputs,
      serverTime: Date.now(),
    });
  }
  private broadcast(): void {
    if (!this.room) return;
    const data = this.packet();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (this.member(this.room, a) && ws.readyState === 1) {
        try {
          ws.send(data);
        } catch {
          ws.close(1011, "连接中断");
        }
      }
    }
  }
  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  private run(): void {
    if (
      this.timer ||
      !this.room?.game ||
      this.room.game.status !== "playing" ||
      this.room.players.some((p) => !p.online)
    )
      return;
    this.timer = setInterval(() => {
      const r = this.room;
      if (
        !r?.game ||
        r.game.status !== "playing" ||
        r.players.some((p) => !p.online)
      ) {
        this.stop();
        return;
      }
      stepGame(r.game, this.inputs, 1 / 60);
      stepGame(r.game, this.inputs, 1 / 60);
      if ((r.game.status as string) === "won") this.enqueueScore(r);
      if (r.game.tick % 4 === 0 || (r.game.status as string) === "won")
        this.broadcast();
      if (r.game.tick % 120 === 0 || (r.game.status as string) === "won")
        this.save(r);
      if ((r.game.status as string) === "won") this.stop();
    }, 1000 / 30);
  }
  async operate(
    kind: string,
    code: string,
    token: string,
    body: Record<string, unknown>,
  ): Promise<Reply> {
    try {
      const now = Date.now();
      const secret =
        kind === "create" || kind === "join" ? crypto.randomUUID() : "";
      const rankKey = secret
        ? await rankIdentity(body.playerToken ?? secret)
        : undefined;
      let r = this.room;
      if (kind === "create") {
        if (r) return { status: 409, data: { error: "请重新创建房间" } };
        r = makeRoom(code, body.capacity, body.level, body.name, secret, now);
        r.players[0].rankKey = rankKey;
        this.save(r);
        await this.ctx.storage.setAlarm(now + LIFE);
        return {
          status: 201,
          data: { room: publicRoom(r), token: secret, slot: 0 },
        };
      }
      if (!r || r.version !== 2 || now >= r.expiresAt)
        throw new RoomError("房间不存在或已过期", 404);
      if (kind === "join") {
        const slot = joinRoom(r, body.name, secret, now);
        r.players.find((p) => p.slot === slot)!.rankKey = rankKey;
        this.save(r);
        this.broadcast();
        return {
          status: 200,
          data: { room: publicRoom(r), token: secret, slot },
        };
      }
      authenticate(r, token);
      if (kind === "score") {
        this.enqueueScore(r);
        await this.publishScores();
        r = this.room!;
      }
      if (kind === "command") {
        r = this.applyCommand(token, body, now);
      }
      return { status: 200, data: { room: publicRoom(r) } };
    } catch (e) {
      if (e instanceof RoomError || e instanceof NamePolicyError)
        return { status: e.status, data: { error: e.message } };
      throw e;
    }
  }
  async fetch(_request: Request): Promise<Response> {
    if (!this.room || Date.now() >= this.room.expiresAt)
      return Response.json({ error: "房间不存在或已过期" }, { status: 404 });
    if (this.ctx.getWebSockets().length >= this.room.capacity + 6)
      return new Response("连接数过多", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      slot: -1,
      seq: -1,
      window: Date.now(),
      count: 0,
    } satisfies Attachment);
    setTimeout(() => {
      if ((server.deserializeAttachment() as Attachment).slot < 0)
        server.close(1008, "请先加入房间");
    }, 8000);
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    try {
      if (typeof message !== "string" || message.length > 4096)
        throw new RoomError("消息格式无效");
      let raw: unknown;
      try {
        raw = JSON.parse(message);
      } catch {
        throw new RoomError("消息格式无效");
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new RoomError("消息格式无效");
      const m = raw as Record<string, unknown>;
      const a = ws.deserializeAttachment() as Attachment;
      const r = this.room;
      if (!r || Date.now() >= r.expiresAt) {
        ws.close(1008, "房间已过期");
        return;
      }
      if (m.type === "hello") {
        if (a.slot >= 0) return;
        if (typeof m.token !== "string") throw new RoomError("缺少凭证");
        const player = authenticate(r, m.token);
        for (const other of this.ctx.getWebSockets()) {
          if (
            other !== ws &&
            (other.deserializeAttachment() as Attachment).slot === player.slot
          ) {
            this.revoke(other, 4001, "已在另一个页面重新连接");
          }
        }
        a.slot = player.slot;
        a.token = m.token;
        this.inputs[player.slot] = idleInput();
        player.online = true;
        player.lastSeen = Date.now();
        r.revision++;
        ws.serializeAttachment(a);
        this.save(r);
        this.broadcast();
        this.run();
        return;
      }
      if (a.slot < 0) throw new RoomError("请先认证");
      if (!this.member(r, a)) {
        // Connections surviving an older deployment reauthenticate on reconnect.
        this.revoke(ws, a.token ? 1008 : 1012, "请重新连接房间");
        return;
      }
      if (Date.now() - a.window > 1000) {
        a.window = Date.now();
        a.count = 0;
      }
      if (++a.count > 100) throw new RoomError("操作过于频繁");
      ws.serializeAttachment(a);
      if (m.type === "input") {
        if (!r.game || m.gameId !== r.game.id) return;
        const input = cleanInput(m.input);
        if (!input || !Number.isSafeInteger(m.seq) || Number(m.seq) <= a.seq)
          return;
        a.seq = Number(m.seq);
        ws.serializeAttachment(a);
        this.inputs[a.slot] = input;
        this.run();
      } else if (m.type === "command") {
        if (
          !m.command ||
          typeof m.command !== "object" ||
          Array.isArray(m.command)
        )
          throw new RoomError("操作格式无效");
        this.applyCommand(
          a.token!,
          m.command as Record<string, unknown>,
          Date.now(),
        );
      } else if (m.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", t: m.t }));
      } else throw new RoomError("未知消息");
    } catch (e) {
      if (!(e instanceof RoomError))
        console.error(
          JSON.stringify({
            event: "room_socket_failed",
            message: e instanceof Error ? e.message : "unknown",
          }),
        );
      if (ws.readyState === 1) {
        ws.send(
          JSON.stringify({
            type: "error",
            error: e instanceof RoomError ? e.message : "连接异常，请重新连接",
          }),
        );
        if ((ws.deserializeAttachment() as Attachment).slot < 0)
          ws.close(1008, "认证失败");
      }
    }
  }

  private disconnected(ws: WebSocket): void {
    const a = ws.deserializeAttachment() as Attachment;
    if (a.slot < 0 || !this.room) return;
    const p = this.member(this.room, a);
    if (p?.online) {
      p.online = false;
      p.lastSeen = Date.now();
      this.inputs[a.slot] = idleInput();
      this.room.revision++;
      this.stop();
      this.save(this.room);
      this.broadcast();
    }
  }
  webSocketClose(ws: WebSocket): void {
    this.disconnected(ws);
    ws.close(1000, "离开");
  }
  webSocketError(ws: WebSocket): void {
    this.disconnected(ws);
  }
  async alarm(): Promise<void> {
    if (this.hasPendingScores()) await this.publishScores();
    if (this.room && Date.now() < this.room.expiresAt) {
      await this.ctx.storage.setAlarm(
        this.hasPendingScores()
          ? Math.min(Date.now() + 60000, this.room.expiresAt)
          : this.room.expiresAt,
      );
      return;
    }
    this.stop();
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, "房间到期");
    if (this.hasPendingScores()) {
      await this.ctx.storage.setAlarm(Date.now() + 60000);
      return;
    }
    this.room = null;
    await this.ctx.storage.deleteAll();
  }
}
function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (n) => alphabet[n % alphabet.length],
  ).join("");
}
async function boundedJson(
  request: Request,
  maxBytes = 8192,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new RoomError("需要 JSON 格式");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new RoomError("请求过大", 413);
    }
    chunks.push(value);
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new RoomError("JSON 格式无效");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new RoomError("请求格式无效");
  return parsed as Record<string, unknown>;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const allowed = [
      ...env.ALLOWED_ORIGINS.split(",").map((x) => x.trim()),
      new URL(request.url).origin,
    ];
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    });
    if (origin && allowed.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      headers.set("Access-Control-Max-Age", "86400");
    } else if (origin)
      return Response.json(
        { error: "该网页尚未配置为允许的游戏地址" },
        { status: 403, headers },
      );
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/health" && request.method === "GET")
        return Response.json(
          { ok: true, game: "before-the-rain", version: 2 },
          { headers },
        );
      if (url.pathname === "/api/leaderboard") {
        if (request.method !== "GET" && request.method !== "POST")
          throw new RoomError("请求方法无效", 405);
        const ip = request.headers.get("CF-Connecting-IP") ?? "local";
        const limiter =
          request.method === "POST"
            ? env.SCORE_SUBMISSION_LIMIT
            : env.ROOM_REQUEST_LIMIT;
        if (!(await limiter.limit({ key: ip })).success)
          throw new RoomError("操作太频繁，请稍后重试", 429);
        if (request.method === "POST") {
          const body = await boundedJson(request, 512 * 1024);
          const participant = await rankIdentity(body.playerToken);
          if (typeof body.level !== "number")
            throw new RoomError("关卡或人数无效");
          let target: string;
          try {
            target = boardName(body.level, 1);
          } catch {
            throw new RoomError("关卡或人数无效");
          }
          const result = await env.LEADERBOARDS.getByName(target).submitSolo(
            body,
            participant,
          );
          return Response.json(result.data, { status: result.status, headers });
        }
        const levelValue = url.searchParams.get("level"),
          modeValue = url.searchParams.get("mode");
        if (!levelValue || !modeValue) throw new RoomError("关卡或人数无效");
        const level = Number(levelValue),
          mode = Number(modeValue) as import("../src/game").Mode;
        let target: string;
        try {
          target = boardName(level, mode);
        } catch {
          throw new RoomError("关卡或人数无效");
        }
        const entries = await env.LEADERBOARDS.getByName(target).top();
        return Response.json({ level, mode, entries }, { headers });
      }
      let kind: string;
      let roomCode: string;
      if (url.pathname === "/api/rooms" && request.method === "POST") {
        kind = "create";
        roomCode = code();
      } else {
        const match =
          /^\/api\/rooms\/([A-HJ-NP-Z2-9]{8})(?:\/(join|command|ws|score))?$/.exec(
            url.pathname,
          );
        if (!match) throw new RoomError("接口不存在", 404);
        roomCode = match[1];
        kind = match[2] ?? "state";
        if (
          request.method !==
          (kind === "state" || kind === "ws" ? "GET" : "POST")
        )
          throw new RoomError("请求方法无效", 405);
      }
      if (kind === "ws") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          throw new RoomError("需要 WebSocket 连接", 426);
        const ip = request.headers.get("CF-Connecting-IP") ?? "local";
        if (!(await env.ROOM_REQUEST_LIMIT.limit({ key: ip })).success)
          throw new RoomError("连接过于频繁", 429);
        return env.ROOMS.getByName("v2:" + roomCode).fetch(request);
      }
      const body = request.method === "POST" ? await boundedJson(request) : {};
      const token =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const ip = request.headers.get("CF-Connecting-IP") ?? "local";
      const limiter =
        kind === "create" ? env.ROOM_CREATION_LIMIT : env.ROOM_REQUEST_LIMIT;
      if (!(await limiter.limit({ key: ip })).success)
        throw new RoomError("操作太频繁，请稍后重试", 429);
      if (kind === "state" || kind === "command" || kind === "score") {
        if (!/^[a-f0-9-]{36}$/.test(token))
          throw new RoomError("请先加入房间", 401);
      }
      const result = await env.ROOMS.getByName("v2:" + roomCode).operate(
        kind,
        roomCode,
        token,
        body,
      );
      return Response.json(result.data, { status: result.status, headers });
    } catch (error) {
      if (error instanceof RoomError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers },
        );
      console.error(
        JSON.stringify({
          event: "room_request_failed",
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      return Response.json(
        { error: "房间服务暂时不可用，请稍后重试" },
        { status: 500, headers },
      );
    }
  },
} satisfies ExportedHandler<Env>;
