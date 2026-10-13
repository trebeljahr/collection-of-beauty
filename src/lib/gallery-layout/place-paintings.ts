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
import {
  type FrameDesign,
  frameExtents,
  frameReach,
  pickFrameDesign,
  roomHanging,
  wallHanging,
} from "./frame-design";
import { artworkBand } from "./painting-bands";
import { eraOfRoom } from "./room-era";
import type { CellRect, Divider, Door, FloorLayout, Placement, RoomLayout } from "./types";
import { CELL_SIZE, DIVIDER_THICKNESS, DOOR_WIDTH, PORTAL_WIDTH } from "./world-coords";

/** Eye-height-ish centre for every wall-mounted painting. A work too
 *  tall to hang there without coming within PAINTING_FLOOR_GAP of the
 *  floor is lifted (see `packRun`). Lowered from
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
export const MAX_PAINTING_W = 3.2;
const MAX_PAINTING_H_ROOM = 3.2;
/** Wall left bare between the tallest canvas a room hangs and its
 *  ceiling, on top of the gap under it. The frame's top rail and the
 *  picture light share it. A 4.0 m cabinet hangs nothing taller than
 *  2.6 m; the standard 4.8 m room reaches the 3.2 m cap above. Taller
 *  rooms keep the cap: the hang does not grow with the ceiling. */
const CEILING_CLEARANCE = 1.0;
/** Inset from the wall surface so paintings don't z-fight. Sized to
 *  put the back of the painting frame box flush against the wall —
 *  frame box depth in painting.tsx is 0.025 m, half-depth + a 1 mm
 *  z-fight margin = ~0.014 m. Bumped to 0.02 for a comfortable hair
 *  of clearance. Exported because painting.tsx also needs it (the
 *  plaque parks itself at -PAINTING_WALL_OFFSET in local space to land
 *  back on the wall surface). */
export const PAINTING_WALL_OFFSET = 0.02;
/** Air between a frame's outer edge and the plaque beside it. */
export const PLAQUE_GAP = 0.05;
/** Width of the plaque, mount plate included. painting.tsx draws it
 *  from this. */
export const PLAQUE_WIDTH = 0.308;
/** Wall the plaque takes beyond the frame. Plaques always hang on the
 *  painting's right (museum convention). */
export const PLAQUE_FOOTPRINT = PLAQUE_GAP + PLAQUE_WIDTH;
/** Minimum gap from a run's end to the perpendicular room wall. */
const WALL_MARGIN = 0.3;
/** Minimum gap between a painting's plaque and the next frame.
 *  Only binds when a run is packed to capacity; normally the leftover
 *  plaster opens the gap well past this. */
const ADJACENT_GAP = 0.1;
/** How much wider a run with nothing on it reads than a gap of the same
 *  length between two works. At 1 the tower left 44 panel faces bare
 *  beside hung ones; at 3 a room with as many surfaces as works hung
 *  one work on each, and an 11.9 m wall stood with 4.9 m bare either
 *  side of its one canvas. */
const BARE_RUN_WEIGHT = 2;
/** Plaster either side of a door opening that stays empty, so a
 *  painting never crowds the doorframe. */
const DOOR_CLEARANCE = 0.35;
/** A run shorter than this can't hold even the smallest work plus its
 *  plaque, so it's discarded rather than carried around empty. */
const MIN_RUN_LENGTH = 0.6;
/** Minimum air gap between a frame's bottom edge and the floor. The
 *  canonical wallY centre puts a max-height (3.2 m) painting's bottom at
 *  ~0.05 m, which reads as touching the floor. For tall paintings we lift
 *  the centre so the frame clears the floor (and the skirting) by this
 *  much; shorter paintings whose frame already exceeds this clearance keep
 *  their canonical centre (the "salon hang" eye-line is the priority for
 *  typical works). 0.2 m still read as standing on the floor, so it is
 *  0.4 m since 12 October 2026. */
export const PAINTING_FLOOR_GAP = 0.4;

/**
 * A maximal stretch of hangable plaster on one room wall.
 *
 * Positions along the run are tracked in `u` — a viewer-left-to-right
 * coordinate. Plaques always sit on the painting's right, so working in
 * `u` means the plaque is always at higher `u` regardless of which
 * compass wall we're on; `sign` maps `u` back onto the world axis.
 */
export type WallRun = {
  /** Compass wall of the room this run belongs to. */
  side: Door["side"];
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
  /** Set when the run is a face of one of the room's dividers: the
   *  index into `room.dividers`. `side` then names the compass wall the
   *  face is hung like (a face looking south hangs like a north wall). */
  divider?: number;
  /** Set on what is left of a run either side of a work hung at a set
   *  place (`hangForBenches`): one end of it is that work. With nothing
   *  on it, it is a gap beside a work and not a bare wall. */
  abuts?: true;
  /** The hung face of a door screen: a wall for one picture, the
   *  largest the room has that fits it (`hangFeatures`). */
  feature?: boolean;
};

export function runLength(run: WallRun): number {
  return run.uMax - run.uMin;
}

/** Names the wall a run is a stretch of: one face of a room wall or of
 *  a divider. Runs either side of a door share it. */
function wallKey(run: WallRun): string {
  return `${run.side}:${run.surface}:${run.divider ?? ""}`;
}

/**
 * Cut a room's walls into paintable runs: the four room walls inset
 * from the corners by WALL_MARGIN and split at every door opening and
 * at every wing wall built off them, then both faces of each divider.
 */
export function computeRoomRuns(room: RoomLayout): WallRun[] {
  const { cellBounds, worldRect } = room;
  const centerY = worldRect.y + CANONICAL_Y_CENTER_OFFSET;
  const maxHeight = Math.min(
    MAX_PAINTING_H_ROOM,
    room.ceilingHeight - PAINTING_FLOOR_GAP - CEILING_CLEARANCE,
  );

  const walls: Array<{
    side: Door["side"];
    axis: "x" | "z";
    /** Grid line the wall stands on. */
    line: number;
    cellMin: number;
    cellMax: number;
  }> = [
    {
      side: "north",
      axis: "x",
      line: cellBounds.zMin,
      cellMin: cellBounds.xMin,
      cellMax: cellBounds.xMax,
    },
    {
      side: "south",
      axis: "x",
      line: cellBounds.zMax + 1,
      cellMin: cellBounds.xMin,
      cellMax: cellBounds.xMax,
    },
    {
      side: "west",
      axis: "z",
      line: cellBounds.xMin,
      cellMin: cellBounds.zMin,
      cellMax: cellBounds.zMax,
    },
    {
      side: "east",
      axis: "z",
      line: cellBounds.xMax + 1,
      cellMin: cellBounds.zMin,
      cellMax: cellBounds.zMax,
    },
  ];

  const runs: WallRun[] = [];
  for (const wall of walls) {
    const facing = FACINGS[wall.side];
    const worldStart = wall.cellMin * CELL_SIZE + WALL_MARGIN;
    const worldEnd = (wall.cellMax + 1) * CELL_SIZE - WALL_MARGIN;
    if (worldEnd - worldStart < MIN_RUN_LENGTH) continue;

    // Door openings become forbidden intervals in `u`.
    const cuts: Array<[number, number]> = [];
    const cut = (from: number, to: number) => {
      const lo = facing.sign * from;
      const hi = facing.sign * to;
      cuts.push(lo < hi ? [lo, hi] : [hi, lo]);
    };
    for (const door of room.doors) {
      if (door.side !== wall.side) continue;
      const coord = wall.axis === "x" ? door.worldX : door.worldZ;
      cut(coord - door.width / 2 - DOOR_CLEARANCE, coord + door.width / 2 + DOOR_CLEARANCE);
    }
    // So does a wing wall built off this wall: it covers its own
    // thickness, and a work needs the same margin from that corner as
    // from the room's.
    for (const divider of room.dividers) {
      if (!attachesTo(divider, wall.axis, wall.line)) continue;
      const coord = divider.line * CELL_SIZE;
      const half = DIVIDER_THICKNESS / 2 + WALL_MARGIN;
      cut(coord - half, coord + half);
    }
    cuts.sort((a, b) => a[0] - b[0]);

    const spanLo = Math.min(facing.sign * worldStart, facing.sign * worldEnd);
    const spanHi = Math.max(facing.sign * worldStart, facing.sign * worldEnd);

    let cursor = spanLo;
    const push = (uMin: number, uMax: number) => {
      if (uMax - uMin < MIN_RUN_LENGTH) return;
      runs.push({
        side: wall.side,
        axis: wall.axis,
        surface: wall.line * CELL_SIZE,
        ...facing,
        uMin,
        uMax,
        floorY: worldRect.y,
        centerY,
        maxHeight,
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

  // Both faces of every divider, each one run from end to end. A face
  // is hung like the room wall that looks the same way, half the
  // divider's thickness off its grid line. A screen's back, the face
  // toward its door, is no run.
  room.dividers.forEach((divider, index) => {
    const worldStart = divider.start * CELL_SIZE + WALL_MARGIN;
    const worldEnd = divider.end * CELL_SIZE - WALL_MARGIN;
    if (worldEnd - worldStart < MIN_RUN_LENGTH) return;
    const sides: Array<Door["side"]> = divider.axis === "x" ? ["north", "south"] : ["west", "east"];
    for (const side of sides) {
      const facing = FACINGS[side];
      const out = divider.axis === "x" ? facing.normalZ : facing.normalX;
      if (divider.bare === (out > 0 ? "high" : "low")) continue;
      runs.push({
        side,
        axis: divider.axis,
        surface: divider.line * CELL_SIZE + (out * DIVIDER_THICKNESS) / 2,
        ...facing,
        uMin: Math.min(facing.sign * worldStart, facing.sign * worldEnd),
        uMax: Math.max(facing.sign * worldStart, facing.sign * worldEnd),
        floorY: worldRect.y,
        centerY,
        maxHeight,
        divider: index,
        ...(divider.bare && { feature: true }),
      });
    }
  });

  return runs;
}

// How a work hangs on a wall that looks into the room from each compass
// side (verified from rotationY + normal). The viewer faces the wall:
//   north → wall looks +Z, viewer's right = +X (higher x) → sign +1
//   south → wall looks -Z, viewer's right = -X (lower x)  → sign -1
//   west  → wall looks +X, viewer's right = -Z (lower z)  → sign -1
//   east  → wall looks -X, viewer's right = +Z (higher z) → sign +1
const FACINGS: Record<Door["side"], Pick<WallRun, "sign" | "rotationY" | "normalX" | "normalZ">> = {
  north: { sign: 1, rotationY: 0, normalX: 0, normalZ: 1 },
  south: { sign: -1, rotationY: Math.PI, normalX: 0, normalZ: -1 },
  west: { sign: -1, rotationY: Math.PI / 2, normalX: 1, normalZ: 0 },
  east: { sign: 1, rotationY: -Math.PI / 2, normalX: -1, normalZ: 0 },
};

/** Is this divider built off the wall that runs along `wallAxis` on
 *  grid line `wallLine`? Only a divider across the wall can be, and
 *  only when one of its ends is on that line. */
function attachesTo(divider: Divider, wallAxis: "x" | "z", wallLine: number): boolean {
  return divider.axis !== wallAxis && (divider.start === wallLine || divider.end === wallLine);
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
export type SizedWork = { artwork: ArtworkListing; wM: number; hM: number };

/** How far the work's frame reaches past each canvas edge, metres.
 *  The frame is chosen per work and scaled to its size (see
 *  frame-design.ts), so a carved gilt frame on a 3 m canvas claims
 *  19 cm a side and a strip frame 1 cm. `frame` is the one its room
 *  chose, when it has; unset, the work's own. */
export function frameReachOf(work: SizedWork, frame?: FrameDesign): number {
  return frameReach(frame ?? pickFrameDesign(work.artwork), work.wM, work.hM);
}

/** How far the work's frame reaches below its canvas, metres. The same
 *  as its reach to the sides for a mitred frame; more for a tabernacle
 *  frame's plinth. */
export function frameDropOf(work: SizedWork, frame?: FrameDesign): number {
  return frameExtents(frame ?? pickFrameDesign(work.artwork), work.wM, work.hM).bottom;
}

/** Wall to keep clear beside a work's canvas, left and right as the
 *  viewer sees it: the frame on both sides, then the plaque. This is
 *  the one place the hang learns what surrounds a canvas. */
export function sideClearance(
  work: SizedWork,
  frame?: FrameDesign,
): { left: number; right: number } {
  const reach = frameReachOf(work, frame);
  return { left: reach, right: reach + PLAQUE_FOOTPRINT };
}

/** Footprint a work claims on a wall: its frame, its canvas, and the
 *  plaque that hangs to its right. */
export function footprintOf(work: SizedWork): number {
  const { left, right } = sideClearance(work);
  return left + work.wM + right;
}

/** One room's runs plus the works assigned to each, tracked with a
 *  running footprint total so "does this still fit?" is O(1). */
type Container = {
  room: RoomLayout;
  runs: WallRun[];
  assigned: SizedWork[][];
  /** Sum of assigned footprints per run. */
  used: number[];
  /** Works hung at a set place before the rest: the one picture of a
   *  door screen (`hangFeatures`), and one in front of each bench
   *  (`anchorToBenches`). `u` is the centre of the canvas on `run`, as
   *  the run was before the work took it or cut it in two. */
  fixed: Array<{ run: WallRun; work: SizedWork; u: number }>;
  fixedMetres: number;
  fixedIds: Set<string>;
};

/** How far from a bench a wall still counts as the wall it looks at. */
const ANCHOR_REACH = 9.5;
/** A work hung for a bench keeps this far from the end of its run. */
const ANCHOR_MARGIN = 0.6;

/**
 * The places on a room's walls its benches look at: for each bench, the
 * nearest hangable surface square in front of it and the nearest square
 * behind it, at the point the bench's middle is opposite. `u` is in the
 * run's own coordinate.
 */
export function benchAnchors(
  room: Pick<RoomLayout, "benches">,
  runs: readonly WallRun[],
): Array<{ run: number; u: number }> {
  const out: Array<{ run: number; u: number }> = [];
  for (const bench of room.benches) {
    // A bench is sat on across its long side, facing either way.
    const ways: Array<[number, number]> =
      bench.along === "x"
        ? [
            [0, -1],
            [0, 1],
          ]
        : [
            [-1, 0],
            [1, 0],
          ];
    for (const [dx, dz] of ways) {
      let best: { run: number; u: number; dist: number } | null = null;
      runs.forEach((run, i) => {
        // The surface faces back at the bench.
        if (run.normalX !== -dx || run.normalZ !== -dz) return;
        const dist = dx !== 0 ? (run.surface - bench.x) * dx : (run.surface - bench.z) * dz;
        if (dist < 0.5 || dist > ANCHOR_REACH) return;
        const u = run.sign * (run.axis === "x" ? bench.x : bench.z);
        if (u < run.uMin + ANCHOR_MARGIN || u > run.uMax - ANCHOR_MARGIN) return;
        if (!best || dist < best.dist) best = { run: i, u, dist };
      });
      const hit = best as { run: number; u: number; dist: number } | null;
      if (hit && !out.some((a) => a.run === hit.run && Math.abs(a.u - hit.u) < 0.5)) {
        out.push({ run: hit.run, u: hit.u });
      }
    }
  }
  return out;
}

/**
 * Hang the room's largest works where its benches look: one centred on
 * each place `benchAnchors` finds. The run is then cut in two either
 * side of the work, and the rest of the room is hung on what is left as
 * on any other wall. So a bench stands on a line of the room and a work
 * hangs on the same line.
 */
function hangForBenches(container: Container) {
  const anchors = benchAnchors(container.room, container.runs);
  if (anchors.length === 0) return;
  const works = container.room.artworks
    .map(sizeWork)
    .sort((a, b) => b.wM * b.hM - a.wM * a.hM || a.artwork.id.localeCompare(b.artwork.id));

  // Runs are cut as works are fixed, so an anchor is kept as a world
  // place and found again in the runs as they then are.
  const places = anchors.map(({ run, u }) => {
    const r = container.runs[run];
    return { key: wallKey(r), u };
  });
  for (const place of places) {
    const index = container.runs.findIndex(
      (r) => wallKey(r) === place.key && place.u > r.uMin && place.u < r.uMax,
    );
    if (index < 0) continue;
    const run = container.runs[index];
    for (const work of works) {
      if (container.fixedIds.has(work.artwork.id)) continue;
      const fitted = fitTo(work, Math.min(MAX_PAINTING_W, runLength(run)), run.maxHeight);
      const sized = { artwork: work.artwork, ...fitted };
      const { left, right } = sideClearance(sized);
      const lo = place.u - fitted.wM / 2 - left;
      const hi = place.u + fitted.wM / 2 + right;
      if (lo < run.uMin || hi > run.uMax) continue;
      container.fixed.push({ run, work: sized, u: place.u });
      container.fixedMetres += hi - lo;
      container.fixedIds.add(work.artwork.id);
      // What is left of the run, either side of the work.
      const parts = [
        { ...run, uMax: lo - ADJACENT_GAP, abuts: true as const },
        { ...run, uMin: hi + ADJACENT_GAP, abuts: true as const },
      ].filter((part) => runLength(part) >= MIN_RUN_LENGTH);
      container.runs.splice(index, 1, ...parts);
      container.assigned.splice(index, 1, ...parts.map(() => []));
      container.used.splice(index, 1, ...parts.map(() => 0));
      break;
    }
  }
}

/** A screen's face is given to one work when that work and its plaque
 *  cover this share of it. A room of small sheets has none that does,
 *  and hangs the screen like any wall. */
const FEATURE_MIN_SHARE = 0.3;

/**
 * Hang each door screen of a room with one picture: the largest of the
 * room's works that fits its face, in the middle of the screen with its
 * plaque beside it. Centred with its plaque it would hang 18 cm off the
 * middle of a wall that is seen head-on. The face then takes nothing
 * more.
 */
function hangFeatures(container: Container) {
  for (let i = container.runs.length - 1; i >= 0; i--) {
    const run = container.runs[i];
    if (!run.feature) continue;
    const length = runLength(run);
    let best: SizedWork | null = null;
    for (const artwork of container.room.artworks) {
      if (container.fixedIds.has(artwork.id)) continue;
      const work = sizeWork(artwork);
      if (footprintOf(work) > length) continue;
      if (!best || work.wM * work.hM > best.wM * best.hM) best = work;
    }
    if (!best || footprintOf(best) < length * FEATURE_MIN_SHARE) continue;
    const { left, right } = sideClearance(best);
    const centre = Math.max(
      run.uMin + left + best.wM / 2,
      Math.min((run.uMin + run.uMax) / 2, run.uMax - right - best.wM / 2),
    );
    container.fixed.push({ run, work: best, u: centre });
    container.fixedMetres += footprintOf(best);
    container.fixedIds.add(best.artwork.id);
    container.runs.splice(i, 1);
    container.assigned.splice(i, 1);
    container.used.splice(i, 1);
  }
}

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
 *  relative slack fills every run at the same rate. This settles which
 *  room the work hangs in; `evenOutRoom` settles the run. */
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

/** The gap a run's works hang at: the plaster they leave, shared out
 *  between them and the run's two ends (`packRun`). A run with nothing
 *  on it is one gap, its whole length, and counts BARE_RUN_WEIGHT times
 *  that unless a hung work stands at one end of it (`WallRun.abuts`). */
function hangGap(container: Container, runIdx: number): number {
  const run = container.runs[runIdx];
  const count = container.assigned[runIdx].length;
  if (count === 0) return (run.abuts ? 1 : BARE_RUN_WEIGHT) * runLength(run);
  return (runLength(run) - container.used[runIdx]) / (count + 1);
}

/**
 * Deal a room's works over its runs again, so that every run ends at
 * about the same gap. `tryAssign` decides which room a work hangs in;
 * this decides where in the room.
 *
 * The gap is what a visitor reads. `tryAssign` shares the wall out by
 * the metres hung, and a 27 m wall with two large canvases is level
 * with a 4 m panel with one small sheet by that measure: 9 m of bare
 * wall beside the canvases against 1.5 m beside the sheet. Here a work
 * goes to the run whose gap is widest, largest work first. The long
 * walls are the widest gaps while the room is empty, so they take the
 * large canvases; the small works then go wherever a gap is still wider
 * than the rest, on both sides of a door alike.
 *
 * A deal that cannot place every work again leaves the room as it was.
 */
function evenOutRoom(container: Container): void {
  const before = { assigned: container.assigned, used: container.used };
  // Widest claim on the wall first. The sort is stable, so works of one
  // size keep the order they were dealt in.
  const works = container.assigned
    .flat()
    .map((work) => ({ work, need: footprintOf(work) }))
    .sort((a, b) => b.need - a.need);
  container.assigned = container.runs.map(() => []);
  container.used = container.runs.map(() => 0);

  for (const { work, need } of works) {
    let widest = -1;
    let widestGap = 0;
    for (let i = 0; i < container.runs.length; i++) {
      if (slack(container, i) < need) continue;
      const gap = hangGap(container, i);
      if (gap > widestGap) {
        widest = i;
        widestGap = gap;
      }
    }
    if (widest < 0) {
      container.assigned = before.assigned;
      container.used = before.used;
      return;
    }
    container.assigned[widest].push(work);
    container.used[widest] += need;
  }
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
 *  - Rooms named in `skipRoomIds` already carry a composed hang (the
 *    Grand Hall, see grand-hall.ts) and are left alone — neither hung
 *    nor used as spill space, which would break their symmetry.
 *  - Walls are measured with each work's own frame. Once every work has
 *    its wall the room frames them together (`roomHanging`,
 *    `wallHanging` in frame-design.ts): for its wall colour, in one
 *    family of finishes, each wall with a frame it leads with.
 *    `packRun` hangs those frames.
 */
export function distributePaintings(
  floor: FloorLayout,
  skipRoomIds: ReadonlySet<string> = new Set(),
  /** `anchorToBenches`: hang a room's largest works centred in front of
   *  its benches first (`hangForBenches`). The benches have to be
   *  planned before the hang. */
  options: { anchorToBenches?: boolean } = {},
): DistributionStats {
  // Stairwell rooms are excluded — their walls hold the spiral steps
  // and signs, not paintings.
  const containers: Container[] = floor.rooms
    .filter((r) => !r.isStairwell && !skipRoomIds.has(r.id))
    .map((room) => {
      const runs = computeRoomRuns(room);
      return {
        room,
        runs,
        assigned: runs.map(() => []),
        used: runs.map(() => 0),
        fixed: [],
        fixedMetres: 0,
        fixedIds: new Set<string>(),
      };
    });

  // A screen's picture first, so no bench claims the screen's face.
  for (const container of containers) hangFeatures(container);
  if (options.anchorToBenches) for (const container of containers) hangForBenches(container);

  const pool: SizedWork[] = [];
  for (const container of containers) {
    for (const artwork of container.room.artworks) {
      if (container.fixedIds.has(artwork.id)) continue;
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

  // Every work has its room. Now each room is hung for the eye.
  for (const container of containers) evenOutRoom(container);

  let wallMetres = 0;
  let hungMetres = 0;
  let placed = 0;
  for (const container of containers) {
    const { room } = container;
    wallMetres += container.fixedMetres;
    hungMetres += container.fixedMetres;
    placed += container.fixed.length;

    // Every work has its wall now, so the room frames them together:
    // for its wall colour, in one family of finishes, each wall with a
    // frame it leads with. A wall is all its runs, either side of a
    // door and of a work hung for a bench.
    const walls = new Map<string, ArtworkListing[]>();
    const on = (run: WallRun) => {
      const works = walls.get(wallKey(run)) ?? [];
      walls.set(wallKey(run), works);
      return works;
    };
    for (const { run, work } of container.fixed) on(run).push(work.artwork);
    container.runs.forEach((run, i) => {
      on(run).push(...container.assigned[i].map((work) => work.artwork));
    });
    const hanging = roomHanging(
      room.id,
      eraOfRoom(room).palette.wallColor,
      [...walls.values()].flat(),
    );
    const hangings = new Map(
      [...walls].map(([key, works]) => [key, wallHanging(hanging, `${room.id}/${key}`, works)]),
    );
    const frameOf = (run: WallRun, artwork: ArtworkListing) =>
      pickFrameDesign(artwork, hangings.get(wallKey(run)) ?? hanging);

    for (const { run, work, u } of container.fixed) {
      // Its place was measured for its own frame, so it takes the
      // room's only where that reaches no further.
      const chosen = frameOf(run, work.artwork);
      const frame = frameReachOf(work, chosen) <= frameReachOf(work) ? chosen : undefined;
      room.placements.push(placementAt(run, { ...work, frame, drop: frameDropOf(work, frame) }, u));
    }
    for (let i = 0; i < container.runs.length; i++) {
      const run = container.runs[i];
      const works = container.assigned[i];
      wallMetres += runLength(run);
      hungMetres += container.used[i];
      placed += works.length;
      const frames = works.map((work) => frameOf(run, work.artwork));
      room.placements.push(...packRun(run, works, MAX_PAINTING_W, frames));
    }
  }

  return { wallMetres, hungMetres, placed, dropped };
}

/**
 * Lay `works` along `run` with one shared gap between neighbours.
 *
 * The leftover plaster — run length minus every footprint — is split
 * evenly into the gaps between works and the two end margins, so the
 * rhythm is identical regardless of how the widths vary, and no end of
 * a run is barer than its middle. Until 13 October 2026 a gap stopped
 * at 2 m and the group was centred: a thinly hung run then stood with
 * up to 9.4 m bare at each end, which beside a door read as a work
 * taken down. A run is kept from being thinly hung by `evenOutRoom`,
 * not here.
 *
 * Within the run works are arranged largest-in-the-middle, tapering
 * outwards, so a wall reads as a composed group rather than a random
 * sequence of sizes.
 *
 * `frames` are the frames the room chose, one per work. The run was
 * measured with each work's own frame, so where the chosen ones are
 * wider and the run is full, the works that gained most go back to
 * their own until the run holds them again.
 */
export function packRun(
  run: WallRun,
  works: SizedWork[],
  /** Widest canvas the run hangs. A stair hall hangs wider (`giants.ts`). */
  maxWidth = MAX_PAINTING_W,
  /** The frames the room chose, one per work. Unset, each work's own. */
  frames?: FrameDesign[],
): Placement[] {
  if (works.length === 0) return [];

  const span = runLength(run);
  const fitted = works.map((work, i) => {
    const { wM, hM } = fitTo(work, Math.min(maxWidth, span), run.maxHeight);
    const sized = { artwork: work.artwork, wM, hM };
    const frame = frames?.[i];
    return { ...sized, frame, ...sideClearance(sized, frame), drop: frameDropOf(sized, frame) };
  });

  const footprint = () => fitted.reduce((sum, w) => sum + w.left + w.wM + w.right, 0);
  const room = span - ADJACENT_GAP * (fitted.length - 1);
  if (frames && footprint() > room) {
    const gained = fitted
      .map((work, i) => ({ i, own: sideClearance(work) }))
      .map(({ i, own }) => ({
        i,
        own,
        by: fitted[i].left + fitted[i].right - own.left - own.right,
      }))
      .filter(({ by }) => by > 0)
      .sort((a, b) => b.by - a.by);
    for (const { i, own } of gained) {
      if (footprint() <= room) break;
      fitted[i] = { ...fitted[i], frame: undefined, ...own, drop: frameDropOf(fitted[i]) };
    }
  }

  const ordered = centreOut(fitted);
  const total = footprint();
  const leftover = Math.max(0, span - total);

  // gaps: one before the first work, one between each pair, one after
  // the last — hence works.length + 1.
  const gap = leftover / (ordered.length + 1);
  let cursor = run.uMin + gap;

  const placements: Placement[] = [];
  for (const work of ordered) {
    placements.push(placementAt(run, work, cursor + work.left + work.wM / 2));
    cursor += work.left + work.wM + work.right + gap;
  }

  return placements;
}

/** A work on a run, its canvas centred at `centreU`. */
function placementAt(
  run: WallRun,
  work: { artwork: ArtworkListing; wM: number; hM: number; drop: number; frame?: FrameDesign },
  centreU: number,
): Placement {
  // Lift the centre for paintings tall enough that the canonical hang
  // would put their frame into the floor. Most paintings keep the
  // canonical eye-line; only the tallest get raised so the frame
  // clears the floor by PAINTING_FLOOR_GAP.
  const minCenterY = run.floorY + PAINTING_FLOOR_GAP + work.drop + work.hM / 2;
  const centerY = Math.max(run.centerY, minCenterY);
  const along = run.sign * centreU;
  return {
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
    ...(work.frame && { frame: work.frame }),
    ...(run.divider !== undefined && { divider: run.divider }),
  };
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
export function sizeWork(artwork: ArtworkListing): SizedWork {
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

/**
 * Wall metres one work will claim once hung — its display width, its
 * frame on both sides and the plaque beside it. The floor builder sizes rooms against this so
 * a storey's wall supply is matched to what it actually has to hang,
 * rather than to a flat works-per-room guess (a floor of Audubon
 * plates needs roughly half the plaster of a floor of Romantic
 * canvases for the same work count).
 */
export function wallFootprint(artwork: ArtworkListing): number {
  return footprintOf(sizeWork(artwork));
}

/**
 * Hangable wall the four walls of a room this size offer, before it
 * exists. Exact for the room shapes this museum uses: `computeRoomRuns`
 * trims WALL_MARGIN off both ends of all four walls and DOOR_CLEARANCE
 * off both sides of every door opening, so the only estimate here is
 * the door count. `portalCount` of the doors are portals. Dividers are
 * counted apart, by `dividerWallMetres`.
 */
export function estimateWallMetres(
  widthM: number,
  depthM: number,
  doorCount: number,
  portalCount = 0,
): number {
  const perimeter = 2 * (widthM + depthM);
  return (
    perimeter -
    8 * WALL_MARGIN -
    doorCount * (DOOR_WIDTH + 2 * DOOR_CLEARANCE) -
    portalCount * (PORTAL_WIDTH - DOOR_WIDTH)
  );
}

/**
 * Hangable wall a room's dividers add, in metres: both faces of each
 * (one of a door screen), less the stretch of room wall a wing wall
 * covers where it is built off one. The same arithmetic as `computeRoomRuns`, so the floor
 * builder counts divider wall before it opens rooms and does not open
 * more than the works need.
 */
export function dividerWallMetres(rect: CellRect, dividers: readonly Divider[]): number {
  let metres = 0;
  for (const d of dividers) {
    const face = (d.end - d.start) * CELL_SIZE - 2 * WALL_MARGIN;
    if (face >= MIN_RUN_LENGTH) metres += (d.bare ? 1 : 2) * face;
    const lowLine = d.axis === "x" ? rect.xMin : rect.zMin;
    const highLine = (d.axis === "x" ? rect.xMax : rect.zMax) + 1;
    const attached = (d.start === lowLine ? 1 : 0) + (d.end === highLine ? 1 : 0);
    metres -= attached * (DIVIDER_THICKNESS + 2 * WALL_MARGIN);
  }
  return metres;
}
