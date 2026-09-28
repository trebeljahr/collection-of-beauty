import { resolveScope } from "@/lib/artwork-scope";
import { COLOR_BUCKETS, type ColorBucket } from "@/lib/color-buckets.mjs";
import type { ArtworkListing } from "@/lib/data";

/** Widest and narrowest work a strip will hang. A strip row is as tall
 *  as its width over its summed aspect ratios, so one extreme work sets
 *  the whole row: Monet's willow panoramas (6.5:1, head of the grey
 *  order) would flatten it to a sliver, and a 1:3 Redouté plate stands a
 *  narrow column as tall as the row with little in it. */
export const STRIP_MIN_ASPECT = 0.5;
export const STRIP_MAX_ASPECT = 2;

/** Candidates per family. The widest strip fits about six works at its
 *  target height, more when they are narrow portraits; `stripCount`
 *  decides how many of these each breakpoint shows. */
export const STRIP_LIMIT = 10;

/** The works a family's strip on `/colours` shows: its own order's head,
 *  one work per artist, none already shown under an earlier family.
 *
 *  `ordered` is the family page's sequence, so the first eligible work
 *  here is also the first thing `/colours/<family>` shows. The two filters
 *  are for a strip of six, not for a gallery: without them white is six
 *  Redouté lily plates on blank paper, black is five Rembrandts, and a
 *  work tagged purple and pink opens both rows. */
export function pickColorStrip(
  ordered: readonly ArtworkListing[],
  taken: ReadonlySet<string>,
  limit = STRIP_LIMIT,
): ArtworkListing[] {
  const strip: ArtworkListing[] = [];
  const artists = new Set<string>();
  for (const work of ordered) {
    if (strip.length >= limit) break;
    if (taken.has(work.id)) continue;
    if (!work.width || !work.height || !work.variantWidths?.length) continue;
    const aspect = work.width / work.height;
    if (aspect < STRIP_MIN_ASPECT || aspect > STRIP_MAX_ASPECT) continue;
    // Anonymous works have nothing to repeat, so each counts as its own.
    const artist = work.artist ?? `__unknown__:${work.id}`;
    if (artists.has(artist)) continue;
    artists.add(artist);
    strip.push(work);
  }
  return strip;
}

/** One breakpoint's strip geometry: the strip's width at the viewport it
 *  was measured for, the row height to aim at, and the gap between works,
 *  all in CSS px. */
export type StripFrame = { width: number; height: number; gap: number };

/** How many of `works` a justified strip should show so its row lands
 *  closest to `frame.height`.
 *
 *  The strip is one line of works at a shared height with no cropping, so
 *  the height is whatever the width divided by the summed aspect ratios
 *  comes to: four landscapes make a short row and four portraits a tall
 *  one. The count is the only free variable, and picking it per family
 *  keeps the twelve rows within about one work's share of each other.
 *  Compared on a log scale so 20% too tall and 20% too short weigh the
 *  same. */
export function stripCount(
  works: readonly Pick<ArtworkListing, "width" | "height">[],
  frame: StripFrame,
): number {
  let best = Math.min(1, works.length);
  let bestError = Number.POSITIVE_INFINITY;
  let aspects = 0;
  for (let i = 0; i < works.length; i++) {
    const { width, height } = works[i];
    if (!width || !height) break;
    aspects += width / height;
    const rowHeight = (frame.width - i * frame.gap) / aspects;
    const error = Math.abs(Math.log(rowHeight / frame.height));
    if (error < bestError) {
      best = i + 1;
      bestError = error;
    }
  }
  return best;
}

/** Every family's strip, in ring order. Earlier families pick first, so
 *  a work that heads two families appears under the one the wheel reaches
 *  first. */
export function colorFamilyStrips(
  limit = STRIP_LIMIT,
): { bucket: ColorBucket; works: ArtworkListing[] }[] {
  const taken = new Set<string>();
  return COLOR_BUCKETS.map((bucket) => {
    const works = pickColorStrip(resolveScope({ kind: "color", id: bucket.id }), taken, limit);
    for (const work of works) taken.add(work.id);
    return { bucket, works };
  });
}
