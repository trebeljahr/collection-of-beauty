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


/** Sweeping arc that bridges the topmost spiral inner rail's free end
 *  out to the cutout-edge rail. Without it the spiral terminates in a
 *  finial floating in the well centre while the cutout rail circles
 *  the perimeter, with a 3 m radial gap between them. With it, both
 *  read as one continuous handrail wrapping through the well.
 *
 *  The curve is a 3D sweep:
 *    r(t)     = startR + (endR - startR) · smoothstep(t)    // radial
 *    θ(t)     = startAngle + (endAngle - startAngle) · t    // tangential
 *    yTop(t)  = startY + (endY  - startY ) · smoothstep(t)  // vertical
 *
 *  smoothstep on r/y flattens the radial+vertical motion at the ends,
 *  so the curve enters and leaves each rail mostly tangentially —
 *  good for the cutout-rail merge (whose tangent is purely angular)
 *  and good enough for the spiral end (whose tangent is angular + a
 *  small vertical component — the spiral rises continuously). The
 *  finial sphere at the spiral's top covers any residual mismatch.
 *
 *  Cross-section is the same RAIL_BAR_HEIGHT × 2·RAIL_BAR_HALF_WIDTH
 *  rectangle the cutout rail uses, with the radial / vertical axes
 *  fixed (not perpendicular to the swept tangent). For a curve this
 *  gentle the visual twist is imperceptible, and matching axes makes
 *  the join with the cutout rail's cross-section pixel-clean. */
function buildSpiralToCutoutBridgeGeom(
  cx: number,
  cz: number,
  startAngle: number,
  startR: number,
  startYTop: number,
  endAngle: number,
  endR: number,
  endYTop: number,
): THREE.BufferGeometry {
  const N = 32;
  const positions: number[] = [];
  const indices: number[] = [];
  let prevBaseIdx = -1;

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = t * t * (3 - 2 * t); // smoothstep
    const r = startR + (endR - startR) * u;
    const theta = startAngle + (endAngle - startAngle) * t;
    const yTop = startYTop + (endYTop - startYTop) * u;
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
  }

  // End caps so the open cross-section doesn't read as a slot when
  // viewed end-on. The spiral end's brass finial covers the inner cap
  // (and obscures the small tangent kink between rail and bridge); the
  // cutout rail tube butts directly into the outer cap.
  const startBase = 0;
  const endBase = positions.length / 3 - 4;
  if (endBase > startBase) {
    indices.push(startBase + 0, startBase + 2, startBase + 1);
    indices.push(startBase + 0, startBase + 3, startBase + 2);
    indices.push(endBase + 0, endBase + 1, endBase + 2);
    indices.push(endBase + 0, endBase + 2, endBase + 3);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
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
    // On the topmost floor we also render a sweeping arc that bridges
    // the spiral inner rail's free top end out to the cutout rail.
    // That bridge needs an angular slice of the cutout rail's CW side
    // to merge into, so we shorten the rail by `bridgeArcSweep` past
    // the down-side gate edge — equivalent to widening downGap. ~60% of
    // gateHalfArc gives a curve big enough to read as an architectural
    // scroll without nibbling so far that the down-side walkway shrinks
    // uncomfortably (gateHalfArc ≈ 16°, bridgeArcSweep ≈ 10°, leaving
    // ~26° of walkway = ~2.6 m of arc at the cutout radius).
    const hasSpiralEnd = !upSideOpen && !!stairIn;
    const bridgeArcSweep = hasSpiralEnd ? gateHalfArc * 0.6 : 0;
    // upGap / downGap: how much arc the rail leaves uncovered on the
    // CCW (up) and CW (down) sides of entryAngle. When the side has a
    // stair to walk through, gateHalfArc is the player's walkway. When
    // it's a dead end (top floor's up, bottom floor's down), the rail
    // closes that side entirely so the perimeter reads as a continuous
    // loop with only the actual walkway open. The bridge widens the
    // CW gap by bridgeArcSweep on the top floor so the cutout rail's
    // CW endpoint lines up with the bridge's outer end.
    const upGap = upSideOpen ? gateHalfArc : 0;
    const downGap = (downSideOpen ? gateHalfArc : 0) + bridgeArcSweep;
    // Skipped on the ground floor — see hasCutout above. The bottom
    // floor's spiral rises out of solid ground, so there's no fall
    // hazard and any rail there would fence off nothing.
    const railGeom = hasCutout
      ? buildCutoutRailGeometry(railR, floor.y, reference.entryAngle, upGap, downGap)
      : null;
    const balusters = hasCutout
      ? buildCutoutBalusters(railR, floor.y, reference.entryAngle, upGap, downGap)
      : [];

    // Sweeping arc connecting the topmost spiral inner rail's free end
    // out to the cutout rail's (now shortened) CW endpoint. Both the
    // spiral rail's top end and the bridge's inner end live at theta =
    // entryAngle - gateHalfArc; the bridge then sweeps CW by
    // bridgeArcSweep while growing radially from the spiral's inner
    // rail centerline out to railR, and rising vertically by one
    // stepRise (the spiral rail's top sits one rise below the cutout
    // rail's height because the helical rail rises continuously).
    let bridgeGeom: THREE.BufferGeometry | null = null;
    if (hasCutout && hasSpiralEnd && stairIn) {
      const stepRise = (stairIn.upperY - stairIn.lowerY) / stairIn.numSteps;
      // Spiral inner rail's TOP end — same point the brass finial is
      // placed at in staircase.tsx. The rail's helical Y formula at
      // step (numSteps-2)'s last sample (theta = entryAngle -
      // gateHalfArc, t=1) gives this Y_top.
      const spiralStartAngle = stairIn.entryAngle - gateHalfArc;
      const spiralStartR = stairIn.innerRadius + RAIL_BAR_HALF_WIDTH;
      const spiralStartYTop = stairIn.lowerY + (stairIn.numSteps - 1) * stepRise + RAIL_HEIGHT;
      const cutoutEndAngle = stairIn.entryAngle - gateHalfArc - bridgeArcSweep;
      const cutoutEndR = railR;
      const cutoutEndYTop = floor.y + RAIL_HEIGHT;
      bridgeGeom = buildSpiralToCutoutBridgeGeom(
        cx,
        cz,
        spiralStartAngle,
        spiralStartR,
        spiralStartYTop,
        cutoutEndAngle,
        cutoutEndR,
        cutoutEndYTop,
      );
    }

    return {
      cx,
      cz,
      railR,
      railGeom,
      balusters,
      bridgeGeom,
      entryAngle: reference.entryAngle,
      gateHalfArc,
      stairOut,
      stairIn,
      upSideOpen,
      downSideOpen,
    };
  }, [floor, stairwell, hasCutout]);

  // Free the cutout rail's + bridge's BufferGeometries on unmount /
  // floor swap. R3F doesn't auto-dispose externally-created geometries,
  // so without this every floor change strands rail tubes in VRAM.
  // Null on the ground floor (no rail), in which case there's nothing
  // to dispose.
  useEffect(
    () => () => {
      data?.railGeom?.dispose();
      data?.bridgeGeom?.dispose();
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
    bridgeGeom,
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

      {/* Sweeping bridge from the topmost spiral inner rail's free end
          out to the cutout rail's CW endpoint. Only rendered on the
          top floor (where the spiral terminates without continuing
          into another flight); built into `data.bridgeGeom` only when
          that condition holds. The rail's brass finial at the spiral's
          top covers the inner end's flat cap and the small tangent
          mismatch where the helical rail hands off to the bridge's
          curve. */}
      {bridgeGeom && (
        <mesh geometry={bridgeGeom} position={[0, 0, 0]} castShadow>
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
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
