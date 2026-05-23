"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { getLoadedVariant, recordLoadedVariant } from "@/lib/image-cache";
import { assetUrl, cn, variantUrl } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  objectKey: string;
  variantWidths?: readonly number[] | null;
  alt: string;
  srcWidth?: number | null;
  srcHeight?: number | null;
  caption?: string;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
};

export function Lightbox({
  open,
  onClose,
  objectKey,
  variantWidths,
  alt,
  srcWidth,
  srcHeight,
  caption,
  onPrev,
  onNext,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [highReady, setHighReady] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  useEffect(() => setMounted(true), []);

  const widths = variantWidths ?? [];
  const hasVariants = widths.length > 0;
  const highWidth = hasVariants ? widths[widths.length - 1] : null;
  const highSrc = highWidth ? variantUrl(objectKey, highWidth, "avif") : assetUrl(objectKey);
  const fallbackSrc = assetUrl(objectKey);
  // Placeholder: the exact variant the page below already loaded (so it's
  // in the HTTP cache and paints instantly), else the smallest variant as
  // a fast cold load. Reused across grid → detail page → fullscreen so
  // each step shows the previous step's bytes while the larger copy
  // arrives.
  const smallestSrc = hasVariants ? variantUrl(objectKey, widths[0], "avif") : fallbackSrc;
  const placeholderSrc = getLoadedVariant(objectKey) ?? smallestSrc;

  // Reset everything when the displayed artwork changes (objectKey is the
  // unique identifier here). Without this, prev/next inside the lightbox
  // would leave stale zoom and a stale opacity state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: objectKey is the trigger, not a body dependency
  useEffect(() => {
    if (!open) return;
    setPlaceholderLoaded(false);
    setHighReady(false);
    transformRef.current?.resetTransform(0);
  }, [open, objectKey]);

  // Preload the high-res variant. Re-runs whenever the artwork (highSrc)
  // or open state changes. Cancellation prevents a stale onload from
  // flipping highReady true after a fast prev/next. onerror unblocks
  // the spinner if the URL 404s or the network is dropped — without it
  // the lightbox spins forever and the user has no way to know the
  // load broke.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const img = new Image();
    const finish = () => {
      if (!cancelled) setHighReady(true);
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = highSrc;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [open, highSrc]);

  // Esc to close, arrows to navigate. Bound while open so pages don't
  // double-handle the same key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, onPrev, onNext]);

  if (!open || !mounted) return null;

  const showSpinner = !placeholderLoaded && !highReady;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm"
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
          wrapperStyle={{ width: "100vw", height: "100vh" }}
          contentStyle={{ width: "100vw", height: "100vh" }}
        >
          <div className="relative h-screen w-screen">
            {/* Placeholder: the variant already cached from the grid /
                detail page, shown until the high-res copy is decoded. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* biome-ignore lint/performance/noImgElement: manual variant selection + highReady swap; next/image's pipeline does not fit our rclone-backed variant ladder. */}
            <img
              src={placeholderSrc}
              alt=""
              width={srcWidth ?? undefined}
              height={srcHeight ?? undefined}
              draggable={false}
              onLoad={() => setPlaceholderLoaded(true)}
              className={cn(
                "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
                highReady ? "opacity-0" : "opacity-100",
              )}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {/* biome-ignore lint/performance/noImgElement: variant selection + highReady swap is done manually by this component; next/image's pipeline does not fit our rclone-backed variant ladder. */}
            <img
              src={highReady ? highSrc : placeholderSrc}
              alt={alt}
              width={srcWidth ?? undefined}
              height={srcHeight ?? undefined}
              draggable={false}
              onLoad={(e) => {
                if (highReady) {
                  recordLoadedVariant(objectKey, e.currentTarget.currentSrc || e.currentTarget.src);
                }
              }}
              className={cn(
                "absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300",
                highReady ? "opacity-100" : "opacity-0",
              )}
            />
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Loading spinner while the first paintable image (placeholder or
          high-res) is still in flight. Sits above the empty <picture>
          frame so the backdrop isn't a black void. Pointer-events off so
          the user can still drag underneath it. */}
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

      {/* Top bar: close + caption. Pointer-events scoped to controls so
          they don't swallow drags on the image itself. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 text-white">
        <div className="min-w-0 flex-1 text-sm text-white/80">
          {caption && <p className="line-clamp-2">{caption}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
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

      {/* Prev / Next chevrons — hidden when no neighbour exists. */}
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous artwork"
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:left-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Next artwork"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>,
    document.body,
  );
}
