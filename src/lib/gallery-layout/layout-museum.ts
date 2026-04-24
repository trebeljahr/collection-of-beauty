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
import { ERAS, type Era, type EraId, assignEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { distributePaintings } from "./place-paintings";
import {
  CELL_SIZE,
  DOOR_WIDTH,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_ROOM_CELLS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
  floorY,
} from "./world-coords";
import type {
  Door,
  DungeonLayout,
  FloorLayout,
  HallwayLayout,
  RoomLayout,
  Staircase,
} from "./types";

// --- Floor plan geometry (cell coordinates, inclusive) --------------------

const GRID_SIZE = 48;
const STAIR_LABEL = "Stairwell";

type CellRect = { xMin: number; xMax: number; zMin: number; zMax: number };

// Stair sits dead centre, 7×7 cells.
const STAIR_MIN = Math.floor(GRID_SIZE / 2 - (SPIRAL_ROOM_CELLS - 1) / 2);
const STAIR_MAX = STAIR_MIN + SPIRAL_ROOM_CELLS - 1;
const STAIR: CellRect = {
  xMin: STAIR_MIN,
  xMax: STAIR_MAX,
  zMin: STAIR_MIN,
  zMax: STAIR_MAX,
};

// Grand Hall (anchor) sits north of the spiral, between the corner
// rooms. Its x range is centred on the spiral's world centre so the
// south door aligns with the player's natural walking line straight
// out of the hall toward the staircase.
const GRAND_HALL: CellRect = {
  xMin: 14,
  xMax: 34,
  zMin: STAIR_MAX + 1,
  zMax: 44,
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
  | "west"
  | "east"
  | "n_west_corner"
  | "n_east_corner"
  | "s_west_corner"
  | "s_east_corner";

type Slot = {
  id: SlotId;
  rect: CellRect;
  /** Walls suppressed because a neighbour owns/draws them. */
  suppress: Array<"north" | "south" | "east" | "west">;
};

const SLOTS: Slot[] = [
  // South counterpart to the Grand Hall — large gallery facing the spiral.
  {
    id: "s_main",
    rect: { xMin: 14, xMax: 34, zMin: 3, zMax: STAIR_MIN - 1 },
    suppress: ["north"], // stair's south wall is shared, owned by stair
  },
  // West and east galleries — single rooms hugging the spiral on the
  // sides, between the north corners and south corners.
  {
    id: "west",
    rect: { xMin: 4, xMax: STAIR_MIN - 1, zMin: STAIR_MIN, zMax: STAIR_MAX },
    suppress: ["east"], // stair's west wall is owner
  },
  {
    id: "east",
    rect: { xMin: STAIR_MAX + 1, xMax: 44, zMin: STAIR_MIN, zMax: STAIR_MAX },
    suppress: ["west"],
  },
  // North-corner pair — flanking the Grand Hall on x.
  {
    id: "n_west_corner",
    rect: { xMin: 4, xMax: 13, zMin: STAIR_MAX + 1, zMax: 44 },
    suppress: ["east"], // grand hall's west wall is owner
  },
  {
    id: "n_east_corner",
    rect: { xMin: 35, xMax: 44, zMin: STAIR_MAX + 1, zMax: 44 },
    suppress: ["west"],
  },
  // South-corner pair — flanking s_main.
  {
    id: "s_west_corner",
    rect: { xMin: 4, xMax: 13, zMin: 3, zMax: STAIR_MIN - 1 },
    suppress: ["east"], // s_main's west wall is owner
  },
  {
    id: "s_east_corner",
    rect: { xMin: 35, xMax: 44, zMin: 3, zMax: STAIR_MIN - 1 },
    suppress: ["west"],
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

  // Expand movements into room-sized chunks (anchor first, then by
  // popularity), splitting big movements into "Part N" rooms.
  const expanded: Array<{ name: string; artworks: Artwork[] }> = [];
  const orderedMovements = Array.from(byMovement.entries()).sort((a, b) => {
    if (a[0] === anchorMovement) return -1;
    if (b[0] === anchorMovement) return 1;
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
    (e) =>
      e.name === anchorMovement || e.name.startsWith(`${anchorMovement} · Part `),
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
      const mergedArtworks = tail.flatMap((e) => e.artworks);
      const mergedName =
        tail.length === 1
          ? tail[0].name
          : `Also from the ${era.title.toLowerCase()}`;
      slotEntries.push({ name: mergedName, artworks: mergedArtworks });
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
  wireDoors(rooms, slotRooms);

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

  const floor: FloorLayout = {
    index: era.index,
    era,
    y: floorY(era.index),
    gridSize: { x: GRID_SIZE, z: GRID_SIZE },
    walkable,
    cellOwner,
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
    const key = a.movement && a.movement.trim() ? a.movement : era.title;
    if (!byMovement.has(key)) byMovement.set(key, []);
    byMovement.get(key)!.push(a);
  }
  return byMovement;
}

function resolveAnchorMovement(
  era: Era,
  byMovement: Map<string, Artwork[]>,
): string {
  const configured = era.anchor.movement;
  if ((byMovement.get(configured)?.length ?? 0) > 0) return configured;
  const biggest = Array.from(byMovement.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
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
  return {
    id: slugify(opts.id) || opts.id,
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
    suppressWalls: opts.suppressWalls,
  };
}

/**
 * Wire doors between rooms based on shared walls. The "owner" of a
 * shared wall draws the wall + door; the suppressing neighbour gets a
 * mirror door so painting placement skips that overlap. Doors are
 * placed at the centre of each shared edge.
 */
function wireDoors(
  rooms: RoomLayout[],
  slotRooms: Array<{ slot: Slot; room: RoomLayout }>,
) {
  const grandHall = rooms.find((r) => r.isAnchor);
  const stairwell = rooms.find((r) => r.isStairwell);

  // Helper: add reciprocal doors between two rooms whose rectangles
  // share an edge along `axis`.
  const linkRooms = (
    owner: RoomLayout,
    suppressor: RoomLayout,
    ownerSide: Door["side"],
    suppressorSide: Door["side"],
    worldX: number,
    worldZ: number,
  ) => {
    addDoor(owner, ownerSide, worldX, worldZ, {
      kind: "hallway",
      hallwayId: `room:${suppressor.id}`,
    });
    addDoor(suppressor, suppressorSide, worldX, worldZ, {
      kind: "hallway",
      hallwayId: `room:${owner.id}`,
    });
  };

  // --- Stairwell ↔ Grand Hall (stair owns shared north wall) ---
  if (stairwell && grandHall) {
    const sb = stairwell.cellBounds;
    const worldX = ((sb.xMin + sb.xMax + 1) / 2) * CELL_SIZE;
    const worldZ = (sb.zMax + 1) * CELL_SIZE;
    addDoor(stairwell, "north", worldX, worldZ, {
      kind: "hallway",
      hallwayId: `room:${grandHall.id}`,
    });
    addDoor(grandHall, "south", worldX, worldZ, {
      kind: "hallway",
      hallwayId: `room:${stairwell.id}`,
    });
  }

  const slotById = new Map(slotRooms.map(({ slot, room }) => [slot.id, room]));

  // --- Stairwell ↔ s_main, west, east (stair owns the shared walls) ---
  if (stairwell) {
    const sb = stairwell.cellBounds;
    const sMain = slotById.get("s_main");
    if (sMain) {
      const worldX = ((sb.xMin + sb.xMax + 1) / 2) * CELL_SIZE;
      const worldZ = sb.zMin * CELL_SIZE;
      linkRooms(stairwell, sMain, "south", "north", worldX, worldZ);
    }
    const west = slotById.get("west");
    if (west) {
      const worldX = sb.xMin * CELL_SIZE;
      const worldZ = ((sb.zMin + sb.zMax + 1) / 2) * CELL_SIZE;
      linkRooms(stairwell, west, "west", "east", worldX, worldZ);
    }
    const east = slotById.get("east");
    if (east) {
      const worldX = (sb.xMax + 1) * CELL_SIZE;
      const worldZ = ((sb.zMin + sb.zMax + 1) / 2) * CELL_SIZE;
      linkRooms(stairwell, east, "east", "west", worldX, worldZ);
    }
  }

  // --- Grand Hall ↔ corner rooms (Grand Hall owns shared walls) ---
  if (grandHall) {
    const gb = grandHall.cellBounds;
    const nWest = slotById.get("n_west_corner");
    if (nWest) {
      const cb = nWest.cellBounds;
      const worldX = gb.xMin * CELL_SIZE;
      const worldZ = ((Math.max(gb.zMin, cb.zMin) + Math.min(gb.zMax, cb.zMax) + 1) / 2) * CELL_SIZE;
      linkRooms(grandHall, nWest, "west", "east", worldX, worldZ);
    }
    const nEast = slotById.get("n_east_corner");
    if (nEast) {
      const cb = nEast.cellBounds;
      const worldX = (gb.xMax + 1) * CELL_SIZE;
      const worldZ = ((Math.max(gb.zMin, cb.zMin) + Math.min(gb.zMax, cb.zMax) + 1) / 2) * CELL_SIZE;
      linkRooms(grandHall, nEast, "east", "west", worldX, worldZ);
    }
  }

  // --- s_main ↔ south corners (s_main owns shared walls) ---
  const sMain = slotById.get("s_main");
  if (sMain) {
    const sb = sMain.cellBounds;
    const sWest = slotById.get("s_west_corner");
    if (sWest) {
      const cb = sWest.cellBounds;
      const worldX = sb.xMin * CELL_SIZE;
      const worldZ = ((Math.max(sb.zMin, cb.zMin) + Math.min(sb.zMax, cb.zMax) + 1) / 2) * CELL_SIZE;
      linkRooms(sMain, sWest, "west", "east", worldX, worldZ);
    }
    const sEast = slotById.get("s_east_corner");
    if (sEast) {
      const cb = sEast.cellBounds;
      const worldX = (sb.xMax + 1) * CELL_SIZE;
      const worldZ = ((Math.max(sb.zMin, cb.zMin) + Math.min(sb.zMax, cb.zMax) + 1) / 2) * CELL_SIZE;
      linkRooms(sMain, sEast, "east", "west", worldX, worldZ);
    }
  }

  // --- west ↔ n_west_corner / s_west_corner (corners own these) ---
  // Each corner room sits north or south of `west`; the corner draws
  // the shared wall.
  const west = slotById.get("west");
  if (west) {
    const wb = west.cellBounds;
    const nw = slotById.get("n_west_corner");
    if (nw) {
      const nb = nw.cellBounds;
      const worldX = ((Math.max(wb.xMin, nb.xMin) + Math.min(wb.xMax, nb.xMax) + 1) / 2) * CELL_SIZE;
      const worldZ = (wb.zMax + 1) * CELL_SIZE;
      // n_west_corner's south wall owns the door; west's north wall is
      // suppressed so we add a mirror door there.
      linkRooms(nw, west, "south", "north", worldX, worldZ);
      west.suppressWalls = { ...(west.suppressWalls ?? {}), north: true };
    }
    const sw = slotById.get("s_west_corner");
    if (sw) {
      const sb = sw.cellBounds;
      const worldX = ((Math.max(wb.xMin, sb.xMin) + Math.min(wb.xMax, sb.xMax) + 1) / 2) * CELL_SIZE;
      const worldZ = wb.zMin * CELL_SIZE;
      linkRooms(sw, west, "north", "south", worldX, worldZ);
      west.suppressWalls = { ...(west.suppressWalls ?? {}), south: true };
    }
  }

  const east = slotById.get("east");
  if (east) {
    const eb = east.cellBounds;
    const ne = slotById.get("n_east_corner");
    if (ne) {
      const nb = ne.cellBounds;
      const worldX = ((Math.max(eb.xMin, nb.xMin) + Math.min(eb.xMax, nb.xMax) + 1) / 2) * CELL_SIZE;
      const worldZ = (eb.zMax + 1) * CELL_SIZE;
      linkRooms(ne, east, "south", "north", worldX, worldZ);
      east.suppressWalls = { ...(east.suppressWalls ?? {}), north: true };
    }
    const se = slotById.get("s_east_corner");
    if (se) {
      const sb = se.cellBounds;
      const worldX = ((Math.max(eb.xMin, sb.xMin) + Math.min(eb.xMax, sb.xMax) + 1) / 2) * CELL_SIZE;
      const worldZ = eb.zMin * CELL_SIZE;
      linkRooms(se, east, "north", "south", worldX, worldZ);
      east.suppressWalls = { ...(east.suppressWalls ?? {}), south: true };
    }
  }
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
  };
}

// --- Copy helpers ---------------------------------------------------------

function describeRoom(movement: string, artworks: Artwork[]): string {
  if (artworks.length === 0) return movement;
  const years = artworks
    .map((a) => a.year)
    .filter((y): y is number => y != null);
  if (years.length === 0) return `${movement} · ${artworks.length} works`;
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (max - min < 30) {
    return `${movement} · ${artworks.length} works around ${min}`;
  }
  return `${movement} · ${artworks.length} works · ${min}–${max}`;
}
