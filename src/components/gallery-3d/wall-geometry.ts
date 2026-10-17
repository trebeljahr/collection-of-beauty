import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type WallOpening = {
  /** Centre of the opening along the wall's local X axis, metres. */
  centerLocalX: number;
  width: number;
  height: number;
};

export type WallStrip = { xMin: number; xMax: number };

/** Full-height strips between openings, in the wall's local coordinates. */
export function wallStrips(width: number, doors: readonly WallOpening[]): WallStrip[] {
  const strips: WallStrip[] = [];
  const halfW = width / 2;
  let prevEnd = -halfW;
  for (const door of [...doors].sort((a, b) => a.centerLocalX - b.centerLocalX)) {
    const left = door.centerLocalX - door.width / 2;
    const right = door.centerLocalX + door.width / 2;
    if (left > prevEnd) strips.push({ xMin: prevEnd, xMax: left });
    prevEnd = Math.max(prevEnd, right);
  }
  if (prevEnd < halfW) strips.push({ xMin: prevEnd, xMax: halfW });
  return strips;
}

/** Transfers ownership of the parts to one geometry, with no material groups. */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/** The same strips and lintels as separate planes, in one wall-local mesh.
 * UVs are measured before translation, just as on each original plane:
 * every strip's origin joins the same metre grid across the wall. */
export function buildWallFaceGeometry(
  width: number,
  height: number,
  doors: readonly WallOpening[],
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const halfW = width / 2;
  const halfH = height / 2;
  const plane = (w: number, h: number, x: number, y: number, u0: number, v0: number) => {
    const geometry = new THREE.PlaneGeometry(w, h);
    const position = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    for (let i = 0; i < position.count; i++) {
      uv.setXY(i, u0 + position.getX(i) + w / 2, v0 + position.getY(i) + h / 2);
    }
    geometry.translate(x, y, 0);
    parts.push(geometry);
  };

  for (const strip of wallStrips(width, doors)) {
    const w = strip.xMax - strip.xMin;
    if (w > 0.001) plane(w, height, (strip.xMin + strip.xMax) / 2, 0, strip.xMin + halfW, 0);
  }
  for (const door of [...doors].sort((a, b) => a.centerLocalX - b.centerLocalX)) {
    const h = height - door.height;
    if (h > 0.001) {
      plane(
        door.width,
        h,
        door.centerLocalX,
        door.height + h / 2 - halfH,
        door.centerLocalX - door.width / 2 + halfW,
        door.height,
      );
    }
  }
  return mergeParts(parts);
}

/** One casing in door-local coordinates: threshold at y=0, centre at x=0.
 * Keeps the original boxes' triangles, normals and UVs, including their
 * hidden end faces; merging only removes the extra draw submissions. */
export function buildDoorTrimGeometry(
  width: number,
  height: number,
  trim: number,
  depth: number,
): THREE.BufferGeometry {
  const parts = [
    new THREE.BoxGeometry(trim, height, depth).translate(-width / 2 - trim / 2, height / 2, 0),
    new THREE.BoxGeometry(trim, height, depth).translate(width / 2 + trim / 2, height / 2, 0),
    new THREE.BoxGeometry(width + trim * 2, trim, depth).translate(0, height + trim / 2, 0),
  ];
  // All three boxes carry the same indexed attributes, so merging cannot fail.
  return mergeParts(parts) as THREE.BufferGeometry;
}
