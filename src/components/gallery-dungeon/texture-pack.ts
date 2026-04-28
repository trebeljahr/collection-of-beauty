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
// frame. Once the JPG arrives, three.js auto-flags `needsUpdate` and
// the next render uses the textured map.

import * as THREE from "three";

const loader = new THREE.TextureLoader();

/** Map kinds the downloader fetches. Mirrors WANTED_MAPS in
 *  scripts/download-textures.mjs. `disp` isn't bound to a material
 *  slot here — it's downloaded for future displacement work. */
type MapKind = "diff" | "nor_gl" | "arm";

/** Cache key: `${slug}/${map}`. Returned textures share their
 *  underlying image (so one download → one GPU upload), but cloning
 *  before binding lets each surface set its own .repeat / .offset. */
const sourceCache = new Map<string, THREE.Texture>();

/** Load (and cache) the source texture for a slug + map kind. The
 *  returned texture is the *source* — call `.clone()` on it before
 *  binding to a material that needs its own tile density. */
function loadSource(slug: string, map: MapKind): THREE.Texture {
  const key = `${slug}/${map}`;
  let tex = sourceCache.get(key);
  if (tex) return tex;
  // Mirror the layout written by scripts/download-textures.mjs.
  const url = `/textures/${slug}/${slug}_${map}_1k.jpg`;
  tex = loader.load(
    url,
    (t) => {
      // Image arrived — three.js sets needsUpdate internally on the
      // first call, but flag again so any clones referencing this
      // image refresh on the next frame too.
      t.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn(`[texture-pack] failed to load ${url}:`, err);
    },
  );
  // Diffuse is sRGB; everything else (normal, roughness, metalness,
  // ao) is linear data so it must NOT be gamma-decoded.
  tex.colorSpace = map === "diff" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  sourceCache.set(key, tex);
  return tex;
}

/** Clone a source texture and stamp it with a tile density. Cloning
 *  shares the underlying Image — only the UV transform is per-clone. */
function clonedWithRepeat(src: THREE.Texture, repeatU: number, repeatV: number): THREE.Texture {
  const c = src.clone();
  c.needsUpdate = true;
  c.repeat.set(repeatU, repeatV);
  return c;
}

/**
 * Bundle of PBR maps for a Poly Haven set, ready to spread onto a
 * MeshStandardMaterial:
 *
 *   const bundle = buildMapBundle("marble_01", 1, 1);
 *   new THREE.MeshStandardMaterial({ ...bundle, color: "#fff" });
 *
 * The ARM texture is bound to roughnessMap + metalnessMap (channels G
 * and B). AO (channel R) is intentionally NOT bound — Poly Haven's
 * diffuse already bakes contact shadows in, so adding aoMap on top
 * double-darkens the surface and reads as splotchy artefacts. AO also
 * requires a uv2 attribute on the geometry that PlaneGeometry/
 * ShapeGeometry don't generate.
 *
 * `repeatU`/`repeatV` control tile density. With per-mesh world-unit
 * UVs (see `useWorldUVPlane` in room-geometry.tsx), pass `(1, 1)` here
 * and let the geometry decide how many tiles fit — that way a 4 m
 * room and a 24 m room both show consistent 1 m² tiles.
 */
export function buildMapBundle(
  slug: string,
  repeatU: number,
  repeatV: number,
): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  metalnessMap: THREE.Texture;
} {
  const diff = loadSource(slug, "diff");
  const nor = loadSource(slug, "nor_gl");
  const arm = loadSource(slug, "arm");
  // Rough + metal share the same source image — three.js samples
  // channels G + B respectively — but the texture object's .repeat
  // must match across all bindings, so each gets its own clone.
  return {
    map: clonedWithRepeat(diff, repeatU, repeatV),
    normalMap: clonedWithRepeat(nor, repeatU, repeatV),
    roughnessMap: clonedWithRepeat(arm, repeatU, repeatV),
    metalnessMap: clonedWithRepeat(arm, repeatU, repeatV),
  };
}
