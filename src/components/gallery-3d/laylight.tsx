"use client";

// Laylight: the glazed ceiling panel of a picture gallery. A flat cream
// ceiling filled the top third of every view with nothing, and gave the
// room's soft fill light no visible source. This is a frosted-glass
// panel set in the ceiling, divided by glazing bars, glowing as if lit
// by daylight above it.
//
// The panel sits in a recess, RECESS_M above the ceiling plane, with a
// plaster reveal round it. Hung flush, it read as a sheet stuck to the
// ceiling; recessed, the ceiling has a visible edge and the glass reads
// as higher than the plaster. The ceiling round it is cut with
// `ceilingAround`, so the hole is open.
//
// It is drawn, not lit: a MeshBasicMaterial with a small tiling pane
// texture. The room's fill still comes from the environment map, so a
// panel costs two draw calls (glass, frame) and no shader work on the
// walls. Where the panels go is decided in laylight-layout.ts.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Rect } from "@/lib/gallery-layout/fittings";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { fixtureMaterial } from "./palette-materials";
import { rectsAround } from "./stair-opening";

/** Target pane size, metres. The grid is fitted so whole panes span the
 *  panel in both directions. */
const PANE_M = 1.25;
/** How far the glass sits above the ceiling plane. The slab above is at
 *  least 0.2 m over the highest ceiling, so this stays inside the
 *  plenum. */
export const RECESS_M = 0.08;
const FRAME_WIDTH = 0.09;
/** Depth of the frame's bars under the glass. Shallow, so the reveal
 *  shows below them. */
const FRAME_DROP = 0.025;
/** A side of the recess this close to the room's edge is on a wall line,
 *  where the wall already closes it: a reveal there would z-fight. */
const ON_WALL_M = 0.05;

const PANE_PX = 128;

/** One pane of frosted glass: brightest in the middle, falling toward
 *  the bars, with a dark glazing bar on two edges. Tiled, the bars of
 *  neighbouring panes meet into a grid. */
function paintPane(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PANE_PX;
  canvas.height = PANE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const c = PANE_PX / 2;
  const glow = ctx.createRadialGradient(c, c, PANE_PX * 0.1, c, c, PANE_PX * 0.75);
  glow.addColorStop(0, "#f4eee0");
  glow.addColorStop(1, "#ddd5c2");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, PANE_PX, PANE_PX);
  // Shadow the glass takes from the bar, then the bar itself.
  const bar = 2;
  for (const horizontal of [true, false]) {
    const soft = ctx.createLinearGradient(0, 0, horizontal ? 0 : 10, horizontal ? 10 : 0);
    soft.addColorStop(0, "rgba(120,110,95,0.3)");
    soft.addColorStop(1, "rgba(120,110,95,0)");
    ctx.fillStyle = soft;
    ctx.fillRect(0, 0, horizontal ? PANE_PX : 10, horizontal ? 10 : PANE_PX);
    ctx.fillStyle = "#6a655b";
    ctx.fillRect(0, 0, horizontal ? PANE_PX : bar, horizontal ? bar : PANE_PX);
  }
  return canvas;
}

let paneTexture: THREE.CanvasTexture | null = null;
let glassMaterial: THREE.MeshBasicMaterial | null = null;

/** Shared across every room. A CanvasTexture holds its pixels on the
 *  CPU, so it re-uploads by itself after the Canvas remounts on a lost
 *  WebGL context. */
export function getGlassMaterial(): THREE.MeshBasicMaterial {
  if (glassMaterial) return glassMaterial;
  paneTexture = new THREE.CanvasTexture(paintPane());
  paneTexture.colorSpace = THREE.SRGBColorSpace;
  paneTexture.wrapS = THREE.RepeatWrapping;
  paneTexture.wrapT = THREE.RepeatWrapping;
  paneTexture.anisotropy = 8;
  // Tinted a step below the pane's own values so the ceiling does not
  // outshine the works, which are drawn at full brightness.
  glassMaterial = new THREE.MeshBasicMaterial({
    map: paneTexture,
    color: "#f2eee6",
    toneMapped: false,
  });
  return glassMaterial;
}

/** A ceiling of `width` by `depth` about (cx, cz), facing down, with a
 *  hole for each panel (world rectangles). Built from the rectangles
 *  left round them, because a panel may reach the room's walls, where a
 *  shape's hole does not triangulate. In the ceiling's own frame. */
export function ceilingAround(
  panels: readonly Rect[],
  cx: number,
  cz: number,
  width: number,
  depth: number,
): THREE.BufferGeometry {
  const parts = rectsAround(panels, cx, cz, width, depth).map((c) => {
    const g = new THREE.PlaneGeometry(c.xMax - c.xMin, c.zMax - c.zMin);
    g.rotateX(Math.PI / 2);
    g.translate((c.xMin + c.xMax) / 2, 0, (c.zMin + c.zMax) / 2);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/** One glazed panel, `w` by `d` metres, centred on (cx, cz), recessed
 *  into a ceiling at `ceilingY` that has a hole of the same size. */
export function Laylight({
  cx,
  cz,
  ceilingY,
  w,
  d,
  reveal,
  room,
  fixture = fixtureMaterial,
}: {
  cx: number;
  cz: number;
  ceilingY: number;
  w: number;
  d: number;
  /** Plaster of the recess's sides: the ceiling's own material. */
  reveal: THREE.Material;
  /** The room's footprint. A side of the panel on its edge gets no
   *  reveal, since the wall stands there. */
  room?: Rect;
  /** Bronze of the frame. A room passes its own, lit as the room is
   *  (room-light.ts). */
  fixture?: THREE.Material;
}) {
  const glass = useMemo(() => {
    if (w <= 0 || d <= 0) return null;
    const g = new THREE.PlaneGeometry(w, d);
    const nx = Math.max(1, Math.round(w / PANE_M));
    const nz = Math.max(1, Math.round(d / PANE_M));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * nx, uv.getY(i) * nz);
    uv.needsUpdate = true;
    return g;
  }, [w, d]);
  useEffect(() => () => glass?.dispose(), [glass]);

  // Bronze frame round the panel, at the top of the recess: four bars
  // in one geometry. The outer half of each bar is in the plenum.
  const frame = useMemo(() => {
    if (w <= 0 || d <= 0) return null;
    const bars = (
      [
        [0, -d / 2, w + FRAME_WIDTH * 2, FRAME_WIDTH],
        [0, d / 2, w + FRAME_WIDTH * 2, FRAME_WIDTH],
        [-w / 2, 0, FRAME_WIDTH, d],
        [w / 2, 0, FRAME_WIDTH, d],
      ] as const
    ).map(([x, z, sx, sz]) => new THREE.BoxGeometry(sx, FRAME_DROP, sz).translate(x, 0, z));
    const merged = mergeGeometries(bars, false);
    for (const b of bars) b.dispose();
    return merged;
  }, [w, d]);
  useEffect(() => () => frame?.dispose(), [frame]);

  // The recess's four sides, each facing into the panel, from the
  // ceiling plane up to the glass. None on a wall line.
  const onWall = useMemo(() => {
    const near = (a: number, b: number | undefined) =>
      b !== undefined && Math.abs(a - b) < ON_WALL_M;
    return {
      west: near(cx - w / 2, room?.xMin),
      east: near(cx + w / 2, room?.xMax),
      north: near(cz - d / 2, room?.zMin),
      south: near(cz + d / 2, room?.zMax),
    };
  }, [cx, cz, w, d, room?.xMin, room?.xMax, room?.zMin, room?.zMax]);
  const sides = useMemo(() => {
    if (w <= 0 || d <= 0) return null;
    const parts: THREE.BufferGeometry[] = [];
    const side = (length: number, rotY: number, x: number, z: number) =>
      parts.push(
        new THREE.PlaneGeometry(length, RECESS_M).rotateY(rotY).translate(x, RECESS_M / 2, z),
      );
    // A PlaneGeometry faces +z; turned so each faces the panel's middle.
    if (!onWall.north) side(w, 0, 0, -d / 2);
    if (!onWall.south) side(w, Math.PI, 0, d / 2);
    if (!onWall.west) side(d, Math.PI / 2, -w / 2, 0);
    if (!onWall.east) side(d, -Math.PI / 2, w / 2, 0);
    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    return merged;
  }, [w, d, onWall]);
  useEffect(() => () => sides?.dispose(), [sides]);

  if (!glass || !frame) return null;
  return (
    <group position={[cx, ceilingY, cz]}>
      <mesh
        geometry={glass}
        material={getGlassMaterial()}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, RECESS_M, 0]}
      />
      <mesh
        geometry={frame}
        material={fixture}
        position={[0, RECESS_M - FRAME_DROP / 2, 0]}
        layers={UNREFLECTED_LAYER}
      />
      {sides && <mesh geometry={sides} material={reveal} layers={UNREFLECTED_LAYER} />}
    </group>
  );
}
