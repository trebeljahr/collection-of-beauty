// Geometry for the per-painting picture light: where the ceiling can
// sits, how wide its cone is, how bright it must be, and which patch of
// wall and floor its pool covers. Pure maths in the painting's local
// frame, so it is testable without a renderer; painting-light.tsx turns
// the result into a shader quad and a fixture mesh.
//
// The look follows how museums light a hang: one track head per work,
// about 30° off vertical, with the cone fitted to the frame so the work
// sits in an even pool whose soft edge arches above it and spills onto
// the floor below. Nothing here is a three.js light. A real SpotLight
// per work would put every mounted light into every wall fragment's
// shader (a floor holds up to 300 works), so the pool is evaluated
// analytically on a quad behind each frame instead.
//
// Local frame (the Painting group): origin at the canvas centre, +x to
// the viewer's right along the wall, +y up, +z out of the wall into the
// room. The wall surface is the plane z = -wallOffset.

import { dividerRect } from "@/lib/gallery-layout/fittings";
import type { Divider } from "@/lib/gallery-layout/types";

/** Tilt of the beam off vertical. 30° is the usual museum rule: steep
 *  enough that a varnished canvas doesn't throw the glare back at an
 *  eye-height viewer, shallow enough that the frame's shadow stays a
 *  few centimetres. */
export const LIGHT_TILT_DEG = 30;
/** Fixture distance from the ceiling plane (stem + can). */
export const LIGHT_CEILING_DROP = 0.3;
/** Clamp on the fixture's distance from the wall, metres. */
export const LIGHT_MIN_THROW = 0.9;
export const LIGHT_MAX_THROW = 2.0;
/** Fraction of the outer cone that is soft edge. */
export const LIGHT_PENUMBRA = 0.4;
/** The cone's fully lit core reaches this far past the frame edge. */
export const LIGHT_FRAME_MARGIN = 0.06;
/** Widest outer half-angle a single head may use. */
export const LIGHT_MAX_OUTER_DEG = 58;
/** Above this frame width a work gets two heads aimed at its halves. */
export const LIGHT_TWIN_WIDTH = 1.7;
/** How far below the canvas centre the beam is aimed, as a fraction of
 *  the canvas height. Lighting designers aim slightly low so the pool's
 *  bright top does not land above the work. */
export const LIGHT_AIM_DROP = 0.06;

export type Vec3 = [number, number, number];

export type LightHead = {
  position: Vec3;
  /** Unit aim direction. */
  direction: Vec3;
  cosOuter: number;
  cosInner: number;
  /** Scale that makes the illuminance at the aim point equal `share`. */
  intensity: number;
};

export type Rect2 = { xMin: number; xMax: number; yMin: number; yMax: number };

export type LightRig = {
  heads: LightHead[];
  /** Pool footprint on the wall plane, x/y in local coordinates: one
   *  rectangle per clear stretch of wall, so a doorway stays dark. */
  wall: Rect2[];
  /** Pool footprint on the floor plane: x and local z (yMin/yMax hold z). */
  floor: Rect2 | null;
};

export type LightRigInput = {
  /** Outer half extents of the frame, metres. */
  frameHalfW: number;
  frameHalfH: number;
  /** Canvas height, metres (for the aim drop). */
  canvasH: number;
  /** Local y of the room's floor and ceiling. */
  floorY: number;
  ceilingY: number;
  /** Distance from the canvas centre back to the wall plane. */
  wallOffset: number;
  /** The wall from corner to corner, in local x. */
  roomSpan: [number, number];
  /** Clear wall in local x: `roomSpan` with the doorways cut out. The
   *  wall quad is built only inside these, so a pool never brightens
   *  the next room seen through a door. */
  wallSpans: Array<[number, number]>;
  /** Distance from this wall to the opposite one, so a floor pool
   *  never crosses the room. */
  roomDepth: number;
  /** The floor in front of the wall, from side to side in local x.
   *  Defaults to `roomSpan`. Wider than it for a work on a divider,
   *  whose floor runs on past the divider's free end. */
  floorSpan?: [number, number];
};

const deg = Math.PI / 180;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function norm(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** One head at `x`, lighting the frame span [x - halfW, x + halfW]. */
function fitHead(input: LightRigInput, x: number, halfW: number, share: number): LightHead {
  const wallZ = -input.wallOffset;
  const aim: Vec3 = [x, -LIGHT_AIM_DROP * input.canvasH, wallZ];
  const lightY = input.ceilingY - LIGHT_CEILING_DROP;
  const throwM = Math.min(
    LIGHT_MAX_THROW,
    Math.max(LIGHT_MIN_THROW, (lightY - aim[1]) * Math.tan(LIGHT_TILT_DEG * deg)),
  );
  const position: Vec3 = [x, lightY, wallZ + throwM];
  const direction = norm(sub(aim, position));

  // Core cone: the widest angle from the aim axis to any corner of the
  // span this head covers, plus a margin so the frame sits inside the
  // fully lit core and the soft edge falls on bare wall.
  const hw = halfW + LIGHT_FRAME_MARGIN;
  const hh = input.frameHalfH + LIGHT_FRAME_MARGIN;
  let inner = 0;
  for (const cx of [x - hw, x + hw]) {
    for (const cy of [-hh, hh]) {
      const toCorner = norm(sub([cx, cy, wallZ], position));
      inner = Math.max(inner, Math.acos(Math.min(1, dot(toCorner, direction))));
    }
  }
  const outer = Math.min(LIGHT_MAX_OUTER_DEG * deg, inner / (1 - LIGHT_PENUMBRA));
  const innerClamped = Math.min(inner, outer * (1 - LIGHT_PENUMBRA * 0.5));

  // Irradiance from a point source is I·cosθ/d². Solve I so the aim
  // point receives exactly `share`, so every work gets the same pool
  // brightness whatever its size or hanging height.
  const toAim = sub(aim, position);
  const d2 = dot(toAim, toAim);
  const cosInc = Math.max(0.05, -direction[2]);
  return {
    position,
    direction,
    cosOuter: Math.cos(outer),
    cosInner: Math.cos(innerClamped),
    intensity: (share * d2) / cosInc,
  };
}

/** Sample the outer cone's rim and return where it lands. */
function coneHits(head: LightHead, input: LightRigInput) {
  const wallZ = -input.wallOffset;
  const wall: Array<[number, number]> = [];
  const floor: Array<[number, number]> = [];
  let floorHit = false;
  const axis = head.direction;
  const helper: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(axis, helper));
  const v = cross(axis, u);
  const sinO = Math.sqrt(Math.max(0, 1 - head.cosOuter * head.cosOuter));
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a) * sinO;
    const s = Math.sin(a) * sinO;
    const dir: Vec3 = [
      axis[0] * head.cosOuter + u[0] * c + v[0] * s,
      axis[1] * head.cosOuter + u[1] * c + v[1] * s,
      axis[2] * head.cosOuter + u[2] * c + v[2] * s,
    ];
    const p = head.position;
    const tWall = dir[2] < -1e-6 ? (wallZ - p[2]) / dir[2] : Infinity;
    const tFloor = dir[1] < -1e-6 ? (input.floorY - p[1]) / dir[1] : Infinity;
    if (tWall <= tFloor && Number.isFinite(tWall)) {
      wall.push([p[0] + dir[0] * tWall, Math.min(input.ceilingY, p[1] + dir[1] * tWall)]);
    } else if (Number.isFinite(tFloor)) {
      floorHit = true;
      floor.push([p[0] + dir[0] * tFloor, p[2] + dir[2] * tFloor]);
    } else {
      // Rim ray that climbs away from the wall: it lights the ceiling,
      // which the pool does not model. The wall above is capped below.
      wall.push([p[0] + dir[0] * 4, input.ceilingY]);
    }
  }
  return { wall, floor, floorHit };
}

function clipX(rect: Rect2, spans: Array<[number, number]>): Rect2[] {
  const out: Rect2[] = [];
  for (const [a, b] of spans) {
    const lo = Math.max(a, rect.xMin);
    const hi = Math.min(b, rect.xMax);
    if (hi - lo > 0.01) out.push({ ...rect, xMin: lo, xMax: hi });
  }
  return out;
}

/** Fit one or two heads to a frame and bound the pool they throw. */
export function buildLightRig(input: LightRigInput): LightRig {
  const twin = input.frameHalfW * 2 > LIGHT_TWIN_WIDTH;
  const heads = twin
    ? [
        fitHead(input, -input.frameHalfW / 2, input.frameHalfW / 2, 0.55),
        fitHead(input, input.frameHalfW / 2, input.frameHalfW / 2, 0.55),
      ]
    : [fitHead(input, 0, input.frameHalfW, 1)];

  const wallPts: Array<[number, number]> = [];
  const floorPts: Array<[number, number]> = [];
  let floorHit = false;
  for (const h of heads) {
    const hits = coneHits(h, input);
    wallPts.push(...hits.wall);
    floorPts.push(...hits.floor);
    floorHit ||= hits.floorHit;
  }
  const wallZ = -input.wallOffset;
  // The frame itself is always inside the pool.
  wallPts.push([-input.frameHalfW, -input.frameHalfH], [input.frameHalfW, input.frameHalfH]);

  const pad = 0.05;
  const wallBox: Rect2 = {
    xMin: Math.min(...wallPts.map((p) => p[0])) - pad,
    xMax: Math.max(...wallPts.map((p) => p[0])) + pad,
    // Once any rim ray reaches the floor, the wall is lit right down to
    // the skirting.
    yMin: Math.max(
      input.floorY,
      floorHit ? input.floorY : Math.min(...wallPts.map((p) => p[1])) - pad,
    ),
    yMax: Math.min(input.ceilingY, Math.max(...wallPts.map((p) => p[1])) + pad),
  };
  const wall = clipX(wallBox, input.wallSpans);

  let floor: Rect2 | null = null;
  if (floorHit && floorPts.length > 0) {
    const xs = floorPts.map((p) => p[0]);
    const zs = floorPts.map((p) => p[1]);
    // The floor runs on under a doorway, so only the room's corners
    // bound it, not the door cuts.
    floor =
      clipX(
        {
          xMin: Math.min(...xs) - pad,
          xMax: Math.max(...xs) + pad,
          yMin: wallZ,
          yMax: Math.min(wallZ + input.roomDepth, Math.max(...zs) + pad),
        },
        [input.floorSpan ?? input.roomSpan],
      )[0] ?? null;
  }
  return { heads, wall, floor };
}

/** Subtract door openings from a wall's clear span, both in local x. */
export function clearSpans(
  span: [number, number],
  openings: Array<[number, number]>,
): Array<[number, number]> {
  let spans: Array<[number, number]> = [span];
  for (const [a, b] of openings) {
    const next: Array<[number, number]> = [];
    for (const [s, e] of spans) {
      if (b <= s || a >= e) {
        next.push([s, e]);
        continue;
      }
      if (a > s) next.push([s, a]);
      if (b < e) next.push([b, e]);
    }
    spans = next;
  }
  return spans.filter(([s, e]) => e - s > 0.01);
}

/** What the rig needs to know about the wall a work hangs on. */
export type WallContext = {
  roomSpan: [number, number];
  wallSpans: Array<[number, number]>;
  floorSpan: [number, number];
  roomDepth: number;
  /** Local y of the room's floor. */
  floorY: number;
};

/** The room's freestanding walls, and which of them the work hangs on
 *  (an index into `dividers`) when it is not on a room wall. */
export type WallFittings = { dividers: readonly Divider[]; on?: number };

/** Door half-width beyond its opening that the trim covers. */
const DOOR_TRIM_CLEARANCE = 0.09;

/**
 * Express a room's wall in a painting's local frame. `bounds` are the
 * room's wall planes in world x/z; `rotationY` is the placement's, which
 * place-paintings sets per compass wall (0 north, π south, π/2 west,
 * -π/2 east), so the painting's right axis is (cos r, 0, -sin r).
 *
 * Dividers change the wall in two ways. A work on a room wall has its
 * pool stopped at any wing wall built off that wall, as at a corner, and
 * its floor pool stopped at a panel standing in front of it. A work on
 * a divider (`fittings.on`) has that divider's face for its wall: the
 * pool ends at the divider's ends, where there is no wall left to light,
 * and only the floor runs on.
 */
export function wallContextFor(
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number },
  doors: ReadonlyArray<{ side: string; worldX: number; worldZ: number; width: number }>,
  floorWorldY: number,
  position: readonly [number, number, number],
  rotationY: number,
  fittings: WallFittings = { dividers: [] },
): WallContext {
  const rx = Math.cos(rotationY);
  const rz = -Math.sin(rotationY);
  const fx = Math.sin(rotationY);
  const fz = Math.cos(rotationY);
  const localX = (x: number, z: number) => (x - position[0]) * rx + (z - position[2]) * rz;
  const localZ = (x: number, z: number) => (x - position[0]) * fx + (z - position[2]) * fz;

  const corners: Array<[number, number]> = [
    [bounds.xMin, bounds.zMin],
    [bounds.xMax, bounds.zMin],
    [bounds.xMin, bounds.zMax],
    [bounds.xMax, bounds.zMax],
  ];
  const xs = corners.map(([x, z]) => localX(x, z));
  const zs = corners.map(([x, z]) => localZ(x, z));
  const floorY = floorWorldY - position[1];

  // Every divider as a box in the local frame.
  const boxes = fittings.dividers.map((d) => {
    const r = dividerRect(d);
    const bx = [localX(r.xMin, r.zMin), localX(r.xMax, r.zMax)];
    const bz = [localZ(r.xMin, r.zMin), localZ(r.xMax, r.zMax)];
    return {
      xMin: Math.min(...bx),
      xMax: Math.max(...bx),
      zMin: Math.min(...bz),
      zMax: Math.max(...bz),
    };
  });
  // Nearest divider standing in front of the work, across its beam.
  const depthTo = (wallZ: number, far: number, skip?: number) => {
    let depth = far - wallZ;
    boxes.forEach((b, i) => {
      if (i === skip || b.xMin > 0 || b.xMax < 0 || b.zMin <= wallZ + 0.1) return;
      depth = Math.min(depth, b.zMin - wallZ);
    });
    return depth;
  };

  if (fittings.on !== undefined && boxes[fittings.on]) {
    const own = boxes[fittings.on];
    const span: [number, number] = [own.xMin, own.xMax];
    return {
      roomSpan: span,
      wallSpans: [span],
      floorSpan: [Math.min(...xs), Math.max(...xs)],
      roomDepth: depthTo(own.zMax, Math.max(...zs), fittings.on),
      floorY,
    };
  }

  const roomSpan: [number, number] = [Math.min(...xs), Math.max(...xs)];
  const wallZ = Math.min(...zs);
  // A wing wall built off this wall closes the bay like a corner.
  for (const b of boxes) {
    if (b.zMin > wallZ + 0.05) continue;
    if (b.xMin > 0) roomSpan[1] = Math.min(roomSpan[1], b.xMin);
    else if (b.xMax < 0) roomSpan[0] = Math.max(roomSpan[0], b.xMax);
  }
  const roomDepth = depthTo(wallZ, Math.max(...zs));

  const quarter = Math.round(rotationY / (Math.PI / 2));
  const side =
    quarter === 0
      ? "north"
      : quarter === 2 || quarter === -2
        ? "south"
        : quarter === 1
          ? "west"
          : "east";
  const openings = doors
    .filter((d) => d.side === side)
    .map((d): [number, number] => {
      const c = localX(d.worldX, d.worldZ);
      const half = d.width / 2 + DOOR_TRIM_CLEARANCE;
      return [c - half, c + half];
    });

  return {
    roomSpan,
    wallSpans: clearSpans(roomSpan, openings),
    floorSpan: roomSpan,
    roomDepth,
    floorY,
  };
}
