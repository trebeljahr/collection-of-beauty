import { type ArtworkOrderFields, clampLimit, normalizeOrderInput } from "@/lib/artwork-order";
import type { ArtworkPage } from "@/lib/artwork-page-schema";
import type { ArtworkListing } from "@/lib/data";
import type { Scope } from "@/lib/scope-href";
import { scopeOrderFields } from "@/lib/scope-order";
import type { TimelineFilter, TimelineListing, TimelineSummary } from "@/lib/timeline-core";
import type { BrowserEngine } from "./engine";
import { orderKey, STATIC_DATA, STATIC_PAGE_SIZE, timelineKey } from "./keys";

// What the browser asks instead of the per-request API the site had before
// it became a static export. A prebuilt answer is one small file; anything
// else (a search) loads the engine and the catalogue once and computes it
// here, with the ordering code the server used.

class NotPrebuilt extends Error {}

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new NotPrebuilt(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

function engine(): Promise<BrowserEngine> {
  return import("./engine").then((m) => m.loadEngine());
}

/** A prebuilt answer, or the engine's when the key has none (or the
 *  file is missing: a deploy can drop a scope, e.g. a renamed artist). */
async function prebuiltOr<T>(
  url: string | null,
  signal: AbortSignal | undefined,
  compute: (engine: BrowserEngine) => T,
): Promise<T> {
  if (url) {
    try {
      return await json<T>(url, signal);
    } catch (err) {
      if (!(err instanceof NotPrebuilt)) throw err;
    }
  }
  const e = await engine();
  signal?.throwIfAborted();
  return compute(e);
}

function windowOf(list: readonly ArtworkListing[], offset: number, limit: number): ArtworkPage {
  const items = list.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    total: list.length,
    nextOffset: nextOffset < list.length ? nextOffset : null,
    hasMore: nextOffset < list.length,
  };
}

/** One window of an ordering: what `/api/artworks/page` answered. A
 *  window that does not line up with the prebuilt pages of 80 is cut
 *  from the pages it overlaps. */
export async function fetchOrderPage(
  input: ArtworkOrderFields,
  offset: number,
  limit?: number,
  signal?: AbortSignal,
): Promise<ArtworkPage> {
  const start = Math.max(0, Math.trunc(offset));
  const size = clampLimit(limit);
  const key = orderKey(normalizeOrderInput(input));
  if (key) {
    const first = Math.floor(start / STATIC_PAGE_SIZE);
    const last = Math.floor((start + size - 1) / STATIC_PAGE_SIZE);
    try {
      const pages: ArtworkPage[] = [];
      for (let index = first; index <= last; index++) {
        const page = await json<ArtworkPage>(STATIC_DATA.page(key, index), signal);
        pages.push(page);
        if (!page.hasMore) break;
      }
      const total = pages[0]?.total ?? 0;
      const items = pages
        .flatMap((page) => page.items)
        .slice(start - first * STATIC_PAGE_SIZE, start - first * STATIC_PAGE_SIZE + size);
      const nextOffset = start + items.length;
      return {
        items,
        total,
        nextOffset: nextOffset < total ? nextOffset : null,
        hasMore: nextOffset < total,
      };
    } catch (err) {
      // Past the last page there is no file: an empty window, as before.
      if (!(err instanceof NotPrebuilt)) throw err;
      if (first > 0) {
        const head = await json<ArtworkPage>(STATIC_DATA.page(key, 0), signal).catch(() => null);
        if (head) return { items: [], total: head.total, nextOffset: null, hasMore: false };
      }
    }
  }
  const e = await engine();
  signal?.throwIfAborted();
  return windowOf(e.order(input), start, size);
}

/** The ids a scope walks in order: the artwork page's prev/next. */
export async function fetchScopeIds(scope: Scope, signal?: AbortSignal): Promise<string[]> {
  if (scope.kind === "decade") {
    const filter = { query: scope.filter?.q, era: scope.filter?.era };
    const key = timelineKey(filter);
    return prebuiltOr(key && STATIC_DATA.timelineScopeIds(key), signal, (e) =>
      e.timeline(filter).map((a) => a.id),
    );
  }
  const fields = scopeOrderFields(scope);
  const key = orderKey(normalizeOrderInput(fields));
  return prebuiltOr(key && STATIC_DATA.scopeIds(key), signal, (e) =>
    e.order(fields).map((a) => a.id),
  );
}

let catalogue: Promise<ArtworkListing[]> | null = null;

/** The catalogue without blur hashes, as /api/artworks serves it. */
export function fetchCatalogue(): Promise<ArtworkListing[]> {
  catalogue ??= json<ArtworkListing[]>(STATIC_DATA.catalogue);
  catalogue.catch(() => {
    catalogue = null;
  });
  return catalogue;
}

/** A scope's listings in order, for the lightbox: its ids joined to the
 *  catalogue. Without a scope, the whole catalogue. */
export async function fetchScopeListings(scope: Scope | null): Promise<ArtworkListing[]> {
  const all = await fetchCatalogue();
  if (!scope) return all;
  const ids = await fetchScopeIds(scope);
  const byId = new Map(all.map((a) => [a.id, a]));
  return ids.flatMap((id) => {
    const listing = byId.get(id);
    return listing ? [listing] : [];
  });
}

export async function fetchTimelineSummary(
  filter: TimelineFilter,
  signal?: AbortSignal,
): Promise<TimelineSummary> {
  const key = timelineKey(filter);
  return prebuiltOr(key && STATIC_DATA.timelineSummary(key), signal, (e) =>
    e.timelineSummary(filter),
  );
}

export async function fetchTimelineDecade(
  decade: number,
  filter: TimelineFilter,
  signal?: AbortSignal,
): Promise<{ decade: number; items: TimelineListing[] }> {
  const key = timelineKey(filter);
  return prebuiltOr(key && STATIC_DATA.timelineDecade(key, decade), signal, (e) => ({
    decade,
    items: e.timelineDecade(decade, filter),
  }));
}
