// Works too large for a room, hung at their real size in the halls.
//
// A room hangs nothing wider or taller than 3.2 m (`MAX_PAINTING_W`), so
// Veronese's Wedding at Cana, 9.94 m wide, hung at a third of its size
// beside a plaque that gave the true one. The block plan's halls have
// the wall a room has not: 27.5 m a side, a storey 8.2 m high, and a
// gallery in front of every wall on every floor.
//
// Every place is on a storey, in the middle of a stretch of wall, with
// the plaque beside the frame at reading height:
//
//   The court. Each wall has a stretch either side of its door, and
//   each stretch takes one work (`hangHallStoreys`).
//
//   The two stair halls. Each storey is one composition about the
//   stair's axis (`stairHallHang`): the largest work of the floor on
//   the end wall over the half landing, and pairs that mirror each
//   other on the end wall beside the landing and on the walls beside
//   the stair and the door.
//
//   The spiral rooms' outer walls, 22.5 m with no door, take what no
//   hall holds: a handscroll 12 m long (`hangGiants` in layout-block).
//
//   The spiral rooms' storeys then take tall works no gallery hung, in
//   the stair halls' composition (`tallSize`, `hangTallInSpirals` in
//   layout-block). Rico, 17 October 2026: "the spiral stair case rooms
//   could also hold tall paintings nicely". A storey there is 8.2 m
//   high and its walls stood bare.
//
// The first hang put every tall work on one wall, in two tiers 0.8 m
// apart, and a hall's storeys took two works a stretch. Rico, 13 October
// 2026: the big paintings "cluster too close together". So a stretch
// takes one work.
//
// Until 17 October 2026 the end wall of a stair hall and the strips of
// wall beside it stood sheer for 24 m, and the works taller than a
// storey hung there, the highest 21 m up and 11 m from the nearest
// floor. Rico found it "a bit meh" twice, and asked for the floors to
// meet the wall and the works to hang where a visitor can walk up to
// them, by the per-floor rules. The storey grew from 6.12 to 8.4 m
// for that, so the Triumph of Frederick Henry, 7.49 m in its frame,
// hangs on one.
//
// On 17 October 2026 the half landings were run back to the end wall
// and the piers under them taken out. Rico, of the wall between two
// landings: hang "all the way along" it. So the axis work hangs over
// the landing, on a wall clear from there to the next landing up, and
// its plaque is at eye level over the landing.
//
// Every work here hangs at the size its plaque states. One that fits
// no place hangs in its era's rooms, at its real size, where a wall
// holds it (`HangOptions.realSize` in place-paintings.ts).

import type { ArtworkListing } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
import { trustworthyRealSize } from "@/lib/real-size";
import { frameExtents, pickFrameDesign } from "./frame-design";
import {
  computeRoomRuns,
  footprintOf,
  frameReachOf,
  MAX_PAINTING_W,
  PAINTING_FLOOR_GAP,
  PLAQUE_EYE,
  packRun,
  runLength,
  type SizedWork,
  sideClearance,
  type WallRun,
} from "./place-paintings";
import { widestTexturePx } from "./sharpness";
import type { Placement, RoomLayout } from "./types";
import { FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "./world-coords";

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
/** A work beside the one in the axis is at least this share of its
 *  height: a low canvas beside one of six reads as a label. */
const FLANK_MIN_HEIGHT = 0.55;
/** Two works hang as a pair when they are no more unlike than this in
 *  size (`unlike`, metres). */
const PAIR_MAX_UNLIKE = 1.5;
/** What a work of another floor costs a pair, against the metres of
 *  `unlike`: a pair of the floor's own works wins unless the floor has
 *  none alike. */
const AWAY_COST = 2;

/**
 * The work at its real size, when that is more than a room hangs and
 * the scan is good for it. Null for every other work.
 *
 * The long edge is the catalogue's, and only an audited one
 * (`trustworthyRealSize`): a size the plaque would not print is not
 * hung at ten metres. The shape is the scan's, as in `sizeWork`.
 */
export function giantSize(
  artwork: ArtworkListing,
  minPxPerMetre = GIANT_MIN_PX_PER_METRE,
): SizedWork | null {
  const work = realSize(artwork);
  if (!work || (work.wM <= MAX_PAINTING_W && work.hM <= MAX_PAINTING_W)) return null;
  const px = widestTexturePx(artwork);
  if (px == null || px / work.wM < minPxPerMetre) return null;
  return work;
}

/** The work at its audited real size, in the scan's shape. */
function realSize(artwork: ArtworkListing): SizedWork | null {
  const size = trustworthyRealSize(artwork);
  if (!size || !artwork.width || !artwork.height) return null;
  const long = Math.max(size.widthCm, size.heightCm) / 100;
  const aspect = artwork.width / artwork.height;
  const wM = aspect >= 1 ? long : long * aspect;
  const hM = aspect >= 1 ? long / aspect : long;
  return { artwork, wM, hM };
}

/** A work hangs on a spiral room's storey when it is at least this
 *  tall, metres, at its real size: a full-length portrait, an
 *  altarpiece. A shorter one reads as small on a wall 8.2 m high. */
export const TALL_MIN_HEIGHT = 1.8;
/** And at least this much taller than wide. */
const TALL_MIN_ASPECT = 1.25;

/**
 * The work at its real size when it is tall enough for a spiral room's
 * storey and fits one, null for every other work. A work over a room's
 * 3.2 m passes only as a giant would, sharp enough at that size.
 */
export function tallSize(artwork: ArtworkListing): SizedWork | null {
  const work = realSize(artwork);
  if (!work || work.hM < TALL_MIN_HEIGHT || work.hM < TALL_MIN_ASPECT * work.wM) return null;
  if (work.hM > MAX_PAINTING_W && !giantSize(artwork)) return null;
  return fitsStorey(work) ? work : null;
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

/** The stretches of a hall storey's walls, each to hang one work: the
 *  walls between the corners and the doors, with no cap on height. */
export function hallRuns(room: RoomLayout): WallRun[] {
  return computeRoomRuns(room).map((run) => ({ ...run, maxHeight: Number.POSITIVE_INFINITY }));
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
        position[1] = seatedCenter(p, room.worldRect.y);
        room.placements.push({ ...p, position, giant: true });
      }
    }
  }
  return left;
}

/** The canvas centre of a work whose frame stands `PAINTING_FLOOR_GAP`
 *  over a floor at `floorY`. Every work of a hall starts at that one
 *  height, whatever its size. Rico, 17 October 2026, of a pair centred
 *  on one line beside a canvas twice as tall: "the images should start
 *  at the same height in those rooms". */
function seatedCenter(p: Placement, floorY: number): number {
  const e = frameExtents(p.frame ?? pickFrameDesign(p.artwork), p.widthM, p.heightM);
  return floorY + PAINTING_FLOOR_GAP + e.bottom + p.heightM / 2;
}

/** True when a work fits one of these stretches, a gap clear at each
 *  end. */
export function fitsStretch(runs: readonly WallRun[], work: SizedWork): boolean {
  const need = footprintOf(work) + 2 * GIANT_GAP;
  return runs.some((run) => runLength(run) >= need);
}

/** The middle of a stretch along its wall, world metres. */
export function stretchMiddle(run: WallRun): number {
  return (run.sign * (run.uMin + run.uMax)) / 2;
}

// ── The stair halls ───────────────────────────────────────────────────

type Framed = SizedWork & { reach: number; top: number; bottom: number };

function framed(work: SizedWork): Framed {
  const e = frameExtents(pickFrameDesign(work.artwork), work.wM, work.hM);
  return { ...work, reach: frameReachOf(work), top: e.top, bottom: e.bottom };
}

const outerHeight = (w: Framed) => w.hM + w.top + w.bottom;

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

/** One storey of a stair hall: its room, the wall its stair climbs
 *  toward and the wall with its door. */
export type StairHallStorey = { room: RoomLayout; end: WallRun["side"]; front: WallRun["side"] };

/** Where a storey of a stair hall hangs, in the order it is filled:
 *  the end wall's middle, then pairs that mirror each other about the
 *  stair's axis. Each place of a pair is a stretch, its work on the
 *  stretch's middle. */
type Bay = {
  storey: StairHallStorey;
  floor: number;
  /** Where the axis work hangs: the end wall from corner to corner, or
   *  the stretch of it over the half landing (`RoomLayout.endWall`).
   *  Null when a door splits the wall (the south spiral's, into the
   *  salon): its two stretches then hang a pair and nothing hangs on the
   *  axis. Null too on a storey whose end wall has no landing in front
   *  of it. */
  end: WallRun | null;
  /** The landing `end` stands on, metres over the storey's floor, and
   *  how high over that floor the wall is clear. Null for the floor. */
  landing: { y: number; top: number } | null;
  /** The two halves of the end wall either side of the axis work, once
   *  it hangs: a work on the middle of each. */
  flanks: [WallRun, WallRun] | null;
  /** The stretches beside the stair, those of each side wall nearer
   *  the end wall and then those nearer the front; the two stretches
   *  either side of the portal. */
  pairs: Array<[WallRun, WallRun]>;
  hero: Framed | null;
};

/** A run cut to the stretch between two points along it (`u`). */
const stretch = (run: WallRun, uMin: number, uMax: number): WallRun => ({ ...run, uMin, uMax });

function bayOf(storey: StairHallStorey, floor: number): Bay | null {
  const runs = hallRuns(storey.room);
  const longest = (side: WallRun["side"]) =>
    runs.filter((r) => r.side === side).sort((a, b) => runLength(b) - runLength(a));
  const ends = longest(storey.end);
  if (ends.length === 0) return null;
  // A loggia's end wall: the stretch over the half landing, and the
  // stretches either side of it, where the storey's floor runs up to
  // the wall.
  const over = ends.length === 1 ? storey.room.endWall : undefined;
  const wall = ends[0];
  const mid = (wall.uMin + wall.uMax) / 2;
  const end =
    ends.length !== 1
      ? null
      : !over
        ? wall
        : over.landing
          ? stretch(wall, mid - over.half, mid + over.half)
          : null;
  // Each side wall in two stretches, the one nearer the end wall first:
  // either side of its door, or its halves when it has none. World
  // coordinate along a run is `sign * u`: the end wall lies at the low
  // end of the world axis when it is the north or west wall.
  const endAtLow = storey.end === "north" || storey.end === "west";
  const fromEnd = (run: WallRun) => {
    const [a, b] = [run.sign * run.uMin, run.sign * run.uMax];
    return endAtLow ? Math.min(a, b) : -Math.max(a, b);
  };
  const halves = (["north", "south", "east", "west"] as const)
    .filter((side) => side !== storey.end && side !== storey.front)
    .map((side) => {
      const own = runs.filter((r) => r.side === side);
      if (own.length !== 1) return own.sort((a, b) => fromEnd(a) - fromEnd(b));
      const [run] = own;
      const mid = (run.uMin + run.uMax) / 2;
      return [stretch(run, run.uMin, mid), stretch(run, mid, run.uMax)].sort(
        (a, b) => fromEnd(a) - fromEnd(b),
      );
    });
  const pairs: Array<[WallRun, WallRun]> = [];
  if (ends.length === 2) pairs.push([ends[0], ends[1]]);
  if (over) {
    pairs.push([
      stretch(wall, wall.uMin, mid - over.half),
      stretch(wall, mid + over.half, wall.uMax),
    ]);
  }
  if (halves.length === 2 && halves[0].length === 2 && halves[1].length === 2) {
    pairs.push([halves[0][0], halves[1][0]], [halves[0][1], halves[1][1]]);
  }
  const fronts = runs.filter((r) => r.side === storey.front).sort((a, b) => a.uMin - b.uMin);
  if (fronts.length === 2) pairs.push([fronts[0], fronts[1]]);
  return { storey, floor, end, landing: over?.landing ?? null, flanks: null, pairs, hero: null };
}

/** A work hung on the middle of a stretch, seated on a floor `lift`
 *  metres above the room's (`seatedCenter`), or with its canvas centre
 *  at `centerY`. The plaque is at eye level over that floor. Returns
 *  the canvas centre. */
function hangOn(
  room: RoomLayout,
  run: WallRun,
  work: SizedWork,
  { lift = 0, centerY }: { lift?: number; centerY?: number } = {},
): number {
  const [p] = packRun(run, [work], Number.POSITIVE_INFINITY);
  const position: Placement["position"] = [...p.position];
  position[run.axis === "x" ? 0 : 2] = stretchMiddle(run);
  position[1] = centerY ?? seatedCenter(p, room.worldRect.y + lift);
  const plaque =
    lift === 0 ? {} : { plaque: { dy: room.worldRect.y + lift + PLAQUE_EYE - position[1] } };
  room.placements.push({ ...p, position, giant: true, ...plaque });
  return position[1];
}

/**
 * Hang the giants on the storeys of the stair halls, each storey as one
 * composition about its stair's axis:
 *
 *                    end wall
 *     [e]  [ flank ]  [ axis ]  [ flank ]  [e]   e: a pair, the end wall
 *   [b]             (landing)              [b]      beside the landing
 *   [f]              (stair)               [f]   b: a pair, the back half
 *                                                   of each side wall
 *                                                f: a pair, the front half
 *                [p]    door    [p]              p: a pair beside the door
 *
 * The axis work and its flanks hang over the half landing, the rest
 * over the storey's floor. The top storey has no landing of its own:
 * the wall there is the one over the landing below.
 *
 * Every work hangs on the middle of its stretch, so a pair mirrors
 * about the axis, and every frame stands at one height over its floor
 * or landing (`seatedCenter`). A pair is two works of like size
 * (`unlike`), of one hand or one era where the pool has such two. Nothing hangs alone where a pair belongs.
 *
 * Two steps, so a caller can hang other rooms between them: `axes`
 * gives each storey's end wall the largest work of its floor, and
 * `pairs` fills the rest from what is left. Each takes and returns the
 * works not hung, with the floor each belongs to. `axes` may be called
 * again with other works: it passes over a storey whose end wall
 * hangs one.
 *
 * The spiral rooms are hung the same way: the outer wall is the end
 * wall and the wall toward the court the front.
 */
export function stairHallHang(
  levels: StairHallStorey[][],
  /** Hang a work only on its own floor's storeys. Unset, a pair takes
   *  another floor's works where its own floor has none alike. */
  { ownFloor = false }: { ownFloor?: boolean } = {},
) {
  type Entry = { work: SizedWork; start: number };
  const bays = levels.flatMap((storeys, floor) =>
    storeys.map((s) => bayOf(s, floor)).filter((b): b is Bay => b !== null),
  );
  const fits = (run: WallRun, w: SizedWork) => footprintOf(w) + 2 * GIANT_GAP <= runLength(run);

  const axes = (works: Entry[]): Entry[] => {
    let pool = [...works].sort((a, b) => bySize(a.work, b.work));
    for (const bay of bays) {
      const end = bay.end;
      if (bay.hero || !end) continue;
      const landing = bay.landing;
      // Over a landing the wall is clear to the next one up.
      const tall = (w: SizedWork) =>
        !landing || framedHeight(w) <= landing.top - landing.y - PAINTING_FLOOR_GAP - 0.14;
      const entry = pool.find((e) => e.start === bay.floor && fits(end, e.work) && tall(e.work));
      if (!entry) continue;
      pool = pool.filter((e) => e !== entry);
      const work = framed(entry.work);
      hangOn(bay.storey.room, end, work, { lift: landing?.y ?? 0 });
      bay.hero = work;
      // The two halves of the wall beside it, each from the end of the
      // stretch to a gap beyond its frame and plaque. The plaque is on
      // one side only; both halves keep clear of it, so they mirror
      // each other.
      const mid = (end.uMin + end.uMax) / 2;
      const { left, right } = sideClearance(work);
      const clear = work.wM / 2 + Math.max(left, right) + GIANT_GAP;
      bay.flanks = [stretch(end, end.uMin, mid - clear), stretch(end, mid + clear, end.uMax)];
    }
    return pool;
  };

  const pairs = (works: Entry[]): Entry[] => {
    let pool = [...works]
      .sort((a, b) => bySize(a.work, b.work))
      .map((e) => ({
        ...e,
        framed: framed(e.work),
      }));
    type Candidate = (typeof pool)[number];
    /** The best pair for two stretches, of the works that fit both. */
    const choose = (
      bay: Bay,
      [a, b]: [WallRun, WallRun],
      also: (w: Framed) => boolean,
      kinTo: ArtworkListing | null,
    ) => {
      const room = pool.filter(
        (e) =>
          (!ownFloor || e.start === bay.floor) &&
          fits(a, e.work) &&
          fits(b, e.work) &&
          also(e.framed),
      );
      let best: { pair: [Candidate, Candidate]; score: number } | null = null;
      for (let i = 0; i < room.length; i++) {
        for (let j = i + 1; j < room.length; j++) {
          const x = room[i];
          const y = room[j];
          if (unlike(x.work, y.work) > PAIR_MAX_UNLIKE) continue;
          const score =
            unlike(x.work, y.work) -
            kin(x.work.artwork, y.work.artwork) -
            (kinTo ? (kin(x.work.artwork, kinTo) + kin(y.work.artwork, kinTo)) / 2 : 0) +
            AWAY_COST * (Number(x.start !== bay.floor) + Number(y.start !== bay.floor)) -
            0.02 * (area(x.work) + area(y.work));
          if (!best || score < best.score) best = { pair: [x, y], score };
        }
      }
      return best?.pair ?? null;
    };
    const hangPair = (
      bay: Bay,
      runs: [WallRun, WallRun],
      pair: [Candidate, Candidate],
      lift = 0,
    ) => {
      pool = pool.filter((e) => e !== pair[0] && e !== pair[1]);
      pair.forEach((e, i) => {
        hangOn(bay.storey.room, runs[i], e.work, { lift });
      });
    };

    // The end wall first: a pair beside each axis work, on the same
    // landing, of the floor's own works before another's.
    for (const bay of bays) {
      if (!bay.hero || !bay.flanks) continue;
      const hero = bay.hero;
      const pair = choose(
        bay,
        bay.flanks,
        (w) => outerHeight(w) <= outerHeight(hero) && w.hM >= FLANK_MIN_HEIGHT * hero.hM,
        hero.artwork,
      );
      if (pair) hangPair(bay, bay.flanks, pair, bay.landing?.y ?? 0);
    }
    // Then the walls beside the stair and the door, a pair at a time,
    // each storey's next pair in turn so the halls fill alike.
    const most = Math.max(0, ...bays.map((b) => b.pairs.length));
    for (let k = 0; k < most; k++) {
      for (const bay of bays) {
        const runs = bay.pairs[k];
        if (!runs) continue;
        const pair = choose(bay, runs, () => true, null);
        if (pair) hangPair(bay, runs, pair);
      }
    }
    return pool.map(({ work, start }) => ({ work, start }));
  };

  return { axes, pairs };
}

// ── The salon ─────────────────────────────────────────────────────────

/** Texture pixels a work needs for each metre of its real width to hang
 *  in the salon (`hangSalon`): sharp from 4 m. The salon is for the
 *  largest works, and the largest have the thinnest scans: the Last
 *  Judgment has 321. Rico, 17 October 2026, of the Last Judgment left
 *  out at its real size: "stuff like this is *exactly* what I want". */
export const SALON_MIN_PX_PER_METRE = 250;
/** Wall between the work on the salon's far wall and the one over it. */
const SALON_AXIS_CLEAR = 3;

/** The work at its real size when that is more than a room hangs and
 *  its scan is good enough for the salon. */
export function salonSize(artwork: ArtworkListing): SizedWork | null {
  return giantSize(artwork, SALON_MIN_PX_PER_METRE);
}

/**
 * Hang the salon: a hall four storeys high with galleries along its
 * front and side walls on every floor above, and its far wall sheer
 * (`buildSalon` in grand-stair.ts). It takes the largest works no other
 * wall holds, largest first.
 *
 *                     far wall
 *                [ by the same hand ]            on the third floor
 *     [ flank ]  [       axis       ]  [ flank ]  from the hall floor
 *   [d]                                      [d]   d, n: a pair on each
 *   [n]               (void)                 [n]   storey of the side
 *          [f]         door         [f]            walls; f: a pair on
 *                                                  each storey's front
 *
 * The axis work is the largest no wider than the void, on the hall
 * floor. Every other work hangs on a storey, with floor in front of it:
 * Rico found works hung high over a void "meh" in the stair halls. A
 * pair mirrors about the axis and is two works of like size, the
 * larger of the two picked first. A side wall's storey holds a pair on
 * each half, or one pair across both when its largest work needs it.
 *
 * `storeys` are the salon's rooms from the floor up; `voidHalf` is half
 * the width of the opening along the far wall. Returns the works not
 * hung.
 */
export function hangSalon(
  storeys: RoomLayout[],
  works: SizedWork[],
  walls: { far: WallRun["side"]; front: WallRun["side"] },
  voidHalf: number,
): SizedWork[] {
  const base = storeys[0];
  if (!base) return works;
  let pool = [...works].sort(bySize).map(framed);
  const take = (w: Framed) => {
    pool = pool.filter((x) => x !== w);
  };
  const fits = (run: WallRun, w: SizedWork) => footprintOf(w) + 2 * GIANT_GAP <= runLength(run);
  const onStorey = (w: Framed) => outerHeight(w) <= STOREY_FRAME_ROOM;
  const roof = storeys[storeys.length - 1].worldRect.y + INTER_FLOOR_HEIGHT - PAINTING_FLOOR_GAP;
  const farRun = (room: RoomLayout) => hallRuns(room).find((r) => r.side === walls.far);
  /** The pair of `fitting` led by the largest work that has a partner
   *  of like size, with the work most like it: size picks first,
   *  likeness second. */
  const pairOf = (fitting: Framed[], kinTo: ArtworkListing | null): [Framed, Framed] | null => {
    for (const [i, anchor] of fitting.entries()) {
      let best: { work: Framed; score: number } | null = null;
      for (const work of fitting.slice(i + 1)) {
        if (unlike(anchor, work) > PAIR_MAX_UNLIKE) continue;
        const score =
          unlike(anchor, work) -
          kin(anchor.artwork, work.artwork) -
          (kinTo ? kin(work.artwork, kinTo) : 0);
        if (!best || score < best.score) best = { work, score };
      }
      if (best) return [anchor, best.work];
    }
    return null;
  };
  const hangPair = (room: RoomLayout, runs: [WallRun, WallRun], pair: [Framed, Framed]) => {
    pair.forEach((w, i) => {
      take(w);
      hangOn(room, runs[i], w);
    });
  };

  // 1. The far wall: the axis work on the hall floor, one by the same
  //    hand over it, and a pair beside it.
  const run0 = farRun(base);
  if (run0) {
    const mid = (run0.uMin + run0.uMax) / 2;
    const axis = stretch(run0, mid - voidHalf, mid + voidHalf);
    const hero = pool.find(
      (w) => fits(axis, w) && base.worldRect.y + PAINTING_FLOOR_GAP + outerHeight(w) <= roof,
    );
    if (hero) {
      take(hero);
      const centerY = hangOn(base, axis, hero);
      const heroTop = centerY + hero.hM / 2 + hero.top;

      const over = pool.find(
        (w) =>
          kin(w.artwork, hero.artwork) === 2 &&
          fits(axis, w) &&
          heroTop + SALON_AXIS_CLEAR + outerHeight(w) <= roof,
      );
      if (over) {
        const bottomY = heroTop + SALON_AXIS_CLEAR;
        const level = Math.min(
          storeys.length - 1,
          Math.floor((bottomY - base.worldRect.y) / FLOOR_SEPARATION),
        );
        const room = storeys[level];
        const run = farRun(room);
        if (run) {
          take(over);
          hangOn(room, stretch(run, axis.uMin, axis.uMax), over, {
            centerY: bottomY + over.bottom + over.hM / 2,
          });
          // Over the void: nowhere to stand and read a plaque.
          room.placements[room.placements.length - 1].plaque = null;
        }
      }

      const { left, right } = sideClearance(hero);
      const clear = hero.wM / 2 + Math.max(left, right) + GIANT_GAP;
      const flanks: [WallRun, WallRun] = [
        stretch(run0, run0.uMin, mid - clear),
        stretch(run0, mid + clear, run0.uMax),
      ];
      const pair = pairOf(
        pool.filter(
          (w) =>
            onStorey(w) &&
            outerHeight(w) <= outerHeight(hero) &&
            fits(flanks[0], w) &&
            fits(flanks[1], w),
        ),
        hero.artwork,
      );
      if (pair) hangPair(base, flanks, pair);
    }
  }

  // 2. The side walls, a storey at a time from the floor: a pair on the
  //    half nearer the far wall, then on the half nearer the door, or
  //    one pair across both halves.
  const farAtLow = walls.far === "north" || walls.far === "west";
  const fromFar = (run: WallRun) => {
    const [a, b] = [run.sign * run.uMin, run.sign * run.uMax];
    return farAtLow ? Math.min(a, b) : -Math.max(a, b);
  };
  const sideNames = (["north", "south", "east", "west"] as const).filter(
    (s) => s !== walls.far && s !== walls.front,
  );
  for (const room of storeys) {
    const runs = hallRuns(room);
    const sides = sideNames.map(
      (s) => runs.filter((r) => r.side === s).sort((a, b) => runLength(b) - runLength(a))[0],
    );
    if (sides.some((r) => !r)) continue;
    const [a, b] = sides as [WallRun, WallRun];
    const halves = [a, b].map((run) => {
      const m = (run.uMin + run.uMax) / 2;
      return [stretch(run, run.uMin, m), stretch(run, m, run.uMax)].sort(
        (x, y) => fromFar(x) - fromFar(y),
      );
    });
    const inHalf = (w: Framed) => onStorey(w) && halves.every(([d, n]) => fits(d, w) && fits(n, w));
    // One pair across the wall when the best pair the wall can take
    // needs all of it; two pairs, one to each half, when it does not.
    const across = pairOf(
      pool.filter((w) => onStorey(w) && fits(a, w) && fits(b, w)),
      null,
    );
    if (!across) continue;
    if (across.every(inHalf)) {
      for (const k of [0, 1]) {
        const pair = pairOf(pool.filter(inHalf), null);
        if (pair) hangPair(room, [halves[0][k], halves[1][k]], pair);
      }
    } else {
      hangPair(room, [a, b], across);
    }
  }

  // 3. The front wall of each storey: the two stretches between its
  //    doors, a pair.
  for (const room of storeys) {
    const fronts = hallRuns(room)
      .filter((r) => r.side === walls.front)
      .sort((x, y) => runLength(y) - runLength(x))
      .slice(0, 2);
    if (fronts.length !== 2) continue;
    const runs = fronts as [WallRun, WallRun];
    const pair = pairOf(
      pool.filter((w) => onStorey(w) && fits(runs[0], w) && fits(runs[1], w)),
      null,
    );
    if (pair) hangPair(room, runs, pair);
  }

  return pool.map(({ artwork, wM, hM }) => ({ artwork, wM, hM }));
}
