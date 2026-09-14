"use client";

// Dev-only debug HUD for the 3D museum. Toggle with the backquote key
// (` — the key left of 1) or open the page with `?debug`; the choice is
// remembered in localStorage. Production builds never enable it.
//
// Two halves, sharing one module-scope stats object:
//
//   • <DebugProbe>   — lives inside <Canvas>. Samples frame timing every
//     frame, and ~10 Hz raycasts the crosshair against the painting
//     registry to find out which texture is on the wall being looked at.
//   • <DebugOverlay> — plain DOM over the canvas. Formats the stats into
//     a <pre> at 4 Hz by writing textContent directly, so the HUD itself
//     never re-renders React (a per-frame setState would show up in the
//     very numbers it prints).
//
// The aimed-texture readout reads `material.map` straight off the hit
// mesh, so it reports what is actually bound — thumb, base, or whichever
// LOD rung the painting has upgraded to — not what the ladder intended.
// The URL comes from `texture.name`, which texture-cache.ts sets on load.

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import { _paintingRegistryDebug, raycastNearestPaintingHit } from "./painting-registry";
import { _textureCacheDebug, estimateTextureBytes } from "./texture-cache";

const DEBUG_AVAILABLE = process.env.NODE_ENV !== "production";
const STORAGE_KEY = "gallery3d-debug";
/** Longer than the 2 m inspect range: the point is to read the texture on
 *  any wall in view, including ones still on a low rung. */
const PROBE_MAX_DIST = 60;
const PROBE_INTERVAL_FRAMES = 6;
const FRAME_WINDOW_MS = 1000;
const HUD_REFRESH_MS = 250;

/** Whether the debug HUD is on. Always false in production. */
export function useGalleryDebug(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!DEBUG_AVAILABLE) return;
    try {
      const param = new URLSearchParams(window.location.search).get("debug");
      if (param !== null) {
        setEnabled(param !== "0");
      } else {
        setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
      }
    } catch {
      // Storage blocked — the key toggle still works for this visit.
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Backquote" || e.metaKey || e.ctrlKey || e.altKey) return;
      setEnabled((on) => {
        const next = !on;
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {}
        return next;
      });
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  return DEBUG_AVAILABLE && enabled;
}

type AimedTexture = {
  title: string;
  artist: string | null;
  url: string;
  /** Variant width parsed from the URL (256 = thumb). Null if unparseable. */
  rungWidth: number | null;
  /** Largest variant catalogued for the work. */
  maxVariantWidth: number | null;
  texW: number;
  texH: number;
  bytes: number;
  distance: number;
  planeW: number;
  planeH: number;
  /** Painting height on screen in backing-buffer pixels. */
  screenPx: number;
};

type DebugStats = {
  fps: number;
  frameAvgMs: number;
  frameMaxMs: number;
  /** Frames over 33 ms in the last window. */
  jank: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  backingW: number;
  backingH: number;
  dpr: number;
  maxTextureSize: number;
  gpu: string;
  camera: [number, number, number];
  fov: number;
  aimed: AimedTexture | null;
};

const stats: DebugStats = {
  fps: 0,
  frameAvgMs: 0,
  frameMaxMs: 0,
  jank: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  backingW: 0,
  backingH: 0,
  dpr: 1,
  maxTextureSize: 0,
  gpu: "",
  camera: [0, 0, 0],
  fov: 0,
  aimed: null,
};

function readGpuName(gl: THREE.WebGLRenderer): string {
  try {
    const ctx = gl.getContext();
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    const name = ext
      ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : ctx.getParameter(ctx.RENDERER);
    return String(name ?? "");
  } catch {
    return "";
  }
}

/** In-canvas sampler. Renders nothing. */
export function DebugProbe() {
  const gl = useThree((s) => s.gl);
  const raycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, PROBE_MAX_DIST));
  const origin = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const frameTimes = useRef<number[]>([]);
  const lastFrame = useRef(0);
  const frameCount = useRef(0);

  useEffect(() => {
    stats.gpu = readGpuName(gl);
    stats.maxTextureSize = gl.capabilities.maxTextureSize;
    return () => {
      stats.aimed = null;
    };
  }, [gl]);

  useFrame((state) => {
    const now = performance.now();
    if (lastFrame.current > 0) {
      const times = frameTimes.current;
      times.push(now - lastFrame.current);
      // Trim to a rolling window by summed duration, not count, so the
      // FPS figure means "frames in the last second" at any frame rate.
      let total = 0;
      for (let i = times.length - 1; i >= 0; i--) {
        total += times[i];
        if (total > FRAME_WINDOW_MS) {
          times.splice(0, i);
          break;
        }
      }
      let sum = 0;
      let max = 0;
      let jank = 0;
      for (const t of times) {
        sum += t;
        if (t > max) max = t;
        if (t > 33.4) jank++;
      }
      stats.fps = sum > 0 ? (times.length * 1000) / sum : 0;
      stats.frameAvgMs = times.length > 0 ? sum / times.length : 0;
      stats.frameMaxMs = max;
      stats.jank = jank;
    }
    lastFrame.current = now;

    // `info` auto-resets at the start of each render, so read here (before
    // this frame's render) it still holds the previous frame's totals.
    const info = state.gl.info;
    stats.calls = info.render.calls;
    stats.triangles = info.render.triangles;
    stats.geometries = info.memory.geometries;
    stats.textures = info.memory.textures;
    stats.programs = info.programs?.length ?? 0;
    stats.dpr = state.viewport.dpr;
    stats.backingW = Math.round(state.size.width * state.viewport.dpr);
    stats.backingH = Math.round(state.size.height * state.viewport.dpr);

    const cam = state.camera as THREE.PerspectiveCamera;
    cam.getWorldPosition(origin.current);
    stats.camera = [origin.current.x, origin.current.y, origin.current.z];
    stats.fov = cam.isPerspectiveCamera ? cam.fov : 0;

    frameCount.current = (frameCount.current + 1) % PROBE_INTERVAL_FRAMES;
    if (frameCount.current !== 0) return;

    cam.getWorldDirection(dir.current);
    raycaster.current.set(origin.current, dir.current);
    const hit = raycastNearestPaintingHit(
      raycaster.current,
      origin.current,
      dir.current,
      PROBE_MAX_DIST,
    );
    const mesh = hit?.object as THREE.Mesh | undefined;
    const artwork = mesh?.userData?.artwork as ArtworkListing | undefined;
    if (!hit || !mesh || !artwork) {
      stats.aimed = null;
      return;
    }
    const material = mesh.material as THREE.MeshBasicMaterial;
    const tex = material.map;
    const img = tex?.image as { width?: number; height?: number } | undefined;
    const texW = img?.width ?? 0;
    const texH = img?.height ?? 0;
    const url = tex?.name ?? "";
    const rungMatch = url.match(/\/(\d+)\.(?:avif|webp)(?:[?#]|$)/);
    const params = (mesh.geometry as THREE.PlaneGeometry).parameters;
    const planeW = params?.width ?? 0;
    const planeH = params?.height ?? 0;
    const tanHalf = cam.isPerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) : 1;
    const screenPx =
      hit.distance > 0 ? (planeH / (2 * hit.distance * tanHalf)) * stats.backingH : 0;
    const widths = artwork.variantWidths;
    stats.aimed = {
      title: artwork.title,
      artist: artwork.artist,
      url,
      rungWidth: rungMatch ? Number(rungMatch[1]) : null,
      maxVariantWidth: widths && widths.length > 0 ? Math.max(...widths) : null,
      texW,
      texH,
      bytes: estimateTextureBytes(texW, texH),
      distance: hit.distance,
      planeW,
      planeH,
      screenPx,
    };
  });

  return null;
}

const mib = (b: number) => `${(b / 1048576).toFixed(1)} MiB`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function formatStats(): string {
  const t = _textureCacheDebug;
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
    ?.usedJSHeapSize;
  const lines = [
    `FPS ${stats.fps.toFixed(0).padStart(3)}  frame ${stats.frameAvgMs.toFixed(1)} ms avg · ${stats.frameMaxMs.toFixed(1)} max · ${stats.jank} >33ms`,
    `draw ${fmtInt(stats.calls)} calls · ${fmtInt(stats.triangles)} tris`,
    `mem  ${stats.geometries} geom · ${stats.textures} tex · ${stats.programs} programs`,
    `canvas ${stats.backingW}×${stats.backingH} @${stats.dpr.toFixed(2)}x · maxTex ${stats.maxTextureSize}`,
    stats.gpu ? `gpu  ${stats.gpu}` : null,
    heap != null ? `heap ${mib(heap)}` : null,
    "",
    "texture pools (decoded est.)",
    `  base    ${mib(t.bytes)} / ${mib(t.budget)} · ${t.size}`,
    `  hi-res  ${mib(t.hiresBytes)} / ${mib(t.hiresBudget)} · ${t.hiresSize}`,
    `  preload ${mib(t.preloadBytes)} · ${t.preloadSize}`,
    `  total   ${mib(t.bytes + t.hiresBytes + t.preloadBytes)}`,
    `  net ${t.activeLoads} active · ${t.queuedLoads} queued · upload ${t.queued}/${t.lowQueued} (hi/lo)`,
    `  in-flight base ${t.inFlight} · hi-res ${t.hiresInFlight} · preload ${t.preloadInFlight}`,
    `paintings registered ${_paintingRegistryDebug.size}`,
    `cam ${stats.camera.map((v) => v.toFixed(2)).join(", ")} · fov ${stats.fov.toFixed(1)}°`,
    "",
  ];

  const a = stats.aimed;
  if (!a) {
    lines.push("aimed: —");
  } else {
    const rung =
      a.rungWidth == null
        ? "?"
        : a.rungWidth === 256
          ? "256 (thumb)"
          : `${a.rungWidth}${a.maxVariantWidth ? ` of ${a.maxVariantWidth}` : ""}`;
    // >1 means the texture has more texels than the screen shows (sharp);
    // <1 means it is being magnified (soft).
    const ratio = a.screenPx > 0 && a.texH > 0 ? a.texH / a.screenPx : 0;
    lines.push(
      `aimed: ${a.title}${a.artist ? ` — ${a.artist}` : ""}`,
      a.texW > 0
        ? `  texture ${a.texW}×${a.texH} · ${mib(a.bytes)} · rung ${rung}`
        : "  texture — (swatch, nothing loaded)",
      `  plane ${a.planeW.toFixed(2)}×${a.planeH.toFixed(2)} m · ${a.distance.toFixed(2)} m away`,
      `  on screen ${fmtInt(a.screenPx)} px tall · texel:pixel ${ratio.toFixed(2)}`,
    );
    if (a.url) lines.push(`  ${a.url.replace(/^https?:\/\/[^/]+/, "")}`);
  }
  lines.push("", "` to hide");
  return lines.filter((l) => l !== null).join("\n");
}

/** DOM half of the HUD. Mount outside <Canvas>. */
export function DebugOverlay({ className = "" }: { className?: string }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const tick = () => {
      if (preRef.current) preRef.current.textContent = formatStats();
    };
    tick();
    const id = window.setInterval(tick, HUD_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <pre
      ref={preRef}
      aria-hidden
      className={`pointer-events-none absolute z-40 max-w-[min(34rem,calc(100vw-2rem))] overflow-hidden whitespace-pre-wrap break-all rounded bg-black/75 px-3 py-2 font-mono text-[11px] leading-snug text-lime-200 shadow-lg ${className}`}
    />
  );
}
