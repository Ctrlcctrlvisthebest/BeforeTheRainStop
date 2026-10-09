import type { Inputs } from "./game";
import type { PublicRoom } from "./room";

export interface RoomResult {
  room: PublicRoom;
}
export interface RoomEntryResult extends RoomResult {
  token: string;
  slot: number;
}
export interface RoomFailure {
  error: string;
}
export type RoomServerMessage =
  | { type: "state"; room: PublicRoom; inputs: Inputs }
  | { type: "error"; error: string }
  | { type: "pong"; t?: unknown };
