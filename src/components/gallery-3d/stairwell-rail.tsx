"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorLayout } from "@/lib/gallery-layout/types";
import { SPIRAL_FLOOR_CUTOUT_RADIUS, SPIRAL_INNER_RADIUS } from "@/lib/gallery-layout/world-coords";
import { StairSign, spiralGateHalfArc } from "./staircase";

// Local copies of the rail vocabulary so this file is self-contained.
// Match staircase.tsx exactly so the cutout-edge rail and the spiral
// rails read as a single material set.
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

const RAIL_HEIGHT = 1.05;
const RAIL_BAR_HEIGHT = 0.1;
const RAIL_BAR_HALF_WIDTH = 0.05;
const BALUSTER_SIZE = 0.07;
/** Vertical span of a baluster — stops at rail-bottom so the
 *  baluster top doesn't punch into the rail tube. Mirrors the same
 *  constant in staircase.tsx. */
const BALUSTER_HEIGHT = RAIL_HEIGHT - RAIL_BAR_HEIGHT;
/** Gate-post tangent width — wide enough for the sign plaque to fit
 *  flush within it (no horizontal "crossbeam" sticking out beyond
 *  the post), so post + sign reads as one architectural pylon rather
 *  than a + cross. */
const GATE_POST_TANGENT_WIDTH = 0.85;
/** Gate-post radial depth — kept slim so it reads as a wayfinding
 *  pylon rather than a fat column. */
const GATE_POST_RADIAL_DEPTH = 0.18;
const GATE_POST_HEIGHT = 2.4;
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
  gateHalfArc: number,
  upSideOpen: boolean,
  downSideOpen: boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const yTop = y + RAIL_HEIGHT;
  // Single arc from gap-exit to gap-entry. The "up" half of the gate
  // (CCW of entry) is left open when upSideOpen; otherwise the rail
  // extends all the way to entryAngle so the dead-end half is closed.
  // Same for downSideOpen on the CW side.
  const upGap = upSideOpen ? gateHalfArc : 0;
  const downGap = downSideOpen ? gateHalfArc : 0;
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
  gateHalfArc: number,
  upSideOpen: boolean,
  downSideOpen: boolean,
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  // ~30 cm arc length between balusters at radius=5.5 → 30 balusters
  // around 2π. Round to a nice integer.
  const count = 28;
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const angDiff = Math.atan2(Math.sin(theta - entryAngle), Math.cos(theta - entryAngle));
    if (Math.abs(angDiff) < gateHalfArc) {
      if (angDiff > 0 && upSideOpen) continue;
      if (angDiff <= 0 && downSideOpen) continue;
    }
    out.push([radius * Math.cos(theta), y + BALUSTER_HEIGHT / 2, radius * Math.sin(theta)]);
  }
  return out;
}

/**
 * Railing arm that extends radially inward from a gate post on a
 * dead-end side, all the way across the spiral annulus to where the
 * spiral's inner rail circles the open well. Same brass tube + dark
 * balusters as the cutout rail so the two read as one continuous piece;
 * the inner end butts up against the inner spiral rail, sealing the
 * dead-end half off from being mistaken for a walking surface.
 *
 * Three.js's Y-rotation maps local +X to (cos θ, 0, −sin θ). To make
 * the box's long axis (local +X) lie on the radial outward direction
 * (cos a, 0, sin a) we therefore need θ = −a, NOT +a — the same sign
 * trick used by the spiral's per-step brackets in staircase.tsx. The
 * earlier `Math.atan2(dz, dx)` here resolved to +post.angle, which
 * pointed the bridge bar at the angle's mirror across the X-axis;
 * visibly the bar floated off the radial line and never met the post.
 */
function DeadEndLBridge({
  cx,
  cz,
  y,
  post,
}: {
  cx: number;
  cz: number;
  y: number;
  post: { x: number; z: number; angle: number };
}) {
  // Radial extent: from the post (at the cutout-rail radius, where the
  // post centreline sits) inward to the spiral's inner rail (which
  // hugs SPIRAL_INNER_RADIUS + 0.07 — see staircase.tsx). Going all the
  // way to the inner rail means the bridge looks like a continuous
  // hand-rail spanning from the cutout edge to the inner well edge,
  // not a stub floating mid-spiral above one of the treads.
  const outerR = Math.hypot(post.x - cx, post.z - cz);
  const innerR = SPIRAL_INNER_RADIUS + 0.07;
  const radialLen = outerR - innerR;
  const radialMid = (outerR + innerR) / 2;
  const cosA = Math.cos(post.angle);
  const sinA = Math.sin(post.angle);
  const midX = cx + cosA * radialMid;
  const midZ = cz + sinA * radialMid;
  const yTop = y + RAIL_HEIGHT - RAIL_BAR_HEIGHT / 2;

  // ~40 cm spacing between balusters along the bridge. radialLen ≈ 2.95 m
  // → 7 balusters; gives the bar visual weight as a real fence rather
  // than a single brass beam over empty space.
  const balusterCount = Math.max(2, Math.round(radialLen / 0.4));
  const balusters: Array<{ x: number; z: number }> = [];
  for (let i = 1; i <= balusterCount; i++) {
    const t = i / (balusterCount + 1);
    const r = outerR - radialLen * t;
    balusters.push({ x: cx + cosA * r, z: cz + sinA * r });
  }

  return (
    <group>
      <mesh position={[midX, yTop, midZ]} rotation={[0, -post.angle, 0]} castShadow>
        <boxGeometry args={[radialLen, RAIL_BAR_HEIGHT, RAIL_BAR_HALF_WIDTH * 2]} />
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {balusters.map((b, i) => (
        <mesh key={`l-bal-${i}`} position={[b.x, y + BALUSTER_HEIGHT / 2, b.z]} castShadow>
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

  const data = useMemo(() => {
    if (!stairwell) return null;
    const stairOut = floor.stairsOut[0];
    const stairIn = floor.stairsIn[0];
    const reference = stairOut ?? stairIn;
    if (!reference) return null;
    const cx = reference.centerX;
    const cz = reference.centerZ;
    const railR = SPIRAL_FLOOR_CUTOUT_RADIUS + 0.18;
    const gateHalfArc = spiralGateHalfArc(reference.numSteps);
    // The "up" half of the gate is only meaningful when this floor
    // actually has an upgoing stair; same for the "down" half. On the
    // top floor, stairsOut is empty so the up-half is a dead end and
    // the rail closes there. On the ground floor, stairsIn is empty.
    const upSideOpen = !!stairOut;
    const downSideOpen = !!stairIn;
    // The rail leaves a gap wherever the gate-half won't be closed by
    // an L-bridge. Up-side closes ONLY on the top floor (stair coming
    // up into nothing), via the L-bridge above. Down-side never closes
    // — bottom-floor dead-ends are solid stairwell-room floor with no
    // fall hazard, so we don't fence them. So the rail's gap on the
    // up side maps to upSideOpen, but the gap on the down side is
    // always open regardless of whether there's a downgoing stair.
    const railGeom = buildCutoutRailGeometry(
      railR,
      floor.y,
      reference.entryAngle,
      gateHalfArc,
      upSideOpen,
      true,
    );
    const balusters = buildCutoutBalusters(
      railR,
      floor.y,
      reference.entryAngle,
      gateHalfArc,
      upSideOpen,
      true,
    );
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
    };
  }, [floor, stairwell]);

  // Free the cutout rail's BufferGeometry on unmount / floor swap.
  // R3F doesn't auto-dispose externally-created geometries, so without
  // this every floor change strands one rail tube per floor in VRAM.
  useEffect(
    () => () => {
      data?.railGeom.dispose();
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
      {/* Cutout-edge railing — circles the spiral well at rail height.
          On floors above the ground it's the fall-prevention rail
          around the floor cutout. On the ground floor (no cutout) it
          still reads as the architectural fence framing the spiral
          entrance, anchors the gate posts and the dead-end L-bridges,
          and gives the open well a visible perimeter from below as
          the player ascends. */}
      <mesh geometry={railGeom} position={[cx, 0, cz]} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {balusters.map((p, i) => (
        <mesh key={`cutout-bal-${i}`} position={[cx + p[0], p[1], cz + p[2]]} castShadow>
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
      {/* postA: always rendered. Carries the up-arrow sign on
          floors with a stair leading up; on the top floor it's the
          structural anchor for the dead-end L-bridge below. */}
      <mesh
        position={[postA.x, floor.y + GATE_POST_HEIGHT / 2, postA.z]}
        rotation={[0, postA.rotationY, 0]}
        castShadow
      >
        <boxGeometry args={[GATE_POST_TANGENT_WIDTH, GATE_POST_HEIGHT, GATE_POST_RADIAL_DEPTH]} />
        <primitive object={gatePostMaterial} attach="material" />
      </mesh>
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

      {/* L-shaped inner extension. Bridges from the gate post inward
          (radially) to the inner spiral railing. We only emit it on
          the TOP floor's up-side dead-end — there the spiral comes
          up into nothing and the bridge reads as the architectural
          ending of the flight. The bottom floor doesn't need it: the
          stairwell room has no floor cutout and no spiral coming in
          from below, so a closing rail on the down side would just
          fence off solid floor. */}
      {!upSideOpen && <DeadEndLBridge cx={cx} cz={cz} y={floor.y} post={postA} />}

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
