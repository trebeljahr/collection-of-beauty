"use client";

import { useEffect, useRef, useState } from "react";
import type { DeepZoomTileSource } from "@/lib/deep-zoom";
import { cn } from "@/lib/utils";

type Props = {
  tileSource: DeepZoomTileSource;
  /** Low-res variant painted underneath until the first tiles are drawn,
   *  so the modal never shows an empty frame while the pyramid opens. */
  placeholderSrc: string;
  alt: string;
  /** Called when OpenSeadragon can't be loaded or the pyramid doesn't
   *  answer, so the lightbox can fall back to the plain <img> path. */
  onUnavailable: () => void;
};

/** The two key handlers OpenSeadragon delegates onto `Viewer.innerTracker`.
 *  Undeclared in the package's types; see where this is used. */
type KeyHandlers = {
  keyDownHandler: unknown;
  keyHandler: unknown;
};

// Zoom step per button press. Matches the wheel's feel closely enough that
// switching between the two doesn't feel like two different controls.
const ZOOM_STEP = 1.6;

/**
 * Tiled deep-zoom viewer over the DZI pyramids that
 * `scripts/build-tiles.mjs` writes.
 *
 * OpenSeadragon is imported dynamically and only from inside the effect,
 * so it lands in its own async chunk: the ~180 KB library is fetched the
 * first time someone opens a high-resolution work in the lightbox and
 * never touches the main bundle. That also keeps it off the server —
 * OpenSeadragon touches `window` at module scope, so a static import here
 * would break the RSC build the same way a bare `three` import does.
 *
 * Keyboard: OpenSeadragon's own arrow-key panning is unbound on purpose.
 * Everywhere else on the site the lightbox's arrows step to the previous
 * or next artwork, and silently changing that for the ~967 works that
 * happen to have a pyramid would make the same key mean two different
 * things depending on the image. Panning stays on drag, touch, and the
 * trackpad; Escape closes, handled by the lightbox above us.
 */
export function DeepZoomViewer({ tileSource, placeholderSrc, alt, onUnavailable }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Typed as the structural surface we actually use rather than importing
  // OpenSeadragon's types at module scope — keeps this file's static
  // imports free of the library entirely.
  const viewerRef = useRef<{
    destroy: () => void;
    viewport: { zoomBy: (f: number) => void; goHome: () => void; applyConstraints: () => void };
  } | null>(null);
  const [ready, setReady] = useState(false);

  // Latest onUnavailable, readable from the async setup below without
  // making the effect re-run (and tear down the viewer) when the parent
  // re-renders with a new callback identity.
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let cancelled = false;
    let viewer: Awaited<ReturnType<typeof create>> | null = null;

    // Probe the pyramid before mounting anything. DZI level 0 is a single
    // tile covering the whole image at 1 px, so this is a ~100 byte request
    // that answers "is this pyramid on the asset host at all" definitively.
    //
    // A probe rather than OpenSeadragon's own error events because those
    // are not dependable here: "open-failed" never fires for an inline tile
    // source (nothing is fetched to open), and per-tile failures are
    // reported by the drawer, which in OpenSeadragon 6 is the WebGL drawer
    // and raises a different event set than the canvas one. Checking the
    // bucket ourselves keeps the fallback independent of which drawer the
    // browser ends up with.
    function probeTiles(): Promise<boolean> {
      return new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => resolve(true);
        probe.onerror = () => resolve(false);
        probe.src = tileSource.getTileUrl(0, 0, 0);
      });
    }

    async function create() {
      const [OpenSeadragonModule, tilesExist] = await Promise.all([
        import("openseadragon"),
        probeTiles(),
      ]);
      if (cancelled) return null;
      if (!tilesExist) {
        onUnavailableRef.current();
        return null;
      }
      const OpenSeadragon = OpenSeadragonModule.default;
      if (!containerRef.current) return null;

      const v = OpenSeadragon({
        element: containerRef.current,
        tileSources: tileSource,
        // Our own controls are rendered below in the lightbox's visual
        // language; OpenSeadragon's default buttons would also try to
        // fetch sprite PNGs from a `prefixUrl` we don't serve.
        showNavigationControl: false,
        showZoomControl: false,
        showHomeControl: false,
        showFullPageControl: false,
        showSequenceControl: false,
        // Tiles come from the asset CDN, which serves no CORS headers.
        // OpenSeadragon only ever draws tiles (it never reads pixels
        // back), so letting the canvas taint is harmless and avoids
        // every tile request failing a preflight that would never pass.
        crossOriginPolicy: false,
        // Keep the work inside the frame rather than letting it be flung
        // into empty space; `visibilityRatio: 1` plus constrained panning
        // is what makes a hard zoom feel anchored instead of lost.
        visibilityRatio: 1,
        constrainDuringPan: true,
        // Allow pushing past 1 screen px per image px. The whole point of
        // these pyramids is brushstroke inspection, and stopping exactly
        // at native resolution reads as the viewer refusing to go closer.
        maxZoomPixelRatio: 2,
        minZoomImageRatio: 0.8,
        animationTime: 0.6,
        springStiffness: 7,
        gestureSettingsTouch: {
          pinchToZoom: true,
          flickEnabled: true,
          // Double-tap to zoom in is the expected phone gesture, and
          // OpenSeadragon's default pinch-rotate is wrong for a painting.
          dblClickToZoom: true,
          pinchRotate: false,
        },
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
      });

      // Release the arrow keys back to the lightbox (see the doc comment
      // above). OpenSeadragon binds them on the viewer's inner
      // MouseTracker, which exists at runtime (Viewer sets
      // `this.innerTracker` in its constructor) but is missing from the
      // shipped type declarations — hence the narrow local shape rather
      // than a blanket `any`.
      const tracker = (v as unknown as { innerTracker?: KeyHandlers }).innerTracker;
      if (tracker) {
        tracker.keyDownHandler = null;
        tracker.keyHandler = null;
      }

      // Readiness is the first tile that actually arrives, not the "open"
      // event: with an inline tile source there is no manifest to fetch, so
      // "open" fires synchronously and keying the cross-fade to it would
      // drop the placeholder before a single tile had loaded, leaving an
      // empty frame in its place.
      //
      // "tile-loaded" rather than the more literal "tile-drawn" because
      // OpenSeadragon 6 defaults to the WebGL drawer, which does not raise
      // tile-drawn at all (it logs "the WebGLDrawer does not raise the
      // tile-drawn event" and drops the handler). A loaded tile is drawn on
      // the next frame regardless, so the distinction isn't visible.

      // A pyramid that isn't on the bucket yet (catalogue rebuilt ahead of
      // the tiler or of `pnpm assets:sync`) has to be detected here too.
      // "open-failed" never fires for an inline tile source — nothing is
      // fetched to open — so a missing pyramid shows up only as its tiles
      // 404ing, one event at a time.
      //
      // Requiring two failures with nothing ever loaded distinguishes an
      // absent pyramid from a single dropped request: build-tiles.mjs
      // renames each pyramid into place only once complete, so a work's
      // tiles are either all there or all missing, whereas a transient
      // network error hits one tile while others succeed.
      let loadedAny = false;
      let failedCold = 0;
      v.addHandler("tile-loaded", () => {
        loadedAny = true;
        if (!cancelled) setReady(true);
      });
      v.addHandler("tile-load-failed", () => {
        if (cancelled || loadedAny) return;
        failedCold += 1;
        if (failedCold >= 2) onUnavailableRef.current();
      });

      return v;
    }

    create()
      .then((v) => {
        if (cancelled) {
          v?.destroy();
          return;
        }
        viewer = v;
        viewerRef.current = v as unknown as typeof viewerRef.current;
      })
      .catch(() => {
        if (!cancelled) onUnavailableRef.current();
      });

    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
    };
  }, [tileSource]);

  // zoomBy only moves the spring's target; OpenSeadragon won't clamp the
  // result to the allowed zoom/pan range until applyConstraints runs, so
  // without it a run of quick clicks can overshoot past max zoom and then
  // drift back, which reads as the buttons lagging behind the clicks.
  const zoomBy = (factor: number) => {
    const viewport = viewerRef.current?.viewport;
    if (!viewport) return;
    viewport.zoomBy(factor);
    viewport.applyConstraints();
  };

  return (
    <div className="absolute inset-0">
      {/* Cached low-res variant, cross-faded out once the first tiles are
          on screen. Without it the frame is empty for as long as the
          library chunk plus the top pyramid levels take to arrive. */}
      {/* biome-ignore lint/performance/noImgElement: pre-selected variant from the shared image cache; next/image's optimizer is not in this path. */}
      <img
        src={placeholderSrc}
        alt={ready ? "" : alt}
        aria-hidden={ready}
        draggable={false}
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500",
          ready ? "opacity-0" : "opacity-100",
        )}
      />
      <div
        ref={containerRef}
        className={cn(
          "absolute inset-0 transition-opacity duration-500",
          ready ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Zoom controls. Deliberately not OpenSeadragon's own: these match
          the lightbox's existing button chrome and stay reachable by
          keyboard, which the sprite-based default controls are not. */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <ZoomButton label="Zoom in" disabled={!ready} onClick={() => zoomBy(ZOOM_STEP)}>
          <path d="M11 8v6M8 11h6" />
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </ZoomButton>
        <ZoomButton label="Zoom out" disabled={!ready} onClick={() => zoomBy(1 / ZOOM_STEP)}>
          <path d="M8 11h6" />
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </ZoomButton>
        <ZoomButton
          label="Reset zoom"
          disabled={!ready}
          onClick={() => viewerRef.current?.viewport.goHome()}
        >
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v4h4" />
        </ZoomButton>
      </div>
    </div>
  );
}

// Disabled until the first tile is in. The viewer is created behind a
// dynamic import plus a tile probe, so there is a real window where the
// controls are painted but no viewport exists yet — without this, clicks
// in that window are silently dropped and the buttons look broken.
function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="pointer-events-auto rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:pointer-events-none disabled:opacity-40"
    >
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
        {children}
      </svg>
    </button>
  );
}
