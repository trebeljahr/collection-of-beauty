import * as THREE from "three";
import type { PanelPlacement } from "@/lib/gallery-layout/polyptych";

/** One quad per panel, each at its place in the work and mapped to its
 *  rectangle of the texture. */
export function buildPanelGeometry(panels: PanelPlacement[]): THREE.BufferGeometry {
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  panels.forEach((p, i) => {
    const [u0, v0, u1, v1] = p.uv;
    const l = p.x - p.w / 2;
    const r = p.x + p.w / 2;
    const b = p.y - p.h / 2;
    const t = p.y + p.h / 2;
    position.push(l, b, 0, r, b, 0, r, t, 0, l, t, 0);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const k = i * 4;
    index.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(
      panels.flatMap(() => [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      3,
    ),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}
