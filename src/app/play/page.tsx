import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { SlideshowView } from "@/components/slideshow/slideshow-view";
import { parseScopeParams, resolveScope, scopeHref, scopeLabel } from "@/lib/artwork-scope";
import {
  isPlayableScope,
  type PlayableScope,
  pageStartFor,
  parseStartParam,
  resolveStartIndex,
  SLIDESHOW_PAGE_SIZE,
  slideshowHeading,
} from "@/lib/slideshow";

// Reads `?from=` and `?start=`, so it cannot be prerendered (same note as
// /surprise).
export const dynamic = "force-dynamic";

// Route-scoped, like src/app/artwork/layout.tsx and /surprise: the
// slideshow's chrome insets itself with `env(safe-area-inset-*)`, which is
// 0px unless the document opts into `viewport-fit=cover`. On iPhone, where
// Safari has no element fullscreen, the fixed overlay *is* the fullscreen,
// so its Exit button and toolbar must clear the notch and home indicator.
// Next merges viewport exports field by field, so the root layout's width
// and initialScale survive. The black themeColor replaces the root's
// light/dark pair on this route only, so the browser chrome around the
// overlay matches it.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

// One URL per scope and per resume point: nothing worth indexing, and the
// works themselves are indexed at /artwork/[id]. Not in the sitemap.
const ROBOTS = { index: false, follow: false } as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** First value of each param, as URLSearchParams. */
function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}

/** The scope to play. A bare `/play` is the whole gallery (a short URL to
 *  type on a TV), and filter params without `from` are ignored. A `from`
 *  that is present but invalid is null rather than the gallery, so a typo
 *  in an era id never plays the whole catalogue. */
function readScope(params: URLSearchParams): PlayableScope | null {
  if (!params.has("from")) return { kind: "gallery" };
  const scope = parseScopeParams(params);
  return scope && isPlayableScope(scope) ? scope : null;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const scope = readScope(toParams(await searchParams));
  if (!scope) return { title: "Slideshow", robots: ROBOTS };
  return {
    title: `Slideshow · ${slideshowHeading(scope, scopeLabel(scope))}`,
    robots: ROBOTS,
  };
}

export default async function PlayPage({ searchParams }: { searchParams: SearchParams }) {
  const params = toParams(await searchParams);
  const scope = readScope(params);
  if (!scope) notFound();

  // Cached by orderedArtworkListings, so this is a lookup after the
  // scope's own page has rendered once.
  const list = resolveScope(scope);
  if (list.length === 0) notFound();

  const startIndex = resolveStartIndex(list, parseStartParam(params.get("start")));
  // Aligned to the client deck's pages, so the first page the client
  // fetches is a CDN-cached URL rather than a one-off window.
  const windowStart = pageStartFor(startIndex);
  const initial = list.slice(windowStart, windowStart + SLIDESHOW_PAGE_SIZE);

  return (
    <SlideshowView
      scope={scope}
      heading={slideshowHeading(scope, scopeLabel(scope))}
      exitHref={scopeHref(scope)}
      total={list.length}
      startIndex={startIndex}
      windowStart={windowStart}
      initial={initial}
    />
  );
}
