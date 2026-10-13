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
//   galleries. Works taller than a storey hang there, and some of the
//   others. The three walls are one hang about the stair's axis:
//
//     On the end wall, level with the second floor: the largest work
//     that is seen whole between the stair's piers, and a pair of like
//     size beside it, one to each bay either side. Level with the top
//     floor, over the piers: a work too wide for any other place.
//
//     On the side walls: a pair, one work to each wall, on the hall
//     floor, and a second pair two storeys up. The storeys between are
//     the end wall's, so no corner holds two works at one height.
//
//   Two works that hang as a pair are of like size, and by one hand or
//   of one era where the catalogue has such two: Raphael's School of
//   Athens faces his Fire in the Borgo.
//
// The first hang put every tall work on one wall, in two tiers 0.8 m
// apart, and a hall's storeys took two works a stretch. Rico, 13 October
// 2026: the big paintings "cluster too close together". So a stretch
// takes one work, and no two works of a sheer wall are nearer than a
// storey over one another.
//
// The second hang dealt each sheer wall its works one at a time: the
// widest in the axis, cut by the piers; one side wall hung on the first
// and third floors and the other on the second and fourth; one end wall
// with two works and the other with four. Rico, the same day: the
// arrangement on the back wall "is a bit meh". So the walls mirror each
// other now, and a work hangs where the piers frame it.
//
// Every work here hangs at the size its plaque states. One that fits
// neither place stays in its era's rooms, at the room's limit.

import type { ArtworkListing } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
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
/** A work beside the one in the axis is at least this share of its
 *  height: a low canvas eight metres up beside one of six reads as a
 *  label. */
const FLANK_MIN_HEIGHT = 0.55;
/** Two works hang as a pair when they are no more unlike than this in
 *  size (`unlike`, metres). A tall work hangs whatever is across from
 *  it. */
const PAIR_MAX_UNLIKE = 1.5;

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

/** A stair hall whose sheer walls `hangSheerWalls` composes. */
export type SheerHall = {
  /** The hall's rooms, from the floor up. */
  storeys: RoomLayout[];
  /** How much of the end wall a visitor at the foot of the stair sees
   *  between the two piers nearest its axis, metres (`axisBay` in
   *  grand-stair.ts). Unset when no pier stands in front of the wall. */
  bay?: number;
};

const eras = new Map<string, ReturnType<typeof assignEra>>();
function eraOf(artwork: ArtworkListing) {
  if (!eras.has(artwork.id)) eras.set(artwork.id, assignEra(artwork));
  return eras.get(artwork.id) ?? null;
}
/** How near two works stand: 2 by one hand, 1 of one era, 0 neither. */
function kin(a: ArtworkListing, b: ArtworkListing): number {
  if (a.artistSlug && a.artistSlug !== "unknown" && a.artistSlug === b.artistSlug) return 2;
  const era = eraOf(a);
  return era !== null && era === eraOf(b) ? 1 : 0;
}
/** How unlike two works are in size, metres: a pair hangs as one. */
const unlike = (a: SizedWork, b: SizedWork) => Math.abs(a.hM - b.hM) + Math.abs(a.wM - b.wM) / 2;

/**
 * Compose the sheer walls of the stair halls: each hall's end wall and
 * the two strips of wall beside it, as one hang about the stair's axis.
 *
 *   end wall                      each side wall
 *   top     [   widest   ]
 *   2                             [ one of a pair ]
 *   1   [f] [    axis    ] [f]
 *   0                             [ one of a pair ]
 *
 * `tall` are the works too tall for a storey, which hang nowhere else;
 * `others` are the rest, of which some fill the places the tall ones
 * leave. Returns the works not hung.
 */
export function hangSheerWalls(
  halls: SheerHall[],
  tall: SizedWork[],
  others: SizedWork[],
): SizedWork[] {
  let tallPool = [...tall].sort(bySize).map(framed);
  let otherPool = [...others].sort(bySize).map(framed);
  const tallIds = new Set(tall.map((w) => w.artwork.id));
  const isTall = (w: Framed) => tallIds.has(w.artwork.id);
  const take = (work: Framed) => {
    tallPool = tallPool.filter((w) => w !== work);
    otherPool = otherPool.filter((w) => w !== work);
  };

  type Axis = { work: Framed; level: number; bottomY: number };
  const sites = halls.flatMap(({ storeys, bay }) => {
    const faces = storeys[0] ? sheerFaces(storeys[0]) : null;
    return faces
      ? [
          {
            storeys,
            bay: bay ?? Number.POSITIVE_INFINITY,
            ...faces,
            axis: null as Axis | null,
            top: false,
            hung: [] as Framed[],
            talls: 0,
          },
        ]
      : [];
  });
  if (sites.length === 0) return [...tall, ...others];
  type Site = (typeof sites)[number];
  /** The halls for one place: the one with the fewest tall works so
   *  far takes first, so the tall works are dealt evenly. */
  const inTurn = () => [...sites].sort((a, b) => a.talls - b.talls);
  /** How much at home two works are in a hall: their mean kinship with
   *  what hangs there, 0 to 2. */
  const atHome = (site: Site, a: Framed, b: Framed) =>
    site.hung.length === 0
      ? 0
      : site.hung.reduce((n, w) => n + kin(a.artwork, w.artwork) + kin(b.artwork, w.artwork), 0) /
        (2 * site.hung.length);

  const top = (storeys: RoomLayout[]) => storeys[storeys.length - 1];
  const roofOf = (storeys: RoomLayout[]) =>
    top(storeys).worldRect.y + INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP;
  const floorOf = (storeys: RoomLayout[], level: number) =>
    storeys[level].worldRect.y + PAINTING_FLOOR_GAP;

  /** Hang a work on a face, its canvas centre `u` metres from the
   *  face's middle to the viewer's right, its frame's foot at `bottomY`. */
  const place = (
    site: Site,
    level: number,
    face: Face,
    work: Framed,
    u: number,
    bottomY: number,
    plaque: Placement["plaque"],
  ) => {
    const room = site.storeys[level];
    if (isTall(work)) site.talls++;
    site.hung.push(work);
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
      sheer: true,
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
  /** The pair with the lowest score, of the works in `pool`. */
  const bestPair = (
    pool: Framed[],
    score: (a: Framed, b: Framed) => number | null,
  ): { pair: [Framed, Framed]; score: number } | null => {
    let best: { pair: [Framed, Framed]; score: number } | null = null;
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const s = score(pool[i], pool[j]);
        if (s !== null && (!best || s < best.score)) best = { pair: [pool[i], pool[j]], score: s };
      }
    }
    return best;
  };

  // 1. The axis of the stair, level with the second floor: from the
  //    hall's door it is seen over the first half landing. The largest
  //    tall work that is seen whole between the piers; the widest when
  //    none is.
  for (const site of sites) {
    const level = Math.min(1, site.storeys.length - 1);
    const bottomY = floorOf(site.storeys, level);
    const fits = (w: Framed) =>
      outerWidth(w) <= 2 * site.end.half - 2 * GIANT_GAP &&
      bottomY + outerHeight(w) <= roofOf(site.storeys);
    const work =
      tallPool.find((w) => fits(w) && w.wM <= site.bay) ??
      [...tallPool].sort((a, b) => b.wM - a.wM).find(fits);
    if (!work) continue;
    site.axis = { work, level, bottomY };
    place(site, level, site.end, work, 0, bottomY, atEye(site.storeys[0], work, bottomY));
  }

  // 2. A pair beside it, one in the middle of the wall either side, its
  //    middle level with the axis work's: three works, one to a bay of
  //    the piers. Tall works first, then upright ones, and two of like
  //    size and kind before two that are not.
  for (const site of inTurn()) {
    const { axis } = site;
    if (!axis) continue;
    const hero = axis.work;
    const inner = outerWidth(hero) / 2 + GIANT_GAP;
    const span = site.end.half - inner;
    const fits = (w: Framed) =>
      outerWidth(w) + GIANT_GAP <= span &&
      outerHeight(w) <= outerHeight(hero) &&
      w.hM >= FLANK_MIN_HEIGHT * hero.hM;
    const pool = [...tallPool.filter(fits), ...otherPool.filter((w) => w.hM > w.wM && fits(w))];
    const found = bestPair(pool, (a, b) =>
      unlike(a, b) > PAIR_MAX_UNLIKE
        ? null
        : unlike(a, b) -
          kin(a.artwork, b.artwork) -
          (kin(a.artwork, hero.artwork) + kin(b.artwork, hero.artwork)) / 2 -
          100 * (Number(isTall(a)) + Number(isTall(b))),
    );
    if (!found) continue;
    const middle = axis.bottomY + outerHeight(hero) / 2;
    for (const [side, work] of [
      [-1, found.pair[0]],
      [1, found.pair[1]],
    ] as const) {
      const bottomY = middle - outerHeight(work) / 2;
      place(
        site,
        axis.level,
        site.end,
        work,
        side * (inner + span / 2),
        bottomY,
        atEye(site.storeys[0], work, bottomY),
      );
    }
  }

  // 3. Over the axis, level with the top floor or as high as the roof
  //    allows: a work too wide for any other place, which is over the
  //    piers there and seen whole. Each goes to the hall whose axis work
  //    it is nearest of kin to. The catalogue has three canvases about
  //    10 m wide and taller than a storey, and two end walls.
  const tooWide = (site: Site, w: Framed) =>
    isTall(w)
      ? outerWidth(w) > Math.max(0, ...site.sides.map((face) => 2 * face.half)) - 2 * GIANT_GAP
      : outerWidth(w) > AXIS_ONLY_WIDTH;
  for (const work of [...tallPool, ...otherPool].sort((a, b) => b.wM - a.wM)) {
    const open = sites
      .filter((site) => {
        if (!site.axis || site.top || !tooWide(site, work)) return false;
        const axisTop = site.axis.bottomY + outerHeight(site.axis.work);
        return (
          outerWidth(work) <= 2 * site.end.half - 2 * GIANT_GAP &&
          roofOf(site.storeys) - outerHeight(work) >= axisTop + AXIS_CLEAR
        );
      })
      .sort(
        (a, b) =>
          kin(work.artwork, b.axis!.work.artwork) - kin(work.artwork, a.axis!.work.artwork) ||
          a.talls - b.talls,
      );
    const site = open[0];
    if (!site?.axis) continue;
    const roof = roofOf(site.storeys);
    const axisTop = site.axis.bottomY + outerHeight(site.axis.work);
    const topFloor = floorOf(site.storeys, site.storeys.length - 1);
    const bottomY = Math.min(roof - outerHeight(work), Math.max(axisTop + AXIS_CLEAR, topFloor));
    const level = Math.min(
      site.storeys.length - 1,
      Math.max(0, Math.floor((bottomY - site.storeys[0].worldRect.y) / FLOOR_SEPARATION)),
    );
    site.top = true;
    place(site, level, site.end, work, 0, bottomY, null);
  }

  // 4. The side walls: on every second storey from the hall floor, one
  //    work in the middle of each, the two a pair. Both walls hang on
  //    the same storeys, the ones the end wall leaves bare, so no corner
  //    holds two works at one height. A tall work hangs before any
  //    other; a hall takes the pair most at home in it.
  const levels = Math.max(...sites.map((s) => s.storeys.length));
  for (let level = 0; level < levels; level += 2) {
    const open = new Set(sites.filter((s) => s.sides.length === 2 && level < s.storeys.length));
    while (open.size > 0) {
      let best: { site: Site; works: Framed[]; score: number } | null = null;
      for (const site of open) {
        const bottomY = floorOf(site.storeys, level);
        const limit =
          level + 2 < site.storeys.length
            ? floorOf(site.storeys, level + 2) - GIANT_GAP
            : roofOf(site.storeys);
        const fits = (w: Framed) =>
          site.sides.every((face) => outerWidth(w) + 2 * GIANT_GAP <= 2 * face.half) &&
          bottomY + outerHeight(w) <= limit;
        const talls = tallPool.filter(fits);
        const pool = [...talls, ...otherPool.slice(0, SHEER_CHOICE).filter(fits)];
        const found = bestPair(pool, (a, b) => {
          const mustHang = isTall(a) || isTall(b);
          if (talls.length > 0 ? !mustHang : unlike(a, b) > PAIR_MAX_UNLIKE) return null;
          return (
            unlike(a, b) -
            kin(a.artwork, b.artwork) -
            1.5 * atHome(site, a, b) -
            0.02 * (area(a) + area(b))
          );
        });
        // One tall work and nothing to hang across from it: alone.
        const works = found ? found.pair : talls.slice(0, 1);
        const score = found ? found.score : 0;
        if (works.length > 0 && (!best || score < best.score)) best = { site, works, score };
      }
      if (!best) break;
      const { site, works } = best;
      open.delete(site);
      const bottomY = floorOf(site.storeys, level);
      works.forEach((work, i) => {
        place(site, level, site.sides[i], work, 0, bottomY, beside(site.storeys, level, work));
      });
    }
  }

  return [...tallPool, ...otherPool];
}
