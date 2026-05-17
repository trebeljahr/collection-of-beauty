#!/usr/bin/env node
/**
 * Patch metadata/title-overrides.json with canonical English titles for
 * series and broken-title clusters surfaced by the duplicate-images sweep.
 *
 * Rationale: scripts/build-data.mjs#cleanTitle() splits on the first
 * comma or open-paren, which truncates titles like "Sailing Boats,
 * Morning" → "Sailing Boats" and "Kanae Yamamoto (1915) Cow" → "Kanae
 * Yamamoto". The englishTitle override is the surgical fix: it leaves
 * the source `title` intact and supplies a display title the UI prefers.
 *
 * Re-run safely: existing keys are overwritten with the patched value,
 * everything else in title-overrides.json is preserved.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OVERRIDES_PATH = path.join(ROOT, "metadata/title-overrides.json");

const FOLDER = "collection-of-beauty";

// New englishTitle values, keyed by filename (without folder prefix). The
// patch step rewrites the key to `${FOLDER}/${filename}` to match the
// objectKey form build-data uses for lookup.
const PATCH = {
  // Hiroshi Yoshida — "Sailing Boats" (Hansen) series, six prints; matches
  // the museum convention used by Toledo Museum of Art and the British
  // Museum ("Sailing Boats — <Time>").
  "Sailing_Boats,_Morning,_Hiroshi_Yoshida.jpg": "Sailing Boats — Morning",
  "Sailing_Boats,_Afternoon,_Hiroshi_Yoshida.jpg": "Sailing Boats — Afternoon",
  "Sailing_Boats,_Evening,_Hiroshi_Yoshida.jpg": "Sailing Boats — Evening",
  "Sailing_Boats,_Night,_Hiroshi_Yoshida.jpg": "Sailing Boats — Night",
  "Sailing_Boats,_Mist,_Hiroshi_Yoshida.jpg": "Sailing Boats — Mist",

  // Kawase Hasui — "Tōkyō jūnidai" (Twelve Subjects of Tokyo). Same
  // "Series Name: <romaji-subtitle>" pattern used for Hasui's other
  // series already in this file (Tōkyō nijū kei, Tabi miyage dai, …).
  "Tōkyō_jūnidai,_Samidare_furu_Sannō_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Samidare furu Sannō",
  "Tōkyō_jūnidai,_Daikon-gashi_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Daikon-gashi",
  "Tōkyō_jūnidai,_Fukagawa_Kaminohashi_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Fukagawa Kaminohashi",
  "Tōkyō_jūnidai,_Kiba_no_yūgure_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Kiba no yūgure",
  "Tōkyō_jūnidai,_Shinagawa_oki_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Shinagawa oki",
  "Tōkyō_jūnidai,_Toyama-no-hara_by_Kawase_Hasui.jpg":
    "Twelve Subjects of Tokyo: Toyama-no-hara",

  // Philipp Otto Runge — three preparatory drawings; the source title
  // led with the artist name so cleanTitle truncated to it.
  "Philipp_Otto_Runge,_Head_of_a_Dog_(1805-06),_chalk_&_lead.jpg":
    "Head of a Dog",
  "Philipp_Otto_Runge,_Study_for_The_Great_Morning_(1809),_chalk_&_pencil.jpg":
    "Study for The Great Morning",
  "Philipp_Otto_Runge,_Sophia_Sieveking_on_Her_Deathbed_(1810),_black_&_white_chalk.jpg":
    "Sophia Sieveking on Her Deathbed",

  // Utagawa Kuniyoshi — three loose prints; "Kuniyoshi Utagawa, <Subject>"
  // had the artist name stripped to leave the subject as title.
  "500px-Kuniyoshi_Utagawa,_Hawk.jpg": "Hawk",
  "Kuniyoshi_Utagawa,_At_the_shore_of_the_Sumida_river.jpg":
    "At the Shore of the Sumida River",
  "Kuniyoshi_Utagawa,_Pilgrims_in_the_waterfall.jpg":
    "Pilgrims in the Waterfall",

  // Utagawa Kunisada — one work whose Romaji title got stripped to the
  // artist name.
  "Utagawa_Kunisada_(1857)_Imayō_mitate_shinō_kōshō_yori_shokunin.jpg":
    "Imayō mitate shinō kōshō yori shokunin",
  "NDL-DC_1301809-Utagawa_Kunisada-うゑ野ノ暮雪-cmb.jpg":
    "Ueno no bosetsu",

  // James McNeill Whistler — two etchings whose titles were truncated
  // to the artist name.
  "James_Abbott_McNeill_Whistler,_Rotherhithe,_etching,_1860,_Dallas_Museum_of_Art.jpg":
    "Rotherhithe",
  "James_Abbott_McNeill_Whistler,_Fishing_Boat,_1879-1880,_etching_on_laid_paper.jpg":
    "Fishing Boat",

  // Kanae Yamamoto — woodblocks whose date-parenthesis truncated the
  // title to the artist name.
  "Kanae_Yamamoto_(1915)_Cow.jpg": "Cow",
  "Kanae_Yamamoto_(1926)_Tokko_Sanroku_Shūi.jpg": "Tokkō Sanroku Shūi",

  // Jean-Léon Gérôme — "The Story of Anacreon" series, four panels.
  "Jean-Léon_Gérôme,_The_Story_of_Anacreon_1--Cupid_at_the_Door_in_a_Rainstorm,_c_1899.jpg":
    "The Story of Anacreon, I: Cupid at the Door in a Rainstorm",
  "Jean-Léon_Gérôme,_The_Story_of_Anacreon_2--Young_Love's_Shivering_Limbs_the_Embers_Warm,_c_1899.jpg":
    "The Story of Anacreon, II: Young Love's Shivering Limbs the Embers Warm",
  "Jean-Léon_Gérôme,_The_Story_of_Anacreon_3--Cupid_Runs_out_the_Door,_c1899.jpg":
    "The Story of Anacreon, III: Cupid Runs Out the Door",
  "Jean-Léon_Gérôme,_The_Story_of_Anacreon_4--The_Poet_Dreams_of_Cupid_by_the_Fire,_c_1899.jpg":
    "The Story of Anacreon, IV: The Poet Dreams of Cupid by the Fire",

  // Francisco Goya — "Los desastres de la guerra"; each plate has its
  // own subtitle. Keep the Spanish subtitle (canonical museum practice).
  "Prado_-_Los_Desastres_de_la_Guerra_-_No._04_-_Las_mugeres_dan_valor.jpg":
    "The Disasters of War, Plate 4: Las mugeres dan valor",
  "Prado_-_Los_Desastres_de_la_Guerra_-_No._46_-_Esto_es_malo.jpg":
    "The Disasters of War, Plate 46: Esto es malo",
  "Prado_-_Los_Desastres_de_la_Guerra_-_No._47_-_Así_sucedió.jpg":
    "The Disasters of War, Plate 47: Así sucedió",

  // Andreas Vesalius — De humani corporis fabrica woodcut plates. Source
  // metadata only had the volume title, so use the plate number to
  // distinguish them.
  "De_humani_corporis_fabrica_(24).jpg":
    "On the Fabric of the Human Body, Plate 24",
  "De_humani_corporis_fabrica_(25).jpg":
    "On the Fabric of the Human Body, Plate 25",
  "De_humani_corporis_fabrica_(26).jpg":
    "On the Fabric of the Human Body, Plate 26",
};

async function main() {
  const raw = JSON.parse(await fs.readFile(OVERRIDES_PATH, "utf8"));
  const before = Object.keys(raw).length;
  let added = 0;
  let changed = 0;

  for (const [filename, englishTitle] of Object.entries(PATCH)) {
    const key = `${FOLDER}/${filename}`.normalize("NFC");
    const existing = raw[key];
    if (existing === englishTitle) continue;
    if (existing === undefined) added += 1;
    else changed += 1;
    raw[key] = englishTitle;
  }

  // Re-sort the file alphabetically so diffs stay readable.
  const sorted = Object.fromEntries(
    Object.entries(raw).sort(([a], [b]) => a.localeCompare(b)),
  );

  await fs.writeFile(OVERRIDES_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `Patched ${OVERRIDES_PATH}: ${added} added, ${changed} updated. Total entries: ${before} → ${Object.keys(sorted).length}.`,
  );
  console.log("Now run: pnpm assets:build-data");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
