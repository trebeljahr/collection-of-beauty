import type { CSSProperties } from "react";
import { cn, fallbackVariantUrl, variantSrcSet } from "@/lib/utils";

type Props = {
  /** The artwork's objectKey, e.g. "collection-of-beauty/Monet_Foo.jpg". */
  objectKey: string;
  alt: string;
  /** CSS "sizes" hint, e.g. "(max-width: 640px) 50vw, 20vw". Required:
   *  the browser uses it together with srcSet to pick the right variant. */
  sizes: string;
  /** Widths (px) for which pre-built AVIF/WebP variants exist on disk.
   *  Mirrors Artwork.variantWidths; null/undefined/empty means no variants
   *  have been shrunk yet, so we skip the srcSet and serve a single
   *  fallback variant. */
  variantWidths?: readonly number[] | null;
  /** Intrinsic source dimensions. Optional in `fill` mode (aspect is
   *  CSS-controlled there). Required in fixed layout to prevent CLS. */
  srcWidth?: number;
  srcHeight?: number;
  className?: string;
  /** If true, the <img> is absolutely positioned to cover its parent.
   *  Mirrors next/image's <Image fill>. Parent must be `position: relative`. */
  fill?: boolean;
  loading?: "lazy" | "eager";
  /** Hints the first contentful image — sets fetchpriority=high and eager. */
  priority?: boolean;
  /** Average RGB hex (e.g. "#a87b4f") painted as the <img>'s
   *  background-color. While the AVIF variant downloads on slow mobile
   *  connections the tile shows this tint at the correct aspect ratio
   *  rather than an empty white box; once pixels decode they cover the
   *  tint. Mirrors Artwork.dominantColor. Null/undefined = no tint. */
  dominantColor?: string | null;
  style?: CSSProperties;
};

/**
 * Plain <picture>/<source> serving pre-built variants from rclone.
 * No /_next/image, no runtime CPU, no prewarm — just static files.
 *
 * AVIF-only for the responsive srcSet. Global AVIF support is ~96% (every
 * browser since Safari 16.4 / March 2023), and WebP isn't generated at
 * srcSet widths anymore — shrink-sources.mjs only emits a single 1280w
 * WebP for OG meta tags and email templates. Browsers pre-Safari-16.4
 * fall through to exactly that 1280w WebP via the <img src> below.
 *
 * When `variantWidths` is empty/null (nothing shrunk yet), we skip the
 * <picture> entirely and serve that one fallback variant.
 */
export function ResponsiveImage({
  objectKey,
  alt,
  sizes,
  variantWidths,
  srcWidth,
  srcHeight,
  className,
  fill,
  loading = "lazy",
  priority,
  dominantColor,
  style,
}: Props) {
  // React accepts `fetchPriority` (camelCase) as of 18.3 / 19. Older React
  // would warn but still emit it; we're on 19 so this is clean.
  const fetchPriority = priority ? ("high" as const) : undefined;
  const resolvedLoading = priority ? "eager" : loading;

  const hasVariants = variantWidths && variantWidths.length > 0;
  const fillClasses = "absolute inset-0 h-full w-full object-cover";
  const mergedStyle: CSSProperties | undefined = dominantColor
    ? { backgroundColor: dominantColor, ...style }
    : style;

  if (!hasVariants) {
    // No manifest — serve a single fallback variant, no <picture>: a
    // srcSet of widths we can't vouch for would leave the <img> broken
    // in browsers that pick a missing candidate. The original is not an
    // option here either; originals were never synced to the asset
    // bucket, so `assetUrl()` (what this branch used to serve) is a
    // guaranteed 404. Assuming the standard ladder at least resolves
    // for anything that has actually been shrunk.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      // biome-ignore lint/performance/noImgElement: fallback when no variants exist; next/image does not fit the rclone-backed pipeline (variants are pre-built, not optimized at request time).
      <img
        src={fallbackVariantUrl(objectKey)}
        alt={alt}
        data-object-key={objectKey}
        width={fill ? undefined : srcWidth}
        height={fill ? undefined : srcHeight}
        loading={resolvedLoading}
        fetchPriority={fetchPriority}
        className={cn(fill && fillClasses, className)}
        style={mergedStyle}
      />
    );
  }

  const avif = variantSrcSet(objectKey, "avif", variantWidths);
  // Fallback src for clients that didn't match any <source> — non-AVIF
  // browsers and most crawlers. It has to be the 1280w WebP: the
  // original doesn't exist on the asset host (variants only), so the
  // assetUrl() this used to serve 404'd for every artwork. One fixed
  // width can't track the viewport, but a slightly-wrong-sized image
  // that renders beats a correctly-sized one that doesn't.
  const fallback = fallbackVariantUrl(objectKey, variantWidths);

  if (fill) {
    return (
      <picture>
        <source type="image/avif" srcSet={avif} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallback}
          alt={alt}
          data-object-key={objectKey}
          sizes={sizes}
          loading={resolvedLoading}
          fetchPriority={fetchPriority}
          className={cn(fillClasses, className)}
          style={mergedStyle}
        />
      </picture>
    );
  }

  return (
    <picture>
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fallback}
        alt={alt}
        data-object-key={objectKey}
        width={srcWidth}
        height={srcHeight}
        sizes={sizes}
        loading={resolvedLoading}
        fetchPriority={fetchPriority}
        className={className}
        style={mergedStyle}
      />
    </picture>
  );
}
