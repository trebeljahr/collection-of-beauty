"use client";

import { Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Staircase } from "@/lib/gallery-layout/types";
import { SPIRAL_COLUMN_RADIUS } from "@/lib/gallery-layout/world-coords";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { getFrameMaps } from "./frame-maps";
import { LIGHT_TINT } from "./painting-light";
import { HIGHLIGHT_ENV_MATERIALS, signBaseMaterial } from "./palette-materials";
import {
  BALUSTER_HEIGHT,
  BALUSTER_SIZE,
  RAIL_BAR_HALF_WIDTH,
  RAIL_BAR_HEIGHT,
  RAIL_HEIGHT,
} from "./rail-constants";
import {
  findStairAbove,
  findStairBelow,
  spiralGateHalfArc,
  topLandingDepth,
} from "./spiral-physics";
import { getStairMaps } from "./stair-maps";

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
//
// Rico, 17 October 2026: the spiral, like the grand stairs, read as a
// toy in flat colour. The treads are walnut with its grain along each
// tread (the frames' walnut map, frame-maps.ts), each tread cut from
// another part of the board, and the column a grey veined marble.
const frameMaps = getFrameMaps();
const stairMaps = getStairMaps();
const treadMaterial = new THREE.MeshStandardMaterial({
  color: "#f4ece4",
  map: frameMaps.walnutColor,
  normalMap: frameMaps.walnutNormal,
  normalScale: new THREE.Vector2(0.5, 0.5),
  roughness: 0.55,
  metalness: 0,
  // The step lights are baked into the treads' vertex colours.
  vertexColors: true,
});
/** The walnut's mean colour: what the step lights are reckoned against. */
const TREAD_WOOD = new THREE.Color("#3a2a1f");
/** How far the soffit stays under a tread's top at its back edge: half a
 *  rise. Each tread a block with a flat bottom made the underside of
 *  the flight above a staircase upside down; now it is one helicoid, and
 *  the column's brackets still meet it under each tread's middle. */
const SOFFIT_WAIST_RISES = 0.5;

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
  const wood = TREAD_WOOD;
  const t = LIGHT_TINT;
  return [t.r / wood.r, t.g / wood.g, t.b / wood.b];
})();
/** The hand rail: polished gold, shared with the rail round the well
 *  (stairwell-rail.tsx). It was aged brass at half metalness and
 *  roughness 0.55, and Rico found it dull (17 October 2026): half a
 *  metal mixes a brown diffuse into the reflection, and at that
 *  roughness the lamps of the highlight map smear into one tone. Whole
 *  metal at low roughness mirrors each lamp as a bright line that runs
 *  along the rail as the visitor climbs. The colour is gold's own
 *  reflectance, a little deeper than the measured F0 so the shade
 *  between the lamps stays gold and not pale yellow. */
export const railTopMaterial = new THREE.MeshStandardMaterial({
  color: "#f2c260",
  roughness: 0.2,
  metalness: 1,
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
  // Grey veined marble for the central column: distinct from the wood
  // treads and the iron, the masonry spine the steps wrap around.
  color: "#a49d94",
  map: stairMaps.marbleColor,
  roughness: 1,
  roughnessMap: stairMaps.marbleRough,
  normalMap: stairMaps.marbleNormal,
  normalScale: new THREE.Vector2(0.3, 0.3),
  metalness: 0.02,
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

/** A baluster's iron bar: its radius, and the collar at its foot and the
 *  one under the rail, [radius, height]. Square 7 cm posts read as
 *  timber painted black; a real stair has a turned or forged bar. */
export const BAR_RADIUS = 0.017;
const BAR_FOOT_COLLAR: [number, number] = [0.032, 0.06];
const BAR_HEAD_COLLAR: [number, number] = [0.026, 0.035];
const BAR_SIDES = 8;

/** Round iron balusters as one geometry: each a bar with a collar at
 *  its foot and under its head, `position` its centre. */
export function mergeBars(
  parts: ReadonlyArray<{ position: readonly [number, number, number]; height: number }>,
): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const pieces: THREE.BufferGeometry[] = [];
  for (const {
    position: [x, y, z],
    height,
  } of parts) {
    const foot = y - height / 2;
    const head = y + height / 2;
    pieces.push(
      new THREE.CylinderGeometry(BAR_RADIUS, BAR_RADIUS, height, BAR_SIDES, 1, true).translate(
        x,
        y,
        z,
      ),
      new THREE.CylinderGeometry(
        BAR_FOOT_COLLAR[0] * 0.85,
        BAR_FOOT_COLLAR[0],
        BAR_FOOT_COLLAR[1],
        BAR_SIDES,
      ).translate(x, foot + BAR_FOOT_COLLAR[1] / 2, z),
      new THREE.CylinderGeometry(
        BAR_HEAD_COLLAR[0],
        BAR_HEAD_COLLAR[0] * 0.8,
        BAR_HEAD_COLLAR[1],
        BAR_SIDES,
      ).translate(x, head - BAR_HEAD_COLLAR[1] / 2, z),
    );
  }
  const merged = mergeGeometries(pieces, false);
  for (const g of pieces) g.dispose();
  return merged;
}

/** Gives a geometry uvs in metres, each vertex projected on the plane
 *  its normal looks at most nearly. */
function boxUv(g: THREE.BufferGeometry) {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] =
      ay >= ax && ay >= az
        ? [pos.getX(i), pos.getZ(i)]
        : ax >= az
          ? [pos.getZ(i), pos.getY(i)]
          : [pos.getX(i), pos.getY(i)];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
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
  /** With a riser: how far the soffit stays under the top at the far
   *  cap. The bottom then rises across the block by `thickness`, from
   *  `thickness + waist` under the top at the riser, so the blocks of a
   *  flight have one sloped underside. */
  waist = 0,
  /** Where in the wood the block is cut from: a uv offset, metres. */
  offset: readonly [number, number] = [0, 0],
): { positions: number[]; colors: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const midR = (innerR + outerR) / 2;
  // The bottom's height at a place along the arc, 0 at thetaStart.
  const bottomAt = (t: number) =>
    riser === "start"
      ? topY - thickness - waist + thickness * t
      : riser === "end"
        ? topY - waist - thickness * t
        : topY - thickness;

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    u: number,
    v: number,
    color: Rgb = UNLIT,
  ): number => {
    const idx = positions.length / 3;
    positions.push(x, y, z);
    colors.push(color[0], color[1], color[2]);
    uvs.push(u + offset[0], v + offset[1]);
    return idx;
  };

  // Helper: build a row of (segments+1) verts at a fixed radius, at a
  // height given by place along the arc, returning the index of each.
  // `colorAt` takes the vertex's place along the arc, 0 at thetaStart to
  // 1 at thetaEnd. The grain runs along the tread: on its top and
  // bottom u is the radius; on the curved faces u runs round the arc.
  const ringAt = (
    r: number,
    yAt: (t: number) => number,
    face: "flat" | "curve",
    colorAt?: (t: number) => Rgb,
  ): number[] => {
    const out: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const theta = thetaStart + (thetaEnd - thetaStart) * t;
      const y = yAt(t);
      const [u, v] = face === "flat" ? [r, theta * midR] : [theta * r, y];
      out.push(pushVertex(r * Math.cos(theta), y, r * Math.sin(theta), u, v, colorAt?.(t)));
    }
    return out;
  };
  const atTop = () => topY;

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
  const topInner = ringAt(innerR, atTop, "flat", spillAt);
  const topOuter = ringAt(outerR, atTop, "flat", spillAt);
  for (let i = 0; i < segments; i++) {
    indices.push(topInner[i], topInner[i + 1], topOuter[i]);
    indices.push(topInner[i + 1], topOuter[i + 1], topOuter[i]);
  }

  // ── Bottom face (−Y normal) — mirrored winding of the top.
  // outer→inner-next→outer-next gives X×Z=−Y on the underside.
  const bottomInner = ringAt(innerR, bottomAt, "flat");
  const bottomOuter = ringAt(outerR, bottomAt, "flat");
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
  const innerCurveTop = ringAt(innerR, atTop, "curve");
  const innerCurveBot = ringAt(innerR, bottomAt, "curve");
  for (let i = 0; i < segments; i++) {
    indices.push(innerCurveBot[i + 1], innerCurveTop[i], innerCurveBot[i]);
    indices.push(innerCurveBot[i + 1], innerCurveTop[i + 1], innerCurveTop[i]);
  }

  // ── Outer curved face (+radial normal, smooth across segments).
  const outerCurveTop = ringAt(outerR, atTop, "curve");
  const outerCurveBot = ringAt(outerR, bottomAt, "curve");
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
    const bottomY = bottomAt(end === "start" ? 0 : 1);
    const at = (r: number, y: number, color?: Rgb) =>
      pushVertex(r * Math.cos(theta), y, r * Math.sin(theta), r, y, color);
    const quad = (ib: number, it: number, ob: number, ot: number) => {
      if (end === "start") indices.push(ib, it, ob, it, ot, ob);
      else indices.push(ib, ob, it, it, ob, ot);
    };
    if (riser !== end) {
      if (topY - bottomY > 1e-6) {
        quad(at(innerR, bottomY), at(innerR, topY), at(outerR, bottomY), at(outerR, topY));
      }
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

  return { positions, colors, uvs, indices };
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
  const uvs: number[] = [];
  const indices: number[] = [];
  // The floor's hole is cut at these vertices (`SPIRAL_EDGE_SEGMENTS`).
  const segPerStep = 4;
  // Steps of every flight count on from the floor below, so the boards
  // of two flights never repeat one another.
  const firstStep = Math.round(lowerY / stepRise);

  for (let i = 0; i < numSteps; i++) {
    const aStart = entryAngle + i * stepAngle;
    const aEnd = entryAngle + (i + 1) * stepAngle;
    const lo = Math.min(aStart, aEnd);
    const hi = Math.max(aStart, aEnd);
    const topY = lowerY + i * stepRise;
    const n = firstStep + i;
    const grain = Math.sin(n * 12.9898) * 43758.5453;
    const {
      positions: p,
      colors: c,
      uvs: uv,
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
      SOFFIT_WAIST_RISES * stepRise,
      [(grain - Math.floor(grain)) * 5.12, n * 0.37],
    );
    const base = positions.length / 3;
    for (let k = 0; k < p.length; k++) positions.push(p[k]);
    for (let k = 0; k < c.length; k++) colors.push(c[k]);
    for (let k = 0; k < uv.length; k++) uvs.push(uv[k]);
    for (let k = 0; k < idx.length; k++) indices.push(idx[k] + base);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
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

/** Build the slab the topmost flight ends on: the patch between the
 *  gate and the handrail that closes the top floor's dead-end side.
 *
 *  That rail is an L from the spiral's inner rail out to the cutout
 *  rail (`lBridge` in `stairwell-rail.tsx`): a short arm on from the
 *  inner rail's top, then one parallel to the line from the well's
 *  centre through the gate, `topLandingDepth` past it. The slab fills
 *  what the L fences in, from the inner rail's line to the treads'
 *  outer edge, one riser above the last tread. Until 17 October 2026
 *  it ran half a revolution round the well behind that rail, a ledge
 *  nobody could reach that showed from every floor below. */
function buildTopLandingGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { innerRadius, outerRadius, entryAngle, direction, lowerY, upperY, numSteps } = staircase;
  const depth = topLandingDepth(staircase);
  const bottomY = upperY - (upperY - lowerY) / numSteps;
  // Outline in the gate's frame: `along` from the well's centre through
  // the gate, `across` round the way the spiral climbs. It runs the
  // gate's riser, the outer edge, the rail's line and the inner edge.
  const outerEnd = Math.asin(depth / outerRadius);
  const ARC_SEGMENTS = 12;
  const outline: Array<[number, number]> = [[innerRadius, 0]];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const a = (outerEnd * i) / ARC_SEGMENTS;
    outline.push([outerRadius * Math.cos(a), outerRadius * Math.sin(a)]);
  }
  outline.push([innerRadius, depth]);

  const cos = Math.cos(entryAngle);
  const sin = Math.sin(entryAngle);
  const toWorld = ([along, across]: [number, number]): [number, number] => {
    const turned = direction * across;
    return [along * cos - turned * sin, along * sin + turned * cos];
  };
  const plan = outline.map(toWorld);
  const centre = plan.reduce(
    ([x, z], [px, pz]) => [x + px / plan.length, z + pz / plan.length],
    [0, 0],
  );

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vertex = ([x, z]: [number, number], y: number, color: Rgb = UNLIT): number => {
    positions.push(x, y, z);
    colors.push(color[0], color[1], color[2]);
    return positions.length / 3 - 1;
  };
  // A triangle wound so its normal points along `facing`.
  const triangle = (i: number, j: number, k: number, facing: [number, number, number]) => {
    const p = (n: number) => positions.slice(n * 3, n * 3 + 3);
    const [a, b, c] = [p(i), p(j), p(k)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const dot = normal[0] * facing[0] + normal[1] * facing[1] + normal[2] * facing[2];
    if (dot >= 0) indices.push(i, j, k);
    else indices.push(i, k, j);
  };
  // A wall under one edge of the outline, from y0 to y1, facing away
  // from the slab's middle.
  const wall = (
    from: [number, number],
    to: [number, number],
    y0: number,
    y1: number,
    c0: Rgb = UNLIT,
    c1: Rgb = UNLIT,
  ) => {
    const out: [number, number, number] = [
      (from[0] + to[0]) / 2 - centre[0],
      0,
      (from[1] + to[1]) / 2 - centre[1],
    ];
    const fb = vertex(from, y0, c0);
    const ft = vertex(from, y1, c1);
    const tb = vertex(to, y0, c0);
    const tt = vertex(to, y1, c1);
    triangle(fb, ft, tb, out);
    triangle(ft, tt, tb, out);
  };

  // Top and bottom: the outline is convex, so a fan from its first
  // corner covers it.
  for (const [y, facing] of [
    [upperY, 1],
    [bottomY, -1],
  ] as const) {
    const ring = plan.map((p) => vertex(p, y));
    for (let i = 1; i < ring.length - 1; i++) {
      triangle(ring[0], ring[i], ring[i + 1], [0, facing, 0]);
    }
  }

  // The gate's edge is the last riser of the climb, so it takes a step
  // light like every tread; the other edges are plain.
  const stripY = upperY - STEP_LIGHT_HEIGHT;
  wall(plan[0], plan[1], bottomY, stripY, wash(RISER_WASH_FOOT), wash(RISER_WASH_TOP));
  wall(plan[0], plan[1], stripY, upperY, STRIP, STRIP);
  for (let i = 1; i < plan.length; i++) {
    wall(plan[i], plan[(i + 1) % plan.length], bottomY, upperY);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  boxUv(geom);
  return geom;
}

/** A bracket's square section, metres. */
const BRACKET_SIZE = 0.12;

/** Build a set of horizontal arms — one per step — anchoring the
 *  inner edge of each tread to the central stone column. Each arm
 *  overlaps a few centimetres into the column on its inner end and a
 *  few centimetres into the tread on its outer end, so there's no
 *  visible gap at either join. Centred under each tread (not at the
 *  step boundary) so they read as supports for the wedge directly
 *  above them. */
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
  // A forged arm, 12 cm square. Until 17 October 2026 each bracket
  // filled most of a rise and was 40 cm wide; under the treads' one
  // sloped soffit they read as a second flight of steps in the well.
  const height = BRACKET_SIZE;
  const width = BRACKET_SIZE;
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
    // Under a tread's middle its soffit is one rise below its top
    // (`SOFFIT_WAIST_RISES`); the bracket's top touches it there, so
    // its centreline is half a bracket-height below.
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
  const balusterGeom = useMemo(
    () =>
      mergeBars(
        [...innerRail.balusters, ...outerRail.balusters].map((b) => ({
          position: b.pos,
          height: b.height,
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
  // Top landing — only the helix's topmost flight gets one: the patch
  // past the gate as far as the handrail that closes the well.
  // Intermediate flights stack continuously into the next revolution
  // above and don't need it.
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
  // The column's uvs in metres, its height counted from the ground, so
  // the marble runs on unbroken from one storey's segment to the next.
  const columnGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(
      SPIRAL_COLUMN_RADIUS,
      SPIRAL_COLUMN_RADIUS,
      columnHeight,
      32,
      1,
      true,
    );
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        uv.getX(i) * 2 * Math.PI * SPIRAL_COLUMN_RADIUS,
        lowerY + uv.getY(i) * columnHeight,
      );
    }
    return g;
  }, [columnHeight, lowerY]);
  useEffect(() => () => columnGeom.dispose(), [columnGeom]);

  return (
    <group position={[centerX, 0, centerZ]}>
      {/* Central stone column — the structural spine the steps
          wrap around. Sized well inside the spiral's inner radius
          (column r = SPIRAL_COLUMN_RADIUS, well inner edge at
          innerRadius = 2.6 m) so it never intrudes on the walking
          annulus. Per-revolution segments stack at floor levels
          to read as one continuous column from floor 0 to the
          top. */}
      <mesh geometry={columnGeom} position={[0, columnY, 0]} castShadow receiveShadow>
        <primitive object={columnMaterial} attach="material" />
      </mesh>

      {/* Treads — single merged mesh per stair. */}
      <mesh geometry={stepsGeom} castShadow receiveShadow>
        <primitive object={treadMaterial} attach="material" />
      </mesh>

      {/* Top landing — the slab between the gate and the rail that
          closes the well. Renders only when there's no flight above
          this one. */}
      {landingGeom && (
        <mesh geometry={landingGeom} castShadow receiveShadow>
          <primitive object={treadMaterial} attach="material" />
        </mesh>
      )}

      {/* Brackets from the column to each tread: forged iron
          hardware anchoring the wooden treads to the masonry spine. */}
      {bracketGeom && (
        <mesh geometry={bracketGeom} layers={UNREFLECTED_LAYER} castShadow>
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
        <mesh geometry={balusterGeom} layers={UNREFLECTED_LAYER} castShadow>
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
        <mesh
          position={innerRail.endpoints[0]}
          geometry={finialGeometry}
          layers={UNREFLECTED_LAYER}
          castShadow
        >
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      )}
      {!hasFlightAbove && innerRail.endpoints[1] && (
        <mesh
          position={innerRail.endpoints[1]}
          geometry={finialGeometry}
          layers={UNREFLECTED_LAYER}
          castShadow
        >
          <primitive object={railTopMaterial} attach="material" />
        </mesh>
      )}
      {outerRail.endpoints.map((p, i) => (
        <mesh
          // biome-ignore lint/suspicious/noArrayIndexKey: endpoints array is fixed-length per rail, never reorders.
          key={`out-finial-${i}`}
          position={p}
          geometry={finialGeometry}
          layers={UNREFLECTED_LAYER}
          castShadow
        >
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
      <mesh layers={UNREFLECTED_LAYER}>
        <boxGeometry args={[0.78, 0.42, 0.025]} />
        <primitive object={signBaseMaterial} attach="material" />
      </mesh>
      <mesh
        position={[0, 0.13, 0.014]}
        geometry={direction === "up" ? upArrowGeometry : downArrowGeometry}
        material={signGlyphMaterial}
        layers={UNREFLECTED_LAYER}
      />
      <Text
        position={[0, -0.07, 0.014]}
        layers={UNREFLECTED_LAYER}
        // A floor name over 24 characters ("Natural History and East
        // Asian Art") ran to three lines at 0.09 and past the plaque.
        fontSize={label.length > 24 ? 0.07 : 0.09}
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
