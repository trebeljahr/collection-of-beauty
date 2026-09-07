// Painting placement for rooms.
//
// Every room hangs its own movement bucket (`room.artworks`) on its own
// walls, so the room label and the works inside it actually agree. One
// work per wall position, all at the same eye-level line — a single
// "mono row" hang, no salon stacking and no mosaic grids. Whatever
// doesn't fit in its home room spills to free wall space elsewhere on
// the same floor; anything still left over is dropped, which is why the
// floor builder trims each era to a floor's worth of works before we
// get here (see `selectFloorWorks` in layout-museum.ts).
//
// Placement is continuous, not cell-quantised. Each wall is cut into
// "runs" — maximal stretches of paintable plaster between the room's
// corners and its door openings — and the works assigned to a run are
// laid out edge to edge with one shared gap. The gap is whatever is
// left over after the paintings, so neighbours are separated by the
// same distance whether they are 0.3 m engravings or 3 m canvases.
// (The old code hung one work per 2.5 m grid cell, which pinned the
// *centres* to a uniform pitch and therefore made the *gaps* vary with
// painting width — 0.5 m between two big canvases, 2.1 m between two
// small ones, and a full empty cell wherever supply ran short.)

import type { ArtworkListing } from "@/lib/data";
import { artworkBand } from "./painting-bands";
import type { Door, FloorLayout, Placement, RoomLayout } from "./types";
import { CELL_SIZE } from "./world-coords";

/** Eye-height-ish centre for every wall-mounted painting. Sized so the
 *  largest 3.2 m painting tops out at 3.25 m and bottoms at 0.05 m —
 *  noticeably more monumental than the door (2.4 m) without crashing
 *  into the 4.2 m ceiling or hanging into the floor. Lowered from
 *  1.9 m to read closer to a real-museum hang (where centres land
 *  around 1.45-1.55 m, slightly below the player's 1.75 m eye line). */
const CANONICAL_Y_CENTER_OFFSET = 1.65;
/** Smallest long edge (metres) any work renders at. The corpus includes
 *  pocket-sized engravings (8–15 cm) whose true scale would be
 *  invisible on a 15 m wall; museums hang those in vitrines we don't
 *  have, so we cheat them up to a readable small-print size instead of
 *  excluding them. */
const MIN_DISPLAY_LONG_EDGE = 0.45;
/** Max painting dimensions in metres, independent of real-world size.
 *  Acts as an upper bound; a short run further constrains this so a
 *  painting never overruns the plaster it was assigned. Sized to feel
 *  monumental against the 2.4 m door while still leaving a metre of
 *  head clearance to the 4.2 m ceiling. Width used to be capped at
 *  2.4 m because a painting had to fit inside one 2.5 m grid cell;
 *  with continuous runs the only real constraint is the height cap and
 *  the run itself, so the two caps now match. */
const MAX_PAINTING_W = 3.2;
const MAX_PAINTING_H_ROOM = 3.2;
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
 *  painting.tsx — keep in sync if those move. Plaques always hang on
 *  the painting's right (museum convention), so a work's footprint on
 *  the wall is its width plus this. */
const PLAQUE_FOOTPRINT = 0.06 + 0.308;
/** Minimum gap from a run's end to the perpendicular room wall. */
const WALL_MARGIN = 0.3;
/** Minimum gap between a painting's plaque and the next painting.
 *  Only binds when a run is packed to capacity; normally the leftover
 *  plaster opens the gap well past this. */
const ADJACENT_GAP = 0.1;
/** Safety valve: widest gap the even spread will open before a run
 *  stops stretching and centres its works instead. It rarely binds —
 *  the density-balanced assignment keeps in-run gaps around 1.6 m
 *  across the building — but it stops a run that ends up with one or
 *  two works from strewing them down 17 m of plaster. */
const MAX_HANG_GAP = 3.5;
/** Plaster either side of a door opening that stays empty, so a
 *  painting never crowds the doorframe. */
const DOOR_CLEARANCE = 0.35;
/** A run shorter than this can't hold even the smallest work plus its
 *  plaque, so it's discarded rather than carried around empty. */
const MIN_RUN_LENGTH = 0.6;
/** Minimum air gap between a painting's bottom edge and the floor. The
 *  canonical wallY centre puts a max-height (3.2 m) painting's bottom at
 *  ~0.05 m, which reads as touching the floor. For tall paintings we lift
 *  the centre so the bottom clears the floor by this much; shorter paintings
 *  whose bottom already exceeds this clearance keep their canonical centre
 *  (the "salon hang" eye-line is the priority for typical works). */
const PAINTING_FLOOR_GAP = 0.2;

/**
 * A maximal stretch of hangable plaster on one room wall.
 *
 * Positions along the run are tracked in `u` — a viewer-left-to-right
 * coordinate. Plaques always sit on the painting's right, so working in
 * `u` means the plaque is always at higher `u` regardless of which
 * compass wall we're on; `sign` maps `u` back onto the world axis.
 */
export type WallRun = {
  /** World axis the wall runs along. */
  axis: "x" | "z";
  /** World coordinate of the wall surface on the perpendicular axis. */
  surface: number;
  /** worldCoord = sign * u. +1 when the viewer's right hand points at
   *  higher world coordinates on this wall. */
  sign: 1 | -1;
  /** Paintable span in `u`, already inset from corners and doors. */
  uMin: number;
  uMax: number;
  rotationY: number;
  /** Direction the painting faces, used to nudge it off the wall. */
  normalX: -1 | 0 | 1;
  normalZ: -1 | 0 | 1;
  /** World Y of this room's floor, for the tall-painting floor lift. */
  floorY: number;
  /** Canonical eye-line centre for works on this run. */
  centerY: number;
  maxHeight: number;
};

export function runLength(run: WallRun): number {
  return run.uMax - run.uMin;
}

/**
 * Cut a room's four walls into paintable runs: inset from the corners
 * by WALL_MARGIN, split at every door opening.
 */
export function computeRoomRuns(room: RoomLayout): WallRun[] {
  const { cellBounds, worldRect } = room;
  const centerY = worldRect.y + CANONICAL_Y_CENTER_OFFSET;

  // Mapping (verified from rotationY + normal):
  //   north → viewer faces +Z, right = +X (higher x) → sign +1
  //   south → viewer faces -Z, right = -X (lower x)  → sign -1
  //   west  → viewer faces +X, right = -Z (lower z)  → sign -1
  //   east  → viewer faces -X, right = +Z (higher z) → sign +1
  const walls: Array<{
    side: Door["side"];
    axis: "x" | "z";
    surface: number;
    cellMin: number;
    cellMax: number;
    sign: 1 | -1;
    rotationY: number;
    normalX: -1 | 0 | 1;
    normalZ: -1 | 0 | 1;
  }> = [
    {
      side: "north",
      axis: "x",
      surface: cellBounds.zMin * CELL_SIZE,
      cellMin: cellBounds.xMin,
      cellMax: cellBounds.xMax,
      sign: 1,
      rotationY: 0,
      normalX: 0,
      normalZ: 1,
    },
    {
      side: "south",
      axis: "x",
      surface: (cellBounds.zMax + 1) * CELL_SIZE,
      cellMin: cellBounds.xMin,
      cellMax: cellBounds.xMax,
      sign: -1,
      rotationY: Math.PI,
      normalX: 0,
      normalZ: -1,
    },
    {
      side: "west",
      axis: "z",
      surface: cellBounds.xMin * CELL_SIZE,
      cellMin: cellBounds.zMin,
      cellMax: cellBounds.zMax,
      sign: -1,
      rotationY: Math.PI / 2,
      normalX: 1,
      normalZ: 0,
    },
    {
      side: "east",
      axis: "z",
      surface: (cellBounds.xMax + 1) * CELL_SIZE,
      cellMin: cellBounds.zMin,
      cellMax: cellBounds.zMax,
      sign: 1,
      rotationY: -Math.PI / 2,
      normalX: -1,
      normalZ: 0,
    },
  ];

  const runs: WallRun[] = [];
  for (const wall of walls) {
    const worldStart = wall.cellMin * CELL_SIZE + WALL_MARGIN;
    const worldEnd = (wall.cellMax + 1) * CELL_SIZE - WALL_MARGIN;
    if (worldEnd - worldStart < MIN_RUN_LENGTH) continue;

    // Door openings become forbidden intervals in `u`.
    const cuts: Array<[number, number]> = [];
    for (const door of room.doors) {
      if (door.side !== wall.side) continue;
      const coord = wall.axis === "x" ? door.worldX : door.worldZ;
      const lo = wall.sign * (coord - door.width / 2 - DOOR_CLEARANCE);
      const hi = wall.sign * (coord + door.width / 2 + DOOR_CLEARANCE);
      cuts.push(lo < hi ? [lo, hi] : [hi, lo]);
    }
    cuts.sort((a, b) => a[0] - b[0]);

    const spanLo = Math.min(wall.sign * worldStart, wall.sign * worldEnd);
    const spanHi = Math.max(wall.sign * worldStart, wall.sign * worldEnd);

    let cursor = spanLo;
    const push = (uMin: number, uMax: number) => {
      if (uMax - uMin < MIN_RUN_LENGTH) return;
      runs.push({
        axis: wall.axis,
        surface: wall.surface,
        sign: wall.sign,
        uMin,
        uMax,
        rotationY: wall.rotationY,
        normalX: wall.normalX,
        normalZ: wall.normalZ,
        floorY: worldRect.y,
        centerY,
        maxHeight: MAX_PAINTING_H_ROOM,
      });
    };
    for (const [lo, hi] of cuts) {
      if (hi <= cursor) continue;
      push(cursor, Math.min(lo, spanHi));
      cursor = Math.max(cursor, hi);
      if (cursor >= spanHi) break;
    }
    push(cursor, spanHi);
  }

  return runs;
}

export type DistributionStats = {
  /** Total paintable plaster on the floor, metres. */
  wallMetres: number;
  /** Metres of that plaster actually covered by paintings + plaques. */
  hungMetres: number;
  placed: number;
  dropped: number;
};

/** A sized work waiting for a wall: the natural display dimensions are
 *  computed once up front so the distributor can fit each work to the
 *  run it lands in. */
type SizedWork = { artwork: ArtworkListing; wM: number; hM: number };

/** Footprint a work claims on a wall: its own width plus the plaque
 *  that hangs to its right. */
function footprintOf(work: SizedWork): number {
  return work.wM + PLAQUE_FOOTPRINT;
}

/** One room's runs plus the works assigned to each, tracked with a
 *  running footprint total so "does this still fit?" is O(1). */
type Container = {
  room: RoomLayout;
  runs: WallRun[];
  assigned: SizedWork[][];
  /** Sum of assigned footprints per run. */
  used: number[];
};

/** Plaster left on a run after its current works and their minimum
 *  separations — how much more it could absorb. */
function slack(container: Container, runIdx: number): number {
  const count = container.assigned[runIdx].length;
  const minGaps = Math.max(0, count) * ADJACENT_GAP; // one more work ⇒ one more gap
  return runLength(container.runs[runIdx]) - container.used[runIdx] - minGaps;
}

/** Hang `work` on the *proportionally* emptiest run of `container` —
 *  the one with the most slack per metre of plaster — if any run can
 *  still take it. Absolute slack would pour everything into the room's
 *  longest wall and leave the short stretches beside doors bare;
 *  relative slack fills every run at the same rate, so the hang reads
 *  evenly all the way round the room. */
function tryAssign(container: Container, work: SizedWork): boolean {
  const need = footprintOf(work);
  let bestIdx = -1;
  let bestDensity = 0;
  for (let i = 0; i < container.runs.length; i++) {
    const s = slack(container, i);
    if (s < need) continue;
    const density = s / runLength(container.runs[i]);
    if (density > bestDensity) {
      bestIdx = i;
      bestDensity = density;
    }
  }
  if (bestIdx < 0) return false;
  container.assigned[bestIdx].push(work);
  container.used[bestIdx] += need;
  return true;
}

/**
 * Distribute the floor's artworks into its rooms. Mutates
 * `floor.rooms[*].placements`.
 *
 *  - Every room hangs its own `room.artworks` (the movement bucket the
 *    floor builder assigned to it) on its own walls.
 *  - A room's capacity is its paintable wall length, not a cell count,
 *    so a room of miniatures holds more works than a room of altarpieces.
 *  - Supply beyond a room's capacity spills to free wall space in other
 *    rooms on the same floor; whatever the floor can't hold is dropped
 *    (the floor builder trims the era to a floor's worth up front, so
 *    this should only ever bite by a handful of works).
 */
export function distributePaintings(floor: FloorLayout): DistributionStats {
  // Stairwell rooms are excluded — their walls hold the spiral steps
  // and signs, not paintings.
  const containers: Container[] = floor.rooms
    .filter((r) => !r.isStairwell)
    .map((room) => {
      const runs = computeRoomRuns(room);
      return {
        room,
        runs,
        assigned: runs.map(() => []),
        used: runs.map(() => 0),
      };
    });

  const pool: SizedWork[] = [];
  for (const container of containers) {
    for (const artwork of container.room.artworks) {
      const work = sizeWork(artwork);
      if (!tryAssign(container, work)) pool.push(work);
    }
  }

  // Hand the overflow to whichever room still has the most spare wall,
  // biggest work first — a large canvas has the fewest runs that can
  // take it, so it gets first pick of the remaining plaster.
  pool.sort((a, b) => footprintOf(b) - footprintOf(a));
  let dropped = 0;
  for (const work of pool) {
    const need = footprintOf(work);
    let best: Container | null = null;
    let bestDensity = 0;
    for (const container of containers) {
      for (let i = 0; i < container.runs.length; i++) {
        const s = slack(container, i);
        if (s < need) continue;
        const density = s / runLength(container.runs[i]);
        if (density > bestDensity) {
          best = container;
          bestDensity = density;
        }
      }
    }
    if (!best || !tryAssign(best, work)) dropped++;
  }

  let wallMetres = 0;
  let hungMetres = 0;
  let placed = 0;
  for (const container of containers) {
    for (let i = 0; i < container.runs.length; i++) {
      wallMetres += runLength(container.runs[i]);
      hungMetres += container.used[i];
      placed += container.assigned[i].length;
      container.room.placements.push(...packRun(container.runs[i], container.assigned[i]));
    }
  }

  return { wallMetres, hungMetres, placed, dropped };
}

/**
 * Lay `works` along `run` with one shared gap between neighbours.
 *
 * The leftover plaster — run length minus every footprint — is split
 * evenly into the gaps between works and the two end margins, so the
 * rhythm is identical regardless of how the widths vary. When that
 * would open a gap wider than MAX_HANG_GAP the run stops stretching and
 * the group is centred instead, which is what keeps an under-hung wall
 * from reading as scattered.
 *
 * Within the run works are arranged largest-in-the-middle, tapering
 * outwards, so a wall reads as a composed group rather than a random
 * sequence of sizes.
 */
export function packRun(run: WallRun, works: SizedWork[]): Placement[] {
  if (works.length === 0) return [];

  const span = runLength(run);
  const fitted = works.map((work) => {
    const { wM, hM } = fitTo(work, Math.min(MAX_PAINTING_W, span), run.maxHeight);
    return { artwork: work.artwork, wM, hM };
  });

  const ordered = centreOut(fitted);
  const total = ordered.reduce((sum, w) => sum + w.wM + PLAQUE_FOOTPRINT, 0);
  const leftover = Math.max(0, span - total);

  // gaps: one before the first work, one between each pair, one after
  // the last — hence works.length + 1.
  let gap = leftover / (ordered.length + 1);
  let cursor = run.uMin + gap;
  if (gap > MAX_HANG_GAP) {
    gap = MAX_HANG_GAP;
    const grouped = total + gap * (ordered.length - 1);
    cursor = run.uMin + (span - grouped) / 2;
  }

  const placements: Placement[] = [];
  for (const work of ordered) {
    const centreU = cursor + work.wM / 2;
    // Lift the centre for paintings tall enough that the canonical hang
    // would put their bottom edge into the floor. Most paintings keep
    // the canonical eye-line; only the tallest get raised so the bottom
    // clears the floor by PAINTING_FLOOR_GAP.
    const minCenterY = run.floorY + PAINTING_FLOOR_GAP + work.hM / 2;
    const centerY = Math.max(run.centerY, minCenterY);
    const along = run.sign * centreU;
    placements.push({
      artwork: work.artwork,
      position: [
        (run.axis === "x" ? along : run.surface) + run.normalX * PAINTING_WALL_OFFSET,
        centerY,
        (run.axis === "z" ? along : run.surface) + run.normalZ * PAINTING_WALL_OFFSET,
      ],
      rotation: [0, run.rotationY, 0],
      band: artworkBand(work.artwork),
      widthM: work.wM,
      heightM: work.hM,
    });
    cursor += work.wM + PLAQUE_FOOTPRINT + gap;
  }

  return placements;
}

/** Reorder so the widest work sits in the middle of the run and the
 *  rest taper out to both ends. Deterministic: the input order breaks
 *  ties, and the input is already a stable hash shuffle. */
function centreOut<T extends { wM: number }>(works: T[]): T[] {
  const descending = [...works].sort((a, b) => b.wM - a.wM);
  const out: T[] = [];
  for (let i = 0; i < descending.length; i++) {
    // Widest first: alternate appending to the right and left ends, so
    // the sequence grows outwards from the centre.
    if (i % 2 === 0) out.push(descending[i]);
    else out.unshift(descending[i]);
  }
  return out;
}

/** Scale a sized work down (never up) to fit a width/height cap,
 *  preserving aspect. */
function fitTo(work: SizedWork, maxWidth: number, maxHeight: number): { wM: number; hM: number } {
  const scale = Math.min(maxWidth / work.wM, maxHeight / work.hM, 1);
  return { wM: work.wM * scale, hM: work.hM * scale };
}

/** Natural display dimensions in metres, before any run fitting.
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

  // Cap once here so the distributor's footprint arithmetic matches
  // what packRun will actually hang.
  const capped = fitTo({ artwork, wM, hM }, MAX_PAINTING_W, MAX_PAINTING_H_ROOM);
  return { artwork, wM: capped.wM, hM: capped.hM };
}
