"use client";

import type { Artwork } from "@/lib/data";
import { variantSrcSet, variantUrl } from "@/lib/utils";
import { useEffect } from "react";

/**
 * Full-screen overlay with a larger look at one painting plus its
 * metadata. Shown when the Player's raycaster clicks on a painting;
 * Escape / click-to-close dismisses it. Uses a responsive `<img>` so
 * the browser picks whichever pre-built variant best fits the viewport.
 */
export function ZoomModal({
  artwork,
  onClose,
}: {
  artwork: Artwork;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fallback = variantUrl(artwork.objectKey, 1280, "webp");
  const srcSet = variantSrcSet(artwork.objectKey, "webp");
  const dims = artwork.realDimensions;

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 bg-black/85 backdrop-blur-sm z-40 flex flex-col items-center justify-center cursor-zoom-out p-6"
    >
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
          alt={artwork.title}
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
      <button onClick={onClose} className="mt-4 text-neutral-500 text-xs hover:text-neutral-300">
        close · Esc · click anywhere
      </button>
    </div>
  );
}
