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
import { FLOOR_SEPARATION, FLOOR_THICKNESS } from "@/lib/gallery-layout/world-coords";
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
// from another part of the slab (`Solid.vary`). It is honed, not
// polished: polished, every baluster mirrored the lamps in stripes, and
// he did not like the shine. It takes half the lamp map's reflection.
const stoneMaterial = new THREE.MeshStandardMaterial({
  // Pale limestone: the stair is the lightest thing in its hall, as in
  // the halls it is modelled on.
  color: "#ddd4c3",
  map: stairMaps.marbleColor,
  roughness: 1,
  roughnessMap: stairMaps.marbleRough,
  normalMap: stairMaps.marbleNormal,
  normalScale: new THREE.Vector2(0.35, 0.35),
  metalness: 0,
  // Faces are shaded by which way they look (`FACE_SHADE`).
  vertexColors: true,
});
stoneMaterial.userData.envScale = 0.5;
// The handrails and the caps of the newels: a black marble veined
// white, which he asked for the same day. Against the pale balusters
// it draws the line of each rail.
const darkStoneMaterial = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  map: stairMaps.darkMarbleColor,
  roughness: 1,
  roughnessMap: stairMaps.darkMarbleRough,
  normalMap: stairMaps.darkMarbleNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  metalness: 0,
  vertexColors: true,
});
darkStoneMaterial.userData.envScale = 0.5;
// What reaches the floor: the side walls of a solid landing and the
// masonry under a balustrade. Dressed stone in courses, the same pale
// stone as the stair, so the joints carry it and not a change of tone.
const masonryMaterial = new THREE.MeshStandardMaterial({
  color: "#d6cdbb",
  map: stairMaps.ashlarColor,
  roughness: 0.85,
  normalMap: stairMaps.ashlarNormal,
  normalScale: new THREE.Vector2(0.6, 0.6),
  metalness: 0,
  vertexColors: true,
});
masonryMaterial.userData.envScale = 0.5;
/**
 * Lime plaster under every flight and landing, and the body of each
 * floor round a stair's opening (`StairwellFloor`). In marble the
 * soffits showed the tile's veins across metres of ceiling; in parquet
 * the floors' edges and undersides were wood seen from below. It takes
 * the scene's light, as the hall's floors and ceilings do, and no
 * vertex colours, so the floors' slabs can share it.
 */
export const soffitMaterial = new THREE.MeshStandardMaterial({
  color: "#d8d1c4",
  map: stairMaps.plasterColor,
  roughness: 0.95,
  normalMap: stairMaps.plasterNormal,
  normalScale: new THREE.Vector2(0.5, 0.5),
  metalness: 0,
});
// The runner. Its field is a patterned wool (`buildCarpetMap`) read
// with uvs that run up the flight, tread and riser after one another,
// as a runner is laid; its edge, a dark binding and a gold band in
// vertex colours (`CARPET_BANDS`) over the plain pile.
const carpetFieldMaterial = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  map: stairMaps.carpetColor,
  normalMap: stairMaps.carpetNormal,
  normalScale: new THREE.Vector2(1.3, 1.3),
  roughness: 1,
  metalness: 0,
  vertexColors: true,
});
carpetFieldMaterial.userData.envScale = 0.4;
const carpetEdgeMaterial = new THREE.MeshStandardMaterial({
  color: "#ffffff",
  map: stairMaps.pileColor,
  normalMap: stairMaps.pileNormal,
  normalScale: new THREE.Vector2(1.3, 1.3),
  roughness: 1,
  metalness: 0,
  vertexColors: true,
});
carpetEdgeMaterial.userData.envScale = 0.4;
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
HIGHLIGHT_ENV_MATERIALS.push(
  stoneMaterial,
  darkStoneMaterial,
  masonryMaterial,
  carpetFieldMaterial,
  carpetEdgeMaterial,
  rodMaterial,
);

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
/** The stone fascia over the edge of a floor round the opening: the
 *  floor's slab, the 2 cm of plenum to the ceiling under it
 *  (stairwell-light.tsx), and 4 cm below that ceiling. At slab and
 *  2 cm its underside lay in the ceiling's plane, and the plaster and
 *  the marble fought along every gallery's edge (17 October 2026). */
const FASCIA_DEPTH = FLOOR_THICKNESS + 0.06;
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
/** The radius of the runner's roll over a nosing, at its face, and the
 *  facets that draw the quarter turn. The roll is centred inside the
 *  stone, so it meets the riser and the tread `CARPET_LIFT` off the
 *  stone and clears the nosing's corner by 6.6 mm. A 45° cut of this
 *  size passed 1 mm inside the corner, and the marble showed through it
 *  as a pale line along every step. */
const CARPET_ROLL = 0.025;
const CARPET_ROLL_FACETS = 4;
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

/** Where in the marble a block is cut from: a uv offset, metres, and
 *  a quarter turn of the slab (0 to 3), the same on every run. Turned
 *  as well as moved, a block does not show the tile's veins in the
 *  order the next block shows them. */
type Cut = readonly [number, number, number];
function blockOffset(n: number): Cut {
  const a = Math.sin(n * 12.9898) * 43758.5453;
  const b = Math.sin(n * 78.233) * 12543.1234;
  const c = Math.sin(n * 39.425) * 24634.6345;
  return [
    (a - Math.floor(a)) * 9.6,
    (b - Math.floor(b)) * 9.6,
    Math.floor((c - Math.floor(c)) * 4),
  ];
}
const UNCUT: Cut = [0, 0, 0];
const HEXA_FACES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];

/** Collects flat-shaded boxes into one geometry. With a `reach`, no box
 *  goes further than that from the hall's centre in x or z, nor further
 *  than `back` toward -z, the wall the stair climbs toward: one that
 *  would is cut off there, so a post on a wall is a half post against it.
 *
 *  Every vertex has a uv in metres, projected on the plane its face
 *  looks at most nearly. With `vary`, each block is given its own place
 *  in the map, as each tread of a stair is its own slab of stone. */
class Solid {
  // Only completed vertex values enter these buffers. Geometry calculations
  // still use the original numbers; no rounded value feeds another vertex.
  private position = new Float32Array(0);
  private normal = new Float32Array(0);
  private color = new Float32Array(0);
  private uv = new Float32Array(0);
  private vertices = 0;
  private readonly indices: number[] = [];
  private readonly reach: number;
  private readonly back: number;
  private readonly vary: boolean;
  private pieces = 0;
  private held: Cut | null = null;
  private sides: { to: Solid; only: "all" | "x" } | null = null;
  /** Where faces that look down go: the plaster of the soffits. */
  under: Solid | null = null;
  /** The linear colour of what is added next. */
  tint: Rgb = [1, 1, 1];
  /** A uv for a vertex, in place of the projection, while set. */
  uvAt: ((p: P3, n: P3) => [number, number]) | null = null;

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

  /** Keeps what `draw` adds that looks down here, not on `under`: the
   *  underside of a nosing or a fascia is stone, not plaster. */
  keepUnder(draw: () => void) {
    const outer = this.under;
    this.under = null;
    draw();
    this.under = outer;
  }

  private nextOffset(): Cut {
    return this.vary ? blockOffset(++this.pieces) : UNCUT;
  }

  private push(p: P3, n: P3, shade: number, offset: Cut, uv?: [number, number]) {
    // Grow all attributes together. Logical vertices exclude unused capacity.
    if (this.vertices * 3 === this.position.length) {
      const capacity = Math.max(64, this.vertices * 2);
      const position = new Float32Array(capacity * 3);
      const normal = new Float32Array(capacity * 3);
      const color = new Float32Array(capacity * 3);
      const uv = new Float32Array(capacity * 2);
      position.set(this.position);
      normal.set(this.normal);
      color.set(this.color);
      uv.set(this.uv);
      this.position = position;
      this.normal = normal;
      this.color = color;
      this.uv = uv;
    }
    let u: number;
    let v: number;
    if (uv) {
      [u, v] = uv;
    } else if (this.uvAt) {
      [u, v] = this.uvAt(p, n);
    } else {
      const ax = Math.abs(n[0]);
      const ay = Math.abs(n[1]);
      const az = Math.abs(n[2]);
      if (ay >= ax && ay >= az) {
        u = p[0];
        v = p[2];
      } else if (ax >= az) {
        u = p[2];
        v = p[1];
      } else {
        u = p[0];
        v = p[1];
      }
    }
    const at = this.vertices * 3;
    this.position[at] = p[0];
    this.position[at + 1] = p[1];
    this.position[at + 2] = p[2];
    this.normal[at] = n[0];
    this.normal[at + 1] = n[1];
    this.normal[at + 2] = n[2];
    this.color[at] = shade * this.tint[0];
    this.color[at + 1] = shade * this.tint[1];
    this.color[at + 2] = shade * this.tint[2];
    const turnedU = offset[2] === 1 ? v : offset[2] === 2 ? -u : offset[2] === 3 ? -v : u;
    const turnedV = offset[2] === 1 ? -u : offset[2] === 2 ? -v : offset[2] === 3 ? u : v;
    this.uv[this.vertices * 2] = turnedU + offset[0];
    this.uv[this.vertices * 2 + 1] = turnedV + offset[1];
    this.vertices++;
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
    for (let face = sidesOnly ? 2 : 0; face < HEXA_FACES.length; face++) {
      let [ia, ib, ic, id] = HEXA_FACES[face];
      const a = c[ia];
      let b = c[ib];
      const cc = c[ic];
      let d = c[id];
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
      const to =
        routed && this.sides ? this.sides.to : unit[1] < -0.75 && this.under ? this.under : this;
      const at = to === this ? offset : UNCUT;
      const base = to.vertices;
      to.push(a, unit, shade * (light?.[ia] ?? 1), at);
      to.push(b, unit, shade * (light?.[ib] ?? 1), at);
      to.push(cc, unit, shade * (light?.[ic] ?? 1), at);
      to.push(d, unit, shade * (light?.[id] ?? 1), at);
      to.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
    if (profile.length < 2) return;
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
    const base = this.vertices;
    for (let k = 0; k < profile.length; k++) {
      for (let j = 0; j < sides; j++) {
        const q = ring(k, j);
        const shade = faceShade(q.n[0], q.n[1], q.n[2]) * light(q.p[1] - y);
        this.push(q.p, q.n, shade, offset, q.uv);
      }
    }
    for (let k = 0; k < profile.length - 1; k++) {
      for (let j = 0; j < sides; j++) {
        const next = (j + 1) % sides;
        const a = base + k * sides + j;
        const b = base + k * sides + next;
        const c = base + (k + 1) * sides + next;
        const d = base + (k + 1) * sides + j;
        this.indices.push(a, c, b, a, d, c);
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
    if (this.vertices === 0) return null;
    const g = new THREE.BufferGeometry();
    // Exact copies keep spare capacity temporary and each build independent.
    // BufferAttribute takes ownership without copying these Float32 arrays again.
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(this.position.slice(0, this.vertices * 3), 3),
    );
    g.setAttribute("normal", new THREE.BufferAttribute(this.normal.slice(0, this.vertices * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.color.slice(0, this.vertices * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(this.uv.slice(0, this.vertices * 2), 2));
    g.setIndex(this.indices);
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

const BANDS = CARPET_BANDS.map((b) => ({ width: b.width, colour: linear(b.colour) }));

/** A runner's two meshes: its patterned field and its edge bands. */
type Carpet = { field: Solid; edge: Solid };

/** The runner across a half width `half` about `cx`, from the left edge
 *  to the right: [from, to, the band's colour, or null for the field]. */
function runnerStripes(cx: number, half: number): Array<[number, number, Rgb | null]> {
  const out: Array<[number, number, Rgb | null]> = [];
  let edge = 0;
  for (const band of BANDS) {
    out.push([cx - half + edge, cx - half + edge + band.width, band.colour]);
    edge += band.width;
  }
  out.push([cx - half + edge, cx + half - edge, null]);
  for (const band of [...BANDS].reverse()) {
    edge -= band.width;
    out.push([cx + half - edge - band.width, cx + half - edge, band.colour]);
  }
  return out;
}

/** A rug on a landing: the runner's bands as frames round its field. */
function addRug(carpet: Carpet, xMin: number, xMax: number, zMin: number, zMax: number, y: number) {
  const top = y + CARPET_LIFT;
  const { edge, field } = carpet;
  let inset = 0;
  for (const band of BANDS) {
    edge.tint = band.colour;
    const [x0, x1, z0, z1] = [xMin + inset, xMax - inset, zMin + inset, zMax - inset];
    const w = band.width;
    edge.box(x0, x1, y, top, z0, z0 + w);
    edge.box(x0, x1, y, top, z1 - w, z1);
    edge.box(x0, x0 + w, y, top, z0 + w, z1 - w);
    edge.box(x1 - w, x1, y, top, z0 + w, z1 - w);
    inset += w;
  }
  edge.tint = [1, 1, 1];
  // The field's pattern centred on the rug.
  const cx = (xMin + xMax) / 2;
  const cz = (zMin + zMax) / 2;
  field.uvAt = (q) => [q[0] - cx, q[2] - cz];
  field.box(xMin + inset, xMax - inset, y, top, zMin + inset, zMax - inset);
  field.uvAt = null;
}

/** Treads and landings of one patch, the carpet on them, and the rods
 *  that hold the runner. Upright faces of masonry built up from the
 *  floor go to `masonry`. */
function addPatch(
  stone: Solid,
  masonry: Solid,
  carpet: Carpet,
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
  const run = Math.abs(p.z1 - p.z0) / p.steps;
  const runner = 0.55 * Math.min(p.hw0, p.hw1);
  const toward = Math.sign(p.z1 - p.z0);
  const stripes = runnerStripes(p.cx, runner);
  const { edge, field } = carpet;
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
        stone.keepUnder(() =>
          stone.box(
            p.cx - ha,
            p.cx + ha,
            top - NOSING_THICK,
            top,
            Math.min(nose, za),
            Math.max(nose, za),
          ),
        );
      });
      // The runner covers the tread and falls from the nosing to the
      // tread below, the way a runner laid over a nosing does.
      const front = nose - toward * CARPET_LIFT;
      // Over the nosing the runner turns on a quarter round about a line
      // inside the stone, not a box's corner: a hard arris was what made
      // it read as painted board. (dz, dy) below are measured from that
      // line, dz up the flight and dy up.
      const inset = CARPET_ROLL - CARPET_LIFT;
      const zc = nose + toward * inset;
      const yc = top - inset;
      // The field's uv runs up the flight as the runner is laid: across
      // it u, and v the length of runner from the flight's foot, the
      // riser from the tread below, the roll, then the tread to the next
      // riser. Every step is the same length of runner, so the pattern
      // carries on over the nosing and into the next riser unbroken.
      const riserLength = rise - CARPET_ROLL;
      const rollLength = (CARPET_ROLL * Math.PI) / 2;
      const laid = i * (rise + run + rollLength - 2 * CARPET_ROLL);
      field.uvAt = (q) => {
        const dz = (q[2] - zc) * toward;
        const dy = q[1] - yc;
        const u = q[0] - p.cx;
        if (dz >= 0) return [u, laid + riserLength + rollLength + dz];
        if (dy <= 0) return [u, laid + riserLength + dy];
        return [u, laid + riserLength + CARPET_ROLL * Math.atan2(dy, -dz)];
      };
      const at = (r: number, a: number): [number, number] => [
        zc - toward * r * Math.cos(a),
        yc + r * Math.sin(a),
      ];
      for (const [x0, x1, colour] of stripes) {
        const to = colour ? edge : field;
        if (colour) edge.tint = colour;
        // The riser, up to where the roll begins.
        to.box(x0, x1, below, yc, Math.min(front, zc), Math.max(front, zc));
        // The roll, a wedge a facet, the carpet's thickness deep.
        for (let k = 0; k < CARPET_ROLL_FACETS; k++) {
          const a0 = (k / CARPET_ROLL_FACETS) * (Math.PI / 2);
          const a1 = ((k + 1) / CARPET_ROLL_FACETS) * (Math.PI / 2);
          const [zi0, yi0] = at(inset, a0);
          const [zo0, yo0] = at(CARPET_ROLL, a0);
          const [zi1, yi1] = at(inset, a1);
          const [zo1, yo1] = at(CARPET_ROLL, a1);
          to.hexa([
            [x0, yi0, zi0],
            [x1, yi0, zi0],
            [x1, yo0, zo0],
            [x0, yo0, zo0],
            [x0, yi1, zi1],
            [x1, yi1, zi1],
            [x1, yo1, zo1],
            [x0, yo1, zo1],
          ]);
        }
        // The tread, from the roll to the next riser.
        to.box(x0, x1, below, top + CARPET_LIFT, Math.min(zc, zb), Math.max(zc, zb));
      }
      field.uvAt = null;
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
    edge.tint = [1, 1, 1];
  };
  if (p.solid) stone.withSides(masonry, "x", treads);
  else treads();
}

/** One baluster, its foot at (x, y, z), its blocks turned to the rail's
 *  direction (ux, uz). On a sloped rail (`slope`, rise per metre along
 *  it) the foot block's underside follows the plinth and the head
 *  block's top follows the cap: level, the downhill corner of each
 *  stood clear of the stone by 4 cm and the uphill one was sunk in it. */
function addBaluster(
  solid: Solid,
  x: number,
  z: number,
  y: number,
  height: number,
  ux: number,
  uz: number,
  slope: number,
) {
  const ring = (at: number, half: number, follow = false): P3[] => {
    const ax = ux * half;
    const az = uz * half;
    const yy = y + at * height;
    // The corners lie half a block back and forward along the rail.
    const dy = follow ? slope * half : 0;
    return [
      [x - ax + az, yy - dy, z - az - ax],
      [x + ax + az, yy + dy, z + az - ax],
      [x + ax - az, yy + dy, z + az + ax],
      [x - ax - az, yy - dy, z - az + ax],
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
      [...ring(0, foot.half, true), ...ring(foot.top, foot.half)],
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
      [...ring(head.foot, head.half), ...ring(1, head.half, true)],
      [hf, hf, hf, hf, hi, hi, hi, hi],
    );
  });
}

/** The part of a rail between two places along it, 0 at its start. */
function railPart(r: StairRail, t0: number, t1: number): StairRail {
  const at = (t: number) => ({
    x: r.x0 + (r.x1 - r.x0) * t,
    z: r.z0 + (r.z1 - r.z0) * t,
    y: r.y0 + (r.y1 - r.y0) * t,
  });
  const a = at(t0);
  const b = at(t1);
  return { ...r, x0: a.x, z0: a.z, y0: a.y, x1: b.x, z1: b.z, y1: b.y };
}

/** The balustrade itself: plinth, balusters and the dark cap. */
function addBalustrade(stone: Solid, dark: Solid, balusters: Solid, r: StairRail) {
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
  dark.wall(
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
  const slope = (r.y1 - r.y0) / len;
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
      slope,
    );
  }
}

/** One balustrade, and what it stands on. `ceiling` is how high it may
 *  reach: a flight that climbs under the edge of a gallery stops its
 *  balustrade where the cap meets the gallery's fascia, and a solid
 *  parapet runs on from there between the flight and the fascia. Until
 *  17 October 2026 the side flights' outer balustrades ran on up
 *  through the galleries' balustrades, which stand on the same line. */
function addRail(
  stone: Solid,
  masonry: Solid,
  dark: Solid,
  balusters: Solid,
  r: StairRail,
  ceiling = Number.POSITIVE_INFINITY,
) {
  const h = GRAND_RAIL_HEIGHT;
  const sloped = Math.abs(r.y1 - r.y0) > 1e-6;
  // Where along the rail its cap reaches the ceiling: the balustrade
  // on the side of it that stays under, a parapet on the other.
  const tc = sloped ? Math.min(1, Math.max(0, (ceiling - h - r.y0) / (r.y1 - r.y0))) : 1;
  const rising = r.y1 > r.y0;
  const [free, under] = !sloped
    ? [
        [0, 1],
        [1, 1],
      ]
    : rising
      ? [
          [0, tc],
          [tc, 1],
        ]
      : [
          [tc, 1],
          [0, tc],
        ];
  if (free[1] - free[0] > 1e-6)
    addBalustrade(stone, dark, balusters, railPart(r, free[0], free[1]));
  if (under[1] - under[0] > 1e-6) {
    const u = railPart(r, under[0], under[1]);
    stone.wall(u.x0, u.z0, u.x1, u.z1, PLINTH_WIDTH, u.y0, u.y1, ceiling, ceiling);
  }
  const atFloor =
    !sloped && Math.abs(r.y0 / FLOOR_SEPARATION - Math.round(r.y0 / FLOOR_SEPARATION)) < 1e-4;
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
  } else if (atFloor) {
    // The edge of a floor round the opening: a stone fascia over the
    // slab's edge, under the balustrade.
    stone.keepUnder(() =>
      stone.wall(
        r.x0,
        r.z0,
        r.x1,
        r.z1,
        PLINTH_WIDTH,
        r.y0 - FASCIA_DEPTH,
        r.y1 - FASCIA_DEPTH,
        r.y0 - 0.003,
        r.y1 - 0.003,
      ),
    );
  }
}

/** How high each sloped rail may reach: under a level rail on the same
 *  line in plan and higher up, the fascia of that floor's edge. */
function railCeilings(rails: readonly StairRail[]): number[] {
  return rails.map((r) => {
    if (Math.abs(r.y1 - r.y0) < 1e-6) return Number.POSITIVE_INFINITY;
    let ceiling = Number.POSITIVE_INFINITY;
    for (const l of rails) {
      if (Math.abs(l.y1 - l.y0) > 1e-6 || l.y0 < Math.max(r.y0, r.y1) - 1e-3) continue;
      const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
      if (len < 1e-6) continue;
      const dx = (l.x1 - l.x0) / len;
      const dz = (l.z1 - l.z0) / len;
      const off = (x: number, z: number) => Math.abs((x - l.x0) * dz - (z - l.z0) * dx);
      if (off(r.x0, r.z0) > 0.02 || off(r.x1, r.z1) > 0.02) continue;
      const s0 = (r.x0 - l.x0) * dx + (r.z0 - l.z0) * dz;
      const s1 = (r.x1 - l.x0) * dx + (r.z1 - l.z0) * dz;
      if (Math.max(Math.min(s0, s1), 0) >= Math.min(Math.max(s0, s1), len)) continue;
      ceiling = Math.min(ceiling, l.y0 - FASCIA_DEPTH);
    }
    return ceiling;
  });
}

/** A post where a balustrade ends or turns a corner. A curved rail is a
 *  chain of short straight ones and gets none along its length. */
function addNewels(stone: Solid, dark: Solid, rails: readonly StairRail[]) {
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
    dark.box(
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
  const soffit = new Solid(reach, back);
  stone.under = soffit;
  const masonry = new Solid(reach, back);
  const dark = new Solid(reach, back, true);
  const balusters = new Solid(reach, back, true);
  const carpet: Carpet = { field: new Solid(reach, back), edge: new Solid(reach, back) };
  const rods = new Solid(reach, back);
  const stems = new Solid(reach, back);
  for (const p of stair.patches) addPatch(stone, masonry, carpet, rods, p, stair.lowerY);
  const ceilings = railCeilings(stair.rails);
  stair.rails.forEach((r, i) => {
    addRail(stone, masonry, dark, balusters, r, ceilings[i]);
  });
  addNewels(stone, dark, stair.rails);
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
    soffit: soffit.build(),
    masonry: masonry.build(),
    dark: dark.build(),
    balusters: balusters.build(),
    carpetField: carpet.field.build(),
    carpetEdge: carpet.edge.build(),
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
      built.soffit?.dispose();
      built.masonry?.dispose();
      built.dark?.dispose();
      built.balusters?.dispose();
      built.carpetField?.dispose();
      built.carpetEdge?.dispose();
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
      {built.soffit && <mesh geometry={built.soffit} material={soffitMaterial} />}
      {built.masonry && <mesh geometry={built.masonry} material={masonryMaterial} />}
      {built.dark && <mesh geometry={built.dark} material={darkStoneMaterial} />}
      {built.balusters && (
        <mesh geometry={built.balusters} material={stoneMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.carpetField && <mesh geometry={built.carpetField} material={carpetFieldMaterial} />}
      {built.carpetEdge && <mesh geometry={built.carpetEdge} material={carpetEdgeMaterial} />}
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
