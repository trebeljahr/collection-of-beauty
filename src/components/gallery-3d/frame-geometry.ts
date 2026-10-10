// Picture frames as swept mouldings. A frame used to be one box behind
// the canvas, which read as a flat border from any distance. Here each
// variant is a 2-D moulding profile swept round the canvas with 45°
// mitres, the way a framer cuts four lengths of moulding. The coves,
// beads and rolls catch the environment map differently, and a baked
// per-vertex occlusion darkens the recesses, so a frame reads as carved
// without a texture or a light of its own.
//
// All four sides go into one BufferGeometry: one draw call per material
// slot, the same as the old box plus liner.

import * as THREE from "three";

/** One point of a moulding cross-section.
 *  - `o`: outward offset from the canvas edge, metres. Negative values
 *    reach over the canvas: that is the rabbet lip that hides its edge.
 *  - `z`: height above the wall surface, metres.
 *  - `ao`: baked occlusion, 1 = fully open. Defaults to 1.
 *  - `slot`: material slot of the segment that starts at this point
 *    (0 = moulding, 1 = slip or fillet). Defaults to 0.
 *  - `crease`: a hard edge here instead of a smoothed one. */
export type ProfilePoint = {
  o: number;
  z: number;
  ao?: number;
  slot?: 0 | 1;
  crease?: boolean;
};

/** Height of the canvas face above the wall: PAINTING_WALL_OFFSET (0.02)
 *  plus the canvas plane's local z (0.014). Every lip must clear it. */
export const CANVAS_FACE_Z = 0.034;

// Profiles run from the sight edge outward and end on the wall. The
// widest stays under 0.05 m: the plaque's left edge sits PLAQUE_GAP
// (0.06 m) right of the canvas, and place-paintings budgets the wall by
// that footprint, so a wider frame would run into its own label.
export const FRAME_PROFILES = {
  // Carved gilt: a velvet slip, a sight bead, a cove, an ogee rising to
  // a burnished top roll, and a rounded back edge.
  gilded: [
    { o: -0.005, z: 0.0365, slot: 1, ao: 0.55 },
    { o: 0.006, z: 0.0375, slot: 1, ao: 0.7, crease: true },
    { o: 0.006, z: 0.041, ao: 0.6, crease: true },
    { o: 0.009, z: 0.0445 },
    { o: 0.0125, z: 0.0415, ao: 0.55 },
    { o: 0.017, z: 0.0405, ao: 0.5 },
    { o: 0.023, z: 0.0455, ao: 0.75 },
    { o: 0.03, z: 0.053 },
    { o: 0.037, z: 0.0575 },
    { o: 0.0435, z: 0.0555 },
    { o: 0.048, z: 0.049, ao: 0.85 },
    { o: 0.049, z: 0.04, ao: 0.7, crease: true },
    { o: 0.049, z: 0.004, ao: 0.35 },
  ],
  // Dark walnut: a bevelled sight edge and a broad, slightly falling
  // face with a rounded outer edge.
  walnut: [
    { o: -0.004, z: 0.0365, ao: 0.6, crease: true },
    { o: -0.001, z: 0.0425, crease: true },
    { o: 0.006, z: 0.0475 },
    { o: 0.026, z: 0.046 },
    { o: 0.032, z: 0.0435 },
    { o: 0.035, z: 0.038, ao: 0.8, crease: true },
    { o: 0.035, z: 0.004, ao: 0.4 },
  ],
  // Slim black box frame: a sharp inner wall and a flat face.
  ebony: [
    { o: -0.004, z: 0.0365, ao: 0.55, crease: true },
    { o: -0.004, z: 0.047, crease: true },
    { o: 0.0, z: 0.049 },
    { o: 0.016, z: 0.049 },
    { o: 0.0195, z: 0.0465, crease: true },
    { o: 0.0195, z: 0.004, ao: 0.4 },
  ],
  // Pale ash: a low, wide, gently rounded profile with a soft step.
  paleAsh: [
    { o: -0.004, z: 0.0365, ao: 0.65, crease: true },
    { o: 0.0, z: 0.0415 },
    { o: 0.006, z: 0.0435 },
    { o: 0.012, z: 0.0435, crease: true },
    { o: 0.014, z: 0.046 },
    { o: 0.033, z: 0.0465 },
    { o: 0.039, z: 0.043 },
    { o: 0.04, z: 0.038, ao: 0.8, crease: true },
    { o: 0.04, z: 0.004, ao: 0.4 },
  ],
  // Red-black lacquer with a gold inner fillet.
  redLacquer: [
    { o: -0.004, z: 0.0365, slot: 1, ao: 0.7 },
    { o: 0.0, z: 0.0405, slot: 1 },
    { o: 0.004, z: 0.041, slot: 1, crease: true },
    { o: 0.005, z: 0.045, crease: true },
    { o: 0.026, z: 0.046 },
    { o: 0.03, z: 0.042 },
    { o: 0.0305, z: 0.037, ao: 0.8, crease: true },
    { o: 0.0305, z: 0.004, ao: 0.4 },
  ],
} satisfies Record<string, ProfilePoint[]>;

export type FrameProfileId = keyof typeof FRAME_PROFILES;

/** Outer reach of a profile past the canvas edge, metres. */
export function profileWidth(profile: readonly ProfilePoint[]): number {
  return Math.max(...profile.map((p) => p.o));
}

/** Highest point of a profile above the wall, metres. */
export function profileFrontZ(profile: readonly ProfilePoint[]): number {
  return Math.max(...profile.map((p) => p.z));
}

/** Scale a profile for the size of the work. Small works get a slimmer
 *  moulding, the way a framer would cut it. Only the part in front of
 *  the canvas face is scaled, so the lip always stays in front of it. */
export function scaleProfile(profile: readonly ProfilePoint[], scale: number): ProfilePoint[] {
  return profile.map((p) => ({
    ...p,
    o: p.o * scale,
    z: p.z > CANVAS_FACE_Z ? CANVAS_FACE_Z + (p.z - CANVAS_FACE_Z) * scale : p.z,
  }));
}

/** Moulding scale for a canvas of the given size, metres. */
export function frameScale(widthM: number, heightM: number): number {
  return Math.min(1, Math.max(0.62, 0.55 + 0.22 * Math.max(widthM, heightM)));
}

type Normal2 = [number, number];

function segmentNormal(a: ProfilePoint, b: ProfilePoint): Normal2 {
  // Rotate the segment direction (do, dz) a quarter turn to (-dz, do):
  // for a profile walked outward this points to the viewer's side.
  const dO = b.o - a.o;
  const dZ = b.z - a.z;
  const l = Math.hypot(dO, dZ) || 1;
  return [-dZ / l, dO / l];
}

/**
 * Sweep `profile` round a canvas of `widthM` × `heightM` centred on the
 * origin. Local z is measured from the Painting group's origin, which
 * sits `wallOffset` in front of the wall, so profile heights shift back
 * by that much. Geometry groups: 0 = moulding, 1 = slip / fillet.
 */
export function buildFrameGeometry(
  profile: readonly ProfilePoint[],
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
  const indicesBySlot: [number[], number[]] = [[], []];

  // Cumulative profile length, for the v texture coordinate.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) {
    along.push(
      along[i - 1] + Math.hypot(profile[i].o - profile[i - 1].o, profile[i].z - profile[i - 1].z),
    );
  }

  let vertex = 0;
  for (const side of sides) {
    for (let s = 0; s < n - 1; s++) {
      const a = profile[s];
      const b = profile[s + 1];
      const na = endNormal(s, true);
      const nb = endNormal(s, false);
      // Corner points at offset o: centre + u·(hu + o) ± v·(hv + o).
      // Mitres fall out of using the same o along both sides.
      const quad: Array<[ProfilePoint, Normal2, number, number]> = [
        [a, na, 1, along[s]],
        [a, na, -1, along[s]],
        [b, nb, -1, along[s + 1]],
        [b, nb, 1, along[s + 1]],
      ];
      for (const [p, nrm, sign, vCoord] of quad) {
        const reachU = side.hu + p.o;
        const reachV = side.hv + p.o;
        positions.push(
          side.u[0] * reachU + sign * side.v[0] * reachV,
          side.u[1] * reachU + sign * side.v[1] * reachV,
          p.z - wallOffset,
        );
        normals.push(side.u[0] * nrm[0], side.u[1] * nrm[0], nrm[1]);
        const ao = p.ao ?? 1;
        colors.push(ao, ao, ao);
        uvs.push(sign * reachV, vCoord);
      }
      const slot = a.slot ?? 0;
      indicesBySlot[slot].push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
      vertex += 4;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const [moulding, slip] = indicesBySlot;
  geometry.setIndex([...moulding, ...slip]);
  geometry.addGroup(0, moulding.length, 0);
  if (slip.length > 0) geometry.addGroup(moulding.length, slip.length, 1);
  geometry.computeBoundingSphere();
  return geometry;
}
