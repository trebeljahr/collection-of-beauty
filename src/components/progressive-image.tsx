"use client";

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { type ThumbHashFit, thumbHashBlurStyle } from "@/components/thumbhash-picture";
import { getLoadedVariant } from "@/lib/image-cache";
import { thumbHashBlurUrl } from "@/lib/thumbhash-grid";
import { useHydrated } from "@/lib/use-hydrated";
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
  /** Artwork.thumbHash. Its blur is the frame's background, over the
   *  tint and under the shimmer, the thumbnail and the sharp layer. */
  thumbHash?: string | null;
  /** Same meaning, and same defaults, as in ResponsiveImage — which
   *  passes all three resolved, so both paths paint the identical preview
   *  from the identical grid. */
  thumbHashFit?: ThumbHashFit;
  workWidth?: number | null;
  workHeight?: number | null;
  deferThumbHash?: boolean;
};

// Smallest ladder rung. ~5-15 KB of AVIF, so it decodes almost instantly
// even on a throttled link — the "something real, blurred" first paint.
const LQIP_WIDTH = 256;

/**
 * A gallery tile that paints in three passes on a slow connection:
 *
 *   1. dominantColor tint, the thumbHash blur over it when the work has
 *      one, and a soft shimmer sweep (instant, no fetch)
 *   2. a blurred 256 px thumbnail (tiny, fast)
 *   3. the sharp responsive variant, fading in on top once decoded
 *
 * Layers are stacked in the DOM (shimmer → thumb → sharp), so each one
 * simply paints over the one below as its bytes land. The tint and the
 * blur are the frame's own background, under all three; the thumb paints
 * nothing until its pixels arrive. JS only fades the sharp layer in and
 * retires the shimmer.
 *
 * Neither <img> is what the view-transition FLIP snapshots. The thumb is
 * blurred and scaled 8% past the frame, and the sharp layer stays
 * transparent until its pixels land, so the gallery names the frame. The
 * back-flip measures the sharp layer, whose box is the frame's. Both find
 * it by `data-object-key`, which only the sharp layer carries.
 *
 * This only ever mounts after hydration, replacing a plain tile once the
 * connection reads as slow. The plain tile already painted the blur, so
 * the frame paints the same one from its first render, at the same
 * geometry and fit: the swap goes blur to blur, never through the bare
 * tint.
 *
 * A tile whose variant is already loaded, such as every tile the plain
 * path finished before the swap, renders neither the shimmer nor the
 * thumb and shows the sharp layer without a fade. There is nothing left
 * to preview, and a revisit doesn't flash empty→sharp.
 *
 * The extra 256 px fetch is the deliberate cost for every other tile: it
 * buys a real preview seconds before the full variant on a slow link.
 * `priority`/LCP images must not pay it, which is why ResponsiveImage
 * only delegates here for lazy tiles. At DPR 1 a small tile's sharp layer
 * picks the 256w rung, the thumb's own URL, and the browser fetches it
 * once.
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
  thumbHash,
  thumbHashFit,
  workWidth,
  workHeight,
  deferThumbHash,
}: Props) {
  // A variant this session already loaded, most often by the plain tile
  // this one just replaced: paint it straight away, no shimmer, no thumb,
  // no fade. Read during render, so the first frame already shows it; an
  // effect runs after that frame is painted, and the tile would blink to
  // the blur and back. Safe to read here because this never renders on
  // the server or in a hydration render (see above).
  const [instant, setInstant] = useState(() => getLoadedVariant(objectKey) != null);
  const [loaded, setLoaded] = useState(instant);
  const imgRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    // A memory-cache hit the registry hasn't seen can be complete on
    // insert, before React attaches onLoad. Layout effect, not effect,
    // for the same reason as above: it lands before the first paint. The
    // re-render it causes removes the lazy thumb in the same task, before
    // the browser's lazy-load check has requested it.
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
  // `.ri-frame` paints `--ri-blur` (globals.css). `deferThumbHash` is
  // honoured for symmetry with the plain path; in practice this component
  // never renders before hydration, so the blur is always there.
  const hydrated = useHydrated();
  const blur =
    deferThumbHash && !hydrated
      ? null
      : thumbHashBlurUrl(thumbHash, workWidth ?? srcWidth, workHeight ?? srcHeight);
  Object.assign(frameStyle, thumbHashBlurStyle(blur, thumbHashFit ?? (fill ? "cover" : "stretch")));

  return (
    <span
      className={cn("ri-frame", fill && "absolute inset-0", className)}
      data-loaded={loaded ? "true" : "false"}
      data-instant={instant ? "true" : undefined}
      style={frameStyle}
    >
      {!instant && (
        <>
          <span className="ri-shimmer" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* biome-ignore lint/performance/noImgElement: pre-built variant, not /_next/image */}
          <img className="ri-lqip" src={lqip} alt="" aria-hidden loading="lazy" decoding="async" />
        </>
      )}
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
