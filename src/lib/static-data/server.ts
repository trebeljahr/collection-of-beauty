import { sortByColorStrength } from "@/lib/artwork-colors";
import { normalizeOrderInput } from "@/lib/artwork-order";
import {
  type ArtworkOrderInput,
  getArtworkListingPage,
  orderedArtworkListings,
} from "@/lib/artwork-pagination";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
import { artists, artworkListings } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { PLATE_SETS, plateSetListings } from "@/lib/plate-sets";
import { getTimelineSummary, timelineListings } from "@/lib/timeline";
import { GALLERY_SORTS, orderKey, STATIC_PAGE_SIZE, type StaticOrders, timelineKey } from "./keys";

// What the export prebuilds. Every ordering a page of the site requests
// without a search, keyed as keys.ts names it.

type PrebuiltOrder = { key: string; input: ArtworkOrderInput };

let cachedOrders: PrebuiltOrder[] | null = null;

export function prebuiltOrders(): PrebuiltOrder[] {
  if (cachedOrders) return cachedOrders;
  const inputs: ArtworkOrderInput[] = [];
  for (const sort of GALLERY_SORTS) {
    inputs.push({ sort });
    for (const era of ERAS) inputs.push({ sort, era: era.id });
  }
  for (const artist of artists) inputs.push({ artistSlug: artist.slug, sort: "year" });
  for (const set of PLATE_SETS) inputs.push({ collection: set.id, sort: "plate" });
  for (const bucket of COLOR_BUCKETS) inputs.push({ color: bucket.id, sort: "color" });

  const seen = new Map<string, PrebuiltOrder>();
  for (const input of inputs) {
    const key = orderKey(normalizeOrderInput(input));
    if (!key) throw new Error(`static-data: no key for prebuilt order ${JSON.stringify(input)}`);
    if (seen.has(key)) throw new Error(`static-data: two prebuilt orders share the key ${key}`);
    seen.set(key, { key, input });
  }
  cachedOrders = [...seen.values()];
  return cachedOrders;
}

export function prebuiltOrder(key: string): PrebuiltOrder | null {
  return prebuiltOrders().find((order) => order.key === key) ?? null;
}

/** Page files of one ordering: at least one, so an empty scope still
 *  answers with `total: 0` instead of a 404. */
export function pageCount(input: ArtworkOrderInput): number {
  return Math.max(1, Math.ceil(orderedArtworkListings(input).length / STATIC_PAGE_SIZE));
}

export function staticPage(input: ArtworkOrderInput, index: number) {
  return getArtworkListingPage({
    ...input,
    offset: index * STATIC_PAGE_SIZE,
    limit: STATIC_PAGE_SIZE,
  });
}

export function staticOrders(): StaticOrders {
  const plates: StaticOrders["plates"] = {};
  for (const set of PLATE_SETS) plates[set.id] = plateSetListings(set.id).map((a) => a.id);
  const colours: StaticOrders["colours"] = {};
  for (const bucket of COLOR_BUCKETS) {
    const members = artworkListings.filter((a) => a.colorBuckets?.includes(bucket.id));
    colours[bucket.id] = sortByColorStrength(members, bucket.id).map((a) => a.id);
  }
  return { plates, colours };
}

/** The timeline's prebuilt filters: none, and each era. */
export function prebuiltTimelines(): Array<{ key: string; era: string | null }> {
  return [
    { key: "all", era: null },
    ...ERAS.map((era) => ({ key: `era-${era.id}`, era: era.id })),
  ].map((t) => {
    if (timelineKey({ era: t.era }) !== t.key)
      throw new Error(`static-data: timeline key ${t.key}`);
    return t;
  });
}

export function prebuiltTimeline(key: string) {
  return prebuiltTimelines().find((t) => t.key === key) ?? null;
}

export function timelineDecades(era: string | null): number[] {
  return getTimelineSummary({ era }).decades.map((d) => d.decade);
}

export { timelineListings };
