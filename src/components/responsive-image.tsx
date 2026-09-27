import type { CSSProperties, ReactNode } from "react";
import { ProgressiveImage } from "@/components/progressive-image";
import { type ThumbHashFit, ThumbHashPicture } from "@/components/thumbhash-picture";
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
  /** Paint the tile progressively — a shimmering tint, then a blurred
   *  256 px thumbnail, then the sharp variant fading in on top. For lazy
   *  gallery tiles on slow connections; ignored for `priority` images
   *  (an LCP image wants its full pixels first, not a thumbnail ahead of
   *  them) and when no variants exist. See progressive-image.tsx. */
  progressive?: boolean;
  /** Artwork.thumbHash. When set, a blurred preview of the work paints
   *  over the `dominantColor` tint until the variant's pixels arrive, then
   *  cross-fades to them (see thumbhash-picture.tsx). Decoded in a client
   *  leaf, so a server component can pass it without the data URL
   *  entering the RSC payload. Null/undefined renders exactly the markup
   *  this component always has. */
  thumbHash?: string | null;
  /** How the blur maps onto the image box. Defaults to `stretch` outside
   *  `fill` mode, where the <img> box is the work's own aspect, and to
   *  `cover` inside it, matching the object-cover crop. */
  thumbHashFit?: ThumbHashFit;
  /** The work's own pixel size, read only for the aspect the blur is
   *  decoded at; null/missing falls back to `srcWidth`/`srcHeight`, then
   *  to the hash's own aspect. Pass it wherever those aren't the work's
   *  size: a `fill` image has none, and a gallery tile's are its solved
   *  cell size, rounded to 3 decimals, which can tip a 3:4 work (exactly
   *  4.5 cells on the short side) to a different grid once the client
   *  re-solves the row at its measured width. */
  workWidth?: number | null;
  workHeight?: number | null;
  /** Keep the blur out of the server and hydration renders and add it
   *  right after hydration. For SSR'd gallery tiles past the eager
   *  budget (EAGER_BLUR_TILES in artwork-gallery.tsx). */
  deferThumbHash?: boolean;
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
  progressive,
  thumbHash,
  thumbHashFit,
  workWidth,
  workHeight,
  deferThumbHash,
}: Props) {
  // React accepts `fetchPriority` (camelCase) as of 18.3 / 19. Older React
  // would warn but still emit it; we're on 19 so this is clean.
  const fetchPriority = priority ? ("high" as const) : undefined;
  const resolvedLoading = priority ? "eager" : loading;

  const hasVariants = variantWidths && variantWidths.length > 0;
  const blurFit: ThumbHashFit = thumbHashFit ?? (fill ? "cover" : "stretch");
  const blurWidth = workWidth ?? srcWidth;
  const blurHeight = workHeight ?? srcHeight;

  // Progressive path: only for lazy tiles that have a variant ladder. An
  // LCP/priority image skips it (it wants full pixels first, not a
  // thumbnail competing for the connection), and a work with no manifest
  // has no ladder to step through — both fall through to the plain markup.
  if (progressive && !priority && hasVariants) {
    return (
      <ProgressiveImage
        objectKey={objectKey}
        alt={alt}
        sizes={sizes}
        variantWidths={variantWidths}
        srcWidth={srcWidth}
        srcHeight={srcHeight}
        fill={fill}
        dominantColor={dominantColor}
        className={className}
        thumbHash={thumbHash}
        thumbHashFit={blurFit}
        workWidth={blurWidth}
        workHeight={blurHeight}
        deferThumbHash={deferThumbHash}
      />
    );
  }
  const fillClasses = "absolute inset-0 h-full w-full object-cover";
  const mergedStyle: CSSProperties | undefined = dominantColor
    ? { backgroundColor: dominantColor, ...style }
    : style;

  // With a hash the <picture> becomes the blur's client leaf; without
  // one this is the identity and the markup is what it always was.
  const withBlur = (children: ReactNode) =>
    thumbHash ? (
      <ThumbHashPicture
        thumbHash={thumbHash}
        width={blurWidth}
        height={blurHeight}
        fit={blurFit}
        fill={fill}
        defer={deferThumbHash}
        objectKey={objectKey}
        dominantColor={dominantColor}
      >
        {children}
      </ThumbHashPicture>
    ) : (
      children
    );

  if (!hasVariants) {
    // No manifest — serve a single fallback variant, no <picture>: a
    // srcSet of widths we can't vouch for would leave the <img> broken
    // in browsers that pick a missing candidate. The original is not an
    // option here either; originals were never synced to the asset
    // bucket, so `assetUrl()` (what this branch used to serve) is a
    // guaranteed 404. Assuming the standard ladder at least resolves
    // for anything that has actually been shrunk. A blur still needs a
    // wrapper to fade over, so with a hash the lone <img> goes inside a
    // <picture> with no <source>s, which is valid and changes nothing else.
    return withBlur(
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
      />,
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

  // In `fill` mode the parent's box supplies the geometry, so intrinsic
  // width/height are omitted and the <img> is stretched to cover it.
  const sources = (
    <>
      <source type="image/avif" srcSet={avif} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* biome-ignore lint/performance/noImgElement: always ends up inside a <picture> (below, or ThumbHashPicture's); the fragment just hides that from the rule. */}
      <img
        src={fallback}
        alt={alt}
        data-object-key={objectKey}
        width={fill ? undefined : srcWidth}
        height={fill ? undefined : srcHeight}
        sizes={sizes}
        loading={resolvedLoading}
        fetchPriority={fetchPriority}
        className={fill ? cn(fillClasses, className) : className}
        style={mergedStyle}
      />
    </>
  );
  return thumbHash ? withBlur(sources) : <picture>{sources}</picture>;
}
