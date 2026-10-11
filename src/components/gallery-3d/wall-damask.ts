"use client";

// Silk damask for the walls of an era that is hung on one.
//
// A damask is woven in one colour. The figure is satin and the ground is
// matt, so the pattern is not a second colour but a difference in sheen
// that comes and goes as the viewer moves. It is therefore drawn as a
// roughness map and nothing else: no colour map, no normal map, and no
// occlusion, which is what made the photographed wall textures look
// wrong round the frames (see palette-materials.ts). On a deep wall the
// 4% the surface reflects of the room is a large part of what reaches
// the eye, so a change in roughness alone is enough to read.
//
// The tile is one repeat of an ogee lattice in half-drop: a palmette at
// the tile's centre line top and bottom, and the same palmette half a
// repeat down on the side edges. Drawn on a 2-D canvas, so it re-uploads
// by itself after the Canvas remounts on a lost WebGL context.

import * as THREE from "three";

/** Size of one repeat on the wall, metres. On the small side for a
 *  damask: the Wallace Collection's is described as small-patterned,
 *  and a large figure competes with the works hung on it. */
export const DAMASK_REPEAT_M: [number, number] = [0.46, 0.69];

const W = 512;
const H = 768;
/** Green channel is what three.js reads as roughness, times the
 *  material's own scalar. */
const GROUND = 255;
const FIGURE = 138;

function grey(v: number): string {
  return `rgb(${v},${v},${v})`;
}

/** One side of the palmette, in units of the tile width, x ≥ 0, y down.
 *  The caller mirrors it. */
function drawHalfMotif(ctx: CanvasRenderingContext2D) {
  // Central bud, with a ground-coloured eye left open in it.
  ctx.beginPath();
  ctx.moveTo(0, -0.5);
  ctx.bezierCurveTo(0.05, -0.4, 0.17, -0.3, 0.15, -0.16);
  ctx.bezierCurveTo(0.13, -0.05, 0.05, 0.0, 0, 0.04);
  ctx.closePath();
  ctx.fill();

  // Upper leaf, curling out and back toward the bud.
  ctx.beginPath();
  ctx.moveTo(0.03, 0.06);
  ctx.bezierCurveTo(0.16, 0.02, 0.3, -0.08, 0.31, -0.24);
  ctx.bezierCurveTo(0.32, -0.33, 0.25, -0.37, 0.21, -0.31);
  ctx.bezierCurveTo(0.26, -0.3, 0.26, -0.22, 0.21, -0.17);
  ctx.bezierCurveTo(0.17, -0.1, 0.1, -0.02, 0.03, 0.06);
  ctx.closePath();
  ctx.fill();

  // Lower leaf, sweeping down and out.
  ctx.beginPath();
  ctx.moveTo(0.02, 0.1);
  ctx.bezierCurveTo(0.14, 0.1, 0.3, 0.14, 0.38, 0.28);
  ctx.bezierCurveTo(0.42, 0.36, 0.36, 0.42, 0.31, 0.37);
  ctx.bezierCurveTo(0.35, 0.34, 0.32, 0.27, 0.26, 0.24);
  ctx.bezierCurveTo(0.18, 0.2, 0.09, 0.2, 0.02, 0.22);
  ctx.closePath();
  ctx.fill();

  // Pendant under the leaves.
  ctx.beginPath();
  ctx.moveTo(0, 0.27);
  ctx.bezierCurveTo(0.07, 0.33, 0.09, 0.43, 0, 0.55);
  ctx.closePath();
  ctx.fill();

  // Small flower in the leaf's hollow.
  ctx.beginPath();
  ctx.arc(0.2, 0.08, 0.035, 0, Math.PI * 2);
  ctx.fill();
}

function drawMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  for (const side of [1, -1]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(side * W, W);
    ctx.fillStyle = grey(FIGURE);
    drawHalfMotif(ctx);
    ctx.restore();
  }
  // Eye of the bud and the vein of the pendant, back in ground.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(W, W);
  ctx.fillStyle = grey(GROUND);
  ctx.beginPath();
  ctx.moveTo(0, -0.36);
  ctx.bezierCurveTo(0.07, -0.27, 0.07, -0.16, 0, -0.08);
  ctx.bezierCurveTo(-0.07, -0.16, -0.07, -0.27, 0, -0.36);
  ctx.fill();
  ctx.fillStyle = grey(FIGURE);
  ctx.beginPath();
  ctx.arc(0, -0.21, 0.028, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The ogee lattice: two ribbons that swing from the side edges to the
 *  centre line and back once per repeat. */
function drawLattice(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = grey(FIGURE);
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  for (const side of [1, -1]) {
    ctx.beginPath();
    for (let y = -8; y <= H + 8; y += 4) {
      const swing = (W / 4) * (1 - Math.cos((2 * Math.PI * y) / H));
      const x = side === 1 ? swing : W - swing;
      if (y === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // A bead where the ribbons cross and where they meet the next tile.
  ctx.fillStyle = grey(FIGURE);
  for (const [x, y] of [
    [W / 2, H / 2],
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintDamask(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = grey(GROUND);
  ctx.fillRect(0, 0, W, H);
  drawLattice(ctx);
  // Half-drop: the cells centred on the top and bottom edge, and the
  // cells centred half a repeat down on the side edges. Each is drawn
  // on both edges it straddles so the tile wraps.
  const scale = 0.78;
  for (const [cx, cy] of [
    [W / 2, 0],
    [W / 2, H],
    [0, H / 2],
    [W, H / 2],
  ]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    drawMotif(ctx, cx, cy);
    ctx.restore();
  }
  return canvas;
}

let texture: THREE.CanvasTexture | null = null;

/** Roughness map for a damask wall. One texture for the whole building. */
export function getDamaskRoughnessMap(): THREE.CanvasTexture {
  if (texture) return texture;
  texture = new THREE.CanvasTexture(paintDamask());
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  // Wall UVs are in metres (wall.tsx), so the repeat is tiles per metre.
  texture.repeat.set(1 / DAMASK_REPEAT_M[0], 1 / DAMASK_REPEAT_M[1]);
  return texture;
}
