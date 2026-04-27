"use client";

// One material per (palette × surface) pair, cached by Palette object
// identity. ERAS in gallery-eras.ts is a module-level const so the
// Palette references are stable, making plain Map the right container
// (no cleanup needed — materials live for the page lifetime and the
// set is bounded by era count × kinds ≈ 7 × 4 = 28).
//
// Ported from src/components/gallery-3d.tsx's `paletteMaterialCache`.
// The same trick avoids allocating a fresh MeshStandardMaterial per
// wall/floor/ceiling mesh, which was the single biggest contributor to
// GC pressure in the corridor gallery (50+ paintings × 4 walls each).

import type { Palette } from "@/lib/gallery-eras";
import * as THREE from "three";

export type PaletteMaterials = {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  lampHousing: THREE.MeshStandardMaterial;
};

const cache = new Map<Palette, PaletteMaterials>();

export function getPaletteMaterials(palette: Palette): PaletteMaterials {
  let entry = cache.get(palette);
  if (entry) return entry;
  entry = {
    wall: new THREE.MeshStandardMaterial({
      color: palette.wallColor,
      roughness: 0.92,
      side: THREE.DoubleSide,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: palette.floorColor,
      roughness: 0.88,
      metalness: 0.05,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: palette.ceilingColor,
      roughness: 0.96,
    }),
    lampHousing: new THREE.MeshStandardMaterial({
      color: "#2a1d14",
      emissive: new THREE.Color(palette.lampTint),
      emissiveIntensity: 1.6,
      roughness: 0.5,
    }),
  };
  cache.set(palette, entry);
  return entry;
}

// ── Per-room floor materials ──────────────────────────────────────────
// Rooms now carry their own floor tint (see Era.palette.roomAccents).
// Materials are cached by hex string so two rooms picking the same
// accent share one material — bounded by the union of authored accents
// (≈ 5 × 7 = 35 max) regardless of room count.

const roomFloorCache = new Map<string, THREE.MeshStandardMaterial>();

export function getRoomFloorMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = roomFloorCache.get(color);
  if (mat) return mat;
  mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.05,
  });
  roomFloorCache.set(color, mat);
  return mat;
}

// ── Palette-invariant materials (same across every era) ───────────────
// Dark wood trim for doorframes; cream for signs; etc. These are
// allocated once at module load.

export const darkWoodTrimMaterial = new THREE.MeshStandardMaterial({
  color: "#2a1d14",
  roughness: 0.6,
  metalness: 0.1,
});

export const frameMaterial = new THREE.MeshStandardMaterial({
  color: "#1a1108",
  roughness: 0.55,
  metalness: 0.05,
});

// ── Frame variants ────────────────────────────────────────────────────
// Five distinct frame looks, picked per-artwork in painting.tsx based on
// the painting's movement. Each variant tweaks colour, depth, inset, and
// (optionally) an inner liner rim to match the work's era.

export type FrameVariantId = "gilded" | "walnut" | "ebony" | "paleAsh" | "redLacquer";

export type FrameVariant = {
  material: THREE.MeshStandardMaterial;
  depth: number;
  inset: number;
  liner?: {
    material: THREE.MeshStandardMaterial;
    /** width of the visible rim around the canvas, in metres */
    width: number;
  };
};

// Warm carved gold — Baroque / Renaissance / Academicism. Deep & chunky
// so it reads as an ornate frame from across the room. A dark-red velvet
// liner sits just inside, the way real period frames are mounted.
const gildedMaterial = new THREE.MeshStandardMaterial({
  color: "#b8893a",
  roughness: 0.32,
  metalness: 0.85,
});

const gildedLinerMaterial = new THREE.MeshStandardMaterial({
  color: "#3a0d10",
  roughness: 0.78,
  metalness: 0.05,
});

// Dark walnut — Dutch Golden Age, Realism, Romanticism, Tonalism. The
// original "default" look, kept as one of the variants.
const walnutMaterial = new THREE.MeshStandardMaterial({
  color: "#1a1108",
  roughness: 0.55,
  metalness: 0.05,
});

// Slim black lacquer — Modernism, Fauvism, Post-Impressionism. Slight
// sheen, no liner; reads as a confident minimal frame.
const ebonyMaterial = new THREE.MeshStandardMaterial({
  color: "#0a0807",
  roughness: 0.22,
  metalness: 0.15,
});

// Pale ash / birch — Impressionism, Pre-Raphaelite, Art Nouveau. Light,
// matte, lets the painting's colours dominate.
const paleAshMaterial = new THREE.MeshStandardMaterial({
  color: "#c9b48a",
  roughness: 0.78,
  metalness: 0.02,
});

// Deep red-black with a thin metallic-gold liner — Ukiyo-e. Echoes
// East-Asian lacquer mounting without going full kimono.
const redLacquerMaterial = new THREE.MeshStandardMaterial({
  color: "#2a0a08",
  roughness: 0.28,
  metalness: 0.18,
});

const goldLinerMaterial = new THREE.MeshStandardMaterial({
  color: "#d4a73a",
  roughness: 0.3,
  metalness: 0.95,
});

// Frame depth is hard-capped well under the canvas plane offset of
// 14 mm (see PaintingPlane). Anything ≥ 0.028 puts the frame's front
// face at or in front of the canvas plane and z-fights with it; deeper
// still and the frame box visibly occludes the painting. We cap at
// 0.020 (front face at 0.010 → 4 mm clearance to canvas) and lean on
// material + inset width + an optional liner rim for variant identity
// instead of depth.
export const FRAME_VARIANTS: Record<FrameVariantId, FrameVariant> = {
  gilded: {
    material: gildedMaterial,
    depth: 0.02,
    inset: 0.045,
    liner: { material: gildedLinerMaterial, width: 0.011 },
  },
  walnut: {
    material: walnutMaterial,
    depth: 0.02,
    inset: 0.025,
  },
  ebony: {
    material: ebonyMaterial,
    depth: 0.014,
    inset: 0.016,
  },
  paleAsh: {
    material: paleAshMaterial,
    depth: 0.018,
    inset: 0.035,
  },
  redLacquer: {
    material: redLacquerMaterial,
    depth: 0.02,
    inset: 0.025,
    liner: { material: goldLinerMaterial, width: 0.006 },
  },
};

export const signBaseMaterial = new THREE.MeshStandardMaterial({
  color: "#1a1108",
  emissive: new THREE.Color("#1a1108"),
  emissiveIntensity: 0.15,
  roughness: 0.7,
});

// Printed face of the painting plaque — kept matte and very light so
// the engraved text reads crisply at any angle. The shimmer lives on
// the surrounding mount, not here; a metallic face would catch
// environment reflections that wash out small text.
export const plaqueBaseMaterial = new THREE.MeshStandardMaterial({
  color: "#f5f5f7",
  emissive: new THREE.Color("#202024"),
  emissiveIntensity: 0.08,
  roughness: 0.85,
  metalness: 0,
});

// Polished-chrome backing plate that rims the face. High metalness
// and low roughness make it pick up a sharp highlight from the
// room's overhead light, so the plaque shimmers without smearing
// reflections across the printed text.
export const plaqueMountMaterial = new THREE.MeshStandardMaterial({
  color: "#d8dde2",
  roughness: 0.18,
  metalness: 1.0,
});
