// Picture frames as swept mouldings. Each variant is a 2-D moulding
// profile (lib/gallery-layout/frame-profiles.ts) swept round the canvas
// with 45° mitres, the way a framer cuts four lengths of moulding. The
// coves, beads and rolls catch the light differently, a baked
// per-vertex occlusion darkens the recesses, and the surface maps
// (frame-maps.ts, frame-materials.ts) put leaf, grain and carving on it.
//
// All four sides go into one BufferGeometry: one draw call per material
// slot.

import * as THREE from "three";
import type { CarveBand, ShadedPoint } from "@/lib/gallery-layout/frame-profiles";
import { CARVE_ROWS } from "./frame-maps";

export {
  CANVAS_FACE_Z,
  FRAME_PROFILES,
  frameScale,
  profileFrontZ,
  profileWidth,
  scaleProfile,
} from "@/lib/gallery-layout/frame-profiles";

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

/**
 * Sweep `profile` round a canvas of `widthM` × `heightM` centred on the
 * origin. Local z is measured from the Painting group's origin, which
 * sits `wallOffset` in front of the wall, so profile heights shift back
 * by that much. Geometry groups: 0 = moulding, 1 = slip, mat or silk.
 *
 * Attributes beyond position and normal:
 *  - `color`: baked occlusion (grey).
 *  - `uv`: metres. u along the rail from its centre, v along the profile
 *    from the sight edge. Grain and leaf are read with it, so grain
 *    turns at every mitre.
 *  - `aCarveUv`: the carve atlas, for the carved stretches.
 *  - `aFrame`: x roughness multiplier, y carving gate (its sign flips
 *    the map's u on the half of a rail that runs mirrored), z wear.
 */
export function buildFrameGeometry(
  profile: readonly ShadedPoint[],
  widthM: number,
  heightM: number,
  wallOffset: number,
): THREE.BufferGeometry {
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
  const indicesBySlot: [number[], number[]] = [[], []];

  // Cumulative profile length, for the v texture coordinate.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(
      along[i - 1] + Math.hypot(profile[i].o - profile[i - 1].o, profile[i].z - profile[i - 1].z),
    );
  }
  const runs = bandRuns(profile, along);

  let vertex = 0;
  for (const side of sides) {
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

      // Each rail is cut at its two inner corners and its centre, so
      // the carving can be set out from the corners (see carvePeriods).
      // The two halves keep separate vertices at the centre: the map's
      // u runs toward the centre on both, so one of them is mirrored.
      for (const half of [-1, 1] as const) {
        // Columns from the mitre to the centre: where each sits along
        // the rail for a point at offset `o`.
        const columns = (o: number) => [side.hv + o, Math.min(side.hv, side.hv + o), 0];
        const base = vertex;
        for (const [pt, nrm, arcAt] of ends) {
          for (const reach of columns(pt.o)) {
            const a = half * reach;
            positions.push(
              side.u[0] * (side.hu + pt.o) + a * side.v[0],
              side.u[1] * (side.hu + pt.o) + a * side.v[1],
              pt.z - wallOffset,
            );
            normals.push(side.u[0] * nrm[0], side.u[1] * nrm[0], nrm[1]);
            colors.push(pt.ao, pt.ao, pt.ao);
            uvs.push(a, arcAt);
            if (run && row) {
              const t = (arcAt - run.start) / bandWidth;
              carveUvs.push(
                carvePeriods(a, side.hv, period) / row.repeats,
                row.v0 + (row.v1 - row.v0) * t,
              );
            } else {
              carveUvs.push(0, 0);
            }
            // On the left half the map's u grows with the rail's own u;
            // on the right half it runs against it.
            frame.push(pt.rough, run ? -half : 0, pt.wear);
            vertex++;
          }
        }
        // base + 0..2: the segment's start at mitre, corner, centre;
        // base + 3..5: its end at the same three columns.
        for (let c = 0; c < 2; c++) {
          // The lip reaches over the canvas, where the rail is shorter
          // than the canvas edge and the mitre column coincides with
          // the corner column: nothing to draw between them.
          if (c === 0 && ends[0][0].o <= 0 && ends[1][0].o <= 0) continue;
          const a0 = base + c;
          const a1 = base + c + 1;
          const b0 = base + 3 + c;
          const b1 = base + 3 + c + 1;
          // Wound so the face looks along the profile's normal; the two
          // halves run in opposite directions along the rail.
          if (half === 1) indicesBySlot[slot].push(a0, a1, b1, a0, b1, b0);
          else indicesBySlot[slot].push(a1, a0, b0, a1, b0, b1);
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
  geometry.setAttribute("aFrame", new THREE.Float32BufferAttribute(frame, 3));
  const [moulding, slip] = indicesBySlot;
  geometry.setIndex([...moulding, ...slip]);
  geometry.addGroup(0, moulding.length, 0);
  if (slip.length > 0) geometry.addGroup(moulding.length, slip.length, 1);
  geometry.computeBoundingSphere();
  return geometry;
}
