#!/usr/bin/env node
/**
 * Remove a curated set of artwork records and the on-disk files they
 * point at. Used to delete duplicate scans of the same work that the
 * dHash sweep (scripts/find-duplicate-images.mjs) surfaced.
 *
 * Targets:
 *   - assets/<folder>/<filename>                            (original)
 *   - assets-web/<folder>/<basenameWithoutExt>/             (variants)
 *   - metadata/<folder>.json    .entries[<filename>]        (Wikimedia entry)
 *   - metadata/artwork-dimensions.json [<id>]
 *   - metadata/date-originals.json     [<filename>]
 *   - metadata/curator-descriptions.json [<id>]
 *   - metadata/provenance.json         [<filename>]
 *   - metadata/title-overrides.json    [<folder>/<filename>]
 *
 * After running, rerun `pnpm build:data` to regenerate src/data/*.json.
 *
 * Usage:  ASSETS_DIR=… ASSETS_WEB_DIR=… node scripts/remove-artworks.mjs
 * (env vars optional; default to the repo's assets/ and assets-web/ dirs).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");
const ASSETS = process.env.ASSETS_DIR ? path.resolve(process.env.ASSETS_DIR) : path.join(ROOT, "assets");
const ASSETS_WEB = process.env.ASSETS_WEB_DIR ? path.resolve(process.env.ASSETS_WEB_DIR) : path.join(ROOT, "assets-web");

// Curated removal list. Each entry: keep filename → remove filename.
// All entries are duplicate scans of the same painting; the kept file is
// higher-resolution and/or has a cleaner canonical filename.
//
// This array is re-used between passes; entries already removed in a
// previous run are no-ops because rmIfExists() and the metadata checks
// short-circuit on missing files / keys.
const REMOVALS = [
  // First pass (committed in 7a0adf0) — kept for the audit trail.
  {
    folder: "collection-of-beauty",
    remove: "Pitágoras_prohíbe_comer_animales_y_habas_(Rubens_y_Snyders).jpg",
    keep: "Pythagoras_advocating_vegetarianism_(1618-20);_Peter_Paul_Rubens.jpg",
    reason: "Δ1 dHash; same Rubens panel, lower-res Spanish-titled scan",
  },
  {
    folder: "collection-of-beauty",
    remove: "Chicago_art_inst_turner_vallee_aoste.jpeg",
    keep: "Valley_of_Aosta,_Snowstorm,_Avalanche,_and_Thunderstorm,_1836-1837,_by_Joseph_Mallord_William_Turner_-_Art_Institute_of_Chicago_-_DSC09550.jpeg",
    reason: "Δ1 dHash; lower-res visitor photo of same Art Institute Turner",
  },
  {
    folder: "collection-of-beauty",
    remove: "Rubens_Venus_at_a_Mirror_c1615.jpg",
    keep: "Peter_Paul_Rubens_-_The_toilet_of_Venus.jpg",
    reason: "Δ2 dHash; lower-res variant of same Toilet of Venus",
  },
  {
    folder: "collection-of-beauty",
    remove: "Peter_paul_rubens,_susanna_e_i_vecchioni,_1605-07_(cropped).jpg",
    keep: "Painting_of_Susanna_and_the_Elders_by_Rubens.jpg",
    reason: "Δ4 dHash; cropped/lower-res copy of same Susanna and the Elders",
  },
  {
    folder: "collection-of-beauty",
    remove: "Dziewczyna_w_ramie_obrazu_1.jpg",
    keep: "Rembrandt_Girl_in_a_Picture_Frame.jpg",
    reason: "Δ5 dHash; Polish-titled scan of same Royal Castle Warsaw Rembrandt",
  },
  {
    folder: "collection-of-beauty",
    remove: "Selbstporträt,_by_Albrecht_Dürer,_from_Prado_in_Google_Earth.jpg",
    keep: "Albrecht_Dürer,_Selbstbildnis_mit_26_Jahren_(Prado,_Madrid).jpg",
    reason: "Δ7 dHash; tiny 960px Google-Earth grab of same 1498 Prado self-portrait",
  },
  {
    folder: "collection-of-beauty",
    remove: "0_Prométhée_supplicié_-_Rubens_-_Snyders_-_Philadelphia_Museum_of_Art_(W1950-3-1)_-_(1).jpeg",
    keep: "Peter_Paul_Rubens,_Flemish_(active_Italy,_Antwerp,_and_England)_-_Prometheus_Bound_-_Google_Art_Project.jpg",
    reason: "same Philadelphia Museum Prometheus Bound; Google Art Project scan is higher-res",
  },

  // Second pass — confirmed by side-by-side visual inspection.
  {
    folder: "collection-of-beauty",
    remove: "2560px-Korenveld_onder_onweerslucht_-_s0106V1962_-_Van_Gogh_Museum.jpg",
    keep: "Vincent_van_Gogh_-_Wheatfield_under_thunderclouds_-_Google_Art_Project.jpg",
    reason: "same Van Gogh Museum painting (s0106V1962); GAP scan is the canonical distribution",
  },
  {
    folder: "collection-of-beauty",
    remove: "TheStarryNightByVincentVanGogh.jpg",
    keep: "VanGogh-starry_night_ballance1.jpg",
    reason: "same MoMA Starry Night; this copy is only 1000×790 (305 KB)",
  },
  {
    folder: "collection-of-beauty",
    remove: "The_Garden_of_earthly_delights.jpg",
    keep: "El_jardín_de_las_Delicias,_de_El_Bosco.jpg",
    reason: "same Bosch triptych (Prado); Spanish-titled scan is 4× larger (5.7 MB / 2952×1574)",
  },
  {
    folder: "collection-of-beauty",
    remove: "Peter_Paul_Rubens_-_A_View_of_Het_Steen_in_the_Early_Morning.jpg",
    keep: "Peter_Paul_Rubens_-_View_of_Het_Steen_Castle_in_the_Early_Morning.jpg",
    reason: "same NG London 'Het Steen'; keeper is the museum's 21100×12384 ultra-hi-res scan",
  },
  {
    folder: "collection-of-beauty",
    remove: "1280px-Self-Portrait_(Van_Gogh_September_1889).jpg",
    keep: "Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project.jpg",
    reason: "same Musée d'Orsay 1889 self-portrait; GAP scan is sharper",
  },
  {
    folder: "collection-of-beauty",
    remove: "1280px-Irissen_-_s0050V1962_-_Van_Gogh_Museum.jpg",
    keep: "Vincent_van_Gogh_-_Irises_-_Google_Art_Project.jpg",
    reason: "same Van Gogh Museum 1890 Irises still life; GAP scan is sharper at same width",
  },
  {
    folder: "collection-of-beauty",
    remove: "Fernand_Le_Quesne_-_Les_deux_perles.jpg",
    keep: "Fernand_Le_Quesne_-_Les_deux_perles_(The_two_pearls)_(1889).png",
    reason: "same Le Quesne 1889 painting; this is a tiny 642×770 sepia repro of the colour scan",
  },
  {
    folder: "collection-of-beauty",
    remove: "Peter_Paul_Rubens_(1577-1640)_(after)_-_The_Brazen_Serpent_-_TWCMS_,_C161_-_Shipley_Art_Gallery.jpg",
    keep: "Peter_Paul_Rubens_-_The_Brazen_Serpent.jpg",
    reason: "Shipley copy 'after' Rubens of same composition; only 800×630 (77 KB) vs NG London 6000×4237 autograph",
  },
  {
    folder: "collection-of-beauty",
    remove: "Ma_Yuan_-_Dancing_and_Singing-_Peasants_Returning_from_Work_-_Detail_1.jpg",
    keep: "Ma_Yuan_-_Dancing_and_Singing-_Peasants_Returning_from_Work.jpg",
    reason: "detail crop of the same Ma Yuan hanging scroll; redundant alongside the full work",
  },
];

// Mirror scripts/build-data.mjs slugify() exactly so the ids we generate
// here line up with the ones build-data emits into src/data/artworks.json.
function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function probableId(folder, filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return slugify(`${folder}-${base}`).slice(0, 120);
}

async function rmIfExists(p, label) {
  try {
    const stat = await fs.stat(p);
    if (stat.isDirectory()) await fs.rm(p, { recursive: true, force: true });
    else await fs.unlink(p);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function loadJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function saveJson(p, data) {
  await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  // Verify keepers exist on disk before we delete anything.
  for (const r of REMOVALS) {
    const keep = path.join(ASSETS, r.folder, r.keep);
    try {
      await fs.access(keep);
    } catch {
      throw new Error(`Keeper missing on disk: ${keep}`);
    }
  }

  // Load shared metadata files once.
  const dimsPath = path.join(META, "artwork-dimensions.json");
  const datesPath = path.join(META, "date-originals.json");
  const cdescPath = path.join(META, "curator-descriptions.json");
  const provPath = path.join(META, "provenance.json");
  const overridesPath = path.join(META, "title-overrides.json");

  const dims = await loadJson(dimsPath);
  const dates = await loadJson(datesPath);
  const cdesc = await loadJson(cdescPath);
  const prov = await loadJson(provPath);
  const overrides = await loadJson(overridesPath);

  const folderCache = new Map();
  async function folderMeta(folder) {
    if (!folderCache.has(folder)) {
      const p = path.join(META, `${folder}.json`);
      folderCache.set(folder, { path: p, data: await loadJson(p) });
    }
    return folderCache.get(folder);
  }

  for (const r of REMOVALS) {
    const id = probableId(r.folder, r.remove);
    const filename = r.remove;
    const filenameKey = `${r.folder}/${filename}`;
    const basename = filename.replace(/\.[^.]+$/, "");
    const origPath = path.join(ASSETS, r.folder, filename);
    const variantDir = path.join(ASSETS_WEB, r.folder, basename);

    const removed = [];
    if (await rmIfExists(origPath)) removed.push("asset");
    if (await rmIfExists(variantDir)) removed.push("variants");

    const fm = await folderMeta(r.folder);
    // Folder metadata keys mix NFC and NFD (Wikimedia / macOS combining
    // marks). Try both forms when looking up the entry to delete.
    const entryKey = Object.hasOwn(fm.data.entries, filename)
      ? filename
      : Object.keys(fm.data.entries).find((k) => k.normalize("NFC") === filename.normalize("NFC"));
    if (entryKey) {
      delete fm.data.entries[entryKey];
      removed.push("folder-entry");
    }

    if (Object.hasOwn(dims, id)) {
      delete dims[id];
      removed.push("dimensions");
    }
    if (Object.hasOwn(dates, filename)) {
      delete dates[filename];
      removed.push("date-original");
    }
    if (Object.hasOwn(cdesc, id)) {
      delete cdesc[id];
      removed.push("curator-desc");
    }
    if (Object.hasOwn(prov, filename)) {
      delete prov[filename];
      removed.push("provenance");
    }
    if (Object.hasOwn(overrides, filenameKey)) {
      delete overrides[filenameKey];
      removed.push("title-override");
    }

    console.log(`removed ${id}`);
    console.log(`  file: ${filename}`);
    console.log(`  reason: ${r.reason}`);
    console.log(`  touched: ${removed.join(", ") || "nothing"}`);
  }

  // Refresh recomputed counters in folder metadata.
  for (const { path: p, data } of folderCache.values()) {
    data.file_count = Object.keys(data.entries).length;
    data.resolved_count = Object.values(data.entries).filter((e) => e.resolved).length;
    data.unresolved_count = data.file_count - data.resolved_count;
    await saveJson(p, data);
  }

  await saveJson(dimsPath, dims);
  await saveJson(datesPath, dates);
  await saveJson(cdescPath, cdesc);
  await saveJson(provPath, prov);
  await saveJson(overridesPath, overrides);

  console.log(`\nRemoved ${REMOVALS.length} artworks. Now run: pnpm build:data`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
