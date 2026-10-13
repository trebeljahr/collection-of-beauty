// Works too large for a room, hung at their real size in the stair halls.
//
// A room hangs nothing wider or taller than 3.2 m (`MAX_PAINTING_W`), so
// Veronese's Wedding at Cana, 9.94 m wide, hung at a third of its size
// beside a plaque that gave the true one. The block plan's halls have
// the wall a room has not: 27.5 m a side, and in the two stair halls
// three walls with no gallery in front, sheer from the floor to the roof.
//
// Two kinds of place:
//
//   A storey of a hall. Each wall has a stretch either side of its door,
//   one storey high. One work hangs in the middle of a stretch, when its
//   frame fits under the gallery above: canvases up to about 4.9 m tall.
//
//   The sheer walls of a stair hall (`RoomLayout.sheer`): the end wall
//   behind the stair, and the part of each side wall beyond the
//   galleries. Works taller than a storey hang there, and the largest of
//   the others. On the end wall: the widest in the axis of the stair,
//   level with the second floor, a pair on the hall floor either side of
//   it and a pair level with the top floor. A work too wide for any
//   other wall hangs over the first, 3 m and more above it, and then no
//   pair beside it. On each side wall: one work on every second storey,
//   the two walls a storey apart.
//
// The first hang put every tall work on one wall, in two tiers 0.8 m
// apart, and a hall's storeys took two works a stretch. Rico, 13 October
// 2026: the big paintings "cluster too close together". So a stretch
// takes one work, and no two works of a sheer wall are nearer than a
// storey over one another.
//
// Every work here hangs at the size its plaque states. One that fits
// neither place stays in its era's rooms, at the room's limit.

import type { ArtworkListing } from "@/lib/data";
import { trustworthyRealSize } from "@/lib/real-size";
import { frameExtents, pickFrameDesign } from "./frame-design";
import { artworkBand } from "./painting-bands";
import {
  computeRoomRuns,
  footprintOf,
  frameReachOf,
  MAX_PAINTING_W,
  PAINTING_FLOOR_GAP,
  PAINTING_WALL_OFFSET,
  PLAQUE_FOOTPRINT,
  packRun,
  runLength,
  type SizedWork,
  type WallRun,
} from "./place-paintings";
import { widestTexturePx } from "./sharpness";
import type { Placement, RoomLayout } from "./types";
import { CELL_SIZE, FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "./world-coords";

/** Texture pixels a giant needs for each metre of its real width.
 *
 *  A room's works need 1,000 (`sharpness.ts`): sharp from a metre away.
 *  A visitor that near a canvas five metres wide sees a fifteenth of
 *  it. At 400 a work is sharp from 2.5 m, which is nearer than anyone
 *  stands to see it whole. The largest are the thinnest: the Wedding at
 *  Cana has 412, the Coronation of Napoleon 418. Raise this to 1,000
 *  and they go back to their rooms at a third of their size. */
export const GIANT_MIN_PX_PER_METRE = 400;

/** Wall left between a giant and the end of its stretch, and between
 *  two giants side by side, at least. Rico found works a few decimetres
 *  apart too close in a room; a canvas five metres wide wants more. */
const GIANT_GAP = 1.0;
/** Room a frame has on a storey of a hall: from the gap over the floor
 *  to a hand under the gallery above. */
const STOREY_FRAME_ROOM = INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP - 0.14;
/** Height of a plaque's centre over the floor when it cannot hang
 *  beside the middle of its canvas: eye level for reading. */
const PLAQUE_EYE = 1.45;
/** A plaque beside the middle of a canvas is read up to this height. */
const PLAQUE_REACH = 1.9;
/** Corner kept clear at each end of a sheer wall. */
const SHEER_MARGIN = 0.3;
/** Works that are not taller than a storey and still go to a sheer
 *  wall are picked from this many of the largest. */
const SHEER_CHOICE = 12;
/** Wall between the work in the axis of a stair and the one over it,
 *  at least: two storeys' worth of canvas do not read as one block. */
const AXIS_CLEAR = 3;
/** A work this wide has no stretch on any storey: the longest is the
 *  wall beside a stair, under 15 m with its margins. */
const AXIS_ONLY_WIDTH = 12;

/**
 * The work at its real size, when that is more than a room hangs and
 * the scan is good for it. Null for every other work.
 *
 * The long edge is the catalogue's, and only an audited one
 * (`trustworthyRealSize`): a size the plaque would not print is not
 * hung at ten metres. The shape is the scan's, as in `sizeWork`.
 */
export function giantSize(artwork: ArtworkListing): SizedWork | null {
  const size = trustworthyRealSize(artwork);
  if (!size || !artwork.width || !artwork.height) return null;
  const long = Math.max(size.widthCm, size.heightCm) / 100;
  const aspect = artwork.width / artwork.height;
  const wM = aspect >= 1 ? long : long * aspect;
  const hM = aspect >= 1 ? long / aspect : long;
  if (wM <= MAX_PAINTING_W && hM <= MAX_PAINTING_W) return null;
  const px = widestTexturePx(artwork);
  if (px == null || px / wM < GIANT_MIN_PX_PER_METRE) return null;
  return { artwork, wM, hM };
}

/** Height of a work in its frame. */
function framedHeight(work: SizedWork): number {
  const e = frameExtents(pickFrameDesign(work.artwork), work.wM, work.hM);
  return work.hM + e.top + e.bottom;
}

/** True when the work's frame fits a storey of a hall. */
export function fitsStorey(work: SizedWork): boolean {
  return framedHeight(work) <= STOREY_FRAME_ROOM;
}

const area = (w: SizedWork) => w.wM * w.hM;
const bySize = (a: SizedWork, b: SizedWork) =>
  area(b) - area(a) || a.artwork.id.localeCompare(b.artwork.id);

// ── A storey of a hall ────────────────────────────────────────────────

/**
 * The stretches of a hall storey's walls that hang one work each: not
 * the sheer wall, and on the walls that meet it, not the part beyond
 * the galleries (`room.sheer`). The sheer walls are composed on their
 * own (`hangSheerWalls`).
 */
export function hallRuns(room: RoomLayout): WallRun[] {
  const runs = computeRoomRuns(room).map((run) => ({
    ...run,
    maxHeight: Number.POSITIVE_INFINITY,
  }));
  const sheer = room.sheer;
  if (!sheer) return runs;
  const cb = room.cellBounds;
  const out: WallRun[] = [];
  for (const run of runs) {
    if (run.side === sheer.side) continue;
    const alongSheer = (sheer.side === "north" || sheer.side === "south") === (run.axis === "x");
    if (alongSheer) {
      out.push(run);
      continue;
    }
    // World coordinate along the run is `sign * u`. Keep what lies
    // clear of the strip, and a balustrade's depth beyond it.
    const keep = sheer.depth + GIANT_GAP;
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    if (sheer.side === "north") lo = cb.zMin * CELL_SIZE + keep;
    if (sheer.side === "south") hi = (cb.zMax + 1) * CELL_SIZE - keep;
    if (sheer.side === "west") lo = cb.xMin * CELL_SIZE + keep;
    if (sheer.side === "east") hi = (cb.xMax + 1) * CELL_SIZE - keep;
    const uLo = run.sign === 1 ? lo : -hi;
    const uHi = run.sign === 1 ? hi : -lo;
    const trimmed = { ...run, uMin: Math.max(run.uMin, uLo), uMax: Math.min(run.uMax, uHi) };
    if (runLength(trimmed) > 1) out.push(trimmed);
  }
  return out;
}

/** Give a tall work's plaque a place at reading height. */
function withPlaqueAtEye(p: Placement, floorY: number): Placement {
  if (p.position[1] - floorY <= PLAQUE_REACH) return p;
  return { ...p, plaque: { dy: floorY + PLAQUE_EYE - p.position[1] } };
}

/** The order a room's stretches are taken in: the longest first; of
 *  one length, the north wall and then the south, each whole, and then
 *  the west and east walls a stretch at a time in turn. A room that is
 *  not full is then hung alike on the walls that face each other. */
function stretchOrder(runs: WallRun[]): WallRun[] {
  const nth = new Map<WallRun, number>();
  const seen = new Map<WallRun["side"], number>();
  for (const run of [...runs].sort((a, b) => a.uMin - b.uMin)) {
    const n = seen.get(run.side) ?? 0;
    nth.set(run, n);
    seen.set(run.side, n + 1);
  }
  const place = (run: WallRun) => {
    const n = nth.get(run) ?? 0;
    if (run.side === "north") return n;
    if (run.side === "south") return 10 + n;
    return 20 + 2 * n + (run.side === "east" ? 1 : 0);
  };
  const rank = (run: WallRun) => Math.round(runLength(run) * 2);
  return [...runs].sort((a, b) => rank(b) - rank(a) || place(a) - place(b));
}

/**
 * Hang giants on the storeys of the halls, one to a stretch, largest
 * first. `levels[f]` is the halls' rooms on floor `f`, in groups: the
 * rooms of the first group fill before those of the second, and the
 * rooms of one group fill a stretch at a time in turn, so they hold
 * alike. A work hangs on the floor it belongs to (`start`). Those a
 * full floor leaves over go to the floors above it, and to the ones
 * under it last. Returns the works that found no place.
 */
export function hangHallStoreys(
  levels: RoomLayout[][][],
  works: Array<{ work: SizedWork; start: number }>,
): SizedWork[] {
  type Stretch = { room: RoomLayout; run: WallRun; work: SizedWork | null };
  const stretches = levels.map((groups) =>
    groups.flatMap((rooms): Stretch[] => {
      const ordered = rooms.map((room) => stretchOrder(hallRuns(room)));
      const out: Stretch[] = [];
      for (let i = 0; ordered.some((runs) => i < runs.length); i++) {
        ordered.forEach((runs, r) => {
          if (i < runs.length) out.push({ room: rooms[r], run: runs[i], work: null });
        });
      }
      return out;
    }),
  );
  const free = (level: Stretch[], work: SizedWork) => {
    const need = footprintOf(work) + 2 * GIANT_GAP;
    return level.find((s) => s.work === null && runLength(s.run) >= need);
  };
  const sorted = [...works].sort((a, b) => bySize(a.work, b.work));
  // Each floor's own works first, so a floor's walls are not taken by
  // what another floor could not hold.
  const over: typeof sorted = [];
  for (const entry of sorted) {
    const slot = stretches[entry.start] ? free(stretches[entry.start], entry.work) : undefined;
    if (slot) slot.work = entry.work;
    else over.push(entry);
  }
  const left: SizedWork[] = [];
  for (const { work, start } of over) {
    const from = Math.min(Math.max(0, start), stretches.length);
    const order = [...stretches.slice(from), ...stretches.slice(0, from).reverse()];
    const slot = order.map((level) => free(level, work)).find((s) => s !== undefined);
    if (slot) slot.work = work;
    else left.push(work);
  }
  for (const level of stretches) {
    for (const { room, run, work } of level) {
      if (!work) continue;
      for (const p of packRun(run, [work], Number.POSITIVE_INFINITY)) {
        // The canvas in the middle of its stretch, the plaque beside
        // it: `packRun` centres the two together.
        const position: Placement["position"] = [...p.position];
        position[run.axis === "x" ? 0 : 2] = stretchMiddle(run);
        room.placements.push(withPlaqueAtEye({ ...p, position, giant: true }, room.worldRect.y));
      }
    }
  }
  return left;
}

/** The middle of a stretch along its wall, world metres. */
export function stretchMiddle(run: WallRun): number {
  return (run.sign * (run.uMin + run.uMax)) / 2;
}

// ── The sheer walls ───────────────────────────────────────────────────

type Framed = SizedWork & { reach: number; top: number; bottom: number };

function framed(work: SizedWork): Framed {
  const e = frameExtents(pickFrameDesign(work.artwork), work.wM, work.hM);
  return { ...work, reach: frameReachOf(work), top: e.top, bottom: e.bottom };
}

const outerWidth = (w: Framed) => w.wM + 2 * w.reach;
const outerHeight = (w: Framed) => w.hM + w.top + w.bottom;

/** A stretch of sheer wall: the run it is part of, its middle along
 *  the wall in world metres, and half its length. */
type Face = { template: WallRun; worldMid: number; half: number };

/** A stair hall's sheer walls: the end wall, and the part of each side
 *  wall beyond the galleries. */
function sheerFaces(base: RoomLayout): { end: Face; sides: Face[] } | null {
  const sheer = base.sheer;
  if (!sheer) return null;
  const runs = computeRoomRuns(base);
  const cb = base.cellBounds;
  const x0 = cb.xMin * CELL_SIZE;
  const x1 = (cb.xMax + 1) * CELL_SIZE;
  const z0 = cb.zMin * CELL_SIZE;
  const z1 = (cb.zMax + 1) * CELL_SIZE;
  const template = runs.find((r) => r.side === sheer.side);
  if (!template) return null;
  const endAlongX = template.axis === "x";
  const end: Face = {
    template,
    worldMid: endAlongX ? (x0 + x1) / 2 : (z0 + z1) / 2,
    half: (endAlongX ? x1 - x0 : z1 - z0) / 2 - SHEER_MARGIN,
  };
  // Along a side wall: from the corner to where the gallery ends, less
  // the wall a gallery's own work keeps clear (`hallRuns`).
  const corner = { north: z0, south: z1, west: x0, east: x1 }[sheer.side];
  const inward = sheer.side === "north" || sheer.side === "west" ? 1 : -1;
  const a = corner + inward * SHEER_MARGIN;
  const b = corner + inward * (sheer.depth - GIANT_GAP);
  const sideNames = endAlongX ? (["west", "east"] as const) : (["north", "south"] as const);
  const sides = sideNames.flatMap((name): Face[] => {
    const run = runs.find((r) => r.side === name);
    return run ? [{ template: run, worldMid: (a + b) / 2, half: Math.abs(b - a) / 2 }] : [];
  });
  return { end, sides };
}

/**
 * Compose the sheer walls of the stair halls. `halls` are the halls,
 * each its rooms from the floor up. `tall` are the works too tall for a
 * storey, which hang nowhere else; `others` are the rest, of which the
 * largest fill the places the tall ones leave. The halls are dealt to in
 * turn, place by place, so they hold alike. Returns the works not hung.
 */
export function hangSheerWalls(
  halls: RoomLayout[][],
  tall: SizedWork[],
  others: SizedWork[],
): SizedWork[] {
  let tallPool = [...tall].sort((a, b) => b.wM - a.wM || bySize(a, b)).map(framed);
  let otherPool = [...others].sort(bySize).map(framed);
  const take = (work: Framed) => {
    tallPool = tallPool.filter((w) => w !== work);
    otherPool = otherPool.filter((w) => w !== work);
  };

  const sites = halls.flatMap((storeys) => {
    const faces = storeys[0] ? sheerFaces(storeys[0]) : null;
    return faces ? [{ storeys, ...faces, centreHalf: 0, centreTop: 0, over: false, talls: 0 }] : [];
  });
  if (sites.length === 0) return [...tall, ...others];
  /** The halls for one place: the one with the fewest tall works so
   *  far takes first, so the tall works are dealt evenly. */
  const inTurn = () => [...sites].sort((a, b) => a.talls - b.talls);

  const top = (storeys: RoomLayout[]) => storeys[storeys.length - 1];
  const roofOf = (storeys: RoomLayout[]) =>
    top(storeys).worldRect.y + INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP;
  const floorOf = (storeys: RoomLayout[], level: number) =>
    storeys[level].worldRect.y + PAINTING_FLOOR_GAP;

  /** Hang a work on a face, its canvas centre `u` metres from the
   *  face's middle to the viewer's right, its frame's foot at `bottomY`. */
  const place = (
    site: (typeof sites)[number],
    level: number,
    face: Face,
    work: Framed,
    u: number,
    bottomY: number,
    plaque: Placement["plaque"],
  ) => {
    const room = site.storeys[level];
    if (tallPool.includes(work)) site.talls++;
    take(work);
    const t = face.template;
    const alongX = t.axis === "x";
    const centerY = bottomY + work.bottom + work.hM / 2;
    const along = face.worldMid + t.sign * u;
    room.placements.push({
      artwork: work.artwork,
      position: [
        (alongX ? along : t.surface) + t.normalX * PAINTING_WALL_OFFSET,
        centerY,
        (alongX ? t.surface : along) + t.normalZ * PAINTING_WALL_OFFSET,
      ],
      rotation: [0, t.rotationY, 0],
      band: artworkBand(work.artwork),
      widthM: work.wM,
      heightM: work.hM,
      giant: true,
      plaque,
    });
  };
  /** A plaque at eye level on the floor of `room`, under the work. */
  const atEye = (room: RoomLayout, work: Framed, bottomY: number, dx = 0) => ({
    dy: room.worldRect.y + PLAQUE_EYE - (bottomY + work.bottom + work.hM / 2),
    dx,
  });
  /** The plaque of a work that stands on a storey of its own: beside
   *  its frame at eye level on the hall floor, where there is floor in
   *  front of it. Over that floor there is none, and no plaque. */
  const beside = (storeys: RoomLayout[], level: number, work: Framed): Placement["plaque"] => {
    if (level > 0) return null;
    const centerY = floorOf(storeys, 0) + work.bottom + work.hM / 2;
    const up = centerY - storeys[0].worldRect.y;
    return up <= PLAQUE_REACH ? undefined : { dy: PLAQUE_EYE - up };
  };

  // 1. The axis of the stair: the widest tall work, level with the
  //    second floor. From the hall's door it is seen over the first half
  //    landing and under the second.
  for (const site of sites) {
    const level = Math.min(1, site.storeys.length - 1);
    const bottomY = floorOf(site.storeys, level);
    const work = tallPool.find(
      (w) =>
        outerWidth(w) <= 2 * site.end.half - 2 * GIANT_GAP &&
        bottomY + outerHeight(w) <= roofOf(site.storeys),
    );
    if (!work) continue;
    site.centreHalf = outerWidth(work) / 2;
    site.centreTop = bottomY + outerHeight(work);
    place(site, level, site.end, work, 0, bottomY, atEye(site.storeys[0], work, bottomY));
  }

  // 1b. Over it, level with the top floor or as high as the roof
  //     allows: a work too wide for any other wall. A tall one before a
  //     long low one. The catalogue has three canvases about 10 m wide
  //     and taller than a storey, and two end walls.
  for (const site of inTurn()) {
    if (site.centreTop === 0) continue;
    const sideRoom = Math.max(0, ...site.sides.map((face) => 2 * face.half)) - 2 * GIANT_GAP;
    const roof = roofOf(site.storeys);
    const fits = (w: Framed) =>
      outerWidth(w) <= 2 * site.end.half - 2 * GIANT_GAP &&
      roof - outerHeight(w) >= site.centreTop + AXIS_CLEAR;
    const work =
      tallPool.find((w) => outerWidth(w) > sideRoom && fits(w)) ??
      [...otherPool]
        .sort((a, b) => b.wM - a.wM)
        .find((w) => outerWidth(w) > AXIS_ONLY_WIDTH && fits(w));
    if (!work) continue;
    const topFloor = floorOf(site.storeys, site.storeys.length - 1);
    const bottomY = Math.min(
      roof - outerHeight(work),
      Math.max(site.centreTop + AXIS_CLEAR, topFloor),
    );
    const level = Math.min(
      site.storeys.length - 1,
      Math.max(0, Math.floor((bottomY - site.storeys[0].worldRect.y) / FLOOR_SEPARATION)),
    );
    site.over = true;
    place(site, level, site.end, work, 0, bottomY, null);
  }

  // A work alone in the middle of a side wall, on one storey.
  const hangSide = (side: 0 | 1, level: number) => {
    for (const site of inTurn()) {
      const face = site.sides[side];
      if (!face || level >= site.storeys.length) continue;
      const bottomY = floorOf(site.storeys, level);
      const fits = (w: Framed) =>
        outerWidth(w) + 2 * GIANT_GAP <= 2 * face.half &&
        bottomY + outerHeight(w) <= roofOf(site.storeys);
      const work = tallPool.find(fits) ?? otherPool.slice(0, SHEER_CHOICE).find(fits);
      if (!work) continue;
      // Read from the floor it stands on; from no floor above that.
      place(site, level, face, work, 0, bottomY, beside(site.storeys, level, work));
    }
  };

  // A pair on the end wall either side of the axis, on one storey: the
  // two nearest in height, tall works before others.
  const hangPair = (level: number) => {
    for (const site of inTurn()) {
      if (level >= site.storeys.length) continue;
      // Beside a second work in the axis a pair would make a row of
      // three: that wall has its two.
      if (level > 0 && site.over) continue;
      const bottomY = floorOf(site.storeys, level);
      const inner = site.centreHalf > 0 ? site.centreHalf + GIANT_GAP : GIANT_GAP / 2;
      const span = site.end.half - inner;
      // Under the gallery of no one: a work here may be taller than a
      // storey, but not so tall that it meets the one over it.
      const limit =
        level + 1 < site.storeys.length ? FLOOR_SEPARATION : roofOf(site.storeys) - bottomY;
      const fits = (w: Framed) =>
        outerWidth(w) + PLAQUE_FOOTPRINT + GIANT_GAP <= span && outerHeight(w) <= limit;
      const pool = [...tallPool.filter(fits), ...otherPool.slice(0, SHEER_CHOICE).filter(fits)];
      const isTall = (w: Framed) => tallPool.includes(w);
      let pair: [Framed, Framed] | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const talls = Number(isTall(pool[i])) + Number(isTall(pool[j]));
          const score =
            Math.abs(pool[i].hM - pool[j].hM) -
            1e-3 * (area(pool[i]) + area(pool[j])) -
            100 * talls;
          if (score < best) {
            best = score;
            pair = [pool[i], pool[j]];
          }
        }
      }
      if (!pair) continue;
      for (const [side, work] of [
        [-1, pair[0]],
        [1, pair[1]],
      ] as const) {
        // The stretch between the axis work and the corner, and the
        // work with its plaque in the middle of it.
        const footprint = outerWidth(work) + PLAQUE_FOOTPRINT;
        const mid = side * (inner + span / 2);
        const u = mid - footprint / 2 + work.reach + work.wM / 2;
        place(site, level, site.end, work, u, bottomY, beside(site.storeys, level, work));
      }
    }
  };

  // 2. The pair on the hall floor either side of the axis. Before the
  //    side walls, which would take one of two works made as a pair.
  hangPair(0);
  // 3. The side walls, one work each on every second storey. The two
  //    walls are a storey apart all the way up, so no work hangs over
  //    another nearer than two storeys.
  hangSide(0, 0);
  hangSide(1, 1);
  // 4. The pair level with the top floor, seen from its galleries.
  const topLevel = Math.max(...sites.map((s) => s.storeys.length)) - 1;
  if (topLevel >= 3) hangPair(topLevel);
  for (let level = 2; level <= topLevel; level++) hangSide((level % 2) as 0 | 1, level);

  return [...tallPool, ...otherPool];
}
