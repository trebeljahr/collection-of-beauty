"use client";

import {
  type CSSProperties,
  type SyntheticEvent,
  type TransitionEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { artworkAlt, displayTitle } from "@/lib/artwork-format";
import { getLoadedVariant, recordLoadedVariant } from "@/lib/image-cache";
import type { ScaleReference } from "@/lib/real-size";
import type { Box, Scene } from "@/lib/real-size-scene";
import { saveBackFlipSnapshot } from "@/lib/use-artwork-back-flip";
import { cn, fallbackVariantUrl, variantSrcSet, variantUrl } from "@/lib/utils";
import { artworkHeroVtName } from "@/lib/view-transitions";
import { SCALE_STAGE_ID, ScaleReferenceDrawing, useScaleView } from "./artwork-scale";
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
  /** Scale view geometry, for a work with a trusted size. The toggle in
   *  the aside (ArtworkScaleToggle) switches it on. */
  scale?: { scene: Scene; reference: ScaleReference } | null;
};

// Prev/next, their arrow keys and their prefetch live in ArtworkScopeNav,
// which knows the scope the visitor is walking.
export function ArtworkViewer({ art, scale = null }: Props) {
  const { open } = useLightbox();
  const scaleOn = useScaleView();
  const scene = scale && scaleOn ? scale.scene : null;

  // Force scroll to top on prev/next navigation. Next.js App Router's
  // default scroll handling for same-layout, same-segment transitions
  // leaves the viewport anchored near the previous artwork's h1, which
  // hides the top nav row ("Back to gallery", Previous, Next).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [art.id]);

  const alt = artworkAlt(art);

  // The scale view resizes the image in place, so the back-to-gallery
  // FLIP must start from wherever it ends up, not the full-size box.
  const saveSnapshot = (e: TransitionEvent<HTMLDivElement>) => {
    const img = e.currentTarget.querySelector<HTMLImageElement>("img[data-object-key]");
    if (img) saveBackFlipSnapshot(art.id, img);
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <div
        id={scale ? SCALE_STAGE_ID : undefined}
        className={cn("relative mx-auto scroll-mt-20", RESIZE_MOTION)}
        style={stageStyle(scene ? scene.width / scene.height : imageAspect(art))}
        onTransitionEnd={scale ? saveSnapshot : undefined}
      >
        {scale && (
          // The 404 wall's moulding and mat, to scale round the work. The
          // mat also fills any gap between the box and the scan when their
          // aspects differ.
          <>
            <div
              aria-hidden="true"
              className={cn(
                "wall-frame absolute",
                sceneFade(scene),
                // A frame standing on the floor casts no shadow below it.
                scale.scene.frame.y <= 0 && "[clip-path:inset(-4rem_-4rem_0_-4rem)]",
              )}
              style={placeIn(scale.scene.frame, scale.scene)}
            />
            <div
              aria-hidden="true"
              className={cn("wall-frame-mat absolute", sceneFade(scene))}
              style={placeIn(scale.scene.mat, scale.scene)}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => open(art)}
          title="View fullscreen"
          aria-label={`Open ${displayTitle(art)} in fullscreen viewer`}
          className={cn(
            "absolute block cursor-zoom-in rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            RESIZE_MOTION,
            // Square corners inside the mat.
            scene && "[&_img]:rounded-none",
          )}
          style={scene ? placeIn(scene.work, scene) : FILL}
        >
          {/* key on the artwork id so progressive state resets cleanly on
              prev/next navigation. */}
          <ArtworkImage key={art.id} art={art} alt={alt} />
        </button>
        {scale && (
          <ScaleReferenceDrawing
            reference={scale.reference}
            style={placeIn(scale.scene.ref, scale.scene)}
            className={cn(
              "pointer-events-none text-[var(--muted-foreground)]",
              sceneFade(scene, "opacity-70"),
            )}
          />
        )}
      </div>
      {scale && (
        // The floor: a line under the stage across the whole frame, with
        // the frame's bottom padding below it tinted as the ground.
        <div
          aria-hidden="true"
          className={cn(
            "-mx-[10px] -mb-[10px] h-[10px] rounded-b-[11px] border-t border-[var(--muted-foreground)]/40 bg-[var(--foreground)]/[0.05] transition-opacity duration-300 motion-reduce:transition-none",
            scene ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}

/** Same duration and curve on the stage and the image inside it, so the
 *  image's percentages and the stage's size move as one. */
const RESIZE_MOTION =
  "transition-[width,height,left,bottom] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

const FILL: CSSProperties = { left: "0%", bottom: "0%", width: "100%", height: "100%" };

/** The frame and the reference fade in once the image has started to
 *  move, and out at once. */
function sceneFade(scene: Scene | null, shown = "opacity-100"): string {
  return cn(
    "transition-opacity motion-reduce:transition-none",
    scene ? `${shown} delay-200 duration-300` : "opacity-0 duration-150",
  );
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

/** A scene box (cm, origin bottom left) as percentages of the stage. */
function placeIn(box: Box, scene: Scene): CSSProperties {
  return {
    left: pct(box.x / scene.width),
    bottom: pct(box.y / scene.height),
    width: pct(box.w / scene.width),
    height: pct(box.h / scene.height),
  };
}

// The image fills its wrapper, and the wrapper fills the stage, which
// carries the artwork's aspect ratio, so no intrinsic sizing is needed to
// lay it out.
const IMG_BOX = "block h-full w-full rounded-md object-contain";

function imageAspect({ width, height }: Pick<ArtworkLike, "width" | "height">): number {
  const w = width && width > 0 ? width : 1600;
  const h = height && height > 0 ? height : 2000;
  return w / h;
}

// Geometry for the stage, derived purely from the artwork's known source
// dimensions (in the scale view, from the scene's). Reserving it in CSS
// means the frame has its final size on the very first paint — before a
// single byte of the image has arrived. Without this, an undecoded <img>
// with width/height:auto has no intrinsic size, so the browser lays it
// out at the 300 px replaced-element default and the grey frame visibly
// snaps open once the image decodes — a flicker on every prev/next
// navigation.
//
// Width and height are both given, rather than a width and an
// aspect-ratio, so the switch to the scale view can transition them.
// `cqw` is the frame's content width: the viewer root is the container.
//
// Cap the height a touch under the bordered box's max-h-[85vh] so the
// 10 px padding on either side never makes it overflow the frame.
function stageStyle(aspect: number): CSSProperties {
  const maxHeight = "(85vh - 24px)";
  return {
    width: `min(100cqw, calc(${maxHeight} * ${aspect}))`,
    height: `min(calc(100cqw / ${aspect}), calc${maxHeight})`,
  };
}

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
  // Not the original: originals were never synced to the asset host, so
  // this has to resolve to a variant that exists (1280w WebP) or the
  // hero is broken for every non-AVIF client and every crawler.
  const fallbackSrc = fallbackVariantUrl(art.objectKey, widths);
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

  // Snapshot the hero's geometry into sessionStorage so the gallery can
  // run its merge-back FLIP when the user navigates back. Updated on
  // mount, after the high-res image loads (size may shift slightly), on
  // every scroll, and on resize, so whatever bounds are current at the
  // moment of back-nav is what the FLIP starts from.
  useEffect(() => {
    if (!mounted) return;
    const save = () => {
      const img = highRef.current;
      if (img) saveBackFlipSnapshot(art.id, img);
    };
    save();
    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("resize", save);
    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener("resize", save);
    };
  }, [mounted, art.id, highReady]);

  const handleHighLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    setHighReady(true);
    recordLoadedVariant(art.objectKey, e.currentTarget.currentSrc || e.currentTarget.src);
  };

  const showPlaceholder = mounted && placeholderSrc != null && !highReady;

  const vtName = artworkHeroVtName(art.id);

  if (!hasVariants) {
    // No manifest — single fallback-variant load, no ladder to bridge.
    return (
      <div className="relative h-full w-full">
        {/* biome-ignore lint/performance/noImgElement: rclone-backed variant ladder; next/image's request-time optimizer is not in this path. */}
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
          style={{ viewTransitionName: vtName }}
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* block + full size so the <img>'s h-full resolves against the
          aspect-ratio wrapper rather than an auto-height inline box. */}
      <picture className="block h-full w-full">
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
          style={{ viewTransitionName: vtName }}
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
          className={cn(IMG_BOX, "pointer-events-none absolute inset-0")}
        />
      )}
    </div>
  );
}
