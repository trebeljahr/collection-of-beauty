import type { Artwork } from "@/lib/data";

export const DIGEST_SIZE = 5;

/**
 * ISO 8601 week key, e.g. "2026-W17". One issue per week.
 * Uses UTC so the key doesn't shift across timezones.
 */
export function isoWeekKey(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // Thursday of the ISO week determines the ISO week year.
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Human-readable issue date, e.g. "April 19, 2026" (UTC). */
export function issueDateLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Deterministic string hash → 32-bit integer.
 * Used to seed the RNG so "random" picks are reproducible for a given week.
 */
function hashString(input: string): number {
  let h = 2166136261 >>> 0; // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 — tiny, fast, good-enough-for-this seeded RNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick `count` artworks at random (seeded by `weekKey`), excluding any
 * whose id appears in `excludeIds`. Non-destructive — returns a new array.
 *
 * Throws if fewer than `count` candidates remain after exclusion.
 */
export function pickArtworks(
  all: Artwork[],
  excludeIds: Set<string>,
  weekKey: string,
  count: number = DIGEST_SIZE,
): Artwork[] {
  const pool = all.filter((a) => !excludeIds.has(a.id));
  if (pool.length < count) {
    throw new Error(
      `Only ${pool.length} unsent artwork(s) remain, need ${count}. ` +
        `Consider adding more works or resetting newsletter state.`,
    );
  }
  const rand = mulberry32(hashString(weekKey));
  // Partial Fisher-Yates: shuffle just the first `count` positions.
  const arr = pool.slice();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/**
 * Resolve a manually curated list of artwork ids to Artwork objects, in the
 * caller's order. Throws on unknown ids, duplicates, or wrong count.
 */
export function resolveManualPicks(
  all: Artwork[],
  ids: string[],
  count: number = DIGEST_SIZE,
): Artwork[] {
  if (ids.length !== count) {
    throw new Error(
      `Manual selection must contain exactly ${count} artwork ids, got ${ids.length}.`,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error("Manual selection contains duplicate ids.");
  }
  const byId = new Map(all.map((a) => [a.id, a]));
  const resolved: Artwork[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) missing.push(id);
    else resolved.push(a);
  }
  if (missing.length > 0) {
    throw new Error(`Unknown artwork id(s): ${missing.join(", ")}`);
  }
  return resolved;
}
