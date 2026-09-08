"use client";

import dynamic from "next/dynamic";
import { type TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { deepZoomTileSource, largestSingleImageWidth } from "@/lib/deep-zoom";
import { getLoadedVariant, recordLoadedVariant } from "@/lib/image-cache";
import { cn, fallbackVariantUrl, variantUrl } from "@/lib/utils";

// Split out of the main bundle: the viewer pulls in OpenSeadragon, which
// is only ever needed for the works that have a tile pyramid. `ssr: false`
// because OpenSeadragon touches `window` at module scope.
const DeepZoomViewer = dynamic(() => import("./deep-zoom-viewer").then((m) => m.DeepZoomViewer), {
  ssr: false,
});

/* The overlay root is `fixed inset-0`, so it is sized by the layout
   viewport — the box that grows and shrinks as mobile Safari's address
   bar retracts. `100dvh` is the unit that tracks that same box. `100vh`
   resolves to the *large* viewport (bar hidden) no matter what the bar is
   doing, so with the bar showing this inner box overhangs the visible
   area and the object-contain image centres against it: pushed down,
   bottom cropped. `100svh` is the mirror-image bug — pinned to the
   smallest viewport, it would leave dead space once the bar retracts, so
   it is right for surprise-view.tsx's in-flow frame (which must never
   overflow) and wrong here. Same reasoning as site-nav.tsx's
   `minHeight: "100dvh"`. */
const VIEWPORT_BOX = { width: "100vw", height: "100dvh" } as const;

/* Notch / sensor-housing clearance for the top control layer. `max()`
   keeps the old flat 1rem on every device that reports zero insets, and
   the `0px` fallback covers browsers with no env() support at all, so
   nothing regresses off-iPhone. Landscape is the case that actually
   bites: the housing eats a whole screen edge, and a flat `p-4` puts the
   close button underneath it.

   These only resolve to anything because src/app/artwork/layout.tsx
   exports `viewportFit: "cover"` — `env(safe-area-inset-*)` is 0px on
   every page that hasn't opted in. The lightbox is portalled to
   document.body and so escapes that layout's own safe-area gutter; it
   has to inset itself. If this overlay is ever mounted from a route
   outside /artwork, that route needs the same viewport export or these
   three quietly collapse back to the flat 1rem.

   Applied inline, which beats the element's `p-4` class for these three
   sides and leaves padding-bottom as the 1rem that class set — they
   replace the flat padding rather than stacking on top of it, so there
   is no double inset. Bottom is deliberately untouched: this layer is
   pinned to the top, and the overlay has no bottom chrome at all (see
   the chevrons below, which are vertically centred). Nothing sits over
   the home indicator except the artwork itself, and letting a painting
   use the full display is the point of a fullscreen viewer — the
   indicator is a translucent pill over what is usually letterbox black. */
const SAFE_AREA_INSETS = {
  paddingTop: "max(1rem, env(safe-area-inset-top, 0px))",
  paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
  paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
} as const;

/* A gesture only counts as navigation once it has travelled this far —
   well past the handful of pixels a tap wobbles by, still short of a
   thumb's natural arc on the narrowest phone. */
const SWIPE_MIN_DISTANCE_PX = 60;
/* ...and only when it is predominantly horizontal. 1.5:1 tolerates the
   downward curve a thumb swipe naturally traces without swallowing what
   the user meant as a vertical drag. */
const SWIPE_HORIZONTAL_RATIO = 1.5;
/* react-zoom-pan-pinch settles back to exactly 1, but a pinch or wheel
   still springing can report a hair above it. Anything past this is a
   genuinely zoomed image, where a horizontal drag means pan, not next.
   Only governs the plain <img> path — the tiled viewer measures its own
   zoom against its own home level and reports the verdict (see
   HOME_ZOOM_EPSILON in deep-zoom-viewer.tsx). */
const SWIPE_MAX_RESTING_SCALE = 1.05;

type Props = {
  open: boolean;
  onClose: () => void;
  objectKey: string;
  variantWidths?: readonly number[] | null;
  alt: string;
  srcWidth?: number | null;
  srcHeight?: number | null;
  caption?: string;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
};

export function Lightbox({
  open,
  onClose,
  objectKey,
  variantWidths,
  alt,
  srcWidth,
  srcHeight,
  caption,
  onPrev,
  onNext,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [highReady, setHighReady] = useState(false);
  // Set when the pyramid turns out not to be there after all (bucket not
  // yet synced, library chunk blocked). Flips this artwork back to the
  // plain <img> path for the rest of the session.
  const [deepZoomFailed, setDeepZoomFailed] = useState(false);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  // Origin of the in-flight touch, null whenever the current gesture has
  // been disqualified (pinch, zoomed view).
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the visible image is zoomed in past its resting size, written
  // by whichever of the two viewers is mounted: react-zoom-pan-pinch's
  // onTransform on the plain <img> path, DeepZoomViewer's onZoomedChange
  // on the tiled one. A ref rather than state because it is only ever
  // read from the touch handlers, and re-rendering the lightbox on every
  // frame of a pinch to store it would be pure waste.
  const zoomedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const widths = variantWidths ?? [];
  const hasVariants = widths.length > 0;
  // Widest copy safe to fetch as one image. Normally the manifest max;
  // for a work carrying an above-ladder encode with no pyramid to stream
  // it, the widest ladder rung instead — the `useDeepZoom` guard on the
  // preload effect below cannot protect that case, since there is no
  // deep zoom to switch to.
  const highWidth = largestSingleImageWidth(variantWidths, srcWidth, srcHeight);
  // Originals aren't on the asset host (only the pre-built variants),
  // so every "no manifest" path lands on a fallback variant instead of
  // the raw file — an assetUrl() here 404s and leaves the modal empty.
  const fallbackSrc = fallbackVariantUrl(objectKey, widths);
  const highSrc = highWidth ? variantUrl(objectKey, highWidth, "avif") : fallbackSrc;
  // Placeholder: the exact variant the page below already loaded (so it's
  // in the HTTP cache and paints instantly), else the smallest variant as
  // a fast cold load. Reused across grid → detail page → fullscreen so
  // each step shows the previous step's bytes while the larger copy
  // arrives.
  const smallestSrc = hasVariants ? variantUrl(objectKey, widths[0], "avif") : fallbackSrc;
  const placeholderSrc = getLoadedVariant(objectKey) ?? smallestSrc;

  // Works whose source outgrew the variant ladder have a DZI pyramid on
  // the asset host (scripts/build-tiles.mjs). Memoised because the object
  // identity is the DeepZoomViewer effect's only dependency — rebuilding
  // it every render would tear down and re-create the viewer on each
  // parent update.
  const tileSource = useMemo(
    () => deepZoomTileSource(objectKey, variantWidths, srcWidth, srcHeight),
    [objectKey, variantWidths, srcWidth, srcHeight],
  );
  const useDeepZoom = tileSource !== null && !deepZoomFailed;

  // Reset everything when the displayed artwork changes (objectKey is the
  // unique identifier here). Without this, prev/next inside the lightbox
  // would leave stale zoom and a stale opacity state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: objectKey is the trigger, not a body dependency
  useEffect(() => {
    if (!open) return;
    setPlaceholderLoaded(false);
    setHighReady(false);
    setDeepZoomFailed(false);
    transformRef.current?.resetTransform(0);
    // resetTransform(0) skips the animation, so onTransform may never
    // fire for it — clear the zoom flag by hand or a swipe would stay
    // disabled on the next artwork.
    zoomedRef.current = false;
    swipeStartRef.current = null;
  }, [open, objectKey]);

  // Preload the high-res variant. Re-runs whenever the artwork (highSrc)
  // or open state changes. Cancellation prevents a stale onload from
  // flipping highReady true after a fast prev/next. onerror unblocks
  // the spinner if the URL 404s or the network is dropped — without it
  // the lightbox spins forever and the user has no way to know the
  // load broke.
  useEffect(() => {
    if (!open) return;
    // Skipped entirely for tiled works. `highSrc` there is the per-source
    // full-resolution AVIF — a median of ~124 megapixels and up to 89 MB —
    // and fetching it is exactly what the pyramid exists to avoid. Pulling
    // it in alongside the tiles would pay the full download and the ~500 MB
    // decode we were trying to get rid of.
    if (useDeepZoom) return;
    let cancelled = false;
    const img = new Image();
    const finish = () => {
      if (!cancelled) setHighReady(true);
    };
    img.onload = finish;
    img.onerror = finish;
    img.src = highSrc;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [open, highSrc, useDeepZoom]);

  // Arrows to navigate. Bound while open so pages don't double-handle
  // the same key. Escape, the focus trap and the body-scroll lock come
  // from useFocusTrap below — this overlay claims `aria-modal`, and the
  // controls are portalled to the end of <body>, so without a trap Tab
  // walks the whole obscured page before reaching them.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onPrev, onNext]);

  // Focus moves to the close button on open and back to whatever opened
  // the lightbox (a gallery card, the detail page's zoom trigger) on
  // close. The trigger lives in another component, so there's no ref to
  // pass — the hook falls back to the element that was focused when the
  // overlay went up, which is that trigger.
  useFocusTrap({
    active: open && mounted,
    containerRef: dialogRef,
    onEscape: onClose,
  });

  // Swipe left/right to step between artworks. On a phone that is the
  // expected lightbox gesture, and the chevrons are pinned to the extreme
  // screen edges where a thumb can barely reach them.
  //
  // Raw touch listeners on the overlay root rather than
  // react-zoom-pan-pinch's own callbacks: at the resting scale the content
  // already fits inside `limitToBounds`, so RZPP never starts a pan and
  // never reports one — the gesture we want is precisely the one it
  // ignores. Nothing below calls preventDefault or stopPropagation, so the
  // zoom layer still sees every event it saw before.
  //
  // Both paths are covered, because a third of the corpus renders through
  // the tiled viewer and those are the largest, best works — excluding
  // them would mean the gesture works on a coin-flip of the collection.
  // The one thing that path needs is the zoom state, which lives inside
  // OpenSeadragon; DeepZoomViewer reports it back through onZoomedChange,
  // into the same `zoomedRef` RZPP writes below. That the flag is the
  // whole gate is what makes this safe: at home zoom the viewer's
  // `visibilityRatio: 1` keeps the entire work inside the frame, so the
  // most a horizontal drag can do there is slide the painting around
  // inside its own letterbox margin — no detail can be dragged out of
  // sight, and nothing is taken from the viewer by reading that gesture
  // as navigation. The instant the user zooms in, the flag flips and the
  // drag goes back to being the pan it has to be.
  const beginSwipe = (e: ReactTouchEvent) => {
    // Disqualifiers: an already-zoomed view, where a horizontal drag
    // means pan and the zoom layer is entitled to the whole gesture; and
    // any second finger, which is a pinch belonging to that layer.
    if (zoomedRef.current || e.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const trackSwipe = (e: ReactTouchEvent) => {
    // A finger landing mid-gesture turns a drag into a pinch. Drop the
    // swipe rather than letting the pinch's residual sideways drift
    // register as a navigation on release.
    if (e.touches.length > 1) swipeStartRef.current = null;
  };

  const endSwipe = (e: ReactTouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    // Re-check the zoom flag: the gesture itself may have been a
    // double-tap-to-zoom, which starts at the resting scale and ends above it.
    if (!start || zoomedRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return;
    // Swiping left drags the current work off to the left, so the next one
    // arrives from the right — the same mapping as the chevrons, and
    // gated by the same null props, so the ends of the list still hold.
    if (dx < 0) onNext?.();
    else onPrev?.();
  };

  if (!open || !mounted) return null;

  // The deep-zoom viewer paints its own placeholder and reports its own
  // readiness, so the shared spinner only governs the plain <img> path.
  const showSpinner = !useDeepZoom && !placeholderLoaded && !highReady;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm"
      onTouchStart={beginSwipe}
      onTouchMove={trackSwipe}
      onTouchEnd={endSwipe}
      onTouchCancel={() => {
        swipeStartRef.current = null;
      }}
    >
      {useDeepZoom && tileSource ? (
        <DeepZoomViewer
          // Remount on artwork change so prev/next never shows the
          // previous work's pan position while the new pyramid opens.
          key={objectKey}
          tileSource={tileSource}
          placeholderSrc={placeholderSrc}
          alt={alt}
          onUnavailable={() => setDeepZoomFailed(true)}
          onZoomedChange={(zoomed) => {
            zoomedRef.current = zoomed;
          }}
        />
      ) : (
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={1}
          maxScale={8}
          centerOnInit
          doubleClick={{ mode: "toggle", step: 0.7 }}
          wheel={{ step: 0.13 }}
          pinch={{ step: 3.3 }}
          limitToBounds
          onTransform={(_ref, state) => {
            zoomedRef.current = state.scale > SWIPE_MAX_RESTING_SCALE;
          }}
        >
          <TransformComponent wrapperStyle={VIEWPORT_BOX} contentStyle={VIEWPORT_BOX}>
            <div className="relative w-screen" style={{ height: VIEWPORT_BOX.height }}>
              {/* Placeholder: the variant already cached from the grid /
                  detail page, shown until the high-res copy is decoded. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* biome-ignore lint/performance/noImgElement: manual variant selection + highReady swap; next/image's pipeline does not fit our rclone-backed variant ladder. */}
              <img
                src={placeholderSrc}
                alt=""
                width={srcWidth ?? undefined}
                height={srcHeight ?? undefined}
                draggable={false}
                onLoad={() => setPlaceholderLoaded(true)}
                className={cn(
                  "absolute inset-0 h-full w-full object-contain transition-opacity duration-300",
                  highReady ? "opacity-0" : "opacity-100",
                )}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* biome-ignore lint/performance/noImgElement: variant selection + highReady swap is done manually by this component; next/image's pipeline does not fit our rclone-backed variant ladder. */}
              <img
                src={highReady ? highSrc : placeholderSrc}
                alt={alt}
                width={srcWidth ?? undefined}
                height={srcHeight ?? undefined}
                draggable={false}
                onLoad={(e) => {
                  if (highReady) {
                    recordLoadedVariant(
                      objectKey,
                      e.currentTarget.currentSrc || e.currentTarget.src,
                    );
                  }
                }}
                className={cn(
                  "absolute inset-0 h-full w-full select-none object-contain transition-opacity duration-300",
                  highReady ? "opacity-100" : "opacity-0",
                )}
              />
            </div>
          </TransformComponent>
        </TransformWrapper>
      )}

      {/* Loading spinner while the first paintable image (placeholder or
          high-res) is still in flight. Sits above the empty <picture>
          frame so the backdrop isn't a black void. Pointer-events off so
          the user can still drag underneath it. */}
      {showSpinner && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="animate-spin text-white/80"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="sr-only">Loading image</span>
        </div>
      )}

      {/* Top bar: close + caption. Pointer-events scoped to controls so
          they don't swallow drags on the image itself. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4 text-white"
        style={SAFE_AREA_INSETS}
      >
        <div className="min-w-0 flex-1 text-sm text-white/80">
          {caption && <p className="line-clamp-2">{caption}</p>}
        </div>
        {/* 44 px hit area around a 36 px circle: the visible chrome stays
            the size it has always been, and the negative margin pulls the
            grown box back so the circle still sits where the layer's
            padding put it. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="group pointer-events-auto -m-1 inline-flex size-11 shrink-0 items-center justify-center focus:outline-none"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors group-hover:bg-white/20 group-focus-visible:ring-2 group-focus-visible:ring-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        </button>
      </div>

      {/* Prev / Next chevrons — hidden when no neighbour exists. Duplicated
          by the horizontal swipe above; kept because swipe is undiscoverable
          and doesn't exist on a mouse. p-3 around a 24 px icon is already a
          48 px target, so only the notch needs handling: a margin (rather
          than an inline `left`) composes with the left-2 / md:left-4 classes
          instead of overriding them, so the chevron keeps its 8/16 px gap
          measured from the safe edge rather than from the display edge.
          Bare `env()` and not `max()` here, unlike SAFE_AREA_INSETS above:
          this margin is additive gutter, so zero inset must mean zero
          shift — a `max(…, 1rem)` would move both chevrons inward on every
          device on earth. These went live with the `viewportFit: "cover"`
          export in src/app/artwork/layout.tsx; before it they computed to
          the 0px fallback. Only the horizontal insets matter: the buttons
          are vertically centred, and in landscape — the orientation where
          a housing overlaps a long edge — that puts them nowhere near it. */}
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous artwork"
          style={{ marginLeft: "env(safe-area-inset-left, 0px)" }}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:left-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Next artwork"
          style={{ marginRight: "env(safe-area-inset-right, 0px)" }}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>,
    document.body,
  );
}
