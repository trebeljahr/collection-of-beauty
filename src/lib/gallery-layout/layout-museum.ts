// Handcrafted museum floor plan — an axis-aligned, courtyard-style
// composition built around the central spiral staircase. Earlier
// iterations used a procedural BSP-style generator; we kept the
// floor / room / hallway / staircase contract from that experiment
// (see lib/gallery-layout/types.ts) but author every rectangle by
// hand here so each era's enfilade reads the same way every reload.
//
// The plan is an irregular 5 × 5 band grid: five column widths and
// five row depths, none of them equal, with the stair footprint in
// the middle cell. Every room is one column band crossed with one row
// band, so the tiling is gap-free and neighbours always share a full
// wall — but a floor is a mix of 22.5 × 17.5 m halls, 17.5 × 22.5 m
// galleries and 12.5 × 10 m cabinets rather than a grid of identical
// squares. See the diagram beside the band constants below.
//
// Every floor reserves the same 9×9-cell stair footprint at the grid
// centre, so the spiral towers stack vertically across all floors.
// Neighbouring rooms share walls; one room owns the shared wall
// (drawing it with a door cut), the other suppresses its copy. This
// gives the classic "enfilade" feel — three or four rooms visible
// through a single line of doorways.
//
// How many rooms a floor opens is driven by how much *plaster* its
// works need, not by how many works there are: the builder sums the
// wall metres every work will claim once hung and takes slots until
// the floor can hang them at TARGET_WALL_COVERAGE. A storey of
// Audubon plates therefore opens fewer, denser rooms than a storey of
// Romantic canvases with the same work count, and no floor ends up
// with 16 rooms hung at a third of their capacity.

import type { ArtworkListing } from "@/lib/data";
import { assignEra, ERAS, type Era, type EraId, eraAccentColor } from "@/lib/gallery-eras";
import { slugify } from "@/lib/utils";
import { distributePaintings, estimateWallMetres, wallFootprint } from "./place-paintings";
import type {
  Door,
  FloorLayout,
  HallwayLayout,
  MuseumLayout,
  RoomLayout,
  Staircase,
} from "./types";
import {
  CELL_SIZE,
  DOOR_WIDTH,
  floorY,
  SPIRAL_INNER_RADIUS,
  SPIRAL_OUTER_RADIUS,
  SPIRAL_ROOM_CELLS,
  SPIRAL_STEPS_PER_FLOOR,
  WALL_THICKNESS,
} from "./world-coords";

// --- Floor plan geometry (cell coordinates, inclusive) --------------------

const GRID_SIZE = 48;
const STAIR_LABEL = "Stairwell";

export type CellRect = { xMin: number; xMax: number; zMin: number; zMax: number };

// Stairwell sits dead centre. Its size scales with SPIRAL_ROOM_CELLS
// (currently 9), so every band below is derived from STAIR_MIN /
// STAIR_MAX rather than hardcoding cell numbers.
const STAIR_MIN = Math.floor(GRID_SIZE / 2 - (SPIRAL_ROOM_CELLS - 1) / 2);
const STAIR_MAX = STAIR_MIN + SPIRAL_ROOM_CELLS - 1;
export const STAIR: CellRect = {
  xMin: STAIR_MIN,
  xMax: STAIR_MAX,
  zMin: STAIR_MIN,
  zMax: STAIR_MAX,
};

// The plan is an irregular 5×5 band grid around that stair: five column
// widths and five row depths, none of them equal. Every room is the
// intersection of one column band with one row band, so the tiling is
// gap-free and adjacency is automatic — but no two rooms in a quadrant
// are the same shape. Sizes run from a 12.5 × 10 m print cabinet to the
// 22.5 × 20 m Grand Hall, which is what stops the plan reading as
// graph paper (every room used to be an identical 15 × 15 m square).
//
//        x:  5w      7w    STAIR 9w    6w      8w
//        ┌───────┬────────┬─────────┬───────┬────────┐
//   4d   │  o_nw │  n_w   │ n_strip │  n_e  │ o_ne   │  z low  (north)
//        ├───────┼────────┼─────────┼───────┼────────┤
//   5d   │ w2_n  │  nw    │ n_hall  │  ne   │ e2_n   │
//        ├───────┼────────┼─────────┼───────┼────────┤
//   9d   │ w_far │  west  │ ▓STAIR▓ │  east │ e_far  │
//        ├───────┼────────┼─────────┼───────┼────────┤
//   7d   │ w2_s  │  sw    │  GRAND  │  se   │ e2_s   │
//        ├───────┼────────┼─────────┼───────┼────────┤
//   6d   │  o_sw │  s_w   │ s_strip │  s_e  │ o_se   │  z high (south)
//        └───────┴────────┴─────────┴───────┴────────┘

/** Column bands, west → east. The stair column sits between them.
 *  Widths are 12.5 / 17.5 / 22.5 / 15 / 20 m; the 22.5 m centre column
 *  is set by the stair footprint, the rest are chosen so no quadrant
 *  repeats a room shape. */
const COL_W_FAR = { xMin: STAIR_MIN - 12, xMax: STAIR_MIN - 8 }; // 5 cells
const COL_W = { xMin: STAIR_MIN - 7, xMax: STAIR_MIN - 1 }; // 7 cells
const COL_C = { xMin: STAIR_MIN, xMax: STAIR_MAX }; // 9 cells (stair)
const COL_E = { xMin: STAIR_MAX + 1, xMax: STAIR_MAX + 6 }; // 6 cells
const COL_E_FAR = { xMin: STAIR_MAX + 7, xMax: STAIR_MAX + 14 }; // 8 cells

/** Row bands, north (low z) → south (high z). Depths run 10 / 12.5 /
 *  22.5 / 17.5 / 15 m. Nothing is deeper than 22.5 m: the ceiling is
 *  4.2 m, and a room much wider than five times its height stops
 *  reading as a gallery and starts reading as a warehouse. */
const ROW_N_FAR = { zMin: STAIR_MIN - 9, zMax: STAIR_MIN - 6 }; // 4 cells
const ROW_N = { zMin: STAIR_MIN - 5, zMax: STAIR_MIN - 1 }; // 5 cells
const ROW_C = { zMin: STAIR_MIN, zMax: STAIR_MAX }; // 9 cells (stair)
const ROW_S = { zMin: STAIR_MAX + 1, zMax: STAIR_MAX + 7 }; // 7 cells
const ROW_S_FAR = { zMin: STAIR_MAX + 8, zMax: STAIR_MAX + 13 }; // 6 cells

// The Grand Hall (anchor) is the largest room on the plan and sits
// directly south of the stairwell, sharing its full 9-cell width so the
// door between them lands on the player's natural walking line.
export const GRAND_HALL: CellRect = { ...COL_C, ...ROW_S };

export type Slot = {
  id: string;
  rect: CellRect;
  /** Walls suppressed because a neighbour owns/draws them. */
  suppress: Array<"north" | "south" | "east" | "west">;
};

// Slots are opened in stages, not one at a time: a floor takes whole
// stages, so the plan is left/right symmetric at every size instead of
// growing a lopsided corner. The order is also a reachability order —
// every prefix has to stay walkable from the Grand Hall. The stairwell
// has no doors on its E/W faces (that keeps the spiral out of sight
// from every doorway), so `west` / `east` cannot open before the corner
// rooms that link them to the hall.
export const SLOT_STAGES: Slot[][] = [
  // Ring 1 — the rooms and corners touching the stair.
  [{ id: "n_hall", rect: { ...COL_C, ...ROW_N }, suppress: ["south"] }],
  [
    { id: "sw", rect: { ...COL_W, ...ROW_S }, suppress: ["east"] },
    { id: "se", rect: { ...COL_E, ...ROW_S }, suppress: ["west"] },
  ],
  [
    { id: "nw", rect: { ...COL_W, ...ROW_N }, suppress: ["east"] },
    { id: "ne", rect: { ...COL_E, ...ROW_N }, suppress: ["west"] },
  ],
  [
    { id: "west", rect: { ...COL_W, ...ROW_C }, suppress: [] },
    { id: "east", rect: { ...COL_E, ...ROW_C }, suppress: [] },
  ],
  // Ring 2 — strips behind the hall and its mirror, then the flanks.
  [
    { id: "s_strip", rect: { ...COL_C, ...ROW_S_FAR }, suppress: ["north"] },
    { id: "n_strip", rect: { ...COL_C, ...ROW_N_FAR }, suppress: ["south"] },
  ],
  [
    { id: "w2_s", rect: { ...COL_W_FAR, ...ROW_S }, suppress: ["east"] },
    { id: "e2_s", rect: { ...COL_E_FAR, ...ROW_S }, suppress: ["west"] },
  ],
  [
    { id: "w2_n", rect: { ...COL_W_FAR, ...ROW_N }, suppress: ["east"] },
    { id: "e2_n", rect: { ...COL_E_FAR, ...ROW_N }, suppress: ["west"] },
  ],
  [
    { id: "w_far", rect: { ...COL_W_FAR, ...ROW_C }, suppress: ["east"] },
    { id: "e_far", rect: { ...COL_E_FAR, ...ROW_C }, suppress: ["west"] },
  ],
  // Ring 3 — the cabinets that close the outer corners.
  [
    { id: "s_w", rect: { ...COL_W, ...ROW_S_FAR }, suppress: ["north"] },
    { id: "s_e", rect: { ...COL_E, ...ROW_S_FAR }, suppress: ["north"] },
  ],
  [
    { id: "n_w", rect: { ...COL_W, ...ROW_N_FAR }, suppress: ["south"] },
    { id: "n_e", rect: { ...COL_E, ...ROW_N_FAR }, suppress: ["south"] },
  ],
  [
    { id: "o_sw", rect: { ...COL_W_FAR, ...ROW_S_FAR }, suppress: ["north"] },
    { id: "o_se", rect: { ...COL_E_FAR, ...ROW_S_FAR }, suppress: ["north"] },
  ],
  [
    { id: "o_nw", rect: { ...COL_W_FAR, ...ROW_N_FAR }, suppress: ["south"] },
    { id: "o_ne", rect: { ...COL_E_FAR, ...ROW_N_FAR }, suppress: ["south"] },
  ],
];

const SLOTS: Slot[] = SLOT_STAGES.flat();

/** Hangable wall a slot offers, in metres. Doors aren't wired yet when
 *  the floor picks its rooms, so assume the typical three. */
function slotWallMetres(rect: CellRect): number {
  return estimateWallMetres(
    (rect.xMax - rect.xMin + 1) * CELL_SIZE,
    (rect.zMax - rect.zMin + 1) * CELL_SIZE,
    3,
  );
}

// --- Public entry ---------------------------------------------------------

export function layoutMuseum(allArtworks: ArtworkListing[]): MuseumLayout {
  const byEra = bucketByEra(allArtworks);

  const floors: FloorLayout[] = [];
  const allRooms: RoomLayout[] = [];
  const allHallways: HallwayLayout[] = [];
  const allStaircases: Staircase[] = [];

  for (const era of ERAS) {
    const eraArtworks = byEra.get(era.id) ?? [];
    const floor = buildFloor(era, eraArtworks);
    floors.push(floor);
    allRooms.push(...floor.rooms);
    allHallways.push(...floor.hallways);
  }

  for (let i = 0; i < floors.length - 1; i++) {
    const lower = floors[i];
    const upper = floors[i + 1];
    const staircase = buildStaircase(lower, upper);
    if (staircase) {
      lower.stairsOut.push(staircase);
      upper.stairsIn.push(staircase);
      allStaircases.push(staircase);
    }
  }

  // Entry point: ground floor, centre of the Grand Hall (or grid centre
  // if the hall somehow didn't materialise).
  const ground = floors[0];
  const anchor = ground.rooms.find((r) => r.isAnchor) ?? ground.rooms[0];
  const entryWorld: [number, number, number] = anchor
    ? [
        (anchor.worldRect.xMin + anchor.worldRect.xMax) / 2,
        anchor.worldRect.y,
        (anchor.worldRect.zMin + anchor.worldRect.zMax) / 2,
      ]
    : [(GRID_SIZE * CELL_SIZE) / 2, floorY(0), (GRID_SIZE * CELL_SIZE) / 2];

  return {
    floors,
    entry: { floorIndex: 0, worldPosition: entryWorld },
    allRooms,
    allHallways,
    allStaircases,
  };
}

// --- Era bucketing --------------------------------------------------------

function bucketByEra(all: ArtworkListing[]): Map<EraId, ArtworkListing[]> {
  const m = new Map<EraId, ArtworkListing[]>();
  for (const era of ERAS) m.set(era.id, []);

  // No folder or dimension filter — every renderable work hangs
  // somewhere. Extreme real-world sizes are handled at placement time
  // (tiny engravings get a minimum display size, oversized frescoes are
  // scaled to fit their wall slot), so excluding them here would only
  // shrink the museum. Era assignment routes by movement first, then
  // year; works with neither get a second chance below.
  const unresolved: ArtworkListing[] = [];
  const erasByArtist = new Map<string, Map<EraId, number>>();
  for (const a of all) {
    if (!a.objectKey) continue;
    const era = assignEra(a);
    if (!era) {
      unresolved.push(a);
      continue;
    }
    m.get(era)!.push(a);
    if (a.artistSlug && a.artistSlug !== "unknown") {
      let tally = erasByArtist.get(a.artistSlug);
      if (!tally) {
        tally = new Map();
        erasByArtist.set(a.artistSlug, tally);
      }
      tally.set(era, (tally.get(era) ?? 0) + 1);
    }
  }

  // Works with no movement and no year inherit the modal era of their
  // artist's other works — an undated Levitan hangs with the rest of
  // Levitan. Works that still don't resolve (anonymous AND undated AND
  // untagged) have nothing to bucket by and stay out; the metadata
  // movement-overrides file is the durable fix for those.
  for (const a of unresolved) {
    const tally = erasByArtist.get(a.artistSlug);
    if (!tally) continue;
    let bestEra: EraId | null = null;
    let bestCount = 0;
    for (const [era, count] of tally) {
      if (count > bestCount) {
        bestEra = era;
        bestCount = count;
      }
    }
    if (bestEra) m.get(bestEra)!.push(a);
  }

  return m;
}

// --- Floor sampling -------------------------------------------------------

/** Works one storey can hang. The binding constraint is the renderer,
 *  not the plaster: the texture pool is sized for a mounted set of
 *  ~300 (see texture-cache.ts), and the floor plan now opens only as
 *  many rooms as the works need, so wall supply follows the cap rather
 *  than the other way round. Eras above it (Natural History ~1,190,
 *  fin-de-siècle ~690) hang a sample — the rest of the corpus is still
 *  on the site, it just isn't on a wall. */
const MAX_WORKS_PER_FLOOR = 300;

/**
 * Trim an era down to a floor's worth of works, spreading the cut
 * across artists instead of truncating the list.
 *
 * Water-fill by artist, smallest collection first: every artist gets an
 * equal share of whatever capacity is left when their turn comes, so
 * artists with a handful of works keep all of them and the giant
 * collections (Redouté 647 plates, Audubon 435, Monet 380) come down to
 * ~50–100 each rather than swallowing the storey. Within an artist the
 * kept works are sampled at an even stride, so a 435-plate set gives a
 * spread across the whole series rather than the first 100 plates of
 * volume one.
 */
function selectFloorWorks(artworks: ArtworkListing[]): ArtworkListing[] {
  if (artworks.length <= MAX_WORKS_PER_FLOOR) return artworks;

  const byArtist = new Map<string, ArtworkListing[]>();
  for (const a of artworks) {
    // Anonymous works get a bucket each — they're not one artist's
    // collection, so they shouldn't share one artist's share.
    const key = a.artistSlug && a.artistSlug !== "unknown" ? a.artistSlug : `__anon__${a.id}`;
    const bucket = byArtist.get(key);
    if (bucket) bucket.push(a);
    else byArtist.set(key, [a]);
  }

  const buckets = [...byArtist.values()]
    .sort((a, b) => a.length - b.length || a[0].id.localeCompare(b[0].id))
    .map((works) => ({ works, take: 0 }));

  // Repeated equal-share passes over the artists that still have works
  // left. One pass isn't enough on its own: the integer share rounds
  // down, and artists who ran out early free up capacity the remaining
  // artists should absorb.
  let remaining = MAX_WORKS_PER_FLOOR;
  let open = buckets;
  while (remaining > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(remaining / open.length));
    for (const bucket of open) {
      if (remaining === 0) break;
      const add = Math.min(share, bucket.works.length - bucket.take, remaining);
      bucket.take += add;
      remaining -= add;
    }
    open = open.filter((b) => b.take < b.works.length);
  }

  const keep = new Set<string>();
  for (const { works, take } of buckets) {
    for (let i = 0; i < take; i++) keep.add(works[Math.floor((i * works.length) / take)].id);
  }

  return artworks.filter((a) => keep.has(a.id));
}

// --- Per-floor layout -----------------------------------------------------

function buildFloor(era: Era, eraArtworks: ArtworkListing[]): FloorLayout {
  // A storey hangs a bounded number of works, so an era with more of
  // them goes in as a sample rather than a stack — see
  // selectFloorWorks.
  eraArtworks = selectFloorWorks(eraArtworks);
  // Interleave artists across the floor. The source data is grouped by
  // folder (audubon-birds, kunstformen-images, collection-of-beauty),
  // so left untouched the natural-history floor reads Audubon-then-
  // Haeckel and other eras clump by artist/year. Sorting by a stable
  // hash of `id` shuffles within the era without breaking determinism.
  eraArtworks = shuffleByIdHash(eraArtworks);
  const byMovement = groupMovements(era, eraArtworks);
  const anchorMovement = resolveAnchorMovement(era, byMovement);

  // How much plaster this floor actually needs. Each work claims its
  // display width plus its plaque; dividing by the target coverage
  // turns that into wall metres including the air between works.
  const neededWall =
    eraArtworks.reduce((sum, a) => sum + wallFootprint(a), 0) / TARGET_WALL_COVERAGE;

  // Open whole stages until the floor can hang its works at that
  // density. The Grand Hall is always open, so it seeds the running
  // total; the first stage always opens too, so no floor is a single
  // room with a staircase in it.
  let openWall = slotWallMetres(GRAND_HALL);
  let totalSlots = 0;
  for (const stage of SLOT_STAGES) {
    if (totalSlots > 0 && openWall >= neededWall) break;
    for (const slot of stage) openWall += slotWallMetres(slot.rect);
    totalSlots += stage.length;
  }

  // Deal the works into those rooms, biggest movement first. A room
  // takes from one movement until that movement runs dry, then keeps
  // taking from the next — clumping two schools into one room is a
  // smaller compromise than leaving half a room of bare plaster, and
  // the room's sign names whatever ended up dominant. The `· Part 2 /
  // Part 3` suffixes went with it: a movement that spans four rooms
  // now simply reads as four rooms of that movement, which is what a
  // museum wing looks like.
  const queue: Array<{ name: string; artworks: ArtworkListing[] }> = Array.from(
    byMovement.entries(),
  )
    .sort((a, b) => {
      if (a[0] === anchorMovement) return -1;
      if (b[0] === anchorMovement) return 1;
      const aAsian = isEastAsianMovement(a[0]);
      const bAsian = isEastAsianMovement(b[0]);
      if (aAsian && !bAsian) return -1;
      if (!aAsian && bAsian) return 1;
      return b[1].length - a[1].length;
    })
    .map(([name, artworks]) => ({ name, artworks: [...artworks] }));

  const roomRects: CellRect[] = [GRAND_HALL, ...SLOTS.slice(0, totalSlots).map((s) => s.rect)];
  const fills = fillRooms(roomRects, queue, era);

  // Build all rooms.
  const rooms: RoomLayout[] = [];

  // 1. Grand Hall (anchor).
  rooms.push(
    buildRoom({
      era,
      id: `${era.id}-grand-hall`,
      rect: GRAND_HALL,
      movement: fills[0].name,
      artworks: fills[0].artworks,
      isAnchor: true,
      isStairwell: false,
    }),
  );

  // 2. Slot rooms.
  for (let i = 0; i < totalSlots; i++) {
    const slot = SLOTS[i];
    const fill = fills[i + 1];
    const suppressWalls: NonNullable<RoomLayout["suppressWalls"]> = {};
    for (const side of slot.suppress) suppressWalls[side] = true;
    rooms.push(
      buildRoom({
        era,
        id: `${era.id}-${slot.id}`,
        rect: slot.rect,
        movement: fill.name,
        artworks: fill.artworks,
        isAnchor: false,
        isStairwell: false,
        suppressWalls,
      }),
    );
  }

  // 3. Stairwell — owns its 4 walls and connects via cardinal doors to
  //    Grand Hall (north) and any active slot rooms (south, west, east).
  rooms.push(
    buildRoom({
      era,
      id: `${era.id}-stairwell`,
      rect: STAIR,
      movement: STAIR_LABEL,
      artworks: [],
      isAnchor: false,
      isStairwell: true,
    }),
  );

  // No hallways — every connection is a shared wall with a door.
  const hallways: HallwayLayout[] = [];

  // Wire doors between rooms.
  wireDoors(rooms);

  // Walkable + cellOwner masks.
  const walkable = new Uint8Array(GRID_SIZE * GRID_SIZE);
  const cellOwner = new Int16Array(GRID_SIZE * GRID_SIZE);
  cellOwner.fill(-1);

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    for (let x = r.cellBounds.xMin; x <= r.cellBounds.xMax; x++) {
      for (let z = r.cellBounds.zMin; z <= r.cellBounds.zMax; z++) {
        walkable[z * GRID_SIZE + x] = 1;
        cellOwner[z * GRID_SIZE + x] = i;
      }
    }
  }

  const { blockedEdgesEW, blockedEdgesNS } = computeBlockedEdges(GRID_SIZE, rooms, cellOwner);

  const floor: FloorLayout = {
    index: era.index,
    era,
    y: floorY(era.index),
    gridSize: { x: GRID_SIZE, z: GRID_SIZE },
    walkable,
    cellOwner,
    blockedEdgesEW,
    blockedEdgesNS,
    rooms,
    hallways,
    stairsIn: [],
    stairsOut: [],
  };

  // Each room hangs its own movement bucket; overflow spills to free
  // walls on the same floor (see place-paintings.ts).
  const stats = distributePaintings(floor);
  if (stats.dropped > 0 && process.env.NODE_ENV !== "production") {
    // A floor out of wall space drops works silently otherwise. The
    // slot count is sized from the same footprint arithmetic the
    // placer uses, so this should only fire when the floor has run out
    // of *slots* — i.e. an era whose works need more plaster than all
    // 24 rooms carry. Lower MAX_WORKS_PER_FLOOR if it does.
    console.warn(
      `[gallery-layout] ${era.id}: ${stats.dropped} works did not fit on the floor's walls`,
    );
  }

  // Placements are the ground truth for what actually hangs in a room —
  // spill can move works between rooms, so resync the room's artwork
  // list, sign and description to match the walls.
  let roomNumber = 0;
  const accentByMovement = new Map<string, number>();
  for (const room of rooms) {
    if (room.isStairwell) continue;
    room.artworks = room.placements.map((p) => p.artwork);
    room.roomNumber = ++roomNumber;
    room.movement = dominantMovement(room.artworks, era) ?? room.movement;
    room.title = room.movement;
    room.description = describeRoom(room.movement, room.artworks);
    // Floor tint by movement, not by room, so the enfilade of rooms
    // showing one school reads as a single wing underfoot and as one
    // colour zone on the map.
    let accent = accentByMovement.get(room.movement);
    if (accent === undefined) {
      accent = accentByMovement.size;
      accentByMovement.set(room.movement, accent);
    }
    room.floorColor = eraAccentColor(era, accent);
  }

  return floor;
}

/** Wall coverage a well-hung room aims for: the share of a wall run
 *  taken up by paintings and their plaques, with the rest as air. At
 *  the corpus's median footprint (~1.3 m) this lands neighbours ~0.8 m
 *  apart. Slot selection lands a little under it — the wall estimate
 *  assumes three doors per room and most rooms have fewer — so the
 *  measured building comes out around 0.60. The plan used to open a
 *  fixed 16 rooms per floor regardless of what was going on them,
 *  which came out at 37%: gaps of 1.6 m, and floors that read as
 *  under-hung storage rather than galleries. */
const TARGET_WALL_COVERAGE = 0.66;

/**
 * Deal the floor's movements into its rooms, in room order.
 *
 * Every room takes a share of the floor's works proportional to its own
 * wall, so a 22.5 × 20 m hall hangs roughly twice what a 12.5 × 10 m
 * cabinet does and all of them end up at the same density. Filling each
 * room to a fixed target instead would leave the last rooms of a floor
 * bare, because stages are opened in symmetric pairs and so a floor
 * usually opens a little more wall than it strictly needs.
 *
 * A room draws from one movement at a time and only starts on the next
 * when the current one is empty, so movements stay contiguous along the
 * enfilade. The last room takes whatever is left over.
 */
function fillRooms(
  rects: CellRect[],
  queue: Array<{ name: string; artworks: ArtworkListing[] }>,
  era: Era,
): Array<{ name: string; artworks: ArtworkListing[] }> {
  const walls = rects.map(slotWallMetres);
  const totalWall = walls.reduce((a, b) => a + b, 0);
  const totalFootprint = queue.reduce(
    (sum, entry) => sum + entry.artworks.reduce((s, a) => s + wallFootprint(a), 0),
    0,
  );
  const density = totalWall > 0 ? totalFootprint / totalWall : 0;

  const out: Array<{ name: string; artworks: ArtworkListing[] }> = [];
  let qi = 0;

  for (let i = 0; i < rects.length; i++) {
    const isLast = i === rects.length - 1;
    const share = walls[i] * density;
    const taken: ArtworkListing[] = [];
    const contributed = new Map<string, number>();
    let used = 0;

    while (qi < queue.length) {
      const entry = queue[qi];
      if (entry.artworks.length === 0) {
        qi++;
        continue;
      }
      const work = entry.artworks[0];
      const need = wallFootprint(work);
      // Stop once this room has its share — unless it is the last room,
      // which absorbs the remainder, or is still empty (a single work
      // never gets stranded for want of a few centimetres).
      if (!isLast && used > 0 && used + need > share) break;
      entry.artworks.shift();
      taken.push(work);
      contributed.set(entry.name, (contributed.get(entry.name) ?? 0) + 1);
      used += need;
    }

    const name = [...contributed.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? era.title;
    out.push({ name, artworks: taken });
  }

  return out;
}

/** The movement most of a room's works belong to, once the placer has
 *  finished moving spill around. Used for the room's sign, so it always
 *  agrees with what is actually on the walls. */
function dominantMovement(artworks: ArtworkListing[], era: Era): string | null {
  if (artworks.length === 0) return null;
  const counts = new Map<string, number>();
  for (const a of artworks) {
    const mv = a.movement?.trim() ? a.movement : era.title;
    counts.set(mv, (counts.get(mv) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// --- Helpers --------------------------------------------------------------

function shuffleByIdHash<T extends { id: string }>(items: T[]): T[] {
  return items
    .map((item) => ({ item, h: fnv1aHash(item.id) }))
    .sort((a, b) => a.h - b.h)
    .map(({ item }) => item);
}

function fnv1aHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function groupMovements(era: Era, eraArtworks: ArtworkListing[]): Map<string, ArtworkListing[]> {
  const byMovement = new Map<string, ArtworkListing[]>();
  for (const a of eraArtworks) {
    const key = a.movement?.trim() ? a.movement : era.title;
    if (!byMovement.has(key)) byMovement.set(key, []);
    byMovement.get(key)!.push(a);
  }
  return byMovement;
}

/**
 * Heuristic — true if the movement name describes an East Asian
 * tradition (Japanese woodblock prints, Nihonga, etc.) rather than a
 * European school. These works earn their own dedicated room because
 * they belong to an entirely different art-history lineage than the
 * European Renaissance / Baroque / Romantic eras they happen to be
 * year-binned with.
 */
function isEastAsianMovement(name: string): boolean {
  return /Ukiyo-e|Shin-hanga|S(ō|o)saku-hanga|Nihonga|Bijinga|Yamato-e|Sumi-e|Edo|Heian|Song|Ming|Qing|Tang/i.test(
    name,
  );
}

function resolveAnchorMovement(era: Era, byMovement: Map<string, ArtworkListing[]>): string {
  const configured = era.anchor.movement;
  if ((byMovement.get(configured)?.length ?? 0) > 0) return configured;
  const biggest = Array.from(byMovement.entries()).sort((a, b) => b[1].length - a[1].length)[0];
  return biggest ? biggest[0] : era.title;
}

function buildRoom(opts: {
  era: Era;
  id: string;
  rect: CellRect;
  movement: string;
  artworks: ArtworkListing[];
  isAnchor: boolean;
  isStairwell: boolean;
  suppressWalls?: RoomLayout["suppressWalls"];
}): RoomLayout {
  const { era, rect } = opts;
  const id = slugify(opts.id) || opts.id;
  return {
    id,
    floorIndex: era.index,
    movement: opts.movement,
    title: opts.movement,
    description: describeRoom(opts.movement, opts.artworks),
    isAnchor: opts.isAnchor,
    roomNumber: null,
    isStairwell: opts.isStairwell,
    cellBounds: { ...rect },
    worldRect: {
      xMin: rect.xMin * CELL_SIZE + WALL_THICKNESS,
      xMax: (rect.xMax + 1) * CELL_SIZE - WALL_THICKNESS,
      zMin: rect.zMin * CELL_SIZE + WALL_THICKNESS,
      zMax: (rect.zMax + 1) * CELL_SIZE - WALL_THICKNESS,
      y: floorY(era.index),
    },
    doors: [],
    hasBench: opts.isAnchor,
    placements: [],
    artworks: opts.artworks,
    // Placeholder — buildFloor reassigns this by movement rank once
    // the placer has settled what actually hangs where. The stairwell
    // keeps it, and renders with the era's base floor anyway.
    floorColor: era.palette.floorColor,
    suppressWalls: opts.suppressWalls,
  };
}

/**
 * Wire doors between rooms based on shared walls. For every pair of
 * rooms whose rectangles touch on a single edge, we add a reciprocal
 * door at the centre of the shared edge — except where one of the
 * pair is the stairwell on its E/W faces (those stay solid so the
 * spiral central column doesn't show through every doorway).
 *
 * The owner of a shared wall is whichever room does NOT suppress that
 * side; the suppressor draws no wall there but still gets a door so
 * painting placement skips the overlap.
 */
function wireDoors(rooms: RoomLayout[]) {
  const stairwell = rooms.find((r) => r.isStairwell);

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const adj = adjacency(a.cellBounds, b.cellBounds);
      if (!adj) continue;

      // Skip stairwell E/W doors so the central column stays out of
      // sight from corridor entrances.
      if (
        stairwell &&
        (a.id === stairwell.id || b.id === stairwell.id) &&
        (adj.aSide === "east" || adj.aSide === "west")
      ) {
        continue;
      }

      const { worldX, worldZ, aSide, bSide } = adj;
      addDoor(a, aSide, worldX, worldZ, {
        kind: "hallway",
        hallwayId: `room:${b.id}`,
      });
      addDoor(b, bSide, worldX, worldZ, {
        kind: "hallway",
        hallwayId: `room:${a.id}`,
      });
    }
  }
}

/**
 * For two cell rectangles `a` and `b`, detect whether they share an
 * edge and if so return the world-space centre of that shared edge plus
 * which side of `a` and which side of `b` the edge lies on.
 */
function adjacency(
  a: CellRect,
  b: CellRect,
): { aSide: Door["side"]; bSide: Door["side"]; worldX: number; worldZ: number } | null {
  // a's east wall touches b's west wall.
  if (a.xMax + 1 === b.xMin && rangeOverlap(a.zMin, a.zMax, b.zMin, b.zMax)) {
    const overlap = overlapCenter(a.zMin, a.zMax, b.zMin, b.zMax);
    return {
      aSide: "east",
      bSide: "west",
      worldX: (a.xMax + 1) * CELL_SIZE,
      worldZ: (overlap + 0.5) * CELL_SIZE,
    };
  }
  // a's west wall touches b's east wall.
  if (b.xMax + 1 === a.xMin && rangeOverlap(a.zMin, a.zMax, b.zMin, b.zMax)) {
    const overlap = overlapCenter(a.zMin, a.zMax, b.zMin, b.zMax);
    return {
      aSide: "west",
      bSide: "east",
      worldX: a.xMin * CELL_SIZE,
      worldZ: (overlap + 0.5) * CELL_SIZE,
    };
  }
  // a's south wall (high z) touches b's north wall (low z). Cardinal
  // convention: south = high z, north = low z.
  if (a.zMax + 1 === b.zMin && rangeOverlap(a.xMin, a.xMax, b.xMin, b.xMax)) {
    const overlap = overlapCenter(a.xMin, a.xMax, b.xMin, b.xMax);
    return {
      aSide: "south",
      bSide: "north",
      worldX: (overlap + 0.5) * CELL_SIZE,
      worldZ: (a.zMax + 1) * CELL_SIZE,
    };
  }
  // a's north wall (low z) touches b's south wall (high z).
  if (b.zMax + 1 === a.zMin && rangeOverlap(a.xMin, a.xMax, b.xMin, b.xMax)) {
    const overlap = overlapCenter(a.xMin, a.xMax, b.xMin, b.xMax);
    return {
      aSide: "north",
      bSide: "south",
      worldX: (overlap + 0.5) * CELL_SIZE,
      worldZ: a.zMin * CELL_SIZE,
    };
  }
  return null;
}

/**
 * Build the per-edge wall mask the player uses for collision. Walls
 * sit on cell boundaries; if cells (x, z) and (x+1, z) belong to two
 * different rooms, a wall divides them — and that edge is blocked
 * unless one of the room's doors covers the cell midpoint.
 *
 * Edges between same-room cells, or between any room/hallway and
 * non-walkable space, are NOT in this mask (the latter is handled by
 * the cell `walkable` mask; the former is free passage by definition).
 */
function computeBlockedEdges(
  gridSize: number,
  rooms: RoomLayout[],
  cellOwner: Int16Array,
): { blockedEdgesEW: Uint8Array; blockedEdgesNS: Uint8Array } {
  const blockedEdgesEW = new Uint8Array((gridSize - 1) * gridSize);
  const blockedEdgesNS = new Uint8Array(gridSize * (gridSize - 1));
  const HALF_DOOR = DOOR_WIDTH / 2; // tolerance for "covers".

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize - 1; x++) {
      const a = cellOwner[z * gridSize + x];
      const b = cellOwner[z * gridSize + (x + 1)];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 1) * CELL_SIZE;
      const edgeWorldZ = (z + 0.5) * CELL_SIZE;
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "east" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            Math.abs(d.worldZ - edgeWorldZ) < HALF_DOOR,
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "west" &&
            Math.abs(d.worldX - edgeWorldX) < 0.01 &&
            Math.abs(d.worldZ - edgeWorldZ) < HALF_DOOR,
        );
      if (!open) blockedEdgesEW[z * (gridSize - 1) + x] = 1;
    }
  }

  for (let z = 0; z < gridSize - 1; z++) {
    for (let x = 0; x < gridSize; x++) {
      const a = cellOwner[z * gridSize + x];
      const b = cellOwner[(z + 1) * gridSize + x];
      if (a < 0 || b < 0 || a === b) continue;
      const edgeWorldX = (x + 0.5) * CELL_SIZE;
      const edgeWorldZ = (z + 1) * CELL_SIZE;
      // a is at lower z = cardinal "north" cell; the shared wall is on
      // a's south face (high z) and on b's north face (low z).
      const open =
        rooms[a].doors.some(
          (d) =>
            d.side === "south" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            Math.abs(d.worldX - edgeWorldX) < HALF_DOOR,
        ) ||
        rooms[b].doors.some(
          (d) =>
            d.side === "north" &&
            Math.abs(d.worldZ - edgeWorldZ) < 0.01 &&
            Math.abs(d.worldX - edgeWorldX) < HALF_DOOR,
        );
      if (!open) blockedEdgesNS[z * gridSize + x] = 1;
    }
  }

  return { blockedEdgesEW, blockedEdgesNS };
}

function rangeOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 <= b1 && b0 <= a1;
}

function overlapCenter(a0: number, a1: number, b0: number, b1: number): number {
  // Cell-axis midpoint of the overlapping integer range; +0.5 in the
  // caller maps it to the centre of the cell in world space.
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return Math.floor((lo + hi) / 2);
}

function addDoor(
  room: RoomLayout,
  side: Door["side"],
  worldX: number,
  worldZ: number,
  connectsTo: Door["connectsTo"],
) {
  room.doors.push({
    side,
    worldX,
    worldZ,
    worldY: room.worldRect.y,
    width: DOOR_WIDTH,
    connectsTo,
  });
}

// --- Spiral staircase between floors --------------------------------------

function buildStaircase(lower: FloorLayout, upper: FloorLayout): Staircase | null {
  const lowerStair = lower.rooms.find((r) => r.isStairwell);
  const upperStair = upper.rooms.find((r) => r.isStairwell);
  if (!lowerStair || !upperStair) return null;

  const centerX = ((STAIR.xMin + STAIR.xMax + 1) / 2) * CELL_SIZE;
  const centerZ = ((STAIR.zMin + STAIR.zMax + 1) / 2) * CELL_SIZE;

  return {
    id: `stair-${lower.index}-to-${upper.index}`,
    lowerFloor: lower.index,
    upperFloor: upper.index,
    lowerLabel: lower.era.title,
    upperLabel: upper.era.title,
    centerX,
    centerZ,
    innerRadius: SPIRAL_INNER_RADIUS,
    outerRadius: SPIRAL_OUTER_RADIUS,
    numSteps: SPIRAL_STEPS_PER_FLOOR,
    direction: 1,
    lowerY: lower.y,
    upperY: upper.y,
    // High z = south (cardinal). The stairwell's grand-hall door sits
    // on the south wall, so anchoring step 0 there means a player
    // walking in from the grand hall meets the spiral entry square on.
    entryAngle: Math.PI / 2,
  };
}

// --- Copy helpers ---------------------------------------------------------

function describeRoom(movement: string, artworks: ArtworkListing[]): string {
  if (artworks.length === 0) return movement;
  const years = artworks.map((a) => a.year).filter((y): y is number => y != null);
  if (years.length === 0) return `${movement} · ${artworks.length} works`;
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (max - min < 30) {
    return `${movement} · ${artworks.length} works around ${min}`;
  }
  return `${movement} · ${artworks.length} works · ${min}–${max}`;
}
