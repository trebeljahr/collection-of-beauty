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

import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";
import type { FrameProfileId } from "./frame-geometry";
import { buildMapBundle } from "./texture-pack";
import { getDamaskRoughnessMap } from "./wall-damask";
import { isDeepWall } from "./wall-light";

// One floor texture for the whole building. Eras tint the floor with
// `floorColor` (and rooms with `roomAccents`), but the underlying
// surface is always the same herringbone parquet so boards join cleanly
// at every staircase landing and room↔room threshold instead of
// switching abruptly between era-themed pads.
//
// It was dark patterned brick until the rooms got picture lights. Brick
// under near-black tints gave the spill of a spot nothing to land on,
// and the walls now sit dimmer between pools, so a dark floor closed the
// room in. Oak parquet is the common floor of the picture galleries the
// lighting is modelled on.
const SHARED_FLOOR_TEXTURE_SLUG = "herringbone_parquet";

// The palette's floor colours were authored as near-black tints for the
// brick. Over wood they would read as charred, so each is lifted most of
// the way to white: the room keeps a trace of its warm or cool cast and
// the board colour comes from the texture.
const FLOOR_TINT_LIFT = 0.62;
const _white = new THREE.Color("#ffffff");
function floorTint(color: string): THREE.Color {
  return new THREE.Color(color).lerp(_white, FLOOR_TINT_LIFT);
}

// Satin lacquer: enough sheen for the floor to pick up the room, short
// of the wet look the set's own roughness map (≈ 0.10) gives.
const FLOOR_ROUGHNESS = 0.42;

// Per-mesh world-unit UVs (see room-geometry.tsx + hallway.tsx) make
// 1 unit of UV = 1 m of world, so the repeat here is tiles per metre.
// The parquet set shows eight courses across its width; at one tile per
// 3 m a board comes out about 37 cm long, the size of a real block.
//
// Walls carry no photographed texture. The first attempt looked
// worse than the flat-tinted plaster: AO baked into the diffuse
// fought the engine's lighting around painting frames, and uniform-
// repeat tiling stretched badly on long room walls. The `wallTexture`
// field on the Palette type is still there for a second try. What a
// wall can have is `wallPattern`: a procedural roughness map with no
// colour and no occlusion in it (wall-damask.ts), on UVs in metres.
const FLOOR_REPEAT: [number, number] = [1 / 3, 1 / 3];

export type PaletteMaterials = {
  wall: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
};

const cache = new Map<Palette, PaletteMaterials>();

export function getPaletteMaterials(palette: Palette): PaletteMaterials {
  let entry = cache.get(palette);
  if (entry) return entry;

  const floorTextures = buildMapBundle(SHARED_FLOOR_TEXTURE_SLUG, FLOOR_REPEAT[0], FLOOR_REPEAT[1]);

  entry = {
    wall: new THREE.MeshStandardMaterial({
      color: palette.wallColor,
      roughness: 0.92,
      side: THREE.DoubleSide,
      // A deep period colour skips tone mapping, or Neutral strips its
      // weakest channel and crimson shows as signal red (wall-light.ts).
      toneMapped: !isDeepWall(palette.wallColor),
      ...(palette.wallPattern === "damask"
        ? { roughness: 1, roughnessMap: getDamaskRoughnessMap() }
        : null),
    }),
    floor: new THREE.MeshStandardMaterial({
      color: floorTint(palette.floorColor),
      ...floorTextures,
      // Override the roughnessMap from the bundle with a fixed scalar.
      // Per-set roughness ARM channels vary wildly (herringbone_parquet
      // ≈ 0.10 = mirror, patterned_brick_floor ≈ 0.82 = chalk), so the
      // map decides whether a floor reads bright-and-glossy or crushed
      // to black more than the lighting does.
      roughnessMap: null,
      roughness: FLOOR_ROUGHNESS,
      metalness: 0,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      color: palette.ceilingColor,
      roughness: 0.96,
      // Ceilings sit between two floors as a single plane (no slab on
      // top, unlike floors). Looking down from a higher level through a
      // stairwell well lands on the backface — backface-culled — and
      // the env map / scene behind shows through. DoubleSide closes the
      // hole at the cost of one extra triangle worth of shading per
      // ceiling cell, which is negligible.
      side: THREE.DoubleSide,
    }),
  };
  cache.set(palette, entry);
  return entry;
}

// ── Per-room floor materials ──────────────────────────────────────────
// Rooms carry their own floor tint (see Era.palette.roomAccents) but
// share one texture across the whole building. Cached by colour alone.

const roomFloorCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Per-room floor material. Reuses the building-wide shared floor
 * texture (floor 0's slug) so adjacent rooms and hallways tile
 * continuously, with only the colour tint distinguishing rooms.
 */
export function getRoomFloorMaterial(color: string): THREE.MeshStandardMaterial {
  let mat = roomFloorCache.get(color);
  if (mat) return mat;
  const textures = buildMapBundle(SHARED_FLOOR_TEXTURE_SLUG, FLOOR_REPEAT[0], FLOOR_REPEAT[1]);
  mat = new THREE.MeshStandardMaterial({
    color: floorTint(color),
    ...textures,
    // See getPaletteMaterials' floor for why the roughnessMap is
    // replaced by a uniform scalar.
    roughnessMap: null,
    roughness: FLOOR_ROUGHNESS,
    metalness: 0,
    // Stairwell floors above the player are viewed from below (looking
    // up through the well). Single-sided rendering would backface-cull
    // the underside and leave the scene's black backdrop showing through
    // — the "see-through floor" bug. Regular room floors are never
    // viewed from below, so DoubleSide is a no-op there.
    side: THREE.DoubleSide,
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
// Five frame looks, picked per artwork in painting.tsx from its
// movement. Each pairs a moulding profile (frame-geometry.ts) with the
// materials for its two slots: the moulding itself and, where the
// profile has one, the slip or fillet next to the canvas. Every frame
// material reads the profile's baked occlusion from vertex colours.

export type FrameVariantId = "gilded" | "walnut" | "ebony" | "paleAsh" | "redLacquer";

export type FrameVariant = {
  profile: FrameProfileId;
  /** [moulding, slip]: indexed by the frame geometry's groups. */
  materials: THREE.MeshStandardMaterial[];
};

// Warm gilt over red bole: Baroque, Renaissance, Academicism. The
// colour is close to gold's reflectance; the warmth comes from the
// highlight map the frame materials reflect (frame-env.ts).
const gildedMaterial = new THREE.MeshStandardMaterial({
  color: "#c9a35a",
  roughness: 0.34,
  metalness: 0.9,
  vertexColors: true,
});

// Dark red velvet slip between the canvas and the gilt.
const gildedSlipMaterial = new THREE.MeshStandardMaterial({
  color: "#3a0d10",
  roughness: 0.85,
  metalness: 0,
  vertexColors: true,
});

// Dark walnut: Dutch Golden Age, Realism, Romanticism, Tonalism.
const walnutMaterial = new THREE.MeshStandardMaterial({
  color: "#2a1a0e",
  roughness: 0.5,
  metalness: 0.05,
  vertexColors: true,
});

// Slim black lacquer: Modernism, Fauvism, Post-Impressionism.
const ebonyMaterial = new THREE.MeshStandardMaterial({
  color: "#0d0b0a",
  roughness: 0.28,
  metalness: 0.1,
  vertexColors: true,
});

// Pale ash: Impressionism, Pre-Raphaelite, Art Nouveau.
const paleAshMaterial = new THREE.MeshStandardMaterial({
  color: "#c9b48a",
  roughness: 0.7,
  metalness: 0.02,
  vertexColors: true,
});

// Red-black lacquer with a gold fillet: Ukiyo-e.
const redLacquerMaterial = new THREE.MeshStandardMaterial({
  color: "#2a0a08",
  roughness: 0.26,
  metalness: 0.15,
  vertexColors: true,
});

const goldFilletMaterial = new THREE.MeshStandardMaterial({
  color: "#d4a73a",
  roughness: 0.3,
  metalness: 0.95,
  vertexColors: true,
});

export const FRAME_VARIANTS: Record<FrameVariantId, FrameVariant> = {
  gilded: { profile: "gilded", materials: [gildedMaterial, gildedSlipMaterial] },
  walnut: { profile: "walnut", materials: [walnutMaterial] },
  ebony: { profile: "ebony", materials: [ebonyMaterial] },
  paleAsh: { profile: "paleAsh", materials: [paleAshMaterial] },
  redLacquer: { profile: "redLacquer", materials: [redLacquerMaterial, goldFilletMaterial] },
};

// Dark bronze metalwork: the frame round each laylight (laylight.tsx).
export const fixtureMaterial = new THREE.MeshStandardMaterial({
  color: "#1c1b1a",
  roughness: 0.4,
  metalness: 0.7,
});

/** Materials that reflect the frame highlight map instead of the plain
 *  room gradient: everything polished enough to show a glint. */
export const HIGHLIGHT_ENV_MATERIALS: THREE.MeshStandardMaterial[] = [
  gildedMaterial,
  walnutMaterial,
  ebonyMaterial,
  paleAshMaterial,
  redLacquerMaterial,
  goldFilletMaterial,
  fixtureMaterial,
];

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
  // The card hangs inside its work's pool of light, but the pool is
  // drawn on the wall behind it and never reaches the card. Enough
  // self-light to read as lit paper next to the lit wall.
  emissive: new THREE.Color("#f3efe6"),
  emissiveIntensity: 0.42,
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
HIGHLIGHT_ENV_MATERIALS.push(plaqueMountMaterial);
