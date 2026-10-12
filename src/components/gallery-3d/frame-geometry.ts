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
// All four sides go into one BufferGeometry: one draw call per material
// slot the moulding uses.

import * as THREE from "three";
import { type CarveBand, FRAME_SLOTS, type ShadedPoint } from "@/lib/gallery-layout/frame-profiles";
import type { Swell } from "@/lib/gallery-layout/frame-styles";
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
};

const PLAIN: FrameSlotFinish = { tint: [1, 1, 1], rough: 1, burnish: 1, wear: 1, carve: 1 };

export type FrameFinish = {
  /** One per material slot. A missing slot is drawn plain. */
  slots?: readonly FrameSlotFinish[];
  /** Swell at the corners and centres, already scaled to the moulding. */
  swell?: Swell | null;
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

/**
 * Sweep `profile` round a canvas of `widthM` × `heightM` centred on the
 * origin. Local z is measured from the Painting group's origin, which
 * sits `wallOffset` in front of the wall, so profile heights shift back
 * by that much. Geometry groups are the profile's material slots.
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
  const n = profile.length;
  const swell = finish.swell ?? null;
  const slotFinish = (slot: number) => finish.slots?.[slot] ?? PLAIN;
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

  const halfW = widthM / 2;
  const halfH = heightM / 2;
  // Each side: outward axis u, along-axis v (u turned a quarter left),
  // and the half extents measured along u and along v.
  const sides: Array<{ u: Normal2; v: Normal2; hu: number; hv: number }> = [
    { u: [0, 1], v: [-1, 0], hu: halfH, hv: halfW },
    { u: [1, 0], v: [0, 1], hu: halfW, hv: halfH },
    { u: [0, -1], v: [1, 0], hu: halfH, hv: halfW },
    { u: [-1, 0], v: [0, -1], hu: halfW, hv: halfH },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const carveUvs: number[] = [];
  const frame: number[] = [];
  const indicesBySlot: number[][] = Array.from({ length: FRAME_SLOTS }, () => []);

  // Cumulative profile length, for the v texture coordinate.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(
      along[i - 1] + Math.hypot(profile[i].o - profile[i - 1].o, profile[i].z - profile[i - 1].z),
    );
  }
  const runs = bandRuns(profile, along);
  const shell = CARVE_ROWS.shell;

  let vertex = 0;
  for (const side of sides) {
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
      if (cornerSpan > 0) f += swell.corner * bump((hv - a) / cornerSpan);
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
      const look = slotFinish(slot);
      const moves = !!swell && (ends[0][0].o > swell.pivot || ends[1][0].o > swell.pivot);

      // A cartouche takes the place of the running ornament at the
      // corners and the centre of a swollen rail: half a shell either
      // side of the centre line, and half on each rail of a corner with
      // the shell's middle on the mitre.
      const halfTile = (shell.aspect * bandWidth) / 2;
      const hosts = !!swell && !!run && run.band === swell.host;
      const cornerTile = hosts && cornerSwell > 1 && hv >= 1.2 * halfTile ? halfTile : 0;
      const centreTile = hosts && centreOn && hv >= 3.2 * halfTile ? halfTile : 0;

      // Stations along the rail, from its centre to the inner corner.
      // The mitre follows as one more. A straight rail needs only the
      // two; a swollen one is cut along each swell.
      const stations = [0, hv];
      if (moves && cornerSpan > 0) {
        const steps = swellSteps(cornerSpan);
        for (let k = 1; k <= steps; k++) stations.push(hv - (cornerSpan * k) / steps);
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
          const base = vertex;
          for (const [pt, nrm, arcAt] of ends) {
            const o = pushed(pt.o, f);
            const at = mitre ? hv + o : Math.min(a, hv + Math.min(0, pt.o));
            const signed = half * at;
            positions.push(
              side.u[0] * (side.hu + o) + signed * side.v[0],
              side.u[1] * (side.hu + o) + signed * side.v[1],
              pt.z - wallOffset,
            );
            normals.push(side.u[0] * nrm[0], side.u[1] * nrm[0], nrm[1]);
            colors.push(look.tint[0] * pt.ao, look.tint[1] * pt.ao, look.tint[2] * pt.ao);
            uvs.push(signed, arcAt);
            // The running ornament's u grows toward the centre; on the
            // left half that is the rail's own direction, on the right
            // half it runs against it. A corner cartouche runs the
            // other way: its middle is on the mitre.
            let gate = 0;
            if (run && row) {
              const t = (arcAt - run.start) / bandWidth;
              if (mode === 0) {
                carveUvs.push(
                  carvePeriods(signed, hv, period) / row.repeats,
                  row.v0 + (row.v1 - row.v0) * t,
                );
                gate = -half;
              } else {
                // Metres along the rail to the shell's middle: the centre
                // line, or the mitre, which lies further out the further
                // the point is from the sight edge.
                const toMiddle = mode === 1 ? at : hv + Math.max(0, o) - at;
                const tile = Math.max(0, 0.5 - (0.5 * toMiddle) / halfTile);
                carveUvs.push(tile / shell.repeats, shell.v0 + (shell.v1 - shell.v0) * t);
                gate = mode === 1 ? -half : half;
              }
            } else {
              carveUvs.push(0, 0);
            }
            frame.push(
              look.rough * (1 + (pt.rough - 1) * look.burnish),
              gate * look.carve,
              Math.min(1.5, pt.wear * look.wear),
              pt.ao,
            );
            vertex++;
          }
          return base;
        };
        const quad = (near: number, far: number) => {
          // `near` is nearer the rail's centre. Wound so the face looks
          // along the profile's normal; the two halves run in opposite
          // directions along the rail.
          const [a0, b0, a1, b1] = [far, far + 1, near, near + 1];
          if (half === 1) indicesBySlot[slot].push(a0, a1, b1, a0, b1, b0);
          else indicesBySlot[slot].push(a1, a0, b0, a1, b0, b1);
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aCarveUv", new THREE.Float32BufferAttribute(carveUvs, 2));
  geometry.setAttribute("aFrame", new THREE.Float32BufferAttribute(frame, 4));
  const index: number[] = [];
  for (let slot = 0; slot < FRAME_SLOTS; slot++) {
    const part = indicesBySlot[slot];
    if (part.length === 0) continue;
    geometry.addGroup(index.length, part.length, slot);
    for (const i of part) index.push(i);
  }
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}
