"use client";

import {
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
import { useAudioSettings } from "@/lib/audio-settings";
import { AudioControls } from "@/components/audio-controls";

const AMBIENCE_SRC = "/audio/ambience-loop.mp3";
const ROOM_TRANSITION_SRC = "/audio/room-transition.mp3";

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

// Scale multiplier applied to a painting's real-world dimensions before
// rendering. Compensates for the perceptual compression that any 3D
// perspective introduces — the 3 m bench reads as ~2 m, so without a
// scale-up a "real-sized" Birth of Venus reads as a dining-room picture.
// 1.5× pushes sizes into the range where they *feel* accurate; bump
// higher if the scene still reads as dollhouse.
const PAINTING_SCALE = 1.5;

// Render only rooms within [active - N, active + N]. Keeps the scene
// small enough for smooth movement regardless of how many rooms the
// corridor actually has.
// Keep 2 rooms on each side of the active one mounted. This makes
// crossing a door cheap: the new room's geometry + signs are already
// in the scene graph, we just shift which room is "active". Mount
// thrash (particularly <Text> re-creation, which triggers troika SDF
// generation) was a big contributor to the feelable lag.
const RENDER_WINDOW = 2;

// Data caps. The corridor can hold at most MAX_ROOMS rooms, each holding
// between MIN_PER_ROOM and dynamicMaxPerRoom() paintings. Oversize
// movements get split into "Part 1/2/...".
const MAX_ROOMS = 28;
const MAX_PAINTINGS_TOTAL = 500;
const MIN_PER_ROOM = 8; // accept small natural groupings
// Per-room capacity is chosen from these by dynamicMaxPerRoom() based on
// the average painting width in the group.
//   avg ≥ 2.8 m → LARGE (14):  Baroque canvases, big Turner / Rubens
//   avg ≥ 1.4 m → DEFAULT (22): the old uniform cap, typical oil works
//   avg ≥ 0.8 m → TIGHT (32):   studies, 19th c. genre works
//   avg  < 0.8 m → SMALL (48):  prints, plates, botanical illustrations
const MAX_PER_ROOM_DEFAULT = 22;
const MAX_PER_ROOM_SMALL = 48;
const MAX_PER_ROOM_TIGHT = 32;
const MAX_PER_ROOM_LARGE = 14;

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

// Pick an appropriate upper bound on paintings-per-room from the average
// real-world width of the paintings in this group. Rooms full of small
// works (prints, plates) pack tight and can hold many; rooms dominated
// by large canvases need breathing room.
function dynamicMaxPerRoom(paintings: Artwork[]): number {
  let totalW = 0;
  let n = 0;
  for (const a of paintings) {
    if (a.realDimensions && a.realDimensions.widthCm) {
      totalW += a.realDimensions.widthCm / 100; // metres
      n += 1;
    }
  }
  if (n === 0) return MAX_PER_ROOM_DEFAULT;
  const avg = totalW / n;
  if (avg < 0.8) return MAX_PER_ROOM_SMALL;
  if (avg < 1.4) return MAX_PER_ROOM_TIGHT;
  if (avg > 2.8) return MAX_PER_ROOM_LARGE;
  return MAX_PER_ROOM_DEFAULT;
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

    // Room capacity is width-aware: a movement full of small works
    // (Kunstformen plates, prints, etchings) fits ~2× the count of a
    // movement full of large Baroque canvases.
    const maxForThisGroup = dynamicMaxPerRoom(arr);

    if (arr.length <= maxForThisGroup) {
      const take = Math.min(arr.length, MAX_PAINTINGS_TOTAL - total);
      if (take < MIN_PER_ROOM) continue;
      rooms.push(makeRoom(title, arr.slice(0, take), rooms.length));
      total += take;
    } else {
      const numParts = Math.ceil(arr.length / maxForThisGroup);
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
  /** When the painting is packed tight against a cluster neighbour, the
   *  side-hung plaque collides with the adjacent canvas. `plaqueBelow`
   *  hangs the plaque under the painting instead. */
  plaqueBelow: boolean;
};

type Placement = {
  artwork: Artwork;
  position: [number, number, number];
  rotation: [number, number, number];
  plaqueBelow: boolean;
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

// Side-wall slot spacing fallback. Used only when a wall has a single
// painting and we want a default "takes this much of the wall" footprint.
// Actual inter-painting gaps are width-aware (see packWall).
const SIDE_SPACING = 3.2 * PAINTING_SCALE;

// ─── Cluster packing ───────────────────────────────────────────────────────
// "Small" paintings hang close together in groups of SMALL_CLUSTER_MAX, with
// a slightly wider break between clusters so the wall reads as a rhythm of
// little groups rather than one uniform frieze. "Big" paintings (or a small
// next to a big) get a larger breathing gap. All gaps are edge-to-edge, in
// world metres.
const SMALL_PAINTING_THRESHOLD = 1.6; // width (m) at which a work is "small"
const SMALL_GAP = 0.35;   // gap between two small neighbours in a cluster
const LARGE_GAP = 0.9;    // gap whenever at least one neighbour is big
const CLUSTER_BOUNDARY_GAP = 1.4; // gap between clusters of small works
const SMALL_CLUSTER_MAX = 4;  // reset to a bigger gap after this many smalls

/**
 * Pack a sequence of painting widths onto a single wall with variable
 * spacing. Returns each painting's centre position, the edge-to-edge
 * gap to its previous neighbour on the same wall (Infinity for the
 * first painting), and the total packed length.
 *
 * Gap rules:
 *   - small↔small: SMALL_GAP (tight cluster)
 *   - at cluster boundary (every SMALL_CLUSTER_MAX smalls): CLUSTER_BOUNDARY_GAP
 *   - any neighbour is big: LARGE_GAP
 */
function packWall(widths: number[]): {
  centres: number[];
  /** gapBefore[i] is the edge-to-edge gap between painting i and i-1;
   *  gapBefore[0] is Infinity (no neighbour on that side). */
  gapBefore: number[];
  length: number;
} {
  if (widths.length === 0) return { centres: [], gapBefore: [], length: 0 };
  const centres: number[] = [];
  const gapBefore: number[] = [Infinity];
  let smallRun = widths[0] < SMALL_PAINTING_THRESHOLD ? 1 : 0;
  centres.push(widths[0] / 2);
  for (let i = 1; i < widths.length; i++) {
    const prev = widths[i - 1];
    const cur = widths[i];
    const prevSmall = prev < SMALL_PAINTING_THRESHOLD;
    const curSmall = cur < SMALL_PAINTING_THRESHOLD;
    let gap: number;
    if (prevSmall && curSmall) {
      if (smallRun >= SMALL_CLUSTER_MAX) {
        gap = CLUSTER_BOUNDARY_GAP;
        smallRun = 1;
      } else {
        gap = SMALL_GAP;
        smallRun += 1;
      }
    } else {
      gap = LARGE_GAP;
      smallRun = curSmall ? 1 : 0;
    }
    gapBefore.push(gap);
    const edgeOfPrev = centres[i - 1] + prev / 2;
    centres.push(edgeOfPrev + gap + cur / 2);
  }
  const last = widths.length - 1;
  const length = centres[last] + widths[last] / 2;
  return { centres, gapBefore, length };
}

/** Compute depth + slots for a given list of paintings. End walls take up
 *  to 4 (solid) or 2 (door) works each; the remainder pack onto side walls
 *  with the width-aware rules above, so rooms full of small works pack
 *  tightly and rooms full of big canvases get generous breathing room. */
function planSlots(
  paintings: Artwork[],
  isFirst: boolean,
  isLast: boolean,
): { depth: number; slots: Slot[] } {
  const frontHasDoor = !isFirst;
  const backHasDoor = !isLast;
  const backSlotCount = backHasDoor ? 2 : 4;
  const frontSlotCount = frontHasDoor ? 2 : 4;

  // Split paintings across walls in the order the player will see them:
  // first few → back wall (directly ahead on entry); middle → sides
  // (seen walking through); last few → front wall (seen on exit).
  const count = paintings.length;
  const backCount = Math.min(backSlotCount, count);
  const frontCount = Math.min(frontSlotCount, Math.max(0, count - backCount));
  const sideCount = Math.max(0, count - backCount - frontCount);

  const sidePaintings = paintings.slice(backCount, backCount + sideCount);
  // Alternate west/east in painting order — keeps chronology readable as
  // you walk down the middle of the room.
  const westWidths: number[] = [];
  const eastWidths: number[] = [];
  for (let i = 0; i < sidePaintings.length; i++) {
    const { w } = computePaintingSize(sidePaintings[i], null);
    if (i % 2 === 0) westWidths.push(w);
    else eastWidths.push(w);
  }
  const westPack = packWall(westWidths);
  const eastPack = packWall(eastWidths);
  const sideLength = Math.max(westPack.length, eastPack.length);

  // Demote the plaque under a painting when the packed gap on either
  // side is tighter than the plaque's horizontal footprint — otherwise
  // it hangs over the adjacent canvas. Applied per-wall since the
  // packed sequences are independent.
  const plaqueBelowOn = (gapBefore: number[], count: number): boolean[] => {
    const out: boolean[] = new Array(count).fill(false);
    for (let i = 0; i < count; i++) {
      const before = gapBefore[i];
      const after = i + 1 < count ? gapBefore[i + 1] : Infinity;
      if (before < PLAQUE_SIDE_MIN_GAP || after < PLAQUE_SIDE_MIN_GAP) {
        out[i] = true;
      }
    }
    return out;
  };
  const westBelow = plaqueBelowOn(westPack.gapBefore, westWidths.length);
  const eastBelow = plaqueBelowOn(eastPack.gapBefore, eastWidths.length);

  // Room depth = packed side length + 1.6 m margin at each end. Clamp to
  // a minimum so a half-empty room still feels like a proper gallery.
  const MARGIN = 1.6;
  const MIN_DEPTH = 10;
  const depth = Math.max(MIN_DEPTH, sideLength + 2 * MARGIN);

  const frontZ = 0; // room-local
  const backZ = -depth;

  const slots: Slot[] = [];

  // Back wall
  const backXs = backHasDoor ? [-5.5, 5.5] : [-8, -2.7, 2.7, 8];
  for (let i = 0; i < backCount; i++) {
    slots.push({
      pos: [backXs[i], 0, backZ + 0.06],
      rot: [0, 0, 0],
      plaqueBelow: false,
    });
  }

  // Side walls. Centre each packed run on the usable side length so a
  // half-full wall floats evenly between back and front margins.
  const usable = depth - 2 * MARGIN;
  const westOffset = (usable - westPack.length) / 2;
  const eastOffset = (usable - eastPack.length) / 2;
  let wi = 0;
  let ei = 0;
  for (let i = 0; i < sidePaintings.length; i++) {
    if (i % 2 === 0) {
      const wIdx = wi++;
      const z = backZ + MARGIN + westOffset + westPack.centres[wIdx];
      slots.push({
        pos: [-ROOM_WIDTH / 2 + 0.06, 0, z],
        rot: [0, Math.PI / 2, 0],
        plaqueBelow: westBelow[wIdx],
      });
    } else {
      const eIdx = ei++;
      const z = backZ + MARGIN + eastOffset + eastPack.centres[eIdx];
      slots.push({
        pos: [ROOM_WIDTH / 2 - 0.06, 0, z],
        rot: [0, -Math.PI / 2, 0],
        plaqueBelow: eastBelow[eIdx],
      });
    }
  }

  // Front wall
  const frontXs = frontHasDoor ? [-5.5, 5.5] : [-8, -2.7, 2.7, 8];
  for (let i = 0; i < frontCount; i++) {
    slots.push({
      pos: [frontXs[i], 0, frontZ - 0.06],
      rot: [0, Math.PI, 0],
      plaqueBelow: false,
    });
  }

  return { depth, slots };
}

function layoutCorridor(rooms: RoomData[]): RoomLayout[] {
  const layouts: RoomLayout[] = [];
  let frontZ = 0;

  rooms.forEach((data, i) => {
    const isFirst = i === 0;
    const isLast = i === rooms.length - 1;
    const { depth, slots } = planSlots(data.artworks, isFirst, isLast);
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
        plaqueBelow: slot.plaqueBelow,
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
//
// Sized for (active room + one neighbour) worth of paintings. Rooms of
// small works pack up to MAX_PER_ROOM_SMALL (48), but the active-room
// detail is what matters most — neighbours degrade to the low-res
// variant anyway. 48 covers an active small-works room with headroom
// and keeps browser GPU memory around ~240 MB.
const TEXTURE_CACHE_CAPACITY = 48;

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

  delete(key: string): void {
    const tex = this.map.get(key);
    if (!tex) return;
    this.map.delete(key);
    tex.dispose();
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

// -------------------------------------------------------------
// High-res LOD — separate cache so the regular LRU's eviction
// doesn't hit the big textures, and vice versa.
// -------------------------------------------------------------

const HIRES_MIN_WIDTH = 1920; // no point loading anything smaller as a "hi-res"
const HIRES_CACHE_CAPACITY = 12;
// LOD distance hysteresis: upgrade when camera steps inside UPGRADE,
// downgrade (drop back to base + free VRAM) once it passes DOWNGRADE.
// The gap prevents flip-flop if the player lingers on the threshold.
const HIRES_UPGRADE_DIST = 1.5;
const HIRES_DOWNGRADE_DIST = 2.5;
const hiResCache = new TextureLRU(HIRES_CACHE_CAPACITY);
const hiResInFlight = new Map<string, Promise<THREE.Texture>>();

/**
 * Largest variant width that's a meaningful upgrade over the default
 * 1280 canvas. Returns null when the manifest has nothing at or above
 * HIRES_MIN_WIDTH — in which case the regular texture is the best
 * we've got and there's no LOD to apply.
 */
function bestHiResWidth(artwork: Artwork): number | null {
  const widths = artwork.variantWidths;
  if (!widths || widths.length === 0) return null;
  const biggest = widths[widths.length - 1];
  if (biggest < HIRES_MIN_WIDTH) return null;
  return biggest;
}

async function loadHiResTexture(
  artwork: Artwork,
  renderer: THREE.WebGLRenderer | null,
  signal: AbortSignal,
): Promise<THREE.Texture | null> {
  const width = bestHiResWidth(artwork);
  if (width == null) return null;
  const key = `${artwork.objectKey}@${width}`;
  const cached = hiResCache.get(key);
  if (cached) return cached;

  let promise = hiResInFlight.get(key);
  if (!promise) {
    const shared = new AbortController();
    const url = variantAssetsRawUrl(artwork.objectKey, width, "avif");
    promise = (async () => {
      const res = await fetch(url, { signal: shared.signal });
      if (!res.ok) {
        if (res.status === 404) missingUrls.add(url);
        throw new Error(`fetch ${url}: ${res.status}`);
      }
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: "flipY",
      });
      const tex = new THREE.Texture(
        bitmap as unknown as HTMLImageElement,
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.flipY = false;
      tex.needsUpdate = true;
      if (renderer) {
        try {
          renderer.initTexture(tex);
        } catch {
          /* best-effort */
        }
      }
      hiResCache.put(key, tex);
      return tex;
    })().finally(() => {
      hiResInFlight.delete(key);
    });
    hiResInFlight.set(key, promise);
  }

  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
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
  const rd = artwork.realDimensions;
  if (rd && rd.widthCm && rd.heightCm) {
    let wCm = rd.widthCm;
    let hCm = rd.heightCm;

    // Wikidata (and the wikimedia-template parser) sometimes store
    // width/height in the wrong slots — especially for landscape
    // paintings. If the image aspect matches the *swapped* meta far
    // better than the stated one, trust the image and swap the dims.
    // This alone recovers ~240 artworks in the catalog (most of
    // Turner's landscapes among them) that otherwise render at a
    // fraction of their real size.
    if (artwork.width && artwork.height) {
      const imgAspect = artwork.width / artwork.height;
      const statedAspect = wCm / hCm;
      const swappedAspect = hCm / wCm;
      const statedDiff =
        Math.abs(imgAspect - statedAspect) / Math.max(statedAspect, 0.01);
      const swappedDiff =
        Math.abs(imgAspect - swappedAspect) / Math.max(swappedAspect, 0.01);
      if (statedDiff > 0.15 && swappedDiff < 0.05) {
        [wCm, hCm] = [hCm, wCm];
      }
    }

    return clampToCap(
      (wCm / 100) * PAINTING_SCALE,
      (hCm / 100) * PAINTING_SCALE,
    );
  }
  // No metadata — pick a modest default. (The room layout filters these
  // out upstream in generateRooms; this branch only runs if something
  // slips through.)
  return { w: 2.0, h: 1.5 };
}

/**
 * Final canvas dimensions. Fits the image aspect *inside* the meta
 * bounding box — the frame (sized to this result in collectFurniture)
 * then hugs the canvas with only the FRAME_T mat around it. No visible
 * dark matte from an aspect mismatch.
 *
 * Deterministic at layout time: we prefer the aspect baked into
 * artworks.json (image-size probed from the original during
 * build-data), so the frame can be sized before the texture has loaded.
 * Texture dims are a fallback for artworks whose probe failed.
 */
function computePaintingSize(
  artwork: Artwork,
  texture: THREE.Texture | null,
): { w: number; h: number } {
  const meta = computeMetaSize(artwork);

  let imgAspect: number | null = null;
  if (artwork.width && artwork.height) {
    imgAspect = artwork.width / artwork.height;
  } else {
    const img = texture?.image as
      | { width?: number; height?: number }
      | undefined;
    imgAspect = img?.width && img?.height ? img.width / img.height : null;
  }

  if (!imgAspect) return meta;

  // Fit the image aspect inside the meta box: whichever of width /
  // height can't expand without overflowing is the binding constraint.
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
// Vertical breathing room between painting bottom and the plaque when
// it's demoted below the canvas (cluster-tight neighbours).
const PLAQUE_BELOW_GAP = 0.08;
// Minimum edge-to-edge gap needed between two side-wall paintings for
// their plaques to hang to the right without crossing into the
// neighbour. Below this, the layout puts the plaque under the painting
// instead. Derived from the plaque's horizontal footprint plus a small
// safety margin so we don't land flush against the next frame.
const PLAQUE_SIDE_MIN_GAP = PLAQUE_GAP + PLAQUE_W + 0.05;

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
  /** Room this painting lives in is the active (player-occupied) one.
   *  Only active rooms get per-painting accent lights and plaque-label
   *  `<Text>`, both of which are expensive per-frame / per-mount costs
   *  that we don't want paid for rooms the player is just glimpsing
   *  through a doorway. */
  isActive?: boolean;
  /** Milliseconds to delay the first render. Used to spread out
   *  `<Text>` and `<mesh>` creations across several frames when a new
   *  room enters the render window, instead of slamming all ~22
   *  paintings into a single frame. */
  staggerMs?: number;
};

function Painting({
  placement,
  onClick,
  onLoaded,
  reportProgress,
  isActive,
  staggerMs = 0,
}: PaintingProps) {
  const { artwork, position, rotation } = placement;
  const { gl, camera } = useThree();
  // Seed from cache synchronously so rooms that were already preloaded
  // render immediately on mount.
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    textureCache.get(artwork.objectKey) ?? null,
  );
  const [hiResTexture, setHiResTexture] = useState<THREE.Texture | null>(
    () => {
      const w = bestHiResWidth(artwork);
      return w ? (hiResCache.get(`${artwork.objectKey}@${w}`) ?? null) : null;
    },
  );
  const [staggerReady, setStaggerReady] = useState(() => staggerMs <= 0);
  const reportedRef = useRef(false);
  const hiResRequestedRef = useRef(false);
  // LOD distance check needs the painting's world position. Compute
  // once — it doesn't change between renders.
  const worldPosRef = useRef(new THREE.Vector3());
  const cameraWorldRef = useRef(new THREE.Vector3());

  useEffect(() => {
    if (staggerReady) return;
    const t = setTimeout(() => setStaggerReady(true), staggerMs);
    return () => clearTimeout(t);
  }, [staggerReady, staggerMs]);

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

  // Display the hi-res texture when we have it, else the normal one.
  const displayTexture = hiResTexture ?? texture;
  const { w, h } = computePaintingSize(artwork, displayTexture);
  // yCenter is driven by the canvas height — the instanced frame (in
  // FurnitureInstances) is sized to the same computePaintingSize + mat,
  // so frame and canvas share the same centre and the frame hugs the
  // painting with no visible matte.
  const yCenter = computePaintingYCenter(h);

  const groupPosition: [number, number, number] = [
    position[0],
    yCenter,
    position[2],
  ];
  worldPosRef.current.set(position[0], yCenter, position[2]);

  // Drop the hi-res texture: swap the mesh back to the base variant
  // and free the GPU memory. The dispose is deferred by one animation
  // frame so React's commit has time to point the material's `map` at
  // the base texture before the hi-res one is torn down — disposing
  // while still bound would either warn or flash black.
  const releaseHiRes = useCallback(() => {
    hiResRequestedRef.current = false;
    setHiResTexture((prev) => {
      if (!prev) return prev;
      const w = bestHiResWidth(artwork);
      if (w != null) {
        const key = `${artwork.objectKey}@${w}`;
        requestAnimationFrame(() => hiResCache.delete(key));
      }
      return null;
    });
  }, [artwork]);

  // LOD: when the player walks within HIRES_UPGRADE_DIST of an active
  // painting, upgrade to the biggest available variant; once they back
  // out past HIRES_DOWNGRADE_DIST, drop it and free the VRAM. Checked
  // every 12 frames (~5 Hz) — distance doesn't change that fast at
  // walking speed. Off-main-thread decode (createImageBitmap) keeps
  // the fetch from stalling the frame loop.
  const lodFrameRef = useRef(0);
  useFrame(() => {
    if (!isActive) return;
    if (bestHiResWidth(artwork) == null) return;
    lodFrameRef.current += 1;
    if (lodFrameRef.current % 12 !== 0) return;
    camera.getWorldPosition(cameraWorldRef.current);
    const dist = cameraWorldRef.current.distanceTo(worldPosRef.current);

    if (hiResTexture) {
      if (dist > HIRES_DOWNGRADE_DIST) releaseHiRes();
      return;
    }
    if (hiResRequestedRef.current) return;
    if (dist > HIRES_UPGRADE_DIST) return;

    hiResRequestedRef.current = true;
    const controller = new AbortController();
    loadHiResTexture(artwork, gl, controller.signal)
      .then((tex) => {
        if (tex) setHiResTexture(tex);
      })
      .catch(() => {
        // 404 or abort — leave the flag set so we don't retry spam;
        // a real reload of the page will try again.
      });
  });

  // When the room this painting belongs to leaves active status (the
  // player crossed a doorway), drop the hi-res immediately — there's
  // no reason to keep a multi-megabyte texture resident for a room
  // you're walking out of.
  useEffect(() => {
    if (isActive) return;
    releaseHiRes();
  }, [isActive, releaseHiRes]);

  // Unmount cleanup: if this painting had a hi-res variant in the
  // cache, drop it. Without this, rooms that leave the render window
  // hold onto their hi-res textures until the 12-slot LRU eventually
  // evicts them, which isn't aggressive enough to matter.
  useEffect(() => {
    const key = artwork.objectKey;
    return () => {
      const w = bestHiResWidth(artwork);
      if (w != null) hiResCache.delete(`${key}@${w}`);
    };
  }, [artwork]);

  return (
    <group position={groupPosition} rotation={rotation}>
      {/* Canvas mesh — material reuse across all paintings means no
          shader recompile after the first one, so no reason to
          stagger. Un-staggered = all canvases pop in together when
          their textures are ready, which feels correct anyway. */}
      {displayTexture && (
        <mesh
          position={[0, 0, 0.004]}
          userData={{ artwork }}
          onClick={(e) => {
            e.stopPropagation();
            onClick(artwork);
          }}
        >
          <planeGeometry args={[w, h]} />
          {/* meshBasicMaterial is unlit — cheapest fragment shader
              (one texture sample, no PBR math, no per-light eval).
              Paintings are effectively self-illuminated this way and
              don't vary with scene lights, which is a standard choice
              for museum displays and lets us pay almost nothing per
              covered pixel. */}
          <meshBasicMaterial map={displayTexture} toneMapped={false} />
        </mesh>
      )}

      {/* Plaque label — the expensive piece (troika SDF atlas per
          Text) lives here. Staggering spreads the cost across ~20
          frames instead of slamming it into one. Active-room only:
          you can't read labels across a doorway. */}
      {staggerReady && isActive && (
        <Plaque
          artwork={artwork}
          paintingWidth={w}
          paintingHeight={h}
          yCenter={yCenter}
          below={placement.plaqueBelow}
        />
      )}
    </group>
  );
}

// =============================================================
// Plaque
// =============================================================

function Plaque({
  artwork,
  paintingWidth,
  paintingHeight,
  yCenter,
  below,
}: {
  artwork: Artwork;
  paintingWidth: number;
  paintingHeight: number;
  yCenter: number;
  /** When true, hang the plaque under the painting instead of to the
   *  right of it. Used for cluster-tight neighbours whose side-hung
   *  plaques would overlap the adjacent canvas. */
  below: boolean;
}) {
  // Plaque box is drawn via an instanced mesh at the Gallery3D level;
  // this component positions only the label Text on top of it. The
  // instance's front face sits at z = PLAQUE_DEPTH (the box centre is
  // at PLAQUE_DEPTH/2, extends ±half-depth). Park the Text a hair in
  // front of that face — otherwise it renders *inside* the opaque
  // cream body and is completely occluded.
  const plaqueX = below ? 0 : paintingWidth / 2 + PLAQUE_GAP + PLAQUE_W / 2;
  const plaqueY = below
    ? -paintingHeight / 2 - PLAQUE_BELOW_GAP - PLAQUE_H / 2
    : EYE_HEIGHT - yCenter;
  const plaqueZ = PLAQUE_DEPTH + 0.003;

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
      // troika computes its own bounding sphere from the rendered
      // glyphs. Under some transforms (rotations, newlines, dynamic
      // maxWidth) that sphere ends up wrong and the text culls even
      // when it's plainly in frame. Don't cull.
      frustumCulled={false}
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
  // Box (not plane) so the wall has real WALL_THICKNESS in depth. Frames
  // sink 2 cm backward into the wall surface to give the mat its inset
  // look; with a zero-depth plane that 2 cm poked out the *other* side
  // of the wall and was visible as a phantom rectangle in the adjacent
  // room. Box walls hide the backward frame extension completely.
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={[width, height, WALL_THICKNESS]} />
      <meshStandardMaterial color={color} roughness={0.92} />
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

  // Box panels for the same reason as SolidWall — a zero-depth plane
  // lets the adjacent-room painting frames poke through the wall.
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[leftX, 0, 0]}>
        <boxGeometry args={[sideWidth, height, WALL_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      <mesh position={[rightX, 0, 0]}>
        <boxGeometry args={[sideWidth, height, WALL_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      <mesh position={[0, lintelY, 0]}>
        <boxGeometry args={[doorWidth, lintelH, WALL_THICKNESS]} />
        <meshStandardMaterial color={color} roughness={0.92} />
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
  isActive,
}: {
  layout: RoomLayout;
  nextTitle: string | null;
  nextDescription: string | null;
  prevTitle: string | null;
  isActive: boolean;
}) {
  const { data, isFirst, isLast, backZ, frontZ, centerZ, depth } = layout;
  const backHasDoor = !isLast;
  const frontHasDoor = !isFirst;

  // Distribute ceiling lamps along the room's depth. Kept constant at
  // 2 rows (4 lamps) across every room so the total pointLight count
  // doesn't flip when the player moves between a small and a large
  // room — flipping it would force a shader recompile on every door
  // crossing, which is a ~50 ms main-thread stall.
  const lampRows = 2;
  const lampPositions: Array<[number, number, number]> = [];
  for (let r = 0; r < lampRows; r++) {
    const t = r / (lampRows - 1);
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
      {/* Ceiling lamps only inhabit the active room. Neighbour rooms
          rely on ambient + hemisphere fill, which reads as "the next
          room is dim, you haven't turned the lights on yet". Drops the
          live-pointLight count from 20+ down to ~4, which the forward
          shader evaluates per fragment. */}
      {isActive && lampPositions.map((p, i) => (
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
  // Head-bob phase: advances while walking on the ground, holds still
  // otherwise. Converted to a tiny sinusoidal y-offset + lateral x
  // roll for a "footsteps carrying the head" feel.
  const bobPhase = useRef(0);
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

    // Head bob: advance phase while walking, let it ease back to zero
    // when standing still. Frequency scales with speed (faster walking
    // = quicker bob). 1.6 cm peak, 2× rate so one step produces one
    // up-and-down cycle.
    const isWalking =
      grounded.current && move.lengthSq() > 0;
    if (isWalking) {
      bobPhase.current += speed * dt * 1.6;
    }
    const bobY = isWalking ? Math.sin(bobPhase.current * 2) * 0.016 : 0;
    const walkingFloor = EYE_HEIGHT + bobY;

    // Vertical integration — "floor" shifts subtly when walking so the
    // bob blends with jumping/gravity correctly.
    velocityY.current -= GRAVITY * dt;
    camera.position.y += velocityY.current * dt;
    if (camera.position.y <= walkingFloor) {
      camera.position.y = walkingFloor;
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
  // Invisible full-screen click target. The scene is fully visible
  // underneath — no darkening, no modal. The hint in the corner is
  // purely informational; the whole surface relocks on any click.
  return (
    <button
      type="button"
      onClick={onResume}
      aria-label="Resume"
      className="absolute inset-0 z-10 cursor-pointer bg-transparent"
    >
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white/80 backdrop-blur">
        Click to resume
      </div>
    </button>
  );
}

function Crosshair({ inspecting }: { inspecting: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
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
      </div>
      {inspecting && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
          Click or <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">E</kbd> to inspect
        </div>
      )}
    </>
  );
}

function HintBar({ visible }: { visible: boolean }) {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-xs text-white/80 backdrop-blur transition-opacity duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      WASD · Shift · Space · Click/E to inspect ·{" "}
      <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">H</kbd>{" "}
      hints ·{" "}
      <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">`</kbd>{" "}
      stats · Esc to release
    </div>
  );
}

function RoomBanner({
  visible,
  title,
}: {
  visible: boolean;
  title: string;
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-black/55 px-4 py-1 text-xs font-medium text-white/85 backdrop-blur transition-opacity duration-500 ease-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {title}
    </div>
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
      // Intentionally not binding Escape: Chrome blocks requestPointerLock()
      // if the triggering user gesture was an Escape keypress (security:
      // sites can't re-trap the user after they hit the universal escape
      // hatch). Closing the zoom view via E/F is just a normal keypress,
      // so re-lock succeeds on the same gesture and the walker resumes
      // without going through the ResumeOverlay. Browser-level Escape
      // still works if it needs to — at this point pointer lock is
      // already released, so ESC is a no-op anyway.
      if (e.code === "KeyE" || e.code === "KeyF") {
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
        <kbd className="rounded border border-white/30 px-1">E</kbd> closes
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
  /** Which room this belongs to — used to decide whether to draw the
   *  plaque (active room only; neighbour rooms get the frame but not
   *  the empty cream card). */
  roomIndex: number;
};

function collectFurniture(
  layouts: RoomLayout[],
  visibleIdx: Set<number>,
): FurniturePlacement[] {
  const out: FurniturePlacement[] = [];
  for (const i of visibleIdx) {
    const layout = layouts[i];
    for (const p of layout.placements) {
      // Size furniture (frame + plaque offset) from the painting's
      // final dimensions, not the raw meta box. computePaintingSize
      // reads the artwork's aspect from artworks.json so it's
      // deterministic at layout time — no texture needed. The frame
      // then hugs the canvas on every artwork, including ones whose
      // image aspect doesn't match the metadata bounding box.
      const painting = computePaintingSize(p.artwork, null);
      const yCenter = computePaintingYCenter(painting.h);
      const plaqueOffsetX = p.plaqueBelow
        ? 0
        : painting.w / 2 + PLAQUE_GAP + PLAQUE_W / 2;
      const plaqueOffsetY = p.plaqueBelow
        ? -painting.h / 2 - PLAQUE_BELOW_GAP - PLAQUE_H / 2
        : EYE_HEIGHT - yCenter;
      out.push({
        key: `${layout.data.id}-${p.artwork.id}`,
        groupPosition: [p.position[0], yCenter, p.position[2]],
        rotation: p.rotation,
        frameScale: [
          painting.w + FRAME_T * 2,
          painting.h + FRAME_T * 2,
          FRAME_DEPTH,
        ],
        plaqueOffsetX,
        plaqueOffsetY,
        roomIndex: i,
      });
    }
  }
  return out;
}

function FurnitureInstances({
  placements,
  activeRoom,
}: {
  placements: FurniturePlacement[];
  activeRoom: number;
}) {
  // Plaque boxes exist only in the active room — the Text lives there
  // too, and a plaque card with no text just looks like a blank
  // rectangle glued to the wall.
  const activePlaques = useMemo(
    () => placements.filter((p) => p.roomIndex === activeRoom),
    [placements, activeRoom],
  );

  if (placements.length === 0) return null;
  // Cap `limit` above typical worst-case (22 paintings per room × 5
  // visible rooms = 110) so drei's backing buffer doesn't reallocate
  // every time the set changes.
  const framesLimit = Math.max(200, placements.length + 32);
  const plaqueLimit = Math.max(64, activePlaques.length + 16);

  return (
    <>
      {/* Frames — dark wood box, sunk behind the wall surface by
          FRAME_DEPTH/2 so the canvas sits flush with the wall face.
          frustumCulled={false} is essential: drei's <Instances> uses a
          single bounding sphere computed from instance 0's transform,
          and when that instance happens to be outside the frustum the
          entire batch culls — which is the "frames disappear from some
          angles" bug. */}
      <Instances
        limit={framesLimit}
        range={placements.length}
        frustumCulled={false}
      >
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
          is constant across the scene. Active room only (see above). */}
      {activePlaques.length > 0 && (
        <Instances
          limit={plaqueLimit}
          range={activePlaques.length}
          frustumCulled={false}
        >
          <boxGeometry args={[PLAQUE_W, PLAQUE_H, PLAQUE_DEPTH]} />
          <meshStandardMaterial
            color="#f4ecd8"
            emissive="#2a1e10"
            emissiveIntensity={0.05}
            roughness={0.7}
            metalness={0}
          />
          {activePlaques.map((p) => (
            <group
              key={p.key}
              position={p.groupPosition}
              rotation={p.rotation}
            >
              <Instance
                position={[
                  p.plaqueOffsetX,
                  p.plaqueOffsetY,
                  PLAQUE_DEPTH / 2,
                ]}
              />
            </group>
          ))}
        </Instances>
      )}
    </>
  );
}

// =============================================================
// Accent light pool — N pointLights that never unmount; their
// positions (and on/off intensity) update when the active room
// changes.
// =============================================================

/**
 * Fixed capacity — must be ≥ the largest dynamicMaxPerRoom result, so
 * a small-works-packed room has a light per painting with headroom. If
 * the active room has fewer paintings, the extras sit idle (intensity
 * 0, parked far off-screen). Crucially the total count of
 * `<pointLight>` components stays constant across the whole session, so
 * Three.js's forward shader compiles exactly once for this count and
 * never recompiles during a room crossing.
 */
const ACCENT_LIGHT_POOL_SIZE = MAX_PER_ROOM_SMALL;

function AccentLightPool({
  layouts,
  activeRoom,
}: {
  layouts: RoomLayout[];
  activeRoom: number;
}) {
  const lights = useMemo(() => {
    const active = layouts[activeRoom];
    const out: Array<
      | {
          position: [number, number, number];
          on: true;
        }
      | { on: false }
    > = [];
    if (active) {
      for (const p of active.placements.slice(0, ACCENT_LIGHT_POOL_SIZE)) {
        // Same sizing path as the Painting / frame — keeps accent
        // lights centred on the canvas, not on the unused meta box.
        const painting = computePaintingSize(p.artwork, null);
        const yCenter = computePaintingYCenter(painting.h);
        // Local offset inside the painting's group: slightly in front
        // and just below centre, same as the previous per-Painting
        // accent-light position.
        const localOffset = new THREE.Vector3(0, 0.2, 1.1);
        const euler = new THREE.Euler(
          p.rotation[0],
          p.rotation[1],
          p.rotation[2],
        );
        localOffset.applyEuler(euler);
        out.push({
          position: [
            p.position[0] + localOffset.x,
            yCenter + localOffset.y,
            p.position[2] + localOffset.z,
          ],
          on: true,
        });
      }
    }
    while (out.length < ACCENT_LIGHT_POOL_SIZE) out.push({ on: false });
    return out;
  }, [layouts, activeRoom]);

  return (
    <>
      {lights.map((cfg, i) => (
        <pointLight
          key={i}
          position={cfg.on ? cfg.position : [0, -1000, 0]}
          intensity={cfg.on ? 2.2 : 0}
          distance={3.5}
          decay={2}
          color="#ffd9a8"
        />
      ))}
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
  const [hintsVisible, setHintsVisible] = useState(true);
  const [roomBannerVisible, setRoomBannerVisible] = useState(false);

  // Hint bar: show for a few seconds after locking, then quietly fade.
  // `H` toggles it back on at any time.
  useEffect(() => {
    if (!locked) return;
    setHintsVisible(true);
    const t = setTimeout(() => setHintsVisible(false), 4000);
    return () => clearTimeout(t);
  }, [locked]);

  // Room title banner: briefly announce the new room on entry, then
  // fade. Re-shows on every crossing so you always see the next
  // room's name without having to look at the signage.
  useEffect(() => {
    setRoomBannerVisible(true);
    const t = setTimeout(() => setRoomBannerVisible(false), 2500);
    return () => clearTimeout(t);
  }, [activeRoom]);
  const controlsRef = useRef<PointerLockControlsHandle | null>(null);

  // ── Audio ────────────────────────────────────────────────────────────────
  // Ambience: a long looping <audio> streamed via HTMLAudioElement.
  // SFX: a tiny preloaded Audio for the lightswitch tick on room transitions.
  // Both are gated on the user's Start-click (browsers block autoplay).
  // The AudioControls component writes to the same localStorage-backed hook,
  // so we only need the read half here. Changes there propagate via the
  // hook's internal pub/sub — no prop drilling needed.
  const [audio] = useAudioSettings();
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  // Seed the one-shot SFX element on first client render. Tiny file (6 KB),
  // preload=auto buys a decoded buffer before the first room crossing.
  useEffect(() => {
    if (sfxRef.current) return;
    const a = new Audio(ROOM_TRANSITION_SRC);
    a.preload = "auto";
    sfxRef.current = a;
  }, []);
  // Keep <audio> volume + play state in sync with user settings + entry gate.
  useEffect(() => {
    const el = ambienceRef.current;
    if (!el) return;
    el.volume = audio.ambienceVolume;
    if (hasEntered && audio.enabled) {
      // play() may reject if Chrome hasn't decided the gesture is "valid
      // enough" — harmless, the next gesture (room change, slider nudge,
      // re-lock click) will retry this effect and succeed.
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [audio.enabled, audio.ambienceVolume, hasEntered]);

  const playRoomTransition = useCallback(() => {
    if (!audio.enabled) return;
    const a = sfxRef.current;
    if (!a) return;
    // Restart from 0 so rapid door crossings don't drop any clicks.
    a.currentTime = 0;
    a.volume = audio.sfxVolume;
    void a.play().catch(() => {});
  }, [audio.enabled, audio.sfxVolume]);

  useEffect(() => {
    // Backtick toggles the stats overlay (F3 is hijacked by the
    // browser's find-next). Off by default; flip on when benchmarking.
    // Also toggle the hint bar with H.
    const h = (e: KeyboardEvent) => {
      if (e.code === "Backquote") {
        e.preventDefault();
        setShowStats((v) => !v);
      }
      if (e.code === "KeyH") {
        setHintsVisible((v) => !v);
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
    // Try to re-engage pointer lock right away. This *is* a user gesture
    // (the click on Close), so it'll succeed unless Chrome's post-unlock
    // cooldown (~1.5 s) is still active.
    const tryLock = () => controlsRef.current?.lock?.();
    tryLock();
    // Fall-back: the *next* click anywhere retries. That click is itself
    // a user gesture, and by then the cooldown has passed. The net UX:
    // rapid close = one extra (invisible) click and you're back in; slow
    // close = no extra click at all.
    const onNextClick = () => {
      tryLock();
    };
    window.addEventListener("pointerdown", onNextClick, { once: true });
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
        dpr={[1, 1.25]}
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
              isActive={i === activeRoom}
            />
          );
        })}

        {layouts.flatMap((layout, i) => {
          if (!visibleIdx.has(i)) return [];
          const reportProgress = i === 0 && !hasEntered;
          const isActive = i === activeRoom;
          return layout.placements.map((p, idx) => (
            <Painting
              key={`${layout.data.id}-${p.artwork.id}`}
              placement={p}
              onClick={handleZoomRequest}
              reportProgress={reportProgress}
              onLoaded={
                reportProgress ? handleFirstRoomLoaded : undefined
              }
              isActive={isActive}
              // Spread ~22 paintings across ~450 ms so the <Text> SDF
              // atlas generation and mesh creation don't batch into a
              // single frame when a new room mounts. Imperceptible at
              // walking speed, inexpensive on the main thread.
              staggerMs={idx * 20}
            />
          ));
        })}

        <FurnitureInstances placements={furniture} activeRoom={activeRoom} />

        <AccentLightPool layouts={layouts} activeRoom={activeRoom} />

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
            // Eager update — the heavy mount costs were killed in
            // the previous pass; startTransition just added input
            // latency to every crossing without helping any more.
            setActiveRoom(i);
            // The satisfying part: a lightswitch click per room. Fires on
            // the very first detected room too (lastRoomIdx starts at -1),
            // which doubles as an "entering the museum" click when you
            // first step out of the StartOverlay.
            playRoomTransition();
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
          <HintBar visible={hintsVisible} />
          <RoomBanner
            visible={roomBannerVisible}
            title={activeRoomData.title}
          />
        </>
      )}
      {zoomed && (
        <ZoomModal artwork={zoomed} onClose={handleZoomClose} />
      )}

      {/* Audio settings pill — always visible when inside the gallery (after
          the user's first click, which is also our autoplay gate). Hidden on
          the initial Start screen so it doesn't compete with the big CTA. */}
      {hasEntered && !zoomed && (
        <AudioControls className="top-4 right-4" />
      )}

      {/*
        Background ambience. <audio> streams (preload=auto buffers forward
        instead of downloading in full), loops seamlessly, and gets its volume
        + play/pause driven by the effect further up. Hidden from the layout
        but kept in the DOM for the whole Gallery3D lifetime so settings
        changes don't interrupt the loop.
      */}
      <audio
        ref={ambienceRef}
        src={AMBIENCE_SRC}
        loop
        preload="auto"
        aria-hidden="true"
        className="hidden"
      />
    </div>
  );
}
