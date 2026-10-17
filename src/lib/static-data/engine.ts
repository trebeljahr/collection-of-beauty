import {
  type ArtworkOrderFields,
  computeOrder,
  normalizeOrderInput,
  type OrderCorpus,
} from "@/lib/artwork-order";
import type { ColorBucketId } from "@/lib/color-buckets.mjs";
import type { ArtworkListing } from "@/lib/data";
import {
  datedOf,
  decadeWorksOf,
  filterDated,
  summaryOf,
  type TimelineFilter,
  type TimelineListing,
  type TimelineSummary,
} from "@/lib/timeline-core";
import { STATIC_DATA, type StaticOrders } from "./keys";

// The ordering code in the browser, for what the export did not prebuild:
// a search above all. Loaded on demand (client.ts imports it dynamically)
// with the whole catalogue, ~480 KB gzipped, the file the 3D museum loads.

export type BrowserEngine = {
  order(input: ArtworkOrderFields): ArtworkListing[];
  timeline(filter: TimelineFilter): ArtworkListing[];
  timelineSummary(filter: TimelineFilter): TimelineSummary;
  timelineDecade(decade: number, filter: TimelineFilter): TimelineListing[];
};

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function engineFor(listings: ArtworkListing[], orders: StaticOrders): BrowserEngine {
  const byId = new Map(listings.map((a) => [a.id, a]));
  const pick = (ids: readonly string[] | undefined) =>
    (ids ?? []).flatMap((id) => {
      const listing = byId.get(id);
      return listing ? [listing] : [];
    });
  const plateCache = new Map<string, ArtworkListing[]>();
  const rankCache = new Map<string, Map<string, number>>();

  const corpus: OrderCorpus = {
    listings,
    plateSet(id) {
      let plates = plateCache.get(id);
      if (!plates) {
        plates = pick(orders.plates[id]);
        plateCache.set(id, plates);
      }
      return plates;
    },
    // The precomputed strongest-first order, as ranks. A comparator sort
    // keeps its order on any subset, so a filtered list sorts the same as
    // the server's `sortByColorStrength` would; works without a rank (no
    // strength in that family) go last by id, as there.
    byColorStrength(list, family: ColorBucketId) {
      let rank = rankCache.get(family);
      if (!rank) {
        rank = new Map((orders.colours[family] ?? []).map((id, i) => [id, i]));
        rankCache.set(family, rank);
      }
      const r = rank;
      return [...list].sort(
        (a, b) =>
          (r.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (r.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
          a.id.localeCompare(b.id),
      );
    },
  };

  const orderCache = new Map<string, ArtworkListing[]>();
  const dated = datedOf(listings);

  return {
    order(input) {
      const normalized = normalizeOrderInput(input);
      const key = JSON.stringify(normalized);
      let ordered = orderCache.get(key);
      if (!ordered) {
        ordered = computeOrder(normalized, corpus);
        orderCache.set(key, ordered);
        if (orderCache.size > 16) orderCache.delete(orderCache.keys().next().value as string);
      }
      return ordered;
    },
    timeline: (filter) => filterDated(dated, filter),
    timelineSummary: (filter) => summaryOf(filterDated(dated, filter)),
    timelineDecade: (decade, filter) => decadeWorksOf(filterDated(dated, filter), decade),
  };
}

let pending: Promise<BrowserEngine> | null = null;

export function loadEngine(): Promise<BrowserEngine> {
  pending ??= Promise.all([
    json<ArtworkListing[]>(STATIC_DATA.museum),
    json<StaticOrders>(STATIC_DATA.orders),
  ]).then(([listings, orders]) => engineFor(listings, orders));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
