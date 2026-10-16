// Which works an era hangs, and how they are dealt into its rooms.
// Pure functions over the catalogue listing, shared by the floor plan
// (layout-block.ts) and its tests.

import type { ArtworkListing } from "@/lib/data";
import { assignEra, ERAS, type Era, type EraId } from "@/lib/gallery-eras";
import { wallFootprint } from "./place-paintings";
import { sharpEnoughToHang } from "./sharpness";

// --- Era bucketing --------------------------------------------------------

export function bucketByEra(all: ArtworkListing[]): Map<EraId, ArtworkListing[]> {
  const m = new Map<EraId, ArtworkListing[]>();
  for (const era of ERAS) m.set(era.id, []);

  // No folder or dimension filter. Extreme real-world sizes are handled
  // at placement time (tiny engravings get a minimum display size,
  // oversized frescoes are scaled to fit their wall slot). The one
  // filter is sharpness: a work whose scan is too small for the size it
  // would hang at stays off the walls (see sharpness.ts). Era
  // assignment routes by movement first, then year; works with neither
  // get a second chance below.
  const unresolved: ArtworkListing[] = [];
  const erasByArtist = new Map<string, Map<EraId, number>>();
  for (const a of all) {
    if (!a.objectKey) continue;
    const era = assignEra(a);
    if (!era) {
      unresolved.push(a);
      continue;
    }
    // A blurred work still counts toward its artist's era, so an
    // undated sibling finds the right floor.
    if (sharpEnoughToHang(a)) m.get(era)!.push(a);
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
    if (bestEra && sharpEnoughToHang(a)) m.get(bestEra)!.push(a);
  }

  return m;
}

// --- Floor sampling -------------------------------------------------------

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
export function selectFloorWorks(
  artworks: ArtworkListing[],
  cap: number,
  /** When given, an artist's share goes to their highest-ranked works.
   *  Without it the share is an even stride through their works. */
  rank?: (artwork: ArtworkListing) => number,
): ArtworkListing[] {
  if (artworks.length <= cap) return artworks;

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
  let remaining = cap;
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
    if (rank) {
      const best = [...works].sort((x, y) => rank(y) - rank(x) || x.id.localeCompare(y.id));
      for (let i = 0; i < take; i++) keep.add(best[i].id);
      continue;
    }
    for (let i = 0; i < take; i++) keep.add(works[Math.floor((i * works.length) / take)].id);
  }

  return artworks.filter((a) => keep.has(a.id));
}

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
 *
 * A room stops at the work that brings the floor nearest to what its
 * rooms so far are owed. Stopping each room short of its own share left
 * the difference to the last one: on the Baroque floor its works
 * covered 0.71 of the wall and 0.39 in the room that mirrors it.
 */
export function fillRooms(
  walls: number[],
  queue: Array<{ name: string; artworks: ArtworkListing[] }>,
  era: Era,
): Array<{ name: string; artworks: ArtworkListing[] }> {
  const totalWall = walls.reduce((a, b) => a + b, 0);
  const totalFootprint = queue.reduce(
    (sum, entry) => sum + entry.artworks.reduce((s, a) => s + wallFootprint(a), 0),
    0,
  );
  const density = totalWall > 0 ? totalFootprint / totalWall : 0;

  const out: Array<{ name: string; artworks: ArtworkListing[] }> = [];
  let qi = 0;
  /** Metres dealt to the rooms before this one, and owed to them and
   *  this one. */
  let dealt = 0;
  let owed = 0;

  for (let i = 0; i < walls.length; i++) {
    const isLast = i === walls.length - 1;
    owed += walls[i] * density;
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
      // Stop once the rooms so far have their share, to the nearest
      // work — unless this is the last room, which absorbs the
      // remainder, or is still empty (a single work never gets stranded
      // for want of a few centimetres).
      if (!isLast && used > 0 && dealt + used + need / 2 > owed) break;
      entry.artworks.shift();
      taken.push(work);
      contributed.set(entry.name, (contributed.get(entry.name) ?? 0) + 1);
      used += need;
    }

    dealt += used;
    const name = [...contributed.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? era.title;
    out.push({ name, artworks: taken });
  }

  return out;
}

/** The movement most of a room's works belong to, once the placer has
 *  finished moving spill around. Used for the room's sign, so it always
 *  agrees with what is actually on the walls. */
export function dominantMovement(artworks: ArtworkListing[], era: Era): string | null {
  if (artworks.length === 0) return null;
  const counts = new Map<string, number>();
  for (const a of artworks) {
    const mv = a.movement?.trim() ? a.movement : era.title;
    counts.set(mv, (counts.get(mv) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// --- Helpers --------------------------------------------------------------

export function shuffleByIdHash<T extends { id: string }>(items: T[]): T[] {
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
