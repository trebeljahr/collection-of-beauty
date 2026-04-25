// Shared types for the multi-floor dungeon gallery layout.
// The contract between the dungeon generator, the painting placer, and
// the R3F renderer lives here.

import type { Artwork } from "@/lib/data";
import type { Era } from "@/lib/gallery-eras";

export type Band = "small" | "medium" | "large";

export type Placement = {
  artwork: Artwork;
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
  connectsTo: { kind: "hallway"; hallwayId: string } | { kind: "staircase"; staircaseId: string };
};

export type RoomLayout = {
  id: string;
  floorIndex: number;
  movement: string;
  title: string;
  description: string;
  isAnchor: boolean;
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
  artworks: Artwork[];
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

  // ── U-stair (switchback) geometry ──────────────────────────────────
  // The stair is a rectangular footprint in the stairwell room. Two
  // straight flights run side-by-side along the depth axis with a flat
  // landing at the far end:
  //
  //   facing side (low z = north) ←———————→ landing side (high z = south)
  //   ┌──────────────┬──────────────┐
  //   │ lower entry  │  upper exit  │   ← flush with floor at face side
  //   │   (west)     │   (east)     │
  //   │   ascending  │  descending  │
  //   │      ↑       │      ↓       │   (drawing — both flights have
  //   │      ↑       │      ↓       │    their high end at the landing)
  //   │              │              │
  //   ├──────────────┴──────────────┤
  //   │         midway landing      │   at midwayY = (lowerY+upperY)/2
  //   └─────────────────────────────┘
  //
  // Both entries sit on the same face of the footprint, at the lower
  // and upper floor's Y respectively, so a player walking in from
  // either floor's stairwell door always meets the stair flush with
  // their own walking surface. A central rib between the flights
  // forces the player to use the landing to switch sides — that's
  // what gives the stair its switchback feel and avoids a 0.6 m
  // jump when crossing midline mid-flight.
  /** Centre of the stair footprint in world XZ. */
  centerX: number;
  centerZ: number;
  /** Footprint width along X (covers both flights side-by-side). */
  width: number;
  /** Footprint depth along Z (flight length + landing depth). */
  depth: number;
  /** Y of the lower-floor entry. */
  lowerY: number;
  /** Y of the upper-floor exit. */
  upperY: number;
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
  hallways: HallwayLayout[];
  stairsIn: Staircase[];
  stairsOut: Staircase[];
};

export type DungeonLayout = {
  floors: FloorLayout[];
  entry: { floorIndex: number; worldPosition: [number, number, number] };
  allRooms: RoomLayout[];
  allHallways: HallwayLayout[];
  allStaircases: Staircase[];
};
