// Procedural surface maps for picture frames.
//
// A swept moulding with one flat colour reads as extruded plastic at
// arm's length. What makes a real frame is on its surface: gold leaf
// laid in squares over cracked gesso, ornament carved along the
// moulding, grain that follows each rail, lacquer that has crazed.
// Those are generated here, once per page, as small tiling textures
// shared by every frame of a kind. Nothing is downloaded.
//
// Two kinds of map:
//   - surface maps (leaf, grain, lacquer, silk, paper) tile in both
//     directions and are read with the frame's uv in metres: u along
//     the rail, v along the profile;
//   - the carve atlas holds one row per ornament band. A frame's second
//     uv set points each carved stretch of its profile at its row
//     (frame-geometry.ts).
//
// The pixel generators are plain functions over typed arrays so they
// can be tested without a GPU. Textures are DataTextures: three uploads
// them again by itself after the Canvas is remounted for a lost
// context, so they need no per-renderer cache.

import * as THREE from "three";
import type { CarveBand } from "@/lib/gallery-layout/frame-profiles";

// ── Noise ─────────────────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number) => x - Math.floor(x);
/** Distance from `u` to `c` on a circle of circumference 1. */
const wrapDist = (u: number, c: number) => {
  const d = Math.abs(fract(u - c));
  return d > 0.5 ? 1 - d : d;
};

/** Value noise on a `cellsX` × `cellsY` lattice that wraps at both
 *  edges, sampled into `w` × `h`. Values in 0..1. */
export function tileNoise(
  w: number,
  h: number,
  cellsX: number,
  cellsY: number,
  seed: number,
): Float32Array {
  const r = rng(seed);
  const lattice = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < lattice.length; i++) lattice[i] = r();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * cellsY;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cellsY) * cellsX;
    const y1 = ((iy + 1) % cellsY) * cellsX;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * cellsX;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cellsX;
      const x1 = (ix + 1) % cellsX;
      const a = lattice[y0 + x0] + (lattice[y0 + x1] - lattice[y0 + x0]) * sx;
      const b = lattice[y1 + x0] + (lattice[y1 + x1] - lattice[y1 + x0]) * sx;
      out[y * w + x] = a + (b - a) * sy;
    }
  }
  return out;
}

/** Sum of `octaves` of tileNoise, each twice as fine and half as
 *  strong. Values in 0..1. */
export function tileFbm(
  w: number,
  h: number,
  cellsX: number,
  cellsY: number,
  octaves: number,
  seed: number,
): Float32Array {
  const out = new Float32Array(w * h);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const layer = tileNoise(w, h, cellsX << o, cellsY << o, seed + o * 101);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Cracks between the cells of a jittered lattice that wraps at both
 *  edges: 1 on a cell boundary, falling to 0 over `width` pixels. */
export function tileCracks(
  w: number,
  h: number,
  cellsX: number,
  cellsY: number,
  width: number,
  seed: number,
): Float32Array {
  const r = rng(seed);
  const px = new Float32Array(cellsX * cellsY);
  const py = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < px.length; i++) {
    px[i] = 0.15 + 0.7 * r();
    py[i] = 0.15 + 0.7 * r();
  }
  const out = new Float32Array(w * h);
  const cw = w / cellsX;
  const ch = h / cellsY;
  for (let y = 0; y < h; y++) {
    const cy = Math.floor(y / ch);
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(x / cw);
      let d1 = 1e9;
      let d2 = 1e9;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i;
          const gy = cy + j;
          const k = ((gy + cellsY) % cellsY) * cellsX + ((gx + cellsX) % cellsX);
          const dx = (gx + px[k]) * cw - x;
          const dy = (gy + py[k]) * ch - y;
          const d = Math.hypot(dx, dy);
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      // Half the gap between the two nearest sites is the distance to
      // their shared boundary, near enough for a hairline.
      out[y * w + x] = sat(1 - (d2 - d1) / 2 / width);
    }
  }
  return out;
}

/**
 * Height field to tangent-space normal map (RGBA, +Y up). `slopeX` and
 * `slopeY` turn a height difference of 1 between neighbouring texels
 * into a surface slope, so a map whose texels are not square in the
 * world still gets true angles. Wraps in x; in y only when `wrapY`.
 */
export function heightToNormal(
  height: Float32Array,
  w: number,
  h: number,
  slopeX: number,
  slopeY: number,
  wrapY: boolean,
  maxSlope = 2.4,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = wrapY ? (y + 1) % h : Math.min(h - 1, y + 1);
    const yd = wrapY ? (y + h - 1) % h : Math.max(0, y - 1);
    for (let x = 0; x < w; x++) {
      const xr = (x + 1) % w;
      const xl = (x + w - 1) % w;
      let sx = ((height[y * w + xr] - height[y * w + xl]) / 2) * slopeX;
      let sy = ((height[yu * w + x] - height[yd * w + x]) / 2) * slopeY;
      const s = Math.hypot(sx, sy);
      if (s > maxSlope) {
        sx *= maxSlope / s;
        sy *= maxSlope / s;
      }
      const l = Math.hypot(sx, sy, 1);
      const i = (y * w + x) * 4;
      out[i] = Math.round((-sx / l) * 127.5 + 127.5);
      out[i + 1] = Math.round((-sy / l) * 127.5 + 127.5);
      out[i + 2] = Math.round((1 / l) * 127.5 + 127.5);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Directions and steps of the horizon search in heightToOcclusion. */
const AO_DIRECTIONS = 8;
const AO_STEPS = 5;

/**
 * Ambient occlusion of a height field: at each texel, the share of the
 * sky above it that the relief round it hides. Each of eight directions
 * is marched out to `radius` for the steepest rise; a rise of slope s
 * hides s / √(1 + s²) of that direction's sky. `texelX`, `texelY`,
 * `depth` (the height of a height difference of 1) and `radius` are in
 * one unit, so a map whose texels are not square still gets true
 * angles. Wraps in x; in y only when `wrapY`. Values in 0..1, 1 open.
 */
export function heightToOcclusion(
  height: Float32Array,
  w: number,
  h: number,
  texelX: number,
  texelY: number,
  depth: number,
  radius: number,
  wrapY: boolean,
): Float32Array {
  // Texel offsets of every step, and the slope a unit rise there makes.
  const steps: Array<{ dx: number; dy: number; k: number; dir: number }> = [];
  for (let d = 0; d < AO_DIRECTIONS; d++) {
    const a = (d / AO_DIRECTIONS) * 2 * Math.PI;
    let last = "";
    for (let s = 1; s <= AO_STEPS; s++) {
      const r = (radius * s) / AO_STEPS;
      const dx = Math.round((Math.cos(a) * r) / texelX);
      const dy = Math.round((Math.sin(a) * r) / texelY);
      const key = `${dx},${dy}`;
      if ((dx === 0 && dy === 0) || key === last) continue;
      last = key;
      steps.push({ dx, dy, k: depth / Math.hypot(dx * texelX, dy * texelY), dir: d });
    }
  }
  const out = new Float32Array(w * h);
  // A row at a time, step by step: the inner loop is a straight run
  // along two rows of the field. It is built on the main thread.
  const rise = new Float32Array(w * AO_DIRECTIONS);
  for (let y = 0; y < h; y++) {
    rise.fill(0);
    const row = y * w;
    for (const { dx, dy, k, dir } of steps) {
      let yy = y + dy;
      if (wrapY) yy = (yy + h) % h;
      else if (yy < 0) yy = 0;
      else if (yy >= h) yy = h - 1;
      const other = yy * w;
      const shift = ((dx % w) + w) % w;
      for (let x = 0; x < w; x++) {
        let xx = x + shift;
        if (xx >= w) xx -= w;
        const slope = (height[other + xx] - height[row + x]) * k;
        const r = x * AO_DIRECTIONS + dir;
        if (slope > rise[r]) rise[r] = slope;
      }
    }
    for (let x = 0; x < w; x++) {
      let hidden = 0;
      for (let d = 0; d < AO_DIRECTIONS; d++) {
        const s = rise[x * AO_DIRECTIONS + d];
        hidden += s / Math.sqrt(1 + s * s);
      }
      out[row + x] = 1 - hidden / AO_DIRECTIONS;
    }
  }
  return out;
}

// ── Carve atlas ───────────────────────────────────────────────────────

export const CARVE_ATLAS_W = 512;
export const CARVE_ATLAS_H = 1536;
/** Texels of each row's own edge repeated above and below it, so
 *  filtering never reads a neighbouring ornament. */
const ROW_PAD = 3;

type BandSpec = {
  /** Row height in texels. */
  rows: number;
  /** Periods of the ornament across the atlas width. */
  repeats: number;
  /** Length of one period over the width of the band it is carved on. */
  aspect: number;
  /** Depth of the carving over the width of the band. */
  relief: number;
  /** Height 0..1 at `u` (one period, 0..1) and `v` (across the band,
   *  0 at the sight side). */
  height: (u: number, v: number) => number;
};

// Ornaments. Each is symmetric enough at u = 0 that the two halves of a
// rail, which run mirrored from the corners to the centre, meet cleanly.
const BANDS: Record<CarveBand, BandSpec> = {
  // Leaf and dart on an ogee: tongue-shaped leaves with a raised edge
  // and a centre rib, a dart in each gap. Bold shapes, so the outline
  // still reads from across a room.
  leaf: {
    rows: 104,
    repeats: 2,
    aspect: 0.85,
    relief: 0.12,
    height: (u, v) => {
      const x = u - 0.5;
      const taper =
        v < 0.5
          ? Math.sin(((0.12 + (0.88 * v) / 0.5) * Math.PI) / 2) ** 0.7
          : Math.cos((((v - 0.5) / 0.47) * Math.PI) / 2) ** 0.6;
      const w = v < 0.97 ? 0.43 * taper : 0;
      if (w > 1e-3 && Math.abs(x) < w) {
        const fromEdge = 1 - Math.abs(x) / w;
        const rim = smooth(0, 0.2, fromEdge);
        const dish = smooth(0.2, 0.5, fromEdge) * (1 - smooth(0.55, 0.9, fromEdge));
        const rib =
          Math.exp(-((x / 0.04) ** 2)) * smooth(0.06, 0.3, v) * (1 - smooth(0.8, 0.97, v));
        return 0.3 + 0.6 * rim - 0.16 * dish + 0.14 * rib;
      }
      const d = wrapDist(u, 0);
      const wd = 0.05 * (1 - 0.5 * v);
      return d < wd && v > 0.1 && v < 0.92 ? 0.5 * (1 - (d / wd) ** 2) : 0;
    },
  },
  // Egg and dart on an ovolo: v = 0 is the top of the moulding.
  eggDart: {
    rows: 88,
    repeats: 2,
    aspect: 1,
    relief: 0.13,
    height: (u, v) => {
      const ex = (u - 0.5) / (0.3 * (1 - 0.25 * v));
      const ey = (v - 0.5) / 0.43;
      const e = 1 - ex * ex - ey * ey;
      let h = 0;
      if (e > 0) {
        h = 0.2 + 0.8 * Math.sqrt(e);
      } else {
        // The shell: a raised rim that hugs the egg.
        const rim = (Math.sqrt(ex * ex + ey * ey) - 1.2) / 0.16;
        if (Math.abs(rim) < 1) h = 0.42 * (1 - rim * rim);
      }
      const d = wrapDist(u, 0);
      const wd = 0.028 + 0.075 * Math.max(0, 1 - Math.abs(v - 0.82) / 0.16);
      if (d < wd && v > 0.08) h = Math.max(h, 0.55 * (1 - d / wd));
      if (v < 0.06) h = Math.max(h, 0.5);
      return h;
    },
  },
  // Bay leaves laid like shingles in two staggered rows along a torus.
  // Large leaves and low relief: the torus is the frame's burnished
  // crown and should stay one broad highlight.
  laurel: {
    rows: 88,
    repeats: 2,
    aspect: 1.1,
    relief: 0.06,
    height: (u, v) => {
      let h = 0;
      for (let row = 0; row < 2; row++) {
        const t = (v - (0.27 + row * 0.46)) / 0.3;
        for (let k = -1; k <= 1; k++) {
          const s = (u - (k + row * 0.5 + 0.5)) / 1.35 + 0.5;
          if (s <= 0 || s >= 1) continue;
          const wl = Math.sin(Math.PI * s) ** 0.7 * (1 - 0.3 * s);
          if (Math.abs(t) >= wl) continue;
          const body = Math.sqrt(1 - (t / wl) ** 2);
          const leaf = (0.3 + 0.6 * s) * body + 0.1 * Math.exp(-((t / 0.12) ** 2)) * body;
          if (leaf > h) h = leaf;
        }
      }
      return h;
    },
  },
  // Punched and tooled frieze: rosettes, lozenges, dotted borders.
  punch: {
    rows: 88,
    repeats: 2,
    aspect: 1,
    relief: 0.03,
    height: (u, v) => {
      let h = 0.5;
      h -= 0.4 * Math.exp(-(((v - 0.07) / 0.012) ** 2));
      h -= 0.4 * Math.exp(-(((v - 0.93) / 0.012) ** 2));
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r = Math.hypot(dx, dy);
      const petal = 0.5 + 0.5 * Math.cos(6 * Math.atan2(dy, dx));
      const edge = 0.13 + 0.15 * petal;
      if (r < edge)
        h = Math.max(h, 0.55 + 0.45 * Math.sqrt(1 - (r / edge) ** 2) * (0.6 + 0.4 * petal));
      if (r < 0.05) h = 1;
      h -= 0.35 * Math.exp(-(((r - 0.37) / 0.012) ** 2));
      const m = wrapDist(u, 0) / 0.11 + Math.abs(dy) / 0.24;
      if (m < 1) h = Math.max(h, 0.5 + 0.4 * Math.sqrt(1 - m));
      const du = (fract(u * 8) - 0.5) / 8;
      for (const vb of [0.15, 0.85]) {
        const rr = Math.hypot(du, v - vb) / 0.024;
        if (rr < 1) h -= 0.45 * Math.sqrt(1 - rr * rr);
      }
      return h;
    },
  },
  // Rope twist on a bead: strands crossing at an angle.
  rope: {
    rows: 32,
    repeats: 8,
    aspect: 0.5,
    relief: 0.16,
    height: (u, v) => {
      const s = fract(u + 0.55 * (v - 0.5));
      return Math.sqrt(Math.max(0, 1 - ((s - 0.5) / 0.48) ** 2));
    },
  },
  // Pearls: a row of spheres on a bead. The bead is real geometry, so
  // only the roundness along the rail is in the map.
  pearl: {
    rows: 24,
    repeats: 8,
    aspect: 0.69,
    relief: 0.3,
    height: (u) => {
      const x = (u - 0.5) / 0.46;
      return Math.abs(x) < 1 ? Math.sqrt(1 - x * x) : 0;
    },
  },
  // Flutes cut across a hollow, stopped short of both edges.
  flute: {
    rows: 24,
    repeats: 8,
    aspect: 0.2,
    relief: 0.07,
    height: (u, v) => {
      const x = (u - 0.5) / 0.4;
      const ends = smooth(0.05, 0.16, v) * smooth(0.97, 0.86, v);
      return 1 - (Math.abs(x) < 1 ? Math.sqrt(1 - x * x) * ends : 0);
    },
  },
  // Dutch ripple: fine waves across the moulding.
  ripple: {
    rows: 16,
    repeats: 16,
    aspect: 0.3,
    relief: 0.06,
    height: (u) => 0.5 + 0.5 * Math.cos(2 * Math.PI * u),
  },
  // Acanthus leaves lying along the moulding, each over the root of the
  // next: a serrated outline, a centre rib, veins raking back from it.
  // They point along the rail, so the two halves of a rail meet tip to
  // tip at its centre, as carvers set them out.
  acanthus: {
    rows: 88,
    repeats: 2,
    aspect: 1.15,
    relief: 0.13,
    height: (u, v) => {
      let h = 0.08;
      for (let k = -1; k <= 0; k++) {
        const s = (u - k) / 1.3;
        if (s <= 0 || s >= 1) continue;
        const t = v - 0.5;
        const lobes = 0.8 + 0.2 * Math.abs(Math.sin(5 * Math.PI * s));
        const w = 0.47 * Math.sin(Math.PI * s) ** 0.55 * (1 - 0.3 * s) * lobes;
        if (Math.abs(t) >= w) continue;
        const across = Math.sqrt(1 - (t / w) ** 2);
        const rib = Math.exp(-((t / 0.045) ** 2)) * (1 - s);
        const vein = 0.5 + 0.5 * Math.cos(13 * Math.PI * (s - 0.75 * Math.abs(t)));
        const leaf = (0.3 + 0.55 * s) * across ** 0.7 + 0.14 * rib + 0.1 * vein * across;
        if (leaf > h) h = leaf;
      }
      return h;
    },
  },
  // Guilloche: two bands braided round a row of bosses.
  guilloche: {
    rows: 56,
    repeats: 4,
    aspect: 1.5,
    relief: 0.07,
    height: (u, v) => {
      const wave = 0.3 * Math.sin(2 * Math.PI * u);
      const over = Math.cos(2 * Math.PI * u) > 0;
      let h = 0.15;
      for (const [sign, top] of [
        [1, over],
        [-1, !over],
      ] as const) {
        const d = Math.abs(v - 0.5 - sign * wave) / 0.085;
        if (d < 1) h = Math.max(h, (top ? 0.95 : 0.7) * (0.55 + 0.45 * Math.sqrt(1 - d * d)));
      }
      for (const c of [0.25, 0.75]) {
        const r = Math.hypot((u - c) * 1.5, v - 0.5) / 0.13;
        if (r < 1) h = Math.max(h, 0.45 + 0.5 * Math.sqrt(1 - r * r));
      }
      if (v < 0.07 || v > 0.93) h = Math.max(h, 0.6);
      return h;
    },
  },
  // A shell between two scrolls: the cartouche a swept frame carries at
  // its corners and centres. One tile, symmetric about its middle; the
  // hinge is at the sight side.
  shell: {
    rows: 80,
    repeats: 4,
    aspect: 1.8,
    relief: 0.14,
    height: (u, v) => {
      const x = (u - 0.5) * 1.8;
      const y = v - 0.1;
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      let h = 0.12;
      if (y > 0 && a > 0.1 * Math.PI && a < 0.9 * Math.PI) {
        const rim = 0.8 - 0.05 * Math.cos(9 * a);
        if (r < rim) {
          const flutes = 0.72 + 0.28 * Math.cos(9 * a);
          h = 0.3 + 0.6 * (r / rim) ** 0.8 * flutes;
        }
      }
      if (r < 0.13) h = 0.5 + 0.45 * Math.sqrt(1 - (r / 0.13) ** 2);
      for (const side of [-1, 1]) {
        const d = Math.hypot(x - side * 0.66, v - 0.4);
        const ring = Math.abs(d - 0.17) / 0.055;
        if (ring < 1) h = Math.max(h, 0.4 + 0.5 * Math.sqrt(1 - ring * ring));
        if (d < 0.07) h = Math.max(h, 0.5 + 0.4 * Math.sqrt(1 - (d / 0.07) ** 2));
      }
      return h;
    },
  },
  // Imbrication: coin-shaped scales in three staggered rows.
  scale: {
    rows: 40,
    repeats: 8,
    aspect: 0.55,
    relief: 0.09,
    height: (u, v) => {
      let h = 0;
      for (let row = 0; row < 4; row++) {
        const cv = row * 0.33 - 0.08;
        const t = (v - cv) / 0.44;
        if (t < 0 || t > 1) continue;
        for (let k = -1; k <= 1; k++) {
          const x = (u - (k + 0.5 * (row % 2) + 0.5)) / 0.5;
          const d = Math.hypot(x, t);
          if (d >= 1) continue;
          // Each scale rises to its free edge and carries a rim there.
          const lift = 0.25 + 0.6 * t + 0.2 * smooth(0.78, 0.95, d);
          if (lift > h) h = lift;
        }
      }
      return h;
    },
  },
  // Greek key: a raised fret between two fillets. A base line runs
  // the length of the moulding and a square hook rises from it once a
  // period.
  meander: {
    rows: 36,
    repeats: 8,
    aspect: 1.2,
    relief: 0.05,
    height: (u, v) => {
      if (v < 0.08 || v > 0.92) return 1;
      const hook: Array<[number, number]> = [
        [0.15, 0.8],
        [0.15, 0.2],
        [0.85, 0.2],
        [0.85, 0.62],
        [0.48, 0.62],
        [0.48, 0.42],
        [0.66, 0.42],
      ];
      let d = Math.abs(v - 0.8);
      for (let i = 0; i < hook.length - 1; i++) {
        const [ax, ay] = hook[i];
        const [bx, by] = hook[i + 1];
        const t = sat(
          ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2),
        );
        // The band is `aspect` times longer than it is wide.
        d = Math.min(d, Math.hypot((u - ax - t * (bx - ax)) * 1.2, v - ay - t * (by - ay)));
      }
      return d < 0.055 ? 1 : 0.2 * smooth(0.11, 0.055, d);
    },
  },
  // Gadroons: fat slanted lobes, rounded off at both edges.
  gadroon: {
    rows: 36,
    repeats: 8,
    aspect: 0.5,
    relief: 0.2,
    height: (u, v) => {
      const x = (fract(u + 0.5 * (v - 0.5)) - 0.5) / 0.47;
      const ends = smooth(0, 0.2, v) * smooth(1, 0.82, v);
      return Math.abs(x) < 1 ? Math.sqrt(1 - x * x) * (0.25 + 0.75 * ends) : 0;
    },
  },
  // Ribbon and stick: a rod along the moulding with a ribbon wound
  // round it.
  ribbon: {
    rows: 36,
    repeats: 8,
    aspect: 0.9,
    relief: 0.14,
    height: (u, v) => {
      const t = v - 0.5;
      const stick = Math.abs(t) < 0.17 ? 0.55 * Math.sqrt(1 - (t / 0.17) ** 2) : 0;
      const s = fract(u + 0.95 * t);
      if (s > 0.12 && s < 0.6 && Math.abs(t) < 0.46) {
        const along = (s - 0.36) / 0.24;
        return Math.max(stick, 0.62 + 0.3 * Math.sqrt(1 - along * along) * (1 - (t / 0.46) ** 2));
      }
      return stick;
    },
  },
  // Bead and reel: a long bead between pairs of discs.
  beadReel: {
    rows: 24,
    repeats: 8,
    aspect: 1.5,
    relief: 0.3,
    height: (u) => {
      const bead = (u - 0.5) / 0.27;
      if (Math.abs(bead) < 1) return Math.sqrt(1 - bead * bead);
      let h = 0;
      for (const c of [0.1, 0.9]) {
        const reel = (u - c) / 0.055;
        if (Math.abs(reel) < 1) h = Math.max(h, 0.85 * Math.sqrt(1 - reel * reel));
      }
      return h;
    },
  },
  // Planished metal: the shallow dimples a hammer leaves.
  hammer: {
    rows: 32,
    repeats: 4,
    aspect: 1,
    relief: 0.03,
    height: (u, v) => {
      const G = 5;
      const gx = u * G;
      const gy = v * G;
      let nearest = 1e9;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = Math.floor(gx) + i;
          const cy = Math.floor(gy) + j;
          // Jitter from the cell, wrapped in u so the tile repeats.
          const key = (((cx % G) + G) % G) * 37 + cy * 101;
          const jx = fract(Math.sin(key * 12.9898) * 43758.5453);
          const jy = fract(Math.sin(key * 78.233) * 12543.531);
          nearest = Math.min(
            nearest,
            Math.hypot(cx + 0.2 + 0.6 * jx - gx, cy + 0.2 + 0.6 * jy - gy),
          );
        }
      }
      return smooth(0, 0.6, nearest);
    },
  },
  // Oak leaves with their lobed outline, an acorn between each pair,
  // lying along a torus like the laurel.
  oak: {
    rows: 72,
    repeats: 2,
    aspect: 1.25,
    relief: 0.08,
    height: (u, v) => {
      let h = 0.05;
      for (let row = 0; row < 2; row++) {
        const t = (v - (0.28 + row * 0.44)) / 0.3;
        for (let k = -1; k <= 1; k++) {
          const s = (u - (k + row * 0.5 + 0.5)) / 1.3 + 0.5;
          if (s <= 0 || s >= 1) continue;
          const lobes = 0.72 + 0.28 * Math.abs(Math.cos(4 * Math.PI * s));
          const wl = Math.sin(Math.PI * s) ** 0.6 * lobes;
          if (Math.abs(t) >= wl) continue;
          const body = Math.sqrt(1 - (t / wl) ** 2);
          const leaf = (0.3 + 0.5 * s) * body + 0.12 * Math.exp(-((t / 0.1) ** 2)) * body;
          if (leaf > h) h = leaf;
        }
      }
      // Acorns on the centre line, where the two rows of leaves part.
      const acorn = Math.hypot((fract(u + 0.25) - 0.5) / 0.09, (v - 0.5) / 0.13);
      if (acorn < 1) h = Math.max(h, 0.6 + 0.4 * Math.sqrt(1 - acorn * acorn));
      return h;
    },
  },
  // Water leaf: broad plain tongues with a sunk midrib, a shorter leaf
  // showing between each pair.
  waterleaf: {
    rows: 48,
    repeats: 4,
    aspect: 0.75,
    relief: 0.13,
    height: (u, v) => {
      const leaf = (x: number, length: number, lift: number) => {
        if (v >= length) return 0;
        const w = 0.49 * Math.sqrt(1 - (v / length) ** 2.4);
        if (Math.abs(x) >= w) return 0;
        const dome = Math.sqrt(1 - (x / w) ** 2);
        return lift * (0.45 + 0.55 * dome) * (1 - 0.35 * Math.exp(-((x / 0.05) ** 2)));
      };
      return Math.max(0.05, leaf(wrapDist(u, 0), 0.6, 0.55), leaf(u - 0.5, 0.97, 1));
    },
  },
  // Diaper: a trellis of raised bands with a boss in each lozenge.
  lattice: {
    rows: 48,
    repeats: 8,
    aspect: 1,
    relief: 0.05,
    height: (u, v) => {
      if (v < 0.06 || v > 0.94) return 0.9;
      const a = Math.abs(fract(u + v) - 0.5);
      const b = Math.abs(fract(u - v) - 0.5);
      if (Math.min(a, b) < 0.07) return 0.85;
      const boss = Math.hypot(fract(u + v) - 0.5, fract(u - v) - 0.5) / 0.16;
      return boss < 1 ? 0.3 + 0.5 * Math.sqrt(1 - boss * boss) : 0.3;
    },
  },
  // Husks: a chain of bellflowers, each a three-part drop, with a bead
  // between.
  husk: {
    rows: 40,
    repeats: 4,
    aspect: 1.6,
    relief: 0.14,
    height: (u, v) => {
      const t = v - 0.5;
      const s = u / 0.86;
      let h = 0.08;
      if (s < 1) {
        const w = 0.44 * Math.sin(Math.PI * s) ** 0.8 * (1 - 0.5 * s);
        if (Math.abs(t) < w) {
          const split = Math.exp(-(((Math.abs(t) - w / 3) / 0.035) ** 2));
          h = 0.3 + 0.6 * Math.sqrt(1 - (t / w) ** 2) - 0.22 * split * s;
        }
      }
      const bead = Math.hypot((u - 0.93) / 0.055, t / 0.09);
      if (bead < 1) h = Math.max(h, 0.4 + 0.5 * Math.sqrt(1 - bead * bead));
      return h;
    },
  },
  // Vitruvian scroll: a row of waves, each curling into the next.
  wave: {
    rows: 40,
    repeats: 4,
    aspect: 1.3,
    relief: 0.1,
    height: (u, v) => {
      if (v < 0.07 || v > 0.93) return 0.85;
      let h = 0.12;
      for (const shift of [-1, 0, 1]) {
        const x = (u - shift - 0.42) * 1.3;
        const y = v - 0.46;
        // The curl: a ring open at its lower right, where the tail of
        // the next wave runs in.
        const ring = Math.abs(Math.hypot(x, y) - 0.24) / 0.07;
        const open = Math.atan2(y, x) > 0.15 && Math.atan2(y, x) < 1.2;
        if (ring < 1 && !open) h = Math.max(h, 0.4 + 0.55 * Math.sqrt(1 - ring * ring));
        // The tail: from under the curl out along the base to the next.
        const along = (x - 0.1) / 0.75;
        if (along > 0 && along < 1) {
          const line = Math.abs(y - (0.3 - 0.52 * along * along)) / 0.065;
          if (line < 1) h = Math.max(h, 0.4 + 0.5 * Math.sqrt(1 - line * line));
        }
      }
      return h;
    },
  },
  // A rosette in a square: the patera on a corner block. One tile.
  rosette: {
    rows: 64,
    repeats: 8,
    aspect: 1,
    relief: 0.14,
    height: (u, v) => {
      const x = u - 0.5;
      const y = v - 0.5;
      if (Math.max(Math.abs(x), Math.abs(y)) > 0.43) return 0.75;
      const r = Math.hypot(x, y);
      if (r < 0.085) return 0.55 + 0.45 * Math.sqrt(1 - (r / 0.085) ** 2);
      const petal = 0.5 + 0.5 * Math.cos(8 * Math.atan2(y, x));
      const edge = 0.24 + 0.14 * petal;
      if (r < edge) return 0.35 + 0.5 * Math.sqrt(1 - (r / edge) ** 2) * (0.55 + 0.45 * petal);
      return 0.15;
    },
  },
  // Dentils: a row of square teeth under a cornice.
  dentil: {
    rows: 16,
    repeats: 16,
    aspect: 1.1,
    relief: 0.3,
    height: (u, v) => (u > 0.2 && u < 0.8 && v > 0.12 ? 1 : 0.1),
  },
  // The nodes of a bamboo cane: a ring with a waist either side.
  bamboo: {
    rows: 16,
    repeats: 4,
    aspect: 2.4,
    relief: 0.5,
    height: (u) => {
      const d = wrapDist(u, 0);
      return (
        0.5 + 0.5 * Math.exp(-((d / 0.022) ** 2)) - 0.3 * Math.exp(-(((d - 0.05) / 0.03) ** 2))
      );
    },
  },
};

export type CarveRow = {
  /** Row extent in the atlas's v, inside the padding. */
  v0: number;
  v1: number;
  repeats: number;
  aspect: number;
};

/** Where each band sits in the atlas. Pure arithmetic: the geometry
 *  builder reads this without generating a texel. */
export const CARVE_ROWS: Record<CarveBand, CarveRow> = (() => {
  const out = {} as Record<CarveBand, CarveRow>;
  let y = 0;
  for (const [name, spec] of Object.entries(BANDS) as Array<[CarveBand, BandSpec]>) {
    y += ROW_PAD;
    out[name] = {
      v0: (y + 0.5) / CARVE_ATLAS_H,
      v1: (y + spec.rows - 0.5) / CARVE_ATLAS_H,
      repeats: spec.repeats,
      aspect: spec.aspect,
    };
    y += spec.rows + ROW_PAD;
  }
  if (y > CARVE_ATLAS_H) throw new Error(`carve atlas rows need ${y} texels`);
  return out;
})();

/** How far round a texel the carving can shade it, in band widths. */
const CARVE_AO_RADIUS = 0.12;

/**
 * The carve atlas. A normal map alone embosses the ornament: every
 * facet turns to the light, but the ground between two leaves is as
 * bright as the leaves, and gilt mirrors the room just as well at the
 * bottom of a cut as on its rim. So each texel carries three things:
 *  - RG: the tangent-space normal's x and y. The shader rebuilds z.
 *  - B: the carving's height, 0 at its deepest and 1 at its highest
 *    point in the band. The leaf rubs through there first.
 *  - A: occlusion (heightToOcclusion). The cuts between leaves, the
 *    hollow of a shell, the shadow under a bead. Mipmapped, it
 *    averages to the darker tone a carved band has from across a room.
 */
export function buildCarveAtlas(): Uint8Array {
  const S = CARVE_ATLAS_W;
  const out = new Uint8Array(S * CARVE_ATLAS_H * 4);
  // Flat and open everywhere a band does not write.
  for (let i = 0; i < S * CARVE_ATLAS_H; i++) {
    out[i * 4] = 128;
    out[i * 4 + 1] = 128;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = 255;
  }
  let y = 0;
  for (const spec of Object.values(BANDS)) {
    const rows = spec.rows;
    const height = new Float32Array(S * rows);
    for (let j = 0; j < rows; j++) {
      const v = (j + 0.5) / rows;
      for (let x = 0; x < S; x++) {
        height[j * S + x] = spec.height(fract(((x + 0.5) / S) * spec.repeats), v);
      }
    }
    // One texel is (repeats · aspect / S) band-widths along the rail and
    // 1 / rows across it; the carving is `relief` band-widths deep.
    const texelX = (spec.repeats * spec.aspect) / S;
    const normals = heightToNormal(
      height,
      S,
      rows,
      spec.relief / texelX,
      spec.relief * rows,
      false,
    );
    const occlusion = heightToOcclusion(
      height,
      S,
      rows,
      texelX,
      1 / rows,
      spec.relief,
      CARVE_AO_RADIUS,
      false,
    );
    let low = Infinity;
    let high = -Infinity;
    for (const v of height) {
      if (v < low) low = v;
      if (v > high) high = v;
    }
    for (let i = 0; i < S * rows; i++) {
      normals[i * 4 + 2] = toByte((height[i] - low) / (high - low || 1));
      normals[i * 4 + 3] = toByte(occlusion[i]);
    }
    for (let j = -ROW_PAD; j < rows + ROW_PAD; j++) {
      const src = Math.min(rows - 1, Math.max(0, j)) * S * 4;
      out.set(normals.subarray(src, src + S * 4), (y + ROW_PAD + j) * S * 4);
    }
    y += rows + 2 * ROW_PAD;
  }
  return out;
}

// ── Surface maps ──────────────────────────────────────────────────────

type Pixels = { data: Uint8Array; width: number; height: number };

const toByte = (x: number) => Math.round(sat(x) * 255);

/** World size of one tile of each surface map, metres: [along, across]. */
export const TILE_M = {
  gilt: [0.36, 0.36],
  wood: [0.64, 0.16],
  lacquer: [0.18, 0.18],
  silk: [0.07, 0.07],
  weave: [0.02, 0.02],
  paper: [0.05, 0.05],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Water gilding. Returns three maps of the same tile:
 *  - `color`: a multiplier (linear) with the squares the leaf was laid
 *    in, their brighter overlaps and soft tarnish; alpha is a wear mask
 *    the shader thresholds on the high points to show the bole.
 *  - `rough`: roughness in G. Burnishing runs along the rail.
 *  - `normal`: the unevenness of hand-laid gesso and the age cracks
 *    that cross a gilded moulding.
 */
export function buildGiltMaps(): { color: Pixels; rough: Pixels; normal: Pixels } {
  const S = 256;
  const r = rng(17);
  const cloud = tileFbm(S, S, 4, 4, 3, 3);
  const fine = tileNoise(S, S, 64, 64, 4);
  const streak = tileFbm(S, S, 3, 40, 2, 8);
  const blot = tileNoise(S, S, 9, 9, 9);
  const wearNoise = tileFbm(S, S, 5, 14, 3, 12);
  // Fine grit over the broad wear patches: rubbed leaf goes in specks
  // and short streaks, never in a clean-edged blot.
  const wearGrit = tileNoise(S, S, 44, 96, 13);
  const undulate = tileFbm(S, S, 7, 7, 2, 15);
  // Cracks cross the rail: tall narrow cells, so most boundaries run
  // along v. A second noise breaks the network into separate cracks.
  const cracks = tileCracks(S, S, 14, 3, 1.1, 21);
  const crackGate = tileNoise(S, S, 5, 5, 22);

  const LEAVES = 4;
  const tone = Array.from({ length: LEAVES * LEAVES }, () => 0.93 + 0.05 * r());
  const color = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      // Leaf courses, each shifted half a leaf like brickwork.
      const row = Math.floor((y / S) * LEAVES);
      const lx = (x / S) * LEAVES + (row % 2) * 0.5;
      const col = Math.floor(lx) % LEAVES;
      const fx = fract(lx);
      const fy = fract((y / S) * LEAVES);
      const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
      // Where two leaves overlap the gold is double: a little brighter.
      const overlap = edge < 0.03 ? 1 : 0;
      const crack = cracks[i] * smooth(0.5, 0.66, crackGate[i]);
      const tarnish = 0.9 + 0.1 * cloud[i];
      let v = tone[row * LEAVES + col] * tarnish * (1 - 0.03 * fine[i]);
      v *= 1 + 0.035 * overlap;
      v *= 1 - 0.22 * crack;
      color[i * 4] = toByte(v);
      color[i * 4 + 1] = toByte(v * (0.975 + 0.025 * cloud[i]));
      color[i * 4 + 2] = toByte(v * (0.9 + 0.1 * cloud[i]));
      color[i * 4 + 3] = toByte(wearNoise[i] * 0.55 + 0.45 * wearGrit[i]);

      const rv = 0.56 + 0.26 * streak[i] + 0.12 * blot[i] + 0.04 * overlap + 0.5 * crack;
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = toByte(rv);
      rough[i * 4 + 3] = 255;

      height[i] = 0.8 * undulate[i] + 0.1 * fine[i] - 0.5 * crack;
    }
  }
  // 1.4 mm texels; the relief is a few tenths of a millimetre.
  const normal = heightToNormal(height, S, S, 0.32, 0.32, true);
  return {
    color: { data: color, width: S, height: S },
    rough: { data: rough, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

export type WoodSpec = {
  seed: number;
  /** Growth rings across the tile's width. */
  rings: number;
  /** How far the grain wanders, in rings. */
  wander: number;
  /** sRGB colours of the early and late wood, and of the open pores. */
  early: [number, number, number];
  late: [number, number, number];
  pore: [number, number, number];
  /** Share of the surface taken by pores. */
  porosity: number;
  /** Strength of the broad tonal figure. */
  figure: number;
};

/** Dark European walnut: fine, low-contrast grain with smoky streaks. */
export const WALNUT: WoodSpec = {
  seed: 31,
  rings: 44,
  wander: 2.4,
  early: [72, 47, 30],
  late: [38, 23, 14],
  pore: [22, 13, 8],
  porosity: 0.1,
  figure: 0.4,
};

/** Ash: pale, ring-porous, each ring a clear line. */
export const ASH: WoodSpec = {
  seed: 47,
  rings: 30,
  wander: 1.8,
  early: [214, 190, 148],
  late: [176, 143, 96],
  pore: [140, 108, 70],
  porosity: 0.16,
  figure: 0.2,
};

/**
 * Wood, grain along u. `color` is sRGB with a roughness multiplier in
 * alpha (the pores stay matte under a satin finish); `normal` carries
 * the pores as grooves and the late wood as low ridges.
 */
export function buildWoodMaps(spec: WoodSpec): { color: Pixels; normal: Pixels } {
  const W = 512;
  const H = 256;
  const warp = tileFbm(W, H, 2, 3, 3, spec.seed);
  const figure = tileFbm(W, H, 2, 2, 2, spec.seed + 1);
  const streak = tileFbm(W, H, 2, 14, 2, spec.seed + 2);
  // Pores: dashes a few millimetres long and a texel or two wide.
  const pores = tileNoise(W, H, 96, 128, spec.seed + 3);
  const fine = tileNoise(W, H, 128, 128, spec.seed + 4);
  const color = new Uint8Array(W * H * 4);
  const height = new Float32Array(W * H);
  const cut = 1 - spec.porosity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const f = fract((y / H) * spec.rings + spec.wander * warp[i]);
      // Each ring darkens toward its late wood, then starts again.
      const late = f * f * f;
      // Ring-porous: the pores crowd the early wood.
      const poreHere = pores[i] > cut + 0.12 * f ? 1 : 0;
      const shade =
        (1 + spec.figure * (figure[i] - 0.5)) *
        (1 - 0.35 * spec.figure * smooth(0.55, 0.8, streak[i]));
      for (let c = 0; c < 3; c++) {
        let v = spec.early[c] + (spec.late[c] - spec.early[c]) * late;
        v *= shade * (0.97 + 0.06 * fine[i]);
        if (poreHere) v = v * 0.35 + spec.pore[c] * 0.65;
        color[i * 4 + c] = Math.round(Math.min(255, Math.max(0, v)));
      }
      color[i * 4 + 3] = toByte(0.7 + 0.3 * poreHere + 0.08 * late);
      height[i] = 0.25 * late - 0.75 * poreHere + 0.1 * fine[i];
    }
  }
  // Texels are 1.25 mm along the grain and 0.6 mm across it.
  const normal = heightToNormal(height, W, H, 0.12, 0.25, true);
  return {
    color: { data: color, width: W, height: H },
    normal: { data: normal, width: W, height: H },
  };
}

/**
 * Polished lacquer. `normal` is the slight orange peel of a brushed
 * coat and a broken net of hairline cracks; `color` is a linear
 * multiplier with a roughness multiplier in alpha, so the polish is a
 * little cloudy and the cracks are matte.
 */
export function buildLacquerMaps(): { color: Pixels; normal: Pixels } {
  const S = 256;
  const peel = tileFbm(S, S, 28, 28, 2, 51);
  const haze = tileFbm(S, S, 3, 3, 3, 52);
  const cracks = tileCracks(S, S, 7, 7, 0.9, 53);
  const gate = tileFbm(S, S, 3, 3, 2, 54);
  const color = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const crack = cracks[i] * smooth(0.45, 0.62, gate[i]);
    const m = 0.9 + 0.1 * haze[i];
    color[i * 4] = color[i * 4 + 1] = color[i * 4 + 2] = toByte(m);
    color[i * 4 + 3] = toByte(0.62 + 0.3 * haze[i] + 0.6 * crack);
    height[i] = peel[i] - 1.6 * crack;
  }
  const normal = heightToNormal(height, S, S, 0.2, 0.2, true);
  return {
    color: { data: color, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

/**
 * Silk brocade for an East Asian mount: interlocked circles (shippō)
 * woven in a lighter, glossier thread. sRGB, roughness multiplier in
 * alpha. The frame maps hold one in grey: a mount's colour is its tint
 * (frame-design.ts), so every silk shares the texture.
 */
export function buildSilkMap(
  ground: [number, number, number],
  thread: [number, number, number],
): Pixels {
  const S = 256;
  const slub = tileNoise(S, S, 3, 96, 61);
  const data = new Uint8Array(S * S * 4);
  const P = S / 2;
  const radius = P * Math.SQRT1_2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // Distance to the nearest circle of the lattice.
      let line = 1e9;
      for (let j = -1; j <= 2; j++) {
        for (let k = -1; k <= 2; k++) {
          const d = Math.abs(Math.hypot(x - k * P, y - j * P) - radius);
          if (d < line) line = d;
        }
      }
      const dot = Math.hypot(fract(x / P + 0.5) - 0.5, fract(y / P + 0.5) - 0.5) * P;
      const pattern = Math.max(sat(1.6 - line / 2.2), sat(1.5 - dot / 3.5));
      const i = (y * S + x) * 4;
      const shade = 0.94 + 0.1 * slub[y * S + x];
      for (let c = 0; c < 3; c++) {
        data[i + c] = Math.round(
          Math.min(255, (ground[c] + (thread[c] - ground[c]) * pattern) * shade),
        );
      }
      data[i + 3] = toByte(1 - 0.38 * pattern);
    }
  }
  return { data, width: S, height: S };
}

/** Ground of the shared silk map. `SURFACE_BASE.silk` in frame-design.ts
 *  is the same grey: a silk's tint is its colour over this. */
export const SILK_GROUND: [number, number, number] = [200, 200, 200];
/** The figure's thread: a damask, woven a little lighter than its
 *  ground and glossier. In white the lattice was all a mount showed. */
const SILK_THREAD: [number, number, number] = [226, 226, 226];

/** Plain weave: the threads of silk, or of canvas on a stretcher edge. */
export function buildWeaveNormal(): Pixels {
  const S = 128;
  const N = 16;
  const slub = tileNoise(S, S, 4, 32, 71);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * N;
      const v = (y / S) * N;
      const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
      const warpH = Math.sin(Math.PI * fract(u)) * (over ? 1 : 0.45);
      const weftH = Math.sin(Math.PI * fract(v)) * (over ? 0.45 : 1);
      height[y * S + x] = Math.max(warpH, weftH) * (0.85 + 0.3 * slub[y * S + x]);
    }
  }
  return { data: heightToNormal(height, S, S, 1.1, 1.1, true), width: S, height: S };
}

/** Paper tooth for mat board. */
export function buildPaperNormal(): Pixels {
  const S = 128;
  const height = tileFbm(S, S, 24, 24, 2, 81);
  return { data: heightToNormal(height, S, S, 0.5, 0.5, true), width: S, height: S };
}

// ── Textures ──────────────────────────────────────────────────────────

function texture(
  pixels: Pixels,
  tile: readonly [number, number] | null,
  opts: { srgb?: boolean; clampV?: boolean } = {},
): THREE.DataTexture {
  const t = new THREE.DataTexture(pixels.data, pixels.width, pixels.height, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = opts.clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (tile) t.repeat.set(1 / tile[0], 1 / tile[1]);
  t.needsUpdate = true;
  return t;
}

export type FrameMaps = {
  carve: THREE.DataTexture;
  giltColor: THREE.DataTexture;
  giltRough: THREE.DataTexture;
  giltNormal: THREE.DataTexture;
  walnutColor: THREE.DataTexture;
  walnutNormal: THREE.DataTexture;
  ashColor: THREE.DataTexture;
  ashNormal: THREE.DataTexture;
  lacquerColor: THREE.DataTexture;
  lacquerNormal: THREE.DataTexture;
  silkColor: THREE.DataTexture;
  weaveNormal: THREE.DataTexture;
  paperNormal: THREE.DataTexture;
};

let maps: FrameMaps | null = null;

/** Every frame map, built on first call and kept for the page. */
export function getFrameMaps(): FrameMaps {
  if (maps) return maps;
  const gilt = buildGiltMaps();
  const walnut = buildWoodMaps(WALNUT);
  const ash = buildWoodMaps(ASH);
  const lacquer = buildLacquerMaps();
  maps = {
    carve: texture({ data: buildCarveAtlas(), width: CARVE_ATLAS_W, height: CARVE_ATLAS_H }, null, {
      clampV: true,
    }),
    giltColor: texture(gilt.color, TILE_M.gilt),
    giltRough: texture(gilt.rough, TILE_M.gilt),
    giltNormal: texture(gilt.normal, TILE_M.gilt),
    walnutColor: texture(walnut.color, TILE_M.wood, { srgb: true }),
    walnutNormal: texture(walnut.normal, TILE_M.wood),
    ashColor: texture(ash.color, TILE_M.wood, { srgb: true }),
    ashNormal: texture(ash.normal, TILE_M.wood),
    lacquerColor: texture(lacquer.color, TILE_M.lacquer),
    lacquerNormal: texture(lacquer.normal, TILE_M.lacquer),
    silkColor: texture(buildSilkMap(SILK_GROUND, SILK_THREAD), TILE_M.silk, { srgb: true }),
    weaveNormal: texture(buildWeaveNormal(), TILE_M.weave),
    paperNormal: texture(buildPaperNormal(), TILE_M.paper),
  };
  return maps;
}

/** How many frame maps exist and the GPU bytes they take once
 *  uploaded, mip chains included. For the debug HUD. */
export function frameMapStats(): { count: number; bytes: number } {
  if (!maps) return { count: 0, bytes: 0 };
  let bytes = 0;
  const all = Object.values(maps);
  for (const t of all) bytes += (t.image.width * t.image.height * 4 * 4) / 3;
  return { count: all.length, bytes: Math.round(bytes) };
}
