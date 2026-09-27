import { getColorBucket } from "@/lib/color-buckets.mjs";
import { getEra } from "@/lib/gallery-eras";
import { type Scope, scopeSearch } from "@/lib/scope-href";
import { isSurpriseWorthy } from "@/lib/surprise";
import type { ArtworkPageQuery } from "@/lib/use-artwork-pagination";
import { FULL_SIZE_MIN_WIDTH, VARIANT_WIDTHS } from "@/lib/variant-config.mjs";

/**
 * The pure half of `/play`, the slideshow that walks a scope (an era, an
 * artist, a colour family, a plate set, or the home grid with its
 * filters) one work at a time.
 *
 * Nothing here imports the data files, so the client view can use every
 * helper without pulling artworks.json into its chunk. The deck paging,
 * the rung choice, the pan geometry and the advance state machine all
 * live here so they can be pinned by plain vitest cases rather than by a
 * browser.
 */

/** Listings per /api/artworks/page request. Pages are aligned to this,
 *  so every viewer of a scope asks for the same URLs and the route's
 *  `s-maxage=3600` answers most of them from the CDN. The server hands
 *  over one page up front, which is ~15 KB of slim listings. */
export const SLIDESHOW_PAGE_SIZE = 40;
/** How many works ahead of the one on screen the deck keeps loaded. */
export const SLIDESHOW_LOOKAHEAD = 3;

export const INTERVAL_CHOICES_S = [8, 12, 20, 30] as const;
export const DEFAULT_INTERVAL_S = 12;
/** On Save-Data / 3g a 12 s interval can outrun the download itself, which
 *  turns every advance into a hold. */
export const SLOW_INTERVAL_S = 20;
/** Per-viewer convenience only (see `parseStoredInterval`). */
export const INTERVAL_STORAGE_KEY = "cob-slideshow-interval";

export const FADE_MS = 1500;
export const MANUAL_FADE_MS = 400;
export const REDUCED_FADE_MS = 600;
export const IDLE_HIDE_MS = 3000;
/** A spinner that flashes for 100 ms on every step reads as flicker. */
export const SPINNER_DELAY_MS = 400;

/** Largest zoom of the Ken Burns pan. The visible crop per axis is
 *  1 − 1/1.12 ≈ 10.7%, which keeps a signature or a plate number in view. */
export const PAN_MAX_SCALE = 1.12;
/** Drift at full zoom, in % of the stage box. Must stay at or below
 *  (PAN_MAX_SCALE − 1) / 2 × 100 = 6, or the drift uncovers the stage edge
 *  the zoom was covering. */
export const PAN_SHIFT_PCT = 5;

/** Past 2x a phone's 3x screen buys pixels nobody can see at arm's
 *  length, at 2.25x the decode. */
export const DPR_CAP = 2;
/** Slow connections never fetch past the 1280 rung. */
export const SLOW_MAX_WIDTH = 1280;
/** Accept a rung that covers at least 90% of the pixels the stage needs.
 *  The next rung up is often 1.3–1.6x the bytes for a 10% sharper frame. */
export const RUNG_TOLERANCE = 0.9;
/** Decode ceiling per slide. Mobile Safari kills a tab somewhere past
 *  ~100 MP of live bitmaps, and a slideshow holds up to three at once
 *  (outgoing, incoming, preloaded). A 4096 rung of a 1:2 portrait is
 *  33.5 MP, which this rules out. */
export const MAX_SLIDE_PIXELS = 24_000_000;

/** Same thresholds as the lightbox's swipe (see lightbox.tsx). */
export const SWIPE_MIN_DISTANCE_PX = 60;
export const SWIPE_HORIZONTAL_RATIO = 1.5;
/** A touch that moved less than this is a tap, which toggles the chrome. */
export const TAP_MAX_MOVE_PX = 10;
/** Consecutive works that failed to load before the show stops and says
 *  so. Three broken images in a row means the network, not the images. */
export const MAX_CONSECUTIVE_FAILURES = 3;

// ---------------------------------------------------------------------------
// Scope and URL

/** Every scope but the timeline's. /api/artworks/page cannot reproduce the
 *  timeline order, and nothing links to /play from the timeline. */
export type PlayableScope = Exclude<Scope, { kind: "decade" }>;

export function isPlayableScope(scope: Scope): scope is PlayableScope {
  return scope.kind !== "decade";
}

/** `/play?from=…[&start=<id>]`. The scope part is `scopeSearch`, the same
 *  string the artwork page's `?from=` rides on, so a filtered home grid
 *  plays exactly the selection its tiles link into. */
export function playHref(scope: PlayableScope, startId?: string | null): string {
  const base = `/play?${scopeSearch(scope)}`;
  return startId ? `${base}&start=${encodeURIComponent(startId)}` : base;
}

/** Longest `start` value worth looking up. Artwork ids are slugs well
 *  under this; anything longer is not one. */
const MAX_START_LENGTH = 200;

export function parseStartParam(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  if (!trimmed || trimmed.length > MAX_START_LENGTH) return null;
  return trimmed;
}

/** The client-safe twin of `scopeOrderInput` in artwork-scope.ts (which is
 *  server-only, because that module pulls the catalogue). Field names
 *  differ (`query` there, `q` here); `seed` is left unset so the route
 *  falls back to DEFAULT_SHUFFLE_SEED, which is what the server-side order
 *  uses. slideshow-order.test.ts pins the two against each other. */
export function scopePageQuery(scope: PlayableScope): ArtworkPageQuery {
  if (scope.kind === "gallery") {
    return {
      q: scope.filter?.q,
      era: scope.filter?.era,
      sort: scope.filter?.sort ?? "shuffle",
    };
  }
  if (scope.kind === "artist") return { artistSlug: scope.slug, sort: "year" };
  if (scope.kind === "collection") return { collection: scope.id, sort: "plate" };
  if (scope.kind === "color") return { color: scope.id, sort: "color" };
  return { era: scope.id, sort: "shuffle" };
}

/** What the slideshow says it is playing. The gallery wording copies the
 *  artwork page's `filterPhrase`, so the two surfaces describe one
 *  selection the same way. `label` is the server's `scopeLabel`, which
 *  only the artist and collection kinds need. */
export function slideshowHeading(scope: PlayableScope, label: string): string {
  if (scope.kind === "gallery") {
    const filter = scope.filter;
    let phrase = filter?.q ? `Results for “${filter.q}”` : "All works";
    if (filter?.era) phrase += ` in ${getEra(filter.era).title}`;
    if (filter?.sort === "year") phrase += ", chronological";
    if (filter?.sort === "artist") phrase += ", sorted by artist";
    return phrase;
  }
  if (scope.kind === "era") return getEra(scope.id).title;
  // Matches the colour page's own <title>.
  if (scope.kind === "color") return `${getColorBucket(scope.id).label} works`;
  return label;
}

// ---------------------------------------------------------------------------
// Index and page math

/** Position of `startId` in the list, or 0 when it is absent or unknown —
 *  a stale bookmark still plays the scope, from the top. */
export function resolveStartIndex(list: readonly { id: string }[], startId: string | null): number {
  if (!startId) return 0;
  const at = list.findIndex((a) => a.id === startId);
  return at < 0 ? 0 : at;
}

/** Wrap any integer into `[0, total)`, so the show loops: after the last
 *  work comes the first, and Previous on the first goes to the last. */
export function wrapIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}

export function pageStartFor(index: number, pageSize: number = SLIDESHOW_PAGE_SIZE): number {
  return Math.floor(index / pageSize) * pageSize;
}

/** The indices the deck keeps loaded around `index`: the next
 *  `lookahead` works, then the previous one (for a Previous press).
 *  Wrapped and deduplicated, and never `index` itself. */
export function indicesToEnsure(
  index: number,
  total: number,
  lookahead: number = SLIDESHOW_LOOKAHEAD,
): number[] {
  if (total <= 1) return [];
  const self = wrapIndex(index, total);
  const out: number[] = [];
  for (const delta of [...Array.from({ length: lookahead }, (_, i) => i + 1), -1]) {
    const i = wrapIndex(index + delta, total);
    if (i !== self && !out.includes(i)) out.push(i);
  }
  return out;
}

/** Aligned page starts that hold at least one of `indices` the deck does
 *  not have yet, in first-seen order. */
export function missingPageStarts(
  indices: readonly number[],
  has: (i: number) => boolean,
  pageSize: number = SLIDESHOW_PAGE_SIZE,
): number[] {
  const out: number[] = [];
  for (const i of indices) {
    if (has(i)) continue;
    const start = pageStartFor(i, pageSize);
    if (!out.includes(start)) out.push(start);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Which image to fetch

/** The subset of `ArtworkListing` the rung and pan choices read.
 *  Structural so a test can pass a three-field literal. */
export type SlideSource = {
  width: number | null;
  height: number | null;
  variantWidths: readonly number[] | null;
};

export type SlideViewport = { width: number; height: number; dpr: number };

/** Width over height, with the 1600×2000 fallback surprise-view and the
 *  artwork page use for works whose dimensions were never recorded. */
export function sourceAspect(src: SlideSource): number {
  const w = src.width && src.width > 0 ? src.width : 1600;
  const h = src.height && src.height > 0 ? src.height : 2000;
  return w / h;
}

/** CSS width the work occupies when fitted inside the stage. */
export function containedCssWidth(src: SlideSource, vp: SlideViewport): number {
  return Math.min(vp.width, vp.height * sourceAspect(src));
}

const LADDER = new Set<number>(VARIANT_WIDTHS);

/**
 * The ladder rung to fetch for this work on this stage, or null when the
 * work has no ladder at all (the caller then uses `fallbackVariantUrl`).
 *
 * Only responsive-ladder rungs are candidates, never the 6144 close-up
 * rung or the per-source full-size AVIF: both are listed in
 * `variantWidths`, and either is a 50–265 MP decode that mobile Safari
 * will not survive. `variantWidths` lists filenames, not resolutions
 * (see variant-config.mjs), so every size below is clamped to the
 * source's own width.
 *
 * `headroom` is PAN_MAX_SCALE when the work will zoom, so the last frame
 * of the pan is as sharp as the first.
 */
export function chooseSlideWidth(
  src: SlideSource,
  vp: SlideViewport,
  opts: { slow: boolean; headroom: number },
): number | null {
  const widths = src.variantWidths;
  if (!widths || widths.length === 0) return null;
  const ladder = widths
    .filter((w) => LADDER.has(w) && w <= FULL_SIZE_MIN_WIDTH)
    .sort((a, b) => a - b);
  if (ladder.length === 0) return null;

  const aspect = sourceAspect(src);
  const srcW = src.width && src.width > 0 ? src.width : Number.POSITIVE_INFINITY;
  const eff = (r: number) => Math.min(r, srcW);
  const pixels = (r: number) => (eff(r) * eff(r)) / aspect;

  let eligible = ladder.filter((r) => pixels(r) <= MAX_SLIDE_PIXELS);
  if (eligible.length === 0) eligible = [ladder[0]];
  if (opts.slow) {
    const small = eligible.filter((r) => r <= SLOW_MAX_WIDTH);
    if (small.length > 0) eligible = small;
  }

  const dpr = opts.slow ? 1 : Math.min(Math.max(vp.dpr || 1, 1), DPR_CAP);
  let needed = containedCssWidth(src, vp) * dpr * opts.headroom;
  if (opts.slow) needed = Math.min(needed, SLOW_MAX_WIDTH);
  const threshold = needed * RUNG_TOLERANCE;

  const fits = eligible.find((r) => eff(r) >= threshold);
  if (fits !== undefined) return fits;
  // Nothing covers the stage: the source itself is smaller than needed.
  // Every rung at or above the source width holds the same pixels, so
  // take the smallest filename among them.
  const whole = eligible.find((r) => r >= srcW);
  return whole ?? eligible[eligible.length - 1];
}

// ---------------------------------------------------------------------------
// Ken Burns

export type PanAxis = "x" | "y";
/** `shift` is a percentage of the stage box. */
export type PanFrame = { scale: number; shift: number };
export type PanPlan = { axis: PanAxis; from: PanFrame; to: PanFrame } | null;

/**
 * The slow zoom and drift for the work at `index`, or null for a static
 * slide.
 *
 * Static when the visitor asked for reduced motion, and for any work that
 * `/surprise` would not show full bleed: a low-resolution scan (zooming
 * it shows its pixels), a panorama past 4:1, or a work with no recorded
 * size. Those works are still shown, contained — skipping them would
 * leave holes in "play this artist".
 *
 * Tall works drift vertically, wide and square ones horizontally. Even
 * indices zoom in, odd ones zoom back out, and the drift direction flips
 * every two works, so consecutive slides never move the same way. The
 * plan depends only on the absolute index, so stepping back replays the
 * same motion.
 *
 * Invariant at both frames, and so everywhere between them under linear
 * interpolation: |shift| ≤ (scale − 1) / 2 × 100. The zoom's overhang
 * always covers the drift, so no stage edge is uncovered.
 */
export function panPlan(src: SlideSource, index: number, reducedMotion: boolean): PanPlan {
  if (reducedMotion || !isSurpriseWorthy(src)) return null;
  const axis: PanAxis = sourceAspect(src) < 1 ? "y" : "x";
  const zoomIn = index % 2 === 0;
  const dir = Math.floor(index / 2) % 2 === 0 ? 1 : -1;
  const s = PAN_SHIFT_PCT * dir;
  if (zoomIn) {
    return { axis, from: { scale: 1, shift: 0 }, to: { scale: PAN_MAX_SCALE, shift: -s } };
  }
  return { axis, from: { scale: PAN_MAX_SCALE, shift: s }, to: { scale: 1, shift: 0 } };
}

function frameTransform(axis: PanAxis, frame: PanFrame): string {
  // `+ 0` folds a -0 into 0, so a zero drift never prints as "-0%".
  const shift = frame.shift + 0;
  const x = axis === "x" ? shift : 0;
  const y = axis === "y" ? shift : 0;
  return `translate3d(${x}%, ${y}%, 0) scale(${frame.scale})`;
}

/** Web Animations keyframes for a plan. The translate is written before
 *  the scale, so it is measured in unscaled stage units — the same units
 *  the invariant above is written in. */
export function panKeyframes(plan: NonNullable<PanPlan>): Keyframe[] {
  return [
    { transform: frameTransform(plan.axis, plan.from) },
    { transform: frameTransform(plan.axis, plan.to) },
  ];
}

/** Cross-fade length. A manual step answers a key press and has to feel
 *  immediate; an automatic advance is the slow dissolve the show is for,
 *  and a shorter one under reduced motion, where the fade is all there is. */
export function fadeMs(intent: "auto" | "manual", reducedMotion: boolean): number {
  if (intent === "manual") return MANUAL_FADE_MS;
  return reducedMotion ? REDUCED_FADE_MS : FADE_MS;
}

// ---------------------------------------------------------------------------
// Interval

/** A stored interval, or null unless it is one of the offered choices.
 *  localStorage is the viewer's to edit, so read it as untrusted. */
export function parseStoredInterval(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return (INTERVAL_CHOICES_S as readonly number[]).includes(n) ? n : null;
}

/** The interval button cycles 8 → 12 → 20 → 30 → 8. */
export function nextIntervalChoice(currentS: number): number {
  const choices = INTERVAL_CHOICES_S as readonly number[];
  const at = choices.indexOf(currentS);
  if (at < 0) return DEFAULT_INTERVAL_S;
  return choices[(at + 1) % choices.length];
}

/** The viewer's own choice wins; otherwise 12 s, or 20 s on a slow link. */
export function intervalMs(storedS: number | null, slow: boolean): number {
  const s = storedS ?? (slow ? SLOW_INTERVAL_S : DEFAULT_INTERVAL_S);
  return s * 1000;
}

// ---------------------------------------------------------------------------
// Input

/** A swipe's step, with the lightbox's thresholds: far enough, and mostly
 *  sideways. Swiping left pulls the next work in from the right. */
export function swipeDirection(dx: number, dy: number): "next" | "prev" | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return null;
  if (Math.abs(dx) < SWIPE_HORIZONTAL_RATIO * Math.abs(dy)) return null;
  return dx < 0 ? "next" : "prev";
}

// ---------------------------------------------------------------------------
// Advance state machine

/**
 * The player, as a reducer over indices. Images are not its business:
 * the view prepares (fetches and decodes) `target` and reports `ready`
 * or `failed`, and the reducer decides when that becomes `shown`.
 *
 * The one rule it exists for: nothing is shown until it is decoded. When
 * the interval elapses first (`due`), the current work stays up until the
 * next one reports ready, and then it commits at once.
 */
export type PlayerState = {
  total: number;
  /** Index on screen; null before the first commit. */
  shown: number | null;
  /** Index being prepared. */
  target: number;
  /** `target` is decoded and waiting. */
  targetReady: boolean;
  /** Why `target` is pending: the timer, or a Previous / Next press. */
  intent: "auto" | "manual";
  /** Which way to skip a work that fails to load. */
  direction: 1 | -1;
  /** The interval for `shown` has elapsed. */
  due: boolean;
  /** The viewer's play/pause choice. */
  playing: boolean;
  failures: number;
  stalled: boolean;
  /** Bumped per commit. Keys the slide layers and restarts the timer. */
  commits: number;
  /** The intent of the latest commit, which picks its fade length. */
  committedIntent: "auto" | "manual" | null;
};

export type PlayerEvent =
  | { type: "ready"; index: number }
  | { type: "failed"; index: number }
  | { type: "due" }
  | { type: "step"; delta: 1 | -1 }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "retry" }
  | { type: "invalidate" }
  | { type: "total"; total: number };

export function initialPlayerState(total: number, startIndex: number): PlayerState {
  return {
    total,
    shown: null,
    target: wrapIndex(startIndex, total),
    targetReady: false,
    intent: "auto",
    direction: 1,
    due: false,
    playing: true,
    failures: 0,
    stalled: false,
    commits: 0,
    committedIntent: null,
  };
}

/** Commit `target` if it is decoded and something asks for it: the first
 *  slide, a manual step (even while paused), or an elapsed interval while
 *  playing. */
function maybeCommit(s: PlayerState): PlayerState {
  if (!s.targetReady) return s;
  if (!(s.shown === null || s.intent === "manual" || (s.due && s.playing))) return s;
  return {
    ...s,
    shown: s.target,
    target: wrapIndex(s.target + 1, s.total),
    targetReady: false,
    intent: "auto",
    direction: 1,
    due: false,
    failures: 0,
    stalled: false,
    commits: s.commits + 1,
    committedIntent: s.intent,
  };
}

export function playerReducer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case "ready":
      // A prepare that finished for an index the player has since moved
      // past is stale; its slide is dropped by the view.
      if (event.index !== state.target || state.targetReady) return state;
      return maybeCommit({ ...state, targetReady: true });

    case "failed": {
      if (event.index !== state.target) return state;
      const failures = state.failures + 1;
      if (failures >= MAX_CONSECUTIVE_FAILURES || state.total <= 1) {
        return { ...state, failures, stalled: true, targetReady: false };
      }
      // Skip the broken work in the direction the viewer was going.
      return {
        ...state,
        failures,
        target: wrapIndex(state.target + state.direction, state.total),
        targetReady: false,
      };
    }

    case "due":
      if (state.shown === null) return state;
      return maybeCommit({ ...state, due: true });

    case "step": {
      // While a manual target is pending, a second press moves on from
      // it rather than from the work on screen, so rapid presses add up.
      const base =
        state.intent === "manual" && state.shown !== null
          ? state.target
          : (state.shown ?? state.target);
      const next = wrapIndex(base + event.delta, state.total);
      const cleared = { ...state, stalled: false, failures: 0 };
      if (next === state.target) {
        // Usually the preloaded next work: commit it now if it is decoded.
        return maybeCommit({ ...cleared, intent: "manual", direction: event.delta });
      }
      return {
        ...cleared,
        target: next,
        targetReady: false,
        intent: "manual",
        direction: event.delta,
      };
    }

    case "play":
      return maybeCommit({ ...state, playing: true });
    case "pause":
      return { ...state, playing: false };
    case "toggle":
      return state.playing
        ? { ...state, playing: false }
        : maybeCommit({ ...state, playing: true });

    case "retry":
      return { ...state, stalled: false, failures: 0, targetReady: false };

    case "invalidate":
      // The stage changed size (resize, fullscreen) or motion preference
      // flipped: the waiting slide was sized for the old one.
      return state.targetReady ? { ...state, targetReady: false } : state;

    case "total": {
      if (event.total < 1 || event.total === state.total) return state;
      const target = wrapIndex(state.target, event.total);
      return {
        ...state,
        total: event.total,
        shown: state.shown === null ? null : wrapIndex(state.shown, event.total),
        target,
        targetReady: target === state.target ? state.targetReady : false,
      };
    }
  }
}
