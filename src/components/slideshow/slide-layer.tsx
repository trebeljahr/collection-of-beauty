"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { artworkAlt } from "@/lib/artwork-format";
import { panKeyframes } from "@/lib/slideshow";
import type { PreparedSlide } from "./prepare-slide";

export type SlideLayerData = {
  /** The player's commit count for this slide. Unique per layer, and
   *  newer layers have larger keys. */
  key: number;
  slide: PreparedSlide;
  fadeMs: number;
  /** Interval plus the fade, so the drift is still moving while the next
   *  work fades in over it. */
  panMs: number;
};

/**
 * One work on the stage. Mounted on top of the previous layer and faded
 * in over it; the layer underneath stays opaque, so the cross-fade never
 * dips through black.
 *
 * The <img> fills the stage and letterboxes itself with object-contain,
 * which keeps the pan's percentages relative to the stage box — the box
 * the no-gap invariant in `panPlan` is written against.
 *
 * Both animations are Web Animations on the element rather than CSS
 * transitions: they start on the frame the layer mounts (there is no
 * "previous style" to transition from), they can be paused mid-drift
 * without reading back a computed transform, and `finished` says exactly
 * when the fade is done so the layer below can be unmounted.
 */
export function SlideLayer({
  layer,
  front,
  paused,
  onShown,
}: {
  layer: SlideLayerData;
  front: boolean;
  paused: boolean;
  onShown: (key: number) => void;
}) {
  const ref = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<Animation | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onShownRef = useRef(onShown);
  onShownRef.current = onShown;

  // Mount only: a layer's image, fade and pan never change. A new work is
  // a new layer with a new key.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per layer by design; the live values are read through refs
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { key, fadeMs, panMs, slide } = layer;
    let cancelled = false;
    let fade: Animation | null = null;

    // No Web Animations (very old engines): show the work without motion.
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
        if (slide.plan) {
          const pan = el.animate(panKeyframes(slide.plan), {
            duration: panMs,
            easing: "linear",
            fill: "forwards",
          });
          if (pausedRef.current) pan.pause();
          panRef.current = pan;
        }
        fade.finished
          .then(() => {
            if (!cancelled) onShownRef.current(key);
          })
          .catch(() => {});
      });

    return () => {
      cancelled = true;
      fade?.cancel();
      panRef.current?.cancel();
      panRef.current = null;
    };
  }, []);

  // Pause freezes the drift where it is. A fade in progress is left to
  // finish: half a cross-fade frozen on screen is two works at once.
  useEffect(() => {
    const pan = panRef.current;
    // play() on a finished animation rewinds it to the first frame.
    if (!pan || pan.playState === "finished") return;
    if (paused) pan.pause();
    else pan.play();
  }, [paused]);

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
      className="absolute inset-0 h-full w-full object-contain opacity-0 will-change-[transform,opacity]"
    />
  );
}
