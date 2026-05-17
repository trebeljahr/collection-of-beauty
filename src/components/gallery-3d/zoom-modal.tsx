"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { artworkAlt } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { assetProxyUrl, assetUrl, cn, variantProxyUrl, variantUrl } from "@/lib/utils";
import { getHiRes, peekCached } from "./texture-cache";

/** Walk this artwork's variant widths from largest to smallest and
 *  return the URL of the highest one that's already in either of the
 *  3D-gallery texture caches. The browser's HTTP cache holds the
 *  matching AVIF bytes from when the texture loaded, so an `<img
 *  src=...>` for that URL paints from disk-cache in tens of ms instead
 *  of round-tripping the network for the multi-MB high-res variant.
 *
 *  Returns null if nothing is cached — the modal falls back to the
 *  smallest variant URL as a placeholder while it fetches the
 *  high-res copy. */
function peekBestCachedVariantUrl(artwork: ArtworkListing): string | null {
  const widths = artwork.variantWidths ?? [];
  for (let i = widths.length - 1; i >= 0; i--) {
    const w = widths[i];
    const url = variantUrl(artwork.objectKey, w, "avif");
    const proxyUrl = variantProxyUrl(artwork.objectKey, w, "avif");
    if (peekCached(proxyUrl) || getHiRes(proxyUrl)) return proxyUrl;
    if (peekCached(url) || getHiRes(url)) return url;
  }
  // Original-source tier — only present in the hi-res cache when the
  // player walked right up to the painting in 3D and triggered the
  // close-up LOD's `original` fetch.
  const sourceW = artwork.width;
  if (sourceW != null && sourceW > 4096) {
    const origUrl = assetUrl(artwork.objectKey);
    const proxyOrigUrl = assetProxyUrl(artwork.objectKey);
    if (peekCached(proxyOrigUrl) || getHiRes(proxyOrigUrl)) return proxyOrigUrl;
    if (peekCached(origUrl) || getHiRes(origUrl)) return origUrl;
  }
  return null;
}

/**
 * Full-screen overlay with a zoom/pan view of one painting plus its
 * metadata. Shown when the Player's raycaster clicks on a painting;
 * Escape, E/F, or the close button dismisses it. Uses the same
 * react-zoom-pan-pinch wrapper as the /artwork lightbox so pan/zoom
 * feels identical across the site — no prev/next here, since
 * navigation in the 3D gallery is by walking, not swiping.
 *
 * `onClose` receives `shouldRelock` so the host can re-engage pointer
 * lock immediately on E or close-button (still inside a user gesture,
 * where requestPointerLock works) but skip it on Escape — Chrome
 * blacklists pointer-lock requests for ~1 s after the user pressed Esc
 * to exit lock, so trying to relock there would be silently denied AND
 * would block subsequent clicks from re-acquiring until the cooldown
 * ends.
 */
export function ZoomModal({
  artwork,
  onClose,
}: {
  artwork: ArtworkListing;
  onClose: (shouldRelock: boolean) => void;
}) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose(false);
      else if (e.code === "KeyE" || e.code === "KeyF") onClose(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pull the highest-resolution copy available. The shrink pipeline
  // emits a per-source full-size AVIF for sources > 4096 px on top of
  // the standard ladder, so the largest variant width covers the source
  // for any artwork that's been re-shrunk. We fall back to the raw
  // asset only when the largest available variant is smaller than the
  // source — which today only happens for paintings that haven't been
  // re-shrunk yet (Google Arts scans pre-update) or weren't shrunk at
  // all.
  const widths = artwork.variantWidths ?? [];
  const hasVariants = widths.length > 0;
  const largestVariant = hasVariants ? widths[widths.length - 1] : null;
  const sourceWidth = artwork.width;
  const useFullVariant =
    largestVariant != null && (sourceWidth == null || largestVariant >= sourceWidth);
  const highSrc = useFullVariant
    ? variantUrl(artwork.objectKey, largestVariant, "avif")
    : assetUrl(artwork.objectKey);

  // Placeholder src — picked once on mount. Walks the texture LRU
  // largest-to-smallest and returns the URL of the highest cached
  // variant; the browser's HTTP cache holds those bytes too, so
  // `<img src=...>` paints from disk in tens of ms. If nothing is
  // cached, fall back to the smallest variant (256 px) which is the
  // fastest cold load — much better than waiting for the multi-MB
  // high-res copy to arrive over the network.
  const placeholderSrc = useMemo(() => {
    const cached = peekBestCachedVariantUrl(artwork);
    if (cached) return cached;
    if (widths.length > 0) return variantUrl(artwork.objectKey, widths[0], "avif");
    return assetUrl(artwork.objectKey);
  }, [artwork, widths]);

  // If the placeholder IS already the high-res, skip the preload step
  // and start with `highReady` true so the high-res `<img>` paints
  // immediately and the cross-fade overlay is a no-op.
  const startReady = placeholderSrc === highSrc;
  const [highReady, setHighReady] = useState(startReady);

  // Preload the high-res variant in the background. Cancellation
  // prevents a stale onload from flipping highReady true after the
  // modal has already been dismissed. Skipped when the placeholder is
  // already the high-res (no fetch needed).
  useEffect(() => {
    if (startReady) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setHighReady(true);
    };
    img.src = highSrc;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [highSrc, startReady]);

  const dims = artwork.realDimensions;
  // Spinner only when we have NO image to show at all — the placeholder
  // is the smallest variant and it's still loading. With a cache hit
  // the placeholder paints fast and the spinner never shows.
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const showSpinner = !placeholderLoaded && !highReady;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={artworkAlt(artwork)}
      className="absolute inset-0 z-40 bg-black/95 backdrop-blur-sm"
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={8}
        centerOnInit
        doubleClick={{ mode: "toggle", step: 0.7 }}
        wheel={{ step: 0.13 }}
        pinch={{ step: 3.3 }}
        limitToBounds
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{ width: "100%", height: "100%" }}
        >
          <div className="relative h-full w-full">
            {/* Placeholder: highest cached variant (HTTP-cached AVIF
                bytes paint in tens of ms) or the smallest variant if
                nothing is cached. Stays visible until the high-res
                cross-fades over it. Skipped entirely when the
                placeholder IS the high-res — no point rendering it
                twice. */}
            {!startReady && (
              // biome-ignore lint/performance/noImgElement: react-zoom-pan-pinch needs a plain <img>; next/image's wrapper interferes with its transform layer.
              <img
                src={placeholderSrc}
                alt=""
                width={artwork.width ?? undefined}
                height={artwork.height ?? undefined}
                draggable={false}
                onLoad={() => setPlaceholderLoaded(true)}
                className={cn(
                  "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
                  highReady ? "opacity-0" : "opacity-100",
                )}
              />
            )}
            {/* High-res copy. Hidden until the preloader resolves so a
                half-decoded scan doesn't pop in over the placeholder. */}
            {/* biome-ignore lint/performance/noImgElement: see above. */}
            <img
              src={highSrc}
              alt={artworkAlt(artwork)}
              width={artwork.width ?? undefined}
              height={artwork.height ?? undefined}
              draggable={false}
              onLoad={() => {
                if (startReady) setPlaceholderLoaded(true);
              }}
              className={cn(
                "absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300",
                highReady ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </TransformComponent>
      </TransformWrapper>

      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="animate-spin text-white/80"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="sr-only">Loading image</span>
        </div>
      )}

      {/* Top bar: close button. Pointer-events scoped so it doesn't
          swallow drags on the image itself. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end p-4">
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label="Close"
          className="pointer-events-auto rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Bottom bar: artwork metadata. Pointer-events off so pan/zoom
          drags pass through; the close hint mirrors the keyboard
          shortcuts wired up above. The artist link re-enables pointer
          events on itself so it can be clicked without breaking pan. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-6 pt-12 pb-5 text-center text-neutral-200">
        <div className="text-xl font-semibold">{artwork.title}</div>
        <div className="text-sm text-neutral-400">
          {artwork.artist && artwork.artistSlug ? (
            <a
              href={`/artist/${artwork.artistSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto underline-offset-2 hover:text-neutral-200 hover:underline focus:outline-none focus-visible:underline"
              title={`Open ${artwork.artist}'s page in a new tab`}
            >
              {artwork.artist}
            </a>
          ) : (
            (artwork.artist ?? "Unknown artist")
          )}
          {artwork.year != null && <> · {artwork.year}</>}
          {artwork.movement && <> · {artwork.movement}</>}
        </div>
        {dims && (
          <div className="text-xs text-neutral-500">
            {dims.widthCm.toFixed(0)} × {dims.heightCm.toFixed(0)} cm
          </div>
        )}
        <div className="mt-2 text-[11px] uppercase tracking-wider text-neutral-500">
          close · Esc · E
        </div>
      </div>
    </div>
  );
}
