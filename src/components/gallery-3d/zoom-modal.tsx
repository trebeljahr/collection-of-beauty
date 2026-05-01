"use client";

import { useEffect, useRef, useState } from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { type Artwork, artworkAlt } from "@/lib/data";
import { assetUrl, cn, variantSrcSet, variantUrl } from "@/lib/utils";

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
  artwork: Artwork;
  onClose: (shouldRelock: boolean) => void;
}) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [highReady, setHighReady] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose(false);
      else if (e.code === "KeyE" || e.code === "KeyF") onClose(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pull the largest available variant for the high-res copy. Falls
  // back to the original asset when the artwork hasn't been shrunk
  // (variantWidths empty), matching the lightbox's strategy.
  const widths = artwork.variantWidths ?? [];
  const hasVariants = widths.length > 0;
  const highWidth = hasVariants ? widths[widths.length - 1] : null;
  const highSrc = highWidth
    ? variantUrl(artwork.objectKey, highWidth, "avif")
    : assetUrl(artwork.objectKey);
  const fallbackSrc = assetUrl(artwork.objectKey);
  const avifSrcSet = hasVariants ? variantSrcSet(artwork.objectKey, "avif", widths) : "";

  // Preload the high-res variant. Cancellation prevents a stale onload
  // from flipping highReady true after the modal has already been
  // dismissed.
  useEffect(() => {
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
  }, [highSrc]);

  const dims = artwork.realDimensions;
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
            {/* Placeholder: cached responsive variant, shown until the
                high-res copy is decoded. */}
            {hasVariants && (
              <picture
                className={cn(
                  "absolute inset-0 transition-opacity duration-300",
                  highReady ? "opacity-0" : "opacity-100",
                )}
              >
                <source type="image/avif" srcSet={avifSrcSet} sizes="100vw" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fallbackSrc}
                  alt=""
                  width={artwork.width ?? undefined}
                  height={artwork.height ?? undefined}
                  draggable={false}
                  onLoad={() => setPlaceholderLoaded(true)}
                  className="h-full w-full object-contain"
                />
              </picture>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={highReady ? highSrc : fallbackSrc}
              alt={artworkAlt(artwork)}
              width={artwork.width ?? undefined}
              height={artwork.height ?? undefined}
              draggable={false}
              onLoad={() => {
                if (!hasVariants) setPlaceholderLoaded(true);
              }}
              className={cn(
                "absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300",
                highReady ? "opacity-100" : hasVariants ? "opacity-0" : "opacity-100",
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
          shortcuts wired up above. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-6 pt-12 pb-5 text-center text-neutral-200">
        <div className="text-xl font-semibold">{artwork.title}</div>
        <div className="text-sm text-neutral-400">
          {artwork.artist ?? "Unknown artist"}
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
