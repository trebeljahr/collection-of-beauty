"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useArtworkTooltip } from "@/components/artwork-tooltip";
import { ResponsiveImage } from "@/components/responsive-image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { artworkHref } from "@/lib/scope-href";
import type { TimelineDecade, TimelineListing, TimelineSummary } from "@/lib/timeline";
import { useArtworkBackFlip } from "@/lib/use-artwork-back-flip";
import { useTransitionNav } from "@/lib/use-transition-nav";
import { artworkHeroVtName } from "@/lib/view-transitions";

type Props = {
  /** Unfiltered histogram, precomputed on the server. The page ships
   *  these ~62 counts instead of the ~4,300 dated records it used to —
   *  the works for a decade arrive from /api/timeline/works when that
   *  section comes into view. */
  initialDecades: TimelineDecade[];
  initialTotal: number;
  movements: string[];
};

const GRID_CLASSES = "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";

/** How far outside the viewport a decade section starts loading. One
 *  screen of lead time on a phone is enough to have tiles decoded by
 *  the time the section is scrolled to. */
const PREFETCH_MARGIN_PX = 800;
const PREFETCH_ROOT_MARGIN = `${PREFETCH_MARGIN_PX}px 0px`;

/** Vertical distance from the viewport that still counts as "near" when
 *  the back-flip asks us to expand. Bounds how much the merge-back
 *  animation may pull in while hunting for its target tile. */
const NEAR_VIEWPORT_PX = 1500;

/** Density bars are square-rooted, not linear. Dated works pile up in
 *  the 19th century, so against a raw `count / max` scale 45 of the ~62
 *  decades render under 1px tall — a chart that says "one decade
 *  happened". sqrt is the standard compression for long-tailed count
 *  data: it keeps the bars proportional to something readable (a bar's
 *  *area*-like reading rather than its raw count) without a log scale's
 *  arbitrary zero handling, and it lifts a 5-work decade to ~7% of the
 *  peak instead of 0.6%. The remaining floor is CSS (`min-h-[3px]` on
 *  the bar) so a decade with any works at all is never invisible. */
function barHeightPercent(count: number, max: number): number {
  return Math.sqrt(count / max) * 100;
}

type FilterState = { query: string; movement: string };

function filterKeyOf(filter: FilterState): string {
  return `${filter.query}\u0000${filter.movement}`;
}

export function TimelineView({ initialDecades, initialTotal, movements }: Props) {
  const [queryInput, setQueryInput] = useState("");
  const query = useDeferredValue(queryInput).trim();
  const [movement, setMovement] = useState("");

  const filter = useMemo<FilterState>(() => ({ query, movement }), [query, movement]);
  const filterKey = filterKeyOf(filter);
  const isUnfiltered = query === "" && movement === "";

  const [summary, setSummary] = useState<TimelineSummary>({
    decades: initialDecades,
    total: initialTotal,
  });
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "loading" | "failed">("idle");
  // decade -> works, only for decades fetched under the *current* filter.
  const [works, setWorks] = useState<Record<number, TimelineListing[]>>({});

  // `?movement=Impressionism` is what scopeHref() builds when the
  // artwork detail page links back to a movement. Read once on mount
  // rather than through the server's searchParams, which would opt the
  // whole page out of static rendering.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("movement");
    if (wanted) setMovement(wanted);
  }, []);

  // Histogram follows the filters. The unfiltered shape is already in
  // props, so the common case costs no request.
  useEffect(() => {
    if (isUnfiltered) {
      setSummary({ decades: initialDecades, total: initialTotal });
      setSummaryStatus("idle");
      return;
    }
    const controller = new AbortController();
    setSummaryStatus("loading");
    fetchDecades(filter, controller.signal)
      .then((next) => {
        setSummary(next);
        setSummaryStatus("idle");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSummaryStatus("failed");
      });
    return () => controller.abort();
  }, [filter, initialDecades, initialTotal, isUnfiltered]);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  // In-flight and settled loads, keyed `${filterKey}:${decade}` so a
  // filter change can't be satisfied by a stale response.
  const inFlightRef = useRef(new Map<string, Promise<void>>());
  const loadedRef = useRef(new Set<string>());

  // Any filter *change* invalidates every loaded section: drop the works
  // and the "already fetched" bookkeeping so the observers refill from
  // the new shape. Guarded against the mount run — resetting there would
  // throw away the first sections' responses and make them fetch twice.
  const lastFilterKeyRef = useRef(filterKey);
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey is the identity of the current filter; resetting on it is the point.
  useEffect(() => {
    if (lastFilterKeyRef.current === filterKey) return;
    lastFilterKeyRef.current = filterKey;
    loadedRef.current.clear();
    setWorks({});
  }, [filterKey]);

  const loadDecade = useCallback((decade: number): Promise<void> => {
    const key = `${filterKeyRef.current}:${decade}`;
    const running = inFlightRef.current.get(key);
    if (running) return running;
    if (loadedRef.current.has(key)) return Promise.resolve();

    const filterAtRequest = filterRef.current;
    const promise = fetchDecadeWorks(decade, filterAtRequest)
      .then((items) => {
        // Drop the response if the filters moved on while it was in
        // flight — the reset effect has already cleared `works`, and
        // marking it loaded would strand the section under the filter
        // that is actually on screen.
        if (filterKeyOf(filterAtRequest) !== filterKeyRef.current) return;
        loadedRef.current.add(key);
        setWorks((prev) => ({ ...prev, [decade]: items }));
      })
      .catch(() => {
        // Leave the section unloaded; the observer retries when it
        // re-enters the viewport.
      })
      .finally(() => {
        inFlightRef.current.delete(key);
      });
    inFlightRef.current.set(key, promise);
    return promise;
  }, []);

  // `/timeline#decade-1870` — what scopeHref() builds for the decade
  // scope — lands mid-document. Start that section's fetch on mount
  // rather than waiting for the observer to notice where we landed.
  useEffect(() => {
    const match = /^#decade-(-?\d+)$/.exec(window.location.hash);
    if (match) void loadDecade(Number(match[1]));
  }, [loadDecade]);

  const nearViewportUnloaded = useCallback((): number[] => {
    if (typeof document === "undefined") return [];
    const pending: number[] = [];
    for (const section of document.querySelectorAll<HTMLElement>("[data-decade]")) {
      const decade = Number(section.dataset.decade);
      if (!Number.isFinite(decade)) continue;
      if (loadedRef.current.has(`${filterKeyRef.current}:${decade}`)) continue;
      const rect = section.getBoundingClientRect();
      const above = rect.bottom < -NEAR_VIEWPORT_PX;
      const below = rect.top > window.innerHeight + NEAR_VIEWPORT_PX;
      if (!above && !below) pending.push(decade);
    }
    return pending;
  }, []);

  // The merge-back FLIP hunts for the tile the visitor came from. On a
  // lazily-filled timeline that tile may not be mounted yet, so hand
  // the hook a bounded expand: load the sections around the restored
  // scroll position, nothing further.
  useArtworkBackFlip({
    expand: () => Promise.all(nearViewportUnloaded().map(loadDecade)),
    canExpand: () => nearViewportUnloaded().length > 0,
  });

  const decades = summary.decades;
  const maxInDecade = Math.max(1, ...decades.map((d) => d.count));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 md:flex-row md:items-center">
        {/* 16px text and a 44px box below `sm`, the 14px/36px desktop look
            above it: iOS Safari zooms the whole page when a focused
            control's font-size is under 16px, which yanks the layout out
            from under the visitor mid-tap. */}
        <Input
          type="search"
          aria-label="Filter timeline by title, artist, or nationality"
          placeholder="Filter by title, artist, nationality..."
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          className="h-11 text-base sm:h-9 sm:text-sm md:max-w-md"
        />
        <Select
          aria-label="Filter by movement"
          value={movement}
          onChange={setMovement}
          options={[
            { value: "", label: "All movements" },
            ...movements.map((m) => ({ value: m, label: m })),
          ]}
          className="md:w-64 md:shrink-0"
        />
        <div className="text-sm text-[var(--muted-foreground)]" aria-live="polite">
          {summaryStatus === "failed"
            ? "Could not update the counts — check your connection."
            : `${summary.total.toLocaleString()} dated works across ${decades.length} decades`}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[var(--muted-foreground)]">
            Density across time (each bar = one decade):
          </div>
          {/* Phone-sized decade navigation. 62 bars can't each be a 44px
              target without a metre of scroll, so the jump list — one
              control, 44px tall, 16px text — is what actually gets a
              visitor to a decade on touch; the bars stay a chart. */}
          {decades.length > 0 && (
            <Select
              aria-label="Jump to a decade"
              // Always shows the label, so re-picking the same decade still
              // fires, and the control never reads as a filter (it
              // navigates, it doesn't narrow anything).
              value=""
              onChange={(decade) => {
                if (decade) window.location.hash = `#decade-${decade}`;
              }}
              options={[
                { value: "", label: "Jump to decade..." },
                ...decades.map((d) => ({
                  value: String(d.decade),
                  label: `${d.decade}s (${d.count})`,
                })),
              ]}
              className="sm:hidden"
            />
          )}
        </div>
        {/* The strip scrolls in its own box below `sm`. Sized to fit
            instead, 62 bars land on their min-width floor — 3px each,
            and at 320px the row still overflows and drags the whole
            document into horizontal scroll.

            The padding is the focus ring's clearance. `overflow-x: auto`
            makes `overflow-y` compute to `auto` as well (CSS Overflow 3:
            a non-`visible` value on one axis promotes `visible` on the
            other), so this box clips on *both* axes, and the bars'
            `focus-visible:ring-2` paints 2px outside their border box.
            `py-1` leaves 2px of slack above and below the 96px row. The
            horizontal slack lives on the row rather than here so it is
            part of the scrolled content: an end-edge padding on a
            scroll container has a patchy history of being left out of
            the scrollable area, and the last bar's ring would be shaved
            off at maximum scroll. Above `sm` nothing clips, so the row
            keeps its old flush alignment with the decade labels. */}
        <div className="overflow-x-auto py-1 sm:overflow-x-visible">
          <div className="flex h-24 items-end gap-0.5 px-1 sm:px-0">
            {decades.map((d) => (
              <a
                key={d.decade}
                href={`#decade-${d.decade}`}
                // Full-height column, bar painted inside: the hit area is
                // the whole slot rather than the (often 3px) bar, so a
                // sparse decade is still clickable on a pointer device.
                // The ring stays outward (no `ring-inset`) because an
                // inset box-shadow paints under the element's own
                // children — on a full-height decade the bar covers it,
                // and `--ring` sits too close to `--primary`/70 in light
                // mode to read through it. The strip's padding is what
                // keeps the outward ring inside the scroll box.
                className="group flex h-full w-2.5 shrink-0 items-end rounded-t-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:w-auto sm:min-w-[3px] sm:shrink sm:flex-1"
                aria-label={`${d.decade}s: ${d.count} work${d.count === 1 ? "" : "s"}`}
                title={`${d.decade}s: ${d.count} work${d.count === 1 ? "" : "s"}`}
              >
                <span
                  className="min-h-[3px] w-full rounded-t-sm bg-[var(--primary)]/70 transition-colors group-hover:bg-[var(--primary)]"
                  style={{ height: `${barHeightPercent(d.count, maxInDecade)}%` }}
                />
              </a>
            ))}
          </div>
        </div>
        {decades.length > 0 && (
          <div className="mt-1 flex justify-between text-xs text-[var(--muted-foreground)]">
            <span>{decades[0].decade}s</span>
            <span>{decades[decades.length - 1].decade}s</span>
          </div>
        )}
      </div>

      <div className="space-y-12">
        {decades.map((d) => (
          <DecadeSection
            key={d.decade}
            decade={d.decade}
            count={d.count}
            works={works[d.decade] ?? null}
            onVisible={loadDecade}
          />
        ))}
      </div>

      {decades.length === 0 && (
        <div className="py-16 text-center text-[var(--muted-foreground)]">
          No dated works match the filters.
        </div>
      )}
    </div>
  );
}

function DecadeSection({
  decade,
  count,
  works,
  onVisible,
}: {
  decade: number;
  count: number;
  works: TimelineListing[] | null;
  onVisible: (decade: number) => Promise<void>;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const loaded = works != null;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || loaded) return;
    // Load straight away when the section already sits in the prefetch
    // band. Covers mount, a filter change that re-empties a section the
    // visitor is looking at, and browsers that don't deliver an initial
    // observer callback.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight + PREFETCH_MARGIN_PX && rect.bottom > -PREFETCH_MARGIN_PX) {
      void onVisible(decade);
    }
    // No IntersectionObserver (very old browsers, jsdom): the eager
    // check above is all this section gets.
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void onVisible(decade);
      },
      { rootMargin: PREFETCH_ROOT_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [decade, loaded, onVisible]);

  return (
    // Deliberately no `scroll-mt-*`. The `scroll-padding-top: 5rem` on
    // the scroll root in src/app/globals.css already offsets every hash
    // jump past the sticky <SiteNav> (69px below md, ~59px above it). A
    // scroll margin on the target *adds* to that padding rather than
    // replacing it, so the old `scroll-mt-20` put `#decade-NNNN` 160px
    // down the viewport on every breakpoint. The global rule alone lands
    // the heading 11px under the phone header, 21px under the desktop one.
    <section ref={sectionRef} id={`decade-${decade}`} data-decade={decade}>
      <div className="sticky top-14 z-10 -mx-4 mb-3 border-y border-[var(--border)] bg-[var(--background)]/90 px-4 py-2 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-xl">{decade}s</h2>
          <Badge variant="outline">{count}</Badge>
        </div>
      </div>
      <div className={GRID_CLASSES}>
        {works
          ? works.map((a) => <TimelineTile key={a.id} artwork={a} decade={decade} />)
          : Array.from({ length: count }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders are interchangeable and all unmount together once the works land.
              <div key={i} className="timeline-cell-placeholder" />
            ))}
      </div>
    </section>
  );
}

function TimelineTile({ artwork: a, decade }: { artwork: TimelineListing; decade: number }) {
  const { handlers, portal } = useArtworkTooltip({
    title: displayTitle(a),
    artist: a.artist,
    year: a.year,
  });
  const transitionNav = useTransitionNav();
  const href = artworkHref(a.id, { kind: "decade", start: decade });
  const tileRef = useRef<HTMLDivElement | null>(null);
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const img = tileRef.current?.querySelector("img") ?? null;
    transitionNav(e, href, { vtElement: img, vtName: artworkHeroVtName(a.id) });
  };
  return (
    <div
      ref={tileRef}
      className="group relative aspect-square overflow-hidden rounded-md bg-[var(--muted)]"
      data-artwork-id={a.id}
      {...handlers}
    >
      <Link
        href={href}
        onClick={onClick}
        className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label={artworkAlt(a)}
      />
      <ResponsiveImage
        objectKey={a.objectKey}
        variantWidths={a.variantWidths}
        alt={artworkAlt(a)}
        fill
        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
        loading="lazy"
        dominantColor={a.dominantColor}
        className="transition-transform duration-500 group-hover:scale-110"
      />
      {/* Mobile-only caption: touch has no hover, so stamp-sized tiles
          still get a label. Desktop hover is served by the floating
          tooltip portal mounted via useArtworkTooltip. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10px] text-white md:hidden">
        <div className="line-clamp-1 font-medium">{displayTitle(a)}</div>
        <div className="line-clamp-1 opacity-80">
          {a.year}
          {a.artist ? (
            <>
              {" · "}
              <Link
                href={`/artist/${a.artistSlug}`}
                className="relative z-20 rounded-sm underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {a.artist}
              </Link>
            </>
          ) : null}
        </div>
      </div>
      {portal}
    </div>
  );
}

function withFilter(url: URL, filter: FilterState): URL {
  if (filter.query) url.searchParams.set("q", filter.query);
  if (filter.movement) url.searchParams.set("movement", filter.movement);
  return url;
}

async function fetchDecades(filter: FilterState, signal: AbortSignal): Promise<TimelineSummary> {
  const url = withFilter(new URL("/api/timeline/decades", window.location.origin), filter);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`fetch ${url.pathname}: ${res.status}`);
  return res.json() as Promise<TimelineSummary>;
}

async function fetchDecadeWorks(decade: number, filter: FilterState): Promise<TimelineListing[]> {
  const url = withFilter(new URL("/api/timeline/works", window.location.origin), filter);
  url.searchParams.set("decade", String(decade));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url.pathname}: ${res.status}`);
  const body = (await res.json()) as { items: TimelineListing[] };
  return body.items;
}
