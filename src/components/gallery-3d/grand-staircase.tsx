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
import { buildGlowGeometry, lampGlowMaterial, makeGlobeMaterial } from "./glow";
import { fixtureMaterial, HIGHLIGHT_ENV_MATERIALS } from "./palette-materials";

// A grand stair, drawn from the surfaces the visitor walks
// (`grand-stair.ts`): a block for every tread, a slab for every landing,
// and a stone balustrade along every rail. Everything is built in the
// hall's own frame and the group is turned to face the hall's door, so
// what is drawn and what is walked cannot disagree.
//
// One stair is six meshes: the stone, the balusters (small parts the
// floor's mirror pass leaves out), the carpet, and the stems, globes and
// glows of the lamp standards at the foot of its first flight. A hall with no
// stair (a court) is the balustrades of its galleries.

const stoneMaterial = new THREE.MeshStandardMaterial({
  // Pale limestone: the stair is the lightest thing in its hall, as in
  // the halls it is modelled on.
  color: "#d6cdbb",
  roughness: 0.6,
  metalness: 0.02,
  // Faces are shaded by which way they look (`FACE_SHADE`).
  vertexColors: true,
});
const carpetMaterial = new THREE.MeshStandardMaterial({
  color: "#7c1622",
  roughness: 0.96,
  metalness: 0,
  vertexColors: true,
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
/** The globe's bloom: how far it reaches, and what it adds at its
 *  middle. Enough to read as switched on in a lit hall. */
const LAMP_GLOW_R = 1.1;
const LAMP_GLOW = 0.6;
// Lit from above by the lamp map the frames reflect, as the spiral is:
// treads take about twice the light of risers and soffits.
HIGHLIGHT_ENV_MATERIALS.push(stoneMaterial, carpetMaterial);

// Balustrade, metres.
const PLINTH_HEIGHT = 0.12;
const PLINTH_WIDTH = 0.28;
const CAP_HEIGHT = 0.12;
const CAP_WIDTH = 0.32;
const BALUSTER_PITCH = 0.32;
/** A baluster's outline: half its width at a share of its height. A
 *  square block, a neck, a belly a third of the way up, a long taper to
 *  a second neck and a block under the cap. Square in plan, so each
 *  piece is four faces. */
const BALUSTER_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.062],
  [0.1, 0.062],
  [0.15, 0.036],
  [0.38, 0.068],
  [0.85, 0.032],
  [0.9, 0.056],
  [1, 0.056],
];
/** A baluster stands in the shadow of the plinth's edge and of the cap:
 *  the share of its light it keeps at its foot and at its head. */
const BALUSTER_FOOT_SHADE = 0.8;
const BALUSTER_HEAD_SHADE = 0.66;
const NEWEL_SIZE = 0.36;
const NEWEL_RISE = 0.14;
const SKIRT_WIDTH = 0.3;
const STRINGER_WIDTH = 0.18;
const STRINGER_DEPTH = 0.5;
/** How far the carpet stands off the stone. */
const CARPET_LIFT = 0.012;
/** How far inside its hall's wall lines a stair stops. A wall is a plane
 *  with no thickness, and the room behind it draws its own on the same
 *  line. A balustrade that ends at a wall has its post centred on that
 *  line: drawn whole, half of the post stood in the gallery next door. */
const WALL_CLEAR = 0.02;

type P3 = [number, number, number];

/** Collects flat-shaded boxes into one geometry. With a `reach`, no box
 *  goes further than that from the hall's centre in x or z, nor further
 *  than `back` toward -z, the wall the stair climbs toward: one that
 *  would is cut off there, so a post on a wall is a half post against it. */
class Solid {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly color: number[] = [];
  private readonly reach: number;
  private readonly back: number;

  constructor(reach = Number.POSITIVE_INFINITY, back = reach) {
    this.reach = reach;
    this.back = back;
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
      const corners: Array<[P3, number]> = [
        [a, ia],
        [b, ib],
        [cc, ic],
        [a, ia],
        [cc, ic],
        [d, id],
      ];
      for (const [p, i] of corners) {
        const v = shade * (light?.[i] ?? 1);
        this.position.push(p[0], p[1], p[2]);
        this.normal.push(unit[0], unit[1], unit[2]);
        this.color.push(v, v, v);
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

  /** A piece of a ring between two angles. */
  wedge(rIn: number, rOut: number, a: number, b: number, yMin: number, yMax: number) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    this.hexa([
      [rIn * ca, yMin, rIn * sa],
      [rOut * ca, yMin, rOut * sa],
      [rOut * cb, yMin, rOut * sb],
      [rIn * cb, yMin, rIn * sb],
      [rIn * ca, yMax, rIn * sa],
      [rOut * ca, yMax, rOut * sa],
      [rOut * cb, yMax, rOut * sb],
      [rIn * cb, yMax, rIn * sb],
    ]);
  }

  build(): THREE.BufferGeometry | null {
    if (this.position.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
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

/** Treads and landings of one patch, and the carpet on them. */
function addPatch(stone: Solid, carpet: Solid, p: StairPatch, baseY: number) {
  if (p.kind === "flat") {
    stone.box(p.xMin, p.xMax, p.y - STAIR_SLAB, p.y, p.zMin, p.zMax);
    const inset = 0.45;
    if (p.xMax - p.xMin > 2 * inset + 0.5 && p.zMax - p.zMin > 2 * inset + 0.5) {
      carpet.box(
        p.xMin + inset,
        p.xMax - inset,
        p.y,
        p.y + CARPET_LIFT,
        p.zMin + inset,
        p.zMax - inset,
      );
    }
    return;
  }

  if (p.kind === "flight") {
    const rise = (p.y1 - p.y0) / p.steps;
    const runner = 0.55 * Math.min(p.hw0, p.hw1);
    const toward = Math.sign(p.z1 - p.z0);
    for (let i = 0; i < p.steps; i++) {
      const t0 = i / p.steps;
      const t1 = (i + 1) / p.steps;
      const za = p.z0 + (p.z1 - p.z0) * t0;
      const zb = p.z0 + (p.z1 - p.z0) * t1;
      const ha = p.hw0 + (p.hw1 - p.hw0) * t0;
      const hb = p.hw0 + (p.hw1 - p.hw0) * t1;
      const top = p.y0 + (i + 1) * rise;
      const foot = p.solid ? baseY : p.y0 + i * rise - STAIR_SLAB;
      stone.hexa([
        [p.cx - ha, foot, za],
        [p.cx + ha, foot, za],
        [p.cx + hb, foot, zb],
        [p.cx - hb, foot, zb],
        [p.cx - ha, top, za],
        [p.cx + ha, top, za],
        [p.cx + hb, top, zb],
        [p.cx - hb, top, zb],
      ]);
      // The runner covers the tread and the riser under it.
      const front = za - toward * CARPET_LIFT;
      carpet.box(
        p.cx - runner,
        p.cx + runner,
        top - rise,
        top + CARPET_LIFT,
        Math.min(front, zb),
        Math.max(front, zb),
      );
    }
    return;
  }

  const inset = 0.7;
  const lead = (Math.sign(p.sweep) * CARPET_LIFT) / p.rIn;
  if (p.steps === 0) {
    // A level sector, in pieces short enough to read as round.
    const pieces = Math.max(2, Math.ceil(Math.abs(p.sweep) / 0.14));
    for (let i = 0; i < pieces; i++) {
      const a = p.a0 + (p.sweep * i) / pieces;
      const b = p.a0 + (p.sweep * (i + 1)) / pieces;
      stone.wedge(p.rIn, p.rOut, a, b, p.solid ? baseY : p.y0 - STAIR_SLAB, p.y0);
      carpet.wedge(p.rIn + inset, p.rOut - inset, a, b, p.y0, p.y0 + CARPET_LIFT);
    }
    return;
  }
  const rise = (p.y1 - p.y0) / p.steps;
  for (let i = 0; i < p.steps; i++) {
    const a = p.a0 + (p.sweep * i) / p.steps;
    const b = p.a0 + (p.sweep * (i + 1)) / p.steps;
    const top = p.y0 + (i + 1) * rise;
    const foot = p.solid ? baseY : p.y0 + i * rise - STAIR_SLAB;
    stone.wedge(p.rIn, p.rOut, a, b, foot, top);
    carpet.wedge(p.rIn + inset, p.rOut - inset, a - lead, b, top - rise, top + CARPET_LIFT);
  }
}

/** One baluster, its foot at (x, y, z), turned to the rail's direction
 *  (ux, uz): the pieces of its outline one on another. */
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
  for (let k = 0; k < BALUSTER_PROFILE.length - 1; k++) {
    const [at0, half0] = BALUSTER_PROFILE[k];
    const [at1, half1] = BALUSTER_PROFILE[k + 1];
    const lo = shadow(at0);
    const hi = shadow(at1);
    solid.hexa([...ring(at0, half0), ...ring(at1, half1)], [lo, lo, lo, lo, hi, hi, hi, hi], true);
  }
}

/** One balustrade: plinth, balusters, cap, and what it stands on. */
function addRail(stone: Solid, balusters: Solid, r: StairRail) {
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
  if (r.skirtTo !== undefined) {
    // Masonry down to the floor the stair stands on.
    stone.wall(r.x0, r.z0, r.x1, r.z1, SKIRT_WIDTH, r.skirtTo, r.skirtTo, r.y0, r.y1);
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
  const stone = new Solid(reach, back);
  const balusters = new Solid(reach, back);
  const carpet = new Solid(reach, back);
  for (const p of stair.patches) addPatch(stone, carpet, p, stair.lowerY);
  for (const r of stair.rails) addRail(stone, balusters, r);
  addNewels(stone, stair.rails);
  for (const c of stair.columns) {
    const h = c.size / 2;
    stone.box(c.x - h, c.x + h, c.y0, c.y1, c.z - h, c.z + h);
    // Base and capital.
    stone.box(c.x - h - 0.08, c.x + h + 0.08, c.y0, c.y0 + 0.22, c.z - h - 0.08, c.z + h + 0.08);
    stone.box(c.x - h - 0.1, c.x + h + 0.1, c.y1 - 0.2, c.y1, c.z - h - 0.1, c.z + h + 0.1);
  }
  // Lamp standards: a bronze stem on the post, a globe on the stem.
  const stems = new Solid(reach, back);
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
      new THREE.SphereGeometry(LAMP_GLOBE_R, 20, 14).translate(
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
    balusters: balusters.build(),
    carpet: carpet.build(),
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
      built.balusters?.dispose();
      built.carpet?.dispose();
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
      {built.balusters && (
        <mesh geometry={built.balusters} material={stoneMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.carpet && <mesh geometry={built.carpet} material={carpetMaterial} />}
      {built.stems && (
        <mesh geometry={built.stems} material={fixtureMaterial} layers={UNREFLECTED_LAYER} />
      )}
      {built.globe && <mesh geometry={built.globe} material={globeMaterial} />}
      {built.glow && (
        <mesh
          geometry={built.glow}
          material={lampGlowMaterial}
          renderOrder={2}
          layers={UNREFLECTED_LAYER}
        />
      )}
    </group>
  );
}
