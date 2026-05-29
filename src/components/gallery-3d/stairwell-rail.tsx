"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { FloorLayout } from "@/lib/gallery-layout/types";
import { SPIRAL_FLOOR_CUTOUT_RADIUS } from "@/lib/gallery-layout/world-coords";
import {
  BALUSTER_HEIGHT,
  BALUSTER_SIZE,
  RAIL_BAR_HALF_WIDTH,
  RAIL_BAR_HEIGHT,
  RAIL_HEIGHT,
} from "./rail-constants";
import { finialGeometry, StairSign, spiralGateHalfArc } from "./staircase";

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
/** Sideways nudge for the sign plaques along the gate tangent. Each
 *  plaque moves away from the walking gap, keeping the stair entry
 *  clearer while preserving the post orientation. */
const SIGN_GATE_CLEARANCE_OFFSET = 0.34;
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
 *  `entryAngle`. Callers choose how much of each half remains open:
 *  actual stair halves keep a walking gap, dead-end halves usually
 *  close to entryAngle, and the top-floor L connector reserves its own
 *  attach slice on the dead-end side.
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
    // the rail/L connector closes there. On the ground floor, stairsIn
    // is empty.
    const upSideOpen = !!stairOut;
    const downSideOpen = !!stairIn;
    // On the topmost floor we also render an L-shaped connector from the
    // spiral inner rail's free top end out to the cutout rail's CCW
    // terminus. That is the dead-end / left side when standing in front
    // of the stairs, so the connector closes the non-stair side and
    // leaves the down-stair side clear.
    const hasSpiralEnd = !upSideOpen && !!stairIn;
    const bridgeArcSweep = hasSpiralEnd ? gateHalfArc : 0;
    // upGap / downGap: how much arc the rail leaves uncovered on the
    // CCW (up) and CW (down) sides of entryAngle. When the side has a
    // stair to walk through, gateHalfArc is the player's walkway. When
    // it's a dead end (top floor's up, bottom floor's down), the rail
    // closes that side entirely so the perimeter reads as a continuous
    // loop with only the actual walkway open. On the top floor, the
    // L-bridge owns the dead-end / CCW side, so upGap reserves exactly
    // that attach point while downGap stays only as wide as the real
    // descending stair opening.
    const upGap = upSideOpen ? gateHalfArc : bridgeArcSweep;
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

    // L-shaped connector from the topmost spiral inner rail's free end
    // (knob A) out to the cutout rail's CCW terminus (knob B). Both knobs
    // sit at the SAME height: the spiral inner rail's top is at
    // upperY + RAIL_HEIGHT, the cutout rail at floor.y + RAIL_HEIGHT, and
    // upperY === floor.y (the top flight lands on this floor). So the
    // connector is a flat L in the horizontal plane on the left/dead-end
    // side — a first arm leaving A along the spiral's exit tangent, then
    // one right angle into a radial arm that lands on B. Finials at the
    // corner and at B cap the tube ends and hide the elbows, exactly like
    // every other rail joint in the scene.
    //
    // The earlier version swept a single curved tube and started it at
    // the WRONG place — angle entryAngle - gateHalfArc (the spiral inner
    // rail has no gate, so its top is at entryAngle) and one stepRise too
    // low (it reaches upperY, not upperY - stepRise) — so the bridge
    // floated ~14° sideways and ~24 cm below the spiral knob.
    let lBridge: {
      seg1Mid: [number, number, number];
      seg1RotY: number;
      seg1Len: number;
      seg2Mid: [number, number, number];
      seg2RotY: number;
      seg2Len: number;
      cornerPos: [number, number, number];
      endPos: [number, number, number];
    } | null = null;
    if (hasCutout && hasSpiralEnd && stairIn) {
      // Knob A — spiral inner rail's TOP finial. The inner rail is a
      // gate-less continuous helix, so its top end is exactly at
      // entryAngle (one full revolution from the start), radius
      // innerRadius + RAIL_BAR_HALF_WIDTH, top-of-tube at
      // upperY + RAIL_HEIGHT.
      const aAngle = stairIn.entryAngle;
      const aR = stairIn.innerRadius + RAIL_BAR_HALF_WIDTH;
      const ax = aR * Math.cos(aAngle);
      const az = aR * Math.sin(aAngle);
      // Knob B — cutout rail's CCW terminus, at the left-side column
      // where the top landing's dead-end rail section begins.
      const bAngle = stairIn.entryAngle + bridgeArcSweep;
      const bx = railR * Math.cos(bAngle);
      const bz = railR * Math.sin(bAngle);
      // Spiral exit frame at A: unit tangent (circumferential) + unit
      // radial (outward). Arm 1 runs along the tangent, arm 2 along the
      // radial, so decomposing (B − A) in this frame gives the corner:
      // travel tangentially until level with B, turn 90°, go radial to B.
      const tx = -Math.sin(aAngle);
      const tz = Math.cos(aAngle);
      const rx = Math.cos(aAngle);
      const rz = Math.sin(aAngle);
      const dx = bx - ax;
      const dz = bz - az;
      const tComp = dx * tx + dz * tz;
      const rComp = dx * rx + dz * rz;
      const cornerX = ax + tComp * tx;
      const cornerZ = az + tComp * tz;
      // Both arms' centre-line sits at rail height; the boxes hang
      // RAIL_BAR_HEIGHT down from the top, matching the cutout tube.
      const railY = floor.y + RAIL_HEIGHT - RAIL_BAR_HEIGHT / 2;
      // rotateY = -atan2(dz, dx) aligns a box's local +X with its run —
      // same convention as TopLandingEndRail in staircase.tsx.
      lBridge = {
        seg1Mid: [(ax + cornerX) / 2, railY, (az + cornerZ) / 2],
        seg1RotY: -Math.atan2(cornerZ - az, cornerX - ax),
        seg1Len: Math.abs(tComp),
        seg2Mid: [(cornerX + bx) / 2, railY, (cornerZ + bz) / 2],
        seg2RotY: -Math.atan2(bz - cornerZ, bx - cornerX),
        seg2Len: Math.abs(rComp),
        cornerPos: [cornerX, railY, cornerZ],
        endPos: [bx, railY, bz],
      };
    }

    return {
      cx,
      cz,
      railR,
      railGeom,
      balusters,
      lBridge,
      entryAngle: reference.entryAngle,
      gateHalfArc,
      stairOut,
      stairIn,
      upSideOpen,
      downSideOpen,
    };
  }, [floor, stairwell, hasCutout]);

  // Free the cutout rail's BufferGeometry on unmount / floor swap. R3F
  // doesn't auto-dispose externally-created geometries, so without this
  // every floor change strands rail tubes in VRAM. Null on the ground
  // floor (no rail), in which case there's nothing to dispose. The
  // L-bridge uses declarative <boxGeometry> + the shared finialGeometry,
  // both R3F-managed, so neither needs disposing here.
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
    lBridge,
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
  // by a finger's width, then slides away from the gate opening so the
  // plaque does not block the stair path.
  const signOffset = GATE_POST_RADIAL_DEPTH / 2 + 0.02;
  const signFor = (post: typeof postA, side: "left" | "right") => {
    const sideSign = side === "left" ? -1 : 1;
    const tangentX = Math.sin(post.angle);
    const tangentZ = -Math.cos(post.angle);
    return {
      position: [
        post.x +
          Math.cos(post.angle) * signOffset +
          sideSign * tangentX * SIGN_GATE_CLEARANCE_OFFSET,
        floor.y + 1.65,
        post.z +
          Math.sin(post.angle) * signOffset +
          sideSign * tangentZ * SIGN_GATE_CLEARANCE_OFFSET,
      ] as [number, number, number],
      rotationY: post.rotationY,
    };
  };
  const signA = signFor(postA, "left");
  const signB = signFor(postB, "right");

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
          // biome-ignore lint/suspicious/noArrayIndexKey: deterministic baluster ring around a fixed cutout, never reorders.
          key={`cutout-bal-${i}`}
          position={[cx + b.pos[0], b.pos[1], cz + b.pos[2]]}
          rotation={[0, -b.angle, 0]}
          castShadow
        >
          <boxGeometry args={[BALUSTER_SIZE, BALUSTER_HEIGHT, BALUSTER_SIZE]} />
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      ))}

      {/* L-shaped connector from the topmost spiral inner rail's free
          end (knob A) to the cutout rail's CCW terminus (knob B). Only
          present on the top floor (spiral terminates without another
          flight above). It sits on the left/dead-end side, away from the
          descending stair gap. The spiral rail's own brass finial sits
          at A (rendered in staircase.tsx); finials here cap the corner
          and B. */}
      {lBridge && (
        <group>
          <mesh
            position={[cx + lBridge.seg1Mid[0], lBridge.seg1Mid[1], cz + lBridge.seg1Mid[2]]}
            rotation={[0, lBridge.seg1RotY, 0]}
            castShadow
          >
            <boxGeometry args={[lBridge.seg1Len, RAIL_BAR_HEIGHT, 2 * RAIL_BAR_HALF_WIDTH]} />
            <primitive object={railTopMaterial} attach="material" />
          </mesh>
          <mesh
            position={[cx + lBridge.seg2Mid[0], lBridge.seg2Mid[1], cz + lBridge.seg2Mid[2]]}
            rotation={[0, lBridge.seg2RotY, 0]}
            castShadow
          >
            <boxGeometry args={[lBridge.seg2Len, RAIL_BAR_HEIGHT, 2 * RAIL_BAR_HALF_WIDTH]} />
            <primitive object={railTopMaterial} attach="material" />
          </mesh>
          <mesh
            position={[cx + lBridge.cornerPos[0], lBridge.cornerPos[1], cz + lBridge.cornerPos[2]]}
            geometry={finialGeometry}
            castShadow
          >
            <primitive object={railTopMaterial} attach="material" />
          </mesh>
          <mesh
            position={[cx + lBridge.endPos[0], lBridge.endPos[1], cz + lBridge.endPos[2]]}
            geometry={finialGeometry}
            castShadow
          >
            <primitive object={railTopMaterial} attach="material" />
          </mesh>
        </group>
      )}

      {/* Gate posts — wayfinding pylons flanking the entry/exit
          gap. The local +X axis (after the post's Y rotation) lines
          up with the rail's tangent at this angle, so a wide-but-thin
          box (TANGENT × HEIGHT × RADIAL = 0.85 × 2.4 × 0.18) reads as
          a panel facing the player rather than a thin column with a
          horizontal sign-bar nailed across it. The sign plaque fits
          flush within the panel's tangent width — no + cross.
          A post renders only when (a) its side has a stair to sign on,
          A post renders only when its side has an actual stair to sign;
          dead-end sides (top floor's up, bottom floor's down) close the
          cutout rail fully across that half of the gate, so emitting a
          textless pylon there would read as a broken sign. */}
      {/* postA: only when there's an upgoing stair to sign. */}
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
      {/* postB: only when there's a downgoing stair to sign. */}
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
