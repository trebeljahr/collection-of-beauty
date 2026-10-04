"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArtworkGallery } from "@/components/artwork-gallery";
import { PlayLink } from "@/components/play-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_SHUFFLE_SEED,
} from "@/lib/artwork-page-schema";
import type { ArtworkListing } from "@/lib/data";
import { registerReleaseSnapshot } from "@/lib/release-session";
import { cleanFilter, filterSearch, parseFilterParams, type Scope } from "@/lib/scope-href";
import {
  type ArtworkPageInfo,
  type ArtworkPageQuery,
  fetchArtworkPage,
  useArtworkPagination,
} from "@/lib/use-artwork-pagination";

type EraOption = { id: string; title: string };

type Props = {
  initialArtworks: ArtworkListing[];
  eras: EraOption[];
  totalArtworks: number;
};

type PageStatus = "idle" | "loading" | "failed";

type GallerySort = Extract<ArtworkSort, "shuffle" | "year" | "artist">;

type Controls = { query: string; era: string; sort: GallerySort };

const PAGE_SIZE = DEFAULT_ARTWORK_PAGE_SIZE;

const SORT_OPTIONS: SelectOption[] = [
  { value: "shuffle", label: "Sort: shuffled" },
  { value: "year", label: "Sort: chronological" },
  { value: "artist", label: "Sort: artist" },
];

const DEFAULT_CONTROLS: Controls = { query: "", era: "", sort: "shuffle" };

/** The search, era and sort the current URL asks for. The controls live
 *  in the URL (`/?q=dürer&era=baroque&sort=year`) so that "Back" from an
 *  artwork page, and a reload, reopen the same selection. */
function controlsFromUrl(): Controls {
  const filter = parseFilterParams(new URLSearchParams(window.location.search));
  return { query: filter?.q ?? "", era: filter?.era ?? "", sort: filter?.sort ?? "shuffle" };
}

function pageQueryOf(controls: Controls): ArtworkPageQuery {
  return {
    q: controls.query.trim(),
    era: controls.era,
    sort: controls.sort,
    seed: DEFAULT_SHUFFLE_SEED,
  };
}

const DEFAULT_PAGE_KEY = JSON.stringify(pageQueryOf(DEFAULT_CONTROLS));

/** The last filtered result set, with every page loaded so far. Module
 *  scope so it outlives the page: going back from an artwork remounts
 *  this component, and without the cache it would refetch, show
 *  "Loading works…" and lose the tile the back animation is looking for. */
let lastFiltered: { key: string; items: ArtworkListing[]; pageInfo: ArtworkPageInfo } | null = null;

const subscribeNothing = () => () => {};

export function GalleryBrowser({ initialArtworks, eras, totalArtworks }: Props) {
  // False while hydrating the server HTML, true when a client navigation
  // mounts the page (Back from an artwork). Only then may the first
  // render read the URL: the server rendered the unfiltered grid, and a
  // hydrating render has to match it. The hydrating case catches up in
  // the URL effect below.
  const clientMount = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [initialControls] = useState(() => (clientMount ? controlsFromUrl() : DEFAULT_CONTROLS));
  const [query, setQuery] = useState(initialControls.query);
  const deferredQuery = useDeferredValue(query);
  const [era, setEra] = useState<string>(initialControls.era);
  const [sortBy, setSortBy] = useState<GallerySort>(initialControls.sort);
  const requestSeqRef = useRef(0);
  const liveControls = useRef({ query, era, sort: sortBy });
  liveControls.current = { query, era, sort: sortBy };
  useEffect(() => {
    const route = window.location.pathname;
    return registerReleaseSnapshot("gallery-url", () => {
      if (window.location.pathname !== route) return undefined;
      const controls = liveControls.current;
      const search = filterSearch(
        cleanFilter({ q: controls.query, era: controls.era, sort: controls.sort }),
      );
      window.history.replaceState(
        window.history.state,
        "",
        `${route}${search ? `?${search}` : ""}${window.location.hash}`,
      );
      return undefined;
    });
  }, []);

  const pageQuery = useMemo<ArtworkPageQuery>(
    () => pageQueryOf({ query: deferredQuery, era, sort: sortBy }),
    [deferredQuery, era, sortBy],
  );

  const pageKey = useMemo(() => JSON.stringify(pageQuery), [pageQuery]);
  const isDefaultPage = pageKey === DEFAULT_PAGE_KEY;

  const initialPageInfo = useMemo<ArtworkPageInfo>(
    () => ({
      total: totalArtworks,
      nextOffset: initialArtworks.length < totalArtworks ? initialArtworks.length : null,
      hasMore: initialArtworks.length < totalArtworks,
    }),
    [initialArtworks, totalArtworks],
  );

  // What the grid starts on: the cached selection when this mount asks
  // for the one the visitor left, otherwise the server's first page.
  const [seed] = useState(() =>
    lastFiltered?.key === pageKey
      ? { ...lastFiltered, query: pageQuery }
      : {
          key: DEFAULT_PAGE_KEY,
          items: initialArtworks,
          pageInfo: initialPageInfo,
          query: pageQueryOf(DEFAULT_CONTROLS),
        },
  );
  // The query the loaded items belong to. Trails `pageQuery` while a
  // fetch is in flight, and is what the tiles' links carry, so a tile
  // never promises a walk through a selection it isn't part of.
  const [applied, setApplied] = useState(() => ({ key: seed.key, query: seed.query }));
  const [pageStatus, setPageStatus] = useState<PageStatus>(() =>
    seed.key === pageKey ? "idle" : "loading",
  );

  const fetchPage = useCallback(
    (offset: number, signal: AbortSignal) => fetchArtworkPage(pageQuery, offset, PAGE_SIZE, signal),
    [pageQuery],
  );

  const { loadedArtworks, pageInfo, loadMoreArtworks, replacePage, generation } =
    useArtworkPagination({
      initialArtworks: seed.items,
      initialPageInfo: seed.pageInfo,
      fetchPage,
    });

  // Re-seed on filter / sort / query change. Default page snaps back
  // to the SSR-pinned initialArtworks; any other params re-fetch page
  // 0 with the new shape and replace atomically (dedup set, in-flight
  // controller, and loading flag reset inside replacePage).
  useEffect(() => {
    if (pageKey === applied.key) {
      setPageStatus("idle");
      return;
    }
    if (isDefaultPage) {
      requestSeqRef.current += 1;
      startTransition(() => {
        replacePage({ items: initialArtworks, pageInfo: initialPageInfo });
        setApplied({ key: pageKey, query: pageQuery });
        setPageStatus("idle");
      });
      return;
    }
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const controller = new AbortController();
    setPageStatus("loading");
    fetchArtworkPage(pageQuery, 0, PAGE_SIZE, controller.signal)
      .then((page) => {
        if (requestSeqRef.current !== requestId) return;
        // One commit for items, generation, applied query and status.
        // Leaving "loading" ahead of the items would mount the grid on
        // the previous set.
        startTransition(() => {
          replacePage({
            items: page.items,
            pageInfo: { total: page.total, nextOffset: page.nextOffset, hasMore: page.hasMore },
          });
          setApplied({ key: pageKey, query: pageQuery });
          setPageStatus("idle");
        });
      })
      .catch(() => {
        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;
        setPageStatus("failed");
      });
    return () => controller.abort();
  }, [
    applied.key,
    isDefaultPage,
    pageKey,
    pageQuery,
    initialArtworks,
    initialPageInfo,
    replacePage,
  ]);

  // Keep the restore cache on the latest filtered selection, load-more
  // pages included.
  useEffect(() => {
    if (applied.key === DEFAULT_PAGE_KEY) return;
    lastFiltered = { key: applied.key, items: loadedArtworks, pageInfo };
  }, [applied.key, loadedArtworks, pageInfo]);

  // Mirror the controls into the URL with replaceState, so they neither
  // stack up history entries nor refetch the page. The first run reads
  // the URL instead when a hydrating render started on the defaults.
  const readUrlRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: pageKey is the identity of the controls; the rest is read fresh on purpose.
  useEffect(() => {
    if (!readUrlRef.current) {
      readUrlRef.current = true;
      const fromUrl = controlsFromUrl();
      if (JSON.stringify(pageQueryOf(fromUrl)) !== pageKey) {
        setQuery(fromUrl.query);
        setEra(fromUrl.era);
        setSortBy(fromUrl.sort);
        return;
      }
    }
    // The deferred query still lags the box: writing now would drop the
    // search from the URL for a frame. pageKey changes once it catches up.
    if (deferredQuery !== query) return;
    const search = filterSearch(
      cleanFilter({ q: pageQuery.q, era: pageQuery.era, sort: pageQuery.sort }),
    );
    const { pathname, hash } = window.location;
    const next = `${pathname}${search ? `?${search}` : ""}${hash}`;
    if (next !== `${pathname}${window.location.search}${hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [pageKey]);

  // Every tile links into a walk over exactly this selection, in this
  // order: the artwork page reads the filter back off its URL.
  const scope = useMemo<Scope>(() => {
    const filter = cleanFilter({
      q: applied.query.q,
      era: applied.query.era,
      sort: applied.query.sort,
    });
    return filter ? { kind: "gallery", filter } : { kind: "gallery" };
  }, [applied.query]);

  const eraOptions = useMemo(
    () => [{ value: "", label: "All eras" }, ...eras.map((e) => ({ value: e.id, label: e.title }))],
    [eras],
  );

  const activeFilterCount = era ? 1 : 0;

  function clearFilters() {
    setEra("");
    setQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <Input
          type="search"
          aria-label="Search artworks by title, artist, or movement"
          placeholder="Search by title, artist, movement..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          /*
           * text-base (16px) below `sm` is load-bearing, not cosmetic: iOS
           * Safari zooms the whole page in whenever a focused form control
           * has a font smaller than 16px, and the user then has to pinch
           * back out. h-11 is the 44px touch-target floor. Desktop keeps the
           * denser h-9 / text-sm the Input component ships by default.
           */
          className="h-11 w-full text-base sm:h-9 sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Filter by era"
            value={era}
            onChange={setEra}
            options={eraOptions}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            listClassName="sm:min-w-72"
          />
          <Select
            aria-label="Sort artworks by"
            value={sortBy}
            onChange={(value) => setSortBy(value as GallerySort)}
            options={SORT_OPTIONS}
            align="end"
            className="min-w-0 flex-1 sm:w-52 sm:flex-none"
          />
          {(activeFilterCount > 0 || query) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              /* size="sm" is a 32px box — below the 44px touch floor on phones. */
              className="h-11 px-4 text-base sm:h-8 sm:px-3 sm:text-xs"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-1 text-sm text-[var(--muted-foreground)]">
        <span>
          {pageInfo.total.toLocaleString()} work
          {pageInfo.total === 1 ? "" : "s"}
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {activeFilterCount} filter
              {activeFilterCount === 1 ? "" : "s"}
            </Badge>
          )}
        </span>
        {/* Plays exactly the selection the tiles below link into. */}
        {pageInfo.total > 0 && <PlayLink scope={scope} />}
      </div>

      {pageStatus === "loading" ? (
        <div className="py-16 text-center text-[var(--muted-foreground)]">Loading works...</div>
      ) : (
        <ArtworkGallery
          // The key belongs on the component, not on anything it renders:
          // the gallery's own displayed / serverExhausted / measured-width
          // state has to be thrown away when the underlying set changes.
          // It is the generation, not pageKey: pageKey flips as soon as the
          // sort select changes, while the items arrive in a later
          // transition. Keyed on pageKey, the grid remounted on the old
          // items and kept them, so "chronological" showed the shuffle and
          // switching back to "shuffled" showed the chronological order.
          key={generation}
          artworks={loadedArtworks}
          loadMoreArtworks={loadMoreArtworks}
          hasMoreArtworks={pageInfo.hasMore}
          initialSeed={Math.min(PAGE_SIZE, loadedArtworks.length)}
          scope={scope}
        />
      )}
    </div>
  );
}
