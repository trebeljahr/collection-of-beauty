"use client";

// Laylight: the glazed ceiling panel of a picture gallery. A flat cream
// ceiling filled the top third of every view with nothing, and gave the
// room's soft fill light no visible source. This is a frosted-glass
// panel set in the ceiling, divided by glazing bars, glowing as if lit
// by daylight above it.
//
// It is drawn, not lit: a MeshBasicMaterial with a small tiling pane
// texture. The room's fill still comes from the environment map, so the
// panel costs two draw calls a room (glass, frame) and no shader work
// on the walls.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fixtureMaterial } from "./palette-materials";

/** Target pane size, metres. The grid is fitted so whole panes span the
 *  panel in both directions. */
const PANE_M = 1.25;
/** Clear ceiling left between the panel and the walls. The picture
 *  lights hang in this margin (LIGHT_MAX_THROW is 2.0 m). */
const MARGIN_M = 2.6;
/** A room narrower than this in either direction gets no laylight. */
const MIN_PANEL_M = 2.4;
/** How far the panel and its frame hang below the ceiling plane. */
const PANEL_DROP = 0.012;
const FRAME_WIDTH = 0.09;
const FRAME_DROP = 0.05;

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

/** Panel size for a room, or null when the room is too small. */
export function laylightSize(width: number, depth: number): { w: number; d: number } | null {
  const w = width - 2 * MARGIN_M;
  const d = depth - 2 * MARGIN_M;
  if (w < MIN_PANEL_M || d < MIN_PANEL_M) return null;
  return { w, d };
}

export function Laylight({
  cx,
  cz,
  ceilingY,
  width,
  depth,
}: {
  cx: number;
  cz: number;
  ceilingY: number;
  width: number;
  depth: number;
}) {
  const size = laylightSize(width, depth);
  const w = size?.w ?? 0;
  const d = size?.d ?? 0;

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

  // Bronze frame round the panel: four bars in one geometry.
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

  if (!glass || !frame) return null;
  return (
    <group position={[cx, ceilingY, cz]}>
      <mesh
        geometry={glass}
        material={getGlassMaterial()}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, -PANEL_DROP, 0]}
      />
      <mesh geometry={frame} material={fixtureMaterial} position={[0, -FRAME_DROP / 2, 0]} />
    </group>
  );
}
