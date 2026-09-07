"use client";

import { useEffect, useRef, useState } from "react";
import type { DeepZoomTileSource } from "@/lib/deep-zoom";
import { cn } from "@/lib/utils";

type Props = {
  tileSource: DeepZoomTileSource;
  /** Low-res variant painted underneath until the first tiles are drawn,
   *  so the modal never shows an empty frame while the pyramid opens.
   *  Ignored when `placeholder` is given. */
  placeholderSrc?: string;
  /** Pre-rendered stand-in, used instead of `placeholderSrc` when the
   *  caller already holds a decoded copy of the work and can paint it
   *  with no network at all — the 3D gallery hands over the scene
   *  texture it loaded while the player was walking. Rendered inside the
   *  same cross-fading, aria-hidden wrapper the default <img> gets. */
  placeholder?: React.ReactNode;
  alt: string;
  /** Placement override for the zoom control cluster. The default sits
   *  just above the bottom edge, which collides with a host that puts
   *  its own chrome down there (the 3D gallery's metadata bar). */
  controlsClassName?: string;
  /** Called when OpenSeadragon can't be loaded or the pyramid doesn't
   *  answer, so the host can fall back to the plain <img> path. */
  onUnavailable: () => void;
  /** Reports whether the view is zoomed in past its resting ("home")
   *  level, on every change. The lightbox needs it to tell a
   *  swipe-to-next-artwork from a pan across a zoomed-in detail: the
   *  gesture is the same horizontal drag, and only the viewer knows
   *  which one it is. Fires `false` once more when the viewer tears
   *  down, so a listener can't be left holding a stale `true`. Only
   *  called when the answer actually flips, not on every zoom event.
   *  Optional; nothing else about the viewer depends on anybody
   *  listening. */
  onZoomedChange?: (zoomed: boolean) => void;
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

// How far past home zoom still counts as "resting". OpenSeadragon lands a
// hair off the exact home value on its own — the springs settle
// asymptotically, and applyConstraints nudges the zoom after a flick or
// after the elastic overshoot at `minZoomImageRatio` — so an equality test
// would report a zoomed view that nobody zoomed. 5% is well under the
// smallest deliberate zoom (a double-tap or one button press is 1.6x) and
// well over that drift. Mirrors SWIPE_MAX_RESTING_SCALE in lightbox.tsx,
// which does the same job for the plain <img> path.
const HOME_ZOOM_EPSILON = 1.05;

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
export function DeepZoomViewer({
  tileSource,
  placeholderSrc,
  placeholder,
  alt,
  controlsClassName,
  onUnavailable,
  onZoomedChange,
}: Props) {
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
  // Same trick for the zoom reporter: the lightbox passes an inline
  // arrow, so a stale closure here would report into a dead callback for
  // the life of the viewer.
  const onZoomedChangeRef = useRef(onZoomedChange);
  onZoomedChangeRef.current = onZoomedChange;

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

      // Publish zoom state upwards so the lightbox can gate its
      // swipe-to-navigate on it (see the swipe handlers there). Without
      // this signal the lightbox has no way to know whether a horizontal
      // drag over the viewer means "next artwork" or "pan this detail",
      // and swipe has to be switched off for the ~967 tiled works.
      //
      // "zoom" carries the zoom spring's *target*, not its current value,
      // which is exactly right: a pinch should disqualify the gesture the
      // moment it starts, not 600 ms later when the animation settles.
      // Every path that changes zoom routes through Viewport.zoomTo and so
      // raises it — the buttons below, pinch, wheel, double-tap, goHome,
      // and the fitBounds that a container resize runs — so one handler
      // covers the lot, including orientation changes.
      //
      // Compared against getHomeZoom() read at event time rather than a
      // value captured once: home zoom is a function of the container
      // aspect, and rotating the phone changes it under an open viewer.
      let reportedZoomed = false;
      v.addHandler("zoom", (event) => {
        if (cancelled) return;
        const home = v.viewport.getHomeZoom();
        // Before the first tiled image is in the world, content bounds are
        // still degenerate and home zoom comes back 0 / NaN. Nothing is on
        // screen to pan yet either, so "not zoomed" already holds.
        if (!Number.isFinite(home) || home <= 0 || !Number.isFinite(event.zoom)) return;
        const zoomed = event.zoom > home * HOME_ZOOM_EPSILON;
        if (zoomed === reportedZoomed) return;
        reportedZoomed = zoomed;
        onZoomedChangeRef.current?.(zoomed);
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
      // Any zoom the viewer held dies with it, so say so on the way out.
      // Otherwise a listener that last heard "zoomed" keeps gating on a
      // viewer that no longer exists — which is exactly what unmounting
      // mid-zoom to fall back to the plain <img> path looks like.
      onZoomedChangeRef.current?.(false);
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
      {/* Stand-in, cross-faded out once the first tiles are on screen.
          Without it the frame is empty for as long as the library chunk
          plus the top pyramid levels take to arrive. A caller-supplied
          `placeholder` wins: the 3D gallery already has the work decoded
          on the GPU and can paint it with no request at all, where the
          default path still has to fetch a variant. */}
      {placeholder ? (
        <div
          aria-hidden={ready}
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-500",
            ready ? "opacity-0" : "opacity-100",
          )}
        >
          {placeholder}
        </div>
      ) : (
        /* biome-ignore lint/performance/noImgElement: pre-selected variant from the shared image cache; next/image's optimizer is not in this path. */
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
      )}
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
      <div
        className={cn(
          "pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2",
          controlsClassName,
        )}
      >
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
