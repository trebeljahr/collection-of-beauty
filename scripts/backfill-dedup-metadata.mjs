#!/usr/bin/env node
/**
 * Complete the "merge their info" half of the curator-confirmed dedup pass.
 *
 * The duplicate DROPS already landed on main, but the kept works were not
 * backfilled with the metadata their dropped twins carried (realDimensions,
 * provenance, clean title, englishTitle, richer description). This script
 * sources that metadata — from the live tree if the drop still exists, else
 * from git history (HISTORY_REF, where every work was still present) — and
 * merges it into each kept work. Any drop still present on disk (e.g. a
 * thumbnail copy the concurrent pass left uncommitted) is retired here.
 *
 * Idempotent: only fills fields the kept work is missing.
 *
 * After: node scripts/normalize-metadata.mjs collection-of-beauty.json
 *        pnpm assets:build-data && node scripts/find-duplicate-images.mjs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const ASSETS_WEB = path.join(ROOT, "assets-web");
const REJECTED = path.join(ASSETS, ".rejected", "dedup-merged");
const HISTORY_REF = process.argv[2] ?? "413edaa"; // commit where all dup members still existed

// keep id, keep filename, drop id, drop filename, optional clean title for keep
const PAIRS = [
  { keep: "collection-of-beauty-1280px-arcimboldo-winter-1563", keepFn: "1280px-Arcimboldo_Winter_1563.jpg", drop: "collection-of-beauty-arcimboldo-winter-1563", dropFn: "Arcimboldo_Winter_1563.jpg", title: "Allegory of Winter" },
  { keep: "collection-of-beauty-giuseppe-arcimboldo-four-seasons-in-one-head-google-art-project", keepFn: "Giuseppe_Arcimboldo_-_Four_Seasons_in_One_Head_-_Google_Art_Project.jpg", drop: "collection-of-beauty-1280px-giuseppe-arcimboldo-four-seasons-in-one-head-google-art-project", dropFn: "1280px-Giuseppe_Arcimboldo_-_Four_Seasons_in_One_Head_-_Google_Art_Project.jpg" },
  { keep: "collection-of-beauty-el-greco-domenikos-theotokopoulos-laocoon-google-art-project", keepFn: "El_Greco_(Domenikos_Theotokopoulos)_-_Laocoön_-_Google_Art_Project.jpg", drop: "collection-of-beauty-el-greco-042", dropFn: "El_Greco_042.jpg", title: "Laocoön" },
  { keep: "collection-of-beauty-scene-des-massacres-de-scio", keepFn: "Scène_des_massacres_de_Scio.jpg", drop: "collection-of-beauty-scene-des-massacres-de-scio-eugene-delacroix-musee-du-louvre-peintures-inv-3823-c3", dropFn: "Scène_des_massacres_de_Scio,_Eugène_Delacroix_-_Musée_du_Louvre_Peintures_INV_3823_;_C3.jpg" },
  { keep: "collection-of-beauty-femmes-d-alger-dans-leur-appartement-eugene-delacroix-musee-du-louvre-peintures-inv-3824", keepFn: "Femmes_d'Alger_dans_leur_appartement,_Eugène_Delacroix_-_Musée_du_Louvre_Peintures_INV_3824.jpg", drop: "collection-of-beauty-eugene-delacroix-les-femmes-d-alger-dans-leur-appartement-1834", dropFn: "Eugène_Delacroix_-_Les_Femmes_d'Alger_dans_leur_appartement,_1834.jpg" },
  { keep: "collection-of-beauty-jean-francois-millet-the-sheepfold-moonlight-google-art-project", keepFn: "Jean-François_Millet_-_The_Sheepfold,_Moonlight_-_Google_Art_Project.jpg", drop: "collection-of-beauty-jean-francois-millet-the-sheepfold-moonlight-walters-3730", dropFn: "Jean-François_Millet_-_The_Sheepfold,_Moonlight_-_Walters_3730.jpg" },
  { keep: "collection-of-beauty-manet-musica-en-las-tullerias-national-gallery-londres-1862", keepFn: "MANET_-_Música_en_las_Tullerías_(National_Gallery,_Londres,_1862).jpg", drop: "collection-of-beauty-edouard-manet-music-in-the-tuileries-1862", dropFn: "Edouard_Manet_Music_in_the_Tuileries_1862.jpg" },
  { keep: "collection-of-beauty-ilya-repin-what-freedom", keepFn: "Ilya_Repin-What_freedom!.jpg", drop: "collection-of-beauty-69149f", dropFn: "Илья_Репин_-_Какой_простор.jpg" },
  { keep: "collection-of-beauty-edgar-germain-hilaire-degas-031", keepFn: "Edgar_Germain_Hilaire_Degas_031.jpg", drop: "collection-of-beauty-2560px-edgar-germain-hilaire-degas-031", dropFn: "2560px-Edgar_Germain_Hilaire_Degas_031.jpg", englishTitle: "The Tub" },
];

const nfc = (s) => s.normalize("NFC");
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const save = (p, o) => fs.writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`);
const histJson = (rel) => JSON.parse(execSync(`git show ${HISTORY_REF}:${rel}`, { maxBuffer: 300e6 }).toString());

const COB = path.join(ROOT, "metadata/collection-of-beauty.json");
const CURATOR = path.join(ROOT, "metadata/curator-descriptions.json");
const DIMS = path.join(ROOT, "metadata/artwork-dimensions.json");
const PROV = path.join(ROOT, "metadata/provenance.json");
const TOVR = path.join(ROOT, "metadata/title-overrides.json");

const cob = load(COB);
const curator = load(CURATOR);
const dims = load(DIMS);
const prov = load(PROV);
let tovr = {};
try { tovr = load(TOVR); } catch { /* optional */ }

// history sources for dropped-work metadata
const hDims = histJson("metadata/artwork-dimensions.json");
const hProv = histJson("metadata/provenance.json");
const hTovr = (() => { try { return histJson("metadata/title-overrides.json"); } catch { return {}; } })();

const cobKeyByNFC = new Map(Object.keys(cob.entries).map((k) => [nfc(k), k]));
const provKeyByNFC = new Map(Object.keys(prov).map((k) => [nfc(k), k]));
const hProvKeyByNFC = new Map(Object.keys(hProv).map((k) => [nfc(k), k]));

const provLive = (fn) => { const k = provKeyByNFC.get(nfc(fn)); return k ? prov[k] : null; };
const provHist = (fn) => { const k = hProvKeyByNFC.get(nfc(fn)); return k ? hProv[k] : null; };

fs.mkdirSync(REJECTED, { recursive: true });

let backfilled = 0;
let dropped = 0;
for (const p of PAIRS) {
  const tags = [];

  // realDimensions (id-keyed): live drop dims, else history
  if (!dims[p.keep]) {
    const src = dims[p.drop] ?? hDims[p.drop];
    if (src) { dims[p.keep] = src; tags.push("dims"); }
  }

  // provenance (filename-keyed): live drop, else history
  if (!provLive(p.keepFn)) {
    const src = provLive(p.dropFn) ?? provHist(p.dropFn);
    if (src) { prov[p.keepFn] = src; tags.push("prov"); }
  }

  // englishTitle override (objectKey-keyed)
  const keepOK = `collection-of-beauty/${p.keepFn}`;
  if (p.englishTitle && !tovr[keepOK]) { tovr[keepOK] = p.englishTitle; tags.push("eng"); }

  // clean title in the metadata entry
  if (p.title) {
    const ck = cobKeyByNFC.get(nfc(p.keepFn));
    if (ck && cob.entries[ck] && cob.entries[ck].title !== p.title) {
      cob.entries[ck].title = p.title;
      tags.push("title");
    }
  }

  // retire any drop still present on disk / in metadata
  const dropEntryKey = cobKeyByNFC.get(nfc(p.dropFn));
  const srcPath = path.join(ASSETS, "collection-of-beauty", p.dropFn);
  if (dropEntryKey || fs.existsSync(srcPath)) {
    if (fs.existsSync(srcPath)) fs.renameSync(srcPath, path.join(REJECTED, p.dropFn));
    fs.rmSync(path.join(ASSETS_WEB, "collection-of-beauty", p.dropFn.replace(/\.[^.]+$/, "")), { recursive: true, force: true });
    if (dropEntryKey) delete cob.entries[dropEntryKey];
    delete curator[p.drop];
    delete dims[p.drop];
    const dpk = provKeyByNFC.get(nfc(p.dropFn));
    if (dpk) delete prov[dpk];
    dropped++;
    tags.push("retired-drop");
  }

  if (tags.length) { backfilled++; console.log(`${p.keep.replace("collection-of-beauty-", "")}: ${tags.join(", ")}`); }
}

cob.file_count = Object.keys(cob.entries).length;
cob.resolved_count = Object.values(cob.entries).filter((e) => e.resolved !== false).length;
cob.unresolved_count = cob.file_count - cob.resolved_count;

save(COB, cob);
save(CURATOR, Object.fromEntries(Object.entries(curator).sort(([a], [b]) => a.localeCompare(b))));
save(DIMS, dims);
save(PROV, prov);
save(TOVR, tovr);

console.log(`\nBackfilled ${backfilled}/9 keeps; retired ${dropped} lingering drop(s). cob entries: ${cob.file_count}.`);
