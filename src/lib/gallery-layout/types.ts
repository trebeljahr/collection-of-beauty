// Shared types for the multi-floor museum gallery layout.
// The contract between the layout builder, the painting placer, and
// the R3F renderer lives here.

import type { ArtworkListing } from "@/lib/data";
import type { Era, EraId } from "@/lib/gallery-eras";
import type { FrameDesign } from "./frame-design";
import type { GrandStair } from "./grand-stair";

export type Band = "small" | "medium" | "large";

/** A rectangle of grid cells, both ends inclusive. */
export type CellRect = { xMin: number; xMax: number; zMin: number; zMax: number };

export type Placement = {
  artwork: ArtworkListing;
  position: [number, number, number];
  rotation: [number, number, number];
  band: Band;
  /** Painting width in world metres (already aspect-fit to the slot). */
  widthM: number;
  /** Painting height in world metres (already aspect-fit to the slot). */
  heightM: number;
  /** The frame, when the hang chose it: a Grand Hall pair shares one.
   *  Unset, the work hangs in its own (`pickFrameDesign`). */
  frame?: FrameDesign;
  /** Index into the room's `dividers` when the work hangs on one. Its
   *  position is then on that divider's face, not on a room wall. */
  divider?: number;
  /** A work hung at its real size on a storey of a hall or a spiral
   *  room (`giants.ts`): too large for a room, or a tall work on a
   *  spiral's storey. It has no picture light of its own: the room's
   *  washers light its wall, set out about it (stairwell-light.tsx). */
  giant?: true;
  /** Hung on a stair hall's sheer wall (`RoomLayout.sheer`): the wall
   *  runs on under and over it, past the floor and the ceiling of the
   *  storey it is filed under. */
  sheer?: true;
  /** Where the plaque hangs when not beside the frame at eye level
   *  over the room's floor (`PLAQUE_EYE`): metres from the canvas
   *  centre to the plaque's, `dy` up and `dx` to the viewer's right.
   *  `null` is no plaque, for a work hung out of reading distance. */
  plaque?: { dy: number; dx?: number } | null;
};

export type Door = {
  side: "north" | "south" | "east" | "west";
  worldX: number;
  worldZ: number;
  worldY: number;
  width: number;
  /** Clear height of the opening, metres. */
  height: number;
  /** A wide opening on a room sequence's main axis, cased like a wall
   *  opening instead of trimmed like a door. Set by the layout; the
   *  width and height above already carry its size. */
  portal: boolean;
  /** The room on the other side of this shared wall. Every connection in
   *  the museum is a door cut through a wall two rooms share — there are
   *  no corridors (`FloorLayout.hallways` is permanently empty) and the
   *  stairwell is itself a room, so a `hallway` / `staircase` variant
   *  had nothing to describe and was never constructed. */
  connectsTo: { kind: "room"; roomId: string };
};

/**
 * A freestanding wall inside a room: a wing wall reaching in from a
 * side wall, or a panel standing clear of every wall. It lies on a cell
 * line, so collision can hold it as blocked cell edges, and it is
 * `DIVIDER_THICKNESS` thick, centred on that line. Both faces are
 * hangable wall, unless one is `bare`.
 */
export type Divider = {
  /** World axis the wall runs along. */
  axis: "x" | "z";
  /** Grid line it stands on: a z line when it runs along x, an x line
   *  when it runs along z. Line `n` is the boundary between cell `n - 1`
   *  and cell `n`. */
  line: number;
  /** Extent along `axis`, in grid lines (`start < end`). Whole lines
   *  for a wall built off a room wall; a screen centred on a door ends
   *  on half lines. */
  start: number;
  end: number;
  /** The face that hangs nothing: the one looking toward lower or
   *  higher coordinates across the wall. Set on a door screen, whose
   *  back is to its door (`divider-plans.ts`). */
  bare?: "low" | "high";
};

/** A gallery bench: its centre on the floor in world metres, and the
 *  world axis its long side runs along. */
export type Bench = {
  x: number;
  z: number;
  along: "x" | "z";
};

/** A hole in a stair hall's floor or ceiling, world metres. */
export type WorldOpening =
  | {
      kind: "rects";
      rects: Array<{ xMin: number; xMax: number; zMin: number; zMax: number }>;
      /** The rectangles' edge as one closed line of [x, z] points. */
      outline: Array<[number, number]>;
    }
  | { kind: "disc"; x: number; z: number; r: number };

export type RoomLayout = {
  id: string;
  floorIndex: number;
  /** The era this room shows, when its floor holds more than one (the
   *  wings plan, `layout-wings.ts`). Unset in the tower, where a floor
   *  is an era: read it through `eraOfRoom`. */
  era?: EraId;
  /** The era whose colours the room takes when they are not its own
   *  era's: a stair hall is one colour through every storey. Read a
   *  room's palette through `paletteOfRoom`. */
  paletteEra?: EraId;
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
  /** True for the stairwell room. Its ceiling is a storey up and has the
   *  well cut out of it, so the ascending stair flight is visible
   *  (`StairwellLight`), and it has no full floor — the stair geometry
   *  provides the walking surface between landings. */
  isStairwell: boolean;
  /** A stair hall with a grand stair (`grand-stair.ts`): the hole in its
   *  floor where the stair from below arrives, and the hole in its
   *  ceiling where its own stair climbs out. `null` is no hole. Both
   *  unset in a spiral's stairwell, which is cut round by rule. */
  floorOpening?: WorldOpening | null;
  ceilingOpening?: WorldOpening | null;
  /** A stair hall's sheer wall (`GrandStair.sheerWall`): the side it is
   *  on, and the depth of the strip along it that the hall's void takes
   *  on every floor over the stair's foot. The same on each storey of
   *  the hall; `floorOpening` and `ceilingOpening` say whether this
   *  storey has floor or ceiling there. `base` and `roof` are the world
   *  heights the wall stands between: the hall's floor and its glazed
   *  ceiling four storeys up. */
  sheer?: { side: Door["side"]; depth: number; base: number; roof: number };
  /** What a grand stair hall is on this floor, for the map: the stair
   *  leaves it, arrives on it, or only its void passes through. */
  stairGlyph?: "up" | "down" | "both" | "void";
  cellBounds: CellRect;
  /** World rectangle of the interior floor (walls exclusive). */
  worldRect: {
    xMin: number;
    xMax: number;
    zMin: number;
    zMax: number;
    y: number;
  };
  doors: Door[];
  /** Height of the ceiling plane above the floor, metres. Walls run on
   *  up to the slab above; this is where the room stops. */
  ceilingHeight: number;
  /** Freestanding walls, in grid lines. Empty for most rooms. */
  dividers: Divider[];
  benches: Bench[];
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
  /** What the floor is called on the map and the entry card, when it
   *  holds more than one era. Unset in the tower: read it through
   *  `floorTitle`. */
  title?: string;
  /** The entry card's line under the title, set with `title`. Read it
   *  through `floorBlurb`. */
  blurb?: string;
  /** World Y of the walking surface. */
  y: number;
  gridSize: { x: number; z: number };
  /** Flat x*z grid; 1 = traversable (Room | Hallway | Stairs). */
  walkable: Uint8Array;
  /** -1 for hallway/stair, else room index into `rooms`. */
  cellOwner: Int16Array;
  /** Blocks the edge between cell (x, z) and (x+1, z) — set to 1 when
   *  a wall divides them and no door opening reaches into the edge, or
   *  when a room's divider stands on it. Indexed as
   *  `z * (gridSize.x - 1) + x`. */
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
  /** Grand stairs that arrive on and leave this floor. Unset in the
   *  tower, whose stairs are all spirals. */
  grandStairsIn?: GrandStair[];
  grandStairsOut?: GrandStair[];
  /** Every grand stair whose hall this floor is a storey of: the floor
   *  it leaves, the floor it arrives on and each balcony floor above. */
  grandHalls?: GrandStair[];
};

export type MuseumLayout = {
  floors: FloorLayout[];
  entry: { floorIndex: number; worldPosition: [number, number, number] };
  allRooms: RoomLayout[];
  allHallways: HallwayLayout[];
  allStaircases: Staircase[];
  /** Every grand stair of the building. Unset in the tower. */
  grandStairs?: GrandStair[];
};
