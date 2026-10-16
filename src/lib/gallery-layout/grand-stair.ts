// Grand staircases for the stair halls, and the court and the salon.
//
// A spiral stair's height is a function of the angle walked round it
// (`spiral-physics.ts`). A grand stair is flights and landings in a hall
// two storeys high, so it is described as surfaces: each a patch of
// plan with a height over it. Where the visitor stands is the highest
// surface they can step onto from where their feet are. There is no
// state to carry, so the same rule holds on the hall floor, on a
// flight, on a landing and on the gallery above, whichever floor the
// renderer thinks is current.
//
// Three designs:
//
//   loggia     An imperial stair (one flight up the middle to a half
//              landing, two back along the sides, as in the
//              Kunsthistorisches Museum Vienna) on every storey, each
//              over the one below, in the front of its hall. Its half
//              landings run back to the end wall, which stands sheer
//              between them.
//   court      No stair: a hall open from its floor to the roof, with
//              a gallery round the opening on every floor above.
//   salon      No stair: a hall open from its floor to the roof, with a
//              gallery along the wall its doors are in and the two
//              walls beside it on every floor above. The far wall
//              stands sheer: it hangs a work taller than a storey.
//
// A hall can be open above its floor to the roof (`topFloor`): the
// floors over the one a stair arrives on are balconies round the same
// opening. Stairs stack, the flights of one storey over the flights of
// the storey below (`hasFlightAbove`). The first stack filled a hall
// 22.5 m square and felt cramped: a soffit 5.8 m over every flight and
// no opening but the stair's own. A plan with one stair to a hall
// followed, and Rico found that a stair in another place on every floor
// reads worse. The loggia is the stack again, each half landing a floor
// in front of the end wall. A plain imperial stair in the middle of a
// hall, a curved stair round a rotunda and an hourglass flight were
// built, never used by a plan, and taken out on 17 October 2026.
//
// A design is drawn in the hall's own frame, the visitor coming in from
// +z (south) and the first flight rising toward -z, and turned a quarter
// at a time to face the hall's main door (`turns`).
//
// No three.js here: the layout, the player, the collider set and the
// renderer all read this module.

import { FLOOR_SEPARATION } from "./world-coords";

export type GrandStairDesign = "loggia" | "court" | "salon";

/** A straight flight along the hall's z axis. `z0` is its foot and `z1`
 *  its head, so it rises north when `z1 < z0`. Its half width runs from
 *  `hw0` at the foot to `hw1` at the head, about the line `x = cx`. */
export type FlightPatch = {
  kind: "flight";
  cx: number;
  z0: number;
  z1: number;
  hw0: number;
  hw1: number;
  y0: number;
  y1: number;
  /** Risers. The last tread is level with the landing at the head. */
  steps: number;
  /** Built up from the floor: nothing walks under it. */
  solid: boolean;
};

/** A level rectangle: a landing. */
export type FlatPatch = {
  kind: "flat";
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  y: number;
  /** Built up from the floor: nothing walks under it. */
  solid?: boolean;
};

export type StairPatch = FlightPatch | FlatPatch;

/** A balustrade: a straight run from one point to another, `y` the
 *  height of its foot at each end. A curved rail is a chain of these. */
export type StairRail = {
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
  /** Stands on masonry that reaches the hall floor (`baseY`): the wall
   *  under it is drawn and stops the visitor. */
  skirtTo?: number;
  /** Runs along the edge of a floor that spans free over a void: a
   *  stone beam is drawn under it. */
  beam?: boolean;
};

/** A square pier. */
export type StairColumn = { x: number; z: number; size: number; y0: number; y1: number };

/** A lamp standard on the post at the foot of a flight: the post's
 *  place on the plan and the height of the floor it stands on. */
export type StairLamp = { x: number; z: number; y: number };

/** The hole a stair leaves in the floor it arrives on. */
export type PlanRect = { xMin: number; xMax: number; zMin: number; zMax: number };

/** The hole a stair's hall has in every floor over the one the stair
 *  leaves: one or more rectangles that touch. `outline` is the
 *  rectangles' edge as one closed line of points, in order. The hole is
 *  the stair's own footprint and, in a hall with nothing over the stair,
 *  as much more of the hall as leaves a gallery inside its walls. */
export type StairOpening = { rects: PlanRect[]; outline: Array<[number, number]> };

/** A walkway across a hall's void on one floor: floor level with that
 *  floor's gallery, from one edge of the opening to the other. */
export type StairBridge = { floor: number; rect: PlanRect };

/** How a court's void is crossed on the floors over its first:
 *
 *   none       an open void, a gallery round it on every floor;
 *   alternate  one walkway a floor, north to south on the second floor,
 *              east to west on the third, and so on.
 *
 *  Never two on one floor. A cross on every floor and a cross on the
 *  third floor alone were built on 17 October 2026, and Rico chose the
 *  alternate pattern: "I want no crosses." */
export type CourtBridges = "none" | "alternate";
export const COURT_BRIDGE_PATTERNS: readonly CourtBridges[] = ["none", "alternate"];
/** Width of a court's walkway: the portal it leads from. */
export const COURT_BRIDGE_WIDTH = 3.5;

export type GrandStair = {
  id: string;
  design: GrandStairDesign;
  lowerFloor: number;
  upperFloor: number;
  /** The highest floor the hall's void reaches: `upperFloor`, or a
   *  floor above it when nothing stands over the stair and the hall is
   *  open to there. Each floor between has the stair's opening in it and
   *  a balcony round it. */
  topFloor: number;
  lowerY: number;
  upperY: number;
  lowerLabel: string;
  upperLabel: string;
  /** Centre of the hall, world metres. */
  centerX: number;
  centerZ: number;
  /** Half the hall's side: its walls either side of the stair, and its
   *  front wall, stand this far from the centre. */
  half: number;
  /** How far the wall the stair climbs toward stands from the centre:
   *  `half` in a square hall, less where that wall stands nearer. */
  back: number;
  /** Quarter turns from the design's frame to the world: 0 rises north,
   *  1 east, 2 south, 3 west. */
  turns: 0 | 1 | 2 | 3;
  /** Another stair of the same hall leaves the floor this one arrives
   *  on, or arrives on the floor this one leaves. */
  hasFlightAbove: boolean;
  hasFlightBelow: boolean;
  /** Everything below is in the hall's frame, heights in world metres. */
  patches: StairPatch[];
  rails: StairRail[];
  columns: StairColumn[];
  lamps: StairLamp[];
  /** The hole in every floor over the one the stair leaves, before any
   *  walkway: `openingOn` gives one floor's. */
  opening: StairOpening;
  /** Walkways across the opening, a court's only. */
  bridges: StairBridge[];
};

/** Structural depth of a flight or landing that spans free. */
export const STAIR_SLAB = 0.3;
/** Clear height a visitor needs to walk under a flight. */
export const STAIR_HEADROOM = 2.3;
/** Risers in a storey: 0.162 m each. Forty, 0.153 m each, while the
 *  storey was 6.12 m: the flights kept their length when it grew, so
 *  each tread is 0.26 m deep where it was 0.34 m. */
export const GRAND_RISERS = 52;
/** How far up the visitor steps without a jump, and how far down a
 *  move may drop them. The drop allows for a jump in progress. */
export const GRAND_STEP_UP = 0.4;
export const GRAND_MAX_DROP = 1.25;
/** Balustrade height, as the spiral's. */
export const GRAND_RAIL_HEIGHT = 1.0;

// ── Frames ────────────────────────────────────────────────────────────

/** World point to the hall's frame. */
export function toStairLocal(
  stair: Pick<GrandStair, "centerX" | "centerZ" | "turns">,
  worldX: number,
  worldZ: number,
): { x: number; z: number } {
  const dx = worldX - stair.centerX;
  const dz = worldZ - stair.centerZ;
  switch (stair.turns) {
    case 0:
      return { x: dx, z: dz };
    case 1:
      return { x: dz, z: -dx };
    case 2:
      return { x: -dx, z: -dz };
    default:
      return { x: -dz, z: dx };
  }
}

/** A point of the hall's frame in the world. */
export function toStairWorld(
  stair: Pick<GrandStair, "centerX" | "centerZ" | "turns">,
  x: number,
  z: number,
): { x: number; z: number } {
  switch (stair.turns) {
    case 0:
      return { x: stair.centerX + x, z: stair.centerZ + z };
    case 1:
      return { x: stair.centerX - z, z: stair.centerZ + x };
    case 2:
      return { x: stair.centerX - x, z: stair.centerZ - z };
    default:
      return { x: stair.centerX + z, z: stair.centerZ - x };
  }
}

/** The opening in one floor: the void less the walkways across it on
 *  that floor. Its `outline` stays the void's: a floor with walkways is
 *  drawn and fenced from its rectangles. */
export function openingOn(stair: GrandStair, floorIndex?: number): StairOpening {
  const o = stair.opening;
  if (floorIndex === undefined) return o;
  const cut = stair.bridges.filter((b) => b.floor === floorIndex).map((b) => b.rect);
  if (cut.length === 0) return o;
  return { rects: o.rects.flatMap((r) => rectMinus(r, cut)), outline: o.outline };
}

/** A rectangle less some others, as the cells of the grid their edges
 *  cut it into that none of them covers. */
export function rectMinus(r: PlanRect, cut: readonly PlanRect[]): PlanRect[] {
  const lines = (lo: number, hi: number, edges: number[]) =>
    [...new Set([lo, hi, ...edges.filter((v) => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = lines(
    r.xMin,
    r.xMax,
    cut.flatMap((c) => [c.xMin, c.xMax]),
  );
  const zs = lines(
    r.zMin,
    r.zMax,
    cut.flatMap((c) => [c.zMin, c.zMax]),
  );
  const out: PlanRect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i + 1]) / 2;
      const z = (zs[j] + zs[j + 1]) / 2;
      if (cut.some((c) => x > c.xMin && x < c.xMax && z > c.zMin && z < c.zMax)) continue;
      out.push({ xMin: xs[i], xMax: xs[i + 1], zMin: zs[j], zMax: zs[j + 1] });
    }
  }
  return out;
}

/** The opening in world rectangles: the void, or with a floor the hole
 *  in that floor (`openingOn`). */
export function openingInWorld(stair: GrandStair, floorIndex?: number): StairOpening {
  const o = openingOn(stair, floorIndex);
  return {
    rects: o.rects.map((r) => {
      const a = toStairWorld(stair, r.xMin, r.zMin);
      const b = toStairWorld(stair, r.xMax, r.zMax);
      return {
        xMin: Math.min(a.x, b.x),
        xMax: Math.max(a.x, b.x),
        zMin: Math.min(a.z, b.z),
        zMax: Math.max(a.z, b.z),
      };
    }),
    outline: o.outline.map(([x, z]) => {
      const p = toStairWorld(stair, x, z);
      return [p.x, p.z];
    }),
  };
}

/** How far an opening reaches from the hall's centre. */
export function openingReach(o: StairOpening): number {
  return Math.max(...o.rects.flatMap((r) => [-r.xMin, r.xMax, -r.zMin, r.zMax]));
}

// ── Surfaces ──────────────────────────────────────────────────────────

function flightProgress(p: FlightPatch, x: number, z: number): number | null {
  const t = (z - p.z0) / (p.z1 - p.z0);
  if (t < 0 || t > 1) return null;
  const hw = p.hw0 + (p.hw1 - p.hw0) * t;
  return Math.abs(x - p.cx) <= hw ? t : null;
}

/** Height of a tread: the stair is steps, and the last one is level
 *  with the landing it reaches. */
function stepped(y0: number, y1: number, steps: number, t: number): number {
  if (steps <= 0) return y0;
  const index = Math.min(steps - 1, Math.floor(t * steps));
  return y0 + ((index + 1) / steps) * (y1 - y0);
}

/** Height of the patch's walking surface over a point of the hall's
 *  frame, or null when the patch is not over it. */
export function patchHeight(p: StairPatch, x: number, z: number): number | null {
  if (p.kind === "flat") {
    return x >= p.xMin && x <= p.xMax && z >= p.zMin && z <= p.zMax ? p.y : null;
  }
  const t = flightProgress(p, x, z);
  if (t === null) return null;
  return stepped(p.y0, p.y1, p.steps, t);
}

/** Height of the patch's underside over a point: the floor it stands on
 *  when solid, else its slab. Null when the patch is not over it. */
function patchUnderside(p: StairPatch, x: number, z: number, baseY: number): number | null {
  if (p.kind === "flat") {
    if (patchHeight(p, x, z) === null) return null;
    return p.solid ? baseY : p.y - STAIR_SLAB;
  }
  const t = flightProgress(p, x, z);
  if (t === null) return null;
  if (p.solid) return baseY;
  return p.y0 + (p.y1 - p.y0) * t - STAIR_SLAB;
}

/** Whether a point of the hall's frame is over the void: on a floor,
 *  over the hole in that floor, walkways left out. */
export function inOpening(stair: GrandStair, x: number, z: number, floorIndex?: number): boolean {
  const o = openingOn(stair, floorIndex);
  return o.rects.some((r) => x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax);
}

/** True when the hall floor a stair leaves cannot be walked at this
 *  point: the stair stands on it, or hangs too low over it. */
function blocksFloor(stair: GrandStair, x: number, z: number): boolean {
  for (const p of stair.patches) {
    const under = patchUnderside(p, x, z, stair.lowerY);
    if (under !== null && under - stair.lowerY < STAIR_HEADROOM) return true;
  }
  return false;
}

/** Height of one of the floors a stair's hall reaches. */
export function grandLevelY(stair: GrandStair, floorIndex: number): number {
  return stair.lowerY + (floorIndex - stair.lowerFloor) * FLOOR_SEPARATION;
}

/** The floors a stair's hall is a hall on: from the floor the stair
 *  leaves to the top of its void. Under the first of them the same
 *  square is an ordinary room. */
export function grandHallFloors(stair: GrandStair): number[] {
  const out: number[] = [];
  for (let f = stair.lowerFloor; f <= stair.topFloor; f++) out.push(f);
  return out;
}

/** The stairs of the hall a world point is in. Empty outside every
 *  grand stair hall, and under one: with `feetY`, a visitor in the room
 *  below a hall is not in it. */
export function grandStairsAt(
  stairs: readonly GrandStair[],
  worldX: number,
  worldZ: number,
  feetY?: number,
): GrandStair[] {
  const out: GrandStair[] = [];
  for (const s of stairs) {
    if (feetY !== undefined && feetY < s.lowerY - 1) continue;
    if (Math.abs(worldX - s.centerX) > s.half || Math.abs(worldZ - s.centerZ) > s.half) continue;
    if (toStairLocal(s, worldX, worldZ).z >= -s.back) out.push(s);
  }
  return out;
}

export type GrandSurface = {
  y: number;
  /** The stair, when the surface is one of its flights or landings. */
  stair: GrandStair | null;
  /** The floor, when the surface is a hall floor or the gallery. */
  floorIndex: number | null;
};

/**
 * Every surface of a hall over one point: hall floors and galleries
 * where there is floor, and each flight or landing that passes over.
 * `hall` is the stairs of one hall (`grandStairsAt`).
 */
export function grandSurfacesAt(
  hall: readonly GrandStair[],
  worldX: number,
  worldZ: number,
): GrandSurface[] {
  const out: GrandSurface[] = [];
  if (hall.length === 0) return out;
  const { x, z } = toStairLocal(hall[0], worldX, worldZ);

  // A hall floor is there unless a stair's opening passes through it
  // (the floor the stair arrives on and every balcony floor over that),
  // or the stair that leaves it stands in the way.
  const levels = new Map<number, number>();
  for (const s of hall) {
    for (const f of grandHallFloors(s)) levels.set(f, grandLevelY(s, f));
  }
  for (const [floorIndex, y] of levels) {
    const open = hall.some(
      (s) =>
        floorIndex > s.lowerFloor && floorIndex <= s.topFloor && inOpening(s, x, z, floorIndex),
    );
    if (open) continue;
    const leaving = hall.find((s) => s.lowerFloor === floorIndex);
    if (leaving && blocksFloor(leaving, x, z)) continue;
    out.push({ y, stair: null, floorIndex });
  }
  for (const s of hall) {
    for (const p of s.patches) {
      const y = patchHeight(p, x, z);
      if (y !== null) out.push({ y, stair: s, floorIndex: null });
    }
  }
  return out;
}

/**
 * What a visitor with their feet at `feetY` stands on at this point:
 * the highest surface no more than a step above their feet. Null when
 * there is none, over the open well for one.
 */
export function grandSurfaceAt(
  hall: readonly GrandStair[],
  worldX: number,
  worldZ: number,
  feetY: number,
): GrandSurface | null {
  let best: GrandSurface | null = null;
  for (const s of grandSurfacesAt(hall, worldX, worldZ)) {
    if (s.y > feetY + GRAND_STEP_UP) continue;
    // A landing and the hall floor it is level with: prefer the floor.
    if (!best || s.y > best.y + 1e-6 || (Math.abs(s.y - best.y) <= 1e-6 && s.floorIndex !== null)) {
      best = s;
    }
  }
  return best;
}

/**
 * Whether a move inside a grand stair hall is one a visitor can make.
 * True outside every hall: the ordinary floor rules decide there.
 *
 * A visitor who is somewhere they cannot be (a restored pose inside a
 * flight) may always move, so they can walk out.
 */
export function grandMoveAllowed(
  stairs: readonly GrandStair[],
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  feetY: number,
): boolean {
  const hall = grandStairsAt(stairs, toX, toZ, feetY);
  if (hall.length === 0) return true;
  const to = grandSurfaceAt(hall, toX, toZ, feetY);
  if (to && to.y >= feetY - GRAND_MAX_DROP) return true;
  const from = grandSurfaceAt(grandStairsAt(stairs, fromX, fromZ, feetY), fromX, fromZ, feetY);
  return from === null || from.y < feetY - GRAND_MAX_DROP;
}

/** The floor a visitor standing at height `y` in a hall belongs to:
 *  the nearest, and `current` while they are within a tenth of a storey
 *  of the half-way point, so the floor does not flap on the landing. */
export function grandFloorFor(hall: readonly GrandStair[], y: number, current: number): number {
  let best = current;
  let bestDist = Number.POSITIVE_INFINITY;
  let currentDist = Number.POSITIVE_INFINITY;
  const seen = new Set<number>();
  for (const s of hall) {
    for (const index of grandHallFloors(s)) {
      if (seen.has(index)) continue;
      seen.add(index);
      const d = Math.abs(grandLevelY(s, index) - y);
      if (index === current) currentDist = d;
      if (d < bestDist) {
        bestDist = d;
        best = index;
      }
    }
  }
  return currentDist - bestDist > FLOOR_SEPARATION * 0.1 ? best : current;
}

/** Where a visitor sent to a stair hall lands: on the hall floor inside
 *  the door the stair faces, clear of the flights and the opening. */
export function grandHallArrival(stair: GrandStair): { x: number; z: number } {
  return toStairWorld(stair, 0, stair.half - 1.6);
}

// ── Designs ───────────────────────────────────────────────────────────

type Built = Pick<GrandStair, "patches" | "rails" | "columns" | "lamps" | "opening"> &
  Partial<Pick<GrandStair, "bridges">>;
type Site = {
  /** Half the hall's side. */
  half: number;
  /** Centre to the wall the stair climbs toward. */
  back: number;
  lowerY: number;
  upperY: number;
  hasFlightAbove: boolean;
  hasFlightBelow: boolean;
  /** Heights of the balcony floors over the floor the stair arrives
   *  on: the opening is fenced all round on each. */
  balconies: number[];
  /** Index of the floor the stair arrives on. The balconies are the
   *  floors after it, in order. */
  upperFloor: number;
  /** How a court's void is crossed. */
  bridges: CourtBridges;
};

/** Balustrades along an opening's outline at one height, but for the
 *  edges a flight arrives at or leaves from. */
function fence(outline: ReadonlyArray<[number, number]>, y: number, open: number[] = []) {
  const out: StairRail[] = [];
  outline.forEach(([x0, z0], i) => {
    const [x1, z1] = outline[(i + 1) % outline.length];
    if (open.includes(i) || Math.hypot(x1 - x0, z1 - z0) < 0.05) return;
    out.push(rail(x0, z0, y, x1, z1, y));
  });
  return out;
}

const rail = (
  x0: number,
  z0: number,
  y0: number,
  x1: number,
  z1: number,
  y1: number,
  skirtTo?: number,
): StairRail => ({ x0, z0, y0, x1, z1, y1, ...(skirtTo === undefined ? {} : { skirtTo }) });

/** Floor a hall keeps inside its walls on the floors over its stair,
 *  where the void is cut wider than the stair. */
const HALL_GALLERY = 5;

// Imperial stair, metres in the hall's frame. The opening leaves a
// gallery 3.25 m wide on three sides and a hall 9.45 m deep on the side
// the visitor comes in from, where the side flights arrive.
export const IMPERIAL = {
  /** Half width of the opening. */
  half: 8,
  north: -8,
  south: 1.8,
  /** The half landing runs the opening's whole width. */
  landingDepth: 3,
  centralHalf: 2.25,
  sideWidth: 3,
} as const;

/** A loggia: floor between the hall's door and the foot of the stair,
 *  on every storey (`lobby`). The side flights arrive on it and the next
 *  middle flight leaves from it. Each half landing runs back to the end
 *  wall, and the wall stands sheer from one landing to the next: one
 *  tall wall over each landing, seen from the foot of the stair and
 *  hung from the landing (`stairHallHang`). The floor of each storey is
 *  the lobby and a gallery beside the stair on each side.
 *
 *  Until 17 October 2026 the hall was 25 m deep: behind the half
 *  landings a void 3.95 m deep ran from the floor to the roof, with a
 *  gallery 5 m deep along the end wall on every storey and a pier at
 *  each end and either side of the middle under every landing's far
 *  edge. Rico, standing on a landing: the middle section "pushed
 *  further out" and the wall "brought to touch that stair case floor",
 *  the columns removed, so that works hang the whole height from the
 *  landing up. The landing is 6.95 m deep for that, which gives a
 *  visitor room to step back from a work 7 m tall. Before that the void
 *  ran on to the end wall, 11.45 m deep, the wall sheer for 24 m with
 *  the largest works up to 21 m over the floor (Rico: "this space is
 *  still a bit meh"). */
export const LOGGIA = { lobby: 6.25 } as const;

/** How far south of its place in a hall of its own the imperial stair
 *  stands in a loggia: up against the lobby. */
export function loggiaShift(half: number): number {
  return half - LOGGIA.lobby - IMPERIAL.south;
}

/** A wayfinding pylon at a loggia's foot: where it stands, which way
 *  it faces, and the floors its plaques name. */
export type StairSignPost = {
  id: string;
  x: number;
  z: number;
  /** About Y, as three.js turns an object: the plaque faces the door. */
  rotationY: number;
  /** The floor the middle flight climbs to, when there is one. */
  up: string | null;
  /** The floor the side flights go down to, when there is one. */
  down: string | null;
};

/** Where a loggia's pylons stand on its lobby, in the hall's frame:
 *  either side of the middle flight's foot, midway to the heads of the
 *  side flights, and clear of the balustrade between them. That stretch
 *  of floor leads nowhere, so a pylon there stands in no one's way. */
export const SIGN_POST_X = (IMPERIAL.centralHalf + (IMPERIAL.half - IMPERIAL.sideWidth)) / 2;
export const SIGN_POST_SETBACK = 0.3;

/**
 * The pylons on one storey of every loggia that meets it, two to a
 * hall, alike so the pair is symmetric about the stair's axis. Each
 * names the floor above (the middle flight, `stairsOut`) and the floor
 * below (the side flights down, `stairsIn`), as the spiral's gates do.
 * A court has no stair and no pylon.
 */
export function stairSignPosts(floor: {
  grandStairsIn?: readonly GrandStair[];
  grandStairsOut?: readonly GrandStair[];
}): StairSignPost[] {
  const halls = new Map<string, { out?: GrandStair; in?: GrandStair }>();
  const at = (s: GrandStair) => {
    const key = `${s.centerX.toFixed(2)},${s.centerZ.toFixed(2)}`;
    const hall = halls.get(key) ?? {};
    halls.set(key, hall);
    return hall;
  };
  for (const s of floor.grandStairsOut ?? []) if (s.design === "loggia") at(s).out = s;
  for (const s of floor.grandStairsIn ?? []) if (s.design === "loggia") at(s).in = s;

  const posts: StairSignPost[] = [];
  for (const { out, in: arrived } of halls.values()) {
    const stair = out ?? arrived;
    if (!stair) continue;
    const z = IMPERIAL.south + loggiaShift(stair.half) + SIGN_POST_SETBACK;
    for (const side of [-1, 1]) {
      const p = toStairWorld(stair, side * SIGN_POST_X, z);
      posts.push({
        id: `${stair.id}-sign-${side < 0 ? "w" : "e"}`,
        x: p.x,
        z: p.z,
        rotationY: (-stair.turns * Math.PI) / 2,
        up: out?.upperLabel ?? null,
        down: arrived?.lowerLabel ?? null,
      });
    }
  }
  return posts;
}

function buildLoggia(site: Site): Built {
  const { lowerY, upperY, hasFlightAbove, hasFlightBelow } = site;
  const mid = (lowerY + upperY) / 2;
  const { half, landingDepth, centralHalf, sideWidth } = IMPERIAL;
  const shift = loggiaShift(site.half);
  const north = IMPERIAL.north + shift;
  const south = IMPERIAL.south + shift;
  const landingSouth = north + landingDepth;
  // The landing runs back to the end wall, and the wall carries it: no
  // void behind it and no piers.
  const far = -site.back;
  const sideInner = half - sideWidth;
  const sideCx = half - sideWidth / 2;
  const steps = GRAND_RISERS / 2;
  // The lowest stair of a hall is masonry from the floor up; the ones
  // over it span from floor edge to landing.
  const solid = !hasFlightBelow;

  const patches: StairPatch[] = [
    {
      kind: "flight",
      cx: 0,
      z0: south,
      z1: landingSouth,
      hw0: centralHalf,
      hw1: centralHalf,
      y0: lowerY,
      y1: mid,
      steps,
      solid,
    },
    {
      kind: "flat",
      xMin: -half,
      xMax: half,
      zMin: far,
      zMax: landingSouth,
      y: mid,
      // The lowest landing is masonry to the floor, as its middle flight
      // is: under it would be a low room against the end wall, 7 m deep
      // and lit by nothing.
      ...(solid ? { solid: true } : {}),
    },
    ...[-1, 1].map(
      (side): FlightPatch => ({
        kind: "flight",
        cx: side * sideCx,
        z0: landingSouth,
        z1: south,
        hw0: sideWidth / 2,
        hw1: sideWidth / 2,
        y0: mid,
        y1: upperY,
        steps,
        solid: false,
      }),
    ),
  ];

  const skirt = solid ? lowerY : undefined;
  const rails: StairRail[] = [
    // Central flight.
    rail(-centralHalf, south, lowerY, -centralHalf, landingSouth, mid, skirt),
    rail(centralHalf, south, lowerY, centralHalf, landingSouth, mid, skirt),
    // Half landing: its ends, back to the wall, and the stretches of its
    // near edge between the flights.
    rail(-half, far, mid, -half, landingSouth, mid, skirt),
    rail(half, far, mid, half, landingSouth, mid, skirt),
    rail(-sideInner, landingSouth, mid, -centralHalf, landingSouth, mid, skirt),
    rail(centralHalf, landingSouth, mid, sideInner, landingSouth, mid, skirt),
  ];
  for (const side of [-1, 1]) {
    rails.push(
      rail(side * sideInner, landingSouth, mid, side * sideInner, south, upperY),
      rail(side * half, landingSouth, mid, side * half, south, upperY),
    );
  }
  // The opening in the floors above: the stair's own width, from the end
  // wall to its foot. Under another stair it ends at the stair, and the
  // next middle flight leaves from the middle of that edge.
  const stairRect: PlanRect = { xMin: -half, xMax: half, zMin: far, zMax: south };
  // The opening's edge: along the end wall, then east to west on the
  // side the visitor comes in from, the heads of the side flights at its
  // ends and the foot of the next stair in the middle.
  const outline: Array<[number, number]> = [
    [-half, far],
    [half, far],
    [half, south],
    [sideInner, south],
    [centralHalf, south],
    [-centralHalf, south],
    [-sideInner, south],
    [-half, south],
  ];
  // Edges with no balustrade: the end wall, the heads of the two side
  // flights, and the foot of the next stair, where there is one.
  const onWall = [0];
  const arrivals = [2, 6, ...(hasFlightAbove ? [4] : [])];
  rails.push(...fence(outline, upperY, [...onWall, ...arrivals]));
  for (const y of site.balconies) rails.push(...fence(outline, y, onWall));

  return {
    patches,
    rails,
    columns: [],
    lamps: [-1, 1].map((side) => ({ x: side * centralHalf, z: south, y: lowerY })),
    opening: { rects: [stairRect], outline },
  };
}

/** A hall with no stair, open from its floor to the roof: a gallery
 *  inside its walls on every floor above, round a square opening, and
 *  on some of those floors walkways across the opening from a portal to
 *  the one opposite (`CourtBridges`). */
function buildCourt(site: Site): Built {
  const c = site.half - HALL_GALLERY;
  const whole: PlanRect = { xMin: -c, xMax: c, zMin: -c, zMax: c };
  const outline: Array<[number, number]> = [
    [-c, -c],
    [c, -c],
    [c, c],
    [-c, c],
  ];
  const w = COURT_BRIDGE_WIDTH / 2;
  const northSouth: PlanRect = { xMin: -w, xMax: w, zMin: -c, zMax: c };
  const eastWest: PlanRect = { xMin: -c, xMax: c, zMin: -w, zMax: w };
  const levels = [site.upperY, ...site.balconies];
  const bridges: StairBridge[] = [];
  const rails: StairRail[] = [];
  levels.forEach((y, k) => {
    const floor = site.upperFloor + k;
    const across = courtCrossings(site.bridges, k).map((axis) =>
      axis === "ns" ? northSouth : eastWest,
    );
    for (const rect of across) bridges.push({ floor, rect });
    // Every edge of the hole that floor is left with, but where two of
    // its pieces meet: a walkway is fenced along both sides and is open
    // at its ends.
    const pieces = rectMinus(whole, across);
    for (const r of pieces) {
      const corners: Array<[number, number]> = [
        [r.xMin, r.zMin],
        [r.xMax, r.zMin],
        [r.xMax, r.zMax],
        [r.xMin, r.zMax],
      ];
      corners.forEach(([x0, z0], i) => {
        const [x1, z1] = corners[(i + 1) % 4];
        // A point just across the edge's middle, outward.
        const mx = (x0 + x1) / 2 + Math.sign(z1 - z0) * 0.01;
        const mz = (z0 + z1) / 2 - Math.sign(x1 - x0) * 0.01;
        const shared = pieces.some(
          (o) => o !== r && mx > o.xMin && mx < o.xMax && mz > o.zMin && mz < o.zMax,
        );
        if (!shared) rails.push({ ...rail(x0, z0, y, x1, z1, y), beam: true });
      });
    }
  });
  return {
    patches: [],
    rails,
    columns: [],
    lamps: [],
    opening: { rects: [whole], outline },
    bridges,
  };
}

/** The walkways of the `k`th of a court's floors over its first: "ns"
 *  from the north portal to the south one, "ew" from west to east. */
export function courtCrossings(pattern: CourtBridges, k: number): Array<"ns" | "ew"> {
  return pattern === "alternate" ? [k % 2 === 0 ? "ns" : "ew"] : [];
}

/** Depth of a salon's galleries. */
export const SALON_GALLERY = 5;

/** A hall with no stair, open from its floor to the roof but for a
 *  gallery along its front wall (+z) and its two side walls on every
 *  floor above. The void reaches the far wall (-z), which stands sheer;
 *  the side galleries run on to it, so each floor looks at the far
 *  wall's work from beside it. */
function buildSalon(site: Site): Built {
  const w = site.half;
  const inner = w - SALON_GALLERY;
  const outline: Array<[number, number]> = [
    [-inner, -w],
    [inner, -w],
    [inner, inner],
    [-inner, inner],
  ];
  // A balustrade along each gallery's edge; the first edge is the far
  // wall.
  const rails = [site.upperY, ...site.balconies].flatMap((y) => fence(outline, y, [0]));
  return {
    patches: [],
    rails,
    columns: [],
    lamps: [],
    opening: {
      rects: [{ xMin: -inner, xMax: inner, zMin: -w, zMax: inner }],
      outline,
    },
  };
}

const BUILDERS: Record<GrandStairDesign, (site: Site) => Built> = {
  loggia: buildLoggia,
  court: buildCourt,
  salon: buildSalon,
};

export function buildGrandStair(
  spec: Omit<
    GrandStair,
    "patches" | "rails" | "columns" | "lamps" | "opening" | "back" | "bridges"
  > & {
    back?: number;
    /** How a court's void is crossed: none, unset. */
    bridges?: CourtBridges;
  },
): GrandStair {
  const balconies: number[] = [];
  for (let f = spec.upperFloor + 1; f <= spec.topFloor; f++) {
    balconies.push(spec.lowerY + (f - spec.lowerFloor) * FLOOR_SEPARATION);
  }
  const back = spec.back ?? spec.half;
  const { bridges: pattern = "none", ...rest } = spec;
  const built = BUILDERS[spec.design]({ ...rest, back, balconies, bridges: pattern });
  return { ...rest, back, ...built, bridges: built.bridges ?? [] };
}

/** A rail's ends in the world. */
export function railInWorld(stair: GrandStair, r: StairRail): StairRail {
  const a = toStairWorld(stair, r.x0, r.z0);
  const b = toStairWorld(stair, r.x1, r.z1);
  return { ...r, x0: a.x, z0: a.z, x1: b.x, z1: b.z };
}
