"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Instance,
  Instances,
  PointerLockControls,
  StatsGl,
  Text,
} from "@react-three/drei";
import * as THREE from "three";
import type { Artwork } from "@/lib/data";
import { slugify } from "@/lib/utils";

type Props = { artworks: Artwork[] };

// =============================================================
// Constants
// =============================================================

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;

const ROOM_WIDTH = 22;
const ROOM_HEIGHT = 6.2;
const WALL_X_BUF = 0.7;

const DOOR_WIDTH = 2.6;
const DOOR_HEIGHT = 3.0;

// Walls have real thickness — 10 cm — so shared walls between rooms
// don't z-fight with the paintings sitting 6 cm in front of them.
const WALL_THICKNESS = 0.1;

// Painting sizing — raise cap to accommodate very large works at
// near-real scale (Birth of Venus is 2.79 × 1.73 m).
const MAX_PAINTING_W = 5.0;
const MAX_PAINTING_H = 4.5;
const CANONICAL_Y_CENTER = 1.55;
const MIN_FLOOR_GAP = 0.3;

// Render only rooms within [active - N, active + N]. Keeps the scene
// small enough for smooth movement regardless of how many rooms the
// corridor actually has.
// Keep 2 rooms on each side of the active one mounted. This makes
// crossing a door cheap: the new room's geometry + signs are already
// in the scene graph, we just shift which room is "active". Mount
// thrash (particularly <Text> re-creation, which triggers troika SDF
// generation) was a big contributor to the feelable lag.
const RENDER_WINDOW = 2;

// Data caps. The corridor can hold at most MAX_ROOMS rooms, each
// holding between MIN_PER_ROOM and MAX_PER_ROOM paintings. Oversize
// movements get split into "Part 1/2/...".
const MAX_ROOMS = 28;
const MAX_PAINTINGS_TOTAL = 500;
const MIN_PER_ROOM = 8; // accept small natural groupings
const MAX_PER_ROOM = 22;

// Tunables for texture loading (same shape as before).
const VARIANT_TEX_WIDTH = 1280;
const MAX_TEX_WIDTH = 1200; // cap after client-side resize

// =============================================================
// Room data & generation
// =============================================================

type Palette = {
  wallColor: string;
  floorColor: string;
  ceilingColor: string;
  lampTint: string;
};

type RoomData = {
  id: string;
  title: string;
  description: string;
  palette: Palette;
  artworks: Artwork[];
};

const PALETTES: Palette[] = [
  { wallColor: "#ece2c9", floorColor: "#3a2a1f", ceilingColor: "#f4ead2", lampTint: "#ffd9a5" },
  { wallColor: "#d9d2c2", floorColor: "#2a2218", ceilingColor: "#ebe3cf", lampTint: "#ffe0b5" },
  { wallColor: "#e8dcbd", floorColor: "#322015", ceilingColor: "#f3e9cf", lampTint: "#ffd09a" },
  { wallColor: "#d4cdb9", floorColor: "#2a1d14", ceilingColor: "#ede5d1", lampTint: "#ffd2a0" },
  { wallColor: "#e0d4ba", floorColor: "#342518", ceilingColor: "#ece2cc", lampTint: "#ffdaa8" },
  { wallColor: "#dbd3b8", floorColor: "#2f2015", ceilingColor: "#ebe0c7", lampTint: "#ffcfa0" },
];

// Hand-written one-liners for the movements we're likely to see. Any
// movement not here falls back to a year-range summary.
const MOVEMENT_BLURBS: Record<string, string> = {
  "Impressionism":
    "Plein-air, visible brushwork, light over line.",
  "Post-Impressionism":
    "After Impressionism — van Gogh, Gauguin, Cézanne remake the language.",
  "Dutch Golden Age":
    "Vermeer, Rembrandt and the quiet northern interior.",
  "Early Renaissance":
    "15th-century Italy relearning antiquity.",
  "High Renaissance":
    "Michelangelo, Raphael, Leonardo at the peak.",
  "Mannerism":
    "Elongation, torsion, theatrical composition.",
  "Baroque":
    "Drama, tenebrism, motion — Caravaggio's shadow stretches across Europe.",
  "Rococo":
    "Ornament, play, 18th-century French intimacy.",
  "Neoclassicism":
    "Antique clarity reasserted against Rococo.",
  "Romanticism":
    "The sublime and the storm — Turner, Géricault, Friedrich.",
  "Realism":
    "Nothing staged — Courbet and Manet turn to what's there.",
  "Symbolism":
    "Dream logic, myth, interior weather.",
  "Symbolism / Expressionism":
    "Dreams and inner weather pushing into colour.",
  "Ukiyo-e":
    "Edo-period woodblock — Hokusai, Hiroshige, Utamaro.",
  "Art Nouveau":
    "Whiplash curves and the natural world stylised.",
  "Expressionism":
    "Subjective colour and distortion carrying the feeling.",
  "Cubism":
    "Form shattered and reassembled from multiple angles.",
  "Surrealism":
    "The unconscious staged with the precision of a photograph.",
  "Abstract Expressionism":
    "Paint as the subject — gesture, scale, field.",
};

function ordinalCentury(year: number): string {
  const century = Math.floor((year - 1) / 100) + 1;
  const s = ["th", "st", "nd", "rd"];
  const v = century % 100;
  const suffix = s[(v - 20) % 10] || s[v] || s[0];
  return `${century}${suffix} century`;
}

function medianYear(arr: Artwork[]): number {
  const years = arr
    .map((a) => a.year ?? 0)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);
  if (years.length === 0) return 0;
  return years[Math.floor(years.length / 2)];
}

function yearRangeText(arr: Artwork[]): string {
  const years = arr.map((a) => a.year).filter((y): y is number => y != null);
  if (years.length === 0) return "A selection of works";
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (max - min < 30) return `Works from around ${min}`;
  return `${min}–${max}`;
}

function generateRooms(allArtworks: Artwork[]): RoomData[] {
  // Candidate filter: must be a paintings-folder work with real-world
  // dimensions and a year. Skip huge outliers and tiny thumbs.
  const seen = new Set<string>();
  const candidates: Artwork[] = [];
  for (const a of allArtworks) {
    if (a.folder !== "collection-of-beauty") continue;
    if (!a.objectKey) continue;
    if (a.year == null) continue;
    if (!a.realDimensions) continue;
    const { widthCm, heightCm } = a.realDimensions;
    if (widthCm < 15 || widthCm > 450) continue;
    if (heightCm < 15 || heightCm > 450) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    candidates.push(a);
  }

  // Group by movement, or year-century fallback for the unclassified.
  const groups = new Map<string, Artwork[]>();
  for (const a of candidates) {
    const key =
      a.movement && a.movement.trim().length > 0
        ? a.movement
        : `Other works · ${ordinalCentury(a.year ?? 1500)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  // Chronological order by median year.
  const ordered = Array.from(groups.entries())
    .map(([title, arr]) => ({
      title,
      arr: [...arr].sort((x, y) => (x.year ?? 0) - (y.year ?? 0)),
      median: medianYear(arr),
    }))
    .sort((a, b) => a.median - b.median);

  // Split over-sized and skip groups below the minimum (unless they're
  // naturally small and can still make a quiet little room).
  const rooms: RoomData[] = [];
  let total = 0;

  for (const { title, arr } of ordered) {
    if (rooms.length >= MAX_ROOMS || total >= MAX_PAINTINGS_TOTAL) break;
    if (arr.length < MIN_PER_ROOM) continue;

    if (arr.length <= MAX_PER_ROOM) {
      const take = Math.min(arr.length, MAX_PAINTINGS_TOTAL - total);
      if (take < MIN_PER_ROOM) continue;
      rooms.push(makeRoom(title, arr.slice(0, take), rooms.length));
      total += take;
    } else {
      const numParts = Math.ceil(arr.length / MAX_PER_ROOM);
      const chunkSize = Math.ceil(arr.length / numParts);
      for (let p = 0; p < numParts; p++) {
        if (rooms.length >= MAX_ROOMS) break;
        if (total >= MAX_PAINTINGS_TOTAL) break;
        const chunk = arr
          .slice(p * chunkSize, (p + 1) * chunkSize)
          .slice(0, MAX_PAINTINGS_TOTAL - total);
        if (chunk.length === 0) break;
        const partTitle =
          numParts > 1 ? `${title} · Part ${p + 1}` : title;
        rooms.push(makeRoom(partTitle, chunk, rooms.length));
        total += chunk.length;
      }
    }
  }

  return rooms;
}

function makeRoom(
  title: string,
  artworks: Artwork[],
  paletteIdx: number,
): RoomData {
  // Blurb key: strip any "· Part N" suffix.
  const baseKey = title.split(" · Part")[0].trim();
  const blurb = MOVEMENT_BLURBS[baseKey];
  const yearText = yearRangeText(artworks);
  const description = blurb
    ? `${blurb} · ${artworks.length} works · ${yearText}`
    : `${artworks.length} works · ${yearText}`;
  return {
    id: slugify(title) || `room-${paletteIdx}`,
    title,
    description,
    palette: PALETTES[paletteIdx % PALETTES.length],
    artworks,
  };
}

// =============================================================
// Layout
// =============================================================

type Slot = {
  pos: [number, number, number];
  rot: [number, number, number];
};

type Placement = {
  artwork: Artwork;
  position: [number, number, number];
  rotation: [number, number, number];
};

type RoomLayout = {
  data: RoomData;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  /** More negative — further from entrance. */
  backZ: number;
  /** Closer to entrance. */
  frontZ: number;
  centerZ: number;
  depth: number;
  placements: Placement[];
};

const SIDE_SPACING = 3.2;

/** Compute depth + slots for a given painting count. Side walls take
 *  the brunt of the load; end walls hold up to 4 each (solid) or 2
 *  each (with a door). */
function planSlots(
  paintingCount: number,
  isFirst: boolean,
  isLast: boolean,
): { depth: number; slots: Slot[] } {
  const frontHasDoor = !isFirst;
  const backHasDoor = !isLast;
  const backSlots = backHasDoor ? 2 : 4;
  const frontSlots = frontHasDoor ? 2 : 4;
  const endSlots = backSlots + frontSlots;

  // How many on the sides? (The rest go on the ends.)
  const onSides = Math.max(0, paintingCount - endSlots);
  const perSide = Math.max(3, Math.ceil(onSides / 2));
  const depth = Math.max(16, 2 + perSide * SIDE_SPACING);

  const frontZ = 0; // room-local
  const backZ = -depth;
  const centerZ = -depth / 2;

  const slots: Slot[] = [];

  // Back wall slots
  const backXs = backHasDoor
    ? [-5.5, 5.5]
    : [-8, -2.7, 2.7, 8];
  for (const x of backXs) {
    slots.push({ pos: [x, 0, backZ + 0.06], rot: [0, 0, 0] });
  }

  // Walk the side walls from back toward front (player walks front →
  // back, so this reads naturally if they turn to each wall in order).
  const sideStart = backZ + 1.6;
  const sideEnd = frontZ - 1.6;
  const sideSpan = sideEnd - sideStart;
  const effectiveCount = Math.max(1, Math.floor(sideSpan / SIDE_SPACING) + 1);
  for (let i = 0; i < effectiveCount; i++) {
    const t = effectiveCount > 1 ? i / (effectiveCount - 1) : 0.5;
    const z = sideStart + t * sideSpan;
    // West
    slots.push({
      pos: [-ROOM_WIDTH / 2 + 0.06, 0, z],
      rot: [0, Math.PI / 2, 0],
    });
    // East
    slots.push({
      pos: [ROOM_WIDTH / 2 - 0.06, 0, z],
      rot: [0, -Math.PI / 2, 0],
    });
  }

  // Front wall slots
  const frontXs = frontHasDoor
    ? [-5.5, 5.5]
    : [-8, -2.7, 2.7, 8];
  for (const x of frontXs) {
    slots.push({ pos: [x, 0, frontZ - 0.06], rot: [0, Math.PI, 0] });
  }

  return { depth, slots };
}

function layoutCorridor(rooms: RoomData[]): RoomLayout[] {
  const layouts: RoomLayout[] = [];
  let frontZ = 0;

  rooms.forEach((data, i) => {
    const isFirst = i === 0;
    const isLast = i === rooms.length - 1;
    const { depth, slots } = planSlots(data.artworks.length, isFirst, isLast);
    const backZ = frontZ - depth;
    const centerZ = (frontZ + backZ) / 2;

    // Map slots (room-local) to world coords by shifting z by frontZ
    // (room-local frontZ is 0, world frontZ is this room's frontZ).
    const placements: Placement[] = [];
    const n = Math.min(data.artworks.length, slots.length);
    for (let k = 0; k < n; k++) {
      const slot = slots[k];
      placements.push({
        artwork: data.artworks[k],
        position: [slot.pos[0], slot.pos[1], slot.pos[2] + frontZ],
        rotation: slot.rot,
      });
    }

    layouts.push({
      data,
      index: i,
      isFirst,
      isLast,
      frontZ,
      backZ,
      centerZ,
      depth,
      placements,
    });

    frontZ = backZ;
  });

  return layouts;
}

// =============================================================
// Texture loading — shared LRU cache + eager GPU upload
// =============================================================

function variantAssetsRawUrl(
  objectKey: string,
  width: number,
  format: "avif" | "webp",
): string {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  const segments = [...dir.split("/"), basename, `${width}.${format}`];
  return `/assets-raw/${segments.map(encodeURIComponent).join("/")}`;
}

function rawOriginalUrl(objectKey: string): string {
  return `/assets-raw/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

// Module-level set of URLs that returned 404 this session. Once we know
// a variant doesn't exist we skip it on future loads of the same work
// (the browser still caches negative results via HTTP, but skipping the
// re-attempt keeps the console clean and avoids wasted round trips).
const missingUrls = new Set<string>();

// Keep the N most-recently-used textures alive in GPU memory. When an
// entry is evicted, its Texture is disposed. This lets a Painting leave
// the render window (unmount) without throwing away its texture — if
// the player comes back within the LRU's lifetime, it's instant.
const TEXTURE_CACHE_CAPACITY = 80;

class TextureLRU {
  private map = new Map<string, THREE.Texture>();
  constructor(private capacity: number) {}

  get(key: string): THREE.Texture | undefined {
    const tex = this.map.get(key);
    if (tex) {
      this.map.delete(key);
      this.map.set(key, tex);
    }
    return tex;
  }

  put(key: string, tex: THREE.Texture): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, tex);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const old = this.map.get(oldest);
      this.map.delete(oldest);
      old?.dispose();
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }
}

const textureCache = new TextureLRU(TEXTURE_CACHE_CAPACITY);
const textureInFlight = new Map<string, Promise<THREE.Texture>>();

/**
 * Pick the best available variant width for a desired target width:
 * the smallest variant that's at least the target, or the largest
 * available if all variants are smaller. Returns null when no variants
 * are known (= not shrunk yet), in which case the caller should fall
 * straight through to the raw original.
 */
function bestVariantUrl(
  artwork: Artwork,
  desiredWidth: number,
): string | null {
  const widths = artwork.variantWidths;
  if (!widths || widths.length === 0) return null;
  const atLeast = widths.find((w) => w >= desiredWidth);
  const pick = atLeast ?? widths[widths.length - 1];
  return variantAssetsRawUrl(artwork.objectKey, pick, "avif");
}

async function fetchAndDecodeTexture(
  artwork: Artwork,
  signal: AbortSignal,
): Promise<THREE.Texture> {
  // Only request variants the manifest says exist. The manifest is
  // populated by `pnpm build:data` scanning assets-web/<basename>/. If
  // nothing has been shrunk yet, fall straight through to the raw
  // original.
  const candidates: Array<[string, boolean]> = [];
  const variantUrl = bestVariantUrl(artwork, VARIANT_TEX_WIDTH);
  if (variantUrl && !missingUrls.has(variantUrl)) {
    candidates.push([variantUrl, false]);
  }
  candidates.push([rawOriginalUrl(artwork.objectKey), true]);

  let lastErr: unknown = null;
  for (const [url, downsample] of candidates) {
    if (signal.aborted) throw new Error("aborted");
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        if (res.status === 404) missingUrls.add(url);
        throw new Error(`fetch ${url}: ${res.status}`);
      }
      const blob = await res.blob();
      if (signal.aborted) throw new Error("aborted");
      const opts: ImageBitmapOptions = {
        imageOrientation: "flipY",
        ...(downsample
          ? { resizeWidth: MAX_TEX_WIDTH, resizeQuality: "high" }
          : {}),
      };
      const bitmap = await createImageBitmap(blob, opts);
      if (signal.aborted) {
        bitmap.close?.();
        throw new Error("aborted");
      }
      const texture = new THREE.Texture(
        bitmap as unknown as HTMLImageElement,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.minFilter = THREE.LinearMipMapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.flipY = false;
      texture.needsUpdate = true;
      return texture;
    } catch (e) {
      if (signal.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("texture load failed");
}

/**
 * Load a texture through the cache + in-flight dedup, and eagerly
 * upload it to the GPU via `renderer.initTexture`. Eagerness is what
 * kills the lag on room transitions — otherwise the GPU upload is
 * deferred until the mesh renders, batching dozens of uploads into one
 * frame. With initTexture, uploads happen during preload, in small
 * time-sliced bits, and the mesh just uses the already-ready texture.
 *
 * The caller's `signal` aborts only the caller's *await* — the shared
 * underlying fetch+decode keeps running so another caller (or a future
 * re-mount) can pick up the finished texture from the cache. If we
 * threaded the signal into the fetch, one Painting's unmount would kill
 * the Preloader's in-flight request for the same work, which used to
 * cause cascades of spurious AbortError warnings.
 */
async function loadTextureCached(
  artwork: Artwork,
  renderer: THREE.WebGLRenderer | null,
  signal: AbortSignal,
): Promise<THREE.Texture> {
  const key = artwork.objectKey;
  const cached = textureCache.get(key);
  if (cached) return cached;

  let promise = textureInFlight.get(key);
  if (!promise) {
    // Shared fetch, independent of any caller's abort signal.
    const shared = new AbortController();
    promise = fetchAndDecodeTexture(artwork, shared.signal)
      .then((tex) => {
        // Eagerly upload to the GPU here — this is the single most
        // important step for hiding the lag when a new room mounts.
        // Without it, every newly-mounted Painting's first render
        // batches its GPU upload into the same frame as 15+ others
        // (a main-thread stall you can feel). With it, the upload
        // happened during preload and the mount is free.
        //
        // initTexture is a synchronous WebGL call; safe to invoke
        // outside the render loop because R3F's renderer re-binds
        // its own state at the next draw.
        if (renderer) {
          try {
            renderer.initTexture(tex);
          } catch {
            // Some drivers occasionally complain; fall back to
            // lazy upload at first render.
          }
        }
        textureCache.put(key, tex);
        return tex;
      })
      .finally(() => {
        textureInFlight.delete(key);
      });
    textureInFlight.set(key, promise);
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise<THREE.Texture>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);
    promise!.then(
      (tex) => {
        signal.removeEventListener("abort", onAbort);
        resolve(tex);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

// =============================================================
// Painting
// =============================================================

function clampToCap(w: number, h: number): { w: number; h: number } {
  if (w > MAX_PAINTING_W || h > MAX_PAINTING_H) {
    const scale = Math.min(MAX_PAINTING_W / w, MAX_PAINTING_H / h);
    return { w: w * scale, h: h * scale };
  }
  return { w, h };
}

/**
 * Dimensions from metadata alone (no texture required). Used for
 * instanced frame + plaque meshes — those are sized at mount time,
 * before the image has loaded, so they can't wait for the image's
 * actual aspect ratio. The eventual canvas fits *inside* this box.
 */
function computeMetaSize(artwork: Artwork): { w: number; h: number } {
  if (artwork.realDimensions) {
    return clampToCap(
      artwork.realDimensions.widthCm / 100,
      artwork.realDimensions.heightCm / 100,
    );
  }
  // No metadata — pick a modest default.
  return { w: 2.0, h: 1.5 };
}

/**
 * Final canvas dimensions, which also need to fit *inside* the meta
 * box (so the instanced frame always encloses the canvas cleanly). If
 * the image aspect disagrees with the metadata aspect, we shrink the
 * canvas to keep its aspect *inside* the meta bounding box rather than
 * stretching it.
 */
function computePaintingSize(
  artwork: Artwork,
  texture: THREE.Texture | null,
): { w: number; h: number } {
  const meta = computeMetaSize(artwork);
  const img = texture?.image as
    | { width?: number; height?: number }
    | undefined;
  const imgAspect =
    img?.width && img?.height ? img.width / img.height : null;

  if (!imgAspect || !artwork.realDimensions) return meta;

  const metaAspect = meta.w / meta.h;
  const disagreement =
    Math.abs(imgAspect - metaAspect) / Math.max(metaAspect, 0.01);
  if (disagreement < 0.15) return meta;

  // Aspects disagree: fit the image aspect *inside* the meta rectangle,
  // always choosing the larger-fitting dimension. Never grows past the
  // frame.
  const heightAtMetaW = meta.w / imgAspect;
  if (heightAtMetaW <= meta.h) {
    return { w: meta.w, h: heightAtMetaW };
  }
  return { w: meta.h * imgAspect, h: meta.h };
}

function computePaintingYCenter(h: number): number {
  return Math.max(CANONICAL_Y_CENTER, MIN_FLOOR_GAP + h / 2);
}

const FRAME_T = 0.05;
const FRAME_DEPTH = 0.08;
const PLAQUE_W = 0.34;
const PLAQUE_H = 0.24;
const PLAQUE_DEPTH = 0.012;
const PLAQUE_GAP = 0.1;

/**
 * Reporter for aggregate load progress (of the *first* room only — once
 * we've unlocked Enter, subsequent rooms pop in in the background and
 * no progress ping is needed). Painting components call onLoaded()
 * exactly once per instance, whether the load succeeded or failed.
 */
type PaintingProps = {
  placement: Placement;
  onClick: (artwork: Artwork) => void;
  onLoaded?: () => void;
  reportProgress?: boolean;
};

function Painting({
  placement,
  onClick,
  onLoaded,
  reportProgress,
}: PaintingProps) {
  const { artwork, position, rotation } = placement;
  const { gl } = useThree();
  // Seed from cache synchronously so rooms that were already preloaded
  // render immediately on mount.
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    textureCache.get(artwork.objectKey) ?? null,
  );
  const reportedRef = useRef(false);

  useEffect(() => {
    // If we synchronously picked up a cached texture, nothing to do.
    if (texture) {
      if (reportProgress && !reportedRef.current) {
        reportedRef.current = true;
        onLoaded?.();
      }
      return;
    }
    const controller = new AbortController();
    loadTextureCached(artwork, gl, controller.signal)
      .then((tex) => {
        if (controller.signal.aborted) return;
        setTexture(tex);
      })
      .catch((err) => {
        // Abort errors are expected when a Painting unmounts mid-load —
        // don't spam the console for them.
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        console.warn(
          "gallery-3d texture load failed:",
          artwork.objectKey,
          err,
        );
      })
      .finally(() => {
        if (
          reportProgress &&
          !reportedRef.current &&
          !controller.signal.aborted
        ) {
          reportedRef.current = true;
          onLoaded?.();
        }
      });
    return () => {
      // Do NOT dispose the texture here — it lives in the shared LRU
      // cache, which handles eviction. This means painting unmount is
      // cheap and revisits are instant as long as the work hasn't
      // aged out of the cache.
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artwork.objectKey]);

  const meta = computeMetaSize(artwork);
  const { w, h } = computePaintingSize(artwork, texture);
  // yCenter uses the meta height so the group + frame share the same
  // y-centre — the canvas (inside the group) may be slightly smaller,
  // but it'll sit centred inside the frame.
  const yCenter = computePaintingYCenter(meta.h);

  const groupPosition: [number, number, number] = [
    position[0],
    yCenter,
    position[2],
  ];

  return (
    <group position={groupPosition} rotation={rotation}>
      {/* Canvas — frame is drawn via instanced meshes at the Gallery3D
          level. Canvas emissive is bumped so the painting still reads
          as "lit" without a per-painting pointLight. */}
      {texture && (
        <mesh
          position={[0, 0, 0.004]}
          userData={{ artwork }}
          onClick={(e) => {
            e.stopPropagation();
            onClick(artwork);
          }}
        >
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            map={texture}
            roughness={0.85}
            metalness={0}
            emissive="#ffffff"
            emissiveIntensity={0.35}
            emissiveMap={texture}
            toneMapped={false}
          />
        </mesh>
      )}
      {/* Plaque renders only its label text here; the box body is
          instanced alongside the frames. */}
      <Plaque artwork={artwork} paintingWidthMeta={meta.w} yCenter={yCenter} />
    </group>
  );
}

// =============================================================
// Plaque
// =============================================================

function Plaque({
  artwork,
  paintingWidthMeta,
  yCenter,
}: {
  artwork: Artwork;
  paintingWidthMeta: number;
  yCenter: number;
}) {
  // Plaque box is drawn via an instanced mesh at the Gallery3D level;
  // this component positions only the label Text on top of it. Local
  // coords here mirror the instance's transform so the Text lands
  // centred on the plaque face.
  const plaqueX = paintingWidthMeta / 2 + PLAQUE_GAP + PLAQUE_W / 2;
  const plaqueY = EYE_HEIGHT - yCenter;
  const plaqueZ = PLAQUE_DEPTH / 2 + 0.003;

  const year = artwork.year ? `, ${artwork.year}` : "";
  const byline = `${artwork.artist ?? "Unknown"}${year}`;
  const dims = artwork.realDimensions
    ? `${formatCm(artwork.realDimensions.widthCm)} × ${formatCm(
        artwork.realDimensions.heightCm,
      )} cm`
    : null;
  const titleMax = 64;
  const title =
    artwork.title.length > titleMax
      ? artwork.title.slice(0, titleMax - 1) + "…"
      : artwork.title;

  const text = [title, "", byline, dims].filter(Boolean).join("\n");

  return (
    <Text
      position={[plaqueX, plaqueY, plaqueZ]}
      fontSize={0.018}
      lineHeight={1.35}
      color="#241810"
      anchorX="center"
      anchorY="middle"
      maxWidth={PLAQUE_W - 0.024}
      textAlign="center"
    >
      {text}
    </Text>
  );
}

function formatCm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// =============================================================
// Walls
// =============================================================

function SolidWall({
  position,
  rotation,
  width,
  height,
  color,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  color: string;
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        color={color}
        roughness={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function WallWithDoor({
  position,
  rotation,
  width,
  height,
  color,
  doorWidth,
  doorHeight,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  color: string;
  doorWidth: number;
  doorHeight: number;
}) {
  const sideWidth = (width - doorWidth) / 2;
  const leftX = -doorWidth / 2 - sideWidth / 2;
  const rightX = doorWidth / 2 + sideWidth / 2;
  const lintelY = doorHeight + (height - doorHeight) / 2 - height / 2;
  const lintelH = height - doorHeight;

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[leftX, 0, 0]}>
        <planeGeometry args={[sideWidth, height]} />
        <meshStandardMaterial
          color={color}
          roughness={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[rightX, 0, 0]}>
        <planeGeometry args={[sideWidth, height]} />
        <meshStandardMaterial
          color={color}
          roughness={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, lintelY, 0]}>
        <planeGeometry args={[doorWidth, lintelH]} />
        <meshStandardMaterial
          color={color}
          roughness={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>
      <DoorTrim doorWidth={doorWidth} doorHeight={doorHeight} />
    </group>
  );
}

function DoorTrim({
  doorWidth,
  doorHeight,
}: {
  doorWidth: number;
  doorHeight: number;
}) {
  const trim = 0.06;
  const color = "#2a1d14";
  return (
    <group position={[0, -ROOM_HEIGHT / 2, 0]}>
      <mesh position={[-doorWidth / 2 - trim / 2, doorHeight / 2, 0]}>
        <boxGeometry args={[trim, doorHeight, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[doorWidth / 2 + trim / 2, doorHeight / 2, 0]}>
        <boxGeometry args={[trim, doorHeight, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, doorHeight + trim / 2, 0]}>
        <boxGeometry args={[doorWidth + trim * 2, trim, 0.06]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

function RoomSign({
  position,
  rotation,
  title,
  description,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  title: string;
  description: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[3.4, 0.62, 0.04]} />
        <meshStandardMaterial
          color="#f2e9d0"
          emissive="#2a1e10"
          emissiveIntensity={0.06}
          roughness={0.7}
        />
      </mesh>
      <Text
        position={[0, 0.12, 0.025]}
        fontSize={0.1}
        color="#241810"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.2}
        textAlign="center"
      >
        {title}
      </Text>
      <Text
        position={[0, -0.12, 0.025]}
        fontSize={0.055}
        color="#55402a"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.2}
        textAlign="center"
      >
        {description}
      </Text>
    </group>
  );
}

// =============================================================
// Ceiling lamps
// =============================================================

function CeilingLamp({
  position,
  tint,
}: {
  position: [number, number, number];
  tint: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.06, 20]} />
        <meshStandardMaterial
          color="#2a1d14"
          emissive={tint}
          emissiveIntensity={1.6}
          roughness={0.5}
        />
      </mesh>
      <pointLight
        position={[0, -0.15, 0]}
        intensity={10}
        distance={18}
        decay={2}
        color={tint}
      />
    </group>
  );
}

// =============================================================
// Room geometry
// =============================================================

function RoomGeometry({
  layout,
  nextTitle,
  nextDescription,
  prevTitle,
}: {
  layout: RoomLayout;
  nextTitle: string | null;
  nextDescription: string | null;
  prevTitle: string | null;
}) {
  const { data, isFirst, isLast, backZ, frontZ, centerZ, depth } = layout;
  const backHasDoor = !isLast;
  const frontHasDoor = !isFirst;

  // Distribute ceiling lamps along the room's depth — one cluster per
  // ~6 m of depth.
  const lampRows = Math.max(1, Math.round(depth / 7));
  const lampPositions: Array<[number, number, number]> = [];
  for (let r = 0; r < lampRows; r++) {
    const t = lampRows === 1 ? 0.5 : r / (lampRows - 1);
    const z = frontZ + (backZ - frontZ) * (0.18 + 0.64 * t);
    lampPositions.push([-6, ROOM_HEIGHT - 0.04, z]);
    lampPositions.push([6, ROOM_HEIGHT - 0.04, z]);
  }

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]}>
        <planeGeometry args={[ROOM_WIDTH, depth]} />
        <meshStandardMaterial
          color={data.palette.floorColor}
          roughness={0.88}
          metalness={0.05}
        />
      </mesh>
      {/* Ceiling */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ROOM_HEIGHT, centerZ]}
      >
        <planeGeometry args={[ROOM_WIDTH, depth]} />
        <meshStandardMaterial color={data.palette.ceilingColor} roughness={0.96} />
      </mesh>
      {/* Back wall */}
      {backHasDoor ? (
        <WallWithDoor
          position={[0, ROOM_HEIGHT / 2, backZ]}
          rotation={[0, 0, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={data.palette.wallColor}
          doorWidth={DOOR_WIDTH}
          doorHeight={DOOR_HEIGHT}
        />
      ) : (
        <SolidWall
          position={[0, ROOM_HEIGHT / 2, backZ]}
          rotation={[0, 0, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={data.palette.wallColor}
        />
      )}
      {/* Front wall — only render from the first room (walls between
          rooms are rendered as the previous room's back wall). */}
      {isFirst && (
        <SolidWall
          position={[0, ROOM_HEIGHT / 2, frontZ]}
          rotation={[0, Math.PI, 0]}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          color={data.palette.wallColor}
        />
      )}
      {/* East + west */}
      <SolidWall
        position={[ROOM_WIDTH / 2, ROOM_HEIGHT / 2, centerZ]}
        rotation={[0, -Math.PI / 2, 0]}
        width={depth}
        height={ROOM_HEIGHT}
        color={data.palette.wallColor}
      />
      <SolidWall
        position={[-ROOM_WIDTH / 2, ROOM_HEIGHT / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
        width={depth}
        height={ROOM_HEIGHT}
        color={data.palette.wallColor}
      />
      {/* Bench */}
      <mesh position={[0, 0.3, centerZ]}>
        <boxGeometry args={[3, 0.6, 0.9]} />
        <meshStandardMaterial color="#2a1d14" roughness={0.65} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.66, centerZ]}>
        <boxGeometry args={[3.1, 0.05, 1]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Lamps */}
      {lampPositions.map((p, i) => (
        <CeilingLamp key={i} position={p} tint={data.palette.lampTint} />
      ))}
      {/* Room title sign — opposite the entrance door, high on the
          back wall (or on the front wall for the very first room). */}
      {!isFirst && (
        <RoomSign
          position={[0, DOOR_HEIGHT + 0.7, frontZ - 0.06]}
          rotation={[0, Math.PI, 0]}
          title={data.title}
          description={data.description}
        />
      )}
      {/* Next-room sign above the back door */}
      {backHasDoor && nextTitle && (
        <RoomSign
          position={[0, DOOR_HEIGHT + 0.7, backZ + 0.06]}
          rotation={[0, 0, 0]}
          title={nextTitle}
          description={nextDescription ?? ""}
        />
      )}
      {/* Also put a little sign for THIS room on the back wall of the
          previous room — already handled because the previous room's
          RoomGeometry renders its own "next" sign. */}
      {/* Return hint above front door */}
      {frontHasDoor && prevTitle && (
        <RoomSign
          position={[0, DOOR_HEIGHT + 0.7, frontZ - 0.06]}
          rotation={[0, Math.PI, 0]}
          title={data.title}
          description={data.description}
        />
      )}
    </group>
  );
}

// =============================================================
// Player
// =============================================================

type CorridorBounds = {
  zMin: number;
  zMax: number;
  doorZs: number[];
  benchCenters: Array<{ x: number; z: number }>;
  rooms: Array<{ frontZ: number; backZ: number }>;
};

function findRoomIndex(
  z: number,
  rooms: ReadonlyArray<{ frontZ: number; backZ: number }>,
): number {
  // Rooms are ordered front → back in the corridor, with frontZ > backZ.
  // Room i contains z such that backZ <= z <= frontZ.
  for (let i = 0; i < rooms.length; i++) {
    if (z <= rooms[i].frontZ && z >= rooms[i].backZ) return i;
  }
  // Fallbacks
  if (rooms.length === 0) return 0;
  if (z > rooms[0].frontZ) return 0;
  return rooms.length - 1;
}

function Player({
  enabled,
  onZoomRequest,
  corridor,
  startZ,
  onRoomChange,
  onAimChange,
}: {
  enabled: boolean;
  onZoomRequest: (artwork: Artwork) => void;
  corridor: CorridorBounds;
  startZ: number;
  onRoomChange: (i: number) => void;
  onAimChange: (aiming: boolean) => void;
}) {
  const { camera, scene } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const raycaster = useRef(
    new THREE.Raycaster(undefined, undefined, 0.1, 10),
  );
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDirection = useRef(new THREE.Vector3());
  const lastRoomIdx = useRef(-1);
  // Throttled aim raycast state. Updated once every AIM_PERIOD frames
  // (see useFrame below). Avoids per-frame CPU cost of traversing the
  // scene graph while still feeling responsive.
  const aimRef = useRef(false);
  const frameCountRef = useRef(0);

  useEffect(() => {
    camera.position.set(0, EYE_HEIGHT, startZ);
    camera.lookAt(0, EYE_HEIGHT, startZ - 5);
  }, [camera, startZ]);

  useEffect(() => {
    const tryZoom = () => {
      camera.getWorldPosition(rayOrigin.current);
      camera.getWorldDirection(rayDirection.current);
      raycaster.current.set(rayOrigin.current, rayDirection.current);
      const hits = raycaster.current.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const artwork = hit.object.userData?.artwork as Artwork | undefined;
        if (artwork) {
          onZoomRequest(artwork);
          return;
        }
      }
    };
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!enabled) return;
      if (e.code === "Space" && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        e.preventDefault();
      }
      if (e.code === "KeyE" || e.code === "KeyF") tryZoom();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const mouse = (e: MouseEvent) => {
      if (!enabled) return;
      if (e.button === 0) tryZoom();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mouse);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mouse);
    };
  }, [enabled, camera, scene, onZoomRequest]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) move.add(forward);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) move.sub(forward);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      camera.position.add(move);
    }

    // X bound: same for every room
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x,
      -ROOM_WIDTH / 2 + WALL_X_BUF,
      ROOM_WIDTH / 2 - WALL_X_BUF,
    );
    // Z corridor bound
    camera.position.z = THREE.MathUtils.clamp(
      camera.position.z,
      corridor.zMin,
      corridor.zMax,
    );

    // Door walls
    const DOOR_HALF_W = DOOR_WIDTH / 2 - 0.1;
    const WALL_THICK = 0.35;
    for (const wallZ of corridor.doorZs) {
      const dist = camera.position.z - wallZ;
      if (Math.abs(dist) < WALL_THICK) {
        const throughDoor =
          Math.abs(camera.position.x) < DOOR_HALF_W &&
          camera.position.y < DOOR_HEIGHT - 0.1;
        if (!throughDoor) {
          camera.position.z = wallZ + Math.sign(dist || 1) * WALL_THICK;
        }
      }
    }

    // Benches
    const BENCH_HEIGHT = 0.66;
    const BENCH_HALF = { x: 1.5, z: 0.45 };
    const benchBlocking =
      camera.position.y < EYE_HEIGHT + BENCH_HEIGHT - 0.1;
    for (const center of corridor.benchCenters) {
      if (
        benchBlocking &&
        Math.abs(camera.position.x - center.x) < BENCH_HALF.x + 0.4 &&
        Math.abs(camera.position.z - center.z) < BENCH_HALF.z + 0.4
      ) {
        const dx = camera.position.x - center.x;
        const dz = camera.position.z - center.z;
        if (Math.abs(dx) > Math.abs(dz)) {
          camera.position.x =
            center.x + Math.sign(dx || 1) * (BENCH_HALF.x + 0.4);
        } else {
          camera.position.z =
            center.z + Math.sign(dz || 1) * (BENCH_HALF.z + 0.4);
        }
      }
    }

    // Vertical integration
    velocityY.current -= GRAVITY * dt;
    camera.position.y += velocityY.current * dt;
    if (camera.position.y <= EYE_HEIGHT) {
      camera.position.y = EYE_HEIGHT;
      velocityY.current = 0;
      grounded.current = true;
    } else {
      grounded.current = false;
    }

    // Room change detection
    const idx = findRoomIndex(camera.position.z, corridor.rooms);
    if (idx !== lastRoomIdx.current) {
      lastRoomIdx.current = idx;
      onRoomChange(idx);
    }

    // Throttled aim raycast for the inspect-cursor affordance. Doing
    // this every frame is wasteful (scene has dozens of meshes), every
    // 6 frames (≈10 Hz) is indistinguishable from real-time.
    frameCountRef.current++;
    if (frameCountRef.current % 6 === 0) {
      camera.getWorldPosition(rayOrigin.current);
      camera.getWorldDirection(rayDirection.current);
      raycaster.current.set(rayOrigin.current, rayDirection.current);
      const hits = raycaster.current.intersectObjects(
        scene.children,
        true,
      );
      let aiming = false;
      for (const hit of hits) {
        if (hit.object.userData?.artwork) {
          aiming = true;
          break;
        }
      }
      if (aiming !== aimRef.current) {
        aimRef.current = aiming;
        onAimChange(aiming);
      }
    }
  });

  return null;
}

// =============================================================
// Overlays
// =============================================================

function StartOverlay({
  onStart,
  loadedCount,
  total,
  title,
  description,
}: {
  onStart: () => void;
  loadedCount: number;
  total: number;
  title: string;
  description: string;
}) {
  const ready = loadedCount >= total;
  const pct = total > 0 ? Math.round((loadedCount / total) * 100) : 0;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[min(480px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
        <h2 className="font-serif text-2xl tracking-wide">Enter the museum</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/80">
          You'll enter the first room:{" "}
          <span className="font-medium text-white">{title}</span>.
          <span className="block mt-1 text-white/60">{description}</span>
        </p>
        <p className="mt-4 text-xs leading-relaxed text-white/65">
          <kbd className="rounded border border-white/30 px-1.5">W</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">A</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">S</kbd>{" "}
          <kbd className="rounded border border-white/30 px-1.5">D</kbd>{" "}
          to move · mouse to look ·{" "}
          <kbd className="rounded border border-white/30 px-1.5">Shift</kbd>{" "}
          to run ·{" "}
          <kbd className="rounded border border-white/30 px-1.5">Space</kbd>{" "}
          to jump · click or{" "}
          <kbd className="rounded border border-white/30 px-1.5">E</kbd>{" "}
          to inspect · walk through the doorways.
        </p>

        <div className="mt-5 space-y-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-white/55">
            {ready
              ? "First room ready"
              : `Loading first room… ${loadedCount}/${total}`}
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={!ready}
          className="mt-5 rounded-md bg-white px-5 py-2 text-sm font-medium text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/30 disabled:text-white/60"
        >
          {ready ? "Enter" : "Preparing…"}
        </button>

        <div className="mt-4 text-xs text-white/45">
          <Link href="/" className="underline hover:text-white/80">
            Back to the 2D gallery
          </Link>
        </div>
      </div>
    </div>
  );
}

function ResumeOverlay({ onResume }: { onResume: () => void }) {
  return (
    <button
      type="button"
      onClick={onResume}
      className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center bg-black/50 text-white transition hover:bg-black/40"
    >
      <div className="rounded-lg border border-white/20 bg-black/60 px-6 py-3 text-sm backdrop-blur">
        Click to resume
      </div>
    </button>
  );
}

function Crosshair({ inspecting }: { inspecting: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-2">
        {inspecting ? (
          // Magnifying-glass ring when the crosshair is over an
          // inspectable painting. SVG so it scales crisply at any DPI.
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-transform duration-150"
            style={{ transform: "scale(1)" }}
          >
            <circle
              cx="10"
              cy="10"
              r="6.5"
              fill="rgba(0,0,0,0.25)"
              stroke="white"
              strokeWidth="1.8"
            />
            <line
              x1="14.5"
              y1="14.5"
              x2="20.5"
              y2="20.5"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div className="h-1.5 w-1.5 rounded-full bg-white/70 ring-1 ring-black/40" />
        )}
        {inspecting && (
          <div className="rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
            Click or <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">E</kbd> to inspect
          </div>
        )}
      </div>
    </div>
  );
}

function HintBar({ roomTitle }: { roomTitle: string }) {
  return (
    <>
      <div className="pointer-events-none absolute top-[72px] left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1 text-xs font-medium text-white/85 backdrop-blur">
        {roomTitle}
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
        WASD · Shift · Space · Click/E to inspect · F3 stats · Esc to release
      </div>
    </>
  );
}

// =============================================================
// Zoom modal with wheel-zoom + drag-pan
// =============================================================

function ZoomModal({
  artwork,
  onClose,
}: {
  artwork: Artwork;
  onClose: () => void;
}) {
  // Cascade through the variants the manifest says exist, largest
  // first, then fall back to the raw original. The manifest comes from
  // `pnpm build:data` scanning assets-web, so we don't fire requests
  // for variants that don't exist on disk.
  const srcCandidates = useMemo(() => {
    const list: string[] = [];
    const key = artwork.objectKey;
    const widths = artwork.variantWidths ?? [];
    // Largest-first. Cap at the raw-original for a clean tail.
    const sorted = [...widths].sort((a, b) => b - a);
    for (const w of sorted) {
      const url = variantAssetsRawUrl(key, w, "avif");
      if (!missingUrls.has(url)) list.push(url);
    }
    list.push(rawOriginalUrl(key));
    return list;
  }, [artwork.objectKey, artwork.variantWidths]);
  const [srcIdx, setSrcIdx] = useState(0);
  const src = srcCandidates[Math.min(srcIdx, srcCandidates.length - 1)];

  const handleImgError = useCallback(() => {
    setSrcIdx((i) => {
      // Everything except the final raw-original fallback is a
      // pre-built variant worth remembering as missing.
      const bad = srcCandidates[i];
      if (bad && i < srcCandidates.length - 1) missingUrls.add(bad);
      return Math.min(i + 1, srcCandidates.length - 1);
    });
  }, [srcCandidates]);

  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
  } | null>(null);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyE" || e.code === "KeyF") {
        onClose();
      }
      if (e.code === "Digit0" || e.code === "Numpad0") {
        setScale(1);
        setTx(0);
        setTy(0);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  const reset = useCallback(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-e.deltaY * 0.0018);
      const newScale = Math.max(1, Math.min(10, scale * factor));
      const actualFactor = newScale / scale;
      const newTx = cx - (cx - tx) * actualFactor;
      const newTy = cy - (cy - ty) * actualFactor;
      setScale(newScale);
      if (newScale === 1) {
        setTx(0);
        setTy(0);
      } else {
        setTx(newTx);
        setTy(newTy);
      }
    },
    [scale, tx, ty],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    },
    [tx, ty],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTx(dragRef.current.tx + dx);
    setTy(dragRef.current.ty + dy);
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const year = artwork.year ? `, ${artwork.year}` : "";
  const byline = `${artwork.artist ?? "Unknown"}${year}`;
  const dims = artwork.realDimensions
    ? `${formatCm(artwork.realDimensions.widthCm)} × ${formatCm(
        artwork.realDimensions.heightCm,
      )} cm`
    : null;

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-black/95 text-white"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={onWheel}
        style={{
          cursor:
            scale > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
        }}
      >
        <img
          src={src}
          alt={artwork.title}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={onMouseDown}
          onError={handleImgError}
          className="absolute left-1/2 top-1/2 max-h-[90vh] max-w-[94vw] select-none object-contain shadow-2xl"
          style={{
            transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragRef.current ? "none" : "transform 80ms ease-out",
          }}
        />
      </div>
      <div
        className="flex flex-wrap items-end justify-between gap-4 border-t border-white/10 bg-black/80 px-6 py-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="font-serif text-lg leading-tight">
            {artwork.title}
          </div>
          <div className="mt-0.5 text-white/60">{byline}</div>
          {dims && (
            <div className="mt-0.5 text-xs text-white/45">{dims}</div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className="tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={reset}
            disabled={scale === 1 && tx === 0 && ty === 0}
            className="rounded-md border border-white/20 bg-white/5 px-3 py-1 font-medium transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-white px-3 py-1 font-medium text-black transition hover:bg-white/85"
          >
            Close
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white/75 backdrop-blur">
        Scroll to zoom · drag to pan ·{" "}
        <kbd className="rounded border border-white/30 px-1">0</kbd> resets ·{" "}
        <kbd className="rounded border border-white/30 px-1">Esc</kbd> closes
      </div>
    </div>
  );
}

// =============================================================
// Instanced furniture — frames + plaque boxes
// =============================================================

/**
 * All frame boxes and plaque boxes across the visible render window
 * collapse into two draw calls (one shared geometry + material per
 * kind). Without this, a busy room with ~45 paintings did 45 frame
 * draws + 45 plaque-box draws = 90 draws/frame just on the physical
 * housings. With instancing it's 2.
 *
 * Each `<Instance>` carries its own position, rotation, and scale,
 * which is how we pack varied painting dimensions into the single
 * shared unit-cube geometry.
 */
type FurniturePlacement = {
  key: string;
  /** Group (painting) position and rotation in world coords. */
  groupPosition: [number, number, number];
  rotation: [number, number, number];
  /** Frame and plaque-box sizes (meta-based). */
  frameScale: [number, number, number];
  plaqueOffsetX: number;
  plaqueOffsetY: number;
};

function collectFurniture(
  layouts: RoomLayout[],
  visibleIdx: Set<number>,
): FurniturePlacement[] {
  const out: FurniturePlacement[] = [];
  for (const i of visibleIdx) {
    const layout = layouts[i];
    for (const p of layout.placements) {
      const meta = computeMetaSize(p.artwork);
      const yCenter = computePaintingYCenter(meta.h);
      out.push({
        key: `${layout.data.id}-${p.artwork.id}`,
        groupPosition: [p.position[0], yCenter, p.position[2]],
        rotation: p.rotation,
        frameScale: [
          meta.w + FRAME_T * 2,
          meta.h + FRAME_T * 2,
          FRAME_DEPTH,
        ],
        plaqueOffsetX: meta.w / 2 + PLAQUE_GAP + PLAQUE_W / 2,
        plaqueOffsetY: EYE_HEIGHT - yCenter,
      });
    }
  }
  return out;
}

function FurnitureInstances({
  placements,
}: {
  placements: FurniturePlacement[];
}) {
  if (placements.length === 0) return null;
  // Cap `limit` above typical worst-case (30 paintings per room × 3
  // visible rooms = 90) so drei's backing buffer doesn't reallocate
  // every time the set changes.
  const limit = Math.max(200, placements.length + 32);
  return (
    <>
      {/* Frames — dark wood box, sunk behind the wall surface by
          FRAME_DEPTH/2 so the canvas sits flush with the wall face. */}
      <Instances limit={limit} range={placements.length}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#241810" roughness={0.55} metalness={0.1} />
        {placements.map((p) => (
          <group
            key={p.key}
            position={p.groupPosition}
            rotation={p.rotation}
          >
            <Instance
              position={[0, 0, -FRAME_DEPTH / 2]}
              scale={p.frameScale}
            />
          </group>
        ))}
      </Instances>
      {/* Plaque bodies — cream cards floating at eye height, to the
          right of the painting's meta-width. Uniform scale; plaque size
          is constant across the scene. */}
      <Instances limit={limit} range={placements.length}>
        <boxGeometry args={[PLAQUE_W, PLAQUE_H, PLAQUE_DEPTH]} />
        <meshStandardMaterial
          color="#f4ecd8"
          emissive="#2a1e10"
          emissiveIntensity={0.05}
          roughness={0.7}
          metalness={0}
        />
        {placements.map((p) => (
          <group
            key={p.key}
            position={p.groupPosition}
            rotation={p.rotation}
          >
            <Instance
              position={[p.plaqueOffsetX, p.plaqueOffsetY, PLAQUE_DEPTH / 2]}
            />
          </group>
        ))}
      </Instances>
    </>
  );
}

// =============================================================
// Preloader — warms the texture cache for rooms just beyond the render
// window so crossing a door doesn't burst-fetch + burst-upload.
// =============================================================

/** How many rooms out from the active one to preload. Must be strictly
 *  greater than RENDER_WINDOW so textures exist before the room mounts. */
const PRELOAD_WINDOW = 3;

function Preloader({
  layouts,
  activeRoom,
}: {
  layouts: RoomLayout[];
  activeRoom: number;
}) {
  const { gl } = useThree();
  useEffect(() => {
    const controllers: AbortController[] = [];
    const lo = Math.max(0, activeRoom - PRELOAD_WINDOW);
    const hi = Math.min(layouts.length - 1, activeRoom + PRELOAD_WINDOW);
    for (let i = lo; i <= hi; i++) {
      for (const p of layouts[i].placements) {
        if (textureCache.has(p.artwork.objectKey)) continue;
        const c = new AbortController();
        controllers.push(c);
        // Fire and forget — failures are logged by the loader.
        loadTextureCached(p.artwork, gl, c.signal).catch(() => undefined);
      }
    }
    return () => {
      for (const c of controllers) c.abort();
    };
  }, [activeRoom, layouts, gl]);
  return null;
}

// =============================================================
// Main
// =============================================================

type PointerLockControlsHandle = {
  lock: () => void;
  unlock: () => void;
};

export function Gallery3D({ artworks }: Props) {
  const rooms = useMemo(() => generateRooms(artworks), [artworks]);
  const layouts = useMemo(() => layoutCorridor(rooms), [rooms]);

  const firstRoomSize = layouts[0]?.data.artworks.length ?? 0;
  const startZ = useMemo(
    () =>
      layouts[0]
        ? layouts[0].frontZ + (layouts[0].backZ - layouts[0].frontZ) * 0.3
        : 0,
    [layouts],
  );

  const corridor: CorridorBounds = useMemo(() => {
    const zMax = (layouts[0]?.frontZ ?? 0) - 0.6;
    const zMin = (layouts[layouts.length - 1]?.backZ ?? 0) + 0.6;
    const doorZs = layouts.slice(0, -1).map((l) => l.backZ);
    const benchCenters = layouts.map((l) => ({ x: 0, z: l.centerZ }));
    const roomRanges = layouts.map((l) => ({
      frontZ: l.frontZ,
      backZ: l.backZ,
    }));
    return { zMin, zMax, doorZs, benchCenters, rooms: roomRanges };
  }, [layouts]);

  const [locked, setLocked] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [zoomed, setZoomed] = useState<Artwork | null>(null);
  const [aimingAtPainting, setAimingAtPainting] = useState(false);
  const [firstRoomLoaded, setFirstRoomLoaded] = useState(0);
  const [activeRoom, setActiveRoom] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const controlsRef = useRef<PointerLockControlsHandle | null>(null);

  useEffect(() => {
    // F3 toggles the stats overlay. Off by default so it doesn't
    // clutter the room; flip it on when you want to benchmark lag
    // spikes on a door crossing or a texture upload.
    const h = (e: KeyboardEvent) => {
      if (e.code === "F3") {
        e.preventDefault();
        setShowStats((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Visible window — render these rooms' geometry and paintings.
  const visibleIdx = useMemo(() => {
    const s = new Set<number>();
    for (
      let i = Math.max(0, activeRoom - RENDER_WINDOW);
      i <= Math.min(layouts.length - 1, activeRoom + RENDER_WINDOW);
      i++
    ) {
      s.add(i);
    }
    return s;
  }, [activeRoom, layouts.length]);

  const furniture = useMemo(
    () => collectFurniture(layouts, visibleIdx),
    [layouts, visibleIdx],
  );

  const start = useCallback(() => {
    setHasEntered(true);
    controlsRef.current?.lock?.();
  }, []);

  const resume = useCallback(() => {
    controlsRef.current?.lock?.();
  }, []);

  const handleZoomRequest = useCallback((artwork: Artwork) => {
    setZoomed(artwork);
    controlsRef.current?.unlock?.();
  }, []);

  const handleZoomClose = useCallback(() => {
    setZoomed(null);
    // Deliberately don't auto-relock here: Chrome blocks relocking
    // "immediately after the user has exited the lock" (see the
    // SecurityError / THREE warning), and racing that restriction just
    // produces noise. The ResumeOverlay already lets the user re-enter
    // with a single click, which counts as a fresh gesture.
  }, []);

  const handleFirstRoomLoaded = useCallback(() => {
    setFirstRoomLoaded((c) => c + 1);
  }, []);

  if (layouts.length === 0) {
    return (
      <div className="fixed left-0 right-0 bottom-0 top-[57px] flex items-center justify-center bg-[#0a0604] text-white/60">
        No rooms to show. Run <code className="mx-1">pnpm build:data</code> and
        ensure real-dimension metadata is present.
      </div>
    );
  }

  const activeRoomData = layouts[Math.min(activeRoom, layouts.length - 1)].data;

  return (
    <div className="fixed left-0 right-0 bottom-0 top-[57px] bg-[#0a0604]">
      <Canvas
        dpr={[1, 1.5]}
        performance={{ min: 0.6 }}
        camera={{
          fov: 70,
          near: 0.1,
          far: 160,
          position: [0, EYE_HEIGHT, startZ],
        }}
        gl={{ antialias: true, toneMappingExposure: 1.15 }}
      >
        <color attach="background" args={["#0a0604"]} />
        <fog attach="fog" args={["#0a0604", 18, 70]} />
        <ambientLight intensity={0.4} color="#fff1dd" />
        <hemisphereLight
          intensity={0.32}
          color={"#fff1dd" as unknown as THREE.ColorRepresentation}
          groundColor={"#2a1d14" as unknown as THREE.ColorRepresentation}
        />

        {layouts.map((layout, i) => {
          if (!visibleIdx.has(i)) return null;
          const next = layouts[i + 1];
          const prev = layouts[i - 1];
          return (
            <RoomGeometry
              key={layout.data.id}
              layout={layout}
              nextTitle={next?.data.title ?? null}
              nextDescription={next?.data.description ?? null}
              prevTitle={prev?.data.title ?? null}
            />
          );
        })}

        {layouts.flatMap((layout, i) => {
          if (!visibleIdx.has(i)) return [];
          const reportProgress = i === 0 && !hasEntered;
          return layout.placements.map((p) => (
            <Painting
              key={`${layout.data.id}-${p.artwork.id}`}
              placement={p}
              onClick={handleZoomRequest}
              reportProgress={reportProgress}
              onLoaded={
                reportProgress ? handleFirstRoomLoaded : undefined
              }
            />
          ));
        })}

        <FurnitureInstances placements={furniture} />

        <Preloader layouts={layouts} activeRoom={activeRoom} />

        <Player
          enabled={locked}
          onZoomRequest={handleZoomRequest}
          corridor={corridor}
          startZ={startZ}
          onRoomChange={(i) => {
            // Room transitions mount ~22 Paintings at once. Marking
            // that as a non-urgent transition lets React yield to the
            // frame loop while the re-render happens, so movement
            // doesn't stutter while the new room is being wired up.
            startTransition(() => setActiveRoom(i));
          }}
          onAimChange={setAimingAtPainting}
        />
        <PointerLockControls
          ref={controlsRef as unknown as React.Ref<never>}
          onLock={() => setLocked(true)}
          onUnlock={() => setLocked(false)}
        />
        {showStats && <StatsGl />}
      </Canvas>

      {/* Overlays */}
      {!hasEntered && !locked && !zoomed && layouts[0] && (
        <StartOverlay
          onStart={start}
          loadedCount={firstRoomLoaded}
          total={firstRoomSize}
          title={layouts[0].data.title}
          description={layouts[0].data.description}
        />
      )}
      {hasEntered && !locked && !zoomed && (
        <ResumeOverlay onResume={resume} />
      )}
      {locked && (
        <>
          <Crosshair inspecting={aimingAtPainting} />
          <HintBar roomTitle={activeRoomData.title} />
        </>
      )}
      {zoomed && (
        <ZoomModal artwork={zoomed} onClose={handleZoomClose} />
      )}
    </div>
  );
}
