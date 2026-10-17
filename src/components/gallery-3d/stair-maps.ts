// Procedural surface maps for the stairs.
//
// A stair of flat-coloured boxes reads as a model: every tread the same
// tone, the masonry under it one sheet of card, the runner a strip of
// felt. What a real stair hall shows is on the surface: veins that run
// differently through each slab of marble, the joints of the ashlar the
// flights stand on, the pile of a wool runner. They are generated here,
// once per page, as small tiling textures, the way the frame maps are
// (frame-maps.ts). Nothing is downloaded.
//
// Every map tiles in both directions and is read with uv in metres
// (`repeat` is one over the tile's size). Colour maps are linear
// multipliers: the material's colour and the vertex colours carry the
// tone, so one map serves a pale stair hall and a grey column alike.

import type * as THREE from "three";
import { heightToNormal, type Pixels, texture, tileFbm, tileNoise } from "./frame-maps";

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const toByte = (x: number) => Math.round(sat(x) * 255);
const TAU = Math.PI * 2;

/** World size of one tile of each map, metres: [u, v]. */
export const STAIR_TILE_M = {
  marble: [2.4, 2.4],
  darkMarble: [0.8, 0.8],
  ashlar: [2.4, 1.2],
  plaster: [1.6, 1.6],
  pile: [0.2, 0.2],
  carpet: [0.32, 0.32],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Veined marble, a warm white stone with grey veins. Returns three maps
 * of one tile:
 *  - `color`: a multiplier, near 1 in the ground with soft clouds, down
 *    to about 0.4 in a vein;
 *  - `rough`: roughness in G. Honed, not polished: the ground is 0.55
 *    to 0.65 and a vein is duller. Rico, 17 October 2026: polished, the
 *    stone mirrored the lamps in stripes down every baluster, and he
 *    did not like it;
 *  - `normal`: the veins as hairline hollows and a faint unevenness of
 *    the polish.
 *
 * A vein is where a warped wave crosses zero. The wave's direction has
 * whole numbers of periods across the tile, so the map tiles.
 */
export function buildMarbleMaps(): { color: Pixels; rough: Pixels; normal: Pixels } {
  const S = 512;
  const warp = tileFbm(S, S, 3, 3, 5, 71);
  const warpFine = tileFbm(S, S, 8, 8, 4, 72);
  const clouds = tileFbm(S, S, 4, 4, 4, 73);
  const fade = tileFbm(S, S, 3, 3, 3, 75);
  const fine = tileNoise(S, S, 128, 128, 74);
  const color = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  // Ground warm white, veins a grey with a little warmth in it.
  const base = [1, 0.985, 0.955];
  const veinColour = [0.5, 0.485, 0.47];
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      // The main veins, a diagonal family bent by the coarse warp. They
      // fade in and out along their length, as a vein does in a slab.
      const a = Math.sin(TAU * (u + 2 * v) + 4.5 * warp[i] + 1.2 * warpFine[i]);
      const strength = 0.2 + 0.8 * sat((fade[i] - 0.35) * 3.5);
      const main = (1 - Math.abs(a)) ** 16 * strength;
      // Broad grey drifts the veins run through.
      const d = Math.sin(TAU * (2 * u + v) + 5 * warp[i]);
      const drift = (1 - Math.abs(d)) ** 3;
      // A second, fainter family across them, broken where its own warp
      // runs low. Warped gently: strongly warped, it curled into hooks
      // that showed as one motif repeated across a soffit.
      const b = Math.sin(TAU * (3 * u - v) + 1.5 * warpFine[i] + 2 * warp[i]);
      const broken = sat((warpFine[i] - 0.5) * 4);
      const thin = (1 - Math.abs(b)) ** 30 * broken;
      const vein = sat(0.7 * main + 0.25 * thin + 0.14 * drift);
      const ground = 0.94 + 0.08 * (clouds[i] - 0.5) + 0.02 * fine[i];
      for (let c = 0; c < 3; c++) {
        color[i * 4 + c] = toByte(base[c] * ground * (1 - vein) + veinColour[c] * vein);
      }
      color[i * 4 + 3] = 255;
      rough[i * 4] = 0;
      rough[i * 4 + 1] = toByte(0.58 + 0.15 * vein + 0.08 * (clouds[i] - 0.5));
      rough[i * 4 + 2] = 0;
      rough[i * 4 + 3] = 255;
      height[i] = -0.6 * main - 0.3 * thin + 0.08 * fine[i];
    }
  }
  // A texel is about 4.7 mm.
  const normal = heightToNormal(height, S, S, 0.5, 0.5, true, 0.6);
  return {
    color: { data: color, width: S, height: S },
    rough: { data: rough, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

/** Ashlar: courses this tall, blocks this long, metres. Two courses to
 *  a tile, the second set over the first by half a block. */
const ASHLAR_COURSE_M = 0.6;
const ASHLAR_BLOCK_M = 1.2;
/** A joint's width, metres: a fine lime joint. */
const ASHLAR_JOINT_M = 0.008;

/**
 * Dressed limestone laid in courses. `color` is a multiplier: each
 * block a slightly different tone, a fine grain over it, a darker joint
 * and a slight darkening on the arris beside it. `normal` sinks the
 * joints and rounds the arrises.
 */
export function buildAshlarMaps(): { color: Pixels; normal: Pixels } {
  const W = 512;
  const H = 256;
  const [tileU, tileV] = STAIR_TILE_M.ashlar;
  const pxPerM = W / tileU;
  const grain = tileFbm(W, H, 24, 12, 4, 81);
  const clouds = tileFbm(W, H, 4, 2, 3, 82);
  const fine = tileNoise(W, H, 160, 80, 83);
  const color = new Uint8Array(W * H * 4);
  const height = new Float32Array(W * H);
  const courses = Math.round(tileV / ASHLAR_COURSE_M);
  const blocks = Math.round(tileU / ASHLAR_BLOCK_M);
  const jointPx = ASHLAR_JOINT_M * pxPerM;
  for (let y = 0; y < H; y++) {
    const vm = (y / H) * tileV;
    const course = Math.floor(vm / ASHLAR_COURSE_M) % courses;
    const inCourse = vm - Math.floor(vm / ASHLAR_COURSE_M) * ASHLAR_COURSE_M;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const um = (x / W) * tileU + (course % 2) * (ASHLAR_BLOCK_M / 2);
      const wrapped = um % tileU;
      const block = Math.floor(wrapped / ASHLAR_BLOCK_M) % blocks;
      const inBlock = wrapped - Math.floor(wrapped / ASHLAR_BLOCK_M) * ASHLAR_BLOCK_M;
      // Distance to the nearest joint, in texels.
      const toBed = Math.min(inCourse, ASHLAR_COURSE_M - inCourse) * pxPerM;
      const toHead = Math.min(inBlock, ASHLAR_BLOCK_M - inBlock) * pxPerM;
      const toJoint = Math.min(toBed, toHead);
      const joint = sat(1 - (toJoint - jointPx / 2));
      const arris = sat(1 - (toJoint - jointPx / 2) / 4);
      // Each block its own tone: a hash of its place in the tile.
      const h = Math.sin((course * 12.9898 + block * 78.233) * 43.7585) * 43758.5453;
      const tone = 0.93 + 0.1 * (h - Math.floor(h));
      const surface =
        tone * (0.95 + 0.08 * (clouds[i] - 0.5) + 0.05 * (grain[i] - 0.5) + 0.02 * fine[i]);
      const v = surface * (1 - 0.06 * arris) * (1 - 0.4 * joint);
      color[i * 4] = toByte(v);
      color[i * 4 + 1] = toByte(v * 0.995);
      color[i * 4 + 2] = toByte(v * 0.985);
      color[i * 4 + 3] = 255;
      height[i] = -joint - 0.3 * arris * arris + 0.1 * grain[i] + 0.04 * fine[i];
    }
  }
  // A texel is about 4.7 mm.
  const normal = heightToNormal(height, W, H, 0.6, 0.6, true, 1.2);
  return {
    color: { data: color, width: W, height: H },
    normal: { data: normal, width: W, height: H },
  };
}

/**
 * The pile of a wool runner. `color` is a multiplier: tufts a millimetre
 * across in rows, a little lighter where the pile leans toward the eye.
 * `normal` gives the tufts their relief, so the runner breaks up the
 * light the way a carpet does and does not shine as felt would.
 */
export function buildPileMaps(): { color: Pixels; normal: Pixels } {
  const S = 256;
  const tufts = tileNoise(S, S, 128, 128, 91);
  const lean = tileFbm(S, S, 4, 4, 3, 92);
  const fibre = tileNoise(S, S, 256, 64, 93);
  const color = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  // Rows of tufts along v, as a loom lays them: 64 to the tile.
  const rows = 64;
  for (let y = 0; y < S; y++) {
    const row = 0.5 + 0.5 * Math.cos(TAU * ((y / S) * rows));
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const t = tufts[i] * 0.7 + fibre[i] * 0.3;
      const v = (0.8 + 0.2 * t) * (0.94 + 0.06 * row) * (0.93 + 0.14 * lean[i]);
      color[i * 4] = toByte(v);
      color[i * 4 + 1] = toByte(v);
      color[i * 4 + 2] = toByte(v);
      color[i * 4 + 3] = 255;
      height[i] = t + 0.3 * row;
    }
  }
  const normal = heightToNormal(height, S, S, 1.6, 1.6, true, 1.4);
  return {
    color: { data: color, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

/**
 * A dark marble with white flecks, for the handrails and the newels'
 * caps: a near-black ground clouded with grey, scattered white grains a
 * few millimetres across, and now and then a thin white vein. `color`
 * is a multiplier on a white material; `rough` is G, honed.
 */
export function buildDarkMarbleMaps(): { color: Pixels; rough: Pixels; normal: Pixels } {
  const S = 512;
  const clouds = tileFbm(S, S, 4, 4, 5, 101);
  const warp = tileFbm(S, S, 3, 3, 4, 102);
  const fine = tileNoise(S, S, 128, 128, 105);
  // White grains, scattered: round, 0.8 to 2.4 texels across, drawn
  // wrapping at the tile's edges. A threshold on value noise made them
  // square.
  const flecks = new Float32Array(S * S);
  let seed = 103;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let n = 0; n < 2600; n++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const r = 0.8 + 1.6 * rand() ** 2;
    const bright = 0.45 + 0.55 * rand();
    const reach = Math.ceil(r + 1);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const px = Math.floor(cx) + dx;
        const py = Math.floor(cy) + dy;
        const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        const t = bright * sat(r + 0.5 - d);
        if (t <= 0) continue;
        const k = ((py + S) % S) * S + ((px + S) % S);
        flecks[k] = Math.max(flecks[k], t);
      }
    }
  }
  const color = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      // A thin white vein, one family, fading in and out.
      const a = Math.sin(TAU * (2 * u + v) + 5 * warp[i]);
      const vein = (1 - Math.abs(a)) ** 50 * sat((clouds[i] - 0.5) * 4);
      const ground = 0.022 + 0.03 * clouds[i] ** 2 + 0.006 * fine[i];
      const white = sat(flecks[i] + 0.7 * vein);
      // Cool charcoal ground, the flecks a warm white.
      const c = [ground * 0.96, ground, ground * 1.06];
      const w = [0.8, 0.78, 0.74];
      for (let k = 0; k < 3; k++) color[i * 4 + k] = toByte(c[k] * (1 - white) + w[k] * white);
      color[i * 4 + 3] = 255;
      rough[i * 4] = 0;
      rough[i * 4 + 1] = toByte(0.5 + 0.12 * white + 0.06 * (clouds[i] - 0.5));
      rough[i * 4 + 2] = 0;
      rough[i * 4 + 3] = 255;
      height[i] = 0.2 * fine[i] - 0.3 * vein;
    }
  }
  // A texel is about 1.6 mm.
  const normal = heightToNormal(height, S, S, 0.3, 0.3, true, 0.4);
  return {
    color: { data: color, width: S, height: S },
    rough: { data: rough, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

/**
 * Lime plaster, for the soffits of the flights and landings and the
 * bodies of the floors round a stair's opening: a trowelled surface,
 * mottled a few percent, with a faint grain. `color` is a multiplier.
 */
export function buildPlasterMaps(): { color: Pixels; normal: Pixels } {
  const S = 512;
  const mottle = tileFbm(S, S, 5, 5, 5, 111);
  const strokes = tileFbm(S, S, 3, 12, 3, 112);
  const fine = tileNoise(S, S, 192, 192, 113);
  const color = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const v = 0.95 + 0.06 * (mottle[i] - 0.5) + 0.03 * (strokes[i] - 0.5) + 0.02 * fine[i];
    color[i * 4] = toByte(v);
    color[i * 4 + 1] = toByte(v);
    color[i * 4 + 2] = toByte(v * 0.99);
    color[i * 4 + 3] = 255;
    height[i] = 0.5 * strokes[i] + 0.3 * mottle[i] + 0.25 * fine[i];
  }
  const normal = heightToNormal(height, S, S, 0.9, 0.9, true, 0.5);
  return {
    color: { data: color, width: S, height: S },
    normal: { data: normal, width: S, height: S },
  };
}

/** A runner's field, sRGB: crimson, the pattern laid on it. */
const CARPET_GROUND: [number, number, number] = [118, 18, 30];
const CARPET_LINE: [number, number, number] = [72, 10, 20];
const CARPET_GOLD: [number, number, number] = [196, 148, 72];
const CARPET_NAVY: [number, number, number] = [32, 34, 66];

/**
 * The field of a runner, sRGB with the pile in it: a lattice of dark
 * lozenges on crimson, a gold rosette where the lattice crosses and a
 * navy lozenge in each opening, every edge softened as wool knots
 * soften it, and the pile's tufts and rows over all of it. Without a
 * pattern the runner read as a strip of painted board.
 */
export function buildCarpetMap(): Pixels {
  const S = 512;
  const tufts = tileNoise(S, S, 160, 160, 121);
  const rowsNoise = tileNoise(S, S, 256, 64, 122);
  const shade = tileFbm(S, S, 3, 3, 3, 123);
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      // Lattice coordinates: lines where a or b is half way between
      // whole numbers. Two lozenges to the tile, centred where a and b
      // are both whole, and two crossings.
      const fa = fractC(u + v) - 0.5;
      const fb = fractC(u - v) - 0.5;
      const line = 1 - smoothC(0.014, 0.034, Math.min(Math.abs(fa), Math.abs(fb)));
      // A rosette of four petals on each crossing (fa = fb = 0).
      const du = (fa + fb) / 2;
      const dv = (fa - fb) / 2;
      const r = Math.hypot(du, dv);
      const petals = 0.055 + 0.03 * Math.cos(4 * Math.atan2(dv, du));
      const rosette = 1 - smoothC(petals - 0.01, petals + 0.01, r);
      const eye = 1 - smoothC(0.014, 0.024, r);
      // A small lozenge in the middle of each opening.
      const ca = fractC(u + v + 0.5) - 0.5;
      const cb = fractC(u - v + 0.5) - 0.5;
      const inner = 1 - smoothC(0.09, 0.11, Math.max(Math.abs(ca), Math.abs(cb)));
      let c: number[] = [...CARPET_GROUND];
      const mix = (to: readonly number[], t: number) => {
        c = c.map((k, j) => k + (to[j] - k) * t);
      };
      mix(CARPET_NAVY, inner);
      mix(CARPET_LINE, line);
      mix(CARPET_GOLD, rosette * (1 - eye));
      mix(CARPET_NAVY, eye);
      // The pile: tufts a millimetre across in rows, and a slow shading
      // where the pile lies one way or the other.
      const row = 0.5 + 0.5 * Math.cos(TAU * v * 96);
      const pile =
        (0.84 + 0.22 * (tufts[i] * 0.7 + rowsNoise[i] * 0.3)) *
        (0.95 + 0.05 * row) *
        (0.94 + 0.12 * shade[i]);
      for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(Math.min(255, c[k] * pile));
      data[i * 4 + 3] = 255;
    }
  }
  return { data, width: S, height: S };
}

const fractC = (x: number) => x - Math.floor(x);
const smoothC = (a: number, b: number, x: number) => {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export type StairMaps = {
  marbleColor: THREE.DataTexture;
  marbleRough: THREE.DataTexture;
  marbleNormal: THREE.DataTexture;
  darkMarbleColor: THREE.DataTexture;
  darkMarbleRough: THREE.DataTexture;
  darkMarbleNormal: THREE.DataTexture;
  ashlarColor: THREE.DataTexture;
  ashlarNormal: THREE.DataTexture;
  plasterColor: THREE.DataTexture;
  plasterNormal: THREE.DataTexture;
  pileColor: THREE.DataTexture;
  pileNormal: THREE.DataTexture;
  carpetColor: THREE.DataTexture;
  carpetNormal: THREE.DataTexture;
};

let maps: StairMaps | null = null;

/** Every stair map, built on first call and kept for the page. */
export function getStairMaps(): StairMaps {
  if (maps) return maps;
  const marble = buildMarbleMaps();
  const ashlar = buildAshlarMaps();
  const pile = buildPileMaps();
  const dark = buildDarkMarbleMaps();
  const plaster = buildPlasterMaps();
  maps = {
    marbleColor: texture(marble.color, STAIR_TILE_M.marble),
    marbleRough: texture(marble.rough, STAIR_TILE_M.marble),
    marbleNormal: texture(marble.normal, STAIR_TILE_M.marble),
    darkMarbleColor: texture(dark.color, STAIR_TILE_M.darkMarble),
    darkMarbleRough: texture(dark.rough, STAIR_TILE_M.darkMarble),
    darkMarbleNormal: texture(dark.normal, STAIR_TILE_M.darkMarble),
    ashlarColor: texture(ashlar.color, STAIR_TILE_M.ashlar),
    ashlarNormal: texture(ashlar.normal, STAIR_TILE_M.ashlar),
    pileColor: texture(pile.color, STAIR_TILE_M.pile),
    pileNormal: texture(pile.normal, STAIR_TILE_M.pile),
    plasterColor: texture(plaster.color, STAIR_TILE_M.plaster),
    plasterNormal: texture(plaster.normal, STAIR_TILE_M.plaster),
    carpetColor: texture(buildCarpetMap(), STAIR_TILE_M.carpet, { srgb: true }),
    // The field's pile relief is the plain pile's, at its own tile.
    carpetNormal: texture(pile.normal, STAIR_TILE_M.pile),
  };
  return maps;
}

/** How many stair maps exist and the GPU bytes they take once
 *  uploaded, mip chains included. For the debug HUD. */
export function stairMapStats(): { count: number; bytes: number } {
  if (!maps) return { count: 0, bytes: 0 };
  let bytes = 0;
  const all = Object.values(maps);
  for (const t of all) bytes += (t.image.width * t.image.height * 4 * 4) / 3;
  return { count: all.length, bytes: Math.round(bytes) };
}
