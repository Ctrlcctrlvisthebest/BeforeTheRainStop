import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake solid colors into vertices so one opaque decoration needs fewer draws. */
export function mergeDecorations(parent: THREE.Group) {
  const buckets = new Map<
    string,
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[]
  >();
  for (const child of parent.children) {
    if (
      !(child instanceof THREE.Mesh) ||
      !(child.material instanceof THREE.MeshStandardMaterial) ||
      child.material.map ||
      child.material.transparent ||
      child.children.length
    )
      continue;
    const m = child.material;
    const key = [
      m.side,
      m.roughness,
      m.metalness,
      m.flatShading,
      child.castShadow,
      child.receiveShadow,
    ].join("/");
    const bucket = buckets.get(key) ?? [];
    bucket.push(child);
    buckets.set(key, bucket);
  }
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const originals = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    const geometries = meshes.map((mesh) => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrix);
      const color = mesh.material.color;
      const colors = new Float32Array(
        geometry.getAttribute("position").count * 3,
      );
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      originals.add(mesh.geometry);
      materials.add(mesh.material);
      return geometry;
    });
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    const material = meshes[0].material.clone();
    material.color.set("#ffffff");
    material.vertexColors = true;
    const merged = new THREE.Mesh(geometry, material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    parent.remove(...meshes);
    parent.add(merged);
    originals.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
}

export function colorSlab(geometry: THREE.BufferGeometry, side: string) {
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(normal.count * 3);
  const wall = new THREE.Color(side),
    top = new THREE.Color("#8c98a3");
  for (let i = 0; i < normal.count; i++)
    (normal.getY(i) > 0.5 ? top : wall).toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.clearGroups();
}
