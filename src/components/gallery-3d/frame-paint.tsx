"use client";

// Paintwork on a frame's flat panels: what an artist drew on a frame he
// designed, laid over the gilt as a thin coat of paint. The moulding
// itself (reeds, panels, rabbet) is ordinary frame geometry; only the
// brushwork is here.
//
// One frame has it today: Franz von Stuck's for his Salome of 1906,
// pinned in frame-design.ts. He framed the picture as a temple front
// and painted the architecture on the gilt in a grey-blue: a fluted
// column on each pilaster, a pediment with a lunette over the canvas,
// and on the plinth two roundels either side of a tablet with the
// title. The drawing below follows the scan of the framed picture.
//
// Each panel is a CanvasTexture drawn once, at PX_PER_M, with the
// brush strokes seeded so every visit paints the same frame.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";
import type { FramePainting } from "@/lib/gallery-layout/frame-design";
import { STUCK_PANEL } from "@/lib/gallery-layout/frame-styles";
import { PAINTING_WALL_OFFSET } from "@/lib/gallery-layout/place-paintings";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { inRoomLight } from "./room-light";

const PX_PER_M = 3000;
/** Stuck's grey-blue, sRGB, as it reads on the scan beside the gilt. */
const PAINT = [142, 160, 164] as const;
/** The coat stands this far off the panel, so the two never z-fight. */
const COAT = 0.0004;

type Panel = {
  /** Centre and size in the frame's own space, metres. */
  x: number;
  y: number;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) => void;
};

/** A small seeded generator: the same strokes on every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const paint = (alpha: number) => `rgba(${PAINT[0]},${PAINT[1]},${PAINT[2]},${alpha})`;

/** A rectangle filled with vertical or horizontal dry-brush strokes. */
function streaks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  vertical: boolean,
  rand: () => number,
  alpha = 0.42,
): void {
  const across = vertical ? w : h;
  const n = Math.max(6, Math.round(across / 0.0016));
  for (let i = 0; i < n; i++) {
    const t = (i + rand() * 0.8) / n;
    ctx.strokeStyle = paint(alpha * (0.45 + 0.75 * rand()));
    ctx.lineWidth = 0.0009 + 0.0016 * rand();
    ctx.beginPath();
    if (vertical) {
      const sx = x + t * w;
      ctx.moveTo(sx, y + rand() * 0.004);
      ctx.lineTo(sx + (rand() - 0.5) * 0.002, y + h - rand() * 0.004);
    } else {
      const sy = y + t * h;
      ctx.moveTo(x + rand() * 0.004, sy);
      ctx.lineTo(x + w - rand() * 0.004, sy + (rand() - 0.5) * 0.002);
    }
    ctx.stroke();
  }
}

/** The painted border every panel has, just inside its edge. */
function border(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = paint(0.85);
  ctx.lineWidth = 0.0032;
  ctx.strokeRect(0.0034, 0.0034, w - 0.0068, h - 0.0068);
}

/** A pilaster: a Doric column, its shaft tapering toward the capital. */
function column(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  border(ctx, w, h);
  const cx = w / 2;
  const top = 0.012;
  // Abacus, echinus, necking.
  ctx.fillStyle = paint(0.5);
  ctx.fillRect(cx - 0.034, top, 0.068, 0.006);
  ctx.beginPath();
  ctx.moveTo(cx - 0.032, top + 0.006);
  ctx.lineTo(cx + 0.032, top + 0.006);
  ctx.lineTo(cx + 0.016, top + 0.02);
  ctx.lineTo(cx - 0.016, top + 0.02);
  ctx.closePath();
  ctx.fill();
  streaks(ctx, cx - 0.03, top + 0.007, 0.06, 0.012, false, rand, 0.35);
  ctx.strokeStyle = paint(0.8);
  ctx.lineWidth = 0.0018;
  for (const dy of [0.022, 0.025]) {
    ctx.beginPath();
    ctx.moveTo(cx - 0.015, top + dy);
    ctx.lineTo(cx + 0.015, top + dy);
    ctx.stroke();
  }
  // Shaft, 2.8 cm at the neck and 3.4 cm at the foot.
  const s0 = top + 0.027;
  const s1 = h - 0.016;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 0.014, s0);
  ctx.lineTo(cx + 0.014, s0);
  ctx.lineTo(cx + 0.017, s1);
  ctx.lineTo(cx - 0.017, s1);
  ctx.closePath();
  ctx.clip();
  streaks(ctx, cx - 0.018, s0, 0.036, s1 - s0, true, rand, 0.5);
  ctx.restore();
  ctx.strokeStyle = paint(0.75);
  ctx.lineWidth = 0.0016;
  ctx.beginPath();
  ctx.moveTo(cx - 0.014, s0);
  ctx.lineTo(cx - 0.017, s1);
  ctx.moveTo(cx + 0.014, s0);
  ctx.lineTo(cx + 0.017, s1);
  ctx.stroke();
  // Base.
  ctx.fillStyle = paint(0.55);
  ctx.fillRect(cx - 0.022, s1, 0.044, 0.004);
}

/** The pediment over the canvas: a low gable on an entablature, with a
 *  lunette under its apex. */
function pediment(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number): void {
  border(ctx, w, h);
  const eave = h * 0.6;
  // The entablature: a band of brushwork the width of the panel.
  streaks(ctx, 0.008, eave, w - 0.016, h * 0.28, false, rand, 0.38);
  ctx.strokeStyle = paint(0.8);
  ctx.lineWidth = 0.0024;
  ctx.beginPath();
  ctx.moveTo(0.008, eave);
  ctx.lineTo(w - 0.008, eave);
  ctx.stroke();
  // The gable: two strokes from the eaves to the apex.
  ctx.lineWidth = 0.0042;
  ctx.lineCap = "round";
  ctx.strokeStyle = paint(0.7);
  ctx.beginPath();
  ctx.moveTo(0.012, eave - 0.002);
  ctx.lineTo(w / 2, h * 0.12);
  ctx.lineTo(w - 0.012, eave - 0.002);
  ctx.stroke();
  // The lunette.
  ctx.lineWidth = 0.002;
  ctx.strokeStyle = paint(0.8);
  ctx.beginPath();
  ctx.moveTo(w * 0.3, eave - 0.004);
  ctx.quadraticCurveTo(w / 2, h * 0.12, w * 0.7, eave - 0.004);
  ctx.stroke();
}

/** The plinth: a roundel in a square at each end and, between them, a
 *  tablet with dovetailed ends that carries the title. */
function plinth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rand: () => number,
  title: string,
): void {
  border(ctx, w, h);
  const sq = h - 0.0068;
  ctx.strokeStyle = paint(0.85);
  ctx.lineWidth = 0.003;
  for (const x of [0.0034 + sq, w - 0.0034 - sq]) {
    ctx.beginPath();
    ctx.moveTo(x, 0.0034);
    ctx.lineTo(x, h - 0.0034);
    ctx.stroke();
  }
  for (const cx of [0.0034 + sq / 2, w - 0.0034 - sq / 2]) {
    const r = sq * 0.33;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, h / 2, r, 0, Math.PI * 2);
    ctx.clip();
    streaks(ctx, cx - r, h / 2 - r, 2 * r, 2 * r, true, rand, 0.45);
    ctx.restore();
    ctx.lineWidth = 0.0018;
    ctx.beginPath();
    ctx.arc(cx, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The dovetails: a triangle in each corner of the tablet.
  const x0 = 0.0034 + sq + 0.0015;
  const x1 = w - x0;
  const ear = h * 0.22;
  ctx.fillStyle = paint(0.6);
  for (const [x, dir] of [
    [x0, 1],
    [x1, -1],
  ] as const) {
    for (const [y, down] of [
      [0.0034, 1],
      [h - 0.0034, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * ear, y);
      ctx.lineTo(x + dir * ear, y + down * ear * 0.9);
      ctx.closePath();
      ctx.fill();
    }
  }
  // The title, in thin, widely spaced capitals.
  const px = h * 0.3;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1 / PX_PER_M, 1 / PX_PER_M);
  ctx.font = `400 ${Math.round(px * PX_PER_M)}px "Times New Roman", Times, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${Math.round(px * 0.35 * PX_PER_M)}px`;
  ctx.lineWidth = 0.0012 * PX_PER_M;
  ctx.strokeStyle = paint(0.85);
  ctx.strokeText(title, 0, 0);
  ctx.restore();
}

/** Stuck's four panels for a canvas of `w` × `h` metres, the moulding
 *  cut at `scale`. */
function stuckPanels(w: number, h: number, scale: number): Panel[] {
  const from = STUCK_PANEL.from * scale;
  const to = STUCK_PANEL.to * scale;
  const depth = to - from;
  const mid = (from + to) / 2;
  const across = w + 2 * to;
  return [
    { x: -(w / 2 + mid), y: 0, w: depth, h, draw: column },
    { x: w / 2 + mid, y: 0, w: depth, h, draw: column },
    { x: 0, y: h / 2 + mid, w: across, h: depth, draw: pediment },
    {
      x: 0,
      y: -(h / 2 + mid),
      w: across,
      h: depth,
      draw: (ctx, pw, ph, rand) => plinth(ctx, pw, ph, rand, "SALOME"),
    },
  ];
}

function panelTexture(panel: Panel, seed: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, Math.round(panel.w * PX_PER_M));
  canvas.height = Math.max(4, Math.round(panel.h * PX_PER_M));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(canvas.width / panel.w, canvas.height / panel.h);
    panel.draw(ctx, panel.w, panel.h, seeded(seed));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Paint, not gilding: matte, and dark where the gilt is bright. */
const coatBase = new THREE.MeshStandardMaterial({
  transparent: true,
  depthWrite: false,
  roughness: 0.9,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

export function FramePaint({
  painted,
  widthM,
  heightM,
  scale,
  palette,
}: {
  painted: FramePainting;
  widthM: number;
  heightM: number;
  scale: number;
  /** The room's palette, for its light. The debug sheet has none. */
  palette?: Palette;
}) {
  const parts = useMemo(() => {
    const panels = painted === "stuckSalome" ? stuckPanels(widthM, heightM, scale) : [];
    const z = STUCK_PANEL.z * scale - PAINTING_WALL_OFFSET + COAT;
    const lit = palette ? inRoomLight(coatBase, palette) : coatBase;
    return panels.map((panel, i) => {
      const material = lit.clone();
      material.map = panelTexture(panel, 1906 + i);
      return {
        key: i,
        position: [panel.x, panel.y, z] as [number, number, number],
        geometry: new THREE.PlaneGeometry(panel.w, panel.h),
        material,
      };
    });
  }, [painted, widthM, heightM, scale, palette]);
  useEffect(
    () => () => {
      for (const part of parts) {
        part.geometry.dispose();
        part.material.map?.dispose();
        part.material.dispose();
      }
    },
    [parts],
  );
  return (
    <>
      {parts.map((part) => (
        <mesh
          key={part.key}
          position={part.position}
          geometry={part.geometry}
          material={part.material}
          layers={UNREFLECTED_LAYER}
        />
      ))}
    </>
  );
}
