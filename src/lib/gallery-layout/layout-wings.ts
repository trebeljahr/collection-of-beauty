// A second floor plan for the museum, behind a switch (`?plan=wings`).
//
// Three floors. Each is a stair hall with a wing on each of its four
// sides. A wing shows one era: a vestibule, then eight galleries in a
// ring round a salon, so a visitor who keeps walking comes back to the
// wing's door. A cabinet in each corner between two wings joins them,
// which lets a visitor go round a whole floor without crossing the
// stair hall.
//
// It exists to be walked and judged against the tower
// (`layout-museum.ts`), which stays the default. What it leaves out for
// now: the paired straight flights planned for the stair hall (it keeps
// the tower's spiral), the spiral at the end of each wing, and the
// works too large for a room.
//
// Local wing coordinates: `a` runs outward from the stair hall's face,
// `b` runs across the wing. Both are in cells, as half-open ranges.

import type { ArtworkListing } from "@/lib/data";
import { type Era, type EraId, eraAccentColor, getEra } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { arrivalPoint, ceilingHeightFor, planBenches } from "./fittings";
import {
  bucketByEra,
  computeBlockedEdges,
  describeRoom,
  dominantMovement,
  fillRooms,
  groupMovements,
  selectFloorWorks,
  shuffleByIdHash,
} from "./layout-museum";
import {
  computeRoomRuns,
  distributePaintings,
  runLength,
  sizeWork,
  wallFootprint,
} from "./place-paintings";
import type { CellRect, Door, FloorLayout, MuseumLayout, RoomLayout, Staircase } from "./types";
import {
  CELL_SIZE,
  floorY,
  PORTAL_HEIGHT,
  PORTAL_WIDTH,
  ROOM_HEIGHT_TALL,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

export const WINGS_GRID = 59;
/** The stair hall: 9 cells square in the middle of the grid, the same
 *  footprint the tower's stairwell has. */
export const HUB: CellRect = { xMin: 25, xMax: 33, zMin: 25, zMax: 33 };

/** Every door of a wing. One cell wide for the collision grid, so no
 *  jamb colliders (`doorOpenHalfSpan`), and wide enough for a thumb. */
export const WING_DOOR_WIDTH = 2.4;
export const WING_DOOR_HEIGHT = 2.9;

/** Share of a wing's wall its works and plaques cover. The tower aims
 *  at 0.66; Rico asked for fewer works a room. The two wings of small
 *  sheets hang thinner still: many prints of one shape in a row read
 *  as wallpaper. */
export const WING_WALL_COVERAGE = 0.55;
export const PRINT_WING_COVERAGE = 0.4;

export type WingDir = "n" | "e" | "s" | "w";
export const WING_DIRS: readonly WingDir[] = ["n", "e", "s", "w"];

type Side = Door["side"];
const OPPOSITE: Record<Side, Side> = { north: "south", south: "north", east: "west", west: "east" };

type WingRoom = {
  id: string;
  a0: number;
  a1: number;
  b0: number;
  b1: number;
};

/** One wing, 20 cells long and 15 wide. The stair hall's face spans
 *  `b` 3 to 12; the two squares beside the vestibule are the corner
 *  cabinets, shared with the neighbouring wings. */
export const WING_ROOMS: readonly WingRoom[] = [
  { id: "vestibule", a0: 0, a1: 3, b0: 3, b1: 12 },
  { id: "entry", a0: 3, a1: 8, b0: 5, b1: 10 },
  { id: "c1", a0: 3, a1: 8, b0: 0, b1: 5 },
  { id: "s1", a0: 8, a1: 15, b0: 0, b1: 5 },
  { id: "c2", a0: 15, a1: 20, b0: 0, b1: 5 },
  { id: "far", a0: 15, a1: 20, b0: 5, b1: 10 },
  { id: "c3", a0: 15, a1: 20, b0: 10, b1: 15 },
  { id: "s2", a0: 8, a1: 15, b0: 10, b1: 15 },
  { id: "c4", a0: 3, a1: 8, b0: 10, b1: 15 },
  { id: "salon", a0: 8, a1: 15, b0: 5, b1: 10 },
];

/** The ring, in walking order from the vestibule, and the two doors of
 *  the salon on the axis from the stair hall. */
export const WING_DOORS: ReadonlyArray<readonly [string, string]> = [
  ["vestibule", "entry"],
  ["entry", "c1"],
  ["c1", "s1"],
  ["s1", "c2"],
  ["c2", "far"],
  ["far", "c3"],
  ["c3", "s2"],
  ["s2", "c4"],
  ["c4", "entry"],
  ["entry", "salon"],
  ["salon", "far"],
];

/** Corner cabinets: the 3 × 3 cell squares between neighbouring wings,
 *  and the corner gallery of each wing they open into. */
const CABINETS: ReadonlyArray<{ id: string; x: number; z: number; rooms: [string, string] }> = [
  { id: "ne", x: HUB.xMax + 1, z: HUB.zMin - 3, rooms: ["n-c4", "e-c1"] },
  { id: "se", x: HUB.xMax + 1, z: HUB.zMax + 1, rooms: ["e-c4", "s-c4"] },
  { id: "sw", x: HUB.xMin - 3, z: HUB.zMax + 1, rooms: ["s-c1", "w-c4"] },
  { id: "nw", x: HUB.xMin - 3, z: HUB.zMin - 3, rooms: ["w-c1", "n-c1"] },
];

/** A wing's rectangle on the grid. */
export function wingRect(dir: WingDir, r: WingRoom): CellRect {
  const lo = HUB.xMin - 3 + r.b0;
  const hi = HUB.xMin - 3 + r.b1 - 1;
  switch (dir) {
    case "w":
      return { xMin: HUB.xMin - r.a1, xMax: HUB.xMin - r.a0 - 1, zMin: lo, zMax: hi };
    case "e":
      return { xMin: HUB.xMax + 1 + r.a0, xMax: HUB.xMax + r.a1, zMin: lo, zMax: hi };
    case "n":
      return { xMin: lo, xMax: hi, zMin: HUB.zMin - r.a1, zMax: HUB.zMin - r.a0 - 1 };
    default:
      return { xMin: lo, xMax: hi, zMin: HUB.zMax + 1 + r.a0, zMax: HUB.zMax + r.a1 };
  }
}

// --- What hangs where -----------------------------------------------------

type WingSpec = {
  /** The era whose wall colour and title the wing takes. */
  era: EraId;
  title: string;
  /** Wall coverage, when it differs from WING_WALL_COVERAGE. */
  coverage?: number;
  works: (byEra: Map<EraId, ArtworkListing[]>) => ArtworkListing[];
};

const whole =
  (id: EraId) =>
  (byEra: Map<EraId, ArtworkListing[]>): ArtworkListing[] =>
    byEra.get(id) ?? [];
const NORTHERN = "Northern Renaissance";
const DUTCH = "Dutch Golden Age";

/** North wing first, then clockwise. Each floor is a third of the story
 *  in three wings and one wing that hangs differently: the Dutch
 *  cabinet pictures, the natural history plates, the East Asian works.
 *  Eleven eras fill twelve wings: Baroque takes two, split at the Dutch
 *  Golden Age, and Gothic shares its wing with the Northern Renaissance
 *  because it has 74 works. */
export const WING_PLAN: ReadonlyArray<Record<WingDir, WingSpec>> = [
  {
    n: {
      era: "gothic",
      title: "Gothic & the Northern Renaissance",
      works: (byEra) => [
        ...(byEra.get("gothic") ?? []),
        ...(byEra.get("renaissance") ?? []).filter((a) => a.movement === NORTHERN),
      ],
    },
    e: {
      era: "renaissance",
      title: "Renaissance & Mannerism",
      works: (byEra) => (byEra.get("renaissance") ?? []).filter((a) => a.movement !== NORTHERN),
    },
    s: {
      era: "baroque",
      title: "Baroque",
      works: (byEra) => (byEra.get("baroque") ?? []).filter((a) => a.movement !== DUTCH),
    },
    w: {
      era: "baroque",
      title: "Dutch Golden Age",
      works: (byEra) => (byEra.get("baroque") ?? []).filter((a) => a.movement === DUTCH),
    },
  },
  {
    n: { era: "enlightenment", title: "Rococo & Neoclassicism", works: whole("enlightenment") },
    e: { era: "romantic", title: "Romanticism", works: whole("romantic") },
    s: { era: "realism", title: "Realism & Academy", works: whole("realism") },
    w: {
      era: "natural-history",
      title: "Natural History & Botanical Illustration",
      coverage: PRINT_WING_COVERAGE,
      works: whole("natural-history"),
    },
  },
  {
    n: { era: "fin-de-siecle", title: "Impressionism", works: whole("fin-de-siecle") },
    e: {
      era: "post-impressionism",
      title: "Post-Impressionism & Symbolism",
      works: whole("post-impressionism"),
    },
    s: { era: "modernism", title: "Modernism", works: whole("modernism") },
    w: {
      era: "ukiyo-e",
      title: "East Asian Painting",
      coverage: PRINT_WING_COVERAGE,
      works: whole("ukiyo-e"),
    },
  },
];

/** A floor holds four eras, so it is named by the span of its three
 *  painting wings. */
const FLOOR_TITLES = ["Gothic to Baroque", "Rococo to Realism", "Impressionism to Modernism"];

// --- Public entry ---------------------------------------------------------

export function layoutWings(allArtworks: ArtworkListing[]): MuseumLayout {
  const byEra = bucketByEra(allArtworks);
  const floors = WING_PLAN.map((plan, index) => buildFloor(index, plan, byEra));

  const allStaircases: Staircase[] = [];
  for (let i = 0; i < floors.length - 1; i++) {
    const stair = buildStaircase(floors[i], floors[i + 1]);
    floors[i].stairsOut.push(stair);
    floors[i + 1].stairsIn.push(stair);
    allStaircases.push(stair);
  }

  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const arrival = arrivalPoint(anchor);
  return {
    floors,
    entry: { floorIndex: 0, worldPosition: [arrival.x, anchor.worldRect.y, arrival.z] },
    allRooms: floors.flatMap((f) => f.rooms),
    allHallways: [],
    allStaircases,
  };
}

// --- One floor ------------------------------------------------------------

function buildFloor(
  index: number,
  plan: Record<WingDir, WingSpec>,
  byEra: Map<EraId, ArtworkListing[]>,
): FloorLayout {
  // The floor as a whole answers to the era of its north wing: the id a
  // saved visit is filed under, and the palette of the stair hall.
  const floorEra = getEra(plan.n.era);
  const rooms: RoomLayout[] = [];
  const byId = new Map<string, RoomLayout>();
  const add = (room: RoomLayout) => {
    rooms.push(room);
    byId.set(room.id.replace(`f${index}-`, ""), room);
    return room;
  };

  const hub = add(
    makeRoom(index, "hub", HUB, floorEra, { isStairwell: true, title: "Stair hall" }),
  );
  for (const dir of WING_DIRS) {
    const spec = plan[dir];
    const era = getEra(spec.era);
    for (const r of WING_ROOMS) {
      add(
        makeRoom(index, `${dir}-${r.id}`, wingRect(dir, r), era, {
          title: spec.title,
          // The south vestibule is where a visit starts and where the
          // floor keys land: beside the stair hall, facing it.
          isAnchor: dir === "s" && r.id === "vestibule",
          ceilingHeight: r.id === "salon" ? ROOM_HEIGHT_TALL : undefined,
        }),
      );
    }
  }
  for (const c of CABINETS) {
    add(
      makeRoom(
        index,
        `cabinet-${c.id}`,
        { xMin: c.x, xMax: c.x + 2, zMin: c.z, zMax: c.z + 2 },
        floorEra,
        { title: "Cabinet" },
      ),
    );
  }

  // Doors. The stair hall's four are full portals; every other door is
  // one cell wide.
  for (const dir of WING_DIRS) {
    connect(hub, byId.get(`${dir}-vestibule`)!, PORTAL_WIDTH, PORTAL_HEIGHT);
    for (const [a, b] of WING_DOORS) {
      connect(
        byId.get(`${dir}-${a}`)!,
        byId.get(`${dir}-${b}`)!,
        WING_DOOR_WIDTH,
        WING_DOOR_HEIGHT,
      );
    }
  }
  for (const c of CABINETS) {
    const cabinet = byId.get(`cabinet-${c.id}`)!;
    for (const id of c.rooms) connect(cabinet, byId.get(id)!, WING_DOOR_WIDTH, WING_DOOR_HEIGHT);
  }

  // Who draws a shared wall. Walls are single planes seen from both
  // sides, so where two palettes meet exactly one room may draw. Inside
  // a wing both neighbours draw the same colour, as in the tower.
  //   stair hall | vestibule      the stair hall draws
  //   vestibule, cabinet | suite  the suite's rooms draw
  //   cabinet | vestibule         the cabinet draws
  for (const dir of WING_DIRS) {
    const vestibule = byId.get(`${dir}-vestibule`)!;
    vestibule.suppressWalls = { north: true, south: true, east: true, west: true };
  }
  for (const c of CABINETS) {
    const cabinet = byId.get(`cabinet-${c.id}`)!;
    cabinet.suppressWalls = {};
    for (const id of c.rooms) {
      const side = cabinet.doors.find((d) => d.connectsTo.roomId === byId.get(id)!.id)?.side;
      if (side) cabinet.suppressWalls[side] = true;
    }
  }

  // Benches need the doors, so they are planned here.
  for (const room of rooms) {
    if (room.isStairwell) continue;
    room.benches = planBenches(room.cellBounds, room.doors, []);
  }

  const grid = WINGS_GRID;
  const walkable = new Uint8Array(grid * grid);
  const cellOwner = new Int16Array(grid * grid).fill(-1);
  rooms.forEach((r, i) => {
    for (let x = r.cellBounds.xMin; x <= r.cellBounds.xMax; x++) {
      for (let z = r.cellBounds.zMin; z <= r.cellBounds.zMax; z++) {
        walkable[z * grid + x] = 1;
        cellOwner[z * grid + x] = i;
      }
    }
  });
  const { blockedEdgesEW, blockedEdgesNS } = computeBlockedEdges(grid, rooms, cellOwner);

  const floor: FloorLayout = {
    index,
    era: floorEra,
    title: FLOOR_TITLES[index],
    y: floorY(index),
    gridSize: { x: grid, z: grid },
    walkable,
    cellOwner,
    blockedEdgesEW,
    blockedEdgesNS,
    rooms,
    hallways: [],
    stairsIn: [],
    stairsOut: [],
  };

  for (const dir of WING_DIRS) {
    const wingRooms = WING_ROOMS.map((r) => byId.get(`${dir}-${r.id}`)!);
    hangWing(floor, wingRooms, plan[dir], byEra);
  }

  // One work in each cabinet: the sharpest scan the first of its two
  // wings left off its walls.
  const hung = new Set(rooms.flatMap((r) => r.placements.map((p) => p.artwork.id)));
  for (const c of CABINETS) {
    const cabinet = byId.get(`cabinet-${c.id}`)!;
    const dir = c.rooms[0][0] as WingDir;
    const spare = plan[dir]
      .works(byEra)
      .filter((a) => !hung.has(a.id))
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0) || a.id.localeCompare(b.id))[0];
    if (!spare) continue;
    cabinet.artworks = [spare];
    hung.add(spare.id);
    distributePaintings({ ...floor, rooms: [cabinet] });
  }

  let roomNumber = 0;
  for (const room of rooms) {
    if (room.isStairwell) continue;
    const era = getEra(room.era ?? floorEra.id);
    room.artworks = room.placements.map((p) => p.artwork);
    room.roomNumber = ++roomNumber;
    room.movement = dominantMovement(room.artworks, era) ?? room.title;
    room.description = describeRoom(room.title, room.artworks);
  }
  return floor;
}

/** Hang one wing from its own works. The largest go to the salon and
 *  the vestibule; the rest are dealt round the ring a movement at a
 *  time, each gallery taking a share by its wall. */
function hangWing(
  floor: FloorLayout,
  wingRooms: RoomLayout[],
  spec: WingSpec,
  byEra: Map<EraId, ArtworkListing[]>,
) {
  const era = getEra(spec.era);
  const wallOf = (room: RoomLayout) =>
    computeRoomRuns(room).reduce((sum, run) => sum + runLength(run), 0);
  const walls = wingRooms.map(wallOf);
  const coverage = spec.coverage ?? WING_WALL_COVERAGE;
  const budget = walls.reduce((a, b) => a + b, 0) * coverage;

  // As many works as the wing's wall takes at the target coverage,
  // shared evenly among the era's artists as on a tower floor.
  const candidates = spec.works(byEra);
  const meanFootprint =
    candidates.reduce((sum, a) => sum + wallFootprint(a), 0) / Math.max(1, candidates.length);
  let chosen = selectFloorWorks(candidates, Math.floor(budget / Math.max(0.5, meanFootprint)));
  // The sample is by count; trim to the wall it has to fit.
  chosen = shuffleByIdHash(chosen);
  let used = 0;
  chosen = chosen.filter((a) => {
    const need = wallFootprint(a);
    if (used + need > budget) return false;
    used += need;
    return true;
  });

  // Largest first into the two rooms with the longest unbroken walls.
  const bySize = [...chosen].sort((a, b) => area(b) - area(a) || a.id.localeCompare(b.id));
  const taken = new Set<string>();
  for (const id of ["salon", "vestibule"]) {
    const index = wingRooms.findIndex((r) => r.id.endsWith(`-${id}`));
    const room = wingRooms[index];
    let roomUsed = 0;
    room.artworks = [];
    for (const work of bySize) {
      if (taken.has(work.id)) continue;
      const need = wallFootprint(work);
      if (roomUsed + need > walls[index] * coverage) break;
      room.artworks.push(work);
      taken.add(work.id);
      roomUsed += need;
    }
  }

  const ring = wingRooms.filter((r) => !r.id.endsWith("-salon") && !r.id.endsWith("-vestibule"));
  const rest = chosen.filter((a) => !taken.has(a.id));
  const queue = [...groupMovements(era, rest).entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, artworks]) => ({ name, artworks }));
  const fills = fillRooms(ring.map(wallOf), queue, era);
  ring.forEach((room, i) => {
    room.artworks = fills[i].artworks;
  });

  // Spill stays inside the wing: the placer sees only its rooms.
  const stats = distributePaintings({ ...floor, rooms: wingRooms });
  if (stats.dropped > 0 && process.env.NODE_ENV !== "production") {
    console.warn(`[gallery-layout] ${spec.title}: ${stats.dropped} works did not fit the wing`);
  }

  const accentByMovement = new Map<string, number>();
  for (const room of wingRooms) {
    const movement =
      dominantMovement(
        room.placements.map((p) => p.artwork),
        era,
      ) ?? spec.title;
    let accent = accentByMovement.get(movement);
    if (accent === undefined) {
      accent = accentByMovement.size;
      accentByMovement.set(movement, accent);
    }
    room.floorColor = eraAccentColor(era, accent);
  }
}

function area(artwork: ArtworkListing): number {
  const size = sizeWork(artwork);
  return size.wM * size.hM;
}

// --- Rooms, doors, stairs -------------------------------------------------

function makeRoom(
  floorIndex: number,
  key: string,
  rect: CellRect,
  era: Era,
  opts: { title: string; isStairwell?: boolean; isAnchor?: boolean; ceilingHeight?: number },
): RoomLayout {
  return {
    id: slugify(`f${floorIndex}-${key}`) || `f${floorIndex}-${key}`,
    floorIndex,
    era: era.id,
    movement: opts.title,
    title: opts.title,
    description: opts.title,
    isAnchor: opts.isAnchor ?? false,
    roomNumber: null,
    isStairwell: opts.isStairwell ?? false,
    cellBounds: { ...rect },
    worldRect: {
      xMin: rect.xMin * CELL_SIZE + WALL_THICKNESS,
      xMax: (rect.xMax + 1) * CELL_SIZE - WALL_THICKNESS,
      zMin: rect.zMin * CELL_SIZE + WALL_THICKNESS,
      zMax: (rect.zMax + 1) * CELL_SIZE - WALL_THICKNESS,
      y: floorY(floorIndex),
    },
    doors: [],
    ceilingHeight: opts.ceilingHeight ?? ceilingHeightFor(rect),
    dividers: [],
    benches: [],
    placements: [],
    artworks: [],
    floorColor: era.palette.floorColor,
  };
}

/** A door between two rooms that share a wall, in the middle of the
 *  stretch they share. Every room here is an odd number of cells wide,
 *  so that middle is the middle of a cell, which the collision grid
 *  needs. */
function connect(a: RoomLayout, b: RoomLayout, width: number, height: number) {
  const ra = a.cellBounds;
  const rb = b.cellBounds;
  let side: Side;
  let worldX: number;
  let worldZ: number;
  const mid = (lo: number, hi: number) => (Math.floor((lo + hi) / 2) + 0.5) * CELL_SIZE;
  if (ra.xMax + 1 === rb.xMin || rb.xMax + 1 === ra.xMin) {
    side = ra.xMax + 1 === rb.xMin ? "east" : "west";
    worldX = (side === "east" ? ra.xMax + 1 : ra.xMin) * CELL_SIZE;
    worldZ = mid(Math.max(ra.zMin, rb.zMin), Math.min(ra.zMax, rb.zMax));
  } else if (ra.zMax + 1 === rb.zMin || rb.zMax + 1 === ra.zMin) {
    side = ra.zMax + 1 === rb.zMin ? "south" : "north";
    worldZ = (side === "south" ? ra.zMax + 1 : ra.zMin) * CELL_SIZE;
    worldX = mid(Math.max(ra.xMin, rb.xMin), Math.min(ra.xMax, rb.xMax));
  } else {
    throw new Error(`${a.id} and ${b.id} share no wall`);
  }
  const door = (room: RoomLayout, s: Side, other: RoomLayout): Door => ({
    side: s,
    worldX,
    worldZ,
    worldY: room.worldRect.y,
    width,
    height,
    portal: true,
    connectsTo: { kind: "room", roomId: other.id },
  });
  a.doors.push(door(a, side, b));
  b.doors.push(door(b, OPPOSITE[side], a));
}

function buildStaircase(lower: FloorLayout, upper: FloorLayout): Staircase {
  return {
    id: `stair-${lower.index}-to-${upper.index}`,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    lowerLabel: `Floor ${lower.index + 1}`,
    upperLabel: `Floor ${upper.index + 1}`,
    centerX: ((HUB.xMin + HUB.xMax + 1) / 2) * CELL_SIZE,
    centerZ: ((HUB.zMin + HUB.zMax + 1) / 2) * CELL_SIZE,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lower.y,
    upperY: upper.y,
    // Step 0 at the south, where a visit starts.
    entryAngle: Math.PI / 2,
  };
}
