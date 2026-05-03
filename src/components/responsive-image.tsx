import type { CSSProperties } from "react";
import { assetUrl, cn, variantSrcSet } from "@/lib/utils";

type Props = {
  /** The artwork's objectKey, e.g. "collection-of-beauty/Monet_Foo.jpg". */
  objectKey: string;
  alt: string;
  /** CSS "sizes" hint, e.g. "(max-width: 640px) 50vw, 20vw". Required:
   *  the browser uses it together with srcSet to pick the right variant. */
  sizes: string;
  /** Widths (px) for which pre-built AVIF/WebP variants exist on disk.
   *  Mirrors Artwork.variantWidths; null/undefined/empty means no variants
   *  have been shrunk yet, so we fall through to the raw original. */
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
 * fall through to the original via the <img src> fallback below.
 *
 * When `variantWidths` is empty/null (nothing shrunk yet), we skip the
 * <picture> entirely and point <img> at the original.
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
  style,
}: Props) {
  // React accepts `fetchPriority` (camelCase) as of 18.3 / 19. Older React
  // would warn but still emit it; we're on 19 so this is clean.
  const fetchPriority = priority ? ("high" as const) : undefined;
  const resolvedLoading = priority ? "eager" : loading;

  const hasVariants = variantWidths && variantWidths.length > 0;
  const fillClasses = "absolute inset-0 h-full w-full object-cover";

  if (!hasVariants) {
    // No shrunk variants — serve the original directly. <picture> tags
    // with 404'ing <source> srcSets would leave the <img> broken in
    // browsers that pick a missing candidate.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetUrl(objectKey)}
        alt={alt}
        width={fill ? undefined : srcWidth}
        height={fill ? undefined : srcHeight}
        loading={resolvedLoading}
        fetchPriority={fetchPriority}
        className={cn(fill && fillClasses, className)}
        style={style}
      />
    );
  }

  const avif = variantSrcSet(objectKey, "avif", variantWidths);
  // Fallback src for browsers that didn't match any <source>. We point at
  // the original rather than a WebP variant: WebP is only shrunk at 1280
  // now (for OG/email), so using it as the fallback would disagree with
  // the chosen viewport width for anything but ~1280-sized renders.
  const fallback = assetUrl(objectKey);

  if (fill) {
    return (
      <picture>
        <source type="image/avif" srcSet={avif} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallback}
          alt={alt}
          sizes={sizes}
          loading={resolvedLoading}
          fetchPriority={fetchPriority}
          className={cn(fillClasses, className)}
          style={style}
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
        width={srcWidth}
        height={srcHeight}
        sizes={sizes}
        loading={resolvedLoading}
        fetchPriority={fetchPriority}
        className={className}
        style={style}
      />
    </picture>
  );
}
