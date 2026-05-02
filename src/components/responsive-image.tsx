"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
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
  /** When true, render the image behind a CSS blur with a "Reveal"
   *  overlay button. Per-image reveal is local state — clicking the
   *  overlay only lifts the blur for this instance, leaving the
   *  global NSFW preference (in NsfwProvider) untouched. */
  nsfw?: boolean;
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
  nsfw,
}: Props) {
  // React accepts `fetchPriority` (camelCase) as of 18.3 / 19. Older React
  // would warn but still emit it; we're on 19 so this is clean.
  const fetchPriority = priority ? ("high" as const) : undefined;
  const resolvedLoading = priority ? "eager" : loading;
  const [revealed, setRevealed] = useState(false);

  const hasVariants = variantWidths && variantWidths.length > 0;
  const fillClasses = "absolute inset-0 h-full w-full object-cover";

  const wrapInBlur = (img: ReactNode) => {
    if (!nsfw || revealed) return img;
    return <NsfwBlurOverlay onReveal={() => setRevealed(true)}>{img}</NsfwBlurOverlay>;
  };

  if (!hasVariants) {
    // No shrunk variants — serve the original directly. <picture> tags
    // with 404'ing <source> srcSets would leave the <img> broken in
    // browsers that pick a missing candidate.
    return wrapInBlur(
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
      />,
    );
  }

  const avif = variantSrcSet(objectKey, "avif", variantWidths);
  // Fallback src for browsers that didn't match any <source>. We point at
  // the original rather than a WebP variant: WebP is only shrunk at 1280
  // now (for OG/email), so using it as the fallback would disagree with
  // the chosen viewport width for anything but ~1280-sized renders.
  const fallback = assetUrl(objectKey);

  if (fill) {
    return wrapInBlur(
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
      </picture>,
    );
  }

  return wrapInBlur(
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
    </picture>,
  );
}

/** Heavy CSS blur with a centred "Reveal" button. The blurred <img>
 *  still loads (the actual pixels are needed for the post-reveal
 *  swap), but the user only sees a smear until they explicitly click
 *  through. The overlay button is its own <button> so keyboard users
 *  can tab in and reveal with Enter/Space. */
function NsfwBlurOverlay({ children, onReveal }: { children: ReactNode; onReveal: () => void }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden
        className="h-full w-full"
        style={{ filter: "blur(28px)", transform: "scale(1.08)" }}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={(e) => {
          // Stop click bubbling so a parent <Link> doesn't navigate
          // away the moment the user reveals an image inside a tile.
          e.preventDefault();
          e.stopPropagation();
          onReveal();
        }}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="rounded-full bg-black/60 px-3 py-1 uppercase tracking-wide">
          NSFW — click to reveal
        </span>
      </button>
    </div>
  );
}
