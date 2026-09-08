import * as THREE from "three";

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
  faded: boolean;
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
      meshes.push({ mesh: object, castShadow: object.castShadow });
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    });
    this.decorations.push({
      bounds: new THREE.Box3().setFromObject(root).expandByScalar(0.15),
      faded: false,
      meshes,
      materials: [...materials].map((material) => ({
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      })),
    });
  }

  update(subjects: readonly THREE.Vector3[], towardCamera: THREE.Vector3) {
    this.ray.direction.copy(towardCamera).normalize();
    for (const decoration of this.decorations) {
      const faded = subjects.some((subject) => {
        this.ray.origin.copy(subject);
        return this.ray.intersectBox(decoration.bounds, this.hit) !== null;
      });
      if (faded === decoration.faded) continue;
      decoration.faded = faded;
      for (const saved of decoration.materials) {
        saved.material.opacity = faded ? saved.opacity * 0.1 : saved.opacity;
        saved.material.transparent = faded || saved.transparent;
        saved.material.depthWrite = faded ? false : saved.depthWrite;
      }
      for (const saved of decoration.meshes)
        saved.mesh.castShadow = !faded && saved.castShadow;
    }
  }
}
