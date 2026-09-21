// The offline bundle uses the same scene as GitHub/Toy. Only loading changes:
// a static import satisfies the container's classic-script requirement.
import { PaperScene } from "../scene";
export { PaperScene };
export function loadScene() {
  return Promise.resolve({ PaperScene });
}
export function warmScene() {}
