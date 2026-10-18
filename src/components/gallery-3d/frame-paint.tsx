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
// Each panel is drawn twice into canvases at PX_PER_M, its brush strokes
// seeded so every visit paints the same frame: once in colour, once as
// roughness and metal (green and blue, as three reads them). The gilt is
// metal with long streaks of a sanded ground in it, as on the scan; the
// paint is neither metal nor polished.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";
import type { FramePainting } from "@/lib/gallery-layout/frame-design";
import { STUCK_PANEL } from "@/lib/gallery-layout/frame-styles";
import { PAINTING_WALL_OFFSET } from "@/lib/gallery-layout/place-paintings";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { paintedGiltFor } from "./frame-materials";
import { litByRoom, releaseRoomLight } from "./room-light";
import { staticTransform } from "./static-transform";

const PX_PER_M = 3000;
/** Stuck's grey-blue, sRGB: a thin coat, so on the scan it reads with
 *  the gilt through it as a grey-green (median 118 125 77 where densest). */
const PAINT = [118, 130, 104] as const;
/** The painted panel lies this far over the moulding's own flat, so the
 *  two never z-fight. */
const COAT = 0.0004;
/** The gilt, sRGB: the finish's colour (FINISHES.stuckGilt). */
const GOLD = [250, 202, 84] as const;
/** Roughness of the gilt between its streaks, and of the paint. */
const GILT_ROUGH = 0.4;
const PAINT_ROUGH = 0.85;

/** Which canvas is being drawn: what a stroke of paint writes. */
let pass: "colour" | "surface" = "colour";

type Panel = {
  /** Centre and size in the frame's own space, metres. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The gilt was laid and sanded along the panel's long side. */
  vertical: boolean;
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

const paint = (alpha: number) =>
  pass === "colour"
    ? `rgba(${PAINT[0]},${PAINT[1]},${PAINT[2]},${alpha})`
    : `rgba(0,${Math.round(PAINT_ROUGH * 255)},0,${alpha})`;

/** The gilt ground of a panel: the leaf, sanded in long streaks that
 *  run along the panel, a little lighter, darker, duller or brighter
 *  each. */
function gild(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vertical: boolean,
  rand: () => number,
): void {
  const rough = Math.round(GILT_ROUGH * 255);
  ctx.fillStyle = pass === "colour" ? `rgb(${GOLD.join(",")})` : `rgb(0,${rough},255)`;
  ctx.fillRect(0, 0, w, h);
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  // Clouds first: the leaf lies in sheets a few centimetres across,
  // each a shade off the next.
  for (let i = 0; i < Math.round((w * h) / 0.0006); i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 0.01 + 0.03 * rand();
    const shade = (rand() - 0.5) * 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const c =
      pass === "colour"
        ? GOLD.map((v) => Math.round(Math.min(255, v * (1 + 0.12 * shade))))
        : [0, Math.round(Math.min(1, Math.max(0.15, GILT_ROUGH + 0.12 * shade)) * 255), 255];
    g.addColorStop(0, `rgba(${c.join(",")},0.35)`);
    g.addColorStop(1, `rgba(${c.join(",")},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  const n = Math.round(across / 0.0009);
  for (let i = 0; i < n; i++) {
    const t = rand() * across;
    const from = rand() * along * 0.6;
    const len = along * (0.3 + 0.7 * rand());
    const shade = (rand() - 0.5) * 2;
    ctx.lineWidth = 0.0006 + 0.003 * rand();
    const alpha = rand();
    if (pass === "colour") {
      // Lighter streaks keep the gold's hue; darker ones lose blue first,
      // toward the brown of the bole showing through.
      const k = 1 + 0.2 * shade;
      const c = GOLD.map((v, j) =>
        Math.round(Math.min(255, v * (j === 2 && shade < 0 ? 1 + 0.6 * shade : k))),
      );
      ctx.strokeStyle = `rgba(${c.join(",")},${0.15 + 0.35 * alpha})`;
    } else {
      // Sanded streaks are duller, burnished ones brighter.
      const r = Math.round(Math.min(1, Math.max(0.12, GILT_ROUGH + 0.22 * shade)) * 255);
      ctx.strokeStyle = `rgba(0,${r},255,${0.3 + 0.4 * alpha})`;
    }
    const wobble = (rand() - 0.5) * 0.003;
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(t, from);
      ctx.lineTo(t + wobble, from + len);
    } else {
      ctx.moveTo(from, t);
      ctx.lineTo(from + len, t + wobble);
    }
    ctx.stroke();
  }
}

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
    { x: -(w / 2 + mid), y: 0, w: depth, h, vertical: true, draw: column },
    { x: w / 2 + mid, y: 0, w: depth, h, vertical: true, draw: column },
    { x: 0, y: h / 2 + mid, w: across, h: depth, vertical: false, draw: pediment },
    {
      x: 0,
      y: -(h / 2 + mid),
      w: across,
      h: depth,
      vertical: false,
      draw: (ctx, pw, ph, rand) => plinth(ctx, pw, ph, rand, "SALOME"),
    },
  ];
}

function panelTexture(panel: Panel, seed: number, which: typeof pass): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(4, Math.round(panel.w * PX_PER_M));
  canvas.height = Math.max(4, Math.round(panel.h * PX_PER_M));
  const ctx = canvas.getContext("2d");
  if (ctx) {
    pass = which;
    ctx.scale(canvas.width / panel.w, canvas.height / panel.h);
    // The same seeds in both passes: every stroke lands in both canvases.
    gild(ctx, panel.w, panel.h, panel.vertical, seeded(seed * 7 + 1));
    panel.draw(ctx, panel.w, panel.h, seeded(seed));
    pass = "colour";
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = which === "colour" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  // The panel's uv is in metres, as a frame's is (frame-materials.ts).
  texture.repeat.set(1 / panel.w, 1 / panel.h);
  return texture;
}

/** A panel quad with what the frames' shader patch reads: uv in metres,
 *  a white vertex colour, and `aFrame` (roughness 1, no carving, no
 *  wear, fully open). */
function panelGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  const n = g.getAttribute("position").count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  g.setAttribute(
    "aFrame",
    new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [1, 0, 0, 1]).flat(), 4),
  );
  g.setAttribute("aCarveUv", new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2));
  return g;
}

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
    return panels.map((panel, i) => {
      const material = paintedGiltFor();
      material.map = panelTexture(panel, 1906 + i, "colour");
      const surface = panelTexture(panel, 1906 + i, "surface");
      material.roughnessMap = surface;
      material.metalnessMap = surface;
      if (palette) litByRoom(material, palette, "highlight");
      return {
        key: i,
        position: [panel.x, panel.y, z] as [number, number, number],
        geometry: panelGeometry(panel.w, panel.h),
        material,
      };
    });
  }, [painted, widthM, heightM, scale, palette]);
  useEffect(
    () => () => {
      for (const part of parts) {
        part.geometry.dispose();
        part.material.map?.dispose();
        part.material.roughnessMap?.dispose();
        releaseRoomLight(part.material);
        part.material.dispose();
      }
    },
    [parts],
  );
  return (
    <>
      {parts.map((part) => (
        <mesh
          {...staticTransform}
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
