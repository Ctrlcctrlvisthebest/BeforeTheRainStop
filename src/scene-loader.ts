let pending: Promise<typeof import("./scene")> | undefined;
export function loadScene() {
  return (pending ??= import("./scene").catch((error) => {
    pending = undefined;
    throw error;
  }));
}
export function warmScene() {
  void loadScene().catch(() => {});
}
