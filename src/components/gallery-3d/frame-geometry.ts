// Picture frames as swept mouldings. A frame is a 2-D moulding profile
// (lib/gallery-layout/frame-styles.ts) swept round the canvas with 45°
// mitres, the way a framer cuts four lengths of moulding. The coves,
// beads and rolls catch the light differently, a baked per-vertex
// occlusion darkens the recesses, and the surface maps (frame-maps.ts,
// frame-materials.ts) put leaf, grain and carving on it.
//
// What is a frame's own goes into its vertices, not into a material:
// the tone of its gold or its mat, how worn and how polished it is, how
// deep its carving. So a few shared materials draw every frame, and no
// two frames need look alike.
//
// Most frames are one profile mitred round the canvas (`sweep`). A few
// are built from straight rails cut square (`addRail`): a tabernacle's
// entablature, a scroll's silk and roller, the crossing bars of an
// Oxford frame. A frame may also carry a block on each corner
// (`addBlocks`), and a scroll hangs by a cord (`addCord`).
//
// Everything goes into one BufferGeometry: one draw call per material
// slot the frame uses.

import * as THREE from "three";
import { type CarveBand, FRAME_SLOTS, type ShadedPoint } from "@/lib/gallery-layout/frame-profiles";
import {
  type CornerBlocks,
  type HungCord,
  type Rail,
  railPast,
  type Swell,
} from "@/lib/gallery-layout/frame-styles";
import { CARVE_ROWS } from "./frame-maps";

type Normal2 = [number, number];

function segmentNormal(a: ShadedPoint, b: ShadedPoint): Normal2 {
  // Rotate the segment direction (do, dz) a quarter turn to (-dz, do):
  // for a profile walked outward this points to the viewer's side.
  const dO = b.o - a.o;
  const dZ = b.z - a.z;
  const l = Math.hypot(dO, dZ) || 1;
  return [-dZ / l, dO / l];
}

/** A carved stretch of the profile: which ornament, and where along the
 *  profile's length it starts and ends. */
type BandRun = { band: CarveBand; start: number; end: number };

/** Per segment, the carved run it belongs to, or null. A segment is
 *  carved when both its ends name the same band. */
function bandRuns(
  profile: readonly ShadedPoint[],
  along: readonly number[],
): Array<BandRun | null> {
  const n = profile.length;
  const out: Array<BandRun | null> = new Array(n - 1).fill(null);
  for (let i = 0; i < n - 1; ) {
    const band = profile[i].band;
    if (!band || profile[i + 1].band !== band) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n - 1 && profile[j + 1].band === band && profile[j + 2].band === band) j++;
    const run: BandRun = { band, start: along[i], end: along[j + 1] };
    for (let k = i; k <= j; k++) out[k] = run;
    i = j + 1;
  }
  return out;
}

/**
 * Ornament periods from a rail's inner corner to a point on it.
 *
 * A carved moulding is set out from its corners. Between the two inner
 * corners of a rail the ornament is stretched by a few per cent so each
 * half holds a whole number of periods: the halves, which run mirrored,
 * then meet on a period at the centre. Past the inner corner, in the
 * mitre, the count runs on at the ornament's own pitch, which is the
 * same on both rails, so the carving meets itself across the joint.
 *
 * `along` is measured from the rail's centre, `half` is half the
 * canvas edge, `period` the ornament's pitch, all in metres.
 */
export function carvePeriods(along: number, half: number, period: number): number {
  const fromCorner = half - Math.abs(along);
  if (fromCorner <= 0) return fromCorner / period;
  return (Math.max(1, Math.round(half / period)) * fromCorner) / half;
}

/** How one material slot of a frame is finished. The renderer reads
 *  these from a work's design (lib/gallery-layout/frame-design.ts). */
export type FrameSlotFinish = {
  /** Multiplier on the material's own colour, linear RGB. */
  tint: readonly [number, number, number];
  /** Roughness as a multiple of the material's own. */
  rough: number;
  /** How much of the profile's burnishing shows, 0..1. */
  burnish: number;
  /** Multiplier on the profile's wear. */
  wear: number;
  /** Depth of carving, 0 for none. */
  carve: number;
  /** How far dirt and toned size have darkened the hollows, 0..1. */
  patina?: number;
};

const PLAIN: FrameSlotFinish = { tint: [1, 1, 1], rough: 1, burnish: 1, wear: 1, carve: 1 };

export type FrameFinish = {
  /** One per material slot. A missing slot is drawn plain. */
  slots?: readonly FrameSlotFinish[];
  /** Swell at the corners and centres, already scaled to the moulding. */
  swell?: Swell | null;
  /** Blocks on the corners, already scaled. */
  blocks?: CornerBlocks | null;
  /** Rails, already scaled. */
  rails?: ReadonlyArray<Rail<ShadedPoint>>;
  /** A scroll's hanging cord, cut for the canvas. */
  cord?: HungCord | null;
};

/** A swell is cut into stations this far apart along the rail, metres,
 *  and into no more than `SWELL_MAX_STEPS`: enough for a smooth outline
 *  at arm's length. A swept frame has about three times the triangles
 *  of a straight one. */
const SWELL_STEP_M = 0.035;
const SWELL_MAX_STEPS = 5;
const swellSteps = (span: number) =>
  Math.max(2, Math.min(SWELL_MAX_STEPS, Math.round(span / SWELL_STEP_M)));

/** 1 at the middle of a swell, 0 at its end and beyond. */
const bump = (t: number) => (t >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * Math.max(0, t))));
/** The same for an ear: full reach to its end, then a short return. */
const EAR_RETURN = 0.94;
const earBump = (t: number) => (t >= 1 ? 0 : t > EAR_RETURN ? (1 - t) / (1 - EAR_RETURN) : 1);

/** The vertex arrays of a frame under construction. */
type Mesh = {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  carveUvs: number[];
  frame: number[];
  indicesBySlot: number[][];
  count: number;
  wallOffset: number;
  slot: (slot: number) => FrameSlotFinish;
};

/** A side of the canvas: outward axis u, along-axis v (u turned a
 *  quarter left), and the half extents measured along u and along v. */
type Side = { u: Normal2; v: Normal2; hu: number; hv: number };

function sidesOf(halfW: number, halfH: number): Record<Rail["side"], Side> {
  return {
    top: { u: [0, 1], v: [-1, 0], hu: halfH, hv: halfW },
    right: { u: [1, 0], v: [0, 1], hu: halfW, hv: halfH },
    bottom: { u: [0, -1], v: [1, 0], hu: halfH, hv: halfW },
    left: { u: [-1, 0], v: [0, -1], hu: halfW, hv: halfH },
  };
}

/** What a profile needs worked out once before it is swept: the normal
 *  at each end of each segment, lengths along it, its carved runs. */
function measure(profile: readonly ShadedPoint[]) {
  const n = profile.length;
  const segNormals: Normal2[] = [];
  for (let i = 0; i < n - 1; i++) segNormals.push(segmentNormal(profile[i], profile[i + 1]));
  // Per segment end, the normal to shade with: the segment's own at a
  // crease or the profile's ends, else the average with its neighbour.
  const endNormal = (seg: number, atStart: boolean): Normal2 => {
    const own = segNormals[seg];
    const pi = atStart ? seg : seg + 1;
    const neighbour = atStart ? seg - 1 : seg + 1;
    if (profile[pi].crease || neighbour < 0 || neighbour >= segNormals.length) return own;
    const other = segNormals[neighbour];
    const x = own[0] + other[0];
    const y = own[1] + other[1];
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  };
  // Cumulative profile length, for the v texture coordinate.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(
      along[i - 1] + Math.hypot(profile[i].o - profile[i - 1].o, profile[i].z - profile[i - 1].z),
    );
  }
  return { endNormal, along, runs: bandRuns(profile, along) };
}

/** The slot's tint on a point: darker in the hollows the more patina
 *  the frame carries. */
function tintAt(look: FrameSlotFinish, ao: number): [number, number, number] {
  const hollow = 1 - Math.min(1, Math.max(0, (ao - 0.5) / 0.45));
  const k = ao * (1 - 0.6 * (look.patina ?? 0) * hollow);
  return [look.tint[0] * k, look.tint[1] * k, look.tint[2] * k];
}

/** One vertex of a moulding: a profile point at a place along a side. */
function pushPoint(
  mesh: Mesh,
  side: Side,
  pt: ShadedPoint,
  normal: Normal2,
  o: number,
  signed: number,
  arcAt: number,
  look: FrameSlotFinish,
  carve: [u: number, v: number, gate: number] | null,
): number {
  mesh.positions.push(
    side.u[0] * (side.hu + o) + signed * side.v[0],
    side.u[1] * (side.hu + o) + signed * side.v[1],
    pt.z - mesh.wallOffset,
  );
  mesh.normals.push(side.u[0] * normal[0], side.u[1] * normal[0], normal[1]);
  mesh.colors.push(...tintAt(look, pt.ao));
  mesh.uvs.push(signed, arcAt);
  mesh.carveUvs.push(carve?.[0] ?? 0, carve?.[1] ?? 0);
  mesh.frame.push(
    look.rough * (1 + (pt.rough - 1) * look.burnish),
    (carve?.[2] ?? 0) * look.carve,
    Math.min(1.5, pt.wear * look.wear),
    pt.ao,
  );
  return mesh.count++;
}

/**
 * Mitre `profile` round the canvas. Geometry groups are the profile's
 * material slots.
 */
function sweep(
  mesh: Mesh,
  profile: readonly ShadedPoint[],
  halfW: number,
  halfH: number,
  swell: Swell | null,
): void {
  const n = profile.length;
  const { endNormal, along, runs } = measure(profile);
  const shell = CARVE_ROWS.shell;
  const swellBump = swell?.ear ? earBump : bump;

  for (const side of Object.values(sidesOf(halfW, halfH))) {
    const hv = side.hv;
    // A swell runs at most half the rail, and the centre one is left
    // out where the two corner swells already fill a short rail.
    const cornerSpan = swell ? Math.min(swell.cornerSpan, hv * 0.5) : 0;
    const centreOn = !!swell && swell.centre > 0 && hv >= swell.cornerSpan + 1.5 * swell.centreSpan;
    const centreSpan = swell && centreOn ? swell.centreSpan : 0;
    /** How far the moulding beyond the pivot is pushed out at `a`
     *  metres from the rail's centre. */
    const swellAt = (a: number) => {
      if (!swell) return 1;
      let f = 1;
      if (cornerSpan > 0) f += swell.corner * swellBump((hv - a) / cornerSpan);
      if (centreSpan > 0) f += swell.centre * bump(a / centreSpan);
      return f;
    };
    const cornerSwell = swell ? 1 + swell.corner : 1;
    const pushed = (o: number, f: number) =>
      swell && o > swell.pivot ? swell.pivot + (o - swell.pivot) * f : o;

    for (let s = 0; s < n - 1; s++) {
      const ends: Array<[ShadedPoint, Normal2, number]> = [
        [profile[s], endNormal(s, true), along[s]],
        [profile[s + 1], endNormal(s, false), along[s + 1]],
      ];
      const run = runs[s];
      const row = run ? CARVE_ROWS[run.band] : null;
      const bandWidth = run ? run.end - run.start : 1;
      const period = row ? row.aspect * bandWidth : 1;
      const slot = profile[s].slot ?? 0;
      const look = mesh.slot(slot);
      const moves = !!swell && (ends[0][0].o > swell.pivot || ends[1][0].o > swell.pivot);

      // A cartouche takes the place of the running ornament at the
      // corners and the centre of a rail: half a shell either side of
      // the centre line, and half on each rail of a corner with the
      // shell's middle on the mitre. By default it goes wherever the
      // moulding swells.
      const halfTile = (shell.aspect * bandWidth) / 2;
      const hosts = !!swell && !!run && run.band === swell.host;
      const atCorners = swell?.cartouche ? true : cornerSwell > 1;
      const atCentres = swell?.cartouche ? swell.cartouche === "both" : centreOn;
      const cornerTile = hosts && atCorners && hv >= 1.2 * halfTile ? halfTile : 0;
      const centreTile = hosts && atCentres && hv >= 3.2 * halfTile ? halfTile : 0;
      // A panel frame is plain between its cartouches.
      const plain = hosts && !!swell?.plain;

      // Stations along the rail, from its centre to the inner corner.
      // The mitre follows as one more. A straight rail needs only the
      // two; a swollen one is cut along each swell.
      const stations = [0, hv];
      if (moves && cornerSpan > 0) {
        if (swell?.ear) {
          stations.push(hv - cornerSpan, hv - cornerSpan * EAR_RETURN);
        } else {
          const steps = swellSteps(cornerSpan);
          for (let k = 1; k <= steps; k++) stations.push(hv - (cornerSpan * k) / steps);
        }
      }
      if (moves && centreSpan > 0) {
        const steps = swellSteps(centreSpan);
        for (let k = 1; k <= steps; k++) stations.push((centreSpan * k) / steps);
      }
      if (cornerTile > 0) stations.push(hv - cornerTile);
      if (centreTile > 0) stations.push(centreTile);
      stations.sort((a, b) => a - b);
      const cuts = stations.filter((a, i) => i === 0 || a - stations[i - 1] > 1e-6);

      // Each rail's two halves keep separate vertices at the centre:
      // the ornament runs toward the centre on both, so one of them is
      // mirrored.
      for (const half of [-1, 1] as const) {
        // One vertex pair (the segment's start and end) at a station.
        // `a` is where the pair sits for a point with o >= 0; the lip
        // reaches over the canvas, where the rail is shorter.
        const pushPair = (a: number, f: number, mitre: boolean, mode: number): number => {
          const base = mesh.count;
          for (const [pt, nrm, arcAt] of ends) {
            const o = pushed(pt.o, f);
            const at = mitre ? hv + o : Math.min(a, hv + Math.min(0, pt.o));
            const signed = half * at;
            // The running ornament's u grows toward the centre; on the
            // left half that is the rail's own direction, on the right
            // half it runs against it. A corner cartouche runs the
            // other way: its middle is on the mitre.
            let carve: [number, number, number] | null = null;
            if (run && row) {
              const t = (arcAt - run.start) / bandWidth;
              if (mode === 0) {
                carve = [
                  carvePeriods(signed, hv, period) / row.repeats,
                  row.v0 + (row.v1 - row.v0) * t,
                  plain ? 0 : -half,
                ];
              } else {
                // Metres along the rail to the shell's middle: the centre
                // line, or the mitre, which lies further out the further
                // the point is from the sight edge.
                const toMiddle = mode === 1 ? at : hv + Math.max(0, o) - at;
                const tile = Math.max(0, 0.5 - (0.5 * toMiddle) / halfTile);
                carve = [
                  tile / shell.repeats,
                  shell.v0 + (shell.v1 - shell.v0) * t,
                  mode === 1 ? -half : half,
                ];
              }
            }
            pushPoint(mesh, side, pt, nrm, o, signed, arcAt, look, carve);
          }
          return base;
        };
        const quad = (near: number, far: number) => {
          // `near` is nearer the rail's centre. Wound so the face looks
          // along the profile's normal; the two halves run in opposite
          // directions along the rail.
          const [a0, b0, a1, b1] = [far, far + 1, near, near + 1];
          if (half === 1) mesh.indicesBySlot[slot].push(a0, a1, b1, a0, b1, b0);
          else mesh.indicesBySlot[slot].push(a1, a0, b0, a1, b0, b1);
        };
        /** 0 running ornament, 1 centre cartouche, 2 corner cartouche. */
        const modeOf = (from: number, to: number) => {
          const mid = (from + to) / 2;
          if (mid < centreTile) return 1;
          if (mid > hv - cornerTile) return 2;
          return 0;
        };

        let prev = -1;
        let prevMode = -1;
        for (let i = 0; i < cuts.length - 1; i++) {
          const mode = modeOf(cuts[i], cuts[i + 1]);
          if (mode !== prevMode) prev = pushPair(cuts[i], swellAt(cuts[i]), false, mode);
          const next = pushPair(cuts[i + 1], swellAt(cuts[i + 1]), false, mode);
          // Over the canvas the lip stops short of the corner: stations
          // beyond its end coincide and there is nothing to draw.
          const reach = hv + Math.min(0, Math.max(ends[0][0].o, ends[1][0].o));
          if (cuts[i] < reach - 1e-9) quad(prev, next);
          prev = next;
          prevMode = mode;
        }
        // From the inner corner out to the mitre.
        if (ends[0][0].o > 0 || ends[1][0].o > 0) {
          const mode = cornerTile > 0 ? 2 : 0;
          if (mode !== prevMode) prev = pushPair(hv, cornerSwell, false, mode);
          quad(prev, pushPair(hv, cornerSwell, true, mode));
        }
      }
    }
  }
}

/** Wall-side foot of a rail's end cap, metres above the wall. */
const CAP_FOOT_Z = 0.004;

/**
 * One straight rail along a side of the canvas, cut square at both
 * ends and closed there. Its ornament is set out from the ends to the
 * middle like a mitred rail's. A rail with `ends` is only its two end
 * pieces, each closed at both cuts.
 */
function addRail(mesh: Mesh, rail: Rail<ShadedPoint>, halfW: number, halfH: number): void {
  const side = sidesOf(halfW, halfH)[rail.side];
  const profile = rail.profile;
  const { endNormal, along, runs } = measure(profile);
  const past = railPast(rail.past);
  // Which half of an upright rail runs up: `v` points down the left
  // side and up the right one.
  const lengthOf = (half: -1 | 1) => side.hv + (half * side.v[1] < 0 ? past.bottom : past.top);
  if (lengthOf(1) <= 0 || lengthOf(-1) <= 0) return;

  for (let s = 0; s < profile.length - 1; s++) {
    const ends: Array<[ShadedPoint, Normal2, number]> = [
      [profile[s], endNormal(s, true), along[s]],
      [profile[s + 1], endNormal(s, false), along[s + 1]],
    ];
    const run = runs[s];
    const row = run ? CARVE_ROWS[run.band] : null;
    const bandWidth = run ? run.end - run.start : 1;
    const period = row ? row.aspect * bandWidth : 1;
    const slot = profile[s].slot ?? 0;
    const look = mesh.slot(slot);

    for (const half of [-1, 1] as const) {
      const length = lengthOf(half);
      const start = rail.ends === undefined ? 0 : Math.max(0, length - rail.ends);
      const pair = (a: number) => {
        const base = mesh.count;
        for (const [pt, nrm, arcAt] of ends) {
          const signed = half * a;
          const carve: [number, number, number] | null =
            run && row
              ? [
                  carvePeriods(signed, length, period) / row.repeats,
                  row.v0 + ((row.v1 - row.v0) * (arcAt - run.start)) / bandWidth,
                  -half,
                ]
              : null;
          pushPoint(mesh, side, pt, nrm, pt.o, signed, arcAt, look, carve);
        }
        return base;
      };
      const near = pair(start);
      const far = pair(length);
      if (half === 1) mesh.indicesBySlot[slot].push(far, near, near + 1, far, near + 1, far + 1);
      else mesh.indicesBySlot[slot].push(near, far, far + 1, near, far + 1, near + 1);

      // A cut: this segment's share of the face, down to the wall,
      // looking `facing` along the rail.
      const [a, b] = [ends[0][0], ends[1][0]];
      if (b.o - a.o < 1e-6) continue;
      const cut = (at: number, facing: -1 | 1) => {
        const base = mesh.count;
        const cap: Array<[number, number]> = [
          [a.o, a.z],
          [b.o, b.z],
          [b.o, CAP_FOOT_Z],
          [a.o, CAP_FOOT_Z],
        ];
        const shade = 0.78;
        for (const [o, z] of cap) {
          mesh.positions.push(
            side.u[0] * (side.hu + o) + at * side.v[0],
            side.u[1] * (side.hu + o) + at * side.v[1],
            z - mesh.wallOffset,
          );
          mesh.normals.push(facing * side.v[0], facing * side.v[1], 0);
          mesh.colors.push(...tintAt(look, shade));
          mesh.uvs.push(o, z);
          mesh.carveUvs.push(0, 0);
          mesh.frame.push(look.rough * 1.2, 0, 0, shade);
          mesh.count++;
        }
        if (facing === 1)
          mesh.indicesBySlot[slot].push(base, base + 1, base + 2, base, base + 2, base + 3);
        else mesh.indicesBySlot[slot].push(base, base + 2, base + 1, base, base + 3, base + 2);
      };
      cut(half * length, half);
      if (start > 0) cut(half * start, half === 1 ? -1 : 1);
    }
  }
}

/** A cord lies this thick on the wall, and its nail stands this far
 *  out of it, metres. */
const CORD_THICK = 0.003;
const NAIL_PROUD = 0.011;

/**
 * A scroll's cord: two straight lengths of braid from the top stave up
 * to a nail over the middle of the canvas, and the nail. Slot 0, in
 * the tone of the roller's knobs.
 */
function addCord(mesh: Mesh, cord: HungCord, halfH: number): void {
  const look = mesh.slot(0);
  const vertex = (x: number, y: number, z: number, n: [number, number, number], ao: number) => {
    mesh.positions.push(x, y, z - mesh.wallOffset);
    mesh.normals.push(...n);
    mesh.colors.push(...tintAt(look, ao));
    mesh.uvs.push(x, y);
    mesh.carveUvs.push(0, 0);
    mesh.frame.push(look.rough * 1.3, 0, 0, ao);
    return mesh.count++;
  };
  /** A bar from `a` to `b` on the wall, `width` across, standing from
   *  the wall to `top`: its face and its two flanks. */
  const bar = (a: Normal2, b: Normal2, width: number, top: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return;
    // Across the bar, a quarter turn left of its run.
    const across: Normal2 = [(-dy / l) * (width / 2), (dx / l) * (width / 2)];
    const corner = (end: Normal2, sign: number): Normal2 => [
      end[0] + sign * across[0],
      end[1] + sign * across[1],
    ];
    const quad = (pts: Array<[Normal2, number]>, n: [number, number, number], ao: number) => {
      const base = mesh.count;
      for (const [[x, y], z] of pts) vertex(x, y, z, n, ao);
      mesh.indicesBySlot[0].push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    quad(
      [
        [corner(a, -1), top],
        [corner(b, -1), top],
        [corner(b, 1), top],
        [corner(a, 1), top],
      ],
      [0, 0, 1],
      1,
    );
    for (const sign of [-1, 1]) {
      const n: [number, number, number] = [
        (sign * across[0] * 2) / width,
        (sign * across[1] * 2) / width,
        0,
      ];
      const [from, to] = sign === 1 ? [a, b] : [b, a];
      quad(
        [
          [corner(from, sign), top],
          [corner(to, sign), top],
          [corner(to, sign), CAP_FOOT_Z],
          [corner(from, sign), CAP_FOOT_Z],
        ],
        n,
        0.7,
      );
    }
  };
  const tieY = halfH + cord.from;
  const nail: Normal2 = [0, tieY + cord.rise];
  const top = CAP_FOOT_Z + CORD_THICK;
  bar([-cord.reach, tieY], nail, cord.width, top);
  bar(nail, [cord.reach, tieY], cord.width, top);
  // The nail: a square head, level, a little wider than the braid.
  const head = cord.width * 0.9;
  bar([-head, nail[1]], [head, nail[1]], 2 * head, CAP_FOOT_Z + NAIL_PROUD);
}

/**
 * A square block on each corner of a mitred frame, from `blocks.from`
 * to the moulding's outer edge both ways, standing `blocks.lift` proud
 * of its highest point and carved with a rosette. Slot 0.
 */
function addBlocks(
  mesh: Mesh,
  profile: readonly ShadedPoint[],
  blocks: CornerBlocks,
  halfW: number,
  halfH: number,
): void {
  const outer = Math.max(...profile.map((pt) => pt.o));
  const top = Math.max(...profile.map((pt) => pt.z)) + blocks.lift - mesh.wallOffset;
  const foot = CAP_FOOT_Z - mesh.wallOffset;
  const size = outer - blocks.from;
  if (size <= 0) return;
  const look = mesh.slot(0);
  const row = CARVE_ROWS.rosette;
  const vertex = (
    x: number,
    y: number,
    z: number,
    normal: [number, number, number],
    ao: number,
    carve: [number, number] | null,
  ) => {
    mesh.positions.push(x, y, z);
    mesh.normals.push(...normal);
    mesh.colors.push(...tintAt(look, ao));
    mesh.uvs.push(x, y);
    mesh.carveUvs.push(carve?.[0] ?? 0, carve?.[1] ?? 0);
    mesh.frame.push(
      look.rough,
      carve ? look.carve : 0,
      carve ? Math.min(1.5, 0.5 * look.wear) : 0,
      ao,
    );
    return mesh.count++;
  };
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x0 = sx * (halfW + blocks.from);
      const x1 = sx * (halfW + outer);
      const y0 = sy * (halfH + blocks.from);
      const y1 = sy * (halfH + outer);
      // Corners of the square, counter-clockwise seen from the front:
      // which way round that is depends on the corner.
      const ccw: Array<[number, number]> =
        sx * sy > 0
          ? [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
            ]
          : [
              [x0, y0],
              [x0, y1],
              [x1, y1],
              [x1, y0],
            ];
      const base = mesh.count;
      for (const [x, y] of ccw) {
        vertex(x, y, top, [0, 0, 1], 1, [
          Math.abs(x - x0) / size / row.repeats,
          row.v0 + ((row.v1 - row.v0) * Math.abs(y - y0)) / size,
        ]);
      }
      mesh.indicesBySlot[0].push(base, base + 1, base + 2, base, base + 2, base + 3);
      // Four sides, each facing away from the block's middle.
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = ccw[i];
        const [bx, by] = ccw[(i + 1) % 4];
        const nx = by - ay;
        const ny = ax - bx;
        const l = Math.hypot(nx, ny) || 1;
        const n: [number, number, number] = [nx / l, ny / l, 0];
        const b = mesh.count;
        vertex(ax, ay, top, n, 0.85, null);
        vertex(bx, by, top, n, 0.85, null);
        vertex(bx, by, foot, n, 0.6, null);
        vertex(ax, ay, foot, n, 0.6, null);
        mesh.indicesBySlot[0].push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
    }
  }
}

/**
 * Build a frame round a canvas of `widthM` × `heightM` centred on the
 * origin: `profile` mitred round it, plus any rails and corner blocks
 * in `finish`. Local z is measured from the Painting group's origin,
 * which sits `wallOffset` in front of the wall, so profile heights
 * shift back by that much. Geometry groups are the material slots.
 *
 * Attributes beyond position and normal:
 *  - `color`: the slot's tint times the baked occlusion.
 *  - `uv`: metres. u along the rail from its centre, v along the profile
 *    from the sight edge. Grain and leaf are read with it, so grain
 *    turns at every mitre.
 *  - `aCarveUv`: the carve atlas, for the carved stretches.
 *  - `aFrame`: x roughness multiplier, y carving depth (its sign flips
 *    the map's u where the ornament runs mirrored), z wear, w occlusion.
 */
export function buildFrameGeometry(
  profile: readonly ShadedPoint[],
  widthM: number,
  heightM: number,
  wallOffset: number,
  finish: FrameFinish = {},
): THREE.BufferGeometry {
  const mesh: Mesh = {
    positions: [],
    normals: [],
    colors: [],
    uvs: [],
    carveUvs: [],
    frame: [],
    indicesBySlot: Array.from({ length: FRAME_SLOTS }, () => []),
    count: 0,
    wallOffset,
    slot: (slot) => finish.slots?.[slot] ?? PLAIN,
  };
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  if (profile.length > 1) {
    sweep(mesh, profile, halfW, halfH, finish.swell ?? null);
    if (finish.blocks) addBlocks(mesh, profile, finish.blocks, halfW, halfH);
  }
  for (const rail of finish.rails ?? []) addRail(mesh, rail, halfW, halfH);
  if (finish.cord) addCord(mesh, finish.cord, halfH);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(mesh.colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute("aCarveUv", new THREE.Float32BufferAttribute(mesh.carveUvs, 2));
  geometry.setAttribute("aFrame", new THREE.Float32BufferAttribute(mesh.frame, 4));
  const index: number[] = [];
  for (let slot = 0; slot < FRAME_SLOTS; slot++) {
    const part = mesh.indicesBySlot[slot];
    if (part.length === 0) continue;
    geometry.addGroup(index.length, part.length, slot);
    for (const i of part) index.push(i);
  }
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}
