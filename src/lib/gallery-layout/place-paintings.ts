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
/** Max painting dimensions in metres, independent of real-world size. */
const MAX_PAINTING_W = 2.2;
const MAX_PAINTING_H_ROOM = 3.0;
const MAX_PAINTING_H_HALLWAY = 2.0;
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

/** For each hallway cell, emit a slot on each side that faces a None
 *  (non-walkable) cell. Those sides will have a wall drawn by the
 *  hallway renderer. */
export function computeHallwaySlots(
  hallway: HallwayLayout,
  floor: FloorLayout,
): Slot[] {
  const y = floor.y + CANONICAL_Y_CENTER_OFFSET;
  const slots: Slot[] = [];

  const neighbourIsNone = (nx: number, nz: number): boolean => {
    if (nx < 0 || nx >= floor.gridSize.x) return true;
    if (nz < 0 || nz >= floor.gridSize.z) return true;
    const idx = nz * floor.gridSize.x + nx;
    return floor.walkable[idx] !== 1;
  };

  for (const c of hallway.cells) {
    const x0 = c.x * CELL_SIZE;
    const z0 = c.z * CELL_SIZE;
    const cx = x0 + CELL_SIZE / 2;
    const cz = z0 + CELL_SIZE / 2;

    // North side (neighbour at z-1)
    if (neighbourIsNone(c.x, c.z - 1)) {
      slots.push({
        wallX: cx,
        wallY: y,
        wallZ: z0,
        rotationY: 0,
        normalX: 0,
        normalZ: 1,
        maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
        maxHeight: MAX_PAINTING_H_HALLWAY,
      });
    }
    // South side (neighbour at z+1)
    if (neighbourIsNone(c.x, c.z + 1)) {
      slots.push({
        wallX: cx,
        wallY: y,
        wallZ: z0 + CELL_SIZE,
        rotationY: Math.PI,
        normalX: 0,
        normalZ: -1,
        maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
        maxHeight: MAX_PAINTING_H_HALLWAY,
      });
    }
    // West side (neighbour at x-1)
    if (neighbourIsNone(c.x - 1, c.z)) {
      slots.push({
        wallX: x0,
        wallY: y,
        wallZ: cz,
        rotationY: Math.PI / 2,
        normalX: 1,
        normalZ: 0,
        maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
        maxHeight: MAX_PAINTING_H_HALLWAY,
      });
    }
    // East side (neighbour at x+1)
    if (neighbourIsNone(c.x + 1, c.z)) {
      slots.push({
        wallX: x0 + CELL_SIZE,
        wallY: y,
        wallZ: cz,
        rotationY: -Math.PI / 2,
        normalX: -1,
        normalZ: 0,
        maxWidth: Math.min(MAX_PAINTING_W, CELL_SIZE - 0.4),
        maxHeight: MAX_PAINTING_H_HALLWAY,
      });
    }
  }

  return slots;
}

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
): void {
  const bands = partitionByBand(eraArtworks);

  // --- Rooms: large first (biggest rooms), then medium
  const roomsByArea = [...floor.rooms]
    .map((r) => {
      const w = r.cellBounds.xMax - r.cellBounds.xMin + 1;
      const d = r.cellBounds.zMax - r.cellBounds.zMin + 1;
      return { room: r, area: w * d, slots: computeRoomSlots(r), filled: 0 };
    })
    .sort((a, b) => b.area - a.area);

  const pourInto = (supply: Artwork[]) => {
    let supplyIdx = 0;
    let progressed = true;
    while (supplyIdx < supply.length && progressed) {
      progressed = false;
      for (const r of roomsByArea) {
        if (supplyIdx >= supply.length) break;
        if (r.filled >= r.slots.length) continue;
        const slot = r.slots[r.filled];
        r.filled++;
        progressed = true;
        r.room.placements.push(slotToPlacement(slot, supply[supplyIdx]));
        supplyIdx++;
      }
    }
  };

  pourInto(bands.large);
  pourInto(bands.medium);

  // --- Hallways: small artworks, round-robin across all slots.
  const hallwaySlots = floor.hallways.map((hw) => ({
    hallway: hw,
    slots: computeHallwaySlots(hw, floor),
    filled: 0,
  }));
  let smallIdx = 0;
  let progressed = true;
  while (smallIdx < bands.small.length && progressed) {
    progressed = false;
    for (const h of hallwaySlots) {
      if (smallIdx >= bands.small.length) break;
      if (h.filled >= h.slots.length) continue;
      const slot = h.slots[h.filled];
      h.filled++;
      progressed = true;
      h.hallway.placements.push(slotToPlacement(slot, bands.small[smallIdx]));
      smallIdx++;
    }
  }
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
