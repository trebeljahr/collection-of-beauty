"use client";

import { useEffect } from "react";
import { type Artwork, artworkAlt } from "@/lib/data";
import { assetUrl, variantSrcSet, variantUrl } from "@/lib/utils";

/**
 * Full-screen overlay with a larger look at one painting plus its
 * metadata. Shown when the Player's raycaster clicks on a painting;
 * Escape / click-to-close dismisses it. Uses a responsive `<img>` so
 * the browser picks whichever pre-built variant best fits the viewport.
 */
export function ZoomModal({ artwork, onClose }: { artwork: Artwork; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pass the artwork's actual variantWidths so we don't emit candidates
  // the browser will 404 on (e.g. 4096w, which only exists for very large
  // sources, or anything when the artwork hasn't been shrunk yet).
  const widths = artwork.variantWidths ?? [];
  const hasVariants = widths.length > 0;
  const srcSet = hasVariants ? variantSrcSet(artwork.objectKey, "avif", widths) : undefined;
  // 1280.webp is only emitted when the artwork has been shrunk; for
  // un-shrunk artworks fall through to the original.
  const fallback = hasVariants
    ? variantUrl(artwork.objectKey, 1280, "webp")
    : assetUrl(artwork.objectKey);
  const dims = artwork.realDimensions;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc dismisses via the window keydown listener above; the overlay click is just a mouse shortcut, not the only path.
    <div
      onClick={onClose}
      className="absolute inset-0 bg-black/85 backdrop-blur-sm z-40 flex flex-col items-center justify-center cursor-zoom-out p-6"
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — keyboard activation here would be a no-op */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-[min(90vw,1400px)] max-h-[80vh] cursor-default"
      >
        {/* Responsive painting */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallback}
          srcSet={srcSet}
          sizes="min(90vw, 1400px)"
          alt={artworkAlt(artwork)}
          className="max-h-[80vh] max-w-full object-contain shadow-2xl"
        />
      </div>
      <div className="mt-6 max-w-2xl text-center text-neutral-200 space-y-1">
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
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 text-neutral-500 text-xs hover:text-neutral-300"
      >
        close · Esc · click anywhere
      </button>
    </div>
  );
}
