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

// A work too large for a room hangs in a hall (`giants.ts`), with its
// frame's top a hand under the gallery above, or on a wall that is sheer
// for four storeys. A can 2 m out from the wall lights the top of a
// canvas five metres tall at six times its middle. Such a work is lit as
// museums light one: by spots from across the hall, far enough off that
// the light is even, one spot to each stretch of the canvas about as
// wide as it is tall.
//
// A spot's cone is round and the canvas is not. Fitted to a canvas ten
// metres wide from a lamp above it, the cone reached the wall thirteen
// metres under the frame and two over it. So a far pool is not ended by
// its cones: the cones only shade it, brighter toward the lamp, and the
// pool ends a set distance from the frame all round (`LightRig.soft`),
// as a framing projector's does.
/** Heads a far-lit work may take. Monet's Matin is 12.75 m by 2. */
export const FAR_MAX_HEADS = 6;
/** A head lights a stretch of frame no narrower than this, metres. */
const FAR_MIN_SPAN = 2.4;
/** A far lamp's distance from the wall, as a share of the longer side
 *  of the stretch it lights, and the least it stands off. */
const FAR_THROW = 1.1;
const FAR_MIN_THROW = 3;
/** How high a far lamp stands over its aim point where it hangs from
 *  no ceiling, as an angle up from the wall's normal. */
const FAR_RISE_DEG = 28;
/** How far beyond the frame a far pool reaches: a share of the frame's
 *  shorter side, between two limits, metres. */
const FAR_SOFT_SHARE = 0.25;
const FAR_SOFT_MIN = 0.9;
const FAR_SOFT_MAX = 1.8;
/** A far cone's own soft edge, outside the pool's. */
const FAR_CONE_EDGE_DEG = 6;

/** A floor pool fades out over this distance to a doorway's threshold.
 *  A pool stops where its room does. A wall hides that everywhere but in
 *  a doorway, where the floor runs on into the next room unlit: the stop
 *  showed as a line across the floor from jamb to jamb, the brighter
 *  side being whichever room had a work or a washer near the door. No
 *  pool reaches a threshold now, so the two floors meet at one
 *  brightness. Wide enough that the fall reads as the doorway's shade
 *  and not as a second edge. */
export const THRESHOLD_FADE_M = 1.5;
/** Thresholds a picture light's shader takes: the nearest to its floor
 *  pool. A pool is a few metres across, so a door on either side of the
 *  work and one round the corner is the most it meets. */
export const POOL_THRESHOLDS = 4;

export type Vec3 = [number, number, number];

/** A doorway's threshold: the line across the floor where one room's
 *  floor ends and the next room's begins. Its two ends, x then z each. */
export type Threshold = [x0: number, z0: number, x1: number, z1: number];

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
  /** Thresholds the floor pool fades toward, x and local z, nearest
   *  first (`thresholdsNear`). */
  thresholds: Threshold[];
  /** A far-lit work's pool ends this far from its frame, on the wall
   *  and on the floor alike. Unset: the cones end the pool. */
  soft?: number;
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
  /** The room's doorways, x and local z, on whichever wall. */
  thresholds?: readonly Threshold[];
  /** Light the work from across the room, no further from the wall
   *  than `maxThrow`: a giant in a hall (see `FAR_MAX_HEADS`). With
   *  `onCeiling` the lamps hang from the ceiling as a room's cans do,
   *  only further out; without, they stand in the air in front of the
   *  work, where a hall has no ceiling. */
  far?: { maxThrow: number; onCeiling: boolean };
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

/** What a head lays on the wall at (x, y), as the pool's shader counts
 *  it: I·cosθ/d² inside the cone, eased out across its soft edge. */
function wallLight(head: LightHead, x: number, y: number, wallZ: number): number {
  const toL = sub(head.position, [x, y, wallZ]);
  const d2 = dot(toL, toL);
  const l = norm(toL);
  const along = -dot(l, head.direction);
  const t = Math.min(1, Math.max(0, (along - head.cosOuter) / (head.cosInner - head.cosOuter)));
  return (head.intensity * Math.max(0, l[2]) * t * t * (3 - 2 * t)) / d2;
}

/** How far beyond its frame a far-lit work's pool reaches. */
function farSoftEdge(input: LightRigInput): number {
  const shorter = 2 * Math.min(input.frameHalfW, input.frameHalfH);
  return Math.min(FAR_SOFT_MAX, Math.max(FAR_SOFT_MIN, FAR_SOFT_SHARE * shorter));
}

/** A far head at `x`, lighting the frame span [x - halfW, x + halfW]
 *  from `throwM` off the wall. Its intensity is 1; `farHeads` sets it. */
function fitFarHead(
  input: LightRigInput,
  x: number,
  halfW: number,
  throwM: number,
  onCeiling: boolean,
): LightHead {
  const wallZ = -input.wallOffset;
  const aim: Vec3 = [x, -LIGHT_AIM_DROP * input.canvasH, wallZ];
  const hung = input.ceilingY - LIGHT_CEILING_DROP;
  const lightY = onCeiling ? hung : Math.min(hung, aim[1] + throwM * Math.tan(FAR_RISE_DEG * deg));
  const position: Vec3 = [x, lightY, wallZ + throwM];
  const direction = norm(sub(aim, position));
  // The cone holds its stretch of frame and, where a head can open so
  // wide, the pool's soft edge round it: the pool is ended by `soft`,
  // not by the cone.
  const grow = farSoftEdge(input);
  let widest = 0;
  for (const cx of [x - halfW - grow, x + halfW + grow]) {
    for (const cy of [-input.frameHalfH - grow, input.frameHalfH + grow]) {
      const toCorner = norm(sub([cx, cy, wallZ], position));
      widest = Math.max(widest, Math.acos(Math.min(1, dot(toCorner, direction))));
    }
  }
  const inner = Math.min(widest, (LIGHT_MAX_OUTER_DEG - FAR_CONE_EDGE_DEG) * deg);
  const outer = inner + FAR_CONE_EDGE_DEG * deg;
  return {
    position,
    direction,
    cosOuter: Math.cos(outer),
    cosInner: Math.cos(inner),
    intensity: 1,
  };
}

/** The heads that light a giant: one to each stretch of its frame about
 *  as wide as the frame is tall, set so the brightest of their aim
 *  points takes the light a room's work takes at its own. */
function farHeads(input: LightRigInput, far: NonNullable<LightRigInput["far"]>): LightHead[] {
  const width = input.frameHalfW * 2;
  const height = input.frameHalfH * 2;
  const count = Math.min(
    FAR_MAX_HEADS,
    Math.max(1, Math.round(width / Math.max(height, FAR_MIN_SPAN))),
  );
  const span = width / count;
  const throwM = Math.min(
    far.maxThrow,
    Math.max(FAR_MIN_THROW, FAR_THROW * Math.max(span, height)),
  );
  const heads = Array.from({ length: count }, (_, i) =>
    fitFarHead(input, -input.frameHalfW + (i + 0.5) * span, span / 2, throwM, far.onCeiling),
  );
  const wallZ = -input.wallOffset;
  const aimY = -LIGHT_AIM_DROP * input.canvasH;
  const brightest = Math.max(
    ...heads.map((at) =>
      heads.reduce((sum, h) => sum + wallLight(h, at.position[0], aimY, wallZ), 0),
    ),
  );
  return heads.map((h) => ({ ...h, intensity: 1 / brightest }));
}

/** A far-lit work's rig: its heads, and a pool that ends `soft` metres
 *  from the frame. On the floor that is the floor within `soft` of the
 *  frame's foot, where the frame hangs low enough. */
function buildFarRig(input: LightRigInput, far: NonNullable<LightRigInput["far"]>): LightRig {
  const soft = farSoftEdge(input);
  const wallZ = -input.wallOffset;
  const pad = 0.05;
  const xMin = -input.frameHalfW - soft - pad;
  const xMax = input.frameHalfW + soft + pad;
  const wall = clipX(
    {
      xMin,
      xMax,
      yMin: Math.max(input.floorY, -input.frameHalfH - soft - pad),
      yMax: Math.min(input.ceilingY, input.frameHalfH + soft + pad),
    },
    input.wallSpans,
  );
  const gap = -input.frameHalfH - input.floorY;
  const reach = gap < soft ? Math.sqrt(soft * soft - Math.max(0, gap) ** 2) : 0;
  const floor =
    reach > 0.05
      ? (clipX({ xMin, xMax, yMin: wallZ, yMax: wallZ + Math.min(input.roomDepth, reach + pad) }, [
          input.floorSpan ?? input.roomSpan,
        ])[0] ?? null)
      : null;
  return {
    heads: farHeads(input, far),
    wall,
    floor,
    thresholds: floor ? thresholdsNear(floor, input.thresholds ?? []) : [],
    soft,
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

/** Fit one or two heads to a frame, or a giant's far heads, and bound
 *  the pool they throw. */
export function buildLightRig(input: LightRigInput): LightRig {
  if (input.far) return buildFarRig(input, input.far);
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
    // bound it, not the door cuts. The shader fades it out toward the
    // threshold instead (`thresholds` below).
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
  return {
    heads,
    wall,
    floor,
    thresholds: floor ? thresholdsNear(floor, input.thresholds ?? []) : [],
  };
}

/** A door's threshold in the world, x and z, on its wall's line. */
export function doorThreshold(door: {
  side: string;
  worldX: number;
  worldZ: number;
  width: number;
}): Threshold {
  const alongX = door.side === "north" || door.side === "south";
  const hx = alongX ? door.width / 2 : 0;
  const hz = alongX ? 0 : door.width / 2;
  return [door.worldX - hx, door.worldZ - hz, door.worldX + hx, door.worldZ + hz];
}

/** The thresholds within the fade's reach of a floor pool (x, and z in
 *  yMin/yMax), nearest first and `limit` at most. Both are square to the
 *  axes, so the gap between them is the gap between two rectangles. */
export function thresholdsNear(
  floor: Rect2,
  thresholds: readonly Threshold[],
  limit = POOL_THRESHOLDS,
): Threshold[] {
  return thresholds
    .map((t) => {
      const dx = Math.max(0, Math.min(t[0], t[2]) - floor.xMax, floor.xMin - Math.max(t[0], t[2]));
      const dz = Math.max(0, Math.min(t[1], t[3]) - floor.yMax, floor.yMin - Math.max(t[1], t[3]));
      return { t, gap: Math.hypot(dx, dz) };
    })
    .filter((e) => e.gap < THRESHOLD_FADE_M)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, limit)
    .map((e) => e.t);
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

/** How far inside their lines a stair hall with a sheer wall draws its
 *  walls (room-geometry.tsx says why). Every pool in such a hall lies on
 *  the wall as drawn. Left on the wall's line, 2 mm off it, a pool was
 *  2 mm behind the plaster: the depth test passed it where the wall was
 *  seen at a slant and failed it elsewhere, and a pool came and went in
 *  blocks as the visitor turned. */
export const SHEER_HALL_WALL_INSET = 0.004;
export function wallInsetOf(room: { sheer?: unknown }): number {
  return room.sheer ? SHEER_HALL_WALL_INSET : 0;
}

/** The compass wall a placement hangs on, from its turn about y
 *  (place-paintings: 0 north, π south, π/2 west, -π/2 east). */
export function wallSideOf(rotationY: number): "north" | "south" | "east" | "west" {
  const quarter = Math.round(rotationY / (Math.PI / 2));
  return quarter === 0
    ? "north"
    : quarter === 2 || quarter === -2
      ? "south"
      : quarter === 1
        ? "west"
        : "east";
}

type Bounds = { xMin: number; xMax: number; zMin: number; zMax: number };

/**
 * The part of a stair hall that is one wall to a work's pool.
 *
 * A wall that meets the hall's sheer wall (`RoomLayout.sheer`) is two
 * walls: the stretch its gallery runs along, with a floor and a ceiling
 * on every storey, and the strip beyond the gallery's end, sheer from
 * the hall floor to the roof. A pool that crossed from one to the other
 * would stop at a storey's ceiling line in the middle of bare wall.
 * `onSheer` says which of the two the work hangs on. The sheer wall
 * itself, and the wall across from it, are whole.
 */
export function hallBounds(
  bounds: Bounds,
  sheer: { side: "north" | "south" | "east" | "west"; depth: number } | undefined,
  rotationY: number,
  onSheer: boolean,
): Bounds {
  if (!sheer) return bounds;
  const side = wallSideOf(rotationY);
  const sheerAlongX = sheer.side === "north" || sheer.side === "south";
  if ((side === "north" || side === "south") === sheerAlongX) return bounds;
  const out = { ...bounds };
  if (sheer.side === "west") {
    if (onSheer) out.xMax = bounds.xMin + sheer.depth;
    else out.xMin = bounds.xMin + sheer.depth;
  } else if (sheer.side === "east") {
    if (onSheer) out.xMin = bounds.xMax - sheer.depth;
    else out.xMax = bounds.xMax - sheer.depth;
  } else if (sheer.side === "north") {
    if (onSheer) out.zMax = bounds.zMin + sheer.depth;
    else out.zMin = bounds.zMin + sheer.depth;
  } else {
    if (onSheer) out.zMin = bounds.zMax - sheer.depth;
    else out.zMax = bounds.zMax - sheer.depth;
  }
  return out;
}

/** What the rig needs to know about the wall a work hangs on. */
export type WallContext = {
  roomSpan: [number, number];
  wallSpans: Array<[number, number]>;
  floorSpan: [number, number];
  roomDepth: number;
  /** Local y of the room's floor. */
  floorY: number;
  /** Every doorway of the room, x and local z. */
  thresholds: Threshold[];
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
 *
 * `thresholds` are the room's doorways on all four walls: a floor pool
 * fades toward each (`THRESHOLD_FADE_M`), and one beside a corner reaches
 * a door in the next wall.
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
  const thresholds = doors.map((d): Threshold => {
    const [x0, z0, x1, z1] = doorThreshold(d);
    return [localX(x0, z0), localZ(x0, z0), localX(x1, z1), localZ(x1, z1)];
  });

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
      thresholds,
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

  const side = wallSideOf(rotationY);
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
    thresholds,
  };
}
