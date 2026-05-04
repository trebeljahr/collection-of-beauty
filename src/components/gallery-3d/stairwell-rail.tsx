"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorLayout } from "@/lib/gallery-layout/types";
import { SPIRAL_FLOOR_CUTOUT_RADIUS, SPIRAL_INNER_RADIUS } from "@/lib/gallery-layout/world-coords";
import {
  BALUSTER_HEIGHT,
  BALUSTER_SIZE,
  RAIL_BAR_HALF_WIDTH,
  RAIL_BAR_HEIGHT,
  RAIL_HEIGHT,
} from "./rail-constants";
import { StairSign, spiralGateHalfArc } from "./staircase";

// Materials are still local — the cutout-edge rail and the spiral rails
// share the same colour vocabulary, but allocating duplicate
// MeshStandardMaterial instances is cheap and keeps each file's
// material set obvious at a glance.
const railTopMaterial = new THREE.MeshStandardMaterial({
  color: "#a07a40",
  roughness: 0.55,
  metalness: 0.5,
});
const balusterMaterial = new THREE.MeshStandardMaterial({
  color: "#0f0c08",
  roughness: 0.7,
  metalness: 0.4,
});
const gatePostMaterial = new THREE.MeshStandardMaterial({
  color: "#1a120a",
  roughness: 0.7,
  metalness: 0.45,
});

/** Gate-post tangent width — wide enough for the sign plaque to fit
 *  flush within it (no horizontal "crossbeam" sticking out beyond
 *  the post), so post + sign reads as one architectural pylon rather
 *  than a + cross. */
const GATE_POST_TANGENT_WIDTH = 0.85;
/** Gate-post radial depth — kept slim so it reads as a wayfinding
 *  pylon rather than a fat column. */
const GATE_POST_RADIAL_DEPTH = 0.18;
const GATE_POST_HEIGHT = 2.4;
/** Radial offset of the cutout-edge rail's centerline from the
 *  stairwell hole's edge. Exported because player.tsx needs the same
 *  number for collision clearance — keeping the two in lockstep
 *  prevents the player from walking through the rail (or floating
 *  away from it) after a tweak here. */
export const CUTOUT_RAIL_RADIUS = SPIRAL_FLOOR_CUTOUT_RADIUS + 0.18;
// Half-arc of the entry gate is now derived per-stair from the
// spiral's numSteps (`spiralGateHalfArc(numSteps)`), so the cutout-edge
// gate aligns exactly with the spiral rail's gap above and below.

/** Build the cutout-edge top rail as a CLOSED RECTANGULAR TUBE
 *  following a circle of radius `radius` at height `y + RAIL_HEIGHT`,
 *  skipping a centred gate of width 2 * gateHalfArc around
 *  `entryAngle` — except where one of the gate's halves has no stair
 *  to continue onto. On a dead-end half (top-floor up / ground-floor
 *  down), the rail extends right up to entryAngle so the gap in the
 *  rail only opens onto solid floor or onto an actual stair, never
 *  onto empty air over the spiral well.
 *
 *  We walk a SINGLE linear arc from one gate edge to the other,
 *  rather than iterating theta in [0, 2π] and skipping the gap. The
 *  earlier "iterate 0→2π and skip" approach split the rail into two
 *  segments whenever the gate didn't straddle theta=0, since the
 *  loop's start (theta=0) and end (theta=2π) sat on the same point
 *  but inside DIFFERENT segments — leaving a hidden seam at that
 *  wrap-around and (when we still emitted finials) a redundant pair
 *  of newel caps at a mid-rail position. Walking the single arc
 *  guarantees one continuous segment regardless of entryAngle. */
function buildCutoutRailGeometry(
  radius: number,
  y: number,
  entryAngle: number,
  upGap: number,
  downGap: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const yTop = y + RAIL_HEIGHT;
  // Single arc from gap-exit to gap-entry. `upGap` is the angular
  // distance from entryAngle that the rail leaves uncovered on the
  // CCW (up) side — 0 means the rail extends fully through to
  // entryAngle, gateHalfArc means it stops at the up gate-post.
  // `downGap` is the same on the CW (down) side. Callers compute
  // both directly so the rail can leave a partial gap (e.g. when a
  // curved L-bridge merger eats part of the dead-end closure).
  const startTheta = entryAngle + upGap;
  const totalArc = Math.PI * 2 - upGap - downGap;
  // Sample density matches the old 80-segments-around-2π density so
  // the curve reads equally smooth at any gate position.
  const segments = Math.max(2, Math.round((totalArc / (Math.PI * 2)) * 80));
  let prevBaseIdx = -1;
  const segmentStartIdx = 0;

  for (let s = 0; s <= segments; s++) {
    const theta = startTheta + (s / segments) * totalArc;
    const cx = radius * Math.cos(theta);
    const cz = radius * Math.sin(theta);
    const ox = Math.cos(theta);
    const oz = Math.sin(theta);

    const baseIdx = positions.length / 3;
    // 0=TO, 1=TI, 2=BI, 3=BO (same convention as the spiral rail).
    positions.push(cx + ox * RAIL_BAR_HALF_WIDTH, yTop, cz + oz * RAIL_BAR_HALF_WIDTH);
    positions.push(cx - ox * RAIL_BAR_HALF_WIDTH, yTop, cz - oz * RAIL_BAR_HALF_WIDTH);
    positions.push(
      cx - ox * RAIL_BAR_HALF_WIDTH,
      yTop - RAIL_BAR_HEIGHT,
      cz - oz * RAIL_BAR_HALF_WIDTH,
    );
    positions.push(
      cx + ox * RAIL_BAR_HALF_WIDTH,
      yTop - RAIL_BAR_HEIGHT,
      cz + oz * RAIL_BAR_HALF_WIDTH,
    );

    if (prevBaseIdx !== -1) {
      const p = prevBaseIdx;
      const c = baseIdx;
      // Top (+Y), Bottom (−Y), Outer (+radial), Inner (−radial).
      indices.push(p + 0, p + 1, c + 1);
      indices.push(p + 0, c + 1, c + 0);
      indices.push(p + 3, c + 3, c + 2);
      indices.push(p + 3, c + 2, p + 2);
      indices.push(p + 3, p + 0, c + 0);
      indices.push(p + 3, c + 0, c + 3);
      indices.push(p + 2, c + 2, c + 1);
      indices.push(p + 2, c + 1, p + 1);
    }
    prevBaseIdx = baseIdx;
  }
  // Cap both ends so the open rectangular cross-section doesn't read
  // as a black slot when the camera looks down the rail's tangent.
  // The gate posts mostly hide these ends, but the cap is cheap and
  // covers any sliver visible past the post's edge.
  const startEnd = segmentStartIdx;
  const endEnd = prevBaseIdx;
  if (endEnd > startEnd) {
    indices.push(startEnd + 0, startEnd + 2, startEnd + 1);
    indices.push(startEnd + 0, startEnd + 3, startEnd + 2);
    indices.push(endEnd + 0, endEnd + 1, endEnd + 2);
    indices.push(endEnd + 0, endEnd + 2, endEnd + 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Sample a regular series of baluster positions around the cutout
 *  rail, skipping each gate-half only when that half opens onto an
 *  actual stair. Dead-end halves get a full set of balusters so the
 *  rail visually closes the gap. */
function buildCutoutBalusters(
  radius: number,
  y: number,
  entryAngle: number,
  upGap: number,
  downGap: number,
): Array<{ pos: [number, number, number]; angle: number }> {
  const out: Array<{ pos: [number, number, number]; angle: number }> = [];
  // ~30 cm arc length between balusters at radius=5.5 → 30 balusters
  // around 2π. Round to a nice integer.
  const count = 28;
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const angDiff = Math.atan2(Math.sin(theta - entryAngle), Math.cos(theta - entryAngle));
    // Skip balusters that fall inside an open gate-half — the rail
    // tube doesn't cover that arc, so balusters there would float.
    if (angDiff > 0 && angDiff < upGap) continue;
    if (angDiff <= 0 && -angDiff < downGap) continue;
    out.push({
      pos: [radius * Math.cos(theta), y + BALUSTER_HEIGHT / 2, radius * Math.sin(theta)],
      angle: theta,
    });
  }
  return out;
}

/** Build a swept rectangular-tube geometry for the dead-end L-bridge.
 *  The curve scrolls inward from the up-side gate post (postA), sweeping
 *  CW back toward the entry direction while spiralling radially in from
 *  the cutout-rail outer radius to the spiral inner rail's centerline.
 *  The cutout rail's CCW start lives at exactly the angle where this
 *  curve ends, so the two pieces merge cleanly into one continuous
 *  handrail closing off the up-side dead-end.
 *
 *  Path:
 *    r(t) = innerR + (outerR - innerR) · smoothstep(t)
 *    θ(t) = postAngle + arcDirection · arcSweep · t
 *
 *  The smoothstep on r flattens the radial component near the
 *  endpoints so the tangent at t=0 and t=1 is mostly angular,
 *  matching the directions of the spiral and cutout rails respectively.
 *  The cross-section uses the radial (cos θ, sin θ) as the "outward"
 *  axis at each sample — same convention as buildCutoutRailGeometry,
 *  so the merger's outer end mates cleanly with the cutout rail's
 *  cross-section at the merge angle. */
function buildDeadEndArcGeom(
  cx: number,
  cz: number,
  yTop: number,
  postAngle: number,
  innerR: number,
  outerR: number,
  arcDirection: number,
  arcSweep: number,
): {
  rail: THREE.BufferGeometry;
  balusters: Array<[number, number, number]>;
} {
  const N = 28;
  const positions: number[] = [];
  const indices: number[] = [];
  const balusters: Array<[number, number, number]> = [];
  let prevBaseIdx = -1;
  const sampleCenters: Array<[number, number, number]> = [];

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = t * t * (3 - 2 * t); // smoothstep
    const r = innerR + (outerR - innerR) * u;
    const theta = postAngle + arcDirection * arcSweep * t;
    const x = cx + r * Math.cos(theta);
    const z = cz + r * Math.sin(theta);
    const ox = Math.cos(theta);
    const oz = Math.sin(theta);

    const baseIdx = positions.length / 3;
    // Same TO/TI/BI/BO layout as the cutout rail tube.
    positions.push(x + ox * RAIL_BAR_HALF_WIDTH, yTop, z + oz * RAIL_BAR_HALF_WIDTH);
    positions.push(x - ox * RAIL_BAR_HALF_WIDTH, yTop, z - oz * RAIL_BAR_HALF_WIDTH);
    positions.push(
      x - ox * RAIL_BAR_HALF_WIDTH,
      yTop - RAIL_BAR_HEIGHT,
      z - oz * RAIL_BAR_HALF_WIDTH,
    );
    positions.push(
      x + ox * RAIL_BAR_HALF_WIDTH,
      yTop - RAIL_BAR_HEIGHT,
      z + oz * RAIL_BAR_HALF_WIDTH,
    );

    if (prevBaseIdx !== -1) {
      const p = prevBaseIdx;
      const c = baseIdx;
      indices.push(p + 0, p + 1, c + 1);
      indices.push(p + 0, c + 1, c + 0);
      indices.push(p + 3, c + 3, c + 2);
      indices.push(p + 3, c + 2, p + 2);
      indices.push(p + 3, p + 0, c + 0);
      indices.push(p + 3, c + 0, c + 3);
      indices.push(p + 2, c + 2, c + 1);
      indices.push(p + 2, c + 1, p + 1);
    }
    prevBaseIdx = baseIdx;
    sampleCenters.push([x, yTop - RAIL_BAR_HEIGHT / 2, z]);
  }

  // End caps so the open cross-section doesn't read as a slot when
  // viewed end-on (the spiral rail's finial covers the inner end and
  // the cutout rail butts into the outer end, but the caps are cheap
  // insurance).
  if (sampleCenters.length >= 2) {
    const startBase = 0;
    const endBase = positions.length / 3 - 4;
    indices.push(startBase + 0, startBase + 2, startBase + 1);
    indices.push(startBase + 0, startBase + 3, startBase + 2);
    indices.push(endBase + 0, endBase + 1, endBase + 2);
    indices.push(endBase + 0, endBase + 2, endBase + 3);
  }

  // ~40 cm baluster spacing along the curve. With radialLen ≈ 2.95 m
  // and an extra ~10° of arc, the curve is roughly 3 m long → 7
  // balusters reads as a real fence rather than a beam over empty
  // space. Skip the very first and last samples so the balusters don't
  // crash into the spiral rail's finial or the cutout rail's start.
  const balusterCount = 7;
  for (let i = 1; i <= balusterCount; i++) {
    const t = i / (balusterCount + 1);
    const idx = Math.round(t * N);
    const [x, , z] = sampleCenters[idx];
    balusters.push([x, yTop - RAIL_BAR_HEIGHT - BALUSTER_HEIGHT / 2, z]);
  }

  const rail = new THREE.BufferGeometry();
  rail.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  rail.setIndex(indices);
  rail.computeVertexNormals();
  return { rail, balusters };
}

/**
 * Curved L-bridge: a swept rectangular-tube handrail that closes off
 * the up-side dead-end on the topmost flight (where there's no flight
 * continuing up). Anchored at the up-side gate post (postA) and curls
 * CW toward the entry direction, sweeping radially inward from the
 * cutout rail's outer radius down to the spiral inner rail's centerline.
 * The cutout rail's CCW start lives exactly `arcSweep` radians CW of
 * postA (see the upGap math in StairwellAccents), so the two pieces
 * meet at the merge angle with no overlap and no floating gap.
 *
 * The curve is purely a function of postA's geometry — it doesn't
 * depend on the spiral's rotation direction. The spiral's inner rail
 * terminates at postB on every direction=+1 flight (every flight in
 * this codebase), so an L-bridge anchored at postA is by design a
 * separate architectural piece, not a continuation of the spiral's
 * helical rail. Trying to anchor at postB instead would force the
 * cutout rail to encroach on the down-side walkway, which would block
 * the stair the player came up.
 */
function DeadEndLBridge({
  cx,
  cz,
  y,
  post,
  arcSweep,
}: {
  cx: number;
  cz: number;
  y: number;
  post: { x: number; z: number; angle: number };
  /** How far the merger arc sweeps angularly before joining the cutout
   *  rail. Must be < gateHalfArc so the merge point still lands on the
   *  closed (rail-extended) half of the gate. */
  arcSweep: number;
}) {
  // outerR = the gate post's distance from the spiral centre (i.e.
  // the cutout-rail radius). innerR = the spiral inner rail's
  // centerline.
  const outerR = Math.hypot(post.x - cx, post.z - cz);
  const innerR = SPIRAL_INNER_RADIUS + RAIL_BAR_HALF_WIDTH;
  // yTop is the TOP face of the bar — same convention as the cutout
  // rail's tube vertices, which place TO/TI at yTop and BI/BO at
  // yTop - RAIL_BAR_HEIGHT.
  const yTop = y + RAIL_HEIGHT;
  // Sweep CW from postA toward entry. The cutout rail's CCW start sits
  // at postA-angle - arcSweep (see upGap in StairwellAccents), so this
  // gives a clean merge with no overlap. Earlier this followed
  // spiralDirection — that produced a CCW sweep on direction=+1 spirals
  // (every spiral in this codebase), which curved AWAY from entry and
  // overlapped the cutout rail going CCW past postA, with the L-bridge
  // visibly wrapping over the rail.
  const arcDirection = -1;

  const { rail, balusters } = useMemo(
    () => buildDeadEndArcGeom(cx, cz, yTop, post.angle, innerR, outerR, arcDirection, arcSweep),
    [cx, cz, yTop, post.angle, innerR, outerR, arcDirection, arcSweep],
  );
  useEffect(() => () => rail.dispose(), [rail]);

  return (
    <group>
      <mesh geometry={rail} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {balusters.map((b, i) => (
        <mesh key={`l-bal-${i}`} position={b} castShadow>
          <boxGeometry args={[BALUSTER_SIZE, BALUSTER_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Per-floor stairwell accents: cutout-edge railing (only on floors
 * above the ground, where there's a hole in the floor to fall into),
 * a pair of gate posts at the entry direction, and the directional
 * signs mounted on the gate posts. The signs face outward — toward
 * the player approaching from the grand-hall door — so they read
 * face-on as you walk up to the staircase.
 */
export function StairwellAccents({ floor }: { floor: FloorLayout }) {
  const stairwell = useMemo(() => floor.rooms.find((r) => r.isStairwell) ?? null, [floor.rooms]);

  // The ground floor has no cutout — the spiral rises out of solid
  // ground — so there's nothing to fence off. Render only the gate
  // posts + signs (still useful wayfinding) and skip the cutout-edge
  // rail, balusters, and dead-end L-bridge, which would otherwise float
  // around an imaginary hole in a solid floor.
  const hasCutout = floor.index > 0;

  const data = useMemo(() => {
    if (!stairwell) return null;
    const stairOut = floor.stairsOut[0];
    const stairIn = floor.stairsIn[0];
    const reference = stairOut ?? stairIn;
    if (!reference) return null;
    const cx = reference.centerX;
    const cz = reference.centerZ;
    const railR = CUTOUT_RAIL_RADIUS;
    const gateHalfArc = spiralGateHalfArc(reference.numSteps);
    // The "up" half of the gate is only meaningful when this floor
    // actually has an upgoing stair; same for the "down" half. On the
    // top floor, stairsOut is empty so the up-half is a dead end and
    // the rail closes there. On the ground floor, stairsIn is empty.
    const upSideOpen = !!stairOut;
    const downSideOpen = !!stairIn;
    // The dead-end L-bridge on the top floor doesn't terminate at the
    // gate post — it sweeps angularly past it as a curved scroll and
    // merges tangentially with the cutout rail. The cutout rail has
    // to make room for that merger by leaving a small gap on the
    // up-side equal to the merger's arcSweep. ~60% of gateHalfArc
    // gives a curve big enough to read as an architectural scroll
    // without nibbling so far into the closure that the rail's
    // missing chunk reads as a second gap.
    const lBridgeArcSweep = gateHalfArc * 0.6;
    // upGap: how much arc the rail leaves uncovered on the CCW (up)
    // side of entry. When there's an upgoing stair, the full gateHalfArc
    // is the player's walkway. On the top floor we close most of that
    // half but leave lBridgeArcSweep of gap so the curved L-bridge
    // can mate tangentially. downGap mirrors downSideOpen — every
    // non-ground floor has a downgoing stair, so the rail leaves a
    // full walkway gap there.
    const upGap = upSideOpen ? gateHalfArc : gateHalfArc - lBridgeArcSweep;
    const downGap = downSideOpen ? gateHalfArc : 0;
    // Skipped on the ground floor — see hasCutout above. The bottom
    // floor's spiral rises out of solid ground, so there's no fall
    // hazard and any rail there would fence off nothing.
    const railGeom = hasCutout
      ? buildCutoutRailGeometry(railR, floor.y, reference.entryAngle, upGap, downGap)
      : null;
    const balusters = hasCutout
      ? buildCutoutBalusters(railR, floor.y, reference.entryAngle, upGap, downGap)
      : [];
    return {
      cx,
      cz,
      railR,
      railGeom,
      balusters,
      entryAngle: reference.entryAngle,
      gateHalfArc,
      stairOut,
      stairIn,
      upSideOpen,
      downSideOpen,
      lBridgeArcSweep,
    };
  }, [floor, stairwell, hasCutout]);

  // Free the cutout rail's BufferGeometry on unmount / floor swap.
  // R3F doesn't auto-dispose externally-created geometries, so without
  // this every floor change strands one rail tube per floor in VRAM.
  // Null on the ground floor (no rail), in which case there's nothing
  // to dispose.
  useEffect(
    () => () => {
      data?.railGeom?.dispose();
    },
    [data],
  );

  if (!stairwell || !data) return null;
  const {
    cx,
    cz,
    railR,
    railGeom,
    balusters,
    entryAngle,
    gateHalfArc,
    stairOut,
    stairIn,
    upSideOpen,
    downSideOpen,
    lBridgeArcSweep,
  } = data;
  // Gate posts sit ON the rail line — same radius as the rail —
  // so the rail terminates INTO the post instead of stopping next
  // to it. We also rotate each post around Y so its outward face
  // lies perpendicular to the radial direction at its angle: that
  // makes the rail meet a flat wall (instead of a corner), and lets
  // the directional sign sit flush against the post.
  // Post A is one half-arc CCW from entry (the "left" side as you
  // face the spiral, which is also the ascending direction); post B
  // is the same arc CW (right side, descending direction).
  const gatePostRadius = railR;
  const angleA = entryAngle + gateHalfArc;
  const angleB = entryAngle - gateHalfArc;
  const postA = {
    x: cx + gatePostRadius * Math.cos(angleA),
    z: cz + gatePostRadius * Math.sin(angleA),
    angle: angleA,
    /** Rotation that points the post's local +Z (and the sign's +Z
     *  normal) along the radial outward direction at this angle. */
    rotationY: Math.PI / 2 - angleA,
  };
  const postB = {
    x: cx + gatePostRadius * Math.cos(angleB),
    z: cz + gatePostRadius * Math.sin(angleB),
    angle: angleB,
    rotationY: Math.PI / 2 - angleB,
  };

  // Each sign sits OUTWARD of its post (away from the spiral centre)
  // and inherits the post's rotation so it faces approaching players.
  // Offset clears the post's outer face (radial half-depth 0.09 m)
  // by a finger's width so the plaque reads as bolted onto the post
  // rather than embedded in it, without leaving an architectural gap.
  const signOffset = GATE_POST_RADIAL_DEPTH / 2 + 0.02;
  const signFor = (post: typeof postA) => ({
    position: [
      post.x + Math.cos(post.angle) * signOffset,
      floor.y + 1.65,
      post.z + Math.sin(post.angle) * signOffset,
    ] as [number, number, number],
    rotationY: post.rotationY,
  });
  const signA = signFor(postA);
  const signB = signFor(postB);

  return (
    <group>
      {/* Cutout-edge railing — fall-prevention rail circling the spiral
          well at rail height. Only rendered on floors that actually have
          a cutout (floor.index > 0); the ground floor has solid ground
          under the spiral, so a rail there would fence off nothing. */}
      {railGeom && (
        <mesh geometry={railGeom} position={[cx, 0, cz]} castShadow>
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      )}
      {balusters.map((b, i) => (
        // Rotate so the box's faces lie in radial / tangential planes —
        // see the matching note in staircase.tsx's spiral baluster
        // render.
        <mesh
          key={`cutout-bal-${i}`}
          position={[cx + b.pos[0], b.pos[1], cz + b.pos[2]]}
          rotation={[0, -b.angle, 0]}
          castShadow
        >
          <boxGeometry args={[BALUSTER_SIZE, BALUSTER_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}

      {/* Gate posts — wayfinding pylons flanking the entry/exit
          gap. The local +X axis (after the post's Y rotation) lines
          up with the rail's tangent at this angle, so a wide-but-thin
          box (TANGENT × HEIGHT × RADIAL = 0.85 × 2.4 × 0.18) reads as
          a panel facing the player rather than a thin column with a
          horizontal sign-bar nailed across it. The sign plaque fits
          flush within the panel's tangent width — no + cross.
          A post renders only when (a) its side has a stair to sign on,
          or (b) we're closing the dead-end with an L-bridge so the
          post anchors that bridge. The bottom-floor down-side has
          neither, so it stays empty rather than showing a textless
          panel that reads as a broken sign. */}
      {/* postA: rendered only when there's an actual upgoing stair to
          sign for. On the top floor the up-side is a dead end and the
          L-bridge handles the rail closure on its own — adding a post
          here would just float a textless sign-pylon mid-rail. */}
      {upSideOpen && (
        <mesh
          position={[postA.x, floor.y + GATE_POST_HEIGHT / 2, postA.z]}
          rotation={[0, postA.rotationY, 0]}
          castShadow
        >
          <boxGeometry args={[GATE_POST_TANGENT_WIDTH, GATE_POST_HEIGHT, GATE_POST_RADIAL_DEPTH]} />
          <primitive object={gatePostMaterial} attach="material" />
        </mesh>
      )}
      {/* postB: only when there's an actual down-stair to sign. The
          bottom-floor down side is dead-end and has no L-bridge to
          anchor either, so emitting an empty post there would just
          show as a textless sign-pylon. */}
      {downSideOpen && (
        <mesh
          position={[postB.x, floor.y + GATE_POST_HEIGHT / 2, postB.z]}
          rotation={[0, postB.rotationY, 0]}
          castShadow
        >
          <boxGeometry args={[GATE_POST_TANGENT_WIDTH, GATE_POST_HEIGHT, GATE_POST_RADIAL_DEPTH]} />
          <primitive object={gatePostMaterial} attach="material" />
        </mesh>
      )}

      {/* Curved L-bridge that sweeps the spiral inner rail outward
          across the top landing and merges tangentially into the
          cutout rail. Only emitted on the top floor's up-side dead-end
          (where the spiral arrives into nothing). Excluded on the
          ground floor by the hasCutout gate above — no cutout rail to
          merge into there in the first place. */}
      {!upSideOpen && hasCutout && (
        <DeadEndLBridge cx={cx} cz={cz} y={floor.y} post={postA} arcSweep={lBridgeArcSweep} />
      )}

      {/* Directional signs. UP goes on the post that's CCW from the
          entry direction (left-hand side of the gap as you walk in);
          DOWN goes on the right. Either is omitted if there's no
          stair in that direction (ground floor has no DOWN, top
          floor has no UP). */}
      {stairOut && (
        <StairSign
          position={signA.position}
          rotationY={signA.rotationY}
          direction="up"
          label={stairOut.upperLabel}
        />
      )}
      {stairIn && (
        <StairSign
          position={signB.position}
          rotationY={signB.rotationY}
          direction="down"
          label={stairIn.lowerLabel}
        />
      )}
    </group>
  );
}
