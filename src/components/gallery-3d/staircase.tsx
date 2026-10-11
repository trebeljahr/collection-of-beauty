"use client";

import { Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Staircase } from "@/lib/gallery-layout/types";
import { SPIRAL_COLUMN_RADIUS } from "@/lib/gallery-layout/world-coords";
import { LIGHT_TINT } from "./painting-light";
import { HIGHLIGHT_ENV_MATERIALS, signBaseMaterial } from "./palette-materials";
import {
  BALUSTER_HEIGHT,
  BALUSTER_SIZE,
  RAIL_BAR_HALF_WIDTH,
  RAIL_BAR_HEIGHT,
  RAIL_HEIGHT,
} from "./rail-constants";
import { findStairAbove, findStairBelow, spiralGateHalfArc } from "./spiral-physics";

// The pure physics rules live in `spiral-physics.ts` so they can be
// imported without Three.js; re-exported here because every existing
// caller reaches for them through the staircase module.
export {
  findStairAbove,
  findStairBelow,
  isAtStairSurface,
  isInsideStair,
  spiralGateHalfArc,
  spiralRawAngle,
  stairHeightAt,
  stairSurfaceAt,
  stairSurfaceYAt,
} from "./spiral-physics";

// Shared materials — one "stair vocabulary" for every spiral in the
// building. Allocated once at module load.
const treadMaterial = new THREE.MeshStandardMaterial({
  color: "#3a2a1f",
  roughness: 0.7,
  metalness: 0.1,
  // The step lights are baked into the treads' vertex colours.
  vertexColors: true,
});

// ── Step lights ───────────────────────────────────────────────────────
// A strip under the nosing of every tread, washing the riser below it
// and the back of the next tread down. The flight above shades every
// tread from the ceiling, so the stair was the one dark mass in a lit
// room and its steps were hard to tell apart on the way up.
//
// The light is baked: a vertex colour is the factor by which a point is
// brighter than the bare wood, so the strips cost no draw call and no
// shader work. The figures were set by eye against the wall washers.

/** Height of the strip itself at the top of a riser, metres. */
const STEP_LIGHT_HEIGHT = 0.014;
/** Wash on the riser, just under the strip and at the riser's foot. */
const RISER_WASH_TOP = 5;
const RISER_WASH_FOOT = 1.5;
/** Spill on the tread below, by distance from the riser as a fraction
 *  of the tread's depth: one figure per row of vertices. */
const TREAD_SPILL = [2.6, 1.7, 1.2, 1, 1];
/** Share of the lamps' warm tint the wash carries; the rest is white,
 *  so lit wood keeps its own colour. */
const WASH_TINT = 0.35;

type Rgb = [number, number, number];
const UNLIT: Rgb = [1, 1, 1];

/** Vertex colour for wood lit `k` times as brightly as the fill. */
function wash(k: number): Rgb {
  const t = LIGHT_TINT;
  const add = k - 1;
  return [
    1 + add * (1 - WASH_TINT + WASH_TINT * t.r),
    1 + add * (1 - WASH_TINT + WASH_TINT * t.g),
    1 + add * (1 - WASH_TINT + WASH_TINT * t.b),
  ];
}

/** Vertex colour that turns the tread's wood into the strip's light. */
const STRIP: Rgb = (() => {
  const wood = treadMaterial.color;
  const t = LIGHT_TINT;
  return [t.r / wood.r, t.g / wood.g, t.b / wood.b];
})();
const railTopMaterial = new THREE.MeshStandardMaterial({
  // Aged brass — visibly metallic but not mirror-bright. Lower
  // metalness + higher roughness than polished brass, so the rail
  // catches highlights without screaming "shiny" at the player.
  color: "#a07a40",
  roughness: 0.55,
  metalness: 0.5,
});
const balusterMaterial = new THREE.MeshStandardMaterial({
  // Dark wrought iron for the verticals — strong contrast against
  // the brass top rail and the warm tread tones, so the railing as
  // a whole reads at a glance.
  color: "#0f0c08",
  roughness: 0.7,
  metalness: 0.4,
});
const columnMaterial = new THREE.MeshStandardMaterial({
  // Warm dark stone for the central column — distinct from the
  // wood treads (lighter, more matte) and the iron baluster/posts
  // (lighter, less metallic) so the column reads as the masonry
  // spine the steps wrap around.
  color: "#54463a",
  roughness: 0.85,
  metalness: 0.05,
});
const bracketMaterial = new THREE.MeshStandardMaterial({
  // Same wrought-iron family as the balusters — the radial
  // brackets read as forged hardware tying each tread to the
  // column, not as part of the stone itself.
  color: "#1a120a",
  roughness: 0.7,
  metalness: 0.45,
});

// The stair reflects the lamp-lit map the frames do, not the room's
// plain gradient. That map's lamps sit high, so a surface that faces up
// takes about twice the light of one that faces down: treads and rail
// tops read as lit from the ceiling and the underside of the flight
// above stays in shade, with no light in the scene to pay for it.
HIGHLIGHT_ENV_MATERIALS.push(
  treadMaterial,
  railTopMaterial,
  balusterMaterial,
  columnMaterial,
  bracketMaterial,
);

type BoxPart = {
  size: [number, number, number];
  position: [number, number, number];
  rotationY: number;
};

/** Many boxes as one geometry. A flight has some 75 balusters and
 *  brackets; as a mesh each they were most of the stairwell's draw
 *  calls. */
export function mergeBoxes(parts: readonly BoxPart[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const boxes = parts.map((p) =>
    new THREE.BoxGeometry(...p.size).rotateY(p.rotationY).translate(...p.position),
  );
  const merged = mergeGeometries(boxes, false);
  for (const b of boxes) b.dispose();
  return merged;
}

// Procedural arrow geometry for stair signs. Built as a flat
// THREE.Shape (same idea as an SVG path) so the up/down indicator is
// real mesh geometry rather than a unicode glyph through a TTF font —
// the latter renders inconsistently in drei's <Text> at this scale,
// missing wings or bleeding into adjacent letters. DoubleSide keeps
// it visible regardless of the sign's facing rotation.
function buildArrowShape(direction: "up" | "down"): THREE.Shape {
  const s = direction === "up" ? 1 : -1;
  const headHalfW = 0.07;
  const shaftHalfW = 0.022;
  const halfH = 0.05;
  const shape = new THREE.Shape();
  shape.moveTo(0, s * halfH);
  shape.lineTo(-headHalfW, 0);
  shape.lineTo(-shaftHalfW, 0);
  shape.lineTo(-shaftHalfW, -s * halfH);
  shape.lineTo(shaftHalfW, -s * halfH);
  shape.lineTo(shaftHalfW, 0);
  shape.lineTo(headHalfW, 0);
  shape.closePath();
  return shape;
}
const upArrowGeometry = new THREE.ShapeGeometry(buildArrowShape("up"));
const downArrowGeometry = new THREE.ShapeGeometry(buildArrowShape("down"));
const signGlyphMaterial = new THREE.MeshBasicMaterial({
  color: "#f2e9d0",
  side: THREE.DoubleSide,
});

/** Newel-cap finial radius. Has to be enough larger than the rail
 *  tube's cross-section that the sphere reads as a distinct
 *  decorative ball rather than a tight swelling at the rail end:
 *  the tube is RAIL_BAR_HEIGHT × 2*RAIL_BAR_HALF_WIDTH = 0.10 × 0.10,
 *  with corners ≈ 0.0707 m from centre. At R=0.085 the tube
 *  emerges from the sphere at distance √(R²−h²) ≈ 0.069 m from the
 *  centre — visually the rail appears to grow out of a tiny bump,
 *  with a sharp crease where the flat tube face meets the curved
 *  sphere. R=0.13 pushes that intersection back to ≈ 0.12 m and
 *  the sphere clearly stands proud of the rail, reading as a
 *  proper newel cap. Shared geometry so all finials in the scene
 *  reuse one buffer. */
const FINIAL_RADIUS = 0.13;
export const finialGeometry = new THREE.SphereGeometry(FINIAL_RADIUS, 24, 16);

/**
 * Build a single spiral tread as an explicit BufferGeometry (annulus
 * sector wedge). The tread's TOP face sits at world Y = `topY`; the
 * bottom is `topY - TREAD_THICKNESS`. Angles are in atan2 convention
 * (atan2(dz, dx)) so x = r*cos(θ), z = r*sin(θ) maps directly.
 *
 * Triangulation produces:
 *  - top + bottom annular faces
 *  - inner + outer curved faces (visible from the well / outside)
 *  - two radial side caps that double as risers between adjacent steps
 *
 * Each face owns its OWN copies of its corner vertices. We share
 * vertices ONLY along the segmented curves (inner / outer faces),
 * where adjacent segment quads should blend smoothly so the curve
 * reads as a curve rather than a string of facets. Top, bottom, and
 * the two radial caps are completely independent: their vertices are
 * not reused by any other face. computeVertexNormals therefore
 * produces a clean +Y on the top, −Y on the bottom, ±tangent on the
 * caps, and a smoothly varying −radial / +radial across the inner
 * and outer curves.
 *
 * The earlier 4-ring layout (20 verts per wedge, every corner shared
 * across up to 5 incident faces) caused computeVertexNormals to
 * average all of those face normals into a single diagonal direction.
 * That averaged normal varies smoothly across each face, so what
 * should be a flat riser/underside picked up a soft graduated sheen
 * — the geometry was hard-edged, but it shaded as if it were a
 * lump of clay.
 */
function buildTreadGeometry(
  innerR: number,
  outerR: number,
  thetaStart: number,
  thetaEnd: number,
  topY: number,
  thickness: number,
  segments: number,
  /** Which radial cap is the block's riser, the face a climber walks
   *  toward. It takes a step light; null leaves the block unlit. */
  riser: "start" | "end" | null = null,
  /** Whether the top takes the spill of the next riser up, which
   *  stands on the far side from this block's own. */
  spill = false,
): { positions: number[]; colors: number[]; indices: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const bottomY = topY - thickness;

  const pushVertex = (x: number, y: number, z: number, color: Rgb = UNLIT): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    colors.push(color[0], color[1], color[2]);
    return idx;
  };

  // Helper: build a row of (segments+1) verts at a fixed radius and
  // height, returning the index of each. `colorAt` takes the vertex's
  // place along the arc, 0 at thetaStart to 1 at thetaEnd.
  const ringAt = (r: number, y: number, colorAt?: (t: number) => Rgb): number[] => {
    const out: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = thetaStart + (thetaEnd - thetaStart) * t;
      out.push(pushVertex(r * Math.cos(theta), y, r * Math.sin(theta), colorAt?.(t)));
    }
    return out;
  };

  // Spill on the top: brightest in the row under the next riser,
  // gone by the middle of the tread.
  const spillAt =
    spill && riser
      ? (t: number): Rgb => {
          const fromRiser = (riser === "start" ? 1 - t : t) * (TREAD_SPILL.length - 1);
          const i = Math.min(TREAD_SPILL.length - 2, Math.floor(fromRiser));
          const f = fromRiser - i;
          return wash(TREAD_SPILL[i] * (1 - f) + TREAD_SPILL[i + 1] * f);
        }
      : undefined;

  // ── Top face (+Y normal) — independent inner & outer rows.
  // Going inner→inner-next→outer (Z then X under the right-hand
  // rule) yields Z×X=+Y, so looking down on the spiral hits a solid
  // surface. The earlier (1,3,1+1) winding produced −Y normals here,
  // which is why looking down on the spiral showed see-through
  // "sheets" — the top faces were back-culled and the camera read
  // straight through to the bottom face one rise below.
  const topInner = ringAt(innerR, topY, spillAt);
  const topOuter = ringAt(outerR, topY, spillAt);
  for (let i = 0; i < segments; i++) {
    indices.push(topInner[i], topInner[i + 1], topOuter[i]);
    indices.push(topInner[i + 1], topOuter[i + 1], topOuter[i]);
  }

  // ── Bottom face (−Y normal) — mirrored winding of the top.
  // outer→inner-next→outer-next gives X×Z=−Y on the underside.
  const bottomInner = ringAt(innerR, bottomY);
  const bottomOuter = ringAt(outerR, bottomY);
  for (let i = 0; i < segments; i++) {
    indices.push(bottomInner[i], bottomOuter[i], bottomInner[i + 1]);
    indices.push(bottomInner[i + 1], bottomOuter[i], bottomOuter[i + 1]);
  }

  // ── Inner curved face (−radial normal, smooth across segments).
  // Verts at top and bottom of the inner cylinder share a single
  // copy across the two segments that meet at each angle, so
  // computeVertexNormals averages the −radial(θ_{i−1}) and
  // −radial(θ_i) face normals into a smoothly interpolated direction
  // along the curve.
  const innerCurveTop = ringAt(innerR, topY);
  const innerCurveBot = ringAt(innerR, bottomY);
  for (let i = 0; i < segments; i++) {
    indices.push(innerCurveBot[i + 1], innerCurveTop[i], innerCurveBot[i]);
    indices.push(innerCurveBot[i + 1], innerCurveTop[i + 1], innerCurveTop[i]);
  }

  // ── Outer curved face (+radial normal, smooth across segments).
  const outerCurveTop = ringAt(outerR, topY);
  const outerCurveBot = ringAt(outerR, bottomY);
  for (let i = 0; i < segments; i++) {
    indices.push(outerCurveBot[i], outerCurveTop[i], outerCurveBot[i + 1]);
    indices.push(outerCurveBot[i + 1], outerCurveTop[i], outerCurveTop[i + 1]);
  }

  // ── Radial caps. Each owns its verts so a riser reads as a
  // hard-edged flat panel rather than blending into the adjacent tread
  // top / bottom / curve normals. The cap at thetaStart faces −tangent,
  // the one at thetaEnd +tangent. The riser is cut in two: the strip of
  // light under the nosing, and the wash it throws down the face.
  const cap = (theta: number, end: "start" | "end") => {
    const at = (r: number, y: number, color?: Rgb) =>
      pushVertex(r * Math.cos(theta), y, r * Math.sin(theta), color);
    const quad = (ib: number, it: number, ob: number, ot: number) => {
      if (end === "start") indices.push(ib, it, ob, it, ot, ob);
      else indices.push(ib, ob, it, it, ob, ot);
    };
    if (riser !== end) {
      quad(at(innerR, bottomY), at(innerR, topY), at(outerR, bottomY), at(outerR, topY));
      return;
    }
    const stripY = topY - STEP_LIGHT_HEIGHT;
    const foot = wash(RISER_WASH_FOOT);
    const top = wash(RISER_WASH_TOP);
    quad(
      at(innerR, bottomY, foot),
      at(innerR, stripY, top),
      at(outerR, bottomY, foot),
      at(outerR, stripY, top),
    );
    quad(
      at(innerR, stripY, STRIP),
      at(innerR, topY, STRIP),
      at(outerR, stripY, STRIP),
      at(outerR, topY, STRIP),
    );
  };
  cap(thetaStart, "start");
  cap(thetaEnd, "end");

  return { positions, colors, indices };
}

/** The cap of a block that a climber walks toward: the one at its
 *  lower angle when the spiral climbs with increasing angle. */
function risingCap(direction: number): "start" | "end" {
  return direction > 0 ? "start" : "end";
}

/** Merge all the spiral's tread wedges into one BufferGeometry. The
 *  tread tops are placed to match the discrete physics in
 *  `stairHeightAt` exactly: while the player walks the arc of step
 *  `i`, both their feet AND the tread under them sit at
 *  `lowerY + i * stepRise`. Step 0 is flush with the lower floor.
 *  When the player crosses cumulative=2π onto the next stair, that
 *  stair's step 0 is at `upperY`, giving the final +stepRise climb
 *  onto the upper floor with no visual gap or floating tread.
 *
 *  Each wedge is a FULL-RISE-THICK block: bottom at the previous
 *  step's top Y, top at this step's top Y. The radial side cap
 *  between adjacent steps therefore covers the entire step rise,
 *  so there's no see-through gap between treads from any angle.
 *  The lowest step's bottom sinks one rise below `lowerY`; on the
 *  ground revolution that's hidden under the slab, on upper
 *  revolutions it stacks flush on the previous revolution's last
 *  tread, giving the spiral a single continuous helical mass. */
function buildSpiralStepsGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { innerRadius, outerRadius, numSteps, direction, lowerY, upperY, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const segPerStep = 4;

  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    const topY = lowerY + i * stepRise;
    const {
      positions: p,
      colors: c,
      indices: idx,
    } = buildTreadGeometry(
      innerRadius,
      outerRadius,
      lo,
      hi,
      topY,
      stepRise,
      segPerStep,
      risingCap(direction),
      true,
    );
    const base = positions.length / 3;
    for (let k = 0; k < p.length; k++) positions.push(p[k]);
    for (let k = 0; k < c.length; k++) colors.push(c[k]);
    for (let k = 0; k < idx.length; k++) indices.push(idx[k] + base);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Build a spiral railing as a CLOSED RECTANGULAR TUBE following the
 *  rail path. Each ring sample contributes 4 vertices — TO (top-out),
 *  TI (top-in), BI (bot-in), BO (bot-out) — and adjacent rings are
 *  stitched by 4 longitudinal faces (top, inner, bottom, outer) so
 *  the rail has real 3D volume in every direction. No DoubleSide
 *  hack: the tube is closed, every face has correct outward-facing
 *  normals, lighting is consistent.
 *
 *  Used for both the inner edge (around the open well) and the outer
 *  edge (between treads and the stairwell room). The outer rail
 *  skips a configurable number of steps at the entry direction to
 *  leave a gate for the player to walk onto the spiral. */
function buildSpiralRail(
  staircase: Staircase,
  side: "inner" | "outer",
  gateHalfArc: number,
  /** Whether to seal each contiguous segment with flat end caps. The
   *  outer rail wants caps at its gate (so the rail butts cleanly
   *  against the gate posts). The inner rail is a continuous helix
   *  across all revolutions — caps at the per-revolution boundary
   *  would Z-fight against the next storey's start cap and read as
   *  visible seams every time the rail crosses a floor. */
  closeEnds: boolean,
): {
  rail: THREE.BufferGeometry;
  /** One entry per baluster.
   *  - `angle` is the world-space theta of the baluster's centre, used
   *    by the renderer to rotate each box so its faces lie on radial /
   *    tangential planes (instead of pointing at world ±X / ±Z, which
   *    made every other baluster around the spiral read as visibly
   *    cocked relative to the step it stands on).
   *  - `height` is the per-baluster vertical extent. The helical rail
   *    rises continuously with angle, so a baluster shifted along its
   *    step's tangent — to seat it fully on the tread instead of
   *    straddling the riser — needs to be slightly taller than the
   *    nominal BALUSTER_HEIGHT to reach the rail's bottom. */
  balusters: Array<{
    pos: [number, number, number];
    angle: number;
    height: number;
  }>;
  /** Centre-line positions where each contiguous tube segment starts
   *  and ends — one entry per visible rail end. A finial sphere is
   *  placed on each so the open tube cross-section is hidden and any
   *  tiny seam between abutting segments is covered. */
  endpoints: Array<[number, number, number]>;
} {
  const { innerRadius, outerRadius, numSteps, direction, lowerY, upperY, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  // Rail and balusters sit so their step-side face is FLUSH with the
  // step's edge — the rail's outer face at outerRadius (or its inner
  // face at innerRadius for the inner rail), and each baluster's
  // matching face on the same plane. So the line of posts marches
  // along the step corner, not 2 cm shy of it.
  //
  // Rail centre and baluster centre differ by 1.5 cm because the rail
  // tube (10 cm) is wider than the baluster (7 cm); aligning both
  // outer faces to the step edge means the centres can't coincide.
  // The baluster top still sits inside the rail-bottom footprint
  // (baluster half-width 3.5 cm, rail half-width 5 cm) so there's no
  // sliver protruding through — just an asymmetric overhang on the
  // well-facing side, which reads naturally as a rail mounted to the
  // posts from above.
  const railR =
    side === "inner" ? innerRadius + RAIL_BAR_HALF_WIDTH : outerRadius - RAIL_BAR_HALF_WIDTH;
  const balR = side === "inner" ? innerRadius + BALUSTER_SIZE / 2 : outerRadius - BALUSTER_SIZE / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const segPerStep = 3;

  // Gap is an ANGULAR window centred on entryAngle (rather than a
  // count of skipped step indices), so it can match the cutout-edge
  // rail's gate exactly regardless of how the spiral's steps line up
  // with it.
  const inGap = (theta: number): boolean => {
    if (gateHalfArc <= 0) return false;
    const angDiff = Math.atan2(Math.sin(theta - entryAngle), Math.cos(theta - entryAngle));
    return Math.abs(angDiff) < gateHalfArc;
  };

  const balusters: Array<{
    pos: [number, number, number];
    angle: number;
    height: number;
  }> = [];
  const endpoints: Array<[number, number, number]> = [];
  // Track the start of each contiguous tube segment so we can cap
  // both ends — when a gap interrupts the rail, or when the loop
  // finishes, we close the last open segment with a flat end cap so
  // it doesn't read as an open tube end. We also record the centreline
  // position at each end so the renderer can place a finial sphere
  // there.
  let segmentStartIdx = -1;
  let prevBaseIdx = -1;
  let segmentStartCenter: [number, number, number] | null = null;
  let lastSampleCenter: [number, number, number] | null = null;

  const closeSegment = () => {
    if (segmentStartIdx === -1 || prevBaseIdx === -1) return;
    if (segmentStartIdx === prevBaseIdx) {
      // Single-sample segment, nothing to cap.
      segmentStartIdx = -1;
      prevBaseIdx = -1;
      segmentStartCenter = null;
      lastSampleCenter = null;
      return;
    }
    if (closeEnds) {
      const s = segmentStartIdx;
      const e = prevBaseIdx;
      // Start cap (faces −tangent direction at the segment's first sample).
      indices.push(s + 0, s + 2, s + 1);
      indices.push(s + 0, s + 3, s + 2);
      // End cap (faces +tangent direction at the segment's last sample).
      indices.push(e + 0, e + 1, e + 2);
      indices.push(e + 0, e + 2, e + 3);
    }
    if (segmentStartCenter) endpoints.push(segmentStartCenter);
    if (lastSampleCenter) endpoints.push(lastSampleCenter);
    segmentStartIdx = -1;
    prevBaseIdx = -1;
    segmentStartCenter = null;
    lastSampleCenter = null;
  };

  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    // Skip s=0 for every step after the first: it sits at the same
    // theta and Y as the previous step's s=segPerStep sample, so
    // emitting both produces duplicate vertices at every step
    // boundary with zero-area "bridge" faces between them.
    // computeVertexNormals then averages each duplicate's normal
    // from one side only (each duplicate is incident only to its
    // OWN step's faces), so the two coincident vertices end up with
    // DIFFERENT normals — a hard shading kink that reads as a flat
    // panel-shaped seam every ~16° around the spiral. Step 0 keeps
    // s=0 because that sample is the segment's first ring and has
    // no predecessor to duplicate.
    const sStart = i === 0 ? 0 : 1;
    for (let s = sStart; s <= segPerStep; s++) {
      const t = s / segPerStep;
      const theta = lo + (hi - lo) * t;
      // Per-sample gating: the gap is an angular window around the
      // entry direction, not a count of skipped step indices, so it
      // can be smaller or larger than a step's worth of arc and still
      // align with the cutout-rail's gate.
      if (inGap(theta)) {
        closeSegment();
        continue;
      }
      // Smooth helical Y — the rail rises continuously with angular
      // progress along the spiral instead of holding flat across a
      // step and jumping at every boundary. tGlobal interpolates
      // through the same step + sample fraction the treads use, so
      // the rail meets the baluster top at every step's start angle
      // exactly (one rise above the previous step's top).
      const tGlobal = (i + t) / numSteps;
      const yTop = lowerY + tGlobal * (upperY - lowerY) + RAIL_HEIGHT;
      const cx = railR * Math.cos(theta);
      const cz = railR * Math.sin(theta);
      // Outward radial unit vector at this angle.
      const ox = Math.cos(theta);
      const oz = Math.sin(theta);

      const baseIdx = positions.length / 3;
      // Vertex layout: 0=TO (top-outer), 1=TI (top-inner),
      //                2=BI (bot-inner), 3=BO (bot-outer).
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
      // Centre-line of the tube cross-section at this sample — used
      // for finial placement at each segment end.
      const centerY = yTop - RAIL_BAR_HEIGHT / 2;
      const sampleCenter: [number, number, number] = [cx, centerY, cz];
      if (segmentStartIdx === -1) {
        segmentStartIdx = baseIdx;
        segmentStartCenter = sampleCenter;
      }
      lastSampleCenter = sampleCenter;

      if (prevBaseIdx !== -1) {
        const p = prevBaseIdx;
        const c = baseIdx;
        // Top face (+Y normal).
        indices.push(p + 0, p + 1, c + 1);
        indices.push(p + 0, c + 1, c + 0);
        // Bottom face (−Y normal).
        indices.push(p + 3, c + 3, c + 2);
        indices.push(p + 3, c + 2, p + 2);
        // Outer face (+radial normal).
        indices.push(p + 3, p + 0, c + 0);
        indices.push(p + 3, c + 0, c + 3);
        // Inner face (−radial normal).
        indices.push(p + 2, c + 2, c + 1);
        indices.push(p + 2, c + 1, p + 1);
      }
      prevBaseIdx = baseIdx;
    }
    // One baluster per step, mounted on step i's tread with its
    // trailing face flush against the riser at aStart. Shift the
    // centre angle by half a baluster-width along the spiral's
    // ascending direction so the trailing corner lands exactly on the
    // step's leading edge instead of straddling the riser halfway
    // into step i-1's territory.
    //
    // The helical rail rises continuously with angle, so the rail's Y
    // at the SHIFTED baluster angle is slightly higher than at aStart.
    // We compute the per-baluster height to bridge the gap: bottom
    // still sits on step i's tread, top reaches the rail's bottom
    // face at this baluster's angle. Without this extension a visible
    // ~1 cm gap opens up between baluster top and rail underside.
    const balAngle = aStart + (direction * BALUSTER_SIZE) / (2 * balR);
    if (!inGap(balAngle)) {
      // tStep = how far along step i the baluster sits, in [0, 1] —
      // same parametrisation the rail uses to interpolate Y.
      const tStep = (balAngle - Math.min(aStart, aEnd)) / Math.abs(stepAngle);
      const balHeight = BALUSTER_HEIGHT + tStep * stepRise;
      const balBottomY = lowerY + i * stepRise;
      balusters.push({
        pos: [balR * Math.cos(balAngle), balBottomY + balHeight / 2, balR * Math.sin(balAngle)],
        angle: balAngle,
        height: balHeight,
      });
    }
  }
  // Cap the final segment that ran off the loop's end.
  closeSegment();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { rail: geom, balusters, endpoints };
}

/** Build a flat annular-sector slab at the spiral's upper end, filling
 *  the half of the well OPPOSITE the entry gate. Used only for the
 *  topmost staircase: the up-half of the gate is a dead end (no further
 *  flight above), so there's no spiral wrapping that side at upperY —
 *  visually a yawning gap into the well below. The slab caps the
 *  staircase: the player arriving at the top now stands across from a
 *  proper flat landing instead of empty air, and the helix reads as
 *  "ending in a platform" rather than just stopping mid-spiral.
 *
 *  Geometry is the same wedge-of-annulus the spiral treads use — full
 *  spiral annulus radially, dead-end half angularly — at upperY with
 *  one tread's worth of thickness. */
function buildTopLandingGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { innerRadius, outerRadius, direction, lowerY, upperY, entryAngle, numSteps } = staircase;
  // Span the half-revolution past the entry gate, in the direction the
  // ascending player WOULD continue if there were a flight above. On
  // the topmost staircase that direction is a dead end at upperY; the
  // landing occupies its angular footprint as a flat platform.
  const start = entryAngle;
  const end = entryAngle + direction * Math.PI;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const stepRise = (upperY - lowerY) / numSteps;
  // The landing's edge is the last riser of the climb, so it takes a
  // step light like the rest; its top is a floor, not a tread.
  const { positions, colors, indices } = buildTreadGeometry(
    innerRadius,
    outerRadius,
    lo,
    hi,
    upperY,
    stepRise,
    32,
    risingCap(direction),
  );
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Build a set of stout horizontal beams — one per step — anchoring
 *  the inner edge of each tread to the central stone column. Each
 *  beam overlaps a few centimetres into the column on its inner end
 *  and a few centimetres into the tread on its outer end, so there's
 *  no visible gap at either join. They're sized to read as proper
 *  forged brackets rather than thin strips: tangentially almost as
 *  wide as the tread's inner edge (0.4 m), vertically a hair under
 *  the full step rise so they fill most of the riser space without
 *  fighting the next tread above. Centred under each tread (not at
 *  the step boundary) so they read as supports for the wedge
 *  directly above them. */
function buildStepBrackets(staircase: Staircase): Array<{
  position: [number, number, number];
  rotationY: number;
  length: number;
  height: number;
  width: number;
}> {
  const { numSteps, direction, lowerY, upperY, innerRadius, entryAngle } = staircase;
  const stepAngle = ((Math.PI * 2) / numSteps) * direction;
  const stepRise = (upperY - lowerY) / numSteps;
  // Bracket spans from a few cm INSIDE the column (so it merges
  // visually with the cylinder's surface) out to a few cm INTO the
  // tread (so it tucks under the wedge with no air gap).
  const innerR = SPIRAL_COLUMN_RADIUS - 0.05;
  const outerR = innerRadius + 0.04;
  const length = outerR - innerR;
  const midR = (innerR + outerR) / 2;
  // Vertical thickness — most of the step rise, leaving a 4 cm
  // breathing gap above so the next bracket's top doesn't punch
  // into this bracket from above when the spiral stacks.
  const height = stepRise - 0.04;
  // Tangential thickness — wide enough to look like a real beam
  // rather than a fishing rod, but narrow enough that adjacent
  // brackets don't visually overlap (step width along inner
  // tread edge is ≈ innerRadius * stepAngle ≈ 0.74 m).
  const width = 0.4;
  const out: Array<{
    position: [number, number, number];
    rotationY: number;
    length: number;
    height: number;
    width: number;
  }> = [];
  for (let i = 0; i < numSteps; i++) {
    // Centred under the tread's middle angle (not its start), so
    // the bracket sits visually under the wedge it supports.
    const a = entryAngle + (i + 0.5) * stepAngle;
    // Tread bottom Y = treadTopY - stepRise where
    // treadTopY = lowerY + i*stepRise; bracket TOP touches that
    // exactly, so centreline is half a bracket-height below.
    const treadBottomY = lowerY + i * stepRise - stepRise;
    const yCentre = treadBottomY - height / 2;
    // rotationY = -a, NOT +a: three.js's Y-rotation maps local +X
    // to (cos θ, 0, -sin θ), but we need it to land on the radial
    // outward direction at angle a, which is (cos a, 0, sin a).
    // That requires θ = -a. Using +a here pointed every bracket at
    // the mirror angle across the X-axis, so they fanned in random
    // directions instead of lying along the radial line under each
    // tread.
    out.push({
      position: [midR * Math.cos(a), yCentre, midR * Math.sin(a)],
      rotationY: -a,
      length,
      height,
      width,
    });
  }
  return out;
}

/**
 * Render one revolution of the open-well spiral. Treads are real
 * wedge geometry (top, bottom, inner curve, outer curve, riser caps)
 * so each step reads as a step rather than a smoothed ramp. Two
 * railings — one along the inner edge of the open well, one along
 * the outer edge — give the player a clear handhold on either side
 * as they climb. The outer rail has a one-step gap at the entry
 * direction so the player can step onto / off the spiral; the
 * directional signs themselves live on gate posts placed by the
 * stairwell-accents component, where they can sit flush against
 * substantial railing posts at floor level.
 *
 * A central stone column runs through the open well from this
 * revolution's lower floor to its upper floor; the column segments
 * stack continuously across stories, giving the entire helix a
 * shared masonry spine. Per-step iron brackets reach from the
 * column out to the inner edge of each tread, so the steps read as
 * cantilevered off the column rather than floating in space.
 */
export function StaircaseRenderer({
  staircase,
  allStaircases,
}: {
  staircase: Staircase;
  /** Every staircase in the building. Used to determine whether this
   *  flight is the helix's lowest or highest revolution — only the
   *  absolute ends emit inner-rail newel finials, since the inner
   *  rail is continuous between adjacent flights and per-revolution
   *  finials at every floor boundary would render as overlapping
   *  knobs at every storey crossing. */
  allStaircases: readonly Staircase[];
}) {
  const { centerX, centerZ, lowerY, upperY } = staircase;
  const hasFlightBelow = findStairBelow(staircase, allStaircases) !== undefined;
  const hasFlightAbove = findStairAbove(staircase, allStaircases) !== undefined;

  const stepsGeom = useMemo(() => buildSpiralStepsGeometry(staircase), [staircase]);
  const innerRail = useMemo(() => buildSpiralRail(staircase, "inner", 0, false), [staircase]);
  const outerRail = useMemo(
    () => buildSpiralRail(staircase, "outer", spiralGateHalfArc(staircase.numSteps), false),
    [staircase],
  );
  // Rotate each baluster by -angle around Y so the box's local +X / +Z
  // axes align with the radial / tangential directions at its point on
  // the spiral. Without this each box reads as cocked relative to its
  // step (its corners pointing at world ±X / ±Z regardless of where it
  // lives on the curve).
  const balusterGeom = useMemo(
    () =>
      mergeBoxes(
        [...innerRail.balusters, ...outerRail.balusters].map((b) => ({
          size: [BALUSTER_SIZE, b.height, BALUSTER_SIZE],
          position: b.pos,
          rotationY: -b.angle,
        })),
      ),
    [innerRail, outerRail],
  );
  // Per-step radial beams tying each tread back to the column. Box's
  // local axes after Y-rotation:
  //   X = radial (length, spanning column → tread),
  //   Y = vertical (height, fills most of the step rise),
  //   Z = tangential (width, ≈ half the step's inner arc).
  const bracketGeom = useMemo(
    () =>
      mergeBoxes(
        buildStepBrackets(staircase).map((b) => ({
          size: [b.length, b.height, b.width],
          position: b.position,
          rotationY: b.rotationY,
        })),
      ),
    [staircase],
  );
  // Top landing — only the helix's topmost flight gets one. It caps
  // the spiral with a flat half-revolution at upperY so the climb has
  // a visible architectural ending; intermediate flights stack
  // continuously into the next revolution above and don't need it.
  const landingGeom = useMemo(
    () => (hasFlightAbove ? null : buildTopLandingGeometry(staircase)),
    [staircase, hasFlightAbove],
  );
  // Hand-built BufferGeometries don't get R3F's automatic teardown when
  // the parent <mesh> unmounts. Without this, every floor swap leaks
  // the previous floor's spirals (treads + both rail tubes) into VRAM.
  useEffect(
    () => () => {
      stepsGeom.dispose();
      innerRail.rail.dispose();
      outerRail.rail.dispose();
      landingGeom?.dispose();
      balusterGeom?.dispose();
      bracketGeom?.dispose();
    },
    [stepsGeom, innerRail, outerRail, landingGeom, balusterGeom, bracketGeom],
  );
  const columnHeight = upperY - lowerY;
  const columnY = (lowerY + upperY) / 2;

  return (
    <group position={[centerX, 0, centerZ]}>
      {/* Central stone column — the structural spine the steps
          wrap around. Sized well inside the spiral's inner radius
          (column r = SPIRAL_COLUMN_RADIUS, well inner edge at
          innerRadius = 2.6 m) so it never intrudes on the walking
          annulus. Per-revolution segments stack at floor levels
          to read as one continuous column from floor 0 to the
          top. */}
      <mesh position={[0, columnY, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[SPIRAL_COLUMN_RADIUS, SPIRAL_COLUMN_RADIUS, columnHeight, 32]} />
        <primitive object={columnMaterial} attach="material" />
      </mesh>

      {/* Treads — single merged mesh per stair. */}
      <mesh geometry={stepsGeom} castShadow receiveShadow>
        <primitive object={treadMaterial} attach="material" />
      </mesh>

      {/* Top landing — flat half-revolution slab capping the helix's
          topmost flight. Renders only when there's no flight above
          this one. */}
      {landingGeom && (
        <mesh geometry={landingGeom} castShadow receiveShadow>
          <primitive object={treadMaterial} attach="material" />
        </mesh>
      )}

      {/* Brackets from the column to each tread: forged iron
          hardware anchoring the wooden treads to the masonry spine. */}
      {bracketGeom && (
        <mesh geometry={bracketGeom} castShadow>
          <primitive object={bracketMaterial} attach="material" />
        </mesh>
      )}

      {/* Inner railing around the open well. */}
      <mesh geometry={innerRail.rail} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>

      {/* Outer railing along the outside of the spiral, with a
          one-step gap at the entry direction. */}
      <mesh geometry={outerRail.rail} castShadow>
        <primitive object={railTopMaterial} attach="material" />
      </mesh>
      {/* Both rails' balusters. */}
      {balusterGeom && (
        <mesh geometry={balusterGeom} castShadow>
          <primitive object={balusterMaterial} attach="material" />
        </mesh>
      )}

      {/* Newel-cap finials at every rail terminus. Each open tube end
          on a hand-built rectangular tube would otherwise expose its
          interior to any camera looking down the tangent axis (most
          visible at the entry gate, where the rail is sliced clean
          through). The brass sphere wraps the cross-section with
          margin to spare, so it covers the open end AND any tiny
          shading/positional seam where two abutting tube segments
          meet.
          Inner rail finials are emitted ONLY at the absolute top and
          bottom of the helix — the per-revolution endpoints at every
          intermediate floor boundary would otherwise stack into a
          single visible knob at every storey, even though the inner
          rail is continuous through the boundary. endpoints[0] is the
          segment's start (low Y), endpoints[1] its end (high Y). */}
      {!hasFlightBelow && innerRail.endpoints[0] && (
        <mesh position={innerRail.endpoints[0]} geometry={finialGeometry} castShadow>
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      )}
      {!hasFlightAbove && innerRail.endpoints[1] && (
        <mesh position={innerRail.endpoints[1]} geometry={finialGeometry} castShadow>
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      )}
      {outerRail.endpoints.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: endpoints array is fixed-length per rail, never reorders.
        <mesh key={`out-finial-${i}`} position={p} geometry={finialGeometry} castShadow>
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

/** Sign panel for use on gate posts — exposed so the stairwell-accents
 *  component can mount them on the cutout-edge railing rather than on
 *  floating posts inside the stair. */
export function StairSign({
  position,
  rotationY,
  label,
  direction,
}: {
  position: [number, number, number];
  rotationY: number;
  label: string;
  direction: "up" | "down";
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Sign plaque fits within the gate-post panel (0.85 m wide)
          so post + sign read as one architectural unit, not a + cross.
          Slightly taller than before to give the wrapped era titles
          room to breathe across two lines. */}
      <mesh>
        <boxGeometry args={[0.78, 0.42, 0.025]} />
        <primitive object={signBaseMaterial} attach="material" />
      </mesh>
      <mesh
        position={[0, 0.13, 0.014]}
        geometry={direction === "up" ? upArrowGeometry : downArrowGeometry}
        material={signGlyphMaterial}
      />
      <Text
        position={[0, -0.07, 0.014]}
        fontSize={0.09}
        color="#f2e9d0"
        anchorX="center"
        anchorY="middle"
        textAlign="center"
        lineHeight={1.15}
        maxWidth={0.7}
      >
        {label}
      </Text>
    </group>
  );
}
