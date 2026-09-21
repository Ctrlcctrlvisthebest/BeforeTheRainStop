// Build aliases exclude the online implementation from the offline module graph.
// Keep accidental future online paths loud, rather than pretending to save scores.
export const validSession = () => false;
export const playerIdentity = () => "";
export const api = async () => {
  throw new Error("此版本仅支持本地单人游戏");
};
export class Connection {
  constructor() {
    throw new Error("此版本仅支持本地单人游戏");
  }
  close() {}
  input() {}
  command() {}
}
export const Leaderboard = () => null;
export function useScoreSubmission() {
  return { result: null, submit: api, retry: api, retryAsTraveler: api };
}
export const NAME_LIMIT = 16;
export const NAME_REJECTED = "";
export const NAME_TOO_LONG = "";
export const reviewNameFormat = () => ({ ok: true, name: "旅人" });
export class ReplayRecorder {
  record() {}
  snapshot() {
    return null;
  }
}
