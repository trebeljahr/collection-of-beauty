// The Grand Hall hang — the first room a visitor sees.
//
// Every floor spawns the player (and every floor teleport lands them) in
// the middle of the Grand Hall, facing the door to the stairwell. The
// general placer (place-paintings.ts) hangs rooms for density: works
// dealt by movement, packed wherever there is slack. That is right for
// the other two dozen rooms and wrong for this one, which is the first
// impression of the storey.
//
// So the hall is composed instead of filled:
//
//  - It hangs the floor's largest works that also have the pixels to be
//    seen large: a real measured size, a scan big enough to fill the
//    screen, and no scroll-like slivers.
//  - Every wall is mirror-symmetric about its centre. A wall with a door
//    in the middle hangs matched pairs, one each side of the opening; a
//    solid wall hangs one centrepiece with pairs outboard. The two works
//    of a pair are brought to the same height, so their top and bottom
//    edges line up across the door.
//  - The wall the player faces on spawn — the one with the stairwell
//    door — takes the biggest pair, right beside the opening, then the
//    next pair outboard. The wall behind gets the largest remaining work
//    as its centrepiece, and the side walls share what is left.
//  - Walls are hung sparser than the rest of the floor, with even air
//    between works, so a 3 m canvas has room to be a 3 m canvas.

import type { ArtworkListing } from "@/lib/data";
import { isSurpriseWorthy } from "@/lib/surprise";
import { artworkBand } from "./painting-bands";
import {
  computeRoomRuns,
  MAX_PAINTING_W,
  PAINTING_FLOOR_GAP,
  PAINTING_WALL_OFFSET,
  PLAQUE_FOOTPRINT,
  runLength,
  type SizedWork,
  sizeWork,
  type WallRun,
} from "./place-paintings";
import type { Door, Placement, RoomLayout } from "./types";

/** How many works the hall draws its hang from. Comfortably more than
 *  it can hold (~12–20), so the pairing step has partners to choose
 *  between; the ones it doesn't use hang elsewhere on the floor. */
const HALL_POOL_SIZE = 32;
/** Smallest long edge, in metres, a work needs to lead the hall. Below
 *  it the work reads as a gap on a 22.5 m wall. */
const HALL_MIN_LONG_EDGE = 0.9;
/** Smallest long edge for the second tier: works that fill out the
 *  hall's walls on a floor with too few large ones to cover all four
 *  (Modernism has six). They rank behind every first-tier work. */
const HALL_FILL_MIN_LONG_EDGE = 0.6;
/** Widest aspect the hall takes. Folding screens (~2.1:1) are in;
 *  handscrolls and predella strips are not — they are slivers at wall
 *  height, and they can't be paired with anything. */
const HALL_MAX_ASPECT = 2.25;
/** Works per artist before the rest of that artist's works drop to the
 *  back of the queue. A soft cap: a floor where one artist owns every
 *  large work (Audubon's double-elephant folios) still fills its hall. */
const HALL_ARTIST_CAP = 3;
/** Share of a half-wall's length its paintings may cover. The rest of
 *  the floor hangs at ~0.6 *including* plaques; this counts paintings
 *  alone, so the hall reads noticeably airier. */
const HALL_WIDTH_COVERAGE = 0.62;
/** Smallest air gap between neighbours, and between a work and the door
 *  clearance or corner. */
const HALL_MIN_GAP = 0.8;
/** Most works one half-wall holds. */
const MAX_PER_HALF = 3;
/** How far down the queue a work looks for its partner. */
const PAIR_WINDOW = 8;
/** Fewest works worth composing. Below it the floor has no large works
 *  to speak of and the hall falls back to the ordinary hang. */
const MIN_HALL_WORKS = 4;

/** How far a pair may be brought to one height. The taller work may
 *  shrink to 90 % and the shorter grow to 115 % — invisible at gallery
 *  scale, and never enough to halve a monumental canvas to fit a smaller
 *  partner. Works further apart than that aren't a pair. */
const PAIR_MAX_SHRINK = 0.9;
const PAIR_MAX_STRETCH = 1.15;
/** Most two paired works may differ in shape, as a ratio of aspects. A
 *  square beside a 2:1 screen reads as two unrelated works, however
 *  well their heights agree. */
const PAIR_MAX_ASPECT_RATIO = 1.8;

function aspectOk(artwork: ArtworkListing): boolean {
  const { width, height } = artwork;
  if (!artwork.objectKey || !width || !height) return false;
  return Math.max(width / height, height / width) <= HALL_MAX_ASPECT;
}

/** Can this work lead the hall? Needs a real measured size (without one,
 *  the placer guesses 0.9 m and "large" means nothing), a scan that holds
 *  up full screen, and a long edge that holds its own on a big wall. */
function isHallLead(work: SizedWork): boolean {
  const { artwork } = work;
  return (
    !!artwork.realDimensions &&
    isSurpriseWorthy(artwork) &&
    Math.max(work.wM, work.hM) >= HALL_MIN_LONG_EDGE
  );
}

/**
 * The works the Grand Hall is composed from, in priority order: largest
 * display area first, with any artist past HALL_ARTIST_CAP moved behind
 * everyone else, and the second tier (see HALL_FILL_MIN_LONG_EDGE)
 * behind all of that. Picked from the whole era *before* the floor is
 * sampled down to its renderer cap, so a masterpiece can't be sampled
 * out of the one room built to show it.
 */
export function pickHallCandidates(works: ArtworkListing[]): ArtworkListing[] {
  const ranked = works
    .filter(aspectOk)
    .map((artwork) => sizeWork(artwork))
    .filter((w) => Math.max(w.wM, w.hM) >= HALL_FILL_MIN_LONG_EDGE)
    .sort((a, b) => b.wM * b.hM - a.wM * a.hM || a.artwork.id.localeCompare(b.artwork.id));

  const perArtist = new Map<string, number>();
  const lead: ArtworkListing[] = [];
  const deferred: ArtworkListing[] = [];
  const fill: ArtworkListing[] = [];
  for (const work of ranked) {
    if (!isHallLead(work)) {
      fill.push(work.artwork);
      continue;
    }
    const { artwork } = work;
    const key =
      artwork.artistSlug && artwork.artistSlug !== "unknown" ? artwork.artistSlug : artwork.id;
    const seen = perArtist.get(key) ?? 0;
    perArtist.set(key, seen + 1);
    (seen < HALL_ARTIST_CAP ? lead : deferred).push(artwork);
  }
  return [...lead, ...deferred, ...fill].slice(0, HALL_POOL_SIZE);
}

/** One mirrored position on a wall: the two works hung at the same
 *  distance either side of the wall's centre. `span` is the wider of the
 *  two, so both halves lay out identically. */
type Slot = { low: SizedWork; high: SizedWork; span: number };

type WallPlan = {
  side: Door["side"];
  /** Any run of the wall — they share surface, sign and height. */
  run: WallRun;
  /** Wall centre, in the run's `u` coordinate. */
  centre: number;
  /** Distance from the centre to where each half starts: half the door
   *  cut on a portal wall, half the centrepiece on a solid one. */
  innerOffset: number;
  /** Length of each half. */
  halfLength: number;
  kind: "portal" | "solid";
  centrepiece: SizedWork | null;
  slots: Slot[];
};

function opposite(side: Door["side"]): Door["side"] {
  return ({ north: "south", south: "north", east: "west", west: "east" } as const)[side];
}

/** Viewer's left and right when facing `side`'s wall from inside. */
function flanks(side: Door["side"]): readonly [Door["side"], Door["side"]] {
  return (
    {
      north: ["west", "east"],
      south: ["east", "west"],
      east: ["north", "south"],
      west: ["south", "north"],
    } as const
  )[side];
}

/** A wall as the composer sees it: a door dead centre (two equal runs)
 *  or none (one run). Anything else has no centre to mirror about and
 *  is left bare — the Grand Hall's doors are always centred, so that is
 *  a guard, not a layout. */
function planWall(runs: WallRun[], side: Door["side"]): WallPlan | null {
  const own = runs.filter((r) => r.side === side).sort((a, b) => a.uMin - b.uMin);
  if (own.length === 1) {
    const run = own[0];
    return {
      side,
      run,
      centre: (run.uMin + run.uMax) / 2,
      innerOffset: 0,
      halfLength: runLength(run) / 2,
      kind: "solid",
      centrepiece: null,
      slots: [],
    };
  }
  if (own.length === 2 && Math.abs(runLength(own[0]) - runLength(own[1])) < 0.05) {
    const [low, high] = own;
    const centre = (low.uMax + high.uMin) / 2;
    return {
      side,
      run: low,
      centre,
      innerOffset: high.uMin - centre,
      halfLength: Math.min(runLength(low), runLength(high)),
      kind: "portal",
      centrepiece: null,
      slots: [],
    };
  }
  return null;
}

/** Air left between neighbours if the half holds these slot widths. */
function halfGap(plan: WallPlan, spans: number[]): number {
  const claimed = spans.reduce((sum, s) => sum + s + 2 * PLAQUE_FOOTPRINT, 0);
  return (plan.halfLength - claimed) / (spans.length + 1);
}

function halfAccepts(plan: WallPlan, span: number): boolean {
  if (plan.slots.length >= MAX_PER_HALF) return false;
  const spans = [...plan.slots.map((s) => s.span), span];
  const painted = spans.reduce((a, b) => a + b, 0);
  return painted <= HALL_WIDTH_COVERAGE * plan.halfLength && halfGap(plan, spans) >= HALL_MIN_GAP;
}

/** Bring two works to one height, keeping each one's aspect, or null if
 *  they are too far apart to pair (see PAIR_MAX_SHRINK). Stays as close
 *  to the taller work's height as the shorter one can stretch. */
function matchHeights(a: SizedWork, b: SizedWork): [SizedWork, SizedWork] | null {
  const aspectA = a.wM / a.hM;
  const aspectB = b.wM / b.hM;
  if (Math.max(aspectA, aspectB) / Math.min(aspectA, aspectB) > PAIR_MAX_ASPECT_RATIO) return null;
  const tall = Math.max(a.hM, b.hM);
  // Nor may either work end up wider than the building hangs anything —
  // the wide screens all sit on that cap already, a few mm apart in
  // height, so this is what usually decides their common height.
  const h = Math.min(
    tall,
    Math.min(a.hM, b.hM) * PAIR_MAX_STRETCH,
    MAX_PAINTING_W / aspectA,
    MAX_PAINTING_W / aspectB,
  );
  if (h < tall * PAIR_MAX_SHRINK) return null;
  return [
    { artwork: a.artwork, wM: h * aspectA, hM: h },
    { artwork: b.artwork, wM: h * aspectB, hM: h },
  ];
}

/** How badly two works read as a pair: difference in height (weighted
 *  double — it's the top and bottom edges the eye lines up across a
 *  door) plus difference in shape, both on a log scale. */
function pairCost(a: SizedWork, b: SizedWork): number {
  return (
    2 * Math.abs(Math.log(a.hM / b.hM)) + Math.abs(Math.log(a.wM / a.hM) - Math.log(b.wM / b.hM))
  );
}

/**
 * Compose the Grand Hall's walls from `pool`. Returns the placements, or
 * null when the pool can't fill a hall worth the name — the caller then
 * hangs the room like any other. `frontRoomId` is the room behind the
 * wall the player faces on spawn: the stairwell.
 */
export function hangGrandHall(
  room: RoomLayout,
  pool: ArtworkListing[],
  frontRoomId: string,
): Placement[] | null {
  const front = room.doors.find((d) => d.connectsTo.roomId === frontRoomId)?.side ?? "north";
  const [left, right] = flanks(front);
  const runs = computeRoomRuns(room);
  const frontWall = planWall(runs, front);
  const backWall = planWall(runs, opposite(front));
  const leftWall = planWall(runs, left);
  const rightWall = planWall(runs, right);

  const queue: SizedWork[] = pool.map(sizeWork);

  // A solid wall's centrepiece: the first work in the queue narrow
  // enough to leave its wall a real pair of halves either side.
  const takeCentrepiece = (plan: WallPlan | null) => {
    if (!plan || plan.kind !== "solid" || plan.centrepiece) return;
    const wall = plan.halfLength * 2;
    const i = queue.findIndex((w) => w.wM <= wall * (HALL_WIDTH_COVERAGE / 2));
    if (i < 0) return;
    const [work] = queue.splice(i, 1);
    const claimed = work.wM + 2 * PLAQUE_FOOTPRINT;
    plan.centrepiece = work;
    plan.innerOffset = claimed / 2;
    plan.halfLength = wall / 2 - plan.innerOffset;
  };

  // Hang the highest-priority pair this wall can still take. The first
  // work in the queue that fits leads; its partner is whichever of the
  // next PAIR_WINDOW works matches it best.
  const takePair = (plan: WallPlan | null): boolean => {
    if (!plan) return false;
    for (let i = 0; i < queue.length; i++) {
      let best: { j: number; pair: [SizedWork, SizedWork]; cost: number } | null = null;
      for (let j = i + 1; j < Math.min(queue.length, i + 1 + PAIR_WINDOW); j++) {
        const pair = matchHeights(queue[i], queue[j]);
        if (!pair || !halfAccepts(plan, Math.max(pair[0].wM, pair[1].wM))) continue;
        const cost = pairCost(queue[i], queue[j]);
        if (!best || cost < best.cost) best = { j, pair, cost };
      }
      if (!best) continue;
      const [a, b] = best.pair;
      queue.splice(best.j, 1);
      queue.splice(i, 1);
      plan.slots.push({ low: a, high: b, span: Math.max(a.wM, b.wM) });
      return true;
    }
    return false;
  };

  // Priority: the wall the player spawns facing, then the centrepiece
  // they find when they turn round, then both flanks in step, then
  // whatever the back wall still has room for.
  while (takePair(frontWall));
  takeCentrepiece(backWall);
  takeCentrepiece(leftWall);
  takeCentrepiece(rightWall);
  for (;;) {
    const l = takePair(leftWall);
    const r = takePair(rightWall);
    if (!l && !r) break;
  }
  while (takePair(backWall));

  const placements: Placement[] = [];
  for (const plan of [frontWall, backWall, leftWall, rightWall]) {
    if (plan) placements.push(...layoutWall(plan));
  }
  return placements.length >= MIN_HALL_WORKS ? placements : null;
}

/** Turn a composed wall into placements: centrepiece at the centre,
 *  slots laid out from the centre outwards with even gaps, mirrored. */
function layoutWall(plan: WallPlan): Placement[] {
  const out: Placement[] = [];
  if (plan.centrepiece) out.push(place(plan.run, plan.centre, plan.centrepiece));

  const gap = halfGap(
    plan,
    plan.slots.map((s) => s.span),
  );
  let cursor = plan.innerOffset + gap;
  // Largest pair nearest the centre, so every wall steps down towards
  // its corners — slots are taken in queue order, which isn't always
  // size order once a lead has had to wait for its partner.
  const bySize = [...plan.slots].sort((a, b) => b.span * b.low.hM - a.span * a.low.hM);
  for (const slot of bySize) {
    const claimed = slot.span + 2 * PLAQUE_FOOTPRINT;
    const offset = cursor + claimed / 2;
    out.push(place(plan.run, plan.centre - offset, slot.low));
    out.push(place(plan.run, plan.centre + offset, slot.high));
    cursor += claimed + gap;
  }
  return out;
}

function place(run: WallRun, u: number, work: SizedWork): Placement {
  // Same lift the ordinary hang applies: tall works rise so their bottom
  // edge clears the floor, everything else keeps the eye line.
  const centerY = Math.max(run.centerY, run.floorY + PAINTING_FLOOR_GAP + work.hM / 2);
  const along = run.sign * u;
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
  };
}
