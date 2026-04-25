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

export const signBaseMaterial = new THREE.MeshStandardMaterial({
  color: "#1a1108",
  emissive: new THREE.Color("#1a1108"),
  emissiveIntensity: 0.15,
  roughness: 0.7,
});

// Brushed-aluminium label card — the printed face of a painting
// plaque. Lighter than every era's wall colour so the plaque always
// pops, with enough metalness to catch a faint highlight from the
// room's overhead light. Slight emissive lift keeps the text legible
// even in dim galleries.
export const plaqueBaseMaterial = new THREE.MeshStandardMaterial({
  color: "#eef0f1",
  emissive: new THREE.Color("#1a1a1c"),
  emissiveIntensity: 0.06,
  roughness: 0.32,
  metalness: 0.55,
});

// Slightly darker brushed-steel backing plate, fractionally larger
// than the face. Metalness is high enough to read as polished metal
// from across the room without looking mirror-finish at close range.
export const plaqueMountMaterial = new THREE.MeshStandardMaterial({
  color: "#9aa0a6",
  roughness: 0.28,
  metalness: 0.7,
});
