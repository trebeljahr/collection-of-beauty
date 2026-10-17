"use client";

import { Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Staircase } from "@/lib/gallery-layout/types";
import { FLOOR_THICKNESS, SPIRAL_COLUMN_RADIUS } from "@/lib/gallery-layout/world-coords";
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
  spiralPieces,
  spiralRailLineY,
  spiralSoffitY,
  spiralStepRise,
  spiralTreadArc,
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
  // Oiled, not lacquered: Rico found the stairs too shiny.
  roughness: 0.68,
  metalness: 0,
  // The step lights are baked into the treads' vertex colours.
  vertexColors: true,
});
treadMaterial.userData.envScale = 0.6;
/** The walnut's mean colour: what the step lights are reckoned against. */
const TREAD_WOOD = new THREE.Color("#3a2a1f");

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
  metalness: 0,
});
columnMaterial.userData.envScale = 0.5;
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
 *  the tube was RAIL_BAR_HEIGHT × 2*RAIL_BAR_HALF_WIDTH = 0.10 × 0.10,
 *  with corners ≈ 0.0707 m from centre (its top is round now). At R=0.085 the tube
 *  emerges from the sphere at distance √(R²−h²) ≈ 0.069 m from the
 *  centre — visually the rail appears to grow out of a tiny bump,
 *  with a sharp crease where the flat tube face meets the curved
 *  sphere. R=0.13 pushes that intersection back to ≈ 0.12 m and
 *  the sphere clearly stands proud of the rail, reading as a
 *  proper newel cap. Shared geometry so all finials in the scene
 *  reuse one buffer. */
const FINIAL_RADIUS = 0.13;
export const finialGeometry = new THREE.SphereGeometry(FINIAL_RADIUS, 24, 16);

/** The hand rail's cross-section, as [outward, up] offsets from the
 *  middle of its top edge, counter-clockwise from the outer side: a
 *  round top over straight sides and a flat underside where the
 *  balusters meet it. A square tube with four vertices had one normal
 *  across each face, so polished metal mirrored one tone of the room
 *  along the whole rail; a round top carries the lamps of the
 *  highlight map as a bright line along its crown. The outline is the
 *  old tube's, so the balusters and the colliders stay as they were. */
const RAIL_PROFILE: ReadonlyArray<readonly [number, number]> = (() => {
  const r = RAIL_BAR_HALF_WIDTH;
  const crown = 10;
  const points: Array<[number, number]> = [];
  for (let k = 0; k <= crown; k++) {
    const phi = (Math.PI * k) / crown;
    points.push([r * Math.cos(phi), -r + r * Math.sin(phi)]);
  }
  points.push([-r, -RAIL_BAR_HEIGHT], [r, -RAIL_BAR_HEIGHT]);
  return points;
})();

/** One ring of the rail's profile at a sample: `top` the height of its
 *  crown, (ox, oz) the outward unit vector. The rail must run so that
 *  outward, up and the direction of travel are right-handed (outward
 *  +x, up +y, travel +z), or its faces turn inward. */
export function pushRailRing(
  positions: number[],
  cx: number,
  top: number,
  cz: number,
  ox: number,
  oz: number,
): void {
  for (const [out, up] of RAIL_PROFILE) {
    positions.push(cx + ox * out, top + up, cz + oz * out);
  }
}

/** The rail's surface between two rings that start at `p` and `c`. */
export function pushRailSides(indices: number[], p: number, c: number): void {
  const n = RAIL_PROFILE.length;
  for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n;
    indices.push(p + k, p + k1, c + k1, p + k, c + k1, c + k);
  }
}

/** A flat cap over the ring at `at`, facing back along the rail when
 *  it is the first ring and forward when it is the last. */
export function pushRailCap(indices: number[], at: number, end: "start" | "end"): void {
  for (let k = 1; k < RAIL_PROFILE.length - 1; k++) {
    if (end === "start") indices.push(at, at + k + 1, at + k);
    else indices.push(at, at + k, at + k + 1);
  }
}

/** A straight length of rail along local +x, centred on the origin
 *  half-way up its profile: the box it replaces put its centre there. */
export function railBarGeometry(length: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  // Outward is -z, so that outward, up and +x are right-handed.
  pushRailRing(positions, -length / 2, RAIL_BAR_HEIGHT / 2, 0, 0, -1);
  pushRailRing(positions, length / 2, RAIL_BAR_HEIGHT / 2, 0, 0, -1);
  pushRailSides(indices, 0, RAIL_PROFILE.length);
  pushRailCap(indices, 0, "start");
  pushRailCap(indices, RAIL_PROFILE.length, "end");
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

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
  segments: number,
  {
    rising,
    riser,
    spill,
    bottom,
    offset = [0, 0],
  }: {
    /** The radial cap a climber walks toward: the one at the lower
     *  angle when the spiral climbs with increasing angle. */
    rising: "start" | "end";
    /** Whether that cap is a riser, which takes a step light. */
    riser: boolean;
    /** How far the spill of the next riser up, standing at the far
     *  cap, reaches in: a tread's depth, as a share of this block's. 1
     *  on a tread, less on a landing, 0 for none. */
    spill: number;
    /** Y of the block's underside at the rising cap and at the far one;
     *  it slopes straight between them. */
    bottom: readonly [number, number];
    /** Where in the wood the block is cut from: a uv offset, metres. */
    offset?: readonly [number, number];
  },
): { positions: number[]; colors: number[]; uvs: number[]; indices: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const midR = (innerR + outerR) / 2;
  // Place along the climb, 0 at the rising cap, from place along the
  // arc, 0 at thetaStart.
  const climbed = (t: number) => (rising === "start" ? t : 1 - t);
  // The bottom's height at a place along the arc.
  const bottomAt = (t: number) => bottom[0] + (bottom[1] - bottom[0]) * climbed(t);

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
    spill > 0
      ? (t: number): Rgb => {
          const fromRiser = Math.min(
            TREAD_SPILL.length - 1,
            ((1 - climbed(t)) / spill) * (TREAD_SPILL.length - 1),
          );
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
    if (!riser || rising !== end) {
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

/** Merge the flight's pieces into one BufferGeometry: the half of the
 *  landing on its lower floor, its treads and the half of the landing
 *  on its upper floor, each level and placed where `stairHeightAt` puts
 *  the player's feet (`spiralPieces`). Two flights' halves meet at the
 *  gate of the floor between them and make one landing.
 *
 *  Each piece is a block whose underside is one sloped soffit for the
 *  whole helix (`spiralSoffitY`), so there's no see-through gap
 *  between pieces from any angle. The lowest flight's landing sinks a
 *  rise below the ground floor, deeper than the slab, which has a hole
 *  of the half landing's shape (`groundLandingHole`). */
function buildSpiralStepsGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { innerRadius, outerRadius, direction, lowerY, entryAngle } = staircase;
  const stepRise = spiralStepRise(staircase);
  const treadArc = spiralTreadArc(staircase);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // The floor's hole is cut at these vertices (`SPIRAL_EDGE_SEGMENTS`):
  // one every quarter of a tread's arc.
  const segmentArc = treadArc / 4;
  // Pieces of every flight count on from the floor below, so the boards
  // of two flights never repeat one another.
  const firstStep = Math.round(lowerY / stepRise);

  spiralPieces(staircase).forEach((piece, i) => {
    const a = entryAngle + direction * piece.from;
    const b = entryAngle + direction * piece.to;
    const n = firstStep + i;
    const grain = Math.sin(n * 12.9898) * 43758.5453;
    const depth = (piece.to - piece.from) / treadArc;
    const {
      positions: p,
      colors: c,
      uvs: uv,
      indices: idx,
    } = buildTreadGeometry(
      innerRadius,
      outerRadius,
      Math.min(a, b),
      Math.max(a, b),
      piece.top,
      Math.max(1, Math.round((piece.to - piece.from) / segmentArc)),
      {
        rising: risingCap(direction),
        // The landing on the lower floor is reached from the floor, not
        // up a riser; the other pieces each stand a rise above the last.
        riser: piece.kind !== "landing-low",
        // The upper landing's next riser is the next flight's, half a
        // landing on.
        spill: piece.kind === "landing-high" ? 0 : 1 / depth,
        bottom: [spiralSoffitY(staircase, piece.from), spiralSoffitY(staircase, piece.to)],
        offset: [(grain - Math.floor(grain)) * 5.12, n * 0.37],
      },
    );
    const base = positions.length / 3;
    for (let k = 0; k < p.length; k++) positions.push(p[k]);
    for (let k = 0; k < c.length; k++) colors.push(c[k]);
    for (let k = 0; k < uv.length; k++) uvs.push(uv[k]);
    for (let k = 0; k < idx.length; k++) indices.push(idx[k] + base);
  });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** Treads at the top of a flight whose outer side is a closed string
 *  up to the slab above (`buildOuterStringGeometry`) and not a rail.
 *  The flight comes up under the floor it arrives on, and between the
 *  last treads and the slab's edge was a slit that closed to a crack at
 *  the landing (Rico, 17 October 2026). Six treads take it to 1.2 m
 *  under the slab, where the rail, ending 0.15 m under it, takes over. */
const STRING_TREADS = 6;

/** Cumulative angle at which a flight's outer rail ends and its string
 *  begins. */
function stringStart(staircase: Staircase): number {
  return Math.PI * 2 - spiralGateHalfArc() - STRING_TREADS * spiralTreadArc(staircase);
}

/** Cumulative angles to sample a rail at between `from` and `to`: three
 *  to a tread's arc, and every place the rail's line bends. */
function railSamples(staircase: Staircase, from: number, to: number): number[] {
  const half = spiralGateHalfArc();
  const arc = spiralTreadArc(staircase);
  const marks = [0, half - arc, ...spiralPieces(staircase).map((p) => p.to), from, to];
  const out: number[] = [];
  const sorted = [...new Set(marks.map((m) => +m.toFixed(9)))].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b <= from || a >= to) continue;
    const n = Math.max(1, Math.round((b - a) / (arc / 3)));
    for (let k = out.length === 0 ? 0 : 1; k <= n; k++) out.push(a + ((b - a) * k) / n);
  }
  return out;
}

/** Build a spiral railing as a closed tube of the rail's profile
 *  (`pushRailRing`) following the rail path (`spiralRailLineY`) from
 *  cumulative angle `from` to `to`. Its ends are capped by finials.
 *
 *  Used for both the inner edge (around the open well, the whole
 *  revolution) and the outer edge (between treads and the stairwell
 *  room, from the landing's edge to the string). */
function buildSpiralRail(
  staircase: Staircase,
  side: "inner" | "outer",
  from: number,
  to: number,
): {
  rail: THREE.BufferGeometry;
  /** One entry per baluster: its centre and its height, from the
   *  walking surface to the rail's underside. */
  balusters: Array<{
    pos: [number, number, number];
    height: number;
  }>;
  /** Centre-line positions where the tube starts and ends. A finial
   *  sphere is placed on each so the open tube cross-section is hidden
   *  and any tiny seam between abutting segments is covered. */
  endpoints: Array<[number, number, number]>;
} {
  const { innerRadius, outerRadius, direction, entryAngle } = staircase;
  // Rail and balusters sit so their step-side face is FLUSH with the
  // step's edge — the rail's outer face at outerRadius (or its inner
  // face at innerRadius for the inner rail), and each baluster's
  // matching face on the same plane.
  const railR =
    side === "inner" ? innerRadius + RAIL_BAR_HALF_WIDTH : outerRadius - RAIL_BAR_HALF_WIDTH;
  const balR = side === "inner" ? innerRadius + BALUSTER_SIZE / 2 : outerRadius - BALUSTER_SIZE / 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const endpoints: Array<[number, number, number]> = [];
  const samples = railSamples(staircase, from, to);

  samples.forEach((cum, s) => {
    const theta = entryAngle + direction * cum;
    const yTop = spiralRailLineY(staircase, cum) + RAIL_HEIGHT;
    const cx = railR * Math.cos(theta);
    const cz = railR * Math.sin(theta);
    // Outward radial unit vector at this angle.
    const ox = Math.cos(theta);
    const oz = Math.sin(theta);
    const c = positions.length / 3;
    pushRailRing(positions, cx, yTop, cz, ox, oz);
    if (s === 0 || s === samples.length - 1) {
      endpoints.push([cx, yTop - RAIL_BAR_HEIGHT / 2, cz]);
    }
    if (s > 0) pushRailSides(indices, c - RAIL_PROFILE.length, c);
  });

  // One baluster per tread, its trailing face flush against the riser,
  // and on the landing at the same pitch, so the posts march on round
  // the gate unbroken from one flight to the next. Each reaches from
  // the surface it stands on to the rail's underside above it.
  const half = spiralGateHalfArc();
  const arc = spiralTreadArc(staircase);
  const shift = BALUSTER_SIZE / (2 * balR);
  const posts: Array<{ cum: number; floorY: number }> = [];
  for (const piece of spiralPieces(staircase)) {
    if (piece.kind === "tread") {
      posts.push({ cum: piece.from + shift, floorY: piece.top });
    } else if (piece.kind === "landing-low") {
      for (let c = half - arc; c > 0; c -= arc) posts.push({ cum: c, floorY: piece.top });
    } else {
      for (let c = piece.from + arc; c < piece.to; c += arc) {
        posts.push({ cum: c, floorY: piece.top });
      }
    }
  }
  const balusters = posts
    .filter((p) => p.cum >= from && p.cum <= to)
    .map(({ cum, floorY }) => {
      const theta = entryAngle + direction * cum;
      const height = spiralRailLineY(staircase, cum) + BALUSTER_HEIGHT - floorY;
      return {
        pos: [balR * Math.cos(theta), floorY + height / 2, balR * Math.sin(theta)] as [
          number,
          number,
          number,
        ],
        height,
      };
    });

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return { rail: geom, balusters, endpoints };
}

/** Build the slab the topmost flight's landing runs on into past the
 *  gate, where on any other floor the next flight's half would be: the
 *  patch between the gate and the handrail that closes the top floor's
 *  dead-end side.
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
  const { innerRadius, outerRadius, entryAngle, direction, upperY } = staircase;
  const depth = topLandingDepth(staircase);
  const bottomY = spiralSoffitY(staircase, Math.PI * 2);
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

  // The gate's edge meets the flight's own half of the landing, level
  // with it and as deep (`spiralSoffitY` at the gate), so it has no
  // face; the other edges are plain.
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

/** Thickness of the closed string, metres. */
const STRING_THICKNESS = 0.06;

/** Build the closed string along the outside of a flight's last
 *  treads (`STRING_TREADS`): a curved board just outside the treads'
 *  outer edge, from the flight's soffit up to the underside of the slab
 *  the flight arrives through, ending where the landing begins. Where a
 *  rail would stand less than its height under the slab, the slab's
 *  edge and the treads now meet in a wall, and the room below sees the
 *  board's outer face. Its top lies against the slab and has no face. */
function buildOuterStringGeometry(staircase: Staircase): THREE.BufferGeometry {
  const { outerRadius, direction, entryAngle, upperY } = staircase;
  const from = stringStart(staircase);
  const to = Math.PI * 2 - spiralGateHalfArc();
  const topY = upperY - FLOOR_THICKNESS;
  const rIn = outerRadius;
  const rOut = outerRadius + STRING_THICKNESS;
  // The vertices the treads' outer edge has (`buildSpiralStepsGeometry`).
  const segments = STRING_TREADS * 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const vertex = (r: number, cum: number, y: number, u: number, v: number) => {
    const theta = entryAngle + direction * cum;
    positions.push(r * Math.cos(theta), y, r * Math.sin(theta));
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };
  // A strip of quads along the arc between two edges, each given as
  // (cum) => [radius, y]. Unflipped, a strip from a lower edge to an
  // upper one faces out from the well, and one from an inner edge to
  // an outer one faces down.
  const strip = (
    a: (cum: number) => [number, number],
    b: (cum: number) => [number, number],
    flip: boolean,
    uvOf: (cum: number, r: number, y: number) => [number, number],
  ) => {
    let prev: [number, number] | null = null;
    for (let i = 0; i <= segments; i++) {
      const cum = from + ((to - from) * i) / segments;
      const [ra, ya] = a(cum);
      const [rb, yb] = b(cum);
      const ia = vertex(ra, cum, ya, ...uvOf(cum, ra, ya));
      const ib = vertex(rb, cum, yb, ...uvOf(cum, rb, yb));
      if (prev) {
        const [pa, pb] = prev;
        if (flip !== direction < 0) indices.push(pa, ib, pb, pa, ia, ib);
        else indices.push(pa, pb, ib, pa, ib, ia);
      }
      prev = [ia, ib];
    }
  };
  const soffit = (cum: number) => spiralSoffitY(staircase, cum);
  // Grain along the board, round the arc.
  const alongArc = (cum: number, r: number, y: number): [number, number] => [cum * r, y];
  const across = (cum: number, r: number): [number, number] => [cum * rOut, r];
  // Inner face, toward the well; outer face, toward the room below;
  // underside, along the soffit.
  strip(
    (c) => [rIn, soffit(c)],
    () => [rIn, topY],
    true,
    alongArc,
  );
  strip(
    (c) => [rOut, soffit(c)],
    () => [rOut, topY],
    false,
    alongArc,
  );
  strip(
    (c) => [rIn, soffit(c)],
    (c) => [rOut, soffit(c)],
    false,
    across,
  );
  // End caps: where the rail ends and where the landing begins.
  for (const [cum, flip] of [
    [from, false],
    [to, true],
  ] as const) {
    const y0 = soffit(cum);
    const a = vertex(rIn, cum, y0, rIn, y0);
    const b = vertex(rOut, cum, y0, rOut, y0);
    const c = vertex(rOut, cum, topY, rOut, topY);
    const d = vertex(rIn, cum, topY, rIn, topY);
    if (flip !== direction < 0) indices.push(a, b, c, a, c, d);
    else indices.push(a, c, b, a, d, c);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Array(positions.length).fill(1), 3),
  );
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/** A bracket's square section, metres. */
const BRACKET_SIZE = 0.12;
/** One bracket to this many treads. Rico, 17 October 2026: with one
 *  under every tread, 36 a turn, the arms read as a second flight of
 *  black steps in the well. */
const BRACKET_EVERY_STEPS = 4;
/** Which tread of each group carries one. Counted from the flight's
 *  foot, so a turn's last bracket and the next turn's first keep the
 *  same pitch. */
const BRACKET_STEP_OFFSET = 2;
/** How far a bracket runs on under the tread past its inner edge, so it
 *  reads as carrying the tread and not as butting into its edge. */
const BRACKET_UNDER_TREAD = 0.45;
/** How far a bracket's top stands up into the wood. */
const BRACKET_EMBED = 0.02;
/** A bracket on the lowest flight whose underside would come nearer the
 *  floor than this is left out: it would lie on the parquet. */
const BRACKET_FLOOR_CLEAR = 0.5;

/** The column's iron arms, one to every `BRACKET_EVERY_STEPS` treads and
 *  one under the gate, as one geometry. Each runs from inside the column
 *  out under its tread, along the radial line through the tread's
 *  middle. The soffit is a helicoid: along that line it is level, across
 *  it it slopes with the climb, steepest at the inner edge. Until 17
 *  October 2026 the arm was level both ways and stopped 4 cm inside the
 *  edge, so one side of its top stood 3 cm clear of the wood at the
 *  edge, and the lowest arm's top lay in the floor's plane and flickered
 *  with it. Now the arm is tilted to the soffit's slope at the inner
 *  edge, its top 2 cm up in the wood; further out the soffit slopes less
 *  and the arm only sits deeper in it. */
function buildStepBrackets(
  staircase: Staircase,
  hasFlightBelow: boolean,
): THREE.BufferGeometry | null {
  const { direction, lowerY, innerRadius, entryAngle } = staircase;
  const innerR = SPIRAL_COLUMN_RADIUS - 0.05;
  const outerR = innerRadius + BRACKET_UNDER_TREAD;
  const length = outerR - innerR;
  const midR = (innerR + outerR) / 2;
  // Where each arm goes, by cumulative angle. Treads are counted from
  // the flight's foot, so a turn's last bracket and the next turn's
  // first keep the same pitch; the one at the gate, under the middle of
  // the landing, comes with the flight that leaves it and keeps that
  // pitch across the landing.
  const pieces = spiralPieces(staircase);
  const cums = [0];
  pieces.forEach((piece, k) => {
    if (piece.kind === "tread" && k % BRACKET_EVERY_STEPS === BRACKET_STEP_OFFSET) {
      cums.push((piece.from + piece.to) / 2);
    }
  });
  const boxes: THREE.BufferGeometry[] = [];
  for (const cum of cums) {
    // The soffit's rise per metre round the arc at the inner edge,
    // toward increasing angle: a tread's rise over its arc, or a third
    // of that under the landing (`spiralSoffitY`).
    const h = 1e-4;
    const slope =
      (direction * (spiralSoffitY(staircase, cum + h) - spiralSoffitY(staircase, cum))) /
      (h * innerRadius);
    // After rotateY(-a) the box's +z points toward increasing angle; a
    // turn of -atan(slope) about its length lifts its top on that side.
    const tilt = -Math.atan(slope);
    const yCentre = spiralSoffitY(staircase, cum) + BRACKET_EMBED - BRACKET_SIZE / 2;
    const lowest = yCentre - BRACKET_SIZE / 2 - (BRACKET_SIZE / 2) * Math.abs(slope);
    if (!hasFlightBelow && lowest < lowerY + BRACKET_FLOOR_CLEAR) continue;
    const a = entryAngle + direction * cum;
    // rotationY = -a, NOT +a: three.js's Y-rotation maps local +X
    // to (cos θ, 0, -sin θ), but the radial outward direction at
    // angle a is (cos a, 0, sin a).
    boxes.push(
      new THREE.BoxGeometry(length, BRACKET_SIZE, BRACKET_SIZE)
        .rotateX(tilt)
        .rotateY(-a)
        .translate(midR * Math.cos(a), yCentre, midR * Math.sin(a)),
    );
  }
  if (boxes.length === 0) return null;
  const merged = mergeGeometries(boxes, false);
  for (const b of boxes) b.dispose();
  return merged;
}

/**
 * Render one revolution of the open-well spiral: from half the
 * landing on its lower floor, up its treads, to half the landing on
 * its upper floor. Treads are real wedge geometry (top, bottom, inner
 * curve, outer curve, riser caps) so each step reads as a step rather
 * than a smoothed ramp. Two railings — one along the inner edge of the
 * open well, one along the outer edge — give the player a clear
 * handhold on either side as they climb. The outer rail leaves the
 * landing open so the player can step onto / off the spiral, and gives
 * way to a closed string where the flight passes under the slab above;
 * the directional signs themselves live on gate posts placed by the
 * stairwell-accents component, where they can sit flush against
 * substantial railing posts at floor level.
 *
 * A central stone column runs through the open well from this
 * revolution's lower floor to its upper floor; the column segments
 * stack continuously across stories, giving the entire helix a
 * shared masonry spine. Iron brackets, one to every few treads,
 * reach from the column out under the treads, so the steps read as
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
  const innerRail = useMemo(() => buildSpiralRail(staircase, "inner", 0, Math.PI * 2), [staircase]);
  // The outer rail runs from the landing's edge, where the gate is, to
  // where the string takes over under the slab above.
  const outerRail = useMemo(
    () => buildSpiralRail(staircase, "outer", spiralGateHalfArc(), stringStart(staircase)),
    [staircase],
  );
  const stringGeom = useMemo(() => buildOuterStringGeometry(staircase), [staircase]);
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
  const bracketGeom = useMemo(
    () => buildStepBrackets(staircase, hasFlightBelow),
    [staircase, hasFlightBelow],
  );
  // Top landing — only the helix's topmost flight gets one: the patch
  // past the gate as far as the handrail that closes the well. On any
  // other floor the next flight's own half of the landing is there.
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
      stringGeom.dispose();
      innerRail.rail.dispose();
      outerRail.rail.dispose();
      landingGeom?.dispose();
      balusterGeom?.dispose();
      bracketGeom?.dispose();
    },
    [stepsGeom, stringGeom, innerRail, outerRail, landingGeom, balusterGeom, bracketGeom],
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
  // The column is an open tube, so the top revolution closes it: open,
  // a visitor looking down the well from the top floor saw the tube's
  // inside, its near half culled, as a curled sheet of marble.
  const columnCap = useMemo(() => {
    if (hasFlightAbove) return null;
    const g = new THREE.CircleGeometry(SPIRAL_COLUMN_RADIUS, 32).rotateX(-Math.PI / 2);
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    return g;
  }, [hasFlightAbove]);
  useEffect(() => () => columnCap?.dispose(), [columnCap]);

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
      {columnCap && (
        <mesh geometry={columnCap} position={[0, upperY, 0]}>
          <primitive object={columnMaterial} attach="material" />
        </mesh>
      )}

      {/* Treads — single merged mesh per stair. */}
      <mesh geometry={stepsGeom} castShadow receiveShadow>
        <primitive object={treadMaterial} attach="material" />
      </mesh>

      {/* Closed string along the last treads, up to the slab above. */}
      <mesh geometry={stringGeom} castShadow receiveShadow>
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
