"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { ArtworkAbout } from "@/lib/artwork-about";
import { cn } from "@/lib/utils";

// One fetch per work for the whole visit: reopening a painting, or the
// pill on it, reads the answer back from here. A failed fetch is dropped
// so the next open tries again.
const aboutCache = new Map<string, Promise<ArtworkAbout>>();

function fetchAbout(id: string): Promise<ArtworkAbout> {
  let pending = aboutCache.get(id);
  if (!pending) {
    pending = fetch(`/api/artwork-about/${encodeURIComponent(id)}`).then((res) => {
      if (!res.ok) throw new Error(`about ${id}: ${res.status}`);
      return res.json() as Promise<ArtworkAbout>;
    });
    pending.catch(() => aboutCache.delete(id));
    aboutCache.set(id, pending);
  }
  return pending;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; about: ArtworkAbout }
  | { kind: "failed" };

/**
 * "More about this painting": a pill in the inspect view's bottom-left
 * corner that opens upward into what the /artwork/[id] page says about
 * the work. Nothing is fetched until the visitor reaches for it (hover,
 * focus or click), and then only this one work's text, a few hundred
 * bytes, from /api/artwork-about. The museum's listings carry none of it.
 *
 * The host keys it by artwork id, so a new work starts closed.
 */
export function PaintingInfoPill({ artworkId }: { artworkId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const panelId = useId();

  const load = useCallback(() => {
    if (state.kind === "loading" || state.kind === "ready") return;
    setState({ kind: "loading" });
    fetchAbout(artworkId).then(
      (about) => setState({ kind: "ready", about }),
      () => setState({ kind: "failed" }),
    );
  }, [artworkId, state.kind]);

  // A late answer for a work the modal no longer shows is ignored by the
  // host's key: the component it would update has unmounted.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div className="pointer-events-none absolute bottom-[calc(1rem_+_env(safe-area-inset-bottom,0px))] left-[calc(1rem_+_env(safe-area-inset-left,0px))] z-20 flex w-[min(26rem,calc(100vw-2rem))] flex-col items-start">
      {/* Grows up out of the pill: the row track animates 0fr → 1fr, so
          the height follows the content without measuring it. `inert`
          keeps the collapsed panel's links out of the tab order. */}
      <div
        id={panelId}
        inert={!open}
        className={cn(
          "grid w-full origin-bottom-left transition-[grid-template-rows,opacity,transform] duration-200 ease-out",
          open
            ? "pointer-events-auto grid-rows-[1fr] scale-100 opacity-100"
            : "grid-rows-[0fr] scale-95 opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {state.kind !== "idle" && (
            <div className="mb-2 max-h-[min(60vh,30rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-black/75 p-4 text-left text-sm text-neutral-200 shadow-2xl backdrop-blur-md">
              <AboutBody artworkId={artworkId} state={state} onRetry={load} />
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Hide details about this painting" : "More about this painting"}
        onPointerEnter={load}
        onFocus={load}
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/25 bg-black/70 py-2 pr-2 pl-2 text-sm text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:pr-4"
      >
        <InfoIcon />
        <span className="hidden sm:inline">More about this painting</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn(
            "hidden text-white/70 transition-transform duration-200 sm:block",
            open && "rotate-180",
          )}
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}

function AboutBody({
  artworkId,
  state,
  onRetry,
}: {
  artworkId: string;
  state: State;
  onRetry: () => void;
}) {
  const pageHref = `/artwork/${artworkId}`;
  if (state.kind === "loading" || state.kind === "idle") {
    return <p className="text-neutral-400">Loading…</p>;
  }
  if (state.kind === "failed") {
    return (
      <p className="text-neutral-400">
        The details did not load.{" "}
        <button type="button" onClick={onRetry} className={linkClasses}>
          Try again
        </button>{" "}
        or{" "}
        <a href={pageHref} target="_blank" rel="noopener" className={linkClasses}>
          open the work's page
        </a>
        .
      </p>
    );
  }

  const { about } = state;
  return (
    <div className="space-y-3">
      {(about.originalTitle || about.artist || about.dateCreated) && (
        <div className="space-y-0.5">
          {about.originalTitle && (
            <p className="font-serif text-base italic text-neutral-300">{about.originalTitle}</p>
          )}
          {about.artist && (
            <p className="text-white">
              {about.artistSlug ? (
                <a
                  href={`/artist/${about.artistSlug}`}
                  target="_blank"
                  rel="noopener"
                  className={linkClasses}
                >
                  {about.artist}
                </a>
              ) : (
                about.artist
              )}
              {about.lifespan && <span className="text-neutral-400"> ({about.lifespan})</span>}
            </p>
          )}
          {about.dateCreated && (
            <p className="text-neutral-400">
              {about.dateCreated}
              {about.originalDateString && (
                <span className="ml-2 italic">({about.originalDateString})</span>
              )}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {about.era && (
          <Chip href={`/era/${about.era.id}`} title={`More from ${about.era.title}`}>
            {about.era.title}
          </Chip>
        )}
        {about.plate && (
          <Chip href={`/collection/${about.plate.id}`} title={about.plate.title}>
            {about.plate.title}
            {about.plate.number != null && (
              <span className="tabular-nums text-neutral-400">pl. {about.plate.number}</span>
            )}
          </Chip>
        )}
        <Chip href={about.license.url} title={`License: ${about.license.short}`} rel="license">
          {about.license.short}
        </Chip>
        <Chip href={about.source.url} title={`View source on ${about.source.label}`}>
          {about.source.label}
        </Chip>
      </div>

      <p className="leading-relaxed text-neutral-300">{about.description}</p>
      {about.plate && <p className="leading-relaxed text-neutral-400">{about.plate.sentence}</p>}

      <a
        href={pageHref}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1 text-white underline underline-offset-2 hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        Open the work's page
        <ExternalIcon />
      </a>
    </div>
  );
}

const linkClasses =
  "underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

function Chip({
  href,
  title,
  rel,
  children,
}: {
  href: string;
  title: string;
  rel?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel={rel ? `${rel} noopener` : "noopener"}
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-2.5 py-0.5 text-xs text-neutral-200 transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {children}
    </a>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
