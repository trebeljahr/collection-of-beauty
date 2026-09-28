#!/usr/bin/env node
/**
 * Retire a curated set of artwork records. Used for duplicate scans of the
 * same work that the dHash sweep (scripts/find-duplicate-images.mjs) or a
 * review surfaced.
 *
 * Targets:
 *   - assets/<folder>/<filename>  moved to assets/.rejected/dedup-merged/.
 *     Nothing is deleted: the originals exist nowhere else. The move is
 *     still needed, because scripts/fetch-wikimedia-metadata.mjs lists the
 *     folder on disk and would give a file left there a new entry.
 *   - assets-web/<folder>/<basenameWithoutExt>/ is left in place. The
 *     catalogue no longer points at it, and deleting it would make the next
 *     `pnpm assets:sync` (rclone sync) delete the objects from R2.
 *   - metadata/<folder>.json    .entries[<filename>]        (Wikimedia entry)
 *   - metadata/artwork-dimensions.json [<id>]
 *   - metadata/date-originals.json     [<filename>]
 *   - metadata/curator-descriptions.json [<id>]
 *   - metadata/provenance.json         [<filename>]
 *   - metadata/title-overrides.json    [<folder>/<filename>]
 *
 * After running, rerun `pnpm assets:build-data` to regenerate src/data/*.json.
 *
 * Usage:  ASSETS_DIR=… node scripts/remove-artworks.mjs
 * (env var optional; defaults to the repo's assets/ dir).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artworkId } from "./lib/artwork-id.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");
const ASSETS = process.env.ASSETS_DIR
  ? path.resolve(process.env.ASSETS_DIR)
  : path.join(ROOT, "assets");
const REJECTED = path.join(ASSETS, ".rejected", "dedup-merged");

// Curated removal list. Each entry: keep filename → remove filename.
// All entries are duplicate scans of the same painting; the kept file is
// higher-resolution and/or has a cleaner canonical filename.
//
// This array is re-used between passes; entries already removed in a
// previous run are no-ops because retireOriginal() and the metadata checks
// short-circuit on missing files / keys. The first three passes predate
// the move to .rejected: they deleted their originals and variants.
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
    remove:
      "0_Prométhée_supplicié_-_Rubens_-_Snyders_-_Philadelphia_Museum_of_Art_(W1950-3-1)_-_(1).jpeg",
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
    remove:
      "Peter_Paul_Rubens_(1577-1640)_(after)_-_The_Brazen_Serpent_-_TWCMS_,_C161_-_Shipley_Art_Gallery.jpg",
    keep: "Peter_Paul_Rubens_-_The_Brazen_Serpent.jpg",
    reason:
      "Shipley copy 'after' Rubens of same composition; only 800×630 (77 KB) vs NG London 6000×4237 autograph",
  },
  {
    folder: "collection-of-beauty",
    remove: "Ma_Yuan_-_Dancing_and_Singing-_Peasants_Returning_from_Work_-_Detail_1.jpg",
    keep: "Ma_Yuan_-_Dancing_and_Singing-_Peasants_Returning_from_Work.jpg",
    reason: "detail crop of the same Ma Yuan hanging scroll; redundant alongside the full work",
  },

  // Third pass — curator-reviewed via the /dedup-review panel.
  {
    folder: "collection-of-beauty",
    remove: "Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    keep: "Starry_Night_Over_the_Rhone.jpg",
    reason:
      "same Musée d'Orsay 'Starry Night Over the Rhône'; keeping the file already correctly named for the painting",
  },
  {
    folder: "collection-of-beauty",
    remove: "Ingres_Odalisque_esclave_Fogg_Art.jpeg",
    keep: "Jean-Paul_Flandrin_-_Odalisque_with_Slave_-_Walters_37887.jpg",
    reason: "curator keeps the Walters / Flandrin-collaboration version over the Fogg variant",
  },
  {
    folder: "collection-of-beauty",
    remove: "Vincent_van_Gogh_-_Wheat_Field_with_Cypresses_(National_Gallery_version).jpg",
    keep: "Vincent_van_Gogh_-_Wheat_Field_with_Cypresses_-_Google_Art_Project.jpg",
    reason: "curator keeps the Met (June 1889) version over the NG (September 1889) one",
  },
  {
    folder: "collection-of-beauty",
    remove: "MedusaRubens.jpg",
    keep: "Rubens_Medusa.jpeg",
    reason: "curator keeps the wider-canvas version (with surrounding landscape + drapery)",
  },
  {
    folder: "collection-of-beauty",
    remove: "Rubens_-_Der_gefesselte_Prometheus,_um_1613,_Landesmuseum_Oldenburg_923340078c.jpg",
    keep: "Peter_Paul_Rubens,_Flemish_(active_Italy,_Antwerp,_and_England)_-_Prometheus_Bound_-_Google_Art_Project.jpg",
    reason:
      "two autograph versions exist (Philadelphia + Oldenburg); curator keeps Philadelphia; second version is noted in the curator description",
  },
  {
    folder: "collection-of-beauty",
    remove: "Michelangelo_Caravaggio_020.jpg",
    keep: "1596_Caravaggio,_The_Lute_Player_New_York.jpg",
    reason:
      "two autograph versions exist (Met + Hermitage); curator keeps Met; second version is noted in the curator description",
  },
  {
    folder: "collection-of-beauty",
    remove: "Kunisada_futamigaura.jpg",
    keep: "Utagawa_Kunisada_I_(c._1832)_Dawn_at_Futami-ga-ura.jpg",
    reason:
      "same Kunisada c.1832 Wedded Rocks at Futami-ga-ura; keeper is the MFA Boston scan with the title cartouche, full margins and shore figures; remove file is a tighter crop with no provenance",
  },
  // Third pass — identical-fileUrl sweep (same Commons original ingested
  // twice; the 1280px-* files are thumbnail-sized grabs of the same scan).
  {
    folder: "collection-of-beauty",
    remove:
      "1280px-Retrato_de_la_esposa_del_artista_con_sus_dos_hijos,_por_Hans_Holbein_el_Joven.jpg",
    keep: "Retrato_de_la_esposa_del_artista_con_sus_dos_hijos,_por_Hans_Holbein_el_Joven.jpg",
    reason: "identical fileUrl; keeper is the 4625px original, remove is its 1280px thumbnail",
  },
  {
    folder: "collection-of-beauty",
    remove: "1280px-Giuseppe_Arcimboldo_-_La_Primavera_-_Google_Art_Project.jpg",
    keep: "Giuseppe_Arcimboldo_-_La_Primavera_-_Google_Art_Project.jpg",
    reason:
      "identical fileUrl; keeper is the 3409px original, remove is its 1280px thumbnail (newsletter 0007 repointed to the keeper)",
  },
  {
    folder: "collection-of-beauty",
    remove: "1280px-Thomas_Gainsborough_-_Clayton_Jones_-_Google_Art_Project.jpg",
    keep: "Thomas_Gainsborough_-_Clayton_Jones_-_Google_Art_Project.jpg",
    reason: "identical fileUrl; keeper is the 4802px original, remove is its 1280px thumbnail",
  },
  {
    folder: "collection-of-beauty",
    remove: "1280px-Thomas_Gainsborough_-_The_Marsham_Children_-_Google_Art_Project.jpg",
    keep: "Thomas_Gainsborough_-_The_Marsham_Children_-_Google_Art_Project.jpg",
    reason: "identical fileUrl; keeper is the 4085px original, remove is its 1280px thumbnail",
  },
  {
    folder: "collection-of-beauty",
    remove: "Constable_osmington_bay.tif.jpg",
    keep: "Constable_osmington_bay.tif",
    reason:
      "identical fileUrl; keeper is the 6473px TIFF original, remove is a 2560px JPEG re-export of it",
  },
  {
    folder: "collection-of-beauty",
    remove: "Hokusai Views of Mount Fuji.jpg",
    keep: "2560px-The_Big_wave_from_100_views_of_the_Fuji,_2nd_volume.jpg",
    reason:
      "identical fileUrl; same Big Wave plate from One Hundred Views of Mount Fuji, keeper has the taller uncropped scan and the descriptive filename",
  },
  {
    folder: "collection-of-beauty",
    remove: "NDL-DC_2586549-03_Kawase_Hasui_S02_crd.jpg",
    keep: "Tōkyō_jūnidai,_Daikon-gashi_by_Kawase_Hasui.jpg",
    reason:
      "identical fileUrl; same Hasui Daikon-gashi print, keeper has the taller scan and the descriptive filename",
  },

  // Fourth pass — same size in the September 2026 dimension fetch
  // (metadata/real-size-fixes-2026-09.md), confirmed side by side.
  {
    folder: "collection-of-beauty",
    remove: "Fiesta_campestre.jpg",
    keep: "Le_Concert_champêtre,_by_Titian,_from_C2RMF_retouchedFXD.jpg",
    reason:
      "same Louvre Concert champêtre (136.5 × 105 cm); keeper is the 6000×4776 C2RMF scan, remove is 2814×2266 with yellowed colour and a fortunecity.es source",
  },
  {
    folder: "collection-of-beauty",
    remove: "Creación_de_Adán.jpg",
    keep: "The_Creation_of_Adam.jpg",
    reason:
      "same Sistine Chapel Creation of Adam (570 × 280 cm); keeper frames the panel and carries the Wikidata item, remove is 4256×2843 but takes in four ignudi and the painted architecture, so its aspect cannot carry the fresco's size",
  },
];

/** The name a file actually has in `dir`. Commons filenames arrive in NFC
 *  or NFD, and the REMOVALS list above is typed in NFC. */
async function onDiskName(dir, filename) {
  try {
    const want = filename.normalize("NFC");
    return (await fs.readdir(dir)).find((n) => n.normalize("NFC") === want) ?? null;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Move an original into assets/.rejected/dedup-merged/. Never deletes, and
 *  refuses to overwrite a file already parked there. */
async function retireOriginal(folder, filename) {
  const dir = path.join(ASSETS, folder);
  const name = await onDiskName(dir, filename);
  if (!name) return false;
  const dest = path.join(REJECTED, name);
  if (await onDiskName(REJECTED, name)) {
    throw new Error(`Already in ${REJECTED}, not overwriting: ${name}`);
  }
  await fs.mkdir(REJECTED, { recursive: true });
  await fs.rename(path.join(dir, name), dest);
  return true;
}

/** Key of `filename` in a filename-keyed sidecar, in whichever
 *  normalisation form the sidecar stored it. */
function keyOf(obj, filename) {
  if (Object.hasOwn(obj, filename)) return filename;
  const want = filename.normalize("NFC");
  return Object.keys(obj).find((k) => k.normalize("NFC") === want) ?? null;
}

async function loadJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
}

async function saveJson(p, data) {
  await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  // Verify keepers exist on disk before we retire anything.
  for (const r of REMOVALS) {
    if (!(await onDiskName(path.join(ASSETS, r.folder), r.keep))) {
      throw new Error(`Keeper missing on disk: ${path.join(ASSETS, r.folder, r.keep)}`);
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
    const id = artworkId(r.folder, r.remove);
    const filename = r.remove;
    const filenameKey = `${r.folder}/${filename}`;

    const removed = [];
    if (await retireOriginal(r.folder, filename)) removed.push("asset → .rejected/dedup-merged");

    const fm = await folderMeta(r.folder);
    // Folder metadata keys mix NFC and NFD (Wikimedia / macOS combining
    // marks), and so do the filename-keyed sidecars below.
    const entryKey = keyOf(fm.data.entries, filename);
    if (entryKey) {
      delete fm.data.entries[entryKey];
      removed.push("folder-entry");
    }

    if (Object.hasOwn(dims, id)) {
      delete dims[id];
      removed.push("dimensions");
    }
    const dateKey = keyOf(dates, filename);
    if (dateKey) {
      delete dates[dateKey];
      removed.push("date-original");
    }
    if (Object.hasOwn(cdesc, id)) {
      delete cdesc[id];
      removed.push("curator-desc");
    }
    const provKey = keyOf(prov, filename);
    if (provKey) {
      delete prov[provKey];
      removed.push("provenance");
    }
    const overrideKey = keyOf(overrides, filenameKey);
    if (overrideKey) {
      delete overrides[overrideKey];
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

  console.log(`\nProcessed ${REMOVALS.length} removals. Now run: pnpm assets:build-data`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
