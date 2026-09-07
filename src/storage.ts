type StorageKind = "local" | "session";
const storage = (kind: StorageKind) =>
  kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;

// Accessing the storage property itself can throw in restricted browsers.
export function stored<T>(kind: StorageKind, key: string): T | null {
  try {
    return JSON.parse(storage(kind).getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
export function save(kind: StorageKind, key: string, value: unknown) {
  try {
    storage(kind).setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* Keep playing when persistence is unavailable. */
    return false;
  }
}
export function forget(kind: StorageKind, key: string) {
  try {
    storage(kind).removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
