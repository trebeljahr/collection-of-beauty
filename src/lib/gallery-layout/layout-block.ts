// A second floor plan for the museum, behind a switch (`?plan=block`).
//
// One rectangular block, 117.5 × 62.5 m, on four floors. Down its middle
// runs a spine of five bays: a stair hall 27.5 m square at each end and
// one in the centre, and a gallery between each pair. A range of five
// rooms runs along the north of the spine and one along the south.
//
//   ┌──────────┬──────┬──────────┬──────┬──────────┐
//   │    n1    │  n2  │    n3    │  n4  │    n5    │   north
//   ├──────────┼──────┼──────────┼──────┼──────────┤
//   │  hall-w  │  cw  │  hall-c  │  ce  │  hall-e  │   the spine
//   ├──────────┼──────┼──────────┼──────┼──────────┤
//   │    s1    │  s2  │    s3    │  s4  │    s5    │   south, s3 is the great hall
//   └──────────┴──────┴──────────┴──────┴──────────┘
//
// Each hall holds one grand stair (`grand-stair.ts`) between two floors
// and is open above it to the roof, with a balcony on every floor over
// the stair's head. The middle hall's stair climbs from the first floor
// to the second, the west hall's from the second to the third, the east
// hall's from the third to the fourth. Under a hall that starts higher
// up, the same square is one more gallery.
//
// A stair hall is entered where its stair starts. On the floor a stair
// leaves, its hall has one door, the portal the foot of the first flight
// faces: the great hall's for the middle stair, the spine's for the two
// at the ends. A door in any other wall would open on the flank or the
// back of a flight. On the floors above, a hall is a balcony round its
// void and has a door to every neighbour.
//
// So the spine is the way up. A visitor comes up the middle stair, turns
// through the portal beside the head of its west flight, crosses one
// gallery and has the foot of the west stair in front of them. From the
// west hall's balcony a floor higher, the line of portals runs the
// length of the building, across the middle hall's balcony, to the foot
// of the east stair.
//
// The rooms are the size of the tower's larger ones (17.5 to 27.5 m),
// so they take the tower's dividers and benches. A floor holds two or
// three eras, each in rooms that touch, each room in its era's colour.
//
// No two floors are the same plan. Each joins neighbours of a row into
// a long gallery (`BLOCK_PLAN[].merges`), 45 or 62.5 m of it. A corner
// room beside a hall that has one door would be a dead end, so on that
// floor it is the far end of a long gallery.
//
// It exists to be walked and judged against the tower
// (`layout-museum.ts`), which stays the default. Three earlier plans
// were walked and changed:
//
// - `?plan=wings`, 12.5 m galleries in rings: rooms too small, too many
//   of them, no dividers, too few doors between rooms.
// - This block with three stair halls 40 m apart on the long axis, 22.5
//   m square, every stair stacked through all four floors (tag
//   `museum-block-stacked-stairs-2026-10-12`). The halls felt cramped:
//   the stair filled the room to within 3.3 m of the walls, and the
//   underside of the next storey's stair hung 5.8 m over every flight.
//   A hall was a room on the way from one gallery to the next.
// - The three halls wall to wall in the middle of the block, inside a
//   ring of twelve rooms, each hall with a door in all four walls (tag
//   `museum-block-core-of-three-2026-10-13`). On the second floor two
//   grand stairs stood in adjoining rooms, and most doors of a hall
//   opened on the side or the back of its stair.

import type { ArtworkListing } from "@/lib/data";
import { type Era, type EraId, eraAccentColor, getEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import {
  centredIsland,
  hallIslandsFacingPair,
  planPanelBenches,
  wallIsland,
} from "./feature-benches";
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
// of a cell: the collision grid needs a door there. The columns are
// wide, narrow, wide, narrow, wide, and the three rows share them, so
// every door of the plan is in the middle of its room's wall.
const COLS: ReadonlyArray<readonly [number, number]> = [
  [0, 10],
  [11, 17],
  [18, 28],
  [29, 35],
  [36, 46],
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
type Side = Door["side"];
/** Rooms that hang works on every floor: the two ranges, and the two
 *  galleries of the spine. */
export const BLOCK_ROOMS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "n1", rect: rect(0, ROW_N) },
  { key: "n2", rect: rect(1, ROW_N) },
  { key: "n3", rect: rect(2, ROW_N) },
  { key: "n4", rect: rect(3, ROW_N) },
  { key: "n5", rect: rect(4, ROW_N) },
  { key: "cw", rect: rect(1, ROW_M) },
  { key: "ce", rect: rect(3, ROW_M) },
  { key: "s1", rect: rect(0, ROW_S) },
  { key: "s2", rect: rect(1, ROW_S) },
  { key: "s3", rect: rect(2, ROW_S) },
  { key: "s4", rect: rect(3, ROW_S) },
  { key: "s5", rect: rect(4, ROW_S) },
];
/**
 * The stair halls: the centre of the spine and its two ends, each with
 * one grand stair from floor `from` to the next and open from there to
 * the roof. Each stair faces the one door its hall has on the floor it
 * leaves (`hallFront`): the middle stair rises north from the great
 * hall, the outer two rise outward from the spine.
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
  { key: "hall-w", rect: rect(0, ROW_M), design: "arcs", turns: 3, from: 1 },
  { key: "hall-c", rect: rect(2, ROW_M), design: "imperial", turns: 0, from: 0 },
  { key: "hall-e", rect: rect(4, ROW_M), design: "hourglass", turns: 1, from: 2 },
];
export const GREAT_HALL: RoomKey = "s3";
/** The hall the great hall is composed about. */
const MAIN_HALL: RoomKey = "hall-c";

/** The wall of a hall its stair's foot faces: a design is drawn with the
 *  visitor coming in from the south, and turned a quarter at a time. */
const FRONTS: readonly Side[] = ["south", "west", "north", "east"];
export function hallFront(hall: { turns: GrandStair["turns"] }): Side {
  return FRONTS[hall.turns];
}

/** Doors a portal wide: the spine from end to end, and the short axis
 *  through the middle hall. */
const PORTALS: ReadonlyArray<readonly [RoomKey, RoomKey]> = [
  ["hall-w", "cw"],
  ["cw", "hall-c"],
  ["hall-c", "ce"],
  ["ce", "hall-e"],
  ["n3", "hall-c"],
  ["hall-c", "s3"],
];

type Zone = { era: EraId; cells: readonly RoomKey[]; coverage?: number };
type FloorPlan = {
  title: string;
  /** Eras in the order they are walked, each with the squares of the
   *  diagram above it hangs in, in the order of the walk: west out of
   *  the great hall, round the block by the north, and back into the
   *  great hall last, so the largest canvases of a floor's last era hang
   *  there. A long gallery is named by every square it was joined from. */
  zones: readonly Zone[];
  /** Neighbours of one row joined into one long gallery, west to east.
   *  Keep each inside one era. */
  merges: ReadonlyArray<readonly RoomKey[]>;
};
/** What hangs on each floor and where. The first floor has both end
 *  halls' squares as galleries (14 rooms), the second the east one
 *  (13). The two collections that stand beside the timeline share the
 *  top floor; East Asian painting comes last there, so its screens and
 *  scrolls take the great hall. */
export const BLOCK_PLAN: readonly FloorPlan[] = [
  {
    title: "Gothic to Baroque",
    // The north range behind the middle stair hall, which has no door
    // on this side here: one gallery of 62.5 m.
    merges: [["n2", "n3", "n4"]],
    zones: [
      { era: "gothic", cells: ["s2", "s1", "cw"] },
      { era: "renaissance", cells: ["hall-w", "n1", "n2", "n3", "n4"] },
      { era: "baroque", cells: ["n5", "hall-e", "ce", "s5", "s4", "s3"] },
    ],
  },
  {
    title: "Rococo to Realism",
    // The west stair leaves this floor, so its hall has one door. The
    // corner rooms beside it are the ends of two galleries of 45 m.
    merges: [
      ["n1", "n2"],
      ["s1", "s2"],
    ],
    zones: [
      { era: "enlightenment", cells: ["s2", "s1", "cw", "n2", "n1"] },
      { era: "romantic", cells: ["n3", "n4", "n5", "hall-e"] },
      { era: "realism", cells: ["ce", "s5", "s4", "s3"] },
    ],
  },
  {
    title: "Impressionism to Modernism",
    // The same at the east end, where the east stair leaves.
    merges: [
      ["n4", "n5"],
      ["s4", "s5"],
    ],
    zones: [
      { era: "fin-de-siecle", cells: ["s2", "s1", "cw", "n1", "n2"] },
      { era: "post-impressionism", cells: ["n3", "n4", "n5", "ce"] },
      { era: "modernism", cells: ["s5", "s4", "s3"] },
    ],
  },
  {
    title: "Natural History and East Asia",
    // The great hall runs on into the room east of it.
    merges: [
      ["n2", "n3"],
      ["s3", "s4"],
    ],
    zones: [
      {
        era: "natural-history",
        cells: ["s2", "s1", "cw", "n1", "n2", "n3"],
        coverage: BLOCK_PRINT_COVERAGE,
      },
      {
        era: "ukiyo-e",
        cells: ["n4", "n5", "ce", "s5", "s4", "s3"],
        coverage: BLOCK_PRINT_COVERAGE,
      },
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
  const cells = plan.zones.flatMap((zone) => [...zone.cells]);

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

  const { halls, rooms: floorRooms, route, keyOf, greatHall } = blockFloorRooms(index);
  // A great hall joined to its neighbour is a long gallery with two
  // doors in its front wall: nothing to compose a mirrored hang about.
  const composedHall = greatHall === GREAT_HALL;

  // Which era each room shows. A long gallery is named by each of its
  // squares and listed once.
  const eraOfKey = new Map<RoomKey, Era>();
  const zoneKeys: RoomKey[][] = plan.zones.map((zone) => {
    const keys: RoomKey[] = [];
    for (const cell of zone.cells) {
      const key = keyOf(cell);
      if (eraOfKey.has(key)) continue;
      eraOfKey.set(key, getEra(zone.era));
      keys.push(key);
    }
    return keys.sort((a, b) => route.indexOf(a) - route.indexOf(b));
  });

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

  // A door in every wall two rooms share, but for a stair hall on the
  // floor its stair leaves: that hall has the one door its stair faces.
  const fronts = new Map<RoomKey, Side>();
  for (const hall of halls) if (hall.from === index) fronts.set(hall.key, hallFront(hall));
  const keys = [...byKey.keys()];
  const isPortal = (a: RoomKey, b: RoomKey) =>
    PORTALS.some(
      ([x, y]) => (keyOf(x) === a && keyOf(y) === b) || (keyOf(x) === b && keyOf(y) === a),
    );
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = byKey.get(keys[i])!;
      const b = byKey.get(keys[j])!;
      const side = wallBetween(a.cellBounds, b.cellBounds);
      if (!side) continue;
      const aFront = fronts.get(keys[i]);
      const bFront = fronts.get(keys[j]);
      if ((aFront && aFront !== side) || (bFront && bFront !== OPPOSITE[side])) continue;
      const portal = isPortal(keys[i], keys[j]);
      connect(
        a,
        b,
        side,
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
    // A room with no panels is seated on its own lines: on its centre
    // when there is no way straight through it, in front of its one
    // wall without a door when there is. `planBenches` keeps clear of
    // every door's line and so stands the island in one quarter of it.
    if (!hall && room.dividers.length === 0) {
      room.benches =
        centredIsland(room.cellBounds, room.doors) ??
        wallIsland(room.cellBounds, room.doors) ??
        room.benches;
    }
    // A room with panels is seated on the lines of its panels. All of
    // it before the hang, which puts a work in front of each bench.
    room.benches = [...room.benches, ...planPanelBenches(room)];
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

  // The composed great hall is hung by its own rule, about the door to
  // the stair hall. Its islands turn to look at the pair beside that
  // door, the floor's two largest works.
  if (composedHall) {
    const hall = byKey.get(greatHall)!;
    hall.benches = hallIslandsFacingPair(hall, byKey.get(MAIN_HALL)!.id) ?? hall.benches;
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
    { anchorToBenches: true },
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

/** The side of room `a` that room `b` stands against, or null when the
 *  two share no wall. */
function wallBetween(a: CellRect, b: CellRect): Side | null {
  const zOverlap = a.zMin <= b.zMax && b.zMin <= a.zMax;
  const xOverlap = a.xMin <= b.xMax && b.xMin <= a.xMax;
  if (zOverlap && a.xMax + 1 === b.xMin) return "east";
  if (zOverlap && b.xMax + 1 === a.xMin) return "west";
  if (xOverlap && a.zMax + 1 === b.zMin) return "south";
  if (xOverlap && b.zMax + 1 === a.zMin) return "north";
  return null;
}

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** A door between two rooms that share a wall, in the middle of the
 *  stretch they share. `side` is the side of `a` that `b` is on. */
function connect(a: RoomLayout, b: RoomLayout, side: Side, width: number, height: number) {
  const ra = a.cellBounds;
  const rb = b.cellBounds;
  let worldX: number;
  let worldZ: number;
  const mid = (lo: number, hi: number) => (Math.floor((lo + hi) / 2) + 0.5) * CELL_SIZE;
  if (side === "east" || side === "west") {
    worldX = (side === "east" ? ra.xMax + 1 : ra.xMin) * CELL_SIZE;
    worldZ = mid(Math.max(ra.zMin, rb.zMin), Math.min(ra.zMax, rb.zMax));
  } else {
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
