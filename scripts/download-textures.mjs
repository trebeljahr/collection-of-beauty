#!/usr/bin/env node
// Download CC0 PBR texture sets from Poly Haven into public/textures/.
//
// Run once: `pnpm textures`. Idempotent — already-downloaded files skip.
//
// We use the Poly Haven /files/<slug> JSON endpoint to discover the
// canonical URLs for every map (Diffuse / nor_gl / arm / Displacement).
// This sidesteps the per-set slug / map-name spelling variations the
// catalogue has accumulated over the years (capitalised vs lowercase
// keys, jpg vs png, etc.).
//
// Output layout matches what `texture-pack.ts` reads:
//   public/textures/<slug>/<slug>_<map>_1k.jpg
//
// On a 404 for a particular map (e.g. a set without an ARM texture),
// log a warning and continue — palette-materials.ts handles missing
// maps by falling back to the material's tinted base colour.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "public", "textures");

// Each entry pairs the manifest key (Poly Haven uses both capitalised
// and lowercase keys historically) with the URL-side suffix the file
// ends up named with. The URL convention always uses lowercase short
// names: _diff_, _nor_gl_, _arm_, _disp_. We mirror those for the
// on-disk filenames so texture-pack.ts can construct paths from the
// slug + map kind alone.
const WANTED_MAPS = [
  { manifestKey: "Diffuse", suffix: "diff" }, // .map (sRGB)
  { manifestKey: "nor_gl", suffix: "nor_gl" }, // .normalMap (OpenGL normal)
  { manifestKey: "arm", suffix: "arm" }, // .aoMap + .roughnessMap + .metalnessMap (RGB packed)
  { manifestKey: "Displacement", suffix: "disp" }, // reserved for future use
];

// Curated picks. Each entry: { slug, why }. Slugs verified against
// /assets?type=textures — Poly Haven only has one true marble set
// (marble_01); marble_tiles is the closest tile-pattern variant.
const TEXTURE_SETS = [
  // ── Stone / marble (gallery floors, era surfaces) ─────────────────
  { slug: "marble_01", why: "white veined marble — Renaissance floors" },
  { slug: "marble_tiles", why: "patterned marble tiles — Baroque floors" },
  // ── Stone walls (Gothic / dungeon vibe) ───────────────────────────
  { slug: "medieval_blocks_02", why: "Gothic stone block walls" },
  { slug: "plastered_stone_wall", why: "Renaissance plastered stone walls" },
  // ── Plaster / paint (Enlightenment, Modern) ───────────────────────
  { slug: "painted_plaster_wall", why: "clean gallery walls" },
  { slug: "beige_wall_001", why: "warm gallery walls (Romantic)" },
  // ── Wood floors (Enlightenment, Romantic, Fin-de-siècle) ──────────
  { slug: "wood_floor_deck", why: "parquet floor" },
  { slug: "worn_planks", why: "aged plank floor" },
  // ── Concrete (Modern era) ─────────────────────────────────────────
  { slug: "concrete_floor_painted", why: "Modern era polished floor" },
];

const PH_FILES = (slug) => `https://api.polyhaven.com/files/${slug}`;

/** Fetch the manifest for a slug. Returns null on 404 / malformed. */
async function fetchManifest(slug) {
  try {
    const res = await fetch(PH_FILES(slug));
    if (!res.ok) {
      console.warn(`  ⚠ ${slug}: manifest ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`  ⚠ ${slug}: ${e.message}`);
    return null;
  }
}

/** Pull `{ url, md5? }` for a map at 1k jpg out of the manifest. The
 *  manifest shape is `{ <map>: { 1k: { jpg: { url, md5, size } } } }`
 *  but in practice some sets have png-only or different resolutions —
 *  walk the tree, return the first 1k jpg found. */
function findMap(manifest, mapKind) {
  const node = manifest?.[mapKind];
  if (!node) return null;
  const oneK = node["1k"];
  if (!oneK) return null;
  return oneK.jpg ?? oneK.png ?? null;
}

async function downloadOne(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

async function processSet({ slug, why }) {
  console.log(`\n▶ ${slug}  — ${why}`);
  const manifest = await fetchManifest(slug);
  if (!manifest) return { slug, ok: 0, skipped: 0, missing: WANTED_MAPS.length };

  let ok = 0;
  let skipped = 0;
  let missing = 0;

  for (const { manifestKey, suffix } of WANTED_MAPS) {
    const file = findMap(manifest, manifestKey);
    if (!file?.url) {
      console.warn(`  · ${suffix}: not in manifest`);
      missing++;
      continue;
    }
    const ext = file.url.endsWith(".png") ? "png" : "jpg";
    const dest = join(ROOT, slug, `${slug}_${suffix}_1k.${ext}`);
    if (existsSync(dest)) {
      console.log(`  ✓ ${suffix}: cached`);
      skipped++;
      continue;
    }
    try {
      await downloadOne(file.url, dest);
      console.log(`  ↓ ${suffix}: ${file.url}`);
      ok++;
    } catch (e) {
      console.warn(`  ✗ ${suffix}: ${e.message}`);
      missing++;
    }
  }
  return { slug, ok, skipped, missing };
}

async function main() {
  console.log(`Poly Haven → ${ROOT}`);
  await mkdir(ROOT, { recursive: true });
  const results = [];
  for (const set of TEXTURE_SETS) {
    results.push(await processSet(set));
  }

  console.log("\nSummary:");
  for (const r of results) {
    const status = r.missing === 0 ? "✓" : r.ok + r.skipped > 0 ? "~" : "✗";
    console.log(
      `  ${status} ${r.slug.padEnd(28)} downloaded=${r.ok} cached=${r.skipped} missing=${r.missing}`,
    );
  }
  const allMissing = results.filter((r) => r.ok + r.skipped === 0);
  if (allMissing.length) {
    console.warn(
      `\n${allMissing.length} set(s) had no maps available — check the Poly Haven slug or pick a substitute.`,
    );
  }
}

await main();
