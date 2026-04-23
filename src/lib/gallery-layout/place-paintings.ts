// Painting placement for rooms + hallways.
//
// Per floor we partition the era's artworks by size band:
//   - large paintings (> 150 cm) get scattered round-robin through the
//     biggest rooms first, one per wall slot.
//   - medium paintings fill any remaining room slots.
//   - small paintings (< 60 cm) hang one-per-side in hallway cells that
//     face open space (i.e. on the hallway's outside-facing walls).
//
// "Slots" are cell-aligned wall positions. A slot is one cell wide along
// the wall and sits in the middle of that cell. Any slot whose centre
// falls inside a door opening is skipped.

import type { Artwork } from "@/lib/data";
import type {
  Door,
  FloorLayout,
  HallwayLayout,
  Placement,
  RoomLayout,
} from "./types";
import { artworkBand, partitionByBand } from "./painting-bands";
import { CELL_SIZE } from "./world-coords";

/** Eye-height-ish centre for every wall-mounted painting. */
const CANONICAL_Y_CENTER_OFFSET = 1.55;
/** Lower/upper row heights in hallways — salon hang. Ceiling is 3.4 m so
 *  the upper row caps below that to leave visual breathing room. */
const HALLWAY_ROW_LOWER_Y = 1.1;
const HALLWAY_ROW_UPPER_Y = 2.5;
/** Max painting dimensions in metres, independent of real-world size. */
const MAX_PAINTING_W = 2.2;
const MAX_PAINTING_H_ROOM = 3.0;
const MAX_PAINTING_H_HALLWAY = 1.6;   // lower-row cap
const MAX_PAINTING_H_HALLWAY_UPPER = 0.8;
/** Inset from the wall surface so paintings don't z-fight. */
const PAINTING_WALL_OFFSET = 0.06;

type Slot = {
  /** Anchor point (wall surface) in world space. */
  wallX: number;
  wallY: number;
  wallZ: number;
  /** Rotation of the painting plane so its normal points into the room
   *  or hallway (away from the wall it hangs on). */
  rotationY: number;
  /** Direction the painting faces, used to nudge it off the wall. */
  normalX: -1 | 0 | 1;
  normalZ: -1 | 0 | 1;
  /** Max painting width this slot can hold, metres. */
  maxWidth: number;
  /** Max painting height this slot can hold, metres. */
  maxHeight: number;
};

/**
 * Compute every wall slot for a room. Walks each of the four walls cell
 * by cell; a cell becomes a slot unless a door on that side covers its
 * centre.
 */
export function computeRoomSlots(room: RoomLayout): Slot[] {
  const { cellBounds, worldRect } = room;
  const y = worldRect.y + CANONICAL_Y_CENTER_OFFSET;
  const slots: Slot[] = [];

  const doorsBySide = {
    north: room.doors.filter((d) => d.side === "north"),
    south: room.doors.filter((d) => d.side === "south"),
    east: room.doors.filter((d) => d.side === "east"),
    west: room.doors.filter((d) => d.side === "west"),
  };

  // North wall: z = cellBounds.zMin; cells at x = xMin..xMax.
  const zNorth = cellBounds.zMin * CELL_SIZE;
  for (let x = cellBounds.xMin; x <= cellBounds.xMax; x++) {
    const cx = (x + 0.5) * CELL_SIZE;
    if (isInsideDoor(cx, doorsBySide.north, "x")) continue;
    slots.push({
      wallX: cx,
      wallY: y,
      wallZ: zNorth,
      rotationY: 0,
      normalX: 0,
      normalZ: 1, // north wall faces +Z
      maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.2),
      maxHeight: MAX_PAINTING_H_ROOM,
    });
  }

  // South wall: z = (cellBounds.zMax + 1) * CELL_SIZE.
  const zSouth = (cellBounds.zMax + 1) * CELL_SIZE;
  for (let x = cellBounds.xMin; x <= cellBounds.xMax; x++) {
    const cx = (x + 0.5) * CELL_SIZE;
    if (isInsideDoor(cx, doorsBySide.south, "x")) continue;
    slots.push({
      wallX: cx,
      wallY: y,
      wallZ: zSouth,
      rotationY: Math.PI,
      normalX: 0,
      normalZ: -1, // faces -Z
      maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.2),
      maxHeight: MAX_PAINTING_H_ROOM,
    });
  }

  // West wall: x = cellBounds.xMin * CELL_SIZE; cells at z = zMin..zMax.
  const xWest = cellBounds.xMin * CELL_SIZE;
  for (let z = cellBounds.zMin; z <= cellBounds.zMax; z++) {
    const cz = (z + 0.5) * CELL_SIZE;
    if (isInsideDoor(cz, doorsBySide.west, "z")) continue;
    slots.push({
      wallX: xWest,
      wallY: y,
      wallZ: cz,
      rotationY: Math.PI / 2,
      normalX: 1, // west wall faces +X
      normalZ: 0,
      maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.2),
      maxHeight: MAX_PAINTING_H_ROOM,
    });
  }

  // East wall: x = (cellBounds.xMax + 1) * CELL_SIZE.
  const xEast = (cellBounds.xMax + 1) * CELL_SIZE;
  for (let z = cellBounds.zMin; z <= cellBounds.zMax; z++) {
    const cz = (z + 0.5) * CELL_SIZE;
    if (isInsideDoor(cz, doorsBySide.east, "z")) continue;
    slots.push({
      wallX: xEast,
      wallY: y,
      wallZ: cz,
      rotationY: -Math.PI / 2,
      normalX: -1, // east wall faces -X
      normalZ: 0,
      maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.2),
      maxHeight: MAX_PAINTING_H_ROOM,
    });
  }

  return slots;
}

/** For each hallway cell, emit slots on each side that faces a None
 *  (non-walkable) cell. Two rows per side (salon hang): a lower row
 *  and a higher, smaller row above. */
export function computeHallwaySlots(
  hallway: HallwayLayout,
  floor: FloorLayout,
): Slot[] {
  const yLow = floor.y + HALLWAY_ROW_LOWER_Y;
  const yHigh = floor.y + HALLWAY_ROW_UPPER_Y;
  const slots: Slot[] = [];

  const neighbourIsNone = (nx: number, nz: number): boolean => {
    if (nx < 0 || nx >= floor.gridSize.x) return true;
    if (nz < 0 || nz >= floor.gridSize.z) return true;
    const idx = nz * floor.gridSize.x + nx;
    return floor.walkable[idx] !== 1;
  };

  // Two rows per side: lower + upper. Ordered so the lower row fills
  // across all sides of the hallway first (nicer distribution than
  // filling one side floor-to-ceiling before moving to the next).
  const rows = [
    { wallY: yLow, maxHeight: MAX_PAINTING_H_HALLWAY },
    { wallY: yHigh, maxHeight: MAX_PAINTING_H_HALLWAY_UPPER },
  ];
  for (const row of rows) {
    for (const c of hallway.cells) {
      const x0 = c.x * CELL_SIZE;
      const z0 = c.z * CELL_SIZE;
      const cx = x0 + CELL_SIZE / 2;
      const cz = z0 + CELL_SIZE / 2;

      if (neighbourIsNone(c.x, c.z - 1)) {
        slots.push({
          wallX: cx,
          wallY: row.wallY,
          wallZ: z0,
          rotationY: 0,
          normalX: 0,
          normalZ: 1,
          maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
          maxHeight: row.maxHeight,
        });
      }
      if (neighbourIsNone(c.x, c.z + 1)) {
        slots.push({
          wallX: cx,
          wallY: row.wallY,
          wallZ: z0 + CELL_SIZE,
          rotationY: Math.PI,
          normalX: 0,
          normalZ: -1,
          maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
          maxHeight: row.maxHeight,
        });
      }
      if (neighbourIsNone(c.x - 1, c.z)) {
        slots.push({
          wallX: x0,
          wallY: row.wallY,
          wallZ: cz,
          rotationY: Math.PI / 2,
          normalX: 1,
          normalZ: 0,
          maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
          maxHeight: row.maxHeight,
        });
      }
      if (neighbourIsNone(c.x + 1, c.z)) {
        slots.push({
          wallX: x0 + CELL_SIZE,
          wallY: row.wallY,
          wallZ: cz,
          rotationY: -Math.PI / 2,
          normalX: -1,
          normalZ: 0,
          maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
          maxHeight: row.maxHeight,
        });
      }
    }
  }

  return slots;
}

export type DistributionStats = {
  roomSlotsTotal: number;
  roomSlotsFilled: number;
  hallwaySlotsTotal: number;
  hallwaySlotsFilled: number;
  dropped: number;
};

/**
 * Distribute an era's artworks into the floor's rooms and hallways.
 * Mutates `floor.rooms[*].placements` and `floor.hallways[*].placements`.
 *
 *  - Large artworks fill the biggest rooms first (round-robin), one per
 *    slot. Medium fills the remaining room slots.
 *  - Small artworks distribute across hallway slots round-robin.
 *  - If we run out of artworks before slots are full, slots stay empty
 *    (wall shows through). If we have more artworks than slots, the
 *    overflow is dropped.
 */
export function distributePaintings(
  floor: FloorLayout,
  eraArtworks: Artwork[],
): DistributionStats {
  const bands = partitionByBand(eraArtworks);

  // --- Rooms: large first (biggest rooms), then medium
  const roomsByArea = [...floor.rooms]
    .map((r) => {
      const w = r.cellBounds.xMax - r.cellBounds.xMin + 1;
      const d = r.cellBounds.zMax - r.cellBounds.zMin + 1;
      return { room: r, area: w * d, slots: computeRoomSlots(r), filled: 0 };
    })
    .sort((a, b) => b.area - a.area);

  // Round-robin round-robin: each container tracks its `filled` cursor
  // across successive pour() calls, and `pour` returns how many items
  // from the supply actually landed (so we can re-pour leftovers into
  // other containers).
  type SlotContainer = {
    slots: Slot[];
    filled: number;
    push: (p: Placement) => void;
  };

  const roomContainers: SlotContainer[] = roomsByArea.map((r) => ({
    slots: r.slots,
    filled: 0,
    push: (p) => r.room.placements.push(p),
  }));
  const hallContainers: SlotContainer[] = floor.hallways.map((hw) => ({
    slots: computeHallwaySlots(hw, floor),
    filled: 0,
    push: (p) => hw.placements.push(p),
  }));

  const pour = (supply: Artwork[], containers: SlotContainer[]): number => {
    let placed = 0;
    let progressed = true;
    while (placed < supply.length && progressed) {
      progressed = false;
      for (const c of containers) {
        if (placed >= supply.length) break;
        if (c.filled >= c.slots.length) continue;
        const slot = c.slots[c.filled];
        c.filled++;
        c.push(slotToPlacement(slot, supply[placed]));
        placed++;
        progressed = true;
      }
    }
    return placed;
  };

  // Preferences, in order:
  //   large  → rooms    (need visual breathing room)
  //   small  → hallways (low ceilings, tight spaces — salon hang)
  //   medium → rooms
  // Then any leftover from any bucket spills into whichever container
  // still has free slots so nothing gets dropped.
  const largePlaced = pour(bands.large, roomContainers);
  const smallPlacedHalls = pour(bands.small, hallContainers);
  const mediumPlaced = pour(bands.medium, roomContainers);

  const largeLeft = bands.large.slice(largePlaced);
  const smallLeft = bands.small.slice(smallPlacedHalls);
  const mediumLeft = bands.medium.slice(mediumPlaced);

  // Overflow pass — try whichever container still has room.
  pour(smallLeft, roomContainers);
  pour(mediumLeft, hallContainers);
  pour(largeLeft, hallContainers);

  // Expose read-only views so the stats block at the bottom can count.
  const hallwaySlots = hallContainers.map((c, i) => ({
    hallway: floor.hallways[i],
    slots: c.slots,
    filled: c.filled,
  }));
  // Keep the `filled` cursor synced to roomsByArea too so stats below
  // match what was actually placed.
  for (let i = 0; i < roomsByArea.length; i++) {
    roomsByArea[i].filled = roomContainers[i].filled;
  }

  const roomSlotsTotal = roomsByArea.reduce((n, r) => n + r.slots.length, 0);
  const roomSlotsFilled = roomsByArea.reduce((n, r) => n + r.filled, 0);
  const hallwaySlotsTotal = hallwaySlots.reduce((n, h) => n + h.slots.length, 0);
  const hallwaySlotsFilled = hallwaySlots.reduce((n, h) => n + h.filled, 0);
  const dropped =
    bands.large.length +
    bands.medium.length +
    bands.small.length -
    (roomSlotsFilled + hallwaySlotsFilled);

  return {
    roomSlotsTotal,
    roomSlotsFilled,
    hallwaySlotsTotal,
    hallwaySlotsFilled,
    dropped,
  };
}

/** Project a painting's real-world dimensions into a slot. Maintains
 *  aspect ratio; scales down if either dimension exceeds the slot's cap.
 *  Also handles the subtle off-wall translation so the plane never
 *  z-fights the wall plane behind it. */
function slotToPlacement(slot: Slot, artwork: Artwork): Placement {
  const dims = artwork.realDimensions;
  // Default dimensions if realDimensions missing: 80x100 cm.
  let wM = dims ? dims.widthCm / 100 : 0.8;
  let hM = dims ? dims.heightCm / 100 : 1.0;

  // Scale to fit the slot while preserving aspect.
  const scale = Math.min(slot.maxWidth / wM, slot.maxHeight / hM, 1);
  if (scale < 1) {
    wM *= scale;
    hM *= scale;
  }

  const pos: [number, number, number] = [
    slot.wallX + slot.normalX * PAINTING_WALL_OFFSET,
    slot.wallY,
    slot.wallZ + slot.normalZ * PAINTING_WALL_OFFSET,
  ];
  const rot: [number, number, number] = [0, slot.rotationY, 0];

  // Encode scaled dimensions into the placement so renderers don't
  // have to rederive them. We attach them to the rotation's unused
  // spare by convention? No — cleaner to store in `position` won't
  // work either. Extend Placement? For now store in a carrier object
  // by tweaking: unused. We'll use dedicated fields via narrowed type.
  return {
    artwork,
    position: pos,
    rotation: rot,
    band: artworkBand(artwork),
    widthM: wM,
    heightM: hM,
  };
}

/** Cheap internal check: does `coord` (metres on the wall axis) fall
 *  inside any of the doors on this side? `coord` is the painting's
 *  centre; doors are 2 m wide, so we treat anything within ±1.1 m as a
 *  collision (adds 10 cm of buffer so paintings don't crowd the frame). */
function isInsideDoor(
  coord: number,
  doors: Door[],
  axis: "x" | "z",
): boolean {
  for (const d of doors) {
    const dCoord = axis === "x" ? d.worldX : d.worldZ;
    if (Math.abs(coord - dCoord) < d.width / 2 + 0.1) return true;
  }
  return false;
}
