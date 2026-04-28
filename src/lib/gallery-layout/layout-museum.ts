// Handcrafted museum floor plan — replaces the procedural dungeon
// generator with an axis-aligned, courtyard-style composition built
// around the central spiral staircase.
//
//   N ↑                                       (z increases north)
//   ┌─────────────────────────────────────────────┐
//   │  [n_west_corner] [GRAND HALL] [n_east_corner]│   z=28..44
//   ├──────────┐                       ┌──────────┤
//   │          │       SPIRAL          │          │
//   │ [west]   │      (21..27)         │ [east]   │   z=21..27
//   │          │                       │          │
//   ├──────────┘                       └──────────┤
//   │  [s_west_corner] [s_main]   [s_east_corner] │   z=3..20
//   └─────────────────────────────────────────────┘
//   x=0                                         x=48
//
// Every floor reserves the same 7×7-cell stair footprint at the grid
// centre, so the spiral towers stack vertically across all floors.
// All other rooms are axis-aligned rectangles. Neighbouring rooms
// share walls; one room owns the shared wall (drawing it with a door
// cut), the other suppresses its copy of that wall to avoid
// z-fighting. This gives the classic "enfilade" feel — three or four
// rooms visible through a single line of doorways.
//
// Per-floor room count adapts to the era's size — quiet eras get a
// compact 3-room plan, sprawling ones fill all 8 slot rooms.

import type { Artwork } from "@/lib/data";
import { assignEra, ERAS, type Era, type EraId, roomFloorColor } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { distributePaintings } from "./place-paintings";
import type {
  Door,
  DungeonLayout,
  FloorLayout,
  HallwayLayout,
  RoomLayout,
  Staircase,
} from "./types";
import {
  CELL_SIZE,
  DOOR_WIDTH,
  floorY,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_ROOM_CELLS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

// --- Floor plan geometry (cell coordinates, inclusive) --------------------

const GRID_SIZE = 48;
const STAIR_LABEL = "Stairwell";

type CellRect = { xMin: number; xMax: number; zMin: number; zMax: number };

// Stairwell sits dead centre. Its size scales with SPIRAL_ROOM_CELLS
// (currently 9), so all slot rectangles below derive their bounds from
// STAIR_MIN/STAIR_MAX rather than hardcoding cell numbers.
const STAIR_MIN = Math.floor(GRID_SIZE / 2 - (SPIRAL_ROOM_CELLS - 1) / 2);
const STAIR_MAX = STAIR_MIN + SPIRAL_ROOM_CELLS - 1;
const STAIR: CellRect = {
  xMin: STAIR_MIN,
  xMax: STAIR_MAX,
  zMin: STAIR_MIN,
  zMax: STAIR_MAX,
};

/** Depth of the rooms in the inner ring (Grand Hall, s_main, etc.). */
const RING_DEPTH = 6;

// Grand Hall (anchor) sits directly south of the stairwell (high z, in
// cardinal terms south = high z). Its x range matches the stair so the
// shared wall is a single contiguous span and the door at its centre
// lines up on the player's natural walking line.
const GRAND_HALL: CellRect = {
  xMin: STAIR_MIN,
  xMax: STAIR_MAX,
  zMin: STAIR_MAX + 1,
  zMax: STAIR_MAX + RING_DEPTH,
};

// Slot room rectangles, ordered by priority (most-central first). A
// floor is populated by filling slots in order, so eras with fewer
// movements use a subset and the layout compacts gracefully.
//
// Each slot declares which of its own walls is drawn by a neighbour
// (via `suppress`); the corresponding owner-side door is wired up in
// `wireDoors` below.

type SlotId =
  | "s_main"
  | "n_west"
  | "n_east"
  | "s_west"
  | "s_east"
  | "west"
  | "east"
  | "n_outer"
  | "s_outer"
  | "n_west_outer"
  | "n_east_outer"
  | "s_west_outer"
  | "s_east_outer";

type Slot = {
  id: SlotId;
  rect: CellRect;
  /** Walls suppressed because a neighbour owns/draws them. */
  suppress: Array<"north" | "south" | "east" | "west">;
};

// Layout: tight ring of 6×6-cell rooms around the spiral, plus a
// second outer ring for sprawling eras. Rooms cap around 263 m² (a
// 7×6 cell room — 17.5 m × 15 m); typical rooms are 6×6 (15 × 15 m,
// 225 m²). The Grand Hall sits north of the spiral; its mirror
// `s_main` is south. Other slots fan outward in priority order.
//
// The spiral connects only via N (Grand Hall) and S (s_main) walls —
// no doors on the E/W of the stair, so reaching the W/E galleries
// requires walking around through the corner rooms (enfilade). This
// makes the central column less visually dominant from any one
// vantage.

// Cardinal-direction convention used everywhere in this file matches
// the rest of the codebase:
//   north = low z   south = high z   west = low x   east = high x
// The spatial labels in the slot ids ("s_main" = the room geometrically
// south of the spiral) describe the room's position in the diagram at
// the top of this file (where +z visually points "down" in the layout
// sketch); they may not match the cardinal-side semantics — pay
// attention to `suppress` for the wall-side bookkeeping.

// All slot rectangles are derived from the stair's cell bounds + the
// ring depth so they shift in lockstep when SPIRAL_ROOM_CELLS changes.
const RING_X_WEST: { xMin: number; xMax: number } = {
  xMin: STAIR_MIN - RING_DEPTH,
  xMax: STAIR_MIN - 1,
};
const RING_X_EAST: { xMin: number; xMax: number } = {
  xMin: STAIR_MAX + 1,
  xMax: STAIR_MAX + RING_DEPTH,
};
const RING_Z_S: { zMin: number; zMax: number } = {
  zMin: STAIR_MIN - RING_DEPTH,
  zMax: STAIR_MIN - 1,
};
const RING_Z_N: { zMin: number; zMax: number } = {
  zMin: STAIR_MAX + 1,
  zMax: STAIR_MAX + RING_DEPTH,
};
const OUTER_Z_S: { zMin: number; zMax: number } = {
  zMin: STAIR_MIN - 2 * RING_DEPTH,
  zMax: STAIR_MIN - RING_DEPTH - 1,
};
const OUTER_Z_N: { zMin: number; zMax: number } = {
  zMin: STAIR_MAX + RING_DEPTH + 1,
  zMax: STAIR_MAX + 2 * RING_DEPTH,
};

const SLOTS: Slot[] = [
  // Mirror of Grand Hall, north of the spiral (low z = north). Stair
  // owns the shared wall.
  {
    id: "s_main",
    rect: { xMin: STAIR_MIN, xMax: STAIR_MAX, ...RING_Z_S },
    suppress: ["south"], // stair's north wall owns
  },
  // Inner-ring corner pair flanking the Grand Hall (high z side).
  {
    id: "n_west",
    rect: { ...RING_X_WEST, ...RING_Z_N },
    suppress: ["east"], // Grand Hall's west wall owns
  },
  {
    id: "n_east",
    rect: { ...RING_X_EAST, ...RING_Z_N },
    suppress: ["west"], // Grand Hall's east wall owns
  },
  // Inner-ring corner pair flanking s_main (low z side).
  {
    id: "s_west",
    rect: { ...RING_X_WEST, ...RING_Z_S },
    suppress: ["east"], // s_main's west wall owns
  },
  {
    id: "s_east",
    rect: { ...RING_X_EAST, ...RING_Z_S },
    suppress: ["west"], // s_main's east wall owns
  },
  // West / east galleries flanking the spiral. Reached only through
  // the corner rooms — the stair's E/W walls have no doors so the
  // central well doesn't show through every doorway.
  {
    id: "west",
    rect: { ...RING_X_WEST, zMin: STAIR_MIN, zMax: STAIR_MAX },
    suppress: [],
  },
  {
    id: "east",
    rect: { ...RING_X_EAST, zMin: STAIR_MIN, zMax: STAIR_MAX },
    suppress: [],
  },
  // Outer rooms behind Grand Hall (south cardinal — even higher z).
  {
    id: "n_outer",
    rect: { xMin: STAIR_MIN, xMax: STAIR_MAX, ...OUTER_Z_N },
    suppress: ["north"], // Grand Hall's south wall owns
  },
  // Outer rooms behind s_main (north cardinal — even lower z).
  {
    id: "s_outer",
    rect: { xMin: STAIR_MIN, xMax: STAIR_MAX, ...OUTER_Z_S },
    suppress: ["south"], // s_main's north wall owns
  },
  // Outer corners — behind the inner corner rooms.
  {
    id: "n_west_outer",
    rect: { ...RING_X_WEST, ...OUTER_Z_N },
    suppress: ["north"], // n_west's south wall owns
  },
  {
    id: "n_east_outer",
    rect: { ...RING_X_EAST, ...OUTER_Z_N },
    suppress: ["north"],
  },
  {
    id: "s_west_outer",
    rect: { ...RING_X_WEST, ...OUTER_Z_S },
    suppress: ["south"], // s_west's north wall owns
  },
  {
    id: "s_east_outer",
    rect: { ...RING_X_EAST, ...OUTER_Z_S },
    suppress: ["south"],
  },
];

// --- Public entry ---------------------------------------------------------

export function layoutMuseum(allArtworks: Artwork[]): DungeonLayout {
  const byEra = bucketByEra(allArtworks);

  const floors: FloorLayout[] = [];
  const allRooms: RoomLayout[] = [];
  const allHallways: HallwayLayout[] = [];
  const allStaircases: Staircase[] = [];

  for (const era of ERAS) {
    const eraArtworks = byEra.get(era.id) ?? [];
    const floor = buildFloor(era, eraArtworks);
    floors.push(floor);
    allRooms.push(...floor.rooms);
    allHallways.push(...floor.hallways);
  }

  for (let i = 0; i < floors.length - 1; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];
    const staircase = buildStaircase(lower, upper);
    if (staircase) {
      lower.stairsOut.push(staircase);
      upper.stairsIn.push(staircase);
      allStaircases.push(staircase);
    }
  }

  // Entry point: ground floor, centre of the Grand Hall (or grid centre
  // if the hall somehow didn't materialise).
  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const entryWorld: [number, number, number] = anchor
    ? [
        (anchor.worldRect.xMin + anchor.worldRect.xMax) / 2,
        anchor.worldRect.y,
        (anchor.worldRect.zMin + anchor.worldRect.zMax) / 2,
      ]
    : [(GRID_SIZE * CELL_SIZE) / 2, floorY(0), (GRID_SIZE * CELL_SIZE) / 2];

  return {
    floors,
    entry: { floorIndex: 0, worldPosition: entryWorld },
    allRooms,
    allHallways,
    allStaircases,
  };
}

// --- Era bucketing --------------------------------------------------------

function bucketByEra(all: Artwork[]): Map<EraId, Artwork[]> {
  const m = new Map<EraId, Artwork[]>();
  for (const era of ERAS) m.set(era.id, []);

  for (const a of all) {
    if (a.folder !== "collection-of-beauty") continue;
    if (!a.objectKey) continue;
    if (a.year == null) continue;
    if (!a.realDimensions) continue;
    const { widthCm, heightCm } = a.realDimensions;
    if (widthCm < 15 || widthCm > 450) continue;
    if (heightCm < 15 || heightCm > 450) continue;
    const era = assignEra(a);
    if (!era) continue;
    m.get(era)!.push(a);
  }

  return m;
}

// --- Per-floor layout -----------------------------------------------------

function buildFloor(era: Era, eraArtworks: Artwork[]): FloorLayout {
  const byMovement = groupMovements(era, eraArtworks);
  const anchorMovement = resolveAnchorMovement(era, byMovement);

  // ~45 works per room is roomy enough that paintings have breathing
  // space on the walls but not so sparse that the space reads as empty.
  const PER_ROOM_TARGET = 45;
  const targetRooms = Math.max(1, Math.ceil(eraArtworks.length / PER_ROOM_TARGET));
  const totalSlots = Math.min(Math.max(0, targetRooms - 1), SLOTS.length);

  // Expand movements into room-sized chunks (anchor first, then East
  // Asian movements right after — they belong to a different art-
  // history tradition than European Renaissance/Baroque/etc, so they
  // earn a dedicated room rather than being lumped in with whatever
  // European overflow exists. Then by popularity for the rest.
  const expanded: Array<{ name: string; artworks: Artwork[] }> = [];
  const orderedMovements = Array.from(byMovement.entries()).sort((a, b) => {
    if (a[0] === anchorMovement) return -1;
    if (b[0] === anchorMovement) return 1;
    const aAsian = isEastAsianMovement(a[0]);
    const bAsian = isEastAsianMovement(b[0]);
    if (aAsian && !bAsian) return -1;
    if (!aAsian && bAsian) return 1;
    return b[1].length - a[1].length;
  });
  for (const [name, arr] of orderedMovements) {
    const numParts = Math.max(1, Math.ceil(arr.length / PER_ROOM_TARGET));
    const chunkSize = Math.ceil(arr.length / numParts);
    for (let p = 0; p < numParts; p++) {
      const chunk = arr.slice(p * chunkSize, (p + 1) * chunkSize);
      const label = numParts > 1 ? `${name} · Part ${p + 1}` : name;
      expanded.push({ name: label, artworks: chunk });
    }
  }

  const grandHallEntryIdx = expanded.findIndex(
    (e) => e.name === anchorMovement || e.name.startsWith(`${anchorMovement} · Part `),
  );
  const grandHallEntry =
    grandHallEntryIdx >= 0
      ? expanded.splice(grandHallEntryIdx, 1)[0]
      : { name: anchorMovement, artworks: [] };
  const grandHallArtworks = grandHallEntry.artworks;

  const slotEntries: Array<{ name: string; artworks: Artwork[] }> = [];
  if (totalSlots === 0) {
    grandHallArtworks.push(...expanded.flatMap((e) => e.artworks));
  } else {
    const kept = expanded.slice(0, totalSlots - 1);
    const tail = expanded.slice(totalSlots - 1);
    slotEntries.push(...kept);
    if (tail.length > 0) {
      // East Asian entries that fell into the tail keep their own
      // rooms — never let them get rolled into a generic "Also from
      // the renaissance" catch-all. They displace lower-priority
      // European entries from `kept` if the slot count is tight.
      const tailAsian = tail.filter((e) => isEastAsianMovement(e.name));
      const tailRest = tail.filter((e) => !isEastAsianMovement(e.name));
      slotEntries.push(...tailAsian);
      if (tailRest.length > 0) {
        const mergedArtworks = tailRest.flatMap((e) => e.artworks);
        const mergedName =
          tailRest.length === 1 ? tailRest[0].name : `Also from the ${era.title.toLowerCase()}`;
        slotEntries.push({ name: mergedName, artworks: mergedArtworks });
      }
    }
  }

  // Build all rooms.
  const rooms: RoomLayout[] = [];

  // 1. Grand Hall (anchor).
  rooms.push(
    buildRoom({
      era,
      id: `${era.id}-grand-hall`,
      rect: GRAND_HALL,
      movement: grandHallEntry.name,
      artworks: grandHallArtworks,
      isAnchor: true,
      isStairwell: false,
    }),
  );

  // 2. Slot rooms.
  const slotRooms: Array<{ slot: Slot; room: RoomLayout }> = [];
  for (let i = 0; i < totalSlots; i++) {
    const slot = SLOTS[i];
    const entry = slotEntries[i];
    const movement = entry ? entry.name : era.title;
    const artworks = entry ? entry.artworks : [];
    const suppressWalls: NonNullable<RoomLayout["suppressWalls"]> = {};
    for (const side of slot.suppress) suppressWalls[side] = true;
    const room = buildRoom({
      era,
      id: `${era.id}-${slot.id}`,
      rect: slot.rect,
      movement,
      artworks,
      isAnchor: false,
      isStairwell: false,
      suppressWalls,
    });
    rooms.push(room);
    slotRooms.push({ slot, room });
  }

  // 3. Stairwell — owns its 4 walls and connects via cardinal doors to
  //    Grand Hall (north) and any active slot rooms (south, west, east).
  rooms.push(
    buildRoom({
      era,
      id: `${era.id}-stairwell`,
      rect: STAIR,
      movement: STAIR_LABEL,
      artworks: [],
      isAnchor: false,
      isStairwell: true,
    }),
  );

  // No hallways — every connection is a shared wall with a door.
  const hallways: HallwayLayout[] = [];

  // Wire doors between rooms.
  wireDoors(rooms);
  void slotRooms;

  // Walkable + cellOwner masks.
  const walkable = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const cellOwner = new Int16Array(GRID_SIZE * GRID_SIZE);
  cellOwner.fill(-1);

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    for (let x = r.cellBounds.xMin; x <= r.cellBounds.xMax; x++) {
      for (let z = r.cellBounds.zMin; z <= r.cellBounds.zMax; z++) {
        walkable[z * GRID_SIZE + x] = 1;
        cellOwner[z * GRID_SIZE + x] = i;
      }
    }
  }

  const { blockedEdgesEW, blockedEdgesNS } = computeBlockedEdges(GRID_SIZE, rooms, cellOwner);

  const floor: FloorLayout = {
    index: era.index,
    era,
    y: floorY(era.index),
    gridSize: { x: GRID_SIZE, z: GRID_SIZE },
    walkable,
    cellOwner,
    blockedEdgesEW,
    blockedEdgesNS,
    rooms,
    hallways,
    stairsIn: [],
    stairsOut: [],
  };

  distributePaintings(floor, eraArtworks);

  return floor;
}

// --- Helpers --------------------------------------------------------------

function groupMovements(era: Era, eraArtworks: Artwork[]): Map<string, Artwork[]> {
  const byMovement = new Map<string, Artwork[]>();
  for (const a of eraArtworks) {
    const key = a.movement?.trim() ? a.movement : era.title;
    if (!byMovement.has(key)) byMovement.set(key, []);
    byMovement.get(key)!.push(a);
  }
  return byMovement;
}

/**
 * Heuristic — true if the movement name describes an East Asian
 * tradition (Japanese woodblock prints, Nihonga, etc.) rather than a
 * European school. These works earn their own dedicated room because
 * they belong to an entirely different art-history lineage than the
 * European Renaissance / Baroque / Romantic eras they happen to be
 * year-binned with.
 */
function isEastAsianMovement(name: string): boolean {
  return /Ukiyo-e|Nihonga|Bijinga|Yamato-e|Sumi-e|Edo|Heian|Song|Ming|Qing|Tang/i.test(name);
}

function resolveAnchorMovement(era: Era, byMovement: Map<string, Artwork[]>): string {
  const configured = era.anchor.movement;
  if ((byMovement.get(configured)?.length ?? 0) > 0) return configured;
  const biggest = Array.from(byMovement.entries()).sort((a, b) => b[1].length - a[1].length)[0];
  return biggest ? biggest[0] : era.title;
}

function buildRoom(opts: {
  era: Era;
  id: string;
  rect: CellRect;
  movement: string;
  artworks: Artwork[];
  isAnchor: boolean;
  isStairwell: boolean;
  suppressWalls?: RoomLayout["suppressWalls"];
}): RoomLayout {
  const { era, rect } = opts;
  const id = slugify(opts.id) || opts.id;
  return {
    id,
    floorIndex: era.index,
    movement: opts.movement,
    title: opts.movement,
    description: describeRoom(opts.movement, opts.artworks),
    isAnchor: opts.isAnchor,
    isStairwell: opts.isStairwell,
    cellBounds: { ...rect },
    worldRect: {
      xMin: rect.xMin * CELL_SIZE + WALL_THICKNESS,
      xMax: (rect.xMax + 1) * CELL_SIZE - WALL_THICKNESS,
      zMin: rect.zMin * CELL_SIZE + WALL_THICKNESS,
      zMax: (rect.zMax + 1) * CELL_SIZE - WALL_THICKNESS,
      y: floorY(era.index),
    },
    doors: [],
    hasBench: opts.isAnchor,
    placements: [],
    artworks: opts.artworks,
    floorColor: roomFloorColor(era, id),
    suppressWalls: opts.suppressWalls,
  };
}

/**
 * Wire doors between rooms based on shared walls. For every pair of
 * rooms whose rectangles touch on a single edge, we add a reciprocal
 * door at the centre of the shared edge — except where one of the
 * pair is the stairwell on its E/W faces (those stay solid so the
 * spiral central column doesn't show through every doorway).
 *
 * The owner of a shared wall is whichever room does NOT suppress that
 * side; the suppressor draws no wall there but still gets a door so
 * painting placement skips the overlap.
 */
function wireDoors(rooms: RoomLayout[]) {
  const stairwell = rooms.find((r) => r.isStairwell);

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const adj = adjacency(a.cellBounds, b.cellBounds);
      if (!adj) continue;

      // Skip stairwell E/W doors so the central column stays out of
      // sight from corridor entrances.
      if (
        stairwell &&
        (a.id === stairwell.id || b.id === stairwell.id) &&
        (adj.aSide === "east" || adj.aSide === "west")
      ) {
        continue;
      }

      const { worldX, worldZ, aSide, bSide } = adj;
      addDoor(a, aSide, worldX, worldZ, {
        kind: "hallway",
        hallwayId: `room:${b.id}`,
      });
      addDoor(b, bSide, worldX, worldZ, {
        kind: "hallway",
        hallwayId: `room:${a.id}`,
      });
    }
  }
}

/**
 * For two cell rectangles `a` and `b`, detect whether they share an
 * edge and if so return the world-space centre of that shared edge plus
 * which side of `a` and which side of `b` the edge lies on.
 */
function adjacency(
  a: CellRect,
  b: CellRect,
): { aSide: Door["side"]; bSide: Door["side"]; worldX: number; worldZ: number } | null {
  // a's east wall touches b's west wall.
  if (a.xMax + 1 === b.xMin && rangeOverlap(a.zMin, a.zMax, b.zMin, b.zMax)) {
    const overlap = overlapCenter(a.zMin, a.zMax, b.zMin, b.zMax);
    return {
      aSide: "east",
      bSide: "west",
      worldX: (a.xMax + 1) * CELL_SIZE,
      worldZ: (overlap + 0.5) * CELL_SIZE,
    };
  }
  // a's west wall touches b's east wall.
  if (b.xMax + 1 === a.xMin && rangeOverlap(a.zMin, a.zMax, b.zMin, b.zMax)) {
    const overlap = overlapCenter(a.zMin, a.zMax, b.zMin, b.zMax);
    return {
      aSide: "west",
      bSide: "east",
      worldX: a.xMin * CELL_SIZE,
      worldZ: (overlap + 0.5) * CELL_SIZE,
    };
  }
  // a's south wall (high z) touches b's north wall (low z). Cardinal
  // convention: south = high z, north = low z.
  if (a.zMax + 1 === b.zMin && rangeOverlap(a.xMin, a.xMax, b.xMin, b.xMax)) {
    const overlap = overlapCenter(a.xMin, a.xMax, b.xMin, b.xMax);
    return {
      aSide: "south",
      bSide: "north",
      worldX: (overlap + 0.5) * CELL_SIZE,
      worldZ: (a.zMax + 1) * CELL_SIZE,
    };
  }
  // a's north wall (low z) touches b's south wall (high z).
  if (b.zMax + 1 === a.zMin && rangeOverlap(a.xMin, a.xMax, b.xMin, b.xMax)) {
    const overlap = overlapCenter(a.xMin, a.xMax, b.xMin, b.xMax);
    return {
      aSide: "north",
      bSide: "south",
      worldX: (overlap + 0.5) * CELL_SIZE,
      worldZ: a.zMin * CELL_SIZE,
    };
  }
  return null;
}

/**
 * Build the per-edge wall mask the player uses for collision. Walls
 * sit on cell boundaries; if cells (x, z) and (x+1, z) belong to two
 * different rooms, a wall divides them — and that edge is blocked
 * unless one of the room's doors covers the cell midpoint.
 *
 * Edges between same-room cells, or between any room/hallway and
 * non-walkable space, are NOT in this mask (the latter is handled by
 * the cell `walkable` mask; the former is free passage by definition).
 */
function computeBlockedEdges(
  gridSize: number,
  rooms: RoomLayout[],
  cellOwner: Int16Array,
): { blockedEdgesEW: Uint8Array; blockedEdgesNS: Uint8Array } {
  const blockedEdgesEW = new Uint8Array((gridSize - 1) * gridSize);
  const blockedEdgesNS = new Uint8Array(gridSize * (gridSize - 1));
  const HALF_DOOR = 1.0; // half of DOOR_WIDTH; tolerance for "covers".

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize - 1; x++) {
      const a = cellOwner[z * gridSize + x];
      const b = cellOwner[z * gridSize + (x + 1)];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 1) * CELL_SIZE;
      const edgeWorldZ = (z + 0.5) * CELL_SIZE;
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "east" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            Math.abs(d.worldZ - edgeWorldZ) < HALF_DOOR,
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "west" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            Math.abs(d.worldZ - edgeWorldZ) < HALF_DOOR,
        );
      if (!open) blockedEdgesEW[z * (gridSize - 1) + x] = 1;
    }
  }

  for (let z = 0; z < gridSize - 1; z++) {
    for (let x = 0; x < gridSize; x++) {
      const a = cellOwner[z * gridSize + x];
      const b = cellOwner[(z + 1) * gridSize + x];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 0.5) * CELL_SIZE;
      const edgeWorldZ = (z + 1) * CELL_SIZE;
      // a is at lower z = cardinal "north" cell; the shared wall is on
      // a's south face (high z) and on b's north face (low z).
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "south" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            Math.abs(d.worldX - edgeWorldX) < HALF_DOOR,
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "north" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            Math.abs(d.worldX - edgeWorldX) < HALF_DOOR,
        );
      if (!open) blockedEdgesNS[z * gridSize + x] = 1;
    }
  }

  return { blockedEdgesEW, blockedEdgesNS };
}

function rangeOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 <= b1 && b0 <= a1;
}

function overlapCenter(a0: number, a1: number, b0: number, b1: number): number {
  // Cell-axis midpoint of the overlapping integer range; +0.5 in the
  // caller maps it to the centre of the cell in world space.
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return Math.floor((lo + hi) / 2);
}

function addDoor(
  room: RoomLayout,
  side: Door["side"],
  worldX: number,
  worldZ: number,
  connectsTo: Door["connectsTo"],
) {
  room.doors.push({
    side,
    worldX,
    worldZ,
    worldY: room.worldRect.y,
    width: DOOR_WIDTH,
    connectsTo,
  });
}

// --- Spiral staircase between floors --------------------------------------

function buildStaircase(lower: FloorLayout, upper: FloorLayout): Staircase | null {
  const lowerStair = lower.rooms.find((r) => r.isStairwell);
  const upperStair = upper.rooms.find((r) => r.isStairwell);
  if (!lowerStair || !upperStair) return null;

  const centerX = ((STAIR.xMin + STAIR.xMax + 1) / 2) * CELL_SIZE;
  const centerZ = ((STAIR.zMin + STAIR.zMax + 1) / 2) * CELL_SIZE;

  return {
    id: `stair-${lower.index}-to-${upper.index}`,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    lowerLabel: lower.era.title,
    upperLabel: upper.era.title,
    centerX,
    centerZ,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lower.y,
    upperY: upper.y,
    // High z = south (cardinal). The stairwell's grand-hall door sits
    // on the south wall, so anchoring step 0 there means a player
    // walking in from the grand hall meets the spiral entry square on.
    entryAngle: Math.PI / 2,
  };
}

// --- Copy helpers ---------------------------------------------------------

function describeRoom(movement: string, artworks: Artwork[]): string {
  if (artworks.length === 0) return movement;
  const years = artworks.map((a) => a.year).filter((y): y is number => y != null);
  if (years.length === 0) return `${movement} · ${artworks.length} works`;
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (max - min < 30) {
    return `${movement} · ${artworks.length} works around ${min}`;
  }
  return `${movement} · ${artworks.length} works · ${min}–${max}`;
}
