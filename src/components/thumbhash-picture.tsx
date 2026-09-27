"use client";

import { type CSSProperties, type ReactNode, useCallback } from "react";
import { getLoadedVariant } from "@/lib/image-cache";
import { thumbHashBlurUrl } from "@/lib/thumbhash-grid";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

/** How the blur maps onto the image box. `stretch` when the box already
 *  has the work's aspect (a gallery tile, the /surprise frame): the grid
 *  spans the whole work, so stretching lands every cell on its own region,
 *  where `cover` would crop the grid's rounded aspect and `contain` would
 *  leave bars. `cover` when an object-cover image is cropped into a box of
 *  a different shape (the 4:5 artwork card). */
export type ThumbHashFit = "cover" | "stretch";

/** The CSS custom properties a blur carries — shared with
 *  progressive-image.tsx so the plain -> progressive remount on a slow
 *  connection paints the identical preview. */
export function thumbHashBlurStyle(
  blur: string | null,
  fit: ThumbHashFit,
): Record<"--ri-blur" | "--ri-blur-size", string> | undefined {
  if (!blur) return undefined;
  return {
    "--ri-blur": `url(${blur})`,
    "--ri-blur-size": fit === "stretch" ? "100% 100%" : "cover",
  };
}

type Props = {
  /** Artwork.thumbHash — base64, unpadded. */
  thumbHash: string;
  /** The work's pixel size, read for its aspect only. Missing -> the
   *  hash's own aspect. */
  width?: number | null;
  height?: number | null;
  fit: ThumbHashFit;
  /** Absolutely cover the parent, like the <img> in ResponsiveImage's
   *  `fill` mode. */
  fill?: boolean;
  /** Leave the blur out of the server render and the hydration render,
   *  and add it right after hydration. For SSR'd tiles past the eager
   *  budget, so a page of 80 tiles doesn't carry 80 data URLs in its
   *  HTML. No effect on a client mount, which decodes straight away. */
  defer?: boolean;
  /** Keys the "already loaded this session" check in image-cache.ts. */
  objectKey: string;
  dominantColor?: string | null;
  /** The <source>s and the one <img> ResponsiveImage would otherwise put
   *  in a bare <picture>. */
  children: ReactNode;
};

/**
 * The <picture> of a ResponsiveImage whose work has a thumbHash, painting
 * a blurred preview of the work until the variant's pixels arrive and then
 * cross-fading to them.
 *
 * A client leaf so the decode happens here: the props that cross the RSC
 * boundary carry the ~28-character hash, never the ~240-character data
 * URL, when a server component (ArtworkCard) renders ResponsiveImage.
 *
 * The decoded grid is set once, as `--ri-blur` on this <picture>. Two
 * things paint it (see `.ri-blur` in globals.css): the <picture> itself,
 * and the <img>, which inherits the variable as its own background. The
 * img's copy matters because the view-transition FLIP and the back-flip
 * snapshot and measure the img alone, so the img has to look right by
 * itself at every moment. The picture's copy is what shows through when
 * the img, on its load event, runs a short opacity 0 -> 1 keyframe: the
 * blur beneath is identical, so the pixels cross-fade in over it. No
 * extra <img> for the blur (the FLIP takes the tile's first img), and no
 * `data-object-key` on anything but the real image (image-cache.ts
 * records every one that loads).
 */
export function ThumbHashPicture({
  thumbHash,
  width,
  height,
  fit,
  fill,
  defer,
  objectKey,
  dominantColor,
  children,
}: Props) {
  const hydrated = useHydrated();
  const blur = defer && !hydrated ? null : thumbHashBlurUrl(thumbHash, width, height);

  // Wiring the load listener here rather than as the img's onLoad keeps
  // the img a plain element that a server component can render. `load`
  // doesn't bubble, so it is caught on the way down, in the capture phase.
  const ref = useCallback(
    (node: HTMLPictureElement | null) => {
      if (!node) return;
      const img = node.querySelector("img");
      // No fade for pixels that are already on screen (the SSR'd img
      // finished before hydration, or a memory-cache hit completed on
      // insert) or for a variant this session already fetched, where a
      // fade would only hold the image back. Sampled now, not in the
      // handler: image-cache.ts records *this* load in a document-level
      // capture listener that runs before ours.
      let settled =
        (img?.complete === true && img.naturalWidth > 0) || getLoadedVariant(objectKey) != null;
      const onLoad = (event: Event) => {
        const target = event.target;
        if (settled || !(target instanceof HTMLImageElement)) return;
        // Later loads are srcset upgrades over pixels already showing.
        settled = true;
        // Only fade from a blur. Without one (a hash that didn't decode,
        // or a deferred tile whose image beat hydration), the picture
        // paints nothing and the fade would flash the page through.
        if (!node.style.getPropertyValue("--ri-blur")) return;
        // Set on the element directly, not through state: a re-render
        // could land a frame after the pixels first paint, showing them
        // sharp and then snapping to transparent. The load task runs
        // before that paint. React never owns this attribute, so no
        // render removes it; animationend does, so a later re-insert or
        // display toggle can't replay the fade.
        target.setAttribute("data-ri-reveal", "");
        target.addEventListener("animationend", () => target.removeAttribute("data-ri-reveal"), {
          once: true,
        });
      };
      node.addEventListener("load", onLoad, true);
      return () => node.removeEventListener("load", onLoad, true);
    },
    [objectKey],
  );

  const blurStyle = thumbHashBlurStyle(blur, fit);
  const style: CSSProperties | undefined = blurStyle
    ? ({ ...blurStyle, backgroundColor: dominantColor ?? undefined } as CSSProperties)
    : undefined;

  // In fill mode the picture takes its parent's rounding, so a rounded
  // frame (the /surprise link) rounds the blur behind its rounded img
  // without an overflow clip on the frame. That clip would also cut off
  // anything the frame paints outside its box, such as the hero glow.
  return (
    <picture
      ref={ref}
      className={cn("ri-blur", fill && "absolute inset-0 rounded-[inherit]")}
      style={style}
    >
      {children}
    </picture>
  );
}
