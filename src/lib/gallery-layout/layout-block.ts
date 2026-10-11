// A second floor plan for the museum, behind a switch (`?plan=block`).
//
// One rectangular block, 102.5 × 57.5 m, on four floors. Three stair
// halls stand on its long axis: one in the middle and one at each end.
// A row of five rooms runs along the front and a row of five along the
// back, with one room either side of the middle stair hall between
// them. Every room has a door to every neighbour.
//
//        ┌──────┬─────┬──────┬─────┬──────┐
//        │  n1  │ n2  │  n3  │ n4  │  n5  │   north
//        ├──────┼─────┼──────┼─────┼──────┤
//        │ stair│ mw  │ stair│ me  │ stair│
//        ├──────┼─────┼──────┼─────┼──────┤
//        │  s1  │ s2  │  s3  │ s4  │  s5  │   south, s3 is the great hall
//        └──────┴─────┴──────┴─────┴──────┘
//
// The rooms are the size of the tower's larger ones (17.5 to 22.5 m),
// so they take the tower's dividers and benches. A floor holds two or
// three eras, each in rooms that touch, each room in its era's colour.
//
// It exists to be walked and judged against the tower
// (`layout-museum.ts`), which stays the default. An earlier plan of
// 12.5 m galleries in rings (`?plan=wings`, 12 October 2026) was walked
// and rejected: rooms too small, too many of them, no dividers, too few
// doors between rooms.

import type { ArtworkListing } from "@/lib/data";
import { type Era, type EraId, eraAccentColor, getEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { arrivalPoint, ceilingHeightFor, planBenches, planDividers } from "./fittings";
import { hangGrandHall, pickHallCandidates } from "./grand-hall";
import {
  bucketByEra,
  computeBlockedEdges,
  describeRoom,
  dominantMovement,
  fillRooms,
  groupMovements,
  selectFloorWorks,
  shuffleByIdHash,
} from "./layout-museum";
import { computeRoomRuns, distributePaintings, runLength, wallFootprint } from "./place-paintings";
import { texturePxPerMetre } from "./sharpness";
import type { CellRect, Door, FloorLayout, MuseumLayout, RoomLayout, Staircase } from "./types";
import {
  CELL_SIZE,
  floorY,
  PORTAL_HEIGHT,
  PORTAL_WIDTH,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

export const BLOCK_GRID = { x: 41, z: 23 };

/** Doors between rooms. One cell wide for the collision grid, so no
 *  jamb colliders (`doorOpenHalfSpan`), and wide enough for a thumb. */
export const BLOCK_DOOR_WIDTH = 2.4;
export const BLOCK_DOOR_HEIGHT = 2.9;

/** Share of a room's wall its works and plaques cover, dividers
 *  included. Rico found works hung too close at 0.55; below a half the
 *  gap between two works is wider than a work. The two floors of small
 *  sheets hang thinner still: many prints of one shape in a row read as
 *  wallpaper. */
export const BLOCK_WALL_COVERAGE = 0.45;
export const BLOCK_PRINT_COVERAGE = 0.38;

// Columns and rows, in cells, both ends inclusive. Every band is an odd
// number of cells, which puts the middle of a shared wall in the middle
// of a cell: the collision grid needs a door there.
const COLS: ReadonlyArray<readonly [number, number]> = [
  [0, 8],
  [9, 15],
  [16, 24],
  [25, 31],
  [32, 40],
];
const ROW_N = [0, 6] as const;
const ROW_M = [7, 15] as const;
const ROW_S = [16, 22] as const;

const rect = (col: number, row: readonly [number, number]): CellRect => ({
  xMin: COLS[col][0],
  xMax: COLS[col][1],
  zMin: row[0],
  zMax: row[1],
});

type RoomKey = string;
/** Rooms that hang works. */
export const BLOCK_ROOMS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "n1", rect: rect(0, ROW_N) },
  { key: "n2", rect: rect(1, ROW_N) },
  { key: "n3", rect: rect(2, ROW_N) },
  { key: "n4", rect: rect(3, ROW_N) },
  { key: "n5", rect: rect(4, ROW_N) },
  { key: "mw", rect: rect(1, ROW_M) },
  { key: "me", rect: rect(3, ROW_M) },
  { key: "s1", rect: rect(0, ROW_S) },
  { key: "s2", rect: rect(1, ROW_S) },
  { key: "s3", rect: rect(2, ROW_S) },
  { key: "s4", rect: rect(3, ROW_S) },
  { key: "s5", rect: rect(4, ROW_S) },
];
/** The three stair halls, west to east. The middle one is where the
 *  monumental stair belongs; for now all three hold the tower's spiral. */
export const BLOCK_STAIRS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "stair-w", rect: rect(0, ROW_M) },
  { key: "stair-c", rect: rect(2, ROW_M) },
  { key: "stair-e", rect: rect(4, ROW_M) },
];
export const GREAT_HALL: RoomKey = "s3";

/** The order a visitor walks a floor in: left out of the great hall,
 *  clockwise round the block, and back into the great hall last. Eras
 *  are dealt along it, so each fills rooms that touch and the largest
 *  canvases of a floor's last era hang in its great hall. */
export const BLOCK_ROUTE: readonly RoomKey[] = [
  "s2",
  "s1",
  "mw",
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "me",
  "s5",
  "s4",
  "s3",
];

/** Doors a portal wide: the long axis through the three stair halls,
 *  and the short axis through the middle one. */
const PORTALS: ReadonlyArray<readonly [RoomKey, RoomKey]> = [
  ["stair-w", "mw"],
  ["mw", "stair-c"],
  ["stair-c", "me"],
  ["me", "stair-e"],
  ["n3", "stair-c"],
  ["stair-c", "s3"],
];

type Zone = { era: EraId; rooms: number; coverage?: number };
/** What hangs on each floor, in route order, and in how many rooms.
 *  The two collections that stand beside the timeline share the top
 *  floor; East Asian painting comes last there, so its screens and
 *  scrolls take the great hall. */
export const BLOCK_PLAN: ReadonlyArray<{ title: string; zones: readonly Zone[] }> = [
  {
    title: "Gothic to Baroque",
    zones: [
      { era: "gothic", rooms: 2 },
      { era: "renaissance", rooms: 5 },
      { era: "baroque", rooms: 5 },
    ],
  },
  {
    title: "Rococo to Realism",
    zones: [
      { era: "enlightenment", rooms: 4 },
      { era: "romantic", rooms: 4 },
      { era: "realism", rooms: 4 },
    ],
  },
  {
    title: "Impressionism to Modernism",
    zones: [
      { era: "fin-de-siecle", rooms: 5 },
      { era: "post-impressionism", rooms: 4 },
      { era: "modernism", rooms: 3 },
    ],
  },
  {
    title: "Natural History and East Asia",
    zones: [
      { era: "natural-history", rooms: 6, coverage: BLOCK_PRINT_COVERAGE },
      { era: "ukiyo-e", rooms: 6, coverage: BLOCK_PRINT_COVERAGE },
    ],
  },
];

// --- Public entry ---------------------------------------------------------

export function layoutBlock(allArtworks: ArtworkListing[]): MuseumLayout {
  const byEra = bucketByEra(allArtworks);
  const floors = BLOCK_PLAN.map((plan, index) => buildFloor(index, plan, byEra));

  const allStaircases: Staircase[] = [];
  for (let i = 0; i < floors.length - 1; i++) {
    for (const shaft of BLOCK_STAIRS) {
      const stair = buildStaircase(floors[i], floors[i + 1], shaft);
      floors[i].stairsOut.push(stair);
      floors[i + 1].stairsIn.push(stair);
      allStaircases.push(stair);
    }
  }

  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const arrival = arrivalPoint(anchor);
  return {
    floors,
    entry: { floorIndex: 0, worldPosition: [arrival.x, anchor.worldRect.y, arrival.z] },
    allRooms: floors.flatMap((f) => f.rooms),
    allHallways: [],
    allStaircases,
  };
}

// --- One floor ------------------------------------------------------------

function buildFloor(
  index: number,
  plan: (typeof BLOCK_PLAN)[number],
  byEra: Map<EraId, ArtworkListing[]>,
): FloorLayout {
  // The floor as a whole answers to its first era: the id a saved visit
  // is filed under, and the palette of the stair halls.
  const floorEra = getEra(plan.zones[0].era);

  // Which era each room shows: zones laid along the route.
  const eraOfKey = new Map<RoomKey, Era>();
  let cursor = 0;
  for (const zone of plan.zones) {
    for (const key of BLOCK_ROUTE.slice(cursor, cursor + zone.rooms)) {
      eraOfKey.set(key, getEra(zone.era));
    }
    cursor += zone.rooms;
  }

  const rooms: RoomLayout[] = [];
  const byKey = new Map<RoomKey, RoomLayout>();
  const add = (key: RoomKey, room: RoomLayout) => {
    rooms.push(room);
    byKey.set(key, room);
  };
  for (const { key, rect: r } of BLOCK_STAIRS) {
    add(key, makeRoom(index, key, r, floorEra, { title: "Stair hall", isStairwell: true }));
  }
  for (const { key, rect: r } of BLOCK_ROOMS) {
    const era = eraOfKey.get(key) ?? floorEra;
    add(key, makeRoom(index, key, r, era, { title: era.title, isAnchor: key === GREAT_HALL }));
  }

  // A door in every wall two rooms share.
  const keys = [...byKey.keys()];
  const isPortal = (a: RoomKey, b: RoomKey) =>
    PORTALS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = byKey.get(keys[i])!;
      const b = byKey.get(keys[j])!;
      if (!sharesWall(a.cellBounds, b.cellBounds)) continue;
      const portal = isPortal(keys[i], keys[j]);
      connect(
        a,
        b,
        portal ? PORTAL_WIDTH : BLOCK_DOOR_WIDTH,
        portal ? PORTAL_HEIGHT : BLOCK_DOOR_HEIGHT,
      );
    }
  }

  // Dividers and benches need the doors. The great hall stays one open
  // room, composed about the door to the stair hall, as in the tower.
  for (const { key } of BLOCK_ROOMS) {
    const room = byKey.get(key)!;
    const hall = key === GREAT_HALL;
    room.dividers = hall ? [] : planDividers(room.cellBounds, room.doors);
    room.benches = planBenches(room.cellBounds, room.doors, room.dividers, hall ? "z" : undefined);
  }

  const walkable = new Uint8Array(BLOCK_GRID.x * BLOCK_GRID.z);
  const cellOwner = new Int16Array(BLOCK_GRID.x * BLOCK_GRID.z).fill(-1);
  rooms.forEach((r, i) => {
    for (let x = r.cellBounds.xMin; x <= r.cellBounds.xMax; x++) {
      for (let z = r.cellBounds.zMin; z <= r.cellBounds.zMax; z++) {
        walkable[z * BLOCK_GRID.x + x] = 1;
        cellOwner[z * BLOCK_GRID.x + x] = i;
      }
    }
  });
  const { blockedEdgesEW, blockedEdgesNS } = computeBlockedEdges(BLOCK_GRID, rooms, cellOwner);

  const floor: FloorLayout = {
    index,
    era: floorEra,
    title: plan.title,
    y: floorY(index),
    gridSize: { ...BLOCK_GRID },
    walkable,
    cellOwner,
    blockedEdgesEW,
    blockedEdgesNS,
    rooms,
    hallways: [],
    stairsIn: [],
    stairsOut: [],
  };

  cursor = 0;
  for (const zone of plan.zones) {
    const zoneRooms = BLOCK_ROUTE.slice(cursor, cursor + zone.rooms).map((k) => byKey.get(k)!);
    cursor += zone.rooms;
    hangZone(
      floor,
      zoneRooms,
      getEra(zone.era),
      byEra.get(zone.era) ?? [],
      byKey.get("stair-c")!,
      zone.coverage ?? BLOCK_WALL_COVERAGE,
    );
  }

  let roomNumber = 0;
  for (const key of BLOCK_ROUTE) {
    const room = byKey.get(key)!;
    const era = eraOfKey.get(key) ?? floorEra;
    room.artworks = room.placements.map((p) => p.artwork);
    room.roomNumber = ++roomNumber;
    room.movement = dominantMovement(room.artworks, era) ?? era.title;
    room.title = room.isAnchor ? era.title : room.movement;
    room.description = describeRoom(room.title, room.artworks);
  }
  return floor;
}

/** Hang one era in its rooms. Works with the sharpest scans come first:
 *  an artist's share of the wall goes to their best-scanned works. */
function hangZone(
  floor: FloorLayout,
  zoneRooms: RoomLayout[],
  era: Era,
  candidates: ArtworkListing[],
  middleStair: RoomLayout,
  coverage: number,
) {
  const wallOf = (room: RoomLayout) =>
    computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
  const walls = zoneRooms.map(wallOf);
  const budget = walls.reduce((a, b) => a + b, 0) * coverage;

  const meanFootprint =
    candidates.reduce((sum, a) => sum + wallFootprint(a), 0) / Math.max(1, candidates.length);
  let chosen = selectFloorWorks(
    candidates,
    Math.floor(budget / Math.max(0.5, meanFootprint)),
    (a) => texturePxPerMetre(a) ?? 0,
  );
  // The sample is by count; trim to the wall it has to fit.
  chosen = shuffleByIdHash(chosen);
  let used = 0;
  chosen = chosen.filter((a) => {
    const need = wallFootprint(a);
    if (used + need > budget) return false;
    used += need;
    return true;
  });

  // The great hall is composed from the era's largest works, in pairs
  // either side of the door to the stair hall.
  const hall = zoneRooms.find((r) => r.isAnchor);
  const hallPlacements = hall
    ? hangGrandHall(hall, pickHallCandidates(chosen), middleStair.id)
    : null;
  if (hall && hallPlacements) hall.placements = hallPlacements;
  const inHall = new Set(hallPlacements?.map((p) => p.artwork.id));

  const dealt = zoneRooms.filter((r) => !(r === hall && hallPlacements));
  const queue = [
    ...groupMovements(
      era,
      chosen.filter((a) => !inHall.has(a.id)),
    ).entries(),
  ]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, artworks]) => ({ name, artworks }));
  const fills = fillRooms(dealt.map(wallOf), queue, era);
  dealt.forEach((room, i) => {
    room.artworks = fills[i].artworks;
  });

  // Spill stays inside the era: the placer sees only its rooms.
  const stats = distributePaintings(
    { ...floor, rooms: zoneRooms },
    hall && hallPlacements ? new Set([hall.id]) : undefined,
  );
  if (stats.dropped > 0 && process.env.NODE_ENV !== "production") {
    console.warn(`[gallery-layout] ${era.title}: ${stats.dropped} works did not fit their rooms`);
  }

  const accentByMovement = new Map<string, number>();
  for (const room of zoneRooms) {
    const movement =
      dominantMovement(
        room.placements.map((p) => p.artwork),
        era,
      ) ?? era.title;
    let accent = accentByMovement.get(movement);
    if (accent === undefined) {
      accent = accentByMovement.size;
      accentByMovement.set(movement, accent);
    }
    room.floorColor = eraAccentColor(era, accent);
  }
}

// --- Rooms, doors, stairs -------------------------------------------------

function makeRoom(
  floorIndex: number,
  key: string,
  r: CellRect,
  era: Era,
  opts: { title: string; isStairwell?: boolean; isAnchor?: boolean },
): RoomLayout {
  return {
    id: slugify(`f${floorIndex}-${key}`) || `f${floorIndex}-${key}`,
    floorIndex,
    era: era.id,
    movement: opts.title,
    title: opts.title,
    description: opts.title,
    isAnchor: opts.isAnchor ?? false,
    roomNumber: null,
    isStairwell: opts.isStairwell ?? false,
    cellBounds: { ...r },
    worldRect: {
      xMin: r.xMin * CELL_SIZE + WALL_THICKNESS,
      xMax: (r.xMax + 1) * CELL_SIZE - WALL_THICKNESS,
      zMin: r.zMin * CELL_SIZE + WALL_THICKNESS,
      zMax: (r.zMax + 1) * CELL_SIZE - WALL_THICKNESS,
      y: floorY(floorIndex),
    },
    doors: [],
    ceilingHeight: ceilingHeightFor(r),
    dividers: [],
    benches: [],
    placements: [],
    artworks: [],
    floorColor: era.palette.floorColor,
  };
}

function sharesWall(a: CellRect, b: CellRect): boolean {
  const zOverlap = a.zMin <= b.zMax && b.zMin <= a.zMax;
  const xOverlap = a.xMin <= b.xMax && b.xMin <= a.xMax;
  return (
    ((a.xMax + 1 === b.xMin || b.xMax + 1 === a.xMin) && zOverlap) ||
    ((a.zMax + 1 === b.zMin || b.zMax + 1 === a.zMin) && xOverlap)
  );
}

type Side = Door["side"];
const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** A door between two rooms that share a wall, in the middle of the
 *  stretch they share. */
function connect(a: RoomLayout, b: RoomLayout, width: number, height: number) {
  const ra = a.cellBounds;
  const rb = b.cellBounds;
  let side: Side;
  let worldX: number;
  let worldZ: number;
  const mid = (lo: number, hi: number) => (Math.floor((lo + hi) / 2) + 0.5) * CELL_SIZE;
  if (ra.xMax + 1 === rb.xMin || rb.xMax + 1 === ra.xMin) {
    side = ra.xMax + 1 === rb.xMin ? "east" : "west";
    worldX = (side === "east" ? ra.xMax + 1 : ra.xMin) * CELL_SIZE;
    worldZ = mid(Math.max(ra.zMin, rb.zMin), Math.min(ra.zMax, rb.zMax));
  } else {
    side = ra.zMax + 1 === rb.zMin ? "south" : "north";
    worldZ = (side === "south" ? ra.zMax + 1 : ra.zMin) * CELL_SIZE;
    worldX = mid(Math.max(ra.xMin, rb.xMin), Math.min(ra.xMax, rb.xMax));
  }
  const door = (room: RoomLayout, s: Side, other: RoomLayout): Door => ({
    side: s,
    worldX,
    worldZ,
    worldY: room.worldRect.y,
    width,
    height,
    portal: true,
    connectsTo: { kind: "room", roomId: other.id },
  });
  a.doors.push(door(a, side, b));
  b.doors.push(door(b, OPPOSITE[side], a));
}

function buildStaircase(
  lower: FloorLayout,
  upper: FloorLayout,
  shaft: (typeof BLOCK_STAIRS)[number],
): Staircase {
  const r = shaft.rect;
  return {
    id: `${shaft.key}-${lower.index}-to-${upper.index}`,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    lowerLabel: `Floor ${lower.index + 1}`,
    upperLabel: `Floor ${upper.index + 1}`,
    centerX: ((r.xMin + r.xMax + 1) / 2) * CELL_SIZE,
    centerZ: ((r.zMin + r.zMax + 1) / 2) * CELL_SIZE,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lower.y,
    upperY: upper.y,
    // Step 0 at the south, the side the great hall is on.
    entryAngle: Math.PI / 2,
  };
}
