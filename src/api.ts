import type { PublicRoom } from "./room";
import type { Input, Inputs } from "./game";
export interface Session {
  code: string;
  token: string;
  slot: number;
}
export interface ApiResult {
  room: PublicRoom;
  token?: string;
  slot?: number;
}
export const SERVICE = (import.meta.env?.VITE_ROOM_SERVER_URL ?? "").replace(
  /\/$/,
  "",
);
export async function api(
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResult> {
  const r = await fetch(`${SERVICE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await r.json()) as ApiResult & { error?: string };
  if (!r.ok) throw new Error(data.error ?? "暂时无法连接房间");
  return data;
}
export function validSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const s = value as Session;
  return (
    typeof s.code === "string" &&
    /^[A-HJ-NP-Z2-9]{8}$/.test(s.code) &&
    typeof s.token === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      s.token,
    ) &&
    Number.isInteger(s.slot) &&
    s.slot >= 0 &&
    s.slot < 6
  );
}
export class Connection {
  private ws: WebSocket | null = null;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private retries = 0;
  constructor(
    private session: Session,
    private state: (room: PublicRoom, inputs: Inputs) => void,
    private status: (online: boolean) => void,
    private error: (text: string) => void,
  ) {
    this.connect();
  }
  private connect() {
    if (this.disposed) return;
    const base = SERVICE || location.origin;
    const url = new URL(`/api/rooms/${this.session.code}/ws`, base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url);
    this.ws = ws;
    const active = () => !this.disposed && this.ws === ws;
    ws.onopen = () => {
      if (!active()) return;
      this.seq = 0;
      ws.send(JSON.stringify({ type: "hello", token: this.session.token }));
    };
    ws.onmessage = (e) => {
      if (!active()) return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === "state") {
          this.retries = 0;
          this.status(true);
          this.state(m.room, m.inputs ?? {});
        } else if (m.type === "error") this.error(m.error);
      } catch {
        this.error("收到无效的同步消息");
      }
    };
    ws.onclose = (e) => {
      if (!active()) return;
      this.ws = null;
      this.status(false);
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (e.code === 4001 || e.code === 1008) {
        this.error(
          e.code === 4001
            ? "此座位已在另一个页面连接"
            : "房间凭证失效，请返回重新加入",
        );
        return;
      }
      if (!this.disposed)
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(5000, 500 * 2 ** this.retries++),
        );
    };
    ws.onerror = () => {
      if (active()) this.status(false);
    };
    this.pingTimer = setInterval(() => {
      if (active() && ws.readyState === 1)
        ws.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }, 5000);
  }
  input(gameId: string, input: Input) {
    if (this.ws?.readyState === 1)
      this.ws.send(
        JSON.stringify({ type: "input", gameId, seq: ++this.seq, input }),
      );
  }
  command(command: Record<string, unknown>) {
    if (this.ws?.readyState === 1)
      this.ws.send(JSON.stringify({ type: "command", command }));
    else this.error("连接暂时中断，正在重连。");
  }
  close() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close(1000, "离开");
    }
  }
}
