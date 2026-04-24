// Ported from ricos.site 3D dungeon generator (Generator.ts).
// Port changes:
// - Path-normalised imports (kebab-case filenames).
// - Inlined `createRandomFunction` + `getRandomIntUneven` helpers that
//   originally lived in ricos.site/src/lib/utils/misc.
// - Added `addAnchorRoom()` so callers can pre-place a hand-specified
//   room before random placement runs.
// - Cost function patch: Room interior cells are non-traversable. Paths
//   enter/exit rooms only through RoomCenterAxis "door-axis" cells.
//   Without this, A* routinely cut straight through small rooms on our
//   small floors because +5 per cell was cheaper than routing around.
// - `generate()` falls back to a complete graph when Delaunay produces
//   no edges (needs 4+ non-coplanar vertices).

import { alea } from "seedrandom";

import { Delaunay3D } from "./delaunay3d";
import { Edge, type Vertex, VertexWithData } from "./graph-structures";
import { Grid3D } from "./grid3d";
import { PrimMST } from "./mst";
import { DungeonPathfinder3D, type GraphNode3D } from "./pathfinder3d";
import { CellType3D, Mathf, Room3D, Vector3Int } from "./types";

// --- inlined random helpers (from ricos.site/src/lib/utils/misc) ----------

function createRandomFunction(seed: string): () => number {
  // seedrandom's `alea` constructor returns a function () => number in
  // [0, 1); the TS types are a bit awkward so we cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prng = new (alea as any)(seed);
  return prng as () => number;
}

function getRandomInt(min: number, max: number, randFunc: () => number = Math.random): number {
  return Math.floor(randFunc() * (max - min + 1)) + min;
}

function makeUneven(value: number): number {
  return value % 2 === 0 ? value + 1 : value;
}

function getRandomIntUneven(min: number, max: number, randFunc?: () => number): number {
  return makeUneven(getRandomInt(min, max - 1, randFunc));
}

// -------------------------------------------------------------------------

export type StairCase = {
  cells: [Vector3Int, Vector3Int, Vector3Int, Vector3Int];
  direction: Vector3Int;
};

export class DungeonGenerator3D {
  public grid: Grid3D<CellType3D>;
  public rooms: Room3D[] = [];
  public stairCases: StairCase[] = [];
  private random: () => number;
  private pathfinder: DungeonPathfinder3D;
  private seed: string;

  constructor(
    private size: Vector3Int,
    private roomCount: number,
    private roomMaxSize: Vector3Int,
    private roomMinSize: Vector3Int,
    seed?: string,
  ) {
    this.seed = seed !== undefined ? seed : Math.random().toString();

    this.random = createRandomFunction(this.seed);

    this.grid = new Grid3D<CellType3D>(size, Vector3Int.zero());
    for (let x = 0; x < size.x; x++) {
      for (let y = 0; y < size.y; y++) {
        for (let z = 0; z < size.z; z++) {
          this.grid.setValue(new Vector3Int(x, y, z), CellType3D.None);
        }
      }
    }

    this.pathfinder = new DungeonPathfinder3D(size);
  }

  /**
   * Pre-place a room at a specific location before random placement.
   * Caller is responsible for making sure the footprint is in bounds
   * and doesn't overlap with anything else. Used for "anchor rooms"
   * that each era specifies by hand.
   */
  addAnchorRoom(room: Room3D): void {
    this.rooms.push(room);
    for (const pos of room.bounds.allPositionsWithin()) {
      const center = room.bounds.center;
      const isAlignedWithCenter = pos.x === center.x || pos.z === center.z;
      if (isAlignedWithCenter) {
        this.grid.setValue(pos, CellType3D.RoomCenterAxis);
      } else {
        this.grid.setValue(pos, CellType3D.Room);
      }
    }
  }

  findBelongingRoom(point: Vector3Int): Room3D | undefined {
    for (const room of this.rooms) {
      if (room.containsPoint(point)) {
        return room;
      }
    }
  }

  generate(): Grid3D<CellType3D> {
    this.placeRooms();

    if (this.rooms.length < 2) {
      return this.grid;
    }

    const vertices = this.createVerticesFromRooms();

    // 3D Delaunay needs 4+ non-coplanar vertices to build its first
    // tetrahedron; it returns no edges otherwise. Fall back to a
    // complete graph when we have fewer rooms — cheap at small N (max
    // 6 edges for 4 rooms) and lets MST/pathfinding run as normal.
    const delaunay = Delaunay3D.triangulate(vertices);
    const edgePool = delaunay.edges.length > 0 ? delaunay.edges : completeEdges(vertices);

    const mstEdges = PrimMST.minimumSpanningTree(edgePool, vertices[0]);

    // 30% extra edges on top of the MST. Higher than the original 12.5%
    // because our floors are denser (~15 rooms vs. the original 20 on a
    // much larger grid) and a pure MST forces long detours when two
    // adjacent rooms are on opposite sides of the tree.
    const finalEdges = PrimMST.addRandomConnections(edgePool, mstEdges, 0.3, this.random);

    this.pathfindHallways(finalEdges);

    return this.grid;
  }

  private placeRooms(): void {
    let placedRooms = this.rooms.length; // anchors already counted
    let attempts = 0;
    // The original generator used roomCount * 3, which is fine for a
    // 50³ dungeon but too tight for our 29×29 floors: if a few random
    // rolls land on the anchor, we run out of attempts before placing
    // any non-anchor rooms. 15× attempts gives enough margin without
    // making layout noticeably slower.
    const maxAttempts = this.roomCount * 15;

    while (placedRooms < this.roomCount && attempts < maxAttempts) {
      attempts++;

      const location = new Vector3Int(
        Math.floor(this.random() * this.size.x),
        Math.floor(this.random() * this.size.y),
        Math.floor(this.random() * this.size.z),
      );

      const roomSize = new Vector3Int(
        getRandomIntUneven(this.roomMinSize.x, this.roomMaxSize.x, this.random),
        getRandomIntUneven(this.roomMinSize.y, this.roomMaxSize.y, this.random),
        getRandomIntUneven(this.roomMinSize.z, this.roomMaxSize.z, this.random),
      );

      let canPlace = true;
      const newRoom = new Room3D(location, roomSize);

      const buffer = new Room3D(
        new Vector3Int(location.x - 1, location.y, location.z - 1),
        new Vector3Int(roomSize.x + 2, roomSize.y, roomSize.z + 2),
      );

      for (const room of this.rooms) {
        if (Room3D.intersect(room, buffer)) {
          canPlace = false;
          break;
        }
      }

      if (
        newRoom.bounds.xMin < 0 ||
        newRoom.bounds.xMax >= this.size.x ||
        newRoom.bounds.yMin < 0 ||
        newRoom.bounds.yMax >= this.size.y ||
        newRoom.bounds.zMin < 0 ||
        newRoom.bounds.zMax >= this.size.z
      ) {
        canPlace = false;
      }

      if (canPlace) {
        placedRooms++;
        this.rooms.push(newRoom);

        for (const pos of newRoom.bounds.allPositionsWithin()) {
          const center = newRoom.bounds.center;

          const isAlignedWithCenter = pos.x === center.x || pos.z === center.z;
          if (isAlignedWithCenter) {
            this.grid.setValue(pos, CellType3D.RoomCenterAxis);
          } else {
            this.grid.setValue(pos, CellType3D.Room);
          }
        }
      }
    }
  }

  private createVerticesFromRooms(): Vertex[] {
    const vertices: Vertex[] = [];

    for (const room of this.rooms) {
      const center = room.bounds.center;
      vertices.push(new VertexWithData<Room3D>(center, room));
    }

    return vertices;
  }

  private pathfindHallways(edges: Edge[]): void {
    for (const edge of edges) {
      const startRoom = (edge.u as VertexWithData<Room3D>).item;
      const endRoom = (edge.v as VertexWithData<Room3D>).item;

      const startCenter = startRoom.bounds.center;
      const endCenter = endRoom.bounds.center;

      const startPos = Vector3Int.fromVector3(startCenter);
      const endPos = Vector3Int.fromVector3(endCenter);

      const costFunction = (
        a: GraphNode3D,
        b: GraphNode3D,
      ): {
        traversable: boolean;
        cost: number;
        isStairs: boolean;
      } => {
        const result = {
          traversable: false,
          cost: 0,
          isStairs: false,
        };

        const delta = b.position.subtract(a.position);

        if (delta.y === 0) {
          result.cost = Vector3Int.distance(b.position, endPos);

          if (this.grid.getValue(b.position) === CellType3D.Stairs) {
            return result;
          }

          // Room interior cells are NOT traversable. Paths enter/exit
          // rooms only through RoomCenterAxis cells (the "+" of cells
          // aligned with the room's centre row/column) which act as
          // doors. Without this, A* routinely cut straight through
          // small rooms on small floors because +5 per cell was
          // cheaper than routing around in None cells.
          if (this.grid.getValue(b.position) === CellType3D.Room) {
            return result;
          }

          if (this.grid.getValue(b.position) === CellType3D.None) {
            result.cost += 1;
          }

          // Turn penalty — prefer L-shaped paths over a staircase
          // pattern (…→east→south→east→south→…). Without this, A* is
          // indifferent between the two when their heuristic tie and
          // the rendered corridor outlines get notchy diagonals. A
          // turn costs as much as four or five extra straight cells,
          // so the planner still turns when it needs to but never
          // zig-zags for fun.
          if (a.previous) {
            const prevDelta = a.position.subtract(a.previous.position);
            if (prevDelta.x !== delta.x || prevDelta.z !== delta.z) {
              result.cost += 4;
            }
          }

          result.traversable = true;
        } else {
          if (
            (this.grid.getValue(a.position) !== CellType3D.None &&
              this.grid.getValue(a.position) !== CellType3D.Hallway) ||
            (this.grid.getValue(b.position) !== CellType3D.None &&
              this.grid.getValue(b.position) !== CellType3D.Hallway)
          ) {
            return result;
          }

          result.cost = 100 + Vector3Int.distance(b.position, endPos);

          const xDir = Mathf.clamp(delta.x, -1, 1);
          const zDir = Mathf.clamp(delta.z, -1, 1);
          const verticalOffset = new Vector3Int(0, delta.y, 0);
          const horizontalOffset = new Vector3Int(xDir, 0, zDir);

          if (
            !this.grid.inBounds(a.position.add(verticalOffset)) ||
            !this.grid.inBounds(a.position.add(horizontalOffset)) ||
            !this.grid.inBounds(a.position.add(verticalOffset).add(horizontalOffset))
          ) {
            return result;
          }

          if (
            this.grid.getValue(a.position.add(horizontalOffset)) !== CellType3D.None ||
            this.grid.getValue(a.position.add(horizontalOffset.multiply(2))) !== CellType3D.None ||
            this.grid.getValue(a.position.add(verticalOffset).add(horizontalOffset)) !==
              CellType3D.None ||
            this.grid.getValue(a.position.add(verticalOffset).add(horizontalOffset.multiply(2))) !==
              CellType3D.None
          ) {
            return result;
          }

          result.traversable = true;
          result.isStairs = true;
        }

        return result;
      };

      const path = this.pathfinder.findPath(startPos, endPos, costFunction);

      if (path) {
        for (let i = 0; i < path.length; i++) {
          const current = path[i];

          if (this.grid.getValue(current) === CellType3D.None) {
            this.grid.setValue(current, CellType3D.Hallway);
          }

          if (i > 0) {
            const prev = path[i - 1];
            const delta = current.subtract(prev);

            if (delta.y !== 0) {
              const xDir = Mathf.clamp(delta.x, -1, 1);
              const zDir = Mathf.clamp(delta.z, -1, 1);
              const verticalOffset = new Vector3Int(0, delta.y, 0);
              const horizontalOffset = new Vector3Int(xDir, 0, zDir);

              const stairPos1 = prev.add(horizontalOffset);
              const stairPos2 = prev.add(horizontalOffset.multiply(2));
              const stairPos3 = prev.add(verticalOffset).add(horizontalOffset);
              const stairPos4 = prev.add(verticalOffset).add(horizontalOffset.multiply(2));

              this.grid.setValue(stairPos1, CellType3D.Stairs);
              this.grid.setValue(stairPos2, CellType3D.Stairs);
              this.grid.setValue(stairPos3, CellType3D.Stairs);
              this.grid.setValue(stairPos4, CellType3D.Stairs);
              this.stairCases.push({
                cells: [stairPos1, stairPos2, stairPos3, stairPos4],
                direction: horizontalOffset,
              });
            }
          }
        }
      }
    }
  }

  getSeed(): string {
    return this.seed;
  }
}

/** Build the complete graph on a vertex list. Used as a small-N fallback
 *  when 3D Delaunay produces no edges (needs 4+ non-coplanar vertices). */
function completeEdges(vertices: Vertex[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      edges.push(new Edge(vertices[i], vertices[j]));
    }
  }
  return edges;
}
