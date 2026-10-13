// A second floor plan for the museum, behind a switch (`?plan=block`).
//
// One rectangular block, 117.5 × 62.5 m, on four floors. Its middle is a
// core of three halls, each 27.5 m square: the stair halls. Round the
// core runs a ring of twelve rooms, so a visitor walks the galleries
// from door to door without crossing a stair hall, and turns into the
// core to change floor.
//
//   ┌────┬────────┬────────┬────────┬────┐
//   │ n1 │   n2   │   n3   │   n4   │ n5 │   north
//   ├────┼────────┼────────┼────────┼────┤
//   │ w  │ hall-w │ hall-c │ hall-e │ e  │
//   ├────┼────────┼────────┼────────┼────┤
//   │ s1 │   s2   │   s3   │   s4   │ s5 │   south, s3 is the great hall
//   └────┴────────┴────────┴────────┴────┘
//
// Each hall holds one grand stair (`grand-stair.ts`) between two floors
// and is open above it to the roof, with a balcony on every floor over
// the stair's head. The middle hall's stair climbs from the first floor
// to the second, the west hall's from the second to the third, the east
// hall's from the third to the fourth: the way up goes through all
// three, and they stand next to one another. Under a hall that starts
// higher up, the same square is one more gallery.
//
// The rooms are the size of the tower's larger ones (17.5 to 27.5 m),
// so they take the tower's dividers and benches. A floor holds two or
// three eras, each in rooms that touch, each room in its era's colour.
//
// No two floors are the same plan. Each joins two neighbours of a row
// into one long gallery (`BLOCK_PLAN[].merges`), 45 or 55 m of it, so a
// floor is not its own mirror image and the next floor up is not a copy
// of this one.
//
// It exists to be walked and judged against the tower
// (`layout-museum.ts`), which stays the default. Two earlier plans were
// walked and changed, both on 12 October 2026:
//
// - `?plan=wings`, 12.5 m galleries in rings: rooms too small, too many
//   of them, no dividers, too few doors between rooms.
// - This block with its three stair halls in a row on the long axis, 22.5
//   m square, every stair stacked through all four floors (tag
//   `museum-block-stacked-stairs-2026-10-12`). The halls felt cramped:
//   the stair filled the room to within 3.3 m of the walls, and the
//   underside of the next storey's stair hung 5.8 m over every flight.
//   The long axis ran through all three, so the way from room to room
//   led round a stair.

import type { ArtworkListing } from "@/lib/data";
import { type Era, type EraId, eraAccentColor, getEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { centredIsland, planPanelBenches } from "./feature-benches";
import { arrivalPoint, ceilingHeightFor, planBenches, planDividers } from "./fittings";
import { hangGrandHall, pickHallCandidates } from "./grand-hall";
import {
  buildGrandStair,
  type GrandStair,
  type GrandStairDesign,
  grandHallArrival,
  openingInWorld,
} from "./grand-stair";
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
import type { CellRect, Door, FloorLayout, MuseumLayout, RoomLayout } from "./types";
import { CELL_SIZE, floorY, PORTAL_HEIGHT, PORTAL_WIDTH, WALL_THICKNESS } from "./world-coords";

export const BLOCK_GRID = { x: 47, z: 25 };

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
  [0, 6],
  [7, 17],
  [18, 28],
  [29, 39],
  [40, 46],
];
const ROW_N = [0, 6] as const;
const ROW_M = [7, 17] as const;
const ROW_S = [18, 24] as const;

const rect = (col: number, row: readonly [number, number]): CellRect => ({
  xMin: COLS[col][0],
  xMax: COLS[col][1],
  zMin: row[0],
  zMax: row[1],
});

type RoomKey = string;
/** The ring: rooms that hang works on every floor. */
export const BLOCK_ROOMS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "n1", rect: rect(0, ROW_N) },
  { key: "n2", rect: rect(1, ROW_N) },
  { key: "n3", rect: rect(2, ROW_N) },
  { key: "n4", rect: rect(3, ROW_N) },
  { key: "n5", rect: rect(4, ROW_N) },
  { key: "w", rect: rect(0, ROW_M) },
  { key: "e", rect: rect(4, ROW_M) },
  { key: "s1", rect: rect(0, ROW_S) },
  { key: "s2", rect: rect(1, ROW_S) },
  { key: "s3", rect: rect(2, ROW_S) },
  { key: "s4", rect: rect(3, ROW_S) },
  { key: "s5", rect: rect(4, ROW_S) },
];
/**
 * The core: three halls, west to east, each with one grand stair from
 * floor `from` to the next and open from there to the roof. Each stair
 * faces the door a visitor comes to it through: the middle one rises
 * north from the great hall, the outer two rise away from the middle
 * hall, whose stair or balcony the visitor has just left.
 *
 * On a floor under `from` the hall's square is a gallery like any other.
 */
export const BLOCK_HALLS: ReadonlyArray<{
  key: RoomKey;
  rect: CellRect;
  design: GrandStairDesign;
  turns: GrandStair["turns"];
  from: number;
}> = [
  { key: "hall-w", rect: rect(1, ROW_M), design: "arcs", turns: 3, from: 1 },
  { key: "hall-c", rect: rect(2, ROW_M), design: "imperial", turns: 0, from: 0 },
  { key: "hall-e", rect: rect(3, ROW_M), design: "hourglass", turns: 1, from: 2 },
];
export const GREAT_HALL: RoomKey = "s3";
/** The hall the great hall is composed about. */
const MAIN_HALL: RoomKey = "hall-c";

/** The order a visitor walks the ring in: left out of the great hall,
 *  clockwise round the block, and back into the great hall last. Eras
 *  are dealt along it, so each fills rooms that touch and the largest
 *  canvases of a floor's last era hang in its great hall. */
export const BLOCK_ROUTE: readonly RoomKey[] = [
  "s2",
  "s1",
  "w",
  "n1",
  "n2",
  "n3",
  "n4",
  "n5",
  "e",
  "s5",
  "s4",
  "s3",
];
/** Where a hall's square comes in the walk on a floor where it is a
 *  gallery: after the end room it opens off. */
const HALL_AFTER: Record<RoomKey, RoomKey> = { "hall-w": "w", "hall-e": "e" };

/** Doors a portal wide: the long axis through the core and out to the
 *  end rooms, and the short axis through the middle hall. */
const PORTALS: ReadonlyArray<readonly [RoomKey, RoomKey]> = [
  ["w", "hall-w"],
  ["hall-w", "hall-c"],
  ["hall-c", "hall-e"],
  ["hall-e", "e"],
  ["n3", "hall-c"],
  ["hall-c", "s3"],
];

type Zone = { era: EraId; rooms: number; coverage?: number };
type FloorPlan = {
  title: string;
  /** Eras in the order of the walk (`blockFloorRooms().cells`). `rooms`
   *  counts squares of the diagram above: a long gallery counts as the
   *  rooms it was joined from, and goes to the era its first room falls
   *  in. */
  zones: readonly Zone[];
  /** Neighbours of one row joined into one long gallery, west to east.
   *  Keep each inside one era. */
  merges: ReadonlyArray<readonly RoomKey[]>;
};
/** What hangs on each floor, in the order of the walk, and in how many
 *  rooms. The first floor has both outer halls' squares as galleries
 *  (14 rooms), the second the east one (13). The two collections that
 *  stand beside the timeline share the top floor; East Asian painting
 *  comes last there, so its screens and scrolls take the great hall. */
export const BLOCK_PLAN: readonly FloorPlan[] = [
  {
    title: "Gothic to Baroque",
    // The middle of the north range: one gallery of 55 m.
    merges: [["n2", "n3"]],
    zones: [
      { era: "gothic", rooms: 3 },
      { era: "renaissance", rooms: 5 },
      { era: "baroque", rooms: 6 },
    ],
  },
  {
    title: "Rococo to Realism",
    // The great hall runs on into the room east of it.
    merges: [
      ["n4", "n5"],
      ["s3", "s4"],
    ],
    zones: [
      { era: "enlightenment", rooms: 4 },
      { era: "romantic", rooms: 4 },
      { era: "realism", rooms: 5 },
    ],
  },
  {
    title: "Impressionism to Modernism",
    merges: [
      ["s1", "s2"],
      ["n3", "n4"],
    ],
    zones: [
      { era: "fin-de-siecle", rooms: 5 },
      { era: "post-impressionism", rooms: 4 },
      { era: "modernism", rooms: 3 },
    ],
  },
  {
    title: "Natural History and East Asia",
    merges: [
      ["n1", "n2"],
      ["s4", "s5"],
    ],
    zones: [
      { era: "natural-history", rooms: 6, coverage: BLOCK_PRINT_COVERAGE },
      { era: "ukiyo-e", rooms: 6, coverage: BLOCK_PRINT_COVERAGE },
    ],
  },
];

/** The key of a long gallery: its rooms' keys, joined. */
const mergedKey = (keys: readonly RoomKey[]) => keys.join("-");

/**
 * One floor's rooms: the stair halls it has, the squares of the diagram
 * that hang works in the order of the walk (`cells`), the rooms those
 * make once its long galleries are joined, and the walk through them.
 * The great hall is whichever room holds `GREAT_HALL`.
 */
export function blockFloorRooms(floorIndex: number): {
  halls: Array<(typeof BLOCK_HALLS)[number]>;
  cells: RoomKey[];
  rooms: Array<{ key: RoomKey; rect: CellRect; cells: readonly RoomKey[] }>;
  route: RoomKey[];
  keyOf: (cell: RoomKey) => RoomKey;
  greatHall: RoomKey;
} {
  const plan = BLOCK_PLAN[floorIndex];
  const halls = BLOCK_HALLS.filter((h) => h.from <= floorIndex);
  const galleries = BLOCK_HALLS.filter((h) => h.from > floorIndex);
  // The walk: the ring, with a hall's square after the end room it opens
  // off wherever it is a gallery.
  const cells: RoomKey[] = [];
  for (const cell of BLOCK_ROUTE) {
    cells.push(cell);
    for (const h of galleries) if (HALL_AFTER[h.key] === cell) cells.push(h.key);
  }

  const into = new Map<RoomKey, RoomKey>();
  for (const merge of plan.merges) for (const cell of merge) into.set(cell, mergedKey(merge));
  const keyOf = (cell: RoomKey) => into.get(cell) ?? cell;

  const rooms: Array<{ key: RoomKey; rect: CellRect; cells: RoomKey[] }> = [];
  for (const { key: cell, rect: r } of [...BLOCK_ROOMS, ...galleries]) {
    const key = keyOf(cell);
    const room = rooms.find((x) => x.key === key);
    if (!room) {
      rooms.push({ key, rect: { ...r }, cells: [cell] });
      continue;
    }
    room.cells.push(cell);
    room.rect = {
      xMin: Math.min(room.rect.xMin, r.xMin),
      xMax: Math.max(room.rect.xMax, r.xMax),
      zMin: Math.min(room.rect.zMin, r.zMin),
      zMax: Math.max(room.rect.zMax, r.zMax),
    };
  }
  // A long gallery is walked once. It keeps the last place any of its
  // rooms had on the walk, so the great hall still ends it.
  const route: RoomKey[] = [];
  cells.forEach((cell, i) => {
    const key = keyOf(cell);
    if (!cells.slice(i + 1).some((later) => keyOf(later) === key)) route.push(key);
  });
  return { halls, cells, rooms, route, keyOf, greatHall: keyOf(GREAT_HALL) };
}

// --- Public entry ---------------------------------------------------------

export function layoutBlock(allArtworks: ArtworkListing[]): MuseumLayout {
  const byEra = bucketByEra(allArtworks);
  const floors = BLOCK_PLAN.map((plan, index) => buildFloor(index, plan, byEra));
  const top = floors.length - 1;

  // One stair to a hall, and the hall open from the stair's foot to the
  // roof. Each floor of the hall has the stair's opening in its floor
  // but the lowest, and in its ceiling but the highest.
  const grandStairs: GrandStair[] = [];
  for (const hall of BLOCK_HALLS) {
    const stair = buildStair(floors[hall.from], floors[hall.from + 1], hall, top);
    floors[hall.from].grandStairsOut!.push(stair);
    floors[hall.from + 1].grandStairsIn!.push(stair);
    grandStairs.push(stair);
    const opening = openingInWorld(stair);
    for (let f = hall.from; f <= top; f++) {
      floors[f].grandHalls!.push(stair);
      const room = floors[f].rooms.find((r) => r.isStairwell && hallKey(r) === hall.key)!;
      room.floorOpening = f > hall.from ? opening : null;
      room.ceilingOpening = f < top ? opening : null;
      room.stairGlyph = f === hall.from ? "up" : f === hall.from + 1 ? "down" : "void";
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
    allStaircases: [],
    grandStairs,
  };
}

const hallKey = (room: RoomLayout) => room.id.replace(/^f\d+-/, "");

/** Where a visitor sent to a room lands. A stair hall's centre is a
 *  flight or the open well, so there it is inside the door its stair
 *  faces: floor on every storey of the hall. */
export function blockArrivalPoint(
  layout: MuseumLayout,
  room: RoomLayout,
): { x: number; z: number } {
  if (room.isStairwell) {
    const stair = layout.grandStairs?.find((s) => s.id.startsWith(`${hallKey(room)}-`));
    if (stair) return grandHallArrival(stair);
  }
  return arrivalPoint(room);
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

  const { halls, cells, rooms: floorRooms, route, keyOf, greatHall } = blockFloorRooms(index);
  // A great hall joined to its neighbour is a long gallery with two
  // doors in its front wall: nothing to compose a mirrored hang about.
  const composedHall = greatHall === GREAT_HALL;

  // Which era each room shows: zones laid along the walk, a long
  // gallery in the era of its first room.
  const eraOfKey = new Map<RoomKey, Era>();
  const zoneKeys: RoomKey[][] = plan.zones.map(() => []);
  let cursor = 0;
  plan.zones.forEach((zone, z) => {
    for (const cell of cells.slice(cursor, cursor + zone.rooms)) {
      const key = keyOf(cell);
      if (eraOfKey.has(key)) continue;
      eraOfKey.set(key, getEra(zone.era));
      zoneKeys[z].push(key);
    }
    cursor += zone.rooms;
  });
  for (const keys of zoneKeys) keys.sort((a, b) => route.indexOf(a) - route.indexOf(b));

  const rooms: RoomLayout[] = [];
  const byKey = new Map<RoomKey, RoomLayout>();
  const add = (key: RoomKey, room: RoomLayout) => {
    rooms.push(room);
    byKey.set(key, room);
  };
  for (const { key, rect: r } of halls) {
    add(key, makeRoom(index, key, r, floorEra, { title: "Stair hall", isStairwell: true }));
  }
  for (const { key, rect: r } of floorRooms) {
    const era = eraOfKey.get(key) ?? floorEra;
    add(key, makeRoom(index, key, r, era, { title: era.title, isAnchor: key === greatHall }));
  }

  // A door in every wall two rooms share.
  const keys = [...byKey.keys()];
  const isPortal = (a: RoomKey, b: RoomKey) =>
    PORTALS.some(
      ([x, y]) => (keyOf(x) === a && keyOf(y) === b) || (keyOf(x) === b && keyOf(y) === a),
    );
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
  for (const { key } of floorRooms) {
    const room = byKey.get(key)!;
    const hall = composedHall && key === greatHall;
    room.dividers = hall ? [] : planDividers(room.cellBounds, room.doors);
    room.benches = planBenches(room.cellBounds, room.doors, room.dividers, hall ? "z" : undefined);
    // A room with no panels and no way straight through it (a corner of
    // the ring) is seated on its centre. `planBenches` keeps clear of
    // both doors' lines and so stands the island in one quarter of it.
    if (!hall && room.dividers.length === 0) {
      room.benches = centredIsland(room.cellBounds, room.doors) ?? room.benches;
    }
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
    grandStairsIn: [],
    grandStairsOut: [],
    grandHalls: [],
  };

  plan.zones.forEach((zone, z) => {
    hangZone(
      floor,
      zoneKeys[z].map((k) => byKey.get(k)!),
      getEra(zone.era),
      byEra.get(zone.era) ?? [],
      composedHall ? byKey.get(MAIN_HALL)! : null,
      zone.coverage ?? BLOCK_WALL_COVERAGE,
    );
  });

  // A room with panels is seated on the lines of its panels, after the
  // hang: of the places those lines give, the ones in front of the
  // largest works are taken.
  for (const { key } of floorRooms) {
    const room = byKey.get(key)!;
    room.benches = [...room.benches, ...planPanelBenches(room)];
  }

  let roomNumber = 0;
  for (const key of route) {
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
  /** The stair hall the great hall is composed about, or null when the
   *  floor's great hall is a long gallery and hangs like any room. */
  middleStair: RoomLayout | null,
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
  const hall = middleStair ? zoneRooms.find((r) => r.isAnchor) : undefined;
  const hallPlacements =
    hall && middleStair ? hangGrandHall(hall, pickHallCandidates(chosen), middleStair.id) : null;
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

function buildStair(
  lower: FloorLayout,
  upper: FloorLayout,
  hall: (typeof BLOCK_HALLS)[number],
  topFloor: number,
): GrandStair {
  const r = hall.rect;
  return buildGrandStair({
    id: `${hall.key}-${lower.index}-to-${upper.index}`,
    design: hall.design,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    topFloor,
    lowerLabel: `Floor ${lower.index + 1}`,
    upperLabel: `Floor ${upper.index + 1}`,
    lowerY: lower.y,
    upperY: upper.y,
    centerX: ((r.xMin + r.xMax + 1) / 2) * CELL_SIZE,
    centerZ: ((r.zMin + r.zMax + 1) / 2) * CELL_SIZE,
    half: ((r.xMax - r.xMin + 1) * CELL_SIZE) / 2,
    turns: hall.turns,
    // One stair to a hall: masonry from its floor up, and nothing over it.
    hasFlightBelow: false,
    hasFlightAbove: false,
  });
}
