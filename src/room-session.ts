import { useEffect, useRef, useState } from "react";
import { api, Connection, validSession, type Session } from "./api";
import type { Input, Inputs } from "./game";
import type { PublicRoom } from "./room";
import { MINITOOL } from "./build-target";
import { forget, save, stored } from "./storage";

const SESSION_KEY = "rain-action-session-v2";

/** Owns the room connection, authoritative snapshots and seat restoration. */
export function useRoomSession(options: {
  initialCode: string;
  onRoom: (room: PublicRoom) => void;
  onEnter: () => void;
  onError: (message: string) => void;
}) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const connection = useRef<Connection | null>(null);
  const currentRoom = useRef<PublicRoom | null>(null);
  const currentSession = useRef<Session | null>(null);
  const inputs = useRef<Inputs>({});
  const snapshotTime = useRef(0);
  const attempt = useRef(0);
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [connected, setConnected] = useState(false);

  function refresh(next: PublicRoom) {
    const previous = currentRoom.current;
    currentRoom.current = next;
    if (next.game) snapshotTime.current = performance.now();
    callbacks.current.onRoom(next);
    if (next.revision !== previous?.revision || next.phase !== previous?.phase)
      setRoom(next);
  }
  function receive(next: PublicRoom, nextInputs: Inputs) {
    inputs.current = nextInputs;
    refresh(next);
  }
  function resume() {
    const seat = currentSession.current;
    if (!seat) return;
    connection.current?.close();
    connection.current = new Connection(
      seat,
      receive,
      setConnected,
      (message) => callbacks.current.onError(message),
    );
  }
  function suspend() {
    connection.current?.close();
    connection.current = null;
    if (currentSession.current) setConnected(false);
  }
  function beginEntry() {
    attempt.current++;
  }
  function enter(seat: Session) {
    beginEntry();
    setConnected(false);
    currentSession.current = seat;
    setSession(seat);
    save("session", SESSION_KEY, seat);
    callbacks.current.onEnter();
    resume();
  }
  function clear() {
    beginEntry();
    suspend();
    currentSession.current = null;
    currentRoom.current = null;
    inputs.current = {};
    setSession(null);
    setRoom(null);
  }
  function leave() {
    const seat = currentSession.current;
    if (seat && currentRoom.current?.phase === "lobby")
      void api(
        `/rooms/${seat.code}/command`,
        { type: "leave" },
        seat.token,
      ).catch((error: unknown) => {
        console.error("[BeforeTheRainStop] Leaving the lobby failed", error);
      });
    clear();
    forget("session", SESSION_KEY);
  }
  function sendInput(gameId: string, input: Input) {
    connection.current?.input(gameId, input);
  }
  function command(value: Record<string, unknown>) {
    connection.current?.command(value);
  }

  useEffect(() => {
    if (MINITOOL) return;
    const restoring = attempt.current;
    let cancelled = false;
    const seat = stored<unknown>("session", SESSION_KEY);
    if (
      validSession(seat) &&
      (!options.initialCode || options.initialCode === seat.code)
    ) {
      void api(`/rooms/${seat.code}`, undefined, seat.token).then(
        () => {
          if (!cancelled && restoring === attempt.current) enter(seat);
        },
        (error: unknown) => {
          if (cancelled || restoring !== attempt.current) return;
          forget("session", SESSION_KEY);
          callbacks.current.onError(
            error instanceof Error ? error.message : String(error),
          );
        },
      );
    }
    return () => {
      cancelled = true;
      connection.current?.close();
    };
  }, [options.initialCode]);

  return {
    room,
    session,
    connected,
    currentRoom,
    currentSession,
    inputs,
    snapshotTime,
    beginEntry,
    enter,
    clear,
    leave,
    suspend,
    resume,
    refresh,
    sendInput,
    command,
  };
}

export type RoomSession = ReturnType<typeof useRoomSession>;
