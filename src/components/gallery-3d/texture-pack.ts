"use client";

// Module-level Poly Haven texture loader.
//
// Why module-level (not React hook): the gallery's materials are
// allocated once per (era × surface) pair in palette-materials.ts and
// shared across every wall/floor/ceiling on a floor. Loading textures
// inside a hook would force materials to live inside React component
// scope — losing the cache that keeps GC pressure down.
//
// Trade-off: textures load asynchronously after `<Canvas>` mounts. The
// existing "Click to enter" overlay covers the brief blank-mapped
// frame. Once the JPG arrives, three.js's TextureLoader sets
// `needsUpdate = true` on the source texture, the renderer uploads on
// the next frame, and every material that bound the source picks up
// the textured map automatically.

import * as THREE from "three";

const loader = new THREE.TextureLoader();

/** Map kinds the downloader fetches. Mirrors WANTED_MAPS in
 *  scripts/download-textures.mjs. `disp` isn't bound to a material
 *  slot here — it's downloaded for future displacement work. */
type MapKind = "diff" | "nor_gl" | "arm";

/** Cache key: `${slug}/${map}`. Returned textures are SHARED across
 *  every binding — we don't clone. Materials that want different
 *  `.repeat` values would conflict, but every caller in this codebase
 *  passes (1, 1) and lets per-mesh world-unit UVs handle tiling, so
 *  cloning was paying complexity (see commit history) for nothing. */
const sourceCache = new Map<string, THREE.Texture>();

function loadSource(slug: string, map: MapKind): THREE.Texture {
  const key = `${slug}/${map}`;
  const cached = sourceCache.get(key);
  if (cached) return cached;
  // Mirror the layout written by scripts/download-textures.mjs.
  const url = `/textures/${slug}/${slug}_${map}_1k.jpg`;
  const tex = loader.load(url, undefined, undefined, (err) => {
    console.warn(`[texture-pack] failed to load ${url}:`, err);
  });
  // Diffuse is sRGB; everything else (normal, roughness, metalness,
  // ao) is linear data so it must NOT be gamma-decoded.
  tex.colorSpace = map === "diff" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  sourceCache.set(key, tex);
  return tex;
}

/**
 * Bundle of PBR maps for a Poly Haven set, ready to spread onto a
 * MeshStandardMaterial:
 *
 *   const bundle = buildMapBundle("marble_01", 1, 1);
 *   new THREE.MeshStandardMaterial({ ...bundle, color: "#fff" });
 *
 * Maps bound: diffuse, normal, and the G channel of ARM as roughness.
 *
 * Intentionally NOT bound:
 * - `aoMap` — Poly Haven's diffuse already bakes contact shadows in;
 *   adding ao on top double-darkens. Also requires a uv2 attribute
 *   that PlaneGeometry / ShapeGeometry don't generate.
 * - `metalnessMap` — none of the gallery's floor surfaces (marble,
 *   stone, wood, concrete) are metallic. Binding the ARM B channel
 *   here was making the floor pick up the apartment HDRI as a cool
 *   blue reflection at grazing angles. The host material sets
 *   `metalness: 0` instead.
 *
 * `repeatU`/`repeatV` set the source texture's tile density. With
 * per-mesh world-unit UVs (see `useWorldUVPlane` in room-geometry.tsx),
 * pass `(1, 1)` and let the geometry decide how many tiles fit — that
 * way a 4 m room and a 24 m room both show consistent 1 m² tiles.
 *
 * Note: the returned textures are SHARED across every call with the
 * same slug. Mutating `.repeat` etc. on the returned texture mutates
 * it for every other surface using the same Poly Haven set too. With
 * the current single-callsite-per-slug pattern this is fine; if a
 * future caller needs a different repeat per binding, switch back to
 * cloning (and accept the needsUpdate sync complexity that comes with
 * it — the renderer treats clones as separate textures).
 */
export function buildMapBundle(
  slug: string,
  repeatU: number,
  repeatV: number,
): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
} {
  const diff = loadSource(slug, "diff");
  const nor = loadSource(slug, "nor_gl");
  const arm = loadSource(slug, "arm");
  diff.repeat.set(repeatU, repeatV);
  nor.repeat.set(repeatU, repeatV);
  arm.repeat.set(repeatU, repeatV);
  return { map: diff, normalMap: nor, roughnessMap: arm };
}

/** Mark every cached Poly Haven source texture for re-upload after a
 *  `webglcontextrestored` event. The HTMLImageElements held by each
 *  Texture's `.image` are alive in the browser's image cache, so the
 *  next frame uploads them again without a network round-trip — just
 *  one decode + texImage2D per surface, identical to a cold load. */
export function markPackTexturesForReupload(): void {
  for (const tex of sourceCache.values()) {
    tex.needsUpdate = true;
  }
}
