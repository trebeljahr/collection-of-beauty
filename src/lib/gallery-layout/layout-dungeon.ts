// Multi-floor dungeon gallery — top-level layout orchestrator.
//
// Takes all artworks, assigns them to eras (one floor each), and for
// each floor runs the ported ricos.site dungeon generator to produce a
// 2D room + hallway layout. Paintings are NOT placed yet — M3 handles
// that. Doors ARE computed so M2 can render walls with openings.

import type { Artwork } from "@/lib/data";
import { ERAS, type Era, type EraId, assignEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { DungeonGenerator3D } from "@/lib/dungeon/generator";
import { CellType3D, Room3D, Vector3Int } from "@/lib/dungeon/types";

import {
  CELL_SIZE,
  DOOR_WIDTH,
  WALL_THICKNESS,
  cellCenterToWorld,
  floorY,
} from "./world-coords";
import type {
  Door,
  DungeonLayout,
  FloorLayout,
  HallwayLayout,
  RoomLayout,
} from "./types";

// --- Configuration --------------------------------------------------------

/** Floor grid is square, this many cells per side (plus 1 of slack for
 *  the generator's strict bounds check — see the `size` computation). */
const FLOOR_GRID_SIZE = 28;

/** Non-anchor rooms target per floor. Generator tries random placement
 *  this many times; the MST step ignores rooms that never got placed. */
const DEFAULT_NON_ANCHOR_ROOMS = 5;

/** Min/max room size in cells (X and Z; Y is always 1). */
const ROOM_MIN_CELLS = 3;
const ROOM_MAX_CELLS = 6;

// --- Public entry ---------------------------------------------------------

export function layoutDungeon(allArtworks: Artwork[]): DungeonLayout {
  const byEra = bucketByEra(allArtworks);

  const floors: FloorLayout[] = [];
  const allRooms: RoomLayout[] = [];
  const allHallways: HallwayLayout[] = [];

  for (const era of ERAS) {
    const eraArtworks = byEra.get(era.id) ?? [];
    const floor = buildFloor(era, eraArtworks);
    floors.push(floor);
    allRooms.push(...floor.rooms);
    allHallways.push(...floor.hallways);
  }

  // Entry point: ground floor, center of the anchor room (or fallback
  // to the centre of the grid if the anchor didn't place).
  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const entryWorld: [number, number, number] = anchor
    ? [
        (anchor.worldRect.xMin + anchor.worldRect.xMax) / 2,
        anchor.worldRect.y,
        (anchor.worldRect.zMin + anchor.worldRect.zMax) / 2,
      ]
    : [
        (FLOOR_GRID_SIZE * CELL_SIZE) / 2,
        floorY(0),
        (FLOOR_GRID_SIZE * CELL_SIZE) / 2,
      ];

  return {
    floors,
    entry: { floorIndex: 0, worldPosition: entryWorld },
    allRooms,
    allHallways,
    allStaircases: [],
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
  // Group artworks by movement so each movement becomes a room.
  const byMovement = new Map<string, Artwork[]>();
  for (const a of eraArtworks) {
    const key = a.movement && a.movement.trim() ? a.movement : era.title;
    if (!byMovement.has(key)) byMovement.set(key, []);
    byMovement.get(key)!.push(a);
  }

  // Anchor resolution: prefer the configured anchor movement; if the
  // data has zero works for it, promote the largest movement to anchor
  // so the era still has a grand hall.
  let anchorMovement = era.anchor.movement;
  const configuredHasWorks = (byMovement.get(anchorMovement)?.length ?? 0) > 0;
  if (!configuredHasWorks) {
    const biggest = Array.from(byMovement.entries()).sort(
      (a, b) => b[1].length - a[1].length,
    )[0];
    if (biggest) anchorMovement = biggest[0];
  }

  // Order movements: anchor first (if present), then by size descending.
  const movementList = Array.from(byMovement.entries()).sort((a, b) => {
    if (a[0] === anchorMovement) return -1;
    if (b[0] === anchorMovement) return 1;
    return b[1].length - a[1].length;
  });

  const seed = `era-${era.id}-v1-${eraArtworks.length}`;
  // Grid Y is padded to 2 even though each floor is 1 cell tall. The
  // ported generator's bounds check rejects any room whose yMax equals
  // size.y (off-by-one in the original), so with size.y = 1 *every*
  // random placement at y = 0 would be rejected. The pathfinder only
  // ever uses y = 0 because all rooms have y-size 1.
  const size = new Vector3Int(FLOOR_GRID_SIZE + 1, 2, FLOOR_GRID_SIZE + 1);
  const roomMin = new Vector3Int(ROOM_MIN_CELLS, 1, ROOM_MIN_CELLS);
  const roomMax = new Vector3Int(ROOM_MAX_CELLS, 1, ROOM_MAX_CELLS);

  const roomCountTarget = Math.max(
    2,
    Math.min(movementList.length, DEFAULT_NON_ANCHOR_ROOMS + 1),
  );

  const gen = new DungeonGenerator3D(
    size,
    roomCountTarget,
    roomMax,
    roomMin,
    seed,
  );

  // --- Anchor pre-placement ---
  const anchorArtworks = byMovement.get(anchorMovement);
  let anchorRoom: Room3D | null = null;
  if (anchorArtworks && anchorArtworks.length > 0) {
    const spec = era.anchor;
    const ax = clampAnchorLocation(spec, size, "x");
    const az = clampAnchorLocation(spec, size, "z");
    const sizeX = Math.max(spec.minCells.x, ROOM_MIN_CELLS);
    const sizeZ = Math.max(spec.minCells.z, ROOM_MIN_CELLS);
    anchorRoom = new Room3D(
      new Vector3Int(ax, 0, az),
      new Vector3Int(sizeX, 1, sizeZ),
    );
    gen.addAnchorRoom(anchorRoom);
  }

  const grid = gen.generate();
  const roomRects = gen.rooms;

  // --- Assign movements to generator rooms ---
  const movementsQueue = movementList.map(([name, arr]) => ({
    name,
    artworks: arr,
  }));

  const roomLayouts: RoomLayout[] = [];
  let movementIdx = 0;
  for (let r = 0; r < roomRects.length; r++) {
    const rect = roomRects[r];
    const isAnchor = anchorRoom !== null && rect === anchorRoom;

    let name: string;
    let artworks: Artwork[];
    if (isAnchor) {
      name = anchorMovement;
      artworks = byMovement.get(anchorMovement) ?? [];
      movementsQueue.splice(
        movementsQueue.findIndex((m) => m.name === anchorMovement),
        1,
      );
    } else {
      const picked = movementsQueue[movementIdx++];
      if (picked) {
        name = picked.name;
        artworks = picked.artworks;
      } else {
        name = era.title;
        artworks = [];
      }
    }

    roomLayouts.push({
      id: slugify(`${era.id}-${name}`) || `${era.id}-room-${r}`,
      floorIndex: era.index,
      movement: name,
      title: name,
      description: describeRoom(name, artworks),
      isAnchor,
      cellBounds: {
        xMin: rect.bounds.xMin,
        xMax: rect.bounds.xMax - 1,
        zMin: rect.bounds.zMin,
        zMax: rect.bounds.zMax - 1,
      },
      worldRect: {
        xMin: rect.bounds.xMin * CELL_SIZE + WALL_THICKNESS,
        xMax: rect.bounds.xMax * CELL_SIZE - WALL_THICKNESS,
        zMin: rect.bounds.zMin * CELL_SIZE + WALL_THICKNESS,
        zMax: rect.bounds.zMax * CELL_SIZE - WALL_THICKNESS,
        y: floorY(era.index),
      },
      doors: [], // computed below
      hasBench: isAnchor,
      placements: [],  // M3 will populate
      artworks,
    });
  }

  // --- Hallway extraction ---
  const hallways = extractHallways(grid, size, era.index);

  // --- Door computation ---
  // Build a cell→hallwayId lookup, then scan each room's perimeter for
  // cells that are Hallway (or Stairs, later) and open doors there.
  const cellHallway = new Map<number, string>();
  for (const hw of hallways) {
    for (const c of hw.cells) {
      cellHallway.set(c.z * size.x + c.x, hw.id);
    }
  }

  for (let i = 0; i < roomLayouts.length; i++) {
    roomLayouts[i].doors = computeDoorsForRoom(
      roomRects[i],
      grid,
      size,
      era.index,
      cellHallway,
    );
  }

  // --- Walkable mask + cell owner ---
  const walkable = new Uint8Array(size.x * size.z);
  const cellOwner = new Int16Array(size.x * size.z);
  cellOwner.fill(-1);

  for (let x = 0; x < size.x; x++) {
    for (let z = 0; z < size.z; z++) {
      const v = grid.getValue(new Vector3Int(x, 0, z));
      if (
        v === CellType3D.Room ||
        v === CellType3D.RoomCenterAxis ||
        v === CellType3D.Hallway ||
        v === CellType3D.Stairs
      ) {
        walkable[z * size.x + x] = 1;
      }
    }
  }

  for (let i = 0; i < roomLayouts.length; i++) {
    const rl = roomLayouts[i];
    for (let x = rl.cellBounds.xMin; x <= rl.cellBounds.xMax; x++) {
      for (let z = rl.cellBounds.zMin; z <= rl.cellBounds.zMax; z++) {
        cellOwner[z * size.x + x] = i;
      }
    }
  }

  return {
    index: era.index,
    era,
    y: floorY(era.index),
    gridSize: { x: size.x, z: size.z },
    walkable,
    cellOwner,
    rooms: roomLayouts,
    hallways,
    stairsIn: [],
    stairsOut: [],
  };
}

// --- Anchor placement helper ---------------------------------------------

function clampAnchorLocation(
  spec: { preferredLocation: "center" | "back" | "wing"; minCells: { x: number; z: number } },
  size: Vector3Int,
  axis: "x" | "z",
): number {
  const room = spec.minCells[axis];
  const full = axis === "x" ? size.x : size.z;

  switch (spec.preferredLocation) {
    case "center":
      return Math.floor(full / 2 - room / 2);
    case "back":
      if (axis === "z") return Math.max(2, full - room - 3);
      return Math.floor(full / 2 - room / 2);
    case "wing":
      if (axis === "x") return Math.max(2, full - room - 3);
      return Math.floor(full / 2 - room / 2);
  }
}

// --- Door computation -----------------------------------------------------

function computeDoorsForRoom(
  rect: Room3D,
  grid: { getValue(p: Vector3Int): CellType3D; inBounds(p: Vector3Int): boolean },
  size: Vector3Int,
  floorIndex: number,
  cellHallway: Map<number, string>,
): Door[] {
  const doors: Door[] = [];
  const b = rect.bounds;
  const y = floorY(floorIndex);

  // Scan each wall's perimeter, collect door-candidate cells, then dedupe
  // contiguous runs to the midpoint of the run (at most 2 doors per side).
  for (const side of ["north", "south", "west", "east"] as const) {
    const candidates: number[] = [];
    if (side === "north" || side === "south") {
      const z = side === "north" ? b.zMin - 1 : b.zMax;
      for (let x = b.xMin; x < b.xMax; x++) {
        const outside = new Vector3Int(x, 0, z);
        if (!grid.inBounds(outside)) continue;
        const v = grid.getValue(outside);
        if (v === CellType3D.Hallway || v === CellType3D.Stairs) {
          candidates.push(x);
        }
      }
    } else {
      const x = side === "west" ? b.xMin - 1 : b.xMax;
      for (let z = b.zMin; z < b.zMax; z++) {
        const outside = new Vector3Int(x, 0, z);
        if (!grid.inBounds(outside)) continue;
        const v = grid.getValue(outside);
        if (v === CellType3D.Hallway || v === CellType3D.Stairs) {
          candidates.push(z);
        }
      }
    }

    if (candidates.length === 0) continue;

    const runs = groupContiguous(candidates);
    const picks = runs.slice(0, 2).map((run) =>
      run[Math.floor(run.length / 2)],
    );

    for (const idx of picks) {
      let worldX: number;
      let worldZ: number;
      let outside: Vector3Int;
      if (side === "north") {
        worldX = (idx + 0.5) * CELL_SIZE;
        worldZ = b.zMin * CELL_SIZE;
        outside = new Vector3Int(idx, 0, b.zMin - 1);
      } else if (side === "south") {
        worldX = (idx + 0.5) * CELL_SIZE;
        worldZ = b.zMax * CELL_SIZE;
        outside = new Vector3Int(idx, 0, b.zMax);
      } else if (side === "west") {
        worldX = b.xMin * CELL_SIZE;
        worldZ = (idx + 0.5) * CELL_SIZE;
        outside = new Vector3Int(b.xMin - 1, 0, idx);
      } else {
        worldX = b.xMax * CELL_SIZE;
        worldZ = (idx + 0.5) * CELL_SIZE;
        outside = new Vector3Int(b.xMax, 0, idx);
      }
      const hallwayId = cellHallway.get(outside.z * size.x + outside.x);
      doors.push({
        side,
        worldX,
        worldZ,
        worldY: y,
        width: DOOR_WIDTH,
        connectsTo: hallwayId
          ? { kind: "hallway", hallwayId }
          : { kind: "staircase", staircaseId: "" },
      });
    }
  }

  return doors;
}

/** Group sorted integers into maximal runs of consecutive values. */
function groupContiguous(sorted: number[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  for (const n of sorted) {
    if (current.length === 0 || n === current[current.length - 1] + 1) {
      current.push(n);
    } else {
      out.push(current);
      current = [n];
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

// --- Hallway extraction ---------------------------------------------------

function extractHallways(
  grid: { getValue(p: Vector3Int): CellType3D },
  size: Vector3Int,
  floorIndex: number,
): HallwayLayout[] {
  const visited = new Uint8Array(size.x * size.z);
  const hallways: HallwayLayout[] = [];

  for (let z = 0; z < size.z; z++) {
    for (let x = 0; x < size.x; x++) {
      if (visited[z * size.x + x]) continue;
      const v = grid.getValue(new Vector3Int(x, 0, z));
      if (v !== CellType3D.Hallway) continue;

      const cells: Array<{ x: number; z: number }> = [];
      const stack = [{ x, z }];
      while (stack.length > 0) {
        const c = stack.pop()!;
        const idx = c.z * size.x + c.x;
        if (visited[idx]) continue;
        const cv = grid.getValue(new Vector3Int(c.x, 0, c.z));
        if (cv !== CellType3D.Hallway) continue;
        visited[idx] = 1;
        cells.push(c);

        if (c.x > 0) stack.push({ x: c.x - 1, z: c.z });
        if (c.x < size.x - 1) stack.push({ x: c.x + 1, z: c.z });
        if (c.z > 0) stack.push({ x: c.x, z: c.z - 1 });
        if (c.z < size.z - 1) stack.push({ x: c.x, z: c.z + 1 });
      }

      if (cells.length > 0) {
        hallways.push({
          id: `floor-${floorIndex}-hall-${hallways.length}`,
          floorIndex,
          cells,
          placements: [], // M3
        });
      }
    }
  }

  return hallways;
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

// --- Exports for preview --------------------------------------------------

/** Unused by runtime; silences lint for the import. */
export const _cellCenterToWorld = cellCenterToWorld;
