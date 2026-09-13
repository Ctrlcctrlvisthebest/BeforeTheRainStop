import * as THREE from "three";
import { setMaterialTransparency } from "./scene-resources";

/** Background art is drawn before gameplay and can never write over its depth. */
export function prepareBackdrop(root: THREE.Group) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.renderOrder = -100;
    object.castShadow = false;
    object.receiveShadow = false;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      // The backdrop is solid silhouette art. Keep it in the opaque pass,
      // which finishes before any transparent gameplay objects are drawn.
      material.transparent = false;
      material.depthWrite = false;
      material.depthTest = false;
    }
  });
}

interface Decoration {
  bounds: THREE.Box3;
  exitBounds: THREE.Box3;
  faded: boolean;
  visibility: number;
  materials: {
    material: THREE.Material;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
  }[];
  meshes: { mesh: THREE.Mesh; castShadow: boolean }[];
}

/** Only decorative roofs/racks are registered. Collision bodies and fire stay
 * visible and keep their original gameplay behavior. Orthographic sightlines
 * are parallel, including during the camera's turn animation. */
export class SceneryOcclusion {
  private decorations: Decoration[] = [];
  private ray = new THREE.Ray();
  private hit = new THREE.Vector3();

  clear() {
    this.decorations.length = 0;
  }

  add(root: THREE.Group) {
    const meshes: Decoration["meshes"] = [];
    const materials = new Set<THREE.Material>();
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.renderOrder =
        -5 + this.decorations.length * 0.001 + meshes.length * 0.000001;
      meshes.push({ mesh: object, castShadow: object.castShadow });
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = 0;
        material.polygonOffsetUnits = -32 * (this.decorations.length + 1);
        materials.add(material);
      }
    });
    const bounds = new THREE.Box3().setFromObject(root).expandByScalar(0.15);
    this.decorations.push({
      bounds,
      exitBounds: bounds.clone().expandByScalar(0.3),
      faded: false,
      visibility: 1,
      meshes,
      materials: [...materials].map((material) => ({
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      })),
    });
  }

  update(
    subjects: readonly THREE.Vector3[],
    towardCamera: THREE.Vector3,
    dt = 1,
  ) {
    this.ray.direction.copy(towardCamera).normalize();
    for (const decoration of this.decorations) {
      const faded = subjects.some((subject) => {
        this.ray.origin.copy(subject);
        return (
          this.ray.intersectBox(
            decoration.faded ? decoration.exitBounds : decoration.bounds,
            this.hit,
          ) !== null
        );
      });
      // Clear an obstruction immediately; only restore it after the sightline
      // has left a wider boundary, then ease it back instead of flashing solid.
      let visibility = faded
        ? 0.1
        : THREE.MathUtils.damp(decoration.visibility, 1, 12, dt);
      if (visibility > 0.999) visibility = 1;
      if (faded === decoration.faded && visibility === decoration.visibility)
        continue;
      decoration.faded = faded;
      decoration.visibility = visibility;
      for (const saved of decoration.materials) {
        saved.material.opacity = saved.opacity * visibility;
        setMaterialTransparency(
          saved.material,
          visibility < 1 || saved.transparent,
        );
        saved.material.depthWrite = visibility < 1 ? false : saved.depthWrite;
      }
      for (const saved of decoration.meshes)
        saved.mesh.castShadow = visibility === 1 && saved.castShadow;
    }
  }
}
