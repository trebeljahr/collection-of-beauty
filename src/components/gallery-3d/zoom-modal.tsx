"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { suggestFixUrl } from "@/lib/links";
import { assetUrl, cn, variantUrl } from "@/lib/utils";
import { peekBestCachedTexture } from "./texture-cache";

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

  // The sharpest already-decoded texture the player loaded while walking
  // the 3D scene. When present we draw it straight to a canvas (below) —
  // instant, no network, no re-decode — and never show a spinner. A
  // painting the player just clicked always has at least its 960 px base
  // resident, so this is the common path.
  const cachedTexture = useMemo(
    () => peekBestCachedTexture(artwork.objectKey, widths, sourceWidth),
    [artwork.objectKey, widths, sourceWidth],
  );

  // Fallback placeholder when no texture is cached (rare — e.g. the base
  // aged out of the LRU between click and modal open). Smallest variant
  // is the fastest cold load.
  const fallbackPlaceholderSrc = hasVariants
    ? variantUrl(artwork.objectKey, widths[0], "avif")
    : assetUrl(artwork.objectKey);

  const [highReady, setHighReady] = useState(false);

  // Preload the high-res variant in the background, then cross-fade it
  // over the canvas / fallback placeholder. Cancellation prevents a
  // stale onload from flipping highReady true after the modal closed.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    const done = () => {
      if (!cancelled) setHighReady(true);
    };
    img.onload = done;
    img.onerror = done;
    img.src = highSrc;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [highSrc]);

  // Paint the cached texture's decoded bitmap onto the canvas placeholder.
  // Textures decode with imageOrientation:"flipY" (WebGL's origin is
  // bottom-left), so the bitmap is upside down for a top-left 2D canvas —
  // mirror vertically to draw it upright.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasPainted, setCanvasPainted] = useState(false);
  useEffect(() => {
    setCanvasPainted(false);
    const canvas = canvasRef.current;
    if (!canvas || !cachedTexture) return;
    const bmp = cachedTexture.image as
      | (CanvasImageSource & { width?: number; height?: number })
      | undefined;
    const w = bmp?.width;
    const h = bmp?.height;
    if (!bmp || !w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const flipY = typeof ImageBitmap !== "undefined" && bmp instanceof ImageBitmap;
    if (flipY) {
      ctx.translate(0, h);
      ctx.scale(1, -1);
    }
    ctx.drawImage(bmp, 0, 0);
    setCanvasPainted(true);
  }, [cachedTexture]);

  const dims = artwork.realDimensions;
  // Track the fallback placeholder's load only when there's no cached
  // texture to draw. With the canvas (or once high-res lands) the spinner
  // never shows.
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const showSpinner = !canvasPainted && !placeholderLoaded && !highReady;

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
            {/* Instant placeholder: the sharpest already-decoded texture
                the player loaded in the 3D scene, drawn straight to a
                canvas — zero network, zero re-decode. Falls back to the
                smallest variant <img> only when nothing is cached. Stays
                visible until the high-res copy cross-fades over it. */}
            {cachedTexture ? (
              <canvas
                ref={canvasRef}
                className={cn(
                  "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
                  highReady ? "opacity-0" : "opacity-100",
                )}
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: react-zoom-pan-pinch needs a plain <img>; next/image's wrapper interferes with its transform layer.
              <img
                src={fallbackPlaceholderSrc}
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
        <div className="text-xl font-semibold">{displayTitle(artwork)}</div>
        <div className="text-sm text-neutral-400">
          {artwork.artist && artwork.artistSlug ? (
            <a
              href={`/artist/${artwork.artistSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto underline underline-offset-2 hover:text-neutral-200 focus:outline-none"
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
        <a
          href={suggestFixUrl({
            id: artwork.id,
            title: artwork.title,
            artist: artwork.artist,
          })}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-neutral-200 transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5a11.5 11.5 0 0 0-3.633 22.41c.575.106.784-.25.784-.555 0-.273-.01-.997-.015-1.957-3.196.695-3.871-1.541-3.871-1.541-.522-1.326-1.275-1.679-1.275-1.679-1.042-.713.079-.699.079-.699 1.152.081 1.758 1.183 1.758 1.183 1.024 1.754 2.687 1.247 3.343.954.103-.742.4-1.247.728-1.534-2.552-.29-5.236-1.276-5.236-5.677 0-1.254.448-2.28 1.183-3.083-.119-.29-.513-1.459.112-3.041 0 0 .965-.309 3.165 1.177a11.005 11.005 0 0 1 5.766 0c2.198-1.486 3.162-1.177 3.162-1.177.626 1.582.232 2.751.114 3.041.737.803 1.182 1.829 1.182 3.083 0 4.412-2.689 5.384-5.249 5.668.412.355.78 1.054.78 2.125 0 1.534-.014 2.771-.014 3.148 0 .308.207.667.79.554A11.502 11.502 0 0 0 12 .5Z" />
          </svg>
          Suggest a fix
        </a>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-neutral-500">
          close · Esc · E
        </div>
      </div>
    </div>
  );
}
