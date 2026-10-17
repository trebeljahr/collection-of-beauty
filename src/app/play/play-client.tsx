"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SlideshowView, type SlideshowViewProps } from "@/components/slideshow/slideshow-view";
import { getColorBucket } from "@/lib/color-buckets.mjs";
import { getEra } from "@/lib/gallery-eras";
import { parseScopeParams, type Scope, scopeHref } from "@/lib/scope-href";
import {
  isPlayableScope,
  type PlayableScope,
  pageStartFor,
  parseStartParam,
  SLIDESHOW_PAGE_SIZE,
  scopePageQuery,
  slideshowHeading,
} from "@/lib/slideshow";
import { fetchScopeIds } from "@/lib/static-data/client";
import { fetchArtworkPage } from "@/lib/use-artwork-pagination";

export type ScopeLabels = {
  artists: Record<string, string>;
  collections: Record<string, string>;
};

/** The scope to play. A bare `/play` is the whole gallery (a short URL to
 *  type on a TV), and filter params without `from` are ignored. A `from`
 *  that is present but invalid is null rather than the gallery, so a typo
 *  in an era id never plays the whole catalogue. */
function readScope(params: URLSearchParams): PlayableScope | null {
  if (!params.has("from")) return { kind: "gallery" };
  const scope = parseScopeParams(params);
  return scope && isPlayableScope(scope) ? scope : null;
}

/** `scopeLabel` from artwork-scope.ts, from names the page hands in. */
function labelOf(scope: Scope, labels: ScopeLabels): string {
  if (scope.kind === "gallery") return "gallery";
  if (scope.kind === "artist") return labels.artists[scope.slug] ?? scope.slug;
  if (scope.kind === "decade") return `${scope.start}s`;
  if (scope.kind === "collection") return labels.collections[scope.id] ?? scope.id;
  if (scope.kind === "color") return getColorBucket(scope.id).label.toLowerCase();
  return getEra(scope.id).title;
}

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; props: SlideshowViewProps };

/**
 * `/play?from=…&start=…` as a static page: the query is read here, the
 * scope's order and the window around the start come from the export's
 * prebuilt files (or, for a search, the browser engine), and only then
 * does the show mount.
 */
export function PlayClient({ labels }: { labels: ScopeLabels }) {
  const params = useSearchParams();
  const search = params.toString();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const query = new URLSearchParams(search);
    const scope = readScope(query);
    if (!scope) {
      setState({ status: "missing" });
      return;
    }
    const controller = new AbortController();
    (async () => {
      const ids = await fetchScopeIds(scope, controller.signal);
      if (ids.length === 0) return setState({ status: "missing" });
      const startId = parseStartParam(query.get("start"));
      const found = startId ? ids.indexOf(startId) : -1;
      const startIndex = found < 0 ? 0 : found;
      // Aligned to the client deck's pages, so the first page the deck
      // fetches is the same file.
      const windowStart = pageStartFor(startIndex);
      const page = await fetchArtworkPage(
        scopePageQuery(scope),
        windowStart,
        SLIDESHOW_PAGE_SIZE,
        controller.signal,
      );
      const heading = slideshowHeading(scope, labelOf(scope, labels));
      document.title = `Slideshow · ${heading} · Collection of Beauty`;
      setState({
        status: "ready",
        props: {
          scope,
          heading,
          exitHref: scopeHref(scope),
          total: ids.length,
          startIndex,
          windowStart,
          initial: page.items,
        },
      });
    })().catch(() => {
      if (!controller.signal.aborted) setState({ status: "missing" });
    });
    return () => controller.abort();
  }, [search, labels]);

  if (state.status === "ready") return <SlideshowView key={search} {...state.props} />;
  if (state.status === "missing") {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="font-serif text-3xl">Nothing to play</h1>
        <p className="mt-4 text-[var(--muted-foreground)]">
          This slideshow link names no works in the collection.
        </p>
        <p className="mt-8 text-sm">
          <Link href="/play" className="underline underline-offset-2 hover:opacity-70">
            Play the whole gallery
          </Link>
        </p>
      </div>
    );
  }
  return <div className="min-h-[60svh] bg-black" aria-busy="true" />;
}
