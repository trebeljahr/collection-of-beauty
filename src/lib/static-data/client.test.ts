import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { resolveScope } from "@/lib/artwork-scope";
import { artworkListings } from "@/lib/data";
import { getTimelineDecadeWorks, getTimelineSummary } from "@/lib/timeline";
import { fetchOrderPage, fetchScopeIds, fetchTimelineDecade, fetchTimelineSummary } from "./client";
import { STATIC_DATA } from "./keys";
import { prebuiltOrder, staticOrders, staticPage } from "./server";

// The browser's fetchers against a stub of the export: every prebuilt file
// answers what src/app/data/** would have written, anything else 404s.
// Requests are recorded, so a test can tell a prebuilt answer from the
// engine's.

let requested: string[] = [];

function serve(url: string): Response {
  const path = new URL(url, "https://site.test").pathname;
  requested.push(path);
  const page = /^\/data\/pages\/([^/]+)\/(\d+)\.json$/.exec(path);
  if (page) {
    const order = prebuiltOrder(page[1]);
    if (!order) return new Response("{}", { status: 404 });
    const body = staticPage(order.input, Number(page[2]));
    if (body.items.length === 0 && Number(page[2]) > 0) return new Response("{}", { status: 404 });
    return Response.json(body);
  }
  // No scope files: fetchScopeIds must fall back to the engine.
  if (path === STATIC_DATA.museum) return Response.json(artworkListings);
  if (path === STATIC_DATA.orders) return Response.json(staticOrders());
  if (path === STATIC_DATA.timelineSummary("all")) return Response.json(getTimelineSummary());
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => serve(String(input))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOrderPage", () => {
  it("cuts a window that straddles two prebuilt pages", async () => {
    const page = await fetchOrderPage({ sort: "year" }, 60, 40);
    const expected = getArtworkListingPage({ sort: "year", offset: 60, limit: 40 });
    expect(page.items.map((a) => a.id)).toEqual(expected.items.map((a) => a.id));
    expect(page.total).toBe(expected.total);
    expect(page.nextOffset).toBe(expected.nextOffset);
    expect(requested).toEqual(["/data/pages/year/0.json", "/data/pages/year/1.json"]);
  });

  it("answers past the end with an empty window, not the engine", async () => {
    const total = getArtworkListingPage({ artistSlug: "claude-monet", sort: "year" }).total;
    const page = await fetchOrderPage(
      { artistSlug: "claude-monet", sort: "year" },
      total + 200,
      80,
    );
    expect(page).toMatchObject({ items: [], total, hasMore: false, nextOffset: null });
    expect(requested).not.toContain(STATIC_DATA.museum);
  });

  it("orders a search in the browser exactly as the server did", async () => {
    const page = await fetchOrderPage({ query: "monet", sort: "shuffle" }, 0, 80);
    const expected = getArtworkListingPage({ query: "monet", sort: "shuffle", limit: 80 });
    expect(page.items.map((a) => a.id)).toEqual(expected.items.map((a) => a.id));
    expect(page.total).toBe(expected.total);
    expect(requested).toEqual([STATIC_DATA.museum, STATIC_DATA.orders]);
  });
});

describe("fetchScopeIds", () => {
  it("falls back to the engine when a scope file is missing", async () => {
    const scope = { kind: "color", id: "teal" } as const;
    const ids = await fetchScopeIds(scope);
    expect(ids).toEqual(resolveScope(scope).map((a) => a.id));
  });
});

describe("timeline", () => {
  it("reads the unfiltered summary from its file", async () => {
    expect(await fetchTimelineSummary({})).toEqual(getTimelineSummary());
    expect(requested).toEqual([STATIC_DATA.timelineSummary("all")]);
  });

  it("filters a search in the browser", async () => {
    const filter = { query: "rain", era: "ukiyo-e" };
    const summary = await fetchTimelineSummary(filter);
    expect(summary).toEqual(getTimelineSummary(filter));
    const decade = summary.decades[0].decade;
    const works = await fetchTimelineDecade(decade, filter);
    expect(works.items).toEqual(getTimelineDecadeWorks(decade, filter));
  });
});
