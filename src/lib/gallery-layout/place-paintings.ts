// Painting placement for rooms + hallways.
//
// Every room hangs its own movement bucket (`room.artworks`) on its own
// walls, so the room label and the works inside it actually agree. Each
// wall cell starts as a single eye-level slot; when a room's supply
// exceeds its cell count, cells convert to a two-row salon stack (one
// work just below eye level, a second above it) until everything fits.
// The tallest works keep the single full-height cells; only works short
// enough to share a wall gracefully get stacked. Whatever still doesn't
// fit in its home room spills to free wall space elsewhere on the same
// floor — same era, neighbouring room — so no artwork is dropped.
//
// "Slots" are cell-aligned wall positions. A slot is one cell wide along
// the wall and sits in the middle of that cell. Any slot whose centre
// falls inside a door opening is skipped.

import type { ArtworkListing } from "@/lib/data";
import { artworkBand } from "./painting-bands";
import type { Door, FloorLayout, HallwayLayout, Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

/** Eye-height-ish centre for every wall-mounted painting. Sized so the
 *  largest 3.2 m painting tops out at 3.25 m and bottoms at 0.05 m —
 *  noticeably more monumental than the door (2.4 m) without crashing
 *  into the 4.2 m ceiling or hanging into the floor. Lowered from
 *  1.9 m to read closer to a real-museum hang (where centres land
 *  around 1.45-1.55 m, slightly below the player's 1.75 m eye line). */
const CANONICAL_Y_CENTER_OFFSET = 1.65;
/** Two-row salon stack, used per cell when a room's supply exceeds its
 *  single-row capacity. The lower work hangs slightly below the
 *  canonical eye line; the upper work sits directly above it with a
 *  fixed air gap, its centre derived from the lower work's top edge so
 *  small print pairs bracket the eye line (≈1.45 m / ≈2.05 m) while
 *  taller medium pairs climb toward — but never past — STACK_MAX_TOP.
 *  Per-row height caps keep stacked cells from competing with the
 *  full-height single cells reserved for the era's largest canvases. */
const STACK_LOWER_CENTER_OFFSET = 1.45;
const STACK_GAP = 0.25;
const STACK_MAX_TOP_OFFSET = 3.7;
const STACK_LOWER_MAX_H = 1.5;
const STACK_UPPER_MAX_H = 1.3;
/** Smallest long edge (metres) any work renders at. The corpus includes
 *  pocket-sized engravings (8–15 cm) whose true scale would be
 *  invisible on a 15 m wall; museums hang those in vitrines we don't
 *  have, so we cheat them up to a readable small-print size instead of
 *  excluding them. */
const MIN_DISPLAY_LONG_EDGE = 0.45;
/** Lower-row hallway height. Single salon row — kept that way for
 *  visual calm even though the 3.12 m corridor ceiling could now host
 *  a second stacked row. Mirrors the room offset's drop so corridor
 *  paintings sit at the same eye-line as room paintings. */
const HALLWAY_ROW_LOWER_Y = 1.2;
/** Max painting dimensions in metres, independent of real-world size.
 *  Acts as an upper bound; per-slot sizing further constrains this so
 *  paintings don't crash into perpendicular walls or each other's
 *  plaques. Sized to feel monumental against the 2.4 m door (≈ 1.3×
 *  taller) while still leaving 0.7 m of head clearance to the 4.2 m
 *  ceiling so the wall doesn't read as floor-to-ceiling collage. */
const MAX_PAINTING_W = 2.4;
const MAX_PAINTING_H_ROOM = 3.2;
const MAX_PAINTING_H_HALLWAY = 1.9;
/** Inset from the wall surface so paintings don't z-fight. Sized to
 *  put the back of the painting frame box flush against the wall —
 *  frame box depth in painting.tsx is 0.025 m, half-depth + a 1 mm
 *  z-fight margin = ~0.014 m. Bumped to 0.02 for a comfortable hair
 *  of clearance. Exported because painting.tsx also needs it (the
 *  plaque parks itself at -PAINTING_WALL_OFFSET in local space to land
 *  back on the wall surface). */
export const PAINTING_WALL_OFFSET = 0.02;
/** Combined width of the museum plaque to the side of every painting.
 *  Sum of `PLAQUE_GAP` (0.06) and `PLAQUE_MOUNT_W` (0.308) in
 *  painting.tsx — keep in sync if those move. */
const PLAQUE_FOOTPRINT = 0.06 + 0.308;
/** Minimum gap from a painting (or its plaque) to a perpendicular room
 *  wall at wall corners. Enforced for both the painting's far edge and
 *  the plaque's far edge, so neither pushes into the side wall. */
const WALL_MARGIN = 0.3;
/** Minimum gap between a painting/plaque and the next painting/plaque
 *  on the same wall. Prevents paintings from grazing each other. */
const ADJACENT_GAP = 0.1;
/** Minimum air gap between a painting's bottom edge and the floor. The
 *  canonical wallY centre puts a max-height (3.2 m) painting's bottom at
 *  ~0.05 m, which reads as touching the floor. For tall paintings we lift
 *  the centre so the bottom clears the floor by this much; shorter paintings
 *  whose bottom already exceeds this clearance keep their canonical centre
 *  (the "salon hang" eye-line is the priority for typical works). */
const PAINTING_FLOOR_GAP = 0.2;

// ── Dense "print-room" hang (era.dense) ───────────────────────────────
// Floors whose corpus is dominated by small illustration plates (natural
// history + botany, ~1,200 works) can't fit on a one/two-per-cell salon
// hang. Instead each wall cell holds a size-graded grid of plates: the
// walls are packed to a roughly uniform AREA coverage, so a cell of big
// Audubon plates ends up with 1–2 feature works while a cell of tiny
// botanical plates tiles 6–9 of them mosaic-style. Because the placer
// consumes works tallest-first and fills cells in room order, the big
// plates cluster in the central rooms (feature hang, with plaques) and
// the small plates graduate outward into dense mosaic rooms.
/** Vertical span (metres) the grid block may occupy on a wall. Centred
 *  at DENSE_GRID_CENTER_OFFSET so it clears both floor and the 4.2 m
 *  ceiling with margin. */
const DENSE_GRID_H = 3.0;
/** Height above the floor of the grid block's centre. */
const DENSE_GRID_CENTER_OFFSET = 1.8;
/** Gap between neighbouring tiles in a dense grid. */
const DENSE_TILE_GAP = 0.14;
/** Hard cap on tiles per cell — a backstop against a pathological cell,
 *  never reached in practice at the tuned coverage. */
const DENSE_MAX_TILES = 12;
/** Fraction of the mean per-cell work-area each cell aims to fill.
 *  Filling to just under the mean spreads the works across every cell on
 *  the floor (rather than exhausting the corpus a room or two early from
 *  per-cell overshoot), so no gallery reads as empty. */
const DENSE_FILL = 0.82;

type Slot = {
  /** Anchor point (wall surface) in world space. */
  wallX: number;
  wallY: number;
  wallZ: number;
  /** World-space Y of the floor for this slot's room/hallway. Used at
   *  placement time to lift tall paintings off the floor — slot.wallY is
   *  the canonical CENTRE, but for paintings tall enough that
   *  centre - hM/2 < floorY + PAINTING_FLOOR_GAP we override the centre
   *  to keep a 20 cm air gap. */
  floorY: number;
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
 *  Plaques always hang on the painting's right (museum convention), so
 *  a right-corner cell has to fit BOTH the painting and its plaque
 *  inside the WALL_MARGIN budget — giving a narrower painting there.
 *  Width caps:
 *  - corner cells leave WALL_MARGIN between the painting (or its
 *    plaque) and the perpendicular wall
 *  - pure interior cells just need to leave room for one plaque + the
 *    next painting (ADJACENT_GAP between cells) */
function widthForRoomCell(args: { cornerStatus: CornerStatus }): number {
  const { cornerStatus } = args;
  const half = CELL_SIZE / 2;

  let maxWidth: number;

  if (cornerStatus === "both") {
    // 1-cell wall: perpendicular walls on both sides. Painting's left
    // edge must clear the left wall, and painting+plaque's right edge
    // must clear the right wall. Doesn't occur in rooms today
    // (ROOM_MIN_CELLS = 3), but the formula keeps things sane.
    maxWidth = 2 * (half - WALL_MARGIN) - PLAQUE_FOOTPRINT;
  } else if (cornerStatus === "right") {
    // Right perpendicular wall: painting + plaque must both clear it.
    maxWidth = 2 * (half - WALL_MARGIN - PLAQUE_FOOTPRINT);
  } else if (cornerStatus === "left") {
    // Left perpendicular wall: only the painting needs WALL_MARGIN
    // (plaque is on the right, far from the perpendicular wall).
    maxWidth = 2 * (half - WALL_MARGIN);
  } else {
    // Pure interior: ours is the only plaque sitting in the gap to the
    // right neighbour's painting.
    maxWidth = CELL_SIZE - PLAQUE_FOOTPRINT - ADJACENT_GAP;
  }

  return Math.max(0, Math.min(MAX_PAINTING_W, maxWidth));
}

/**
 * Compute every wall slot for a room. Walks each of the four walls cell
 * by cell; a cell becomes a slot unless a door on that side covers its
 * centre.
 *
 * Each slot is sized with awareness of where it sits along the wall:
 * cells at wall corners get tighter caps so neither the painting nor
 * its right-side plaque crashes through a perpendicular wall.
 *
 * Every cell is emitted as a single full-height slot; the distributor
 * converts individual cells to a two-row salon stack on demand when a
 * room's supply outgrows its single-row capacity.
 */
export function computeRoomSlots(room: RoomLayout): Slot[] {
  const { cellBounds, worldRect } = room;
  const rows = [{ y: worldRect.y + CANONICAL_Y_CENTER_OFFSET, maxHeight: MAX_PAINTING_H_ROOM }];
  const slots: Slot[] = [];

  const doorsBySide = {
    north: room.doors.filter((d) => d.side === "north"),
    south: room.doors.filter((d) => d.side === "south"),
    east: room.doors.filter((d) => d.side === "east"),
    west: room.doors.filter((d) => d.side === "west"),
  };

  // Per-wall slot construction. `viewerRightIsHigher` says whether the
  // viewer's right (the plaque side) corresponds to the higher or lower
  // coordinate along the wall axis — i.e., which end of the wall is
  // the "right corner" that must fit both painting and plaque.
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
    /** Returns a slot prototype (without Y / sizing / plaque side) for
     *  cell index `cellIdx` along the wall axis. The Y is filled in per
     *  row so a single buildBase covers both single- and double-row
     *  rooms. */
    buildBase: (cellIdx: number) => Omit<Slot, "wallY" | "maxWidth" | "maxHeight">;
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

      const maxWidth = widthForRoomCell({ cornerStatus });
      if (maxWidth <= 0) continue;

      const base = args.buildBase(cellIdx);
      for (const row of rows) {
        slots.push({
          ...base,
          wallY: row.y,
          maxWidth,
          maxHeight: row.maxHeight,
        });
      }
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
      wallZ: zNorth,
      floorY: worldRect.y,
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
      wallZ: zSouth,
      floorY: worldRect.y,
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
      wallZ: (z + 0.5) * CELL_SIZE,
      floorY: worldRect.y,
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
      wallZ: (z + 0.5) * CELL_SIZE,
      floorY: worldRect.y,
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
 *  corner-aware width rules as room walls. */
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

        const maxWidth = widthForRoomCell({ cornerStatus });
        if (maxWidth <= 0) continue;

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
          floorY: floor.y,
          rotationY,
          normalX,
          normalZ,
          maxWidth,
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

/** A sized work waiting for a wall: the natural display dimensions are
 *  computed once up front so the distributor can sort by height and
 *  decide which works need full-height single cells vs a salon stack. */
type SizedWork = { artwork: ArtworkListing; wM: number; hM: number };

/**
 * Distribute the floor's artworks into its rooms. Mutates
 * `floor.rooms[*].placements`.
 *
 *  - Every room hangs its own `room.artworks` (the movement bucket the
 *    floor builder assigned to it) on its own walls.
 *  - Each wall cell holds one work at eye level; when a room's supply
 *    exceeds its cell count, cells convert to a two-row salon stack
 *    (shortest works first) until the supply fits. A room's max
 *    capacity is therefore 2× its cell count.
 *  - Supply beyond a room's max capacity spills to free wall space in
 *    other rooms on the same floor, so nothing is dropped as long as
 *    the floor as a whole has room.
 */
export function distributePaintings(floor: FloorLayout): DistributionStats {
  if (floor.era.dense) return distributeDense(floor);

  // Stairwell rooms are excluded — their walls hold the spiral steps
  // and signs, not paintings.
  const containers = floor.rooms
    .filter((r) => !r.isStairwell)
    .map((room) => ({
      room,
      cells: computeRoomSlots(room),
      supply: room.artworks.map(sizeWork),
    }));

  // Trim each room's supply to its hard capacity (2 works per cell);
  // the excess goes into a floor-wide pool.
  const pool: SizedWork[] = [];
  for (const c of containers) {
    const cap = 2 * c.cells.length;
    if (c.supply.length > cap) pool.push(...c.supply.splice(cap));
  }

  // Hand the pool to whichever rooms still have spare wall space —
  // most-spare first, so spill clusters in under-filled rooms instead
  // of dusting one extra work into every room on the floor.
  pool.sort((a, b) => b.hM - a.hM);
  let dropped = 0;
  for (const work of pool) {
    let best: (typeof containers)[number] | null = null;
    let bestSpare = 0;
    for (const c of containers) {
      const spare = 2 * c.cells.length - c.supply.length;
      if (spare > bestSpare) {
        best = c;
        bestSpare = spare;
      }
    }
    if (!best) {
      dropped++;
      continue;
    }
    best.supply.push(work);
  }

  let roomSlotsTotal = 0;
  let roomSlotsFilled = 0;
  for (const c of containers) {
    placeRoomSupply(c.room, c.cells, c.supply);
    roomSlotsTotal += c.cells.length;
    roomSlotsFilled += Math.min(c.supply.length, c.cells.length);
  }

  return {
    roomSlotsTotal,
    roomSlotsFilled,
    hallwaySlotsTotal: 0,
    hallwaySlotsFilled: 0,
    dropped,
  };
}

/**
 * Dense print-room distribution (era.dense). Pools every work on the
 * floor, sizes them, and fills each wall cell to a roughly uniform area
 * coverage — so big plates hang 1–2 to a cell while tiny plates tile
 * many-to-a-cell. Works are consumed tallest-first and cells are walked
 * in room order, which grades the floor from feature rooms of large
 * plates to mosaic rooms of small ones. Nothing is dropped as long as
 * the floor's total wall area exceeds the works' combined area, which it
 * does by a wide margin at this corpus size.
 */
function distributeDense(floor: FloorLayout): DistributionStats {
  const containers = floor.rooms
    .filter((r) => !r.isStairwell)
    .map((room) => ({ room, cells: computeRoomSlots(room) }));

  const cells: Array<{ room: RoomLayout; slot: Slot }> = [];
  for (const c of containers) for (const slot of c.cells) cells.push({ room: c.room, slot });

  // Pool every work on the floor (the per-room movement buckets are
  // ignored here — the size grading below is the organising principle),
  // tallest first so the largest plates land in the first cells walked.
  const pool: SizedWork[] = containers
    .flatMap((c) => c.room.artworks.map(sizeWork))
    .sort((a, b) => b.hM - a.hM);

  const totalCells = cells.length;
  if (totalCells === 0) {
    return {
      roomSlotsTotal: 0,
      roomSlotsFilled: 0,
      hallwaySlotsTotal: 0,
      hallwaySlotsFilled: 0,
      dropped: pool.length,
    };
  }

  // Aim every cell at the same work-AREA target (mean area per cell).
  // Filling to an area target — not a fixed count — is what makes small
  // plates pack densely and large plates hang sparsely on the same floor.
  const totalArea = pool.reduce((sum, w) => sum + w.wM * w.hM, 0);
  const areaTarget = (totalArea / totalCells) * DENSE_FILL;

  let i = 0;
  let roomSlotsFilled = 0;
  for (const cell of cells) {
    if (i >= pool.length) break;
    let acc = 0;
    const group: SizedWork[] = [];
    while (i < pool.length && group.length < DENSE_MAX_TILES) {
      const w = pool[i++];
      group.push(w);
      acc += w.wM * w.hM;
      if (acc >= areaTarget) break;
    }
    placeCellGrid(cell.room, cell.slot, group);
    roomSlotsFilled += 1;
  }

  return {
    roomSlotsTotal: totalCells,
    roomSlotsFilled,
    hallwaySlotsTotal: 0,
    hallwaySlotsFilled: 0,
    dropped: pool.length - i,
  };
}

/** Hang a group of works in one wall cell as a centred grid. A lone work
 *  gets the canonical single hang (with plaque, a feature plate); two or
 *  more tile into a grid sized to the group's largest plate, plaques
 *  suppressed so the mosaic reads cleanly. */
function placeCellGrid(room: RoomLayout, slot: Slot, group: SizedWork[]): void {
  if (group.length === 0) return;
  if (group.length === 1) {
    room.placements.push(placeSingle(slot, group[0]));
    return;
  }

  const n = group.length;
  const gridWidth = slot.maxWidth;
  const gap = DENSE_TILE_GAP;

  // Size the grid to the group's largest plate; smaller ones aspect-fit
  // inside their tile with room to spare.
  let maxW = 0;
  let maxH = 0;
  for (const w of group) {
    if (w.wM > maxW) maxW = w.wM;
    if (w.hM > maxH) maxH = w.hM;
  }

  let colPitch = maxW + gap;
  let rowPitch = maxH + gap;
  const cols = Math.max(1, Math.min(n, Math.floor((gridWidth + gap) / colPitch)));
  const rows = Math.ceil(n / cols);

  // Scale the whole block down if it would overrun the cell's width or
  // the wall's vertical budget (rare — only very tall groups).
  let scale = 1;
  if (rows * rowPitch > DENSE_GRID_H) scale = Math.min(scale, DENSE_GRID_H / (rows * rowPitch));
  if (cols * colPitch > gridWidth + gap) {
    scale = Math.min(scale, (gridWidth + gap) / (cols * colPitch));
  }
  if (scale < 1) {
    colPitch *= scale;
    rowPitch *= scale;
  }

  // Wall axis: X for north/south walls (normal on Z), Z for east/west.
  const axisX = slot.normalZ !== 0 ? 1 : 0;
  const axisZ = slot.normalX !== 0 ? 1 : 0;
  const centerY = slot.floorY + DENSE_GRID_CENTER_OFFSET;
  const tileW = Math.max(0.1, colPitch - gap);
  const tileH = Math.max(0.1, rowPitch - gap);

  for (let idx = 0; idx < n; idx++) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    // Centre the (possibly partial) last row.
    const itemsInRow = Math.min(cols, n - r * cols);
    const du = (c - (itemsInRow - 1) / 2) * colPitch;
    const dv = ((rows - 1) / 2 - r) * rowPitch; // top row highest
    const { wM, hM } = fitTo(group[idx], tileW, tileH);
    room.placements.push({
      artwork: group[idx].artwork,
      position: [
        slot.wallX + du * axisX + slot.normalX * PAINTING_WALL_OFFSET,
        centerY + dv,
        slot.wallZ + du * axisZ + slot.normalZ * PAINTING_WALL_OFFSET,
      ],
      rotation: [0, slot.rotationY, 0],
      band: artworkBand(group[idx].artwork),
      widthM: wM,
      heightM: hM,
      plaque: false,
    });
  }
}

/**
 * Hang `supply` on `room`'s walls. Tallest works keep full-height
 * single cells; the shortest pair up into two-row salon stacks on just
 * enough cells that everything fits. Both singles and stacks spread
 * evenly along the wall sequence so a half-full room reads as evenly
 * hung rather than crowding the first wall.
 */
function placeRoomSupply(room: RoomLayout, cells: Slot[], supply: SizedWork[]): void {
  if (supply.length === 0 || cells.length === 0) return;

  const sorted = [...supply].sort((a, b) => b.hM - a.hM);
  const nCells = cells.length;
  const n = Math.min(sorted.length, 2 * nCells);
  const nStack = Math.max(0, n - nCells);
  const nSingles = Math.min(n, nCells) - nStack;

  const singles = sorted.slice(0, nSingles);
  // Stacked works, still tallest-first: the first half become the lower
  // row (taller of each pair), the back half the upper row. Pair the
  // tallest lower with the shortest upper so combined heights stay
  // balanced and the upper row needs the least shrinking.
  const lowers = sorted.slice(nSingles, nSingles + nStack);
  const uppers = sorted.slice(nSingles + nStack, nSingles + 2 * nStack);

  // Choose which occupied positions stack: spread them evenly through
  // the wall walk order, with singles taking the positions in between.
  const occupied = nSingles + nStack;
  const isStackCell = new Array<boolean>(occupied).fill(false);
  for (let i = 0; i < nStack; i++) {
    isStackCell[Math.floor(((i + 0.5) * occupied) / nStack)] = true;
  }

  // Walk the first `occupied` cells (spread across all cells when the
  // room is under-full) and pull from singles / pairs in order.
  let singleIdx = 0;
  let stackIdx = 0;
  for (let i = 0; i < occupied; i++) {
    // Spread occupied cells across the whole room when under-filled.
    const cell = cells[Math.floor((i * nCells) / occupied)];
    if (isStackCell[i]) {
      const lower = lowers[stackIdx];
      const upper = uppers[nStack - 1 - stackIdx];
      stackIdx++;
      placeStackedPair(room, cell, lower, upper);
    } else {
      room.placements.push(placeSingle(cell, singles[singleIdx]));
      singleIdx++;
    }
  }
}

/** Place one work at the canonical eye-level hang in a full-height cell. */
function placeSingle(slot: Slot, work: SizedWork): Placement {
  const { wM, hM } = fitTo(work, slot.maxWidth, slot.maxHeight);
  // Lift the centre for paintings tall enough that the canonical hang
  // would put their bottom edge into the floor. Most paintings keep the
  // canonical eye-line; only the tallest (≥ 3.0 m, which after fitting
  // is essentially the floor-to-near-ceiling altarpieces) get raised so
  // the bottom clears the floor by PAINTING_FLOOR_GAP. Top is bounded by
  // the slot's maxHeight cap, so even after lifting the painting can't
  // reach the ceiling.
  const minCenterY = slot.floorY + PAINTING_FLOOR_GAP + hM / 2;
  const centerY = Math.max(slot.wallY, minCenterY);
  return makePlacement(slot, work.artwork, wM, hM, centerY);
}

/** Place two works as a salon stack in one cell: `lower` slightly below
 *  the eye line, `upper` directly above it with a fixed air gap. The
 *  upper work's height budget is whatever remains between the lower
 *  work's top edge and STACK_MAX_TOP, so small pairs bracket the eye
 *  line while taller pairs climb the wall without hitting the ceiling. */
function placeStackedPair(
  room: RoomLayout,
  slot: Slot,
  lowerWork: SizedWork,
  upperWork: SizedWork,
) {
  const lower = fitTo(lowerWork, slot.maxWidth, STACK_LOWER_MAX_H);
  const lowerCenterY = slot.floorY + STACK_LOWER_CENTER_OFFSET;
  room.placements.push(makePlacement(slot, lowerWork.artwork, lower.wM, lower.hM, lowerCenterY));

  const lowerTopOffset = STACK_LOWER_CENTER_OFFSET + lower.hM / 2;
  const upperBudget = Math.min(
    STACK_UPPER_MAX_H,
    STACK_MAX_TOP_OFFSET - lowerTopOffset - STACK_GAP,
  );
  const upper = fitTo(upperWork, slot.maxWidth, upperBudget);
  const upperCenterY = slot.floorY + lowerTopOffset + STACK_GAP + upper.hM / 2;
  room.placements.push(makePlacement(slot, upperWork.artwork, upper.wM, upper.hM, upperCenterY));
}

function makePlacement(
  slot: Slot,
  artwork: ArtworkListing,
  wM: number,
  hM: number,
  centerY: number,
): Placement {
  return {
    artwork,
    position: [
      slot.wallX + slot.normalX * PAINTING_WALL_OFFSET,
      centerY,
      slot.wallZ + slot.normalZ * PAINTING_WALL_OFFSET,
    ],
    rotation: [0, slot.rotationY, 0],
    band: artworkBand(artwork),
    widthM: wM,
    heightM: hM,
  };
}

/** Scale a sized work down (never up) to fit a width/height cap,
 *  preserving aspect. */
function fitTo(work: SizedWork, maxWidth: number, maxHeight: number): { wM: number; hM: number } {
  const scale = Math.min(maxWidth / work.wM, maxHeight / work.hM, 1);
  return { wM: work.wM * scale, hM: work.hM * scale };
}

/** Natural display dimensions in metres, before any slot fitting.
 *  Pixel aspect drives SHAPE; realDimensions drives SIZE (long edge in
 *  metres). The metadata's widthCm/heightCm is unreliable as a shape
 *  signal — the file we actually render can disagree with it for several
 *  reasons:
 *    - Predella case: Wikimedia records a strip's height for an
 *      altarpiece file (e.g. Botticelli's Coronation: 269 × 21 cm
 *      metadata vs ~3:1 scan).
 *    - Orientation flip: ~44 of 109 Turner sketchbook pages have
 *      widthCm/heightCm swapped relative to the scan.
 *    - Cropped scan: handscroll metadata records the full physical
 *      painting; the scan covers a shorter section (Eight Flowers:
 *      333.9 × 29.4 cm vs 6920 × 835 px = 8.29:1).
 *  The pixel aspect is what the user actually sees, so use it for shape
 *  and only fall back when missing. realDimensions still controls the
 *  long-edge scale so a small miniature stays smaller than an altarpiece. */
function sizeWork(artwork: ArtworkListing): SizedWork {
  const dims = artwork.realDimensions;
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

  // Pocket-sized engravings would be invisible at true scale — bring
  // them up to a readable small-print size.
  const longEdge = Math.max(wM, hM);
  if (longEdge < MIN_DISPLAY_LONG_EDGE) {
    const s = MIN_DISPLAY_LONG_EDGE / longEdge;
    wM *= s;
    hM *= s;
  }

  return { artwork, wM, hM };
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
