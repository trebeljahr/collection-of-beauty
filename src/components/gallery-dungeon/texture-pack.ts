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
function clonedWithRepeat(
  src: THREE.Texture,
  repeatU: number,
  repeatV: number,
): THREE.Texture {
  const c = src.clone();
  c.needsUpdate = true;
  c.repeat.set(repeatU, repeatV);
  return c;
}

/**
 * Bundle of PBR maps for a Poly Haven set, ready to spread onto a
 * MeshStandardMaterial / MeshPhysicalMaterial:
 *
 *   const bundle = buildMapBundle("marble_01", 4, 4);
 *   new THREE.MeshStandardMaterial({ ...bundle, color: "#fff" });
 *
 * The ARM texture is bound to ao/roughness/metalness simultaneously.
 * three.js reads channel R for AO, G for roughness, B for metalness —
 * the glTF convention, which matches Poly Haven's ARM packing.
 *
 * `repeatU`/`repeatV` control tile density. Walls 2.5 m × 6.2 m at
 * (2, 4) tile every ~1.25 m horiz / ~1.5 m vert. Floors vary in size;
 * (4, 4) is a sensible compromise for rooms in the 5–25 m range.
 */
export function buildMapBundle(
  slug: string,
  repeatU: number,
  repeatV: number,
): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  aoMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  metalnessMap: THREE.Texture;
} {
  const diff = loadSource(slug, "diff");
  const nor = loadSource(slug, "nor_gl");
  const arm = loadSource(slug, "arm");
  // Ao/rough/metal share the same source image — three.js samples
  // different channels but the texture object's .repeat must match.
  // Cloning each lets us set repeat without aliasing other materials
  // that use the same slug at a different tile density.
  return {
    map: clonedWithRepeat(diff, repeatU, repeatV),
    normalMap: clonedWithRepeat(nor, repeatU, repeatV),
    aoMap: clonedWithRepeat(arm, repeatU, repeatV),
    roughnessMap: clonedWithRepeat(arm, repeatU, repeatV),
    metalnessMap: clonedWithRepeat(arm, repeatU, repeatV),
  };
}
