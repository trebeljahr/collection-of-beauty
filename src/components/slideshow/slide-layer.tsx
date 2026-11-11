"use client";

import { useLayoutEffect, useRef } from "react";
import { artworkAlt } from "@/lib/artwork-format";
import type { PreparedSlide } from "./prepare-slide";

export type SlideLayerData = {
  /** The player's commit count for this slide. Unique per layer, and
   *  newer layers have larger keys. */
  key: number;
  slide: PreparedSlide;
  fadeMs: number;
};

/**
 * One work on the stage. Mounted on top of the previous layer and faded
 * in over it; the layer underneath stays opaque, so the cross-fade never
 * dips through black.
 *
 * The <img> fills the stage and letterboxes itself with object-contain,
 * on a black background of its own. So a layer is the whole frame, bars
 * included, and fading it in fades the work underneath out everywhere:
 * where the two works overlap and where the one below reaches past the
 * one on top. With a transparent letterbox, a wide work under a tall one
 * stayed at full strength either side of it until the fade ended and
 * the layer was unmounted, which read as two works on screen at once.
 *
 * The fade is a Web Animation on the element rather than a CSS
 * transition: it starts on the frame the layer mounts (there is no
 * "previous style" to transition from), and `finished` says exactly when
 * it is done so the layer below can be unmounted.
 */
export function SlideLayer({
  layer,
  front,
  onShown,
}: {
  layer: SlideLayerData;
  front: boolean;
  onShown: (key: number) => void;
}) {
  const ref = useRef<HTMLImageElement | null>(null);
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;

  // Mount only: a layer's image and fade never change. A new work is a
  // new layer with a new key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per layer by design; the live values are read through refs
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { key, fadeMs } = layer;
    let cancelled = false;
    let fade: Animation | null = null;

    // No Web Animations (very old engines): show the work without a fade.
    if (typeof el.animate !== "function") {
      el.style.opacity = "1";
      onShownRef.current(key);
      return;
    }

    // The bitmap was decoded during prepare, so this resolves at once; it
    // only guards against the browser having evicted it since.
    el.decode()
      .catch(() => {})
      .then(() => {
        if (cancelled) return;
        fade = el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: fadeMs,
          easing: "ease-in-out",
          fill: "forwards",
        });
        fade.finished
          .then(() => {
            if (!cancelled) onShownRef.current(key);
          })
          .catch(() => {});
      });

    return () => {
      cancelled = true;
      fade?.cancel();
    };
  }, []);

  const art = layer.slide.art;
  return (
    // biome-ignore lint/performance/noImgElement: the slide is fetched and decoded ahead of time at a chosen rung; this element must reuse that exact URL, which next/image would rewrite.
    <img
      ref={ref}
      src={layer.slide.src}
      alt={front ? artworkAlt(art) : ""}
      aria-hidden={front ? undefined : true}
      draggable={false}
      decoding="async"
      className="absolute inset-0 h-full w-full bg-black object-contain opacity-0 will-change-[opacity]"
    />
  );
}
