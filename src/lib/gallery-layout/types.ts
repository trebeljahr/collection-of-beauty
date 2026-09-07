// Shared types for the multi-floor museum gallery layout.
// The contract between the layout builder, the painting placer, and
// the R3F renderer lives here.

import type { ArtworkListing } from "@/lib/data";
import type { Era } from "@/lib/gallery-eras";

export type Band = "small" | "medium" | "large";

export type Placement = {
  artwork: ArtworkListing;
  position: [number, number, number];
  rotation: [number, number, number];
  band: Band;
  /** Painting width in world metres (already aspect-fit to the slot). */
  widthM: number;
  /** Painting height in world metres (already aspect-fit to the slot). */
  heightM: number;
};

export type Door = {
  side: "north" | "south" | "east" | "west";
  worldX: number;
  worldZ: number;
  worldY: number;
  width: number;
  /** The room on the other side of this shared wall. Every connection in
   *  the museum is a door cut through a wall two rooms share — there are
   *  no corridors (`FloorLayout.hallways` is permanently empty) and the
   *  stairwell is itself a room, so a `hallway` / `staircase` variant
   *  had nothing to describe and was never constructed. */
  connectsTo: { kind: "room"; roomId: string };
};

export type RoomLayout = {
  id: string;
  floorIndex: number;
  movement: string;
  title: string;
  description: string;
  isAnchor: boolean;
  /** 1-based room number within the floor, in plan order — the number
   *  printed in the room's cell on the map. `null` for the stairwell,
   *  which is drawn as a stair glyph instead. Rooms are numbered rather
   *  than labelled on the map because an era's rooms nearly all carry
   *  the same movement name, so the labels truncated to the same
   *  unreadable stub in every cell. */
  roomNumber: number | null;
  /** True for the stairwell room. Rendered without a ceiling so the
   *  ascending stair flight is visible, and without a full floor — the
   *  stair geometry provides the walking surface between landings. */
  isStairwell: boolean;
  cellBounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  /** World rectangle of the interior floor (walls exclusive). */
  worldRect: {
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
    y: number;
  };
  doors: Door[];
  hasBench: boolean;
  placements: Placement[];
  artworks: ArtworkListing[];
  /** Per-room floor tint, picked deterministically from the era's
   *  palette so reloads are stable and floors read as a coherent set
   *  while individual rooms feel distinct underfoot. */
  floorColor: string;
  /** Which walls of this room should NOT be rendered, because a
   *  neighbouring room shares that wall and is responsible for drawing
   *  it (with door cuts). Prevents z-fighting on shared boundaries. */
  suppressWalls?: { north?: boolean; south?: boolean; east?: boolean; west?: boolean };
};

export type HallwayLayout = {
  id: string;
  floorIndex: number;
  cells: Array<{ x: number; z: number }>;
  placements: Placement[];
};

export type Staircase = {
  id: string;
  lowerFloor: number;
  upperFloor: number;
  /** Human-readable era title for each end — used as a navigation sign
   *  at the corresponding end of the flight. */
  lowerLabel: string;
  upperLabel: string;

  // ── Open-well spiral geometry ──────────────────────────────────────
  // One revolution of an annular spiral around an empty central well.
  // Going up = walk counter-clockwise; going down = walk clockwise.
  // The well is open vertically — the same XZ on every floor — so the
  // player can see all the way from the ground floor up through every
  // storey. Adjacent stairs (S_i and S_{i+1}) line up vertically and
  // the player transitions between them when their cumulative angle
  // passes 2π (ascending) or 0 (descending).
  /** Centre of the open well (world XZ). */
  centerX: number;
  centerZ: number;
  /** Inner radius — the open well begins here. The spiral treads
   *  occupy [innerRadius, outerRadius]. */
  innerRadius: number;
  /** Outer radius — outer edge of the treads. */
  outerRadius: number;
  /** Tread count for one full revolution. */
  numSteps: number;
  /** +1 = atan2 angle increases as the player walks "up the stair". */
  direction: 1 | -1;
  /** Y of the lowest tread. */
  lowerY: number;
  /** Y of the highest tread (= lowerY + FLOOR_SEPARATION). */
  upperY: number;
  /** World atan2 angle (atan2(dz, dx)) at which step 0 sits. The player
   *  walking onto the spiral from the stairwell door enters at this
   *  angle, so the on-ramp greets them flush with the floor. */
  entryAngle: number;
};

export type FloorLayout = {
  index: number;
  era: Era;
  /** World Y of the walking surface. */
  y: number;
  gridSize: { x: number; z: number };
  /** Flat x*z grid; 1 = traversable (Room | Hallway | Stairs). */
  walkable: Uint8Array;
  /** -1 for hallway/stair, else room index into `rooms`. */
  cellOwner: Int16Array;
  /** Blocks the edge between cell (x, z) and (x+1, z) — set to 1 when
   *  a wall divides them and no door cut spans the cell midpoint.
   *  Indexed as `z * (gridSize.x - 1) + x`. */
  blockedEdgesEW: Uint8Array;
  /** Blocks the edge between cell (x, z) and (x, z+1). Indexed as
   *  `z * gridSize.x + x`. */
  blockedEdgesNS: Uint8Array;
  rooms: RoomLayout[];
  /** Always empty — `layoutMuseum` builds every connection as a shared
   *  wall with a door cut, never a corridor. `HallwayRenderer` still
   *  exists and would render these, but it is the one `Painting` call
   *  site with no reveal gate: it mounts every placement immediately,
   *  where rooms mount/unmount them by distance. Reviving hallways
   *  without porting `useRevealedPlacements` across would reintroduce
   *  the texture-LRU churn documented at `room-geometry.tsx`'s
   *  PAINTING_UNLOAD_RADIUS — every hallway painting pinning a texture
   *  on every LOD tick until the floor stops rendering reliably. */
  hallways: HallwayLayout[];
  stairsIn: Staircase[];
  stairsOut: Staircase[];
};

export type MuseumLayout = {
  floors: FloorLayout[];
  entry: { floorIndex: number; worldPosition: [number, number, number] };
  allRooms: RoomLayout[];
  allHallways: HallwayLayout[];
  allStaircases: Staircase[];
};
