// Grand staircases for the block plan's square stair halls.
//
// The tower's stair is a spiral whose height is a function of the angle
// walked round it (`spiral-physics.ts`). A grand stair is flights and
// landings in a hall two storeys high, so it is described as surfaces:
// each a patch of plan with a height over it. Where the visitor stands
// is the highest surface they can step onto from where their feet are.
// There is no state to carry, so the same rule holds on the hall floor,
// on a flight, on a landing and on the gallery above, whichever floor
// the renderer thinks is current.
//
// Three designs, one to a hall:
//
//   imperial   One flight up the middle to a half landing, two flights
//              back along the sides. Kunsthistorisches Museum Vienna,
//              Carnegie Museum, Natural History Museum London.
//   arcs       Two curved flights round a rotunda, meeting on the far
//              side. Bode-Museum Berlin.
//   hourglass  One straight flight that narrows to a landing at its
//              waist and widens again. Kunstmuseum Bonn.
//
// A stair can stand alone in a hall that is open above it to the roof
// (`topFloor`): the floors over the one it arrives on are balconies
// round the same opening. That is how the block plan uses them, one
// stair to a hall. They can also stack, the flights of one storey over
// the flights of the storey below (`hasFlightAbove`), which was built
// first and felt cramped: a soffit 5.8 m over every flight. A design is drawn in the hall's own frame, the visitor
// coming in from +z (south) and the first flight rising toward -z, and
// turned a quarter at a time to face the hall's main door (`turns`).
//
// No three.js here: the layout, the player, the collider set and the
// renderer all read this module.

import { FLOOR_SEPARATION } from "./world-coords";

export type GrandStairDesign = "imperial" | "arcs" | "hourglass";

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
};

/** A curved flight, or a level sector when `steps` is 0. Angles are
 *  `atan2(z, x)`: 0 is east, a quarter turn is south. It starts at `a0`
 *  and turns through `sweep` (signed) as it rises from `y0` to `y1`. */
export type ArcPatch = {
  kind: "arc";
  rIn: number;
  rOut: number;
  a0: number;
  sweep: number;
  y0: number;
  y1: number;
  steps: number;
  solid: boolean;
};

export type StairPatch = FlightPatch | FlatPatch | ArcPatch;

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
};

/** A square pier. */
export type StairColumn = { x: number; z: number; size: number; y0: number; y1: number };

/** A lamp standard on the post at the foot of a flight: the post's
 *  place on the plan and the height of the floor it stands on. */
export type StairLamp = { x: number; z: number; y: number };

/** The hole a stair leaves in the floor it arrives on. */
export type PlanRect = { xMin: number; xMax: number; zMin: number; zMax: number };

/** The hole a stair's hall has in every floor over the one the stair
 *  leaves: round, or one or more rectangles that touch. `outline` is the
 *  rectangles' edge as one closed line of points, in order. The hole is
 *  the stair's own footprint and, in a hall with nothing over the stair,
 *  as much more of the hall as leaves a gallery inside its walls. */
export type StairOpening =
  | { kind: "rects"; rects: PlanRect[]; outline: Array<[number, number]> }
  | { kind: "disc"; r: number };

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
  /** Half the hall's side. The hall is square. */
  half: number;
  /** Quarter turns from the design's frame to the world: 0 rises north,
   *  1 east, 2 south, 3 west. */
  turns: 0 | 1 | 2 | 3;
  /** Another stair of the same hall leaves the floor this one arrives
   *  on, or arrives on the floor this one leaves. */
  hasFlightAbove: boolean;
  hasFlightBelow: boolean;
  /** The hall has no gallery along the wall its stair climbs toward:
   *  the void reaches that wall on every floor over the stair's foot, so
   *  the wall stands sheer from the hall floor to the roof. It is where
   *  the works taller than a storey hang (`giants.ts`). Imperial stair
   *  only, and only with nothing over the stair. */
  sheerWall?: boolean;
  /** Everything below is in the hall's frame, heights in world metres. */
  patches: StairPatch[];
  rails: StairRail[];
  columns: StairColumn[];
  lamps: StairLamp[];
  opening: StairOpening;
};

/** Structural depth of a flight or landing that spans free. */
export const STAIR_SLAB = 0.3;
/** Clear height a visitor needs to walk under a flight. */
export const STAIR_HEADROOM = 2.3;
/** Risers in a storey: 0.153 m each. */
export const GRAND_RISERS = 40;
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

/** The opening as a world rectangle or disc. */
export function openingInWorld(
  stair: GrandStair,
):
  | { kind: "rects"; rects: PlanRect[]; outline: Array<[number, number]> }
  | { kind: "disc"; x: number; z: number; r: number } {
  const o = stair.opening;
  if (o.kind === "disc") return { kind: "disc", x: stair.centerX, z: stair.centerZ, r: o.r };
  return {
    kind: "rects",
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

/** The compass side of the wall a sheer hall's void reaches: the one
 *  its stair climbs toward. */
export function sheerSide(stair: Pick<GrandStair, "turns">): "north" | "east" | "south" | "west" {
  return (["north", "east", "south", "west"] as const)[stair.turns];
}

/** Depth of the strip a sheer hall has no gallery over, measured in
 *  from its sheer wall. */
export function sheerStripDepth(half: number): number {
  return half + IMPERIAL.north;
}

/** How far an opening reaches from the hall's centre. */
export function openingReach(o: StairOpening): number {
  if (o.kind === "disc") return o.r;
  return Math.max(...o.rects.flatMap((r) => [-r.xMin, r.xMax, -r.zMin, r.zMax]));
}

// ── Surfaces ──────────────────────────────────────────────────────────

const TAU = Math.PI * 2;

/** How far along an arc patch a point is, 0 at its foot and 1 at its
 *  head, or null when the point is off it. */
function arcProgress(p: ArcPatch, x: number, z: number): number | null {
  const r = Math.hypot(x, z);
  if (r < p.rIn || r > p.rOut) return null;
  let d = (Math.atan2(z, x) - p.a0) * Math.sign(p.sweep || 1);
  d = ((d % TAU) + TAU) % TAU;
  const span = Math.abs(p.sweep);
  // A point a hair before the foot reads as a full turn on.
  if (d > span && d > TAU - 1e-6) d = 0;
  return d <= span ? d / span : null;
}

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
  const t = p.kind === "flight" ? flightProgress(p, x, z) : arcProgress(p, x, z);
  if (t === null) return null;
  return stepped(p.y0, p.y1, p.steps, t);
}

/** Height of the patch's underside over a point: the floor it stands on
 *  when solid, else its slab. Null when the patch is not over it. */
function patchUnderside(p: StairPatch, x: number, z: number, baseY: number): number | null {
  if (p.kind === "flat") return patchHeight(p, x, z) === null ? null : p.y - STAIR_SLAB;
  const t = p.kind === "flight" ? flightProgress(p, x, z) : arcProgress(p, x, z);
  if (t === null) return null;
  if (p.solid) return baseY;
  return p.y0 + (p.y1 - p.y0) * t - STAIR_SLAB;
}

export function inOpening(stair: GrandStair, x: number, z: number): boolean {
  const o = stair.opening;
  if (o.kind === "disc") return Math.hypot(x, z) < o.r;
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
    if (Math.abs(worldX - s.centerX) <= s.half && Math.abs(worldZ - s.centerZ) <= s.half) {
      out.push(s);
    }
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
      (s) => floorIndex > s.lowerFloor && floorIndex <= s.topFloor && inOpening(s, x, z),
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

type Built = Pick<GrandStair, "patches" | "rails" | "columns" | "lamps" | "opening">;
type Site = {
  /** Half the hall's side. */
  half: number;
  lowerY: number;
  upperY: number;
  hasFlightAbove: boolean;
  hasFlightBelow: boolean;
  sheerWall?: boolean;
  /** Heights of the balcony floors over the floor the stair arrives
   *  on: the opening is fenced all round on each. */
  balconies: number[];
};

/** Floor a hall keeps inside its walls on the floors over its stair,
 *  where the void is cut wider than the stair. */
const HALL_GALLERY = 5;

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

function buildImperial(site: Site): Built {
  const { lowerY, upperY, hasFlightAbove, hasFlightBelow } = site;
  const mid = (lowerY + upperY) / 2;
  const { half, north, south, landingDepth, centralHalf, sideWidth } = IMPERIAL;
  const landingSouth = north + landingDepth;
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
    { kind: "flat", xMin: -half, xMax: half, zMin: north, zMax: landingSouth, y: mid },
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
    // Half landing: its far edge, its ends, and the stretches of its
    // near edge between the flights.
    rail(-half, north, mid, half, north, mid),
    rail(-half, north, mid, -half, landingSouth, mid),
    rail(half, north, mid, half, landingSouth, mid),
    rail(-sideInner, landingSouth, mid, -centralHalf, landingSouth, mid),
    rail(centralHalf, landingSouth, mid, sideInner, landingSouth, mid),
  ];
  for (const side of [-1, 1]) {
    rails.push(
      rail(side * sideInner, landingSouth, mid, side * sideInner, south, upperY),
      rail(side * half, landingSouth, mid, side * half, south, upperY),
    );
  }
  // The opening in the floors above. Over the stair it is the stair's
  // own width. With nothing over the stair it runs on south over the
  // hall floor in front of the middle flight, between two strips of
  // floor the side flights arrive on, and stops a gallery's depth from
  // the wall: the hall is open to the roof from the door to the landing.
  // Under another stair it ends at the stair, and the next middle flight
  // leaves from the middle of that edge.
  const court = site.half - HALL_GALLERY;
  const courted = !hasFlightAbove && court > south + 2;
  // A sheer wall: no gallery behind the half landing either. The void
  // runs on north to the wall, the hall's whole width, and the side
  // galleries end level with the landing's far edge.
  const sheer = courted && site.sheerWall === true;
  const wall = site.half;
  const stairRect: PlanRect = { xMin: -half, xMax: half, zMin: north, zMax: south };
  const outline: Array<[number, number]> = sheer
    ? [
        [-wall, -wall],
        [wall, -wall],
        [wall, north],
        [half, north],
        [half, south],
        [sideInner, south],
        [sideInner, court],
        [-sideInner, court],
        [-sideInner, south],
        [-half, south],
        [-half, north],
        [-wall, north],
      ]
    : courted
      ? [
          [-half, north],
          [half, north],
          [half, south],
          [sideInner, south],
          [sideInner, court],
          [-sideInner, court],
          [-sideInner, south],
          [-half, south],
        ]
      : [
          [-half, north],
          [half, north],
          [half, south],
          [sideInner, south],
          [centralHalf, south],
          [-centralHalf, south],
          [-sideInner, south],
          [-half, south],
        ];
  // The heads of the two side flights, and the foot of the next stair.
  // No balustrade along a wall: the first two edges and the last of a
  // sheer hall's outline lie on its walls.
  const onWall = sheer ? [0, 1, 11] : [];
  const arrivals = sheer ? [4, 8] : courted ? [2, 6] : hasFlightAbove ? [2, 4, 6] : [2, 6];
  rails.push(...fence(outline, upperY, [...onWall, ...arrivals]));
  for (const y of site.balconies) rails.push(...fence(outline, y, onWall));

  // Piers under the landing's far edge. Each stands on the landing of
  // the stair below, or on the hall floor.
  const footY = hasFlightBelow ? mid - FLOOR_SEPARATION : lowerY;
  const columns: StairColumn[] = [
    -half + 0.3,
    -centralHalf - 0.5,
    centralHalf + 0.5,
    half - 0.3,
  ].map((x) => ({ x, z: north + 0.3, size: 0.6, y0: footY, y1: mid - STAIR_SLAB }));

  return {
    patches,
    rails,
    columns,
    lamps: [-1, 1].map((side) => ({ x: side * centralHalf, z: south, y: lowerY })),
    opening: {
      kind: "rects",
      rects: [
        ...(sheer ? [{ xMin: -wall, xMax: wall, zMin: -wall, zMax: north }] : []),
        stairRect,
        ...(courted ? [{ xMin: -sideInner, xMax: sideInner, zMin: south, zMax: court }] : []),
      ],
      outline,
    },
  };
}

// Two curved flights round a rotunda. They leave a level sector on the
// side the visitor comes in from and meet on a level sector opposite.
export const ARCS = {
  rIn: 4.6,
  rOut: 7.8,
  /** Half the angle of each level sector. */
  gate: (16 * Math.PI) / 180,
  /** Straight pieces a curved rail is drawn in, per flight. */
  railSegments: 14,
} as const;

function buildArcs(site: Site): Built {
  const { lowerY, upperY, hasFlightAbove, hasFlightBelow } = site;
  const { rIn, rOut, gate, railSegments } = ARCS;
  const south = Math.PI / 2;
  const north = -Math.PI / 2;
  const sweep = Math.PI - 2 * gate;
  const solid = !hasFlightBelow;

  const patches: StairPatch[] = [
    // The foot: level with the floor the stair leaves. On an upper floor
    // it is a bridge over the well from the gallery to both flights.
    {
      kind: "arc",
      rIn,
      rOut,
      a0: south - gate,
      sweep: 2 * gate,
      y0: lowerY,
      y1: lowerY,
      steps: 0,
      solid: false,
    },
    // East flight turns clockwise on the plan (angle falling), west
    // flight the other way.
    {
      kind: "arc",
      rIn,
      rOut,
      a0: south - gate,
      sweep: -sweep,
      y0: lowerY,
      y1: upperY,
      steps: GRAND_RISERS,
      solid,
    },
    {
      kind: "arc",
      rIn,
      rOut,
      a0: south + gate,
      sweep,
      y0: lowerY,
      y1: upperY,
      steps: GRAND_RISERS,
      solid,
    },
    // The head, level with the floor above.
    {
      kind: "arc",
      rIn,
      rOut,
      a0: north - gate,
      sweep: 2 * gate,
      y0: upperY,
      y1: upperY,
      steps: 0,
      solid,
    },
  ];

  const rails: StairRail[] = [];
  const arcRail = (
    r: number,
    a0: number,
    turn: number,
    y0: number,
    y1: number,
    skirtTo?: number,
  ) => {
    const n = Math.max(1, Math.round((Math.abs(turn) / sweep) * railSegments));
    for (let i = 0; i < n; i++) {
      const a = a0 + (turn * i) / n;
      const b = a0 + (turn * (i + 1)) / n;
      rails.push(
        rail(
          r * Math.cos(a),
          r * Math.sin(a),
          y0 + ((y1 - y0) * i) / n,
          r * Math.cos(b),
          r * Math.sin(b),
          y0 + ((y1 - y0) * (i + 1)) / n,
          skirtTo,
        ),
      );
    }
  };
  const skirt = solid ? lowerY : undefined;
  for (const [a0, turn] of [
    [south - gate, -sweep],
    [south + gate, sweep],
  ] as const) {
    arcRail(rIn, a0, turn, lowerY, upperY, skirt);
    arcRail(rOut, a0, turn, lowerY, upperY, skirt);
  }
  // The head's inner edge looks down the well.
  arcRail(rIn, north - gate, 2 * gate, upperY, upperY, skirt);
  // The foot's inner edge too, where the foot is a bridge. On the hall
  // floor it is the way into the rotunda.
  if (hasFlightBelow) arcRail(rIn, south - gate, 2 * gate, lowerY, lowerY);
  // Round the opening on the floor above: closed but for the head, and
  // for the foot of the next stair when there is one.
  if (hasFlightAbove) {
    arcRail(rOut, south - gate, -sweep, upperY, upperY);
    arcRail(rOut, south + gate, sweep, upperY, upperY);
  } else {
    arcRail(rOut, north + gate, TAU - 2 * gate, upperY, upperY);
  }

  for (const y of site.balconies) arcRail(rOut, north + gate, TAU, y, y);

  return {
    patches,
    rails,
    columns: [],
    // Either side of the way in, on the outer rails' first posts.
    lamps: [-1, 1].map((side) => ({
      x: rOut * Math.cos(south + side * gate),
      z: rOut * Math.sin(south + side * gate),
      y: lowerY,
    })),
    opening: { kind: "disc", r: rOut },
  };
}

// One straight flight, 9 m wide at its foot and head and 4 m at the
// landing in its waist.
export const HOURGLASS = {
  end: 7.9,
  landingHalfDepth: 1.1,
  wide: 4.5,
  waist: 2,
} as const;

function buildHourglass(site: Site): Built {
  const { lowerY, upperY, hasFlightAbove, hasFlightBelow } = site;
  const { end, landingHalfDepth, wide, waist } = HOURGLASS;
  const mid = (lowerY + upperY) / 2;
  const steps = GRAND_RISERS / 2;
  const solid = !hasFlightBelow;

  const patches: StairPatch[] = [
    {
      kind: "flight",
      cx: 0,
      z0: end,
      z1: landingHalfDepth,
      hw0: wide,
      hw1: waist,
      y0: lowerY,
      y1: mid,
      steps,
      solid,
    },
    {
      kind: "flat",
      xMin: -waist,
      xMax: waist,
      zMin: -landingHalfDepth,
      zMax: landingHalfDepth,
      y: mid,
    },
    {
      kind: "flight",
      cx: 0,
      z0: -landingHalfDepth,
      z1: -end,
      hw0: waist,
      hw1: wide,
      y0: mid,
      y1: upperY,
      steps,
      solid: false,
    },
  ];

  const skirt = solid ? lowerY : undefined;
  const rails: StairRail[] = [];
  for (const side of [-1, 1]) {
    rails.push(
      rail(side * wide, end, lowerY, side * waist, landingHalfDepth, mid, skirt),
      rail(side * waist, landingHalfDepth, mid, side * waist, -landingHalfDepth, mid),
      rail(side * waist, -landingHalfDepth, mid, side * wide, -end, upperY),
    );
  }
  // The opening in the floors above: the stair's length, and with
  // nothing over the stair twice its width, so the flight stands free
  // in the well with air on both sides. The head arrives in the middle
  // of the far edge; under another stair, the next foot leaves from the
  // near one.
  const voidHalf = hasFlightAbove
    ? wide
    : Math.max(wide, Math.min(site.half - HALL_GALLERY, 2 * wide));
  const outline: Array<[number, number]> = [
    [-voidHalf, -end],
    [-wide, -end],
    [wide, -end],
    [voidHalf, -end],
    [voidHalf, end],
    [-voidHalf, end],
  ];
  rails.push(...fence(outline, upperY, hasFlightAbove ? [1, 4] : [1]));
  for (const y of site.balconies) rails.push(...fence(outline, y));

  const footY = hasFlightBelow ? mid - FLOOR_SEPARATION : lowerY;
  const columns: StairColumn[] = [-1, 1].map((side) => ({
    x: side * (waist - 0.3),
    z: -landingHalfDepth + 0.3,
    size: 0.6,
    y0: footY,
    y1: mid - STAIR_SLAB,
  }));

  return {
    patches,
    rails,
    columns,
    lamps: [-1, 1].map((side) => ({ x: side * wide, z: end, y: lowerY })),
    opening: {
      kind: "rects",
      rects: [{ xMin: -voidHalf, xMax: voidHalf, zMin: -end, zMax: end }],
      outline,
    },
  };
}

const BUILDERS: Record<GrandStairDesign, (site: Site) => Built> = {
  imperial: buildImperial,
  arcs: buildArcs,
  hourglass: buildHourglass,
};

export function buildGrandStair(
  spec: Omit<GrandStair, "patches" | "rails" | "columns" | "lamps" | "opening">,
): GrandStair {
  const balconies: number[] = [];
  for (let f = spec.upperFloor + 1; f <= spec.topFloor; f++) {
    balconies.push(spec.lowerY + (f - spec.lowerFloor) * FLOOR_SEPARATION);
  }
  return { ...spec, ...BUILDERS[spec.design]({ ...spec, balconies }) };
}

/** A rail's ends in the world. */
export function railInWorld(stair: GrandStair, r: StairRail): StairRail {
  const a = toStairWorld(stair, r.x0, r.z0);
  const b = toStairWorld(stair, r.x1, r.z1);
  return { ...r, x0: a.x, z0: a.z, x1: b.x, z1: b.z };
}
