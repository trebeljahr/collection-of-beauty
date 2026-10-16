// A second floor plan for the museum, behind a switch (`?plan=block`).
//
// One rectangular block, 117.5 × 62.5 m, on four floors, the same plan
// on each. Down its middle runs a spine of five bays: a stair hall 27.5
// m square at each end, a court of the same size in the centre, and a
// gallery between each pair. A range runs along the north of the spine
// and one along the south: a long gallery, a stair tower, a long
// gallery.
//
//   ┌─────────────────┬─────────┬─────────────────┐
//   │       nw        │ stair-n │       ne        │   north
//   ├──────────┬──────┼─────────┼──────┬──────────┤
//   │  hall-w  │  cw  │  court  │  ce  │  hall-e  │   the spine
//   ├──────────┴──────┼─────────┼──────┴──────────┤
//   │       sw        │ stair-s │       se        │   south
//   └─────────────────┴─────────┴─────────────────┘
//
// Four stairs, each in the same place on every floor:
//
// - A grand stair at each end of the spine (`grand-stair.ts`, the
//   loggia): one flight up the middle to a half landing and two back
//   along the sides, storey over storey. It stands in the front of its
//   hall and faces the portal of the spine. A door in each side wall
//   leads from the gallery beside it to a long gallery. Behind its
//   landings the hall is open from the floor to the roof, 11.45 m deep
//   and 27.5 m wide.
// - The tower's spiral north and south of the court, in a room of its
//   own (22.5 × 17.5 m) with a door to the court and to the gallery on
//   either side.
//
// The court has no stair. It is where a visit starts: a hall open to
// the roof, with a gallery round the opening on every floor above, a
// portal in each wall, the grand stairs at the two ends of one axis and
// the spirals at the two ends of the other.
//
// The halls and the court hang the works too large for a room, at their
// real size (`giants.ts`): one to a stretch of wall on each storey, and
// the largest on the sheer walls behind the two grand stairs.
//
// The galleries are the size of the tower's larger rooms and take its
// dividers and benches. A floor holds two or three eras, each in rooms
// that touch, each room in its era's colour.
//
// It exists to be walked and judged against the tower
// (`layout-museum.ts`), which stays the default. Five earlier plans
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
// - The halls at the centre and both ends of the spine, one stair to a
//   hall: the middle one from the first floor to the second, the west
//   from the second to the third, the east from the third to the fourth
//   (tag `museum-block-spine-of-three-2026-10-13`). Rico, 13 October
//   2026: the staircase "should be at the end and not in the center of
//   the building", one at either side, the spirals "at the top and
//   bottom"; the stairs "don't 'stack' on the same levels neatly"; and
//   the giants "cluster too close together". He kept one thing: the
//   gallery seen from above.

import type { ArtworkListing } from "@/lib/data";
import { type Era, type EraId, eraAccentColor, getEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import type { DividerStyle } from "./divider-plans";
import { centredIsland, courtIslands, planPanelBenches, wallIsland } from "./feature-benches";
import {
  arrivalPoint,
  benchClearOf,
  benchRect,
  ceilingHeightFor,
  planBenches,
  planDividers,
} from "./fittings";
import {
  fitsStorey,
  giantSize,
  hallRuns,
  hangHallStoreys,
  hangSheerWalls,
  stretchMiddle,
} from "./giants";
import {
  axisBay,
  buildGrandStair,
  type GrandStair,
  type GrandStairDesign,
  grandHallArrival,
  openingInWorld,
  sheerSide,
  sheerStripDepth,
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
import {
  computeRoomRuns,
  distributePaintings,
  runLength,
  type SizedWork,
  wallFootprint,
} from "./place-paintings";
import { texturePxPerMetre } from "./sharpness";
import type {
  Bench,
  CellRect,
  Door,
  FloorLayout,
  MuseumLayout,
  RoomLayout,
  Staircase,
} from "./types";
import {
  CELL_SIZE,
  floorY,
  INTER_FLOOR_HEIGHT,
  PORTAL_HEIGHT,
  PORTAL_WIDTH,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

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

/** Floor between a bench and the nearest freestanding wall. */
const ISLAND_CLEARANCE = 2.2;
/** Floor between a bench and the nearest wall of its room. The end bay
 *  of a long gallery cut by wing walls is 7.5 m: a bench in the middle
 *  of it would stand 2.75 m off the end wall, in the way of its works. */
const BENCH_WALL_FLOOR = 4;

// Rows and columns, in cells, both ends inclusive. Every band is an odd
// number of cells, which puts the middle of a shared wall in the middle
// of a cell: the collision grid needs a door there.
const ROW_N = [0, 6] as const;
const ROW_M = [7, 17] as const;
const ROW_S = [18, 24] as const;

const span = (xMin: number, xMax: number, row: readonly [number, number]): CellRect => ({
  xMin,
  xMax,
  zMin: row[0],
  zMax: row[1],
});

type RoomKey = string;
type Side = Door["side"];
/** The rooms that hang an era's works: four long galleries, and the two
 *  galleries of the spine. */
export const BLOCK_ROOMS: ReadonlyArray<{ key: RoomKey; rect: CellRect }> = [
  { key: "nw", rect: span(0, 18, ROW_N) },
  { key: "ne", rect: span(28, 46, ROW_N) },
  { key: "cw", rect: span(11, 17, ROW_M) },
  { key: "ce", rect: span(29, 35, ROW_M) },
  { key: "sw", rect: span(0, 18, ROW_S) },
  { key: "se", rect: span(28, 46, ROW_S) },
];
/** The two spiral stairs, north and south of the court, through every
 *  floor. `door` is the wall the court is behind: a spiral's first step
 *  faces it. */
export const BLOCK_SPIRALS: ReadonlyArray<{ key: RoomKey; rect: CellRect; door: Side }> = [
  { key: "stair-n", rect: span(19, 27, ROW_N), door: "south" },
  { key: "stair-s", rect: span(19, 27, ROW_S), door: "north" },
];
/**
 * The halls of the spine, open from the first floor to the roof.
 *
 * The two at the ends are stair halls: a loggia, the grand stair on
 * every storey. Each faces the portal of the spine (`hallFront`), has a
 * door in each side wall (`HALL_SIDE_DOOR`), and has the building's end
 * wall behind its landings: that wall and the two beside it stand sheer
 * for 24 m (`RoomLayout.sheer`).
 *
 * The court in the middle has no stair, and a door in every wall.
 */
export const BLOCK_HALLS: ReadonlyArray<{
  key: RoomKey;
  rect: CellRect;
  design: Extract<GrandStairDesign, "loggia" | "court">;
  turns: GrandStair["turns"];
}> = [
  { key: "hall-w", rect: span(0, 10, ROW_M), design: "loggia", turns: 3 },
  { key: "court", rect: span(18, 28, ROW_M), design: "court", turns: 0 },
  { key: "hall-e", rect: span(36, 46, ROW_M), design: "loggia", turns: 1 },
];
/** The era whose colours every storey of every hall and stair tower
 *  takes: the pale stone of the first floor's first rooms. A hall is one
 *  room four storeys high, and a work on its sheer wall crosses two. */
const HALL_PALETTE: EraId = "gothic";
/** Where a visit starts, and where a visitor sent to a floor lands. */
export const GREAT_HALL: RoomKey = "court";

/** The wall of a hall its stair's foot faces: a design is drawn with the
 *  visitor coming in from the south, and turned a quarter at a time. */
const FRONTS: readonly Side[] = ["south", "west", "north", "east"];
export function hallFront(hall: { turns: GrandStair["turns"] }): Side {
  return FRONTS[hall.turns];
}

/** A stair hall's side doors, metres in from its front wall. Each opens
 *  from the gallery beside the stair into the long gallery behind the
 *  side wall, on every floor, by the foot of the side flight. Rico, 17
 *  October 2026, of the bare wall between Liberty and the balustrade
 *  over the void: "here should be a door for the stair ways". The door
 *  also cuts the stretch a giant hangs in from 15 m to 10 m: one work in
 *  the middle of 15 m read as a work on an empty wall. A cell's middle,
 *  so the grid opens there. */
export const HALL_SIDE_DOOR = 11.25;

/** Doors a portal wide: the spine from end to end, and the short axis
 *  from one spiral through the court to the other. */
const PORTALS: ReadonlyArray<readonly [RoomKey, RoomKey]> = [
  ["hall-w", "cw"],
  ["cw", "court"],
  ["court", "ce"],
  ["ce", "hall-e"],
  ["stair-n", "court"],
  ["court", "stair-s"],
];
/** Cells of wall two rooms have to share for a door between them. A
 *  long gallery meets the court at one cell, in the court's corner. */
const MIN_SHARED_CELLS = 3;

type Zone = { era: EraId; cells: readonly RoomKey[]; coverage?: number };
type FloorPlan = {
  title: string;
  /** Eras in the order they are walked, each with the rooms it hangs
   *  in, in the order of the walk: out of the court to the west, round
   *  the block by the north, and back by the south-east. An era's rooms
   *  touch, or stand either side of a stair tower. */
  zones: readonly Zone[];
  /** How a room's freestanding walls are set out (`DividerStyle`). A
   *  room not named takes rows of panels in a gallery of the spine and
   *  bays in a long gallery. No two rooms that share a door are divided
   *  the same way. */
  styles: Readonly<Record<RoomKey, DividerStyle>>;
  /** Door screens: in the first room, in front of its door to the
   *  second. Never both sides of one door, and never a portal. */
  screens: ReadonlyArray<readonly [RoomKey, RoomKey]>;
};
/** What hangs on each floor and where. The two collections that stand
 *  beside the timeline share the top floor. */
export const BLOCK_PLAN: readonly FloorPlan[] = [
  {
    title: "Gothic to Baroque",
    styles: {
      sw: "long-rows",
      cw: "bays",
      ne: "bays",
      ce: "long-rows",
      se: "staggered",
    },
    screens: [
      ["sw", "stair-s"],
      ["nw", "cw"],
      ["ce", "se"],
    ],
    zones: [
      // One long gallery. The era has 69 works that are sharp enough to
      // hang: in three rooms they covered a third of the wall and read
      // as a collection with works missing.
      { era: "gothic", cells: ["sw"] },
      { era: "renaissance", cells: ["cw", "nw"] },
      { era: "baroque", cells: ["ne", "ce", "se"] },
    ],
  },
  {
    title: "Rococo to Realism",
    styles: {
      sw: "bays",
      nw: "long-rows",
      ce: "staggered",
      se: "long-rows",
    },
    screens: [
      ["ne", "stair-n"],
      ["cw", "sw"],
      ["se", "ce"],
    ],
    zones: [
      { era: "enlightenment", cells: ["sw", "cw"] },
      { era: "romantic", cells: ["nw", "ne"] },
      { era: "realism", cells: ["ce", "se"] },
    ],
  },
  {
    title: "Impressionism to Modernism",
    styles: {
      cw: "bays",
      nw: "long-rows",
      ne: "long-rows",
      ce: "staggered",
    },
    screens: [
      ["nw", "stair-n"],
      ["sw", "cw"],
      ["ce", "ne"],
    ],
    zones: [
      { era: "fin-de-siecle", cells: ["sw", "cw", "nw"] },
      { era: "post-impressionism", cells: ["ne", "ce"] },
      { era: "modernism", cells: ["se"] },
    ],
  },
  {
    title: "Natural History and East Asia",
    styles: {
      sw: "long-rows",
      cw: "staggered",
      ne: "bays",
      ce: "long-rows",
      se: "long-rows",
    },
    screens: [
      ["se", "stair-s"],
      ["cw", "nw"],
      ["ne", "ce"],
    ],
    zones: [
      { era: "natural-history", cells: ["sw", "cw", "nw"], coverage: BLOCK_PRINT_COVERAGE },
      { era: "ukiyo-e", cells: ["ne", "ce", "se"], coverage: BLOCK_PRINT_COVERAGE },
    ],
  },
];

// --- Public entry ---------------------------------------------------------

export function layoutBlock(allArtworks: ArtworkListing[]): MuseumLayout {
  const byEra = bucketByEra(allArtworks);
  const built = BLOCK_PLAN.map((plan, index) => buildFloor(index, plan));
  const floors = built.map((b) => b.floor);
  const top = floors.length - 1;

  // A hall is one room through every storey. A loggia has a stair from
  // each floor to the next, and each stair's opening is the hole in the
  // floor it arrives on. The court has one opening, in every floor over
  // the first.
  const grandStairs: GrandStair[] = [];
  for (const hall of BLOCK_HALLS) {
    const stairs =
      hall.design === "court"
        ? [buildStair(floors[0], floors[1], hall, top, false, false)]
        : floors
            .slice(0, top)
            .map((lower, i) => buildStair(lower, floors[i + 1], hall, i + 1, i > 0, i + 1 < top));
    for (const stair of stairs) {
      floors[stair.lowerFloor].grandStairsOut!.push(stair);
      floors[stair.upperFloor].grandStairsIn!.push(stair);
      for (let f = stair.lowerFloor; f <= stair.topFloor; f++) floors[f].grandHalls!.push(stair);
      grandStairs.push(stair);
    }
    const court = hall.design === "court";
    for (let f = 0; f <= top; f++) {
      const room = hallRoom(floors[f], hall.key);
      // The stair whose opening is in this floor, and the one whose
      // opening is in the ceiling: the floor above's.
      const below = court ? stairs[0] : stairs[f - 1];
      const above = court ? stairs[0] : stairs[f];
      room.floorOpening = f > 0 ? openingInWorld(below) : null;
      room.ceilingOpening = f < top ? openingInWorld(above) : null;
      room.stairGlyph = court ? "void" : f === 0 ? "up" : f === top ? "down" : "both";
      const stair = stairs[0];
      if (stair.sheerWall) {
        room.sheer = {
          side: sheerSide(stair),
          depth: sheerStripDepth(stair),
          base: floors[0].y,
          roof: floors[top].y + INTER_FLOOR_HEIGHT,
        };
      }
    }
  }

  const allStaircases: Staircase[] = [];
  for (let i = 0; i < top; i++) {
    for (const shaft of BLOCK_SPIRALS) {
      const stair = buildSpiral(floors[i], floors[i + 1], shaft);
      floors[i].stairsOut.push(stair);
      floors[i + 1].stairsIn.push(stair);
      allStaircases.push(stair);
    }
  }

  // The giants go to the halls first; each era then hangs what is left.
  const inHalls = hangGiants(floors, byEra, grandStairs);
  const forRooms = new Map(
    [...byEra].map(([era, works]) => [era, works.filter((a) => !inHalls.has(a.id))]),
  );
  for (const b of built) b.hang(forRooms);

  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const layout: MuseumLayout = {
    floors,
    entry: { floorIndex: 0, worldPosition: [0, anchor.worldRect.y, 0] },
    allRooms: floors.flatMap((f) => f.rooms),
    allHallways: [],
    allStaircases,
    grandStairs,
  };
  const arrival = blockArrivalPoint(layout, anchor);
  layout.entry.worldPosition = [arrival.x, anchor.worldRect.y, arrival.z];
  return layout;
}

const hallKey = (room: RoomLayout) => room.id.replace(/^f\d+-/, "");
const hallRoom = (floor: FloorLayout, key: RoomKey) =>
  floor.rooms.find((r) => r.isStairwell && hallKey(r) === key)!;

/**
 * Hang the works too large for a room in the halls, at their real size
 * (`giants.ts`). The works taller than a storey and some of the others
 * go to the sheer walls of the two stair halls, which are composed
 * alike. Every other giant hangs on the floor of its era, one to a
 * stretch of wall, in the court and the two stair halls alike. Returns
 * the ids hung.
 */
function hangGiants(
  floors: FloorLayout[],
  byEra: Map<EraId, ArtworkListing[]>,
  grandStairs: GrandStair[],
): Set<string> {
  const tall: SizedWork[] = [];
  const others: Array<{ work: SizedWork; start: number }> = [];
  BLOCK_PLAN.forEach((plan, floorIndex) => {
    for (const zone of plan.zones) {
      for (const artwork of byEra.get(zone.era) ?? []) {
        const work = giantSize(artwork);
        if (!work) continue;
        if (!fitsStorey(work)) tall.push(work);
        else others.push({ work, start: floorIndex });
      }
    }
  });

  const storeysOf = (key: RoomKey) => floors.map((floor) => hallRoom(floor, key));
  const left = new Set(
    hangSheerWalls(
      BLOCK_HALLS.filter((h) => h.design === "loggia").map((h) => {
        // The piers stand in one place on every storey.
        const stair = grandStairs.find((s) => s.id.startsWith(`${h.key}-`));
        return { storeys: storeysOf(h.key), bay: stair ? axisBay(stair) : undefined };
      }),
      tall,
      others.map((o) => o.work),
    ).map((w) => w.artwork.id),
  );
  // The court is the middle of its floor: it takes a floor's giants
  // before the stair halls do.
  const rooms = (floor: FloorLayout, design: (typeof BLOCK_HALLS)[number]["design"]) =>
    BLOCK_HALLS.filter((h) => h.design === design).map((h) => hallRoom(floor, h.key));
  const unhung = new Set(
    hangHallStoreys(
      floors.map((floor) => [rooms(floor, "court"), rooms(floor, "loggia")]),
      others.filter((o) => left.has(o.work.artwork.id)),
    ),
  );
  // The spiral rooms take only what no hall's wall holds on any floor:
  // their outer wall, 22.5 m with no door, is the one wall left for a
  // handscroll 12 m long once the stair halls' side doors cut theirs.
  hangHallStoreys(
    floors.map((floor) => [BLOCK_SPIRALS.map((s) => hallRoom(floor, s.key))]),
    others.filter((o) => unhung.has(o.work)),
  );

  const halls = floors.flatMap((f) => f.rooms.filter((r) => r.isStairwell));
  for (const room of halls) room.artworks = room.placements.map((p) => p.artwork);
  return new Set(halls.flatMap((r) => r.artworks).map((a) => a.id));
}

/** Where a visitor sent to a room lands. A hall's centre is a flight or
 *  the open well, so there it is inside the door its stair faces: floor
 *  on every storey of the hall. */
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
): { floor: FloorLayout; hang: (byEra: Map<EraId, ArtworkListing[]>) => void } {
  // The floor as a whole answers to its first era: the id a saved visit
  // is filed under.
  const floorEra = getEra(plan.zones[0].era);

  // Which era each room shows, and the walk through them.
  const eraOfKey = new Map<RoomKey, Era>();
  for (const zone of plan.zones)
    for (const cell of zone.cells) eraOfKey.set(cell, getEra(zone.era));
  const route = plan.zones.flatMap((zone) => [...zone.cells]);

  const rooms: RoomLayout[] = [];
  const byKey = new Map<RoomKey, RoomLayout>();
  const add = (key: RoomKey, room: RoomLayout) => {
    rooms.push(room);
    byKey.set(key, room);
  };
  for (const { key, rect: r, design } of BLOCK_HALLS) {
    const court = design === "court";
    const room = makeRoom(index, key, r, floorEra, {
      title: court ? "Court" : "Stair hall",
      isStairwell: true,
      isAnchor: key === GREAT_HALL,
    });
    room.paletteEra = HALL_PALETTE;
    add(key, room);
  }
  for (const { key, rect: r } of BLOCK_SPIRALS) {
    const room = makeRoom(index, key, r, floorEra, { title: "Stairs", isStairwell: true });
    room.paletteEra = HALL_PALETTE;
    add(key, room);
  }
  for (const { key, rect: r } of BLOCK_ROOMS) {
    const era = eraOfKey.get(key) ?? floorEra;
    add(key, makeRoom(index, key, r, era, { title: era.title }));
  }

  // A door in the middle of every wall two rooms share, but for a stair
  // hall: on every floor the portal its stair faces, and a door in each
  // side wall by the foot of the side flight (`HALL_SIDE_DOOR`). The
  // back wall is the building's.
  const fronts = new Map<RoomKey, Side>(
    BLOCK_HALLS.filter((h) => h.design === "loggia").map((h) => [h.key, hallFront(h)]),
  );
  const sideDoorAt = (hall: RoomLayout, front: Side): number => {
    const r = hall.cellBounds;
    if (front === "east") return (r.xMax + 1) * CELL_SIZE - HALL_SIDE_DOOR;
    if (front === "west") return r.xMin * CELL_SIZE + HALL_SIDE_DOOR;
    if (front === "south") return (r.zMax + 1) * CELL_SIZE - HALL_SIDE_DOOR;
    return r.zMin * CELL_SIZE + HALL_SIDE_DOOR;
  };
  const keys = [...byKey.keys()];
  const isPortal = (a: RoomKey, b: RoomKey) =>
    PORTALS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = byKey.get(keys[i])!;
      const b = byKey.get(keys[j])!;
      const side = wallBetween(a.cellBounds, b.cellBounds);
      if (!side) continue;
      const aFront = fronts.get(keys[i]);
      const bFront = fronts.get(keys[j]);
      // A hall's back wall stands against no room, so a wall it shares
      // is its front or a side.
      let along: number | undefined;
      if (aFront && aFront !== side) along = sideDoorAt(a, aFront);
      if (bFront && bFront !== OPPOSITE[side]) along = sideDoorAt(b, bFront);
      const portal = isPortal(keys[i], keys[j]);
      connect(
        a,
        b,
        side,
        portal ? PORTAL_WIDTH : BLOCK_DOOR_WIDTH,
        portal ? PORTAL_HEIGHT : BLOCK_DOOR_HEIGHT,
        along,
      );
    }
  }

  // Dividers and benches need the doors.
  for (const { key } of BLOCK_ROOMS) {
    const room = byKey.get(key)!;
    const screens = plan.screens
      .filter(([cell]) => cell === key)
      .map(([, toward]) => byKey.get(toward)?.id)
      .flatMap((id) => room.doors.filter((d) => d.connectsTo.roomId === id));
    room.dividers = planDividers(room.cellBounds, room.doors, {
      style: plan.styles[key],
      screens,
    });
    // Benches keep further from a wall here than in the tower: a bay
    // bench a metre from a screen's picture is in the way of it.
    room.benches = planBenches(room.cellBounds, room.doors, room.dividers).filter((b) =>
      benchClearOf(b, room.dividers, ISLAND_CLEARANCE),
    );
    // A room with no walls but a door screen is seated on its own
    // lines: on its centre when there is no way straight through it, in
    // front of its one wall without a door when there is. `planBenches`
    // keeps clear of every door's line and so stands the island in one
    // quarter of it.
    const clear = (island: Bench[] | null) =>
      island?.every((b) => benchClearOf(b, room.dividers, ISLAND_CLEARANCE)) ? island : null;
    if (room.dividers.every((d) => d.bare)) {
      room.benches =
        clear(centredIsland(room.cellBounds, room.doors)) ??
        clear(wallIsland(room.cellBounds, room.doors)) ??
        room.benches;
    }
    // A room with panels is seated on the lines of its panels. All of
    // it before the hang, which puts a work in front of each bench.
    room.benches = [...room.benches, ...planPanelBenches(room)];
    // A room whose panels give no place, and that no one walks straight
    // through, takes the island on its centre when that stands clear.
    if (room.benches.length === 0) {
      room.benches = clear(centredIsland(room.cellBounds, room.doors)) ?? [];
    }
    const { xMin, xMax, zMin, zMax } = room.cellBounds;
    room.benches = room.benches.filter((bench) => {
      const r = benchRect(bench);
      const floor = Math.min(
        r.xMin - xMin * CELL_SIZE,
        (xMax + 1) * CELL_SIZE - r.xMax,
        r.zMin - zMin * CELL_SIZE,
        (zMax + 1) * CELL_SIZE - r.zMax,
      );
      return floor >= BENCH_WALL_FLOOR - 1e-9;
    });
  }

  // The court's floor is seated in front of its north and south walls,
  // where the floor's largest giants hang, one to a stretch. Its floors
  // above are a gallery 5 m wide: no seat.
  if (index === 0) {
    const court = byKey.get(GREAT_HALL)!;
    const middles = hallRuns(court)
      .filter((run) => run.side === "north")
      .map(stretchMiddle);
    court.benches = courtIslands(court.cellBounds, middles);
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

  const hang = (byEra: Map<EraId, ArtworkListing[]>) => {
    for (const zone of plan.zones) {
      hangZone(
        floor,
        zone.cells.map((k) => byKey.get(k)!),
        getEra(zone.era),
        byEra.get(zone.era) ?? [],
        zone.coverage ?? BLOCK_WALL_COVERAGE,
      );
    }

    let roomNumber = 0;
    for (const key of route) {
      const room = byKey.get(key)!;
      const era = eraOfKey.get(key) ?? floorEra;
      room.artworks = room.placements.map((p) => p.artwork);
      room.roomNumber = ++roomNumber;
      room.movement = dominantMovement(room.artworks, era) ?? era.title;
      room.title = room.movement;
      room.description = describeRoom(room.title, room.artworks);
    }
  };
  return { floor, hang };
}

/** Hang one era in its rooms. Works with the sharpest scans come first:
 *  an artist's share of the wall goes to their best-scanned works. */
function hangZone(
  floor: FloorLayout,
  zoneRooms: RoomLayout[],
  era: Era,
  candidates: ArtworkListing[],
  coverage: number,
) {
  const wallOf = (room: RoomLayout) =>
    computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
  const walls = zoneRooms.map(wallOf);
  const budget = walls.reduce((a, b) => a + b, 0) * coverage;

  const metres = (works: ArtworkListing[]) => works.reduce((sum, a) => sum + wallFootprint(a), 0);
  const sample = (count: number) =>
    selectFloorWorks(candidates, count, (a) => texturePxPerMetre(a) ?? 0);
  // The sample is by count and the wall is in metres. An artist's
  // sharpest scans are their smaller works, so a count from the era's
  // mean footprint covered 0.38 of two eras' wall where 0.45 was asked.
  // Take more until the sample covers the wall.
  let count = Math.floor(
    budget / Math.max(0.5, metres(candidates) / Math.max(1, candidates.length)),
  );
  let chosen = sample(count);
  while (chosen.length < candidates.length && metres(chosen) < budget) {
    count = Math.min(candidates.length, Math.ceil(count * 1.1) + 1);
    chosen = sample(count);
  }
  // Then trim to the wall it has to fit.
  chosen = shuffleByIdHash(chosen);
  let used = 0;
  chosen = chosen.filter((a) => {
    const need = wallFootprint(a);
    if (used + need > budget) return false;
    used += need;
    return true;
  });

  const queue = [...groupMovements(era, chosen).entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, artworks]) => ({ name, artworks }));
  const fills = fillRooms(walls, queue, era);
  zoneRooms.forEach((room, i) => {
    room.artworks = fills[i].artworks;
  });

  // Spill stays inside the era: the placer sees only its rooms.
  const stats = distributePaintings({ ...floor, rooms: zoneRooms }, undefined, {
    anchorToBenches: true,
  });
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
 *  two share no wall long enough for a door. */
function wallBetween(a: CellRect, b: CellRect): Side | null {
  const shared = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    Math.min(aMax, bMax) - Math.max(aMin, bMin) + 1 >= MIN_SHARED_CELLS;
  const zOverlap = shared(a.zMin, a.zMax, b.zMin, b.zMax);
  const xOverlap = shared(a.xMin, a.xMax, b.xMin, b.xMax);
  if (zOverlap && a.xMax + 1 === b.xMin) return "east";
  if (zOverlap && b.xMax + 1 === a.xMin) return "west";
  if (xOverlap && a.zMax + 1 === b.zMin) return "south";
  if (xOverlap && b.zMax + 1 === a.zMin) return "north";
  return null;
}

const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

/** A door between two rooms that share a wall, at `along` (world metres
 *  along the wall) or in the middle of the stretch they share. `side` is
 *  the side of `a` that `b` is on. */
function connect(
  a: RoomLayout,
  b: RoomLayout,
  side: Side,
  width: number,
  height: number,
  along?: number,
) {
  const ra = a.cellBounds;
  const rb = b.cellBounds;
  let worldX: number;
  let worldZ: number;
  const mid = (lo: number, hi: number) => along ?? (Math.floor((lo + hi) / 2) + 0.5) * CELL_SIZE;
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
  hasFlightBelow: boolean,
  hasFlightAbove: boolean,
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
    hasFlightBelow,
    hasFlightAbove,
  });
}

/** One revolution of the tower's spiral, from one floor to the next. */
function buildSpiral(
  lower: FloorLayout,
  upper: FloorLayout,
  shaft: (typeof BLOCK_SPIRALS)[number],
): Staircase {
  const r = shaft.rect;
  // `atan2(dz, dx)` of the wall the court is behind.
  const toward: Record<Side, number> = {
    east: 0,
    south: Math.PI / 2,
    west: Math.PI,
    north: -Math.PI / 2,
  };
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
    entryAngle: toward[shaft.door],
  };
}
