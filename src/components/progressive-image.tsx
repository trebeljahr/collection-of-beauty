"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { getLoadedVariant } from "@/lib/image-cache";
import { cn, fallbackVariantUrl, VARIANT_WIDTHS, variantSrcSet, variantUrl } from "@/lib/utils";

type Props = {
  /** The artwork's objectKey, e.g. "collection-of-beauty/Monet_Foo.jpg". */
  objectKey: string;
  alt: string;
  /** CSS "sizes" hint for the sharp <picture> layer. */
  sizes: string;
  /** Widths (px) known to exist on disk. Non-empty in practice — the
   *  caller (ResponsiveImage) only reaches for this component when the
   *  manifest is present. Falls back to the standard ladder defensively. */
  variantWidths?: readonly number[] | null;
  /** Rendered cell size, used to reserve the aspect box (no CLS). Ignored
   *  in `fill` mode, where the parent's box supplies the geometry. */
  srcWidth?: number;
  srcHeight?: number;
  /** Absolutely cover the parent (parent must be `position: relative`). */
  fill?: boolean;
  /** Average RGB hex painted behind the layers until pixels arrive. */
  dominantColor?: string | null;
  className?: string;
};

// Smallest ladder rung. ~5-15 KB of AVIF, so it decodes almost instantly
// even on a throttled link — the "something real, blurred" first paint.
const LQIP_WIDTH = 256;

/**
 * A gallery tile that paints in three passes on a slow connection:
 *
 *   1. dominantColor tint + a soft shimmer sweep (instant, no fetch)
 *   2. a blurred 256 px thumbnail (tiny, fast)
 *   3. the sharp responsive variant, fading in on top once decoded
 *
 * Layers are stacked in the DOM (shimmer → thumb → sharp), so each one
 * simply paints over the one below as its bytes land — no JS drives the
 * swap. JS only fades the sharp layer in and retires the shimmer, and
 * skips both when the variant is already cached so a revisit doesn't
 * flash empty→sharp.
 *
 * The extra 256 px fetch is the deliberate cost: it buys a real preview
 * seconds before the full variant on a slow link. `priority`/LCP images
 * must not pay it, which is why ResponsiveImage only delegates here for
 * lazy tiles.
 */
export function ProgressiveImage({
  objectKey,
  alt,
  sizes,
  variantWidths,
  srcWidth,
  srcHeight,
  fill,
  dominantColor,
  className,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [instant, setInstant] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // A fast cache hit can finish decoding before React attaches onLoad
    // (the SSR'd <img> resolves during hydration), and a prior page may
    // have left this variant in the HTTP cache. Either way: paint it
    // straight away, no shimmer, no fade.
    const img = imgRef.current;
    if ((img?.complete && img.naturalWidth > 0) || getLoadedVariant(objectKey)) {
      setInstant(true);
      setLoaded(true);
    }
  }, [objectKey]);

  const widths = variantWidths && variantWidths.length > 0 ? variantWidths : VARIANT_WIDTHS;
  const avif = variantSrcSet(objectKey, "avif", widths);
  const fallback = fallbackVariantUrl(objectKey, widths);
  const lqip = variantUrl(objectKey, LQIP_WIDTH, "avif");

  const frameStyle: CSSProperties = fill
    ? {}
    : {
        width: "100%",
        aspectRatio: srcWidth && srcHeight ? `${srcWidth} / ${srcHeight}` : undefined,
      };
  if (dominantColor) frameStyle.backgroundColor = dominantColor;

  return (
    <span
      className={cn("ri-frame", fill && "absolute inset-0", className)}
      data-loaded={loaded ? "true" : "false"}
      data-instant={instant ? "true" : undefined}
      style={frameStyle}
    >
      <span className="ri-shimmer" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* biome-ignore lint/performance/noImgElement: pre-built variant, not /_next/image */}
      <img className="ri-lqip" src={lqip} alt="" aria-hidden loading="lazy" decoding="async" />
      <picture>
        <source type="image/avif" srcSet={avif} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          className="ri-full"
          src={fallback}
          alt={alt}
          data-object-key={objectKey}
          sizes={sizes}
          loading="lazy"
          fetchPriority="low"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
      </picture>
    </span>
  );
}
