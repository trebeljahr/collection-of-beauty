"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GRAND_RAIL_HEIGHT,
  type GrandStair,
  STAIR_SLAB,
  type StairPatch,
  type StairRail,
} from "@/lib/gallery-layout/grand-stair";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { buildGlowGeometry, makeGlobeGlowMaterial, makeGlobeMaterial } from "./glow";
import { fixtureMaterial, HIGHLIGHT_ENV_MATERIALS } from "./palette-materials";
import { getStairMaps } from "./stair-maps";

// A grand stair, drawn from the surfaces the visitor walks
// (`grand-stair.ts`): a block for every tread, a slab for every landing,
// and a stone balustrade along every rail. Everything is built in the
// hall's own frame and the group is turned to face the hall's door, so
// what is drawn and what is walked cannot disagree.
//
// One stair is eight meshes: the marble, the masonry it stands on, the
// balusters (small parts the floor's mirror pass leaves out), the
// carpet and its brass rods, and the stems, globes and glows of the
// lamp standards at the foot of its first flight. A hall with no
// stair (a court) is the balustrades of its galleries and walkways, and
// the beams under their edges; the walkways' decks are its floors.

const stairMaps = getStairMaps();
// Rico, 17 October 2026: in flat colour the stair still read as a toy.
// The stone is a veined white marble (stair-maps.ts), each block cut
// from another part of the slab (`Solid.vary`), polished where it is
// walked and duller in its veins.
const stoneMaterial = new THREE.MeshStandardMaterial({
  // Pale limestone: the stair is the lightest thing in its hall, as in
  // the halls it is modelled on.
  color: "#ddd4c3",
  map: stairMaps.marbleColor,
  roughness: 1,
  roughnessMap: stairMaps.marbleRough,
  normalMap: stairMaps.marbleNormal,
  normalScale: new THREE.Vector2(0.35, 0.35),
  metalness: 0.02,
  // Faces are shaded by which way they look (`FACE_SHADE`).
  vertexColors: true,
});
// What reaches the floor: the side walls of a solid landing and the
// masonry under a balustrade. Dressed stone in courses, the same pale
// stone as the stair, so the joints carry it and not a change of tone.
const masonryMaterial = new THREE.MeshStandardMaterial({
  color: "#d6cdbb",
  map: stairMaps.ashlarColor,
  roughness: 0.8,
  normalMap: stairMaps.ashlarNormal,
  normalScale: new THREE.Vector2(0.6, 0.6),
  metalness: 0,
  vertexColors: true,
});
// The runner's colours are in its vertices (`CARPET_BANDS`): crimson,
// a gold band and a dark binding at each edge. The map is the pile.
const carpetMaterial = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  map: stairMaps.pileColor,
  normalMap: stairMaps.pileNormal,
  normalScale: new THREE.Vector2(0.8, 0.8),
  roughness: 0.97,
  metalness: 0,
  vertexColors: true,
});
// The runner's rods: polished brass, so each step edge carries a line
// of light. In the lamps' dark bronze they read as black rules.
const rodMaterial = new THREE.MeshStandardMaterial({
  color: "#c39a4a",
  roughness: 0.3,
  metalness: 0.9,
});
// The globe of a lamp standard. Unlit: it is the light.
const globeMaterial = makeGlobeMaterial();

// Nothing in the scene casts a shadow, so a riser would be as bright as
// the tread over it and a flight would read as a ramp. Each face takes a
// share of the stone's colour by the way it looks.
//
// Up and down are the ends of the scale. A face that looks sideways
// takes its share by its compass direction, as if the hall had a window
// in one side wall: with one share for all four, a baluster's two
// visible faces were the same tone and a balustrade read as a paper
// cut-out (Rico, 13 October 2026). The light comes along the hall's x
// axis, so the risers of every flight, which look along z, stay well
// under the treads.
const FACE_SHADE = { up: 1, down: 0.64, sideMin: 0.7, sideMax: 0.92 } as const;
/** Where the side light comes from, in the hall's frame. Off both axes,
 *  so no two faces of a square post take the same share. */
const SIDE_LIGHT = { x: 0.96, z: 0.28 } as const;
/** How much a sloped face gains for leaning up, or loses for leaning
 *  down: it gives a turned baluster its belly. */
const SLOPE_SHADE = 0.3;

function faceShade(nx: number, ny: number, nz: number): number {
  if (ny > 0.75) return FACE_SHADE.up;
  if (ny < -0.75) return FACE_SHADE.down;
  const h = Math.hypot(nx, nz) || 1;
  const toward = (nx * SIDE_LIGHT.x + nz * SIDE_LIGHT.z) / h;
  const side =
    FACE_SHADE.sideMin + (FACE_SHADE.sideMax - FACE_SHADE.sideMin) * (0.5 + 0.5 * toward);
  return Math.min(FACE_SHADE.up, Math.max(FACE_SHADE.down, side * (1 + SLOPE_SHADE * ny)));
}

// Lamp standard, metres above the floor its post stands on.
const LAMP_STEM_FOOT = 1.21;
const LAMP_GLOBE_Y = 1.92;
const LAMP_GLOBE_R = 0.2;
/** The globe's bloom: how far it reaches, and what it adds at the
 *  globe's edge, where its halo starts. Until 17 October 2026 it reached
 *  1.1 m with the lenses' profile, and Rico found the globes did not
 *  look "glowing softly": a white disc in a thin ring. */
const LAMP_GLOW_R = 1.8;
const LAMP_GLOW = 0.75;
const globeGlowMaterial = makeGlobeGlowMaterial("#ffe6c4", LAMP_GLOBE_R / LAMP_GLOW_R);
// Lit from above by the lamp map the frames reflect, as the spiral is:
// treads take about twice the light of risers and soffits.
HIGHLIGHT_ENV_MATERIALS.push(stoneMaterial, masonryMaterial, carpetMaterial, rodMaterial);

// Balustrade, metres.
const PLINTH_HEIGHT = 0.12;
const PLINTH_WIDTH = 0.28;
const CAP_HEIGHT = 0.12;
const CAP_WIDTH = 0.32;
const BALUSTER_PITCH = 0.32;
/** A baluster: a square block at its foot and its head, turned between
 *  them. Until 17 October 2026 it was square all the way up, four faces
 *  to each piece, and a balustrade of them read as cut from card.
 *  Shares of its height. */
const BALUSTER_FOOT_BLOCK = { top: 0.1, half: 0.062 } as const;
const BALUSTER_HEAD_BLOCK = { foot: 0.9, half: 0.056 } as const;
/** The turned part's outline: half its width at a share of the
 *  baluster's height. A ring, a neck, a belly a third of the way up, a
 *  long taper to a second neck and a ring under the head block. */
const BALUSTER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.1, 0.05],
  [0.13, 0.05],
  [0.15, 0.034],
  [0.21, 0.05],
  [0.36, 0.067],
  [0.56, 0.052],
  [0.8, 0.03],
  [0.9, 0.05],
];
/** Facets round the turned part. With smooth normals eight read as
 *  round. A baluster is 136 triangles (it was 48 square), and every
 *  stair hall draws the balustrades of all four storeys: some 140,000
 *  triangles a hall. Each facet more is 14 a baluster. */
const BALUSTER_SIDES = 8;
/** A baluster stands in the shadow of the plinth's edge and of the cap:
 *  the share of its light it keeps at its foot and at its head. */
const BALUSTER_FOOT_SHADE = 0.8;
const BALUSTER_HEAD_SHADE = 0.66;
const NEWEL_SIZE = 0.36;
const NEWEL_RISE = 0.14;
const SKIRT_WIDTH = 0.3;
const STRINGER_WIDTH = 0.18;
const STRINGER_DEPTH = 0.5;
/** The stone beam under the edge of a floor that spans free (a court's
 *  gallery and walkways): the floor slab alone is 0.2 m, and a walkway
 *  17.5 m long on it read as a sheet of card. */
const BEAM_WIDTH = 0.36;
const BEAM_DEPTH = 0.75;
/** How far the carpet stands off the stone. */
const CARPET_LIFT = 0.012;
/** A tread's nosing: how far it stands out over the riser below and how
 *  thick it is. The face under it looks down and takes the downward
 *  share of the light, a dark line under every step edge. Without it a
 *  flight's steps met in bare right angles, as a model's do. */
const NOSING_OUT = 0.035;
const NOSING_THICK = 0.045;
/** The runner's edge, from the outside in, metres and linear colour: a
 *  dark binding, a gold band, then the crimson field. */
const CARPET_BANDS: ReadonlyArray<{ width: number; colour: string }> = [
  { width: 0.03, colour: "#3d0c12" },
  { width: 0.045, colour: "#b38a43" },
];
const CARPET_FIELD = "#7c1622";
/** A brass rod across the foot of every riser, holding the runner into
 *  the angle of the step: its half thickness, and how far it runs past
 *  the runner's edge to its eye. */
const ROD_HALF = 0.006;
const ROD_OVERHANG = 0.035;
/** How far inside its hall's wall lines a stair stops. A wall is a plane
 *  with no thickness, and the room behind it draws its own on the same
 *  line. A balustrade that ends at a wall has its post centred on that
 *  line: drawn whole, half of the post stood in the gallery next door. */
const WALL_CLEAR = 0.02;

type P3 = [number, number, number];
type Rgb = readonly [number, number, number];

/** A colour as the linear factors a vertex colour holds. */
function linear(hex: string): Rgb {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Where in the marble a block is cut from: a uv offset, metres, the
 *  same on every run. */
function blockOffset(n: number): [number, number] {
  const a = Math.sin(n * 12.9898) * 43758.5453;
  const b = Math.sin(n * 78.233) * 12543.1234;
  return [(a - Math.floor(a)) * 9.6, (b - Math.floor(b)) * 9.6];
}

/** Collects flat-shaded boxes into one geometry. With a `reach`, no box
 *  goes further than that from the hall's centre in x or z, nor further
 *  than `back` toward -z, the wall the stair climbs toward: one that
 *  would is cut off there, so a post on a wall is a half post against it.
 *
 *  Every vertex has a uv in metres, projected on the plane its face
 *  looks at most nearly. With `vary`, each block is given its own place
 *  in the map, as each tread of a stair is its own slab of stone. */
class Solid {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly color: number[] = [];
  private readonly uv: number[] = [];
  private readonly reach: number;
  private readonly back: number;
  private readonly vary: boolean;
  private pieces = 0;
  private held: [number, number] | null = null;
  private sides: { to: Solid; only: "all" | "x" } | null = null;
  /** The linear colour of what is added next. */
  tint: Rgb = [1, 1, 1];

  constructor(reach = Number.POSITIVE_INFINITY, back = reach, vary = false) {
    this.reach = reach;
    this.back = back;
    this.vary = vary;
  }

  /** Adds what `draw` adds as one block of stone: one place in the map. */
  block(draw: () => void) {
    const outer = this.held;
    this.held = outer ?? this.nextOffset();
    draw();
    this.held = outer;
  }

  /** Sends the upright faces of what `draw` adds to `to`: all of them,
   *  or only those that look along x (a flight's sides, not its risers). */
  withSides(to: Solid, only: "all" | "x", draw: () => void) {
    const outer = this.sides;
    this.sides = { to, only };
    draw();
    this.sides = outer;
  }

  private nextOffset(): [number, number] {
    return this.vary ? blockOffset(++this.pieces) : [0, 0];
  }

  private push(
    p: P3,
    n: P3,
    shade: number,
    offset: readonly [number, number],
    uv?: [number, number],
  ) {
    let u: number;
    let v: number;
    if (uv) {
      [u, v] = uv;
    } else {
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      const az = Math.abs(n[2]);
      if (ay >= ax && ay >= az) [u, v] = [p[0], p[2]];
      else if (ax >= az) [u, v] = [p[2], p[1]];
      else [u, v] = [p[0], p[1]];
    }
    this.position.push(p[0], p[1], p[2]);
    this.normal.push(n[0], n[1], n[2]);
    this.color.push(shade * this.tint[0], shade * this.tint[1], shade * this.tint[2]);
    this.uv.push(u + offset[0], v + offset[1]);
  }

  /** A box of eight corners: the four of its underside in order round
   *  it, then the four over them. Each face is turned outward, so the
   *  order may run either way round. `light` is the share of its light
   *  each corner keeps (all of it, unset); `sidesOnly` leaves out the
   *  underside and the top, for a piece that stands on another. */
  hexa(corners: readonly P3[], light?: readonly number[], sidesOnly = false) {
    const within = (v: number, low = this.reach) => Math.max(-low, Math.min(this.reach, v));
    const c = corners.map(([x, y, z]): P3 => [within(x), y, within(z, this.back)]);
    const centre: P3 = [0, 0, 0];
    for (const p of c) {
      centre[0] += p[0] / 8;
      centre[1] += p[1] / 8;
      centre[2] += p[2] / 8;
    }
    const offset = this.held ?? this.nextOffset();
    const faces: Array<[number, number, number, number]> = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ];
    for (const face of sidesOnly ? faces.slice(2) : faces) {
      let [ia, ib, ic, id] = face;
      let [a, b, cc, d] = face.map((i) => c[i]);
      let n = cross(sub(b, a), sub(cc, a));
      if (lengthOf(n) < 1e-9) n = cross(sub(cc, a), sub(d, a));
      const len = lengthOf(n);
      // A face with no area: a box squeezed flat on one side.
      if (len < 1e-9) continue;
      const mid: P3 = [
        (a[0] + b[0] + cc[0] + d[0]) / 4,
        (a[1] + b[1] + cc[1] + d[1]) / 4,
        (a[2] + b[2] + cc[2] + d[2]) / 4,
      ];
      if (dot(n, sub(mid, centre)) < 0) {
        [b, d] = [d, b];
        [ib, id] = [id, ib];
        n = [-n[0], -n[1], -n[2]];
      }
      const unit: P3 = [n[0] / len, n[1] / len, n[2] / len];
      const shade = faceShade(unit[0], unit[1], unit[2]);
      const routed =
        this.sides &&
        Math.abs(unit[1]) < 0.75 &&
        (this.sides.only === "all" || Math.abs(unit[0]) > 0.75);
      const to = routed && this.sides ? this.sides.to : this;
      const at = to === this ? offset : ([0, 0] as const);
      const corners: Array<[P3, number]> = [
        [a, ia],
        [b, ib],
        [cc, ic],
        [a, ia],
        [cc, ic],
        [d, id],
      ];
      for (const [p, i] of corners) to.push(p, unit, shade * (light?.[i] ?? 1), at);
    }
  }

  /** A turned piece standing on (x, y, z): `profile` gives its half
   *  width at heights over y, each ring of `sides` vertices shared by the
   *  bands either side of it, so the piece shades round. `light` is the
   *  share of its light kept at a height. */
  lathe(
    x: number,
    y: number,
    z: number,
    profile: ReadonlyArray<readonly [number, number]>,
    sides: number,
    light: (height: number) => number,
  ) {
    const offset = this.held ?? this.nextOffset();
    // The outline's slope at each ring, averaged over the bands either
    // side: an outward normal of a surface r(h) leans by -dr/dh.
    const slope = profile.map((_, k) => {
      const lo = profile[Math.max(0, k - 1)];
      const hi = profile[Math.min(profile.length - 1, k + 1)];
      return (hi[1] - lo[1]) / (hi[0] - lo[0] || 1);
    });
    const ring = (k: number, j: number): { p: P3; n: P3; uv: [number, number] } => {
      const angle = ((j + 0.5) / sides) * Math.PI * 2;
      const [h, r] = profile[k];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const len = Math.hypot(1, slope[k]);
      return {
        p: [x + r * cos, y + h, z + r * sin],
        n: [cos / len, -slope[k] / len, sin / len],
        uv: [(j / sides) * 0.4, y + h],
      };
    };
    for (let k = 0; k < profile.length - 1; k++) {
      for (let j = 0; j < sides; j++) {
        const a = ring(k, j);
        const b = ring(k, (j + 1) % sides);
        const c = ring(k + 1, (j + 1) % sides);
        const d = ring(k + 1, j);
        for (const q of [a, c, b, a, d, c]) {
          const shade = faceShade(q.n[0], q.n[1], q.n[2]) * light(q.p[1] - y);
          this.push(q.p, q.n, shade, offset, q.uv);
        }
      }
    }
  }

  box(xMin: number, xMax: number, yMin: number, yMax: number, zMin: number, zMax: number) {
    this.hexa([
      [xMin, yMin, zMin],
      [xMax, yMin, zMin],
      [xMax, yMin, zMax],
      [xMin, yMin, zMax],
      [xMin, yMax, zMin],
      [xMax, yMax, zMin],
      [xMax, yMax, zMax],
      [xMin, yMax, zMax],
    ]);
  }

  /** A wall of some thickness from one point of the plan to another,
   *  its foot and its top each at their own height at either end. */
  wall(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    thickness: number,
    foot0: number,
    foot1: number,
    top0: number,
    top1: number,
  ) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) return;
    const nx = (-(z1 - z0) / len) * (thickness / 2);
    const nz = ((x1 - x0) / len) * (thickness / 2);
    this.hexa([
      [x0 - nx, foot0, z0 - nz],
      [x0 + nx, foot0, z0 + nz],
      [x1 + nx, foot1, z1 + nz],
      [x1 - nx, foot1, z1 - nz],
      [x0 - nx, top0, z0 - nz],
      [x0 + nx, top0, z0 + nz],
      [x1 + nx, top1, z1 + nz],
      [x1 - nx, top1, z1 - nz],
    ]);
  }

  build(): THREE.BufferGeometry | null {
    if (this.position.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lengthOf = (a: P3) => Math.hypot(a[0], a[1], a[2]);

const FIELD = linear(CARPET_FIELD);
const BANDS = CARPET_BANDS.map((b) => ({ width: b.width, colour: linear(b.colour) }));

/** The runner across a half width `half` about `cx`, from the left edge
 *  to the right: [from, to, colour]. */
function runnerStripes(cx: number, half: number): Array<[number, number, Rgb]> {
  const out: Array<[number, number, Rgb]> = [];
  let edge = 0;
  for (const band of BANDS) {
    out.push([cx - half + edge, cx - half + edge + band.width, band.colour]);
    edge += band.width;
  }
  out.push([cx - half + edge, cx + half - edge, FIELD]);
  for (const band of [...BANDS].reverse()) {
    edge -= band.width;
    out.push([cx + half - edge - band.width, cx + half - edge, band.colour]);
  }
  return out;
}

/** A rug on a landing: the runner's bands as frames round its field. */
function addRug(carpet: Solid, xMin: number, xMax: number, zMin: number, zMax: number, y: number) {
  const top = y + CARPET_LIFT;
  let inset = 0;
  for (const band of BANDS) {
    carpet.tint = band.colour;
    const [x0, x1, z0, z1] = [xMin + inset, xMax - inset, zMin + inset, zMax - inset];
    const w = band.width;
    carpet.box(x0, x1, y, top, z0, z0 + w);
    carpet.box(x0, x1, y, top, z1 - w, z1);
    carpet.box(x0, x0 + w, y, top, z0 + w, z1 - w);
    carpet.box(x1 - w, x1, y, top, z0 + w, z1 - w);
    inset += w;
  }
  carpet.tint = FIELD;
  carpet.box(xMin + inset, xMax - inset, y, top, zMin + inset, zMax - inset);
  carpet.tint = [1, 1, 1];
}

/** Treads and landings of one patch, the carpet on them, and the rods
 *  that hold the runner. Upright faces of masonry built up from the
 *  floor go to `masonry`. */
function addPatch(
  stone: Solid,
  masonry: Solid,
  carpet: Solid,
  rods: Solid,
  p: StairPatch,
  baseY: number,
) {
  if (p.kind === "flat") {
    const slab = () =>
      stone.box(p.xMin, p.xMax, p.solid ? baseY : p.y - STAIR_SLAB, p.y, p.zMin, p.zMax);
    if (p.solid) stone.withSides(masonry, "all", slab);
    else slab();
    const inset = 0.45;
    if (p.xMax - p.xMin > 2 * inset + 0.5 && p.zMax - p.zMin > 2 * inset + 0.5) {
      addRug(carpet, p.xMin + inset, p.xMax - inset, p.zMin + inset, p.zMax - inset, p.y);
    }
    return;
  }

  const rise = (p.y1 - p.y0) / p.steps;
  const runner = 0.55 * Math.min(p.hw0, p.hw1);
  const toward = Math.sign(p.z1 - p.z0);
  const stripes = runnerStripes(p.cx, runner);
  const treads = () => {
    for (let i = 0; i < p.steps; i++) {
      const t0 = i / p.steps;
      const t1 = (i + 1) / p.steps;
      const za = p.z0 + (p.z1 - p.z0) * t0;
      const zb = p.z0 + (p.z1 - p.z0) * t1;
      const ha = p.hw0 + (p.hw1 - p.hw0) * t0;
      const hb = p.hw0 + (p.hw1 - p.hw0) * t1;
      const top = p.y0 + (i + 1) * rise;
      const below = top - rise;
      // A flight that spans free has one sloped soffit, the line under
      // its treads the physics keeps clear (`STAIR_SLAB` under the
      // nosings). Each tread a flat-bottomed block made the underside
      // a staircase upside down.
      const footA = p.solid ? baseY : below - STAIR_SLAB;
      const footB = p.solid ? baseY : top - STAIR_SLAB;
      const nose = za - toward * NOSING_OUT;
      stone.block(() => {
        stone.hexa([
          [p.cx - ha, footA, za],
          [p.cx + ha, footA, za],
          [p.cx + hb, footB, zb],
          [p.cx - hb, footB, zb],
          [p.cx - ha, top, za],
          [p.cx + ha, top, za],
          [p.cx + hb, top, zb],
          [p.cx - hb, top, zb],
        ]);
        stone.box(
          p.cx - ha,
          p.cx + ha,
          top - NOSING_THICK,
          top,
          Math.min(nose, za),
          Math.max(nose, za),
        );
      });
      // The runner covers the tread and falls from the nosing to the
      // tread below, the way a runner laid over a nosing does.
      const front = nose - toward * CARPET_LIFT;
      for (const [x0, x1, colour] of stripes) {
        carpet.tint = colour;
        carpet.box(x0, x1, below, top + CARPET_LIFT, Math.min(front, zb), Math.max(front, zb));
      }
      // The rod lies in the angle at the riser's foot, on the tread below.
      const rz = front - toward * ROD_HALF;
      const ry = below + CARPET_LIFT + ROD_HALF;
      rods.box(
        p.cx - runner - ROD_OVERHANG,
        p.cx + runner + ROD_OVERHANG,
        ry - ROD_HALF,
        ry + ROD_HALF,
        rz - ROD_HALF,
        rz + ROD_HALF,
      );
    }
    carpet.tint = [1, 1, 1];
  };
  if (p.solid) stone.withSides(masonry, "x", treads);
  else treads();
}

/** One baluster, its foot at (x, y, z), its blocks turned to the rail's
 *  direction (ux, uz). */
function addBaluster(
  solid: Solid,
  x: number,
  z: number,
  y: number,
  height: number,
  ux: number,
  uz: number,
) {
  const ring = (at: number, half: number): P3[] => {
    const ax = ux * half;
    const az = uz * half;
    const yy = y + at * height;
    return [
      [x - ax + az, yy, z - az - ax],
      [x + ax + az, yy, z + az - ax],
      [x + ax - az, yy, z + az + ax],
      [x - ax - az, yy, z - az + ax],
    ];
  };
  // Dark at the foot, darkest under the cap, full in between.
  const shadow = (at: number) =>
    1 -
    (1 - BALUSTER_FOOT_SHADE) * Math.max(0, 1 - at / 0.2) -
    (1 - BALUSTER_HEAD_SHADE) * Math.max(0, 1 - (1 - at) / 0.22);
  const foot = BALUSTER_FOOT_BLOCK;
  const head = BALUSTER_HEAD_BLOCK;
  const lo = shadow(0);
  const lt = shadow(foot.top);
  const hf = shadow(head.foot);
  const hi = shadow(1);
  solid.block(() => {
    solid.hexa(
      [...ring(0, foot.half), ...ring(foot.top, foot.half)],
      [lo, lo, lo, lo, lt, lt, lt, lt],
    );
    solid.lathe(
      x,
      y,
      z,
      BALUSTER_PROFILE.map(([at, half]) => [at * height, half] as const),
      BALUSTER_SIDES,
      (h) => shadow(h / height),
    );
    solid.hexa(
      [...ring(head.foot, head.half), ...ring(1, head.half)],
      [hf, hf, hf, hf, hi, hi, hi, hi],
    );
  });
}

/** One balustrade: plinth, balusters, cap, and what it stands on. */
function addRail(stone: Solid, masonry: Solid, balusters: Solid, r: StairRail) {
  const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
  if (len < 1e-6) return;
  const h = GRAND_RAIL_HEIGHT;
  stone.wall(
    r.x0,
    r.z0,
    r.x1,
    r.z1,
    PLINTH_WIDTH,
    r.y0,
    r.y1,
    r.y0 + PLINTH_HEIGHT,
    r.y1 + PLINTH_HEIGHT,
  );
  stone.wall(
    r.x0,
    r.z0,
    r.x1,
    r.z1,
    CAP_WIDTH,
    r.y0 + h - CAP_HEIGHT,
    r.y1 + h - CAP_HEIGHT,
    r.y0 + h,
    r.y1 + h,
  );
  const count = Math.max(1, Math.round(len / BALUSTER_PITCH));
  // Square to the rail, so on a curved rail each turns with it.
  const ux = (r.x1 - r.x0) / len;
  const uz = (r.z1 - r.z0) / len;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    addBaluster(
      balusters,
      r.x0 + (r.x1 - r.x0) * t,
      r.z0 + (r.z1 - r.z0) * t,
      r.y0 + (r.y1 - r.y0) * t + PLINTH_HEIGHT,
      h - PLINTH_HEIGHT - CAP_HEIGHT,
      ux,
      uz,
    );
  }
  const sloped = Math.abs(r.y1 - r.y0) > 1e-6;
  if (r.beam) {
    stone.wall(
      r.x0,
      r.z0,
      r.x1,
      r.z1,
      BEAM_WIDTH,
      r.y0 - BEAM_DEPTH,
      r.y1 - BEAM_DEPTH,
      r.y0 - 0.005,
      r.y1 - 0.005,
    );
  } else if (r.skirtTo !== undefined) {
    // Masonry down to the floor the stair stands on.
    const floor = r.skirtTo;
    stone.withSides(masonry, "all", () =>
      stone.wall(r.x0, r.z0, r.x1, r.z1, SKIRT_WIDTH, floor, floor, r.y0, r.y1),
    );
  } else if (sloped) {
    // A flight that spans free shows the ends of its treads: a string
    // closes them.
    stone.wall(
      r.x0,
      r.z0,
      r.x1,
      r.z1,
      STRINGER_WIDTH,
      r.y0 - STRINGER_DEPTH,
      r.y1 - STRINGER_DEPTH,
      r.y0 + 0.02,
      r.y1 + 0.02,
    );
  }
}

/** A post where a balustrade ends or turns a corner. A curved rail is a
 *  chain of short straight ones and gets none along its length. */
function addNewels(stone: Solid, rails: readonly StairRail[]) {
  type End = { x: number; z: number; y: number; dirs: Array<[number, number]>; skirtTo?: number };
  const ends = new Map<string, End>();
  const note = (x: number, z: number, y: number, dx: number, dz: number, skirtTo?: number) => {
    const key = `${x.toFixed(2)}:${z.toFixed(2)}:${y.toFixed(2)}`;
    let end = ends.get(key);
    if (!end) {
      end = { x, z, y, dirs: [], skirtTo };
      ends.set(key, end);
    }
    const len = Math.hypot(dx, dz) || 1;
    end.dirs.push([dx / len, dz / len]);
    if (skirtTo !== undefined) end.skirtTo = skirtTo;
  };
  for (const r of rails) {
    note(r.x0, r.z0, r.y0, r.x1 - r.x0, r.z1 - r.z0, r.skirtTo);
    note(r.x1, r.z1, r.y1, r.x0 - r.x1, r.z0 - r.z1, r.skirtTo);
  }
  const half = NEWEL_SIZE / 2;
  for (const end of ends.values()) {
    // Two rails that run on through the point in one line need no post.
    const straight =
      end.dirs.length === 2 &&
      end.dirs[0][0] * end.dirs[1][0] + end.dirs[0][1] * end.dirs[1][1] < -0.9;
    if (straight) continue;
    const top = end.y + GRAND_RAIL_HEIGHT + NEWEL_RISE;
    stone.box(end.x - half, end.x + half, end.skirtTo ?? end.y, top, end.z - half, end.z + half);
    stone.box(
      end.x - half - 0.04,
      end.x + half + 0.04,
      top,
      top + 0.07,
      end.z - half - 0.04,
      end.z + half + 0.04,
    );
  }
}

export function buildStair(stair: GrandStair) {
  const reach = stair.half - WALL_CLEAR;
  const back = stair.back - WALL_CLEAR;
  const stone = new Solid(reach, back, true);
  const masonry = new Solid(reach, back);
  const balusters = new Solid(reach, back, true);
  const carpet = new Solid(reach, back);
  const rods = new Solid(reach, back);
  const stems = new Solid(reach, back);
  for (const p of stair.patches) addPatch(stone, masonry, carpet, rods, p, stair.lowerY);
  for (const r of stair.rails) addRail(stone, masonry, balusters, r);
  addNewels(stone, stair.rails);
  for (const c of stair.columns) {
    const h = c.size / 2;
    stone.box(c.x - h, c.x + h, c.y0, c.y1, c.z - h, c.z + h);
    // Base and capital.
    stone.box(c.x - h - 0.08, c.x + h + 0.08, c.y0, c.y0 + 0.22, c.z - h - 0.08, c.z + h + 0.08);
    stone.box(c.x - h - 0.1, c.x + h + 0.1, c.y1 - 0.2, c.y1, c.z - h - 0.1, c.z + h + 0.1);
  }
  // Lamp standards: a bronze stem on the post, a globe on the stem.
  const globes: THREE.BufferGeometry[] = [];
  for (const lamp of stair.lamps) {
    const foot = lamp.y + LAMP_STEM_FOOT;
    stems.box(
      lamp.x - 0.035,
      lamp.x + 0.035,
      foot,
      lamp.y + LAMP_GLOBE_Y,
      lamp.z - 0.035,
      lamp.z + 0.035,
    );
    stems.box(lamp.x - 0.1, lamp.x + 0.1, foot, foot + 0.05, lamp.z - 0.1, lamp.z + 0.1);
    globes.push(
      new THREE.SphereGeometry(LAMP_GLOBE_R, 32, 20).translate(
        lamp.x,
        lamp.y + LAMP_GLOBE_Y,
        lamp.z,
      ),
    );
  }
  const globe = globes.length > 0 ? mergeGeometries(globes, false) : null;
  for (const g of globes) g.dispose();
  const glow = buildGlowGeometry(
    stair.lamps.map((lamp) => ({
      position: [lamp.x, lamp.y + LAMP_GLOBE_Y, lamp.z] as const,
      radius: LAMP_GLOW_R,
      strength: LAMP_GLOW,
    })),
  );
  return {
    stone: stone.build(),
    masonry: masonry.build(),
    balusters: balusters.build(),
    carpet: carpet.build(),
    rods: rods.build(),
    stems: stems.build(),
    globe,
    glow,
  };
}

export function GrandStaircase({ stair }: { stair: GrandStair }) {
  const built = useMemo(() => buildStair(stair), [stair]);
  useEffect(
    () => () => {
      built.stone?.dispose();
      built.masonry?.dispose();
      built.balusters?.dispose();
      built.carpet?.dispose();
      built.rods?.dispose();
      built.stems?.dispose();
      built.globe?.dispose();
      built.glow?.dispose();
    },
    [built],
  );
  return (
    <group
      position={[stair.centerX, 0, stair.centerZ]}
      rotation={[0, (-stair.turns * Math.PI) / 2, 0]}
    >
      {built.stone && <mesh geometry={built.stone} material={stoneMaterial} />}
      {built.masonry && <mesh geometry={built.masonry} material={masonryMaterial} />}
      {built.balusters && (
        <mesh geometry={built.balusters} material={stoneMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.carpet && <mesh geometry={built.carpet} material={carpetMaterial} />}
      {built.rods && (
        <mesh geometry={built.rods} material={rodMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.stems && (
        <mesh geometry={built.stems} material={fixtureMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.globe && <mesh geometry={built.globe} material={globeMaterial} />}
      {built.glow && (
        <mesh
          geometry={built.glow}
          material={globeGlowMaterial}
          renderOrder={2}
          layers={UNREFLECTED_LAYER}
        />
      )}
    </group>
  );
}
