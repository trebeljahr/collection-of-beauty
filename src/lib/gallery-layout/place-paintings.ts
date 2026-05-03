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
import { artworkBand, partitionByBand } from "./painting-bands";
import type { Door, FloorLayout, HallwayLayout, Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

/** Eye-height-ish centre for every wall-mounted painting. Anchored to
 *  human scale (door height is 2.4 m), not the ceiling — so paintings
 *  hang at the same physical height regardless of how tall the room is.
 *  A 2.6 m painting centred at 1.7 m tops out at 3.0 m and bottoms at
 *  0.4 m: well under the 4.2 m ceiling, well off the floor. */
const CANONICAL_Y_CENTER_OFFSET = 1.7;
/** Lower-row hallway height. Single salon row — kept that way for
 *  visual calm even though the 3.12 m corridor ceiling could now host
 *  a second stacked row. */
const HALLWAY_ROW_LOWER_Y = 1.4;
/** Max painting dimensions in metres, independent of real-world size.
 *  Acts as an upper bound; per-slot sizing further constrains this so
 *  paintings don't crash into perpendicular walls or each other's
 *  plaques. Capped at 2.6 m tall so paintings stay sized to human/door
 *  scale; the room reads as taller-than-the-art rather than the art
 *  filling the wall floor-to-ceiling. */
const MAX_PAINTING_W = 2.2;
const MAX_PAINTING_H_ROOM = 2.6;
const MAX_PAINTING_H_HALLWAY = 1.6;
/** Inset from the wall surface so paintings don't z-fight. Sized to
 *  put the back of the painting frame box flush against the wall —
 *  frame box depth in painting.tsx is 0.025 m, half-depth + a 1 mm
 *  z-fight margin = ~0.014 m. Bumped to 0.02 for a comfortable hair
 *  of clearance. */
const PAINTING_WALL_OFFSET = 0.02;
/** Combined width of the museum plaque to the side of every painting.
 *  Sum of `PLAQUE_GAP` (0.06) and `PLAQUE_MOUNT_W` (0.308) in
 *  painting.tsx — keep in sync if those move. */
const PLAQUE_FOOTPRINT = 0.06 + 0.308;
/** Minimum gap from a painting (or its plaque) to a perpendicular room
 *  wall at wall corners. The user-facing target is "50 cm – 1 m of
 *  breathing room from the sides of the room". 50 cm is the floor. */
const SIDE_WALL_CLEARANCE = 0.5;
/** Minimum gap between a painting/plaque and the next painting/plaque
 *  on the same wall. Prevents paintings from grazing each other. */
const ADJACENT_GAP = 0.1;

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
  /** Hang the plaque on the painting's left rather than its default
   *  right, so the plaque doesn't crash through a perpendicular wall on
   *  the viewer's right. */
  plaqueOnLeft: boolean;
};

/** Position of a wall cell relative to the wall's two perpendicular
 *  ends, from the viewer's perspective looking at the painting.
 *  - `left`  → cell touches a perpendicular wall on the viewer's left
 *  - `right` → cell touches a perpendicular wall on the viewer's right
 *  - `both`  → 1-cell wall (perpendicular walls on both sides)
 *  - `none`  → interior cell, no perpendicular wall on either side */
type CornerStatus = "left" | "right" | "both" | "none";

/** Decide max painting width for a room-wall cell, based on its position
 *  relative to the wall's perpendicular ends.
 *
 *  Plaques always hang on the painting's right (museum convention) and
 *  never flip — so a right-corner cell has to fit BOTH the painting and
 *  its plaque inside the SIDE_WALL_CLEARANCE budget, which gives a
 *  narrower painting there. Width caps:
 *  - corner cells leave SIDE_WALL_CLEARANCE between the painting (or
 *    its plaque) and the perpendicular wall
 *  - pure interior cells just need to leave room for one plaque + the
 *    next painting (ADJACENT_GAP between cells) */
function widthAndPlaqueForRoomCell(args: { cornerStatus: CornerStatus }): {
  maxWidth: number;
  plaqueOnLeft: boolean;
} {
  const { cornerStatus } = args;
  const half = CELL_SIZE / 2;

  let maxWidth: number;

  if (cornerStatus === "both") {
    // 1-cell wall: perpendicular walls on both sides; plaque must fit
    // inside the right-side clearance budget. Doesn't occur in rooms
    // today (ROOM_MIN_CELLS = 3), but the formula keeps things sane.
    maxWidth = 2 * (half - SIDE_WALL_CLEARANCE) - PLAQUE_FOOTPRINT;
  } else if (cornerStatus === "right") {
    // Right perpendicular wall: painting + plaque must both clear it.
    maxWidth = 2 * (half - SIDE_WALL_CLEARANCE - PLAQUE_FOOTPRINT);
  } else if (cornerStatus === "left") {
    // Left perpendicular wall: only the painting needs the SIDE_WALL_CLEARANCE
    // (plaque is on the right, far from the perpendicular wall).
    maxWidth = 2 * (half - SIDE_WALL_CLEARANCE);
  } else {
    // Pure interior: ours is the only plaque sitting in the gap to the
    // right neighbour's painting.
    maxWidth = CELL_SIZE - PLAQUE_FOOTPRINT - ADJACENT_GAP;
  }

  return {
    plaqueOnLeft: false,
    maxWidth: Math.max(0, Math.min(MAX_PAINTING_W, maxWidth)),
  };
}

/**
 * Compute every wall slot for a room. Walks each of the four walls cell
 * by cell; a cell becomes a slot unless a door on that side covers its
 * centre.
 *
 * Each slot is sized with awareness of where it sits along the wall:
 * cells at wall corners get tighter caps (so paintings don't crash
 * through perpendicular walls), and the plaque flips to the painting's
 * left at right-corner cells so it has somewhere to hang.
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

  // Per-wall slot construction. `viewerRightIsHigher` says whether the
  // viewer's right (the default plaque side) corresponds to the higher
  // or lower coordinate along the wall axis — i.e., which end of the
  // wall is the "right corner" where we flip the plaque.
  //
  // Mapping (verified from rotationY + normal):
  //   north → viewer faces -Z, right = +X (higher x) → right corner = xMax
  //   south → viewer faces +Z, right = -X (lower x)  → right corner = xMin
  //   west  → viewer faces +X, right = -Z (lower z)  → right corner = zMin
  //   east  → viewer faces -X, right = +Z (higher z) → right corner = zMax
  const buildWallSlots = (args: {
    cellMin: number;
    cellMax: number;
    viewerRightIsHigher: boolean;
    doorsOnSide: Door[];
    doorAxis: "x" | "z";
    /** Returns a slot prototype (without sizing/plaque side) for cell
     *  index `cellIdx` along the wall axis. */
    buildBase: (cellIdx: number) => Omit<Slot, "maxWidth" | "maxHeight" | "plaqueOnLeft">;
    /** World coordinate along the wall axis for cell `cellIdx`'s
     *  centre — used to test against door openings. */
    cellCenterCoord: (cellIdx: number) => number;
  }) => {
    const cellHasSlot = (cellIdx: number) =>
      !isInsideDoor(args.cellCenterCoord(cellIdx), args.doorsOnSide, args.doorAxis);

    const rightCornerIdx = args.viewerRightIsHigher ? args.cellMax : args.cellMin;
    const leftCornerIdx = args.viewerRightIsHigher ? args.cellMin : args.cellMax;

    for (let cellIdx = args.cellMin; cellIdx <= args.cellMax; cellIdx++) {
      if (!cellHasSlot(cellIdx)) continue;

      const isLeftCorner = cellIdx === leftCornerIdx && args.cellMax > args.cellMin;
      const isRightCorner = cellIdx === rightCornerIdx && args.cellMax > args.cellMin;
      const isBothCorners = args.cellMin === args.cellMax;

      const cornerStatus: CornerStatus = isBothCorners
        ? "both"
        : isLeftCorner
          ? "left"
          : isRightCorner
            ? "right"
            : "none";

      const sizing = widthAndPlaqueForRoomCell({ cornerStatus });
      if (sizing.maxWidth <= 0) continue;

      slots.push({
        ...args.buildBase(cellIdx),
        maxWidth: sizing.maxWidth,
        maxHeight: MAX_PAINTING_H_ROOM,
        plaqueOnLeft: sizing.plaqueOnLeft,
      });
    }
  };

  // North wall: z = cellBounds.zMin; cells at x = xMin..xMax.
  const zNorth = cellBounds.zMin * CELL_SIZE;
  buildWallSlots({
    cellMin: cellBounds.xMin,
    cellMax: cellBounds.xMax,
    viewerRightIsHigher: true,
    doorsOnSide: doorsBySide.north,
    doorAxis: "x",
    cellCenterCoord: (x) => (x + 0.5) * CELL_SIZE,
    buildBase: (x) => ({
      wallX: (x + 0.5) * CELL_SIZE,
      wallY: y,
      wallZ: zNorth,
      rotationY: 0,
      normalX: 0,
      normalZ: 1, // north wall faces +Z
    }),
  });

  // South wall: z = (cellBounds.zMax + 1) * CELL_SIZE.
  const zSouth = (cellBounds.zMax + 1) * CELL_SIZE;
  buildWallSlots({
    cellMin: cellBounds.xMin,
    cellMax: cellBounds.xMax,
    viewerRightIsHigher: false,
    doorsOnSide: doorsBySide.south,
    doorAxis: "x",
    cellCenterCoord: (x) => (x + 0.5) * CELL_SIZE,
    buildBase: (x) => ({
      wallX: (x + 0.5) * CELL_SIZE,
      wallY: y,
      wallZ: zSouth,
      rotationY: Math.PI,
      normalX: 0,
      normalZ: -1, // faces -Z
    }),
  });

  // West wall: x = cellBounds.xMin * CELL_SIZE; cells at z = zMin..zMax.
  const xWest = cellBounds.xMin * CELL_SIZE;
  buildWallSlots({
    cellMin: cellBounds.zMin,
    cellMax: cellBounds.zMax,
    viewerRightIsHigher: false,
    doorsOnSide: doorsBySide.west,
    doorAxis: "z",
    cellCenterCoord: (z) => (z + 0.5) * CELL_SIZE,
    buildBase: (z) => ({
      wallX: xWest,
      wallY: y,
      wallZ: (z + 0.5) * CELL_SIZE,
      rotationY: Math.PI / 2,
      normalX: 1, // west wall faces +X
      normalZ: 0,
    }),
  });

  // East wall: x = (cellBounds.xMax + 1) * CELL_SIZE.
  const xEast = (cellBounds.xMax + 1) * CELL_SIZE;
  buildWallSlots({
    cellMin: cellBounds.zMin,
    cellMax: cellBounds.zMax,
    viewerRightIsHigher: true,
    doorsOnSide: doorsBySide.east,
    doorAxis: "z",
    cellCenterCoord: (z) => (z + 0.5) * CELL_SIZE,
    buildBase: (z) => ({
      wallX: xEast,
      wallY: y,
      wallZ: (z + 0.5) * CELL_SIZE,
      rotationY: -Math.PI / 2,
      normalX: -1, // east wall faces -X
      normalZ: 0,
    }),
  });

  return slots;
}

/** For each hallway cell, emit slots on each side that faces a None
 *  (non-walkable) cell. Two rows per side (salon hang): a lower row
 *  and a higher, smaller row above.
 *
 *  Per-slot sizing mirrors the room logic: the wall might run across
 *  several adjacent corridor cells (a long corridor with paintings down
 *  one side), or it might be just this cell wide (a one-cell stub).
 *  We classify the slot as left/right/both/none corner based on whether
 *  the wall continues into the cells on either side, and use the same
 *  corner-aware width + plaque-side rules as room walls. */
export function computeHallwaySlots(hallway: HallwayLayout, floor: FloorLayout): Slot[] {
  const yLow = floor.y + HALLWAY_ROW_LOWER_Y;
  const slots: Slot[] = [];

  const neighbourIsNone = (nx: number, nz: number): boolean => {
    if (nx < 0 || nx >= floor.gridSize.x) return true;
    if (nz < 0 || nz >= floor.gridSize.z) return true;
    const idx = nz * floor.gridSize.x + nx;
    return floor.walkable[idx] !== 1;
  };

  /** Does the wall on `side` of cell `(cx, cz)` continue into the
   *  neighbour at `(cx + dx, cz + dz)`? Yes only if the neighbour is a
   *  corridor cell AND the cell on its `side` is non-walkable (so a
   *  wall is actually drawn there too). */
  const wallExtendsTo = (
    cx: number,
    cz: number,
    side: "north" | "south" | "west" | "east",
    dx: number,
    dz: number,
  ): boolean => {
    const nx = cx + dx;
    const nz = cz + dz;
    if (nx < 0 || nx >= floor.gridSize.x) return false;
    if (nz < 0 || nz >= floor.gridSize.z) return false;
    if (floor.walkable[nz * floor.gridSize.x + nx] !== 1) return false;
    const sideDx = side === "west" ? -1 : side === "east" ? 1 : 0;
    const sideDz = side === "north" ? -1 : side === "south" ? 1 : 0;
    return neighbourIsNone(nx + sideDx, nz + sideDz);
  };

  // Single salon row — kept simple even though the 3.12 m corridor
  // ceiling could fit a second stacked row.
  const rows = [{ wallY: yLow, maxHeight: MAX_PAINTING_H_HALLWAY }];

  type SideSpec = {
    side: "north" | "south" | "west" | "east";
    /** Does this side need a wall (= neighbour on this side is None)? */
    wallNeighbourDelta: { dx: number; dz: number };
    /** Direction along the wall axis that corresponds to viewer's right. */
    rightDelta: { dx: number; dz: number };
    /** Direction along the wall axis that corresponds to viewer's left. */
    leftDelta: { dx: number; dz: number };
  };

  // Viewer's right per wall side (verified the same way as room walls).
  const sideSpecs: SideSpec[] = [
    {
      side: "north",
      wallNeighbourDelta: { dx: 0, dz: -1 },
      rightDelta: { dx: 1, dz: 0 }, // viewer's right = +X
      leftDelta: { dx: -1, dz: 0 },
    },
    {
      side: "south",
      wallNeighbourDelta: { dx: 0, dz: 1 },
      rightDelta: { dx: -1, dz: 0 }, // viewer's right = -X
      leftDelta: { dx: 1, dz: 0 },
    },
    {
      side: "west",
      wallNeighbourDelta: { dx: -1, dz: 0 },
      rightDelta: { dx: 0, dz: -1 }, // viewer's right = -Z
      leftDelta: { dx: 0, dz: 1 },
    },
    {
      side: "east",
      wallNeighbourDelta: { dx: 1, dz: 0 },
      rightDelta: { dx: 0, dz: 1 }, // viewer's right = +Z
      leftDelta: { dx: 0, dz: -1 },
    },
  ];

  for (const row of rows) {
    for (const c of hallway.cells) {
      const x0 = c.x * CELL_SIZE;
      const z0 = c.z * CELL_SIZE;
      const cx = x0 + CELL_SIZE / 2;
      const cz = z0 + CELL_SIZE / 2;

      for (const spec of sideSpecs) {
        if (!neighbourIsNone(c.x + spec.wallNeighbourDelta.dx, c.z + spec.wallNeighbourDelta.dz))
          continue;

        const wallContinuesRight = wallExtendsTo(
          c.x,
          c.z,
          spec.side,
          spec.rightDelta.dx,
          spec.rightDelta.dz,
        );
        const wallContinuesLeft = wallExtendsTo(
          c.x,
          c.z,
          spec.side,
          spec.leftDelta.dx,
          spec.leftDelta.dz,
        );

        const isRightCorner = !wallContinuesRight;
        const isLeftCorner = !wallContinuesLeft;
        const cornerStatus: CornerStatus =
          isRightCorner && isLeftCorner
            ? "both"
            : isRightCorner
              ? "right"
              : isLeftCorner
                ? "left"
                : "none";

        const sizing = widthAndPlaqueForRoomCell({ cornerStatus });
        if (sizing.maxWidth <= 0) continue;

        // Position + rotation per side.
        let wallXOut = cx;
        let wallZOut = cz;
        let rotationY = 0;
        let normalX: -1 | 0 | 1 = 0;
        let normalZ: -1 | 0 | 1 = 0;
        if (spec.side === "north") {
          wallXOut = cx;
          wallZOut = z0;
          rotationY = 0;
          normalZ = 1;
        } else if (spec.side === "south") {
          wallXOut = cx;
          wallZOut = z0 + CELL_SIZE;
          rotationY = Math.PI;
          normalZ = -1;
        } else if (spec.side === "west") {
          wallXOut = x0;
          wallZOut = cz;
          rotationY = Math.PI / 2;
          normalX = 1;
        } else {
          wallXOut = x0 + CELL_SIZE;
          wallZOut = cz;
          rotationY = -Math.PI / 2;
          normalX = -1;
        }

        slots.push({
          wallX: wallXOut,
          wallY: row.wallY,
          wallZ: wallZOut,
          rotationY,
          normalX,
          normalZ,
          maxWidth: sizing.maxWidth,
          maxHeight: row.maxHeight,
          plaqueOnLeft: sizing.plaqueOnLeft,
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
export function distributePaintings(floor: FloorLayout, eraArtworks: Artwork[]): DistributionStats {
  const bands = partitionByBand(eraArtworks);

  // --- Rooms: large first (biggest rooms), then medium. Stairwell
  // rooms are excluded — their walls hold the spiral steps and signs,
  // not paintings.
  const roomsByArea = [...floor.rooms]
    .filter((r) => !r.isStairwell)
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
  // Pixel aspect drives SHAPE; realDimensions drives SIZE (long edge in
  // metres). The metadata's widthCm/heightCm is unreliable as a shape
  // signal — the file we actually render can disagree with it for several
  // reasons:
  //   - Predella case: Wikimedia records a strip's height for an
  //     altarpiece file (e.g. Botticelli's Coronation: 269 × 21 cm
  //     metadata vs ~3:1 scan).
  //   - Orientation flip: ~44 of 109 Turner sketchbook pages have
  //     widthCm/heightCm swapped relative to the scan.
  //   - Cropped scan: handscroll metadata records the full physical
  //     painting; the scan covers a shorter section (Eight Flowers:
  //     333.9 × 29.4 cm vs 6920 × 835 px = 8.29:1).
  // The pixel aspect is what the user actually sees, so use it for shape
  // and only fall back when missing. realDimensions still controls the
  // long-edge scale so a small miniature stays smaller than an altarpiece.
  let wM: number;
  let hM: number;
  const pxAspect = artwork.width && artwork.height ? artwork.width / artwork.height : null;
  if (pxAspect != null && dims) {
    const longEdgeM = Math.max(dims.widthCm, dims.heightCm) / 100;
    if (pxAspect >= 1) {
      wM = longEdgeM;
      hM = longEdgeM / pxAspect;
    } else {
      hM = longEdgeM;
      wM = longEdgeM * pxAspect;
    }
  } else if (pxAspect != null) {
    // No realDimensions — long edge ≈ 0.9 m reads as a typical gallery
    // painting; pixel aspect drives shape.
    if (pxAspect >= 1) {
      wM = 0.9;
      hM = 0.9 / pxAspect;
    } else {
      hM = 0.9;
      wM = 0.9 * pxAspect;
    }
  } else if (dims) {
    // No pixel dims (rare; ~9 of 2849 artworks) — use realDimensions
    // verbatim. The texture-aspect refit in painting.tsx will correct
    // visible distortion once the texture loads.
    wM = dims.widthCm / 100;
    hM = dims.heightCm / 100;
  } else {
    wM = 0.8;
    hM = 1.0;
  }

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

  return {
    artwork,
    position: pos,
    rotation: rot,
    band: artworkBand(artwork),
    widthM: wM,
    heightM: hM,
    plaqueOnLeft: slot.plaqueOnLeft,
  };
}

/** Cheap internal check: does `coord` (metres on the wall axis) fall
 *  inside any of the doors on this side? `coord` is the painting's
 *  centre; doors are 2 m wide, so we treat anything within ±1.1 m as a
 *  collision (adds 10 cm of buffer so paintings don't crowd the frame). */
function isInsideDoor(coord: number, doors: Door[], axis: "x" | "z"): boolean {
  for (const d of doors) {
    const dCoord = axis === "x" ? d.worldX : d.worldZ;
    if (Math.abs(coord - dCoord) < d.width / 2 + 0.1) return true;
  }
  return false;
}
