"use client";

import { useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { artworkHref, type Scope } from "@/lib/artwork-scope";
import { getLoadedVariant, recordLoadedVariant } from "@/lib/image-cache";
import { assetUrl, cn, variantSrcSet, variantUrl } from "@/lib/utils";
import { useLightbox } from "./lightbox-provider";

type ArtworkLike = {
  id: string;
  objectKey: string;
  variantWidths: readonly number[] | null;
  title: string;
  englishTitle: string | null;
  artist: string | null;
  year: number | null;
  width: number | null;
  height: number | null;
};

type Props = {
  art: ArtworkLike;
  prevId: string | null;
  nextId: string | null;
  scope?: Scope | null;
};

export function ArtworkViewer({ art, prevId, nextId, scope = null }: Props) {
  const router = useRouter();
  const { open, isOpen } = useLightbox();

  const prevHref = prevId ? artworkHref(prevId, scope) : null;
  const nextHref = nextId ? artworkHref(nextId, scope) : null;

  useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);
  }, [prevHref, nextHref, router]);

  // Page-level keyboard navigation. Skipped while the lightbox is open —
  // the lightbox binds its own arrows that swap the modal image instead.
  useEffect(() => {
    if (isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
      } else if (e.key === "ArrowRight" && nextHref) {
        e.preventDefault();
        router.push(nextHref);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, prevHref, nextHref, router]);

  const alt = artworkAlt(art);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => open(art)}
        title="View fullscreen"
        aria-label={`Open ${displayTitle(art)} in fullscreen viewer`}
        className="flex min-h-0 w-full flex-1 cursor-zoom-in items-start justify-center rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {/* key on the artwork id so progressive state resets cleanly on
            prev/next navigation. */}
        <ArtworkImage key={art.id} art={art} alt={alt} />
      </button>
    </div>
  );
}

// Cap the image a touch under the bordered box's max-h-[85vh] so the
// 10 px padding on either side never makes it overflow the frame.
const IMG_BOX = "h-auto max-h-[calc(85vh-24px)] w-auto max-w-full rounded-md object-contain";

/**
 * Detail-page hero image with a progressive cross-fade. The high-res
 * `<picture>` is server-rendered (good for LCP / no-JS), and once
 * hydrated we overlay the variant the grid already cached — read from
 * the shared image-cache registry, falling back to the smallest variant
 * — so a click through from the grid paints instantly instead of staring
 * at an empty frame while the 65 vw variant downloads. The placeholder
 * fades out the moment the high-res copy decodes.
 */
function ArtworkImage({ art, alt }: { art: ArtworkLike; alt: string }) {
  const widths = art.variantWidths ?? [];
  const hasVariants = widths.length > 0;
  const sizes = "(max-width: 768px) 100vw, 65vw";
  const avifSrcSet = hasVariants ? variantSrcSet(art.objectKey, "avif", widths) : "";
  const fallbackSrc = assetUrl(art.objectKey);
  const smallestSrc = hasVariants ? variantUrl(art.objectKey, widths[0], "avif") : fallbackSrc;

  const highRef = useRef<HTMLImageElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [highReady, setHighReady] = useState(false);
  const [placeholderSrc, setPlaceholderSrc] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  // Decide post-hydration whether a placeholder is worth showing. If the
  // high-res <img> is already decoded (cache hit) we skip it entirely.
  // Done in an effect so the server render and first client render agree
  // (the registry is client-only) — no hydration mismatch.
  useEffect(() => {
    if (!mounted || !hasVariants) return;
    const img = highRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      setHighReady(true);
      return;
    }
    setPlaceholderSrc(getLoadedVariant(art.objectKey) ?? smallestSrc);
  }, [mounted, hasVariants, art.objectKey, smallestSrc]);

  const handleHighLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    setHighReady(true);
    recordLoadedVariant(art.objectKey, e.currentTarget.currentSrc || e.currentTarget.src);
  };

  const showPlaceholder = mounted && placeholderSrc != null && !highReady;

  if (!hasVariants) {
    // No shrunk variants — single original load, no ladder to bridge.
    return (
      // biome-ignore lint/performance/noImgElement: rclone-backed variant ladder; next/image's request-time optimizer is not in this path.
      <img
        ref={highRef}
        src={fallbackSrc}
        alt={alt}
        data-object-key={art.objectKey}
        width={art.width ?? 1600}
        height={art.height ?? 2000}
        fetchPriority="high"
        onLoad={handleHighLoad}
        className={IMG_BOX}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 items-start justify-center">
      <picture>
        <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
        <img
          ref={highRef}
          src={fallbackSrc}
          alt={alt}
          data-object-key={art.objectKey}
          width={art.width ?? 1600}
          height={art.height ?? 2000}
          sizes={sizes}
          fetchPriority="high"
          onLoad={handleHighLoad}
          className={cn(
            IMG_BOX,
            "block transition-opacity duration-300",
            showPlaceholder ? "opacity-0" : "opacity-100",
          )}
        />
      </picture>
      {showPlaceholder && placeholderSrc && (
        // biome-ignore lint/performance/noImgElement: instant cached-variant placeholder; cross-fades out under the high-res copy.
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          width={art.width ?? 1600}
          height={art.height ?? 2000}
          className={cn(IMG_BOX, "pointer-events-none absolute inset-0 m-auto")}
        />
      )}
    </div>
  );
}
