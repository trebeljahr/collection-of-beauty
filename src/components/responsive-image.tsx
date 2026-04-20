import type { CSSProperties } from "react";
import { cn, variantSrcSet, variantUrl } from "@/lib/utils";

type Props = {
  /** The artwork's objectKey, e.g. "collection-of-beauty/Monet_Foo.jpg". */
  objectKey: string;
  alt: string;
  /** CSS "sizes" hint, e.g. "(max-width: 640px) 50vw, 20vw". Required:
   *  the browser uses it together with srcSet to pick the right variant. */
  sizes: string;
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
 * Format ladder: AVIF → WebP → implicit <img src> (WebP, 960w). Every
 * browser that supports AVIF also supports WebP, and WebP is ~universal
 * since 2020. We don't ship a JPEG fallback.
 */
export function ResponsiveImage({
  objectKey,
  alt,
  sizes,
  srcWidth,
  srcHeight,
  className,
  fill,
  loading = "lazy",
  priority,
  style,
}: Props) {
  const avif = variantSrcSet(objectKey, "avif");
  const webp = variantSrcSet(objectKey, "webp");
  // Middle variant as the <img src> fallback. If <picture>/<source> works
  // (all modern browsers), this is only fetched when no srcSet candidate
  // matches the viewport — rare.
  const fallback = variantUrl(objectKey, 960, "webp");

  // React accepts `fetchPriority` (camelCase) as of 18.3 / 19. Older React
  // would warn but still emit it; we're on 19 so this is clean.
  const fetchPriority = priority ? ("high" as const) : undefined;
  const resolvedLoading = priority ? "eager" : loading;

  if (fill) {
    return (
      <picture>
        <source type="image/avif" srcSet={avif} sizes={sizes} />
        <source type="image/webp" srcSet={webp} sizes={sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fallback}
          alt={alt}
          sizes={sizes}
          loading={resolvedLoading}
          fetchPriority={fetchPriority}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            className,
          )}
          style={style}
        />
      </picture>
    );
  }

  return (
    <picture>
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      <source type="image/webp" srcSet={webp} sizes={sizes} />
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
