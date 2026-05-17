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

  // === Second pass: disambiguation for distinct works that share a title
  // (each confirmed by side-by-side visual inspection of the variants). ===

  // Van Gogh Wheat Field with Cypresses — National Gallery (Sept 1889) +
  // Metropolitan Museum (June 1889 plein-air version).
  "Vincent_van_Gogh_-_Wheat_Field_with_Cypresses_(National_Gallery_version).jpg":
    "Wheat Field with Cypresses (National Gallery, September 1889)",
  "Vincent_van_Gogh_-_Wheat_Field_with_Cypresses_-_Google_Art_Project.jpg":
    "Wheat Field with Cypresses (Metropolitan Museum, June 1889)",

  // Van Gogh — the Google Art Project file in the "Starry Night" cluster
  // is actually *Starry Night Over the Rhône* (Musée d'Orsay, 1888), a
  // different painting from the MoMA Starry Night.
  "Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg":
    "Starry Night Over the Rhône",

  // Van Gogh Self-Portrait — pointillist 1887 Art Institute Chicago vs
  // swirling-blue 1889 Musée d'Orsay.
  "Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg":
    "Self-Portrait (Art Institute of Chicago, 1887)",
  "Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project.jpg":
    "Self-Portrait (Musée d'Orsay, 1889)",

  // Van Gogh Irises — Van Gogh Museum 1890 (yellow background, terracotta
  // vase) vs Metropolitan Museum 1890 (white vase, green table, pink
  // ground).
  "Vincent_van_Gogh_-_Irises_-_Google_Art_Project.jpg":
    "Irises (Van Gogh Museum, 1890)",
  "Vincent_van_Gogh_-_Irises_(1890).jpg":
    "Irises (Metropolitan Museum, 1890)",

  // Van Gogh Le Moulin de la Galette — three distinct 1886 windmill
  // landscapes that the source data mis-titled as "Dance at the Moulin
  // de la Galette" (which is a Renoir painting).
  "960px-Van_Gogh_-_Le_Moulin_de_la_Galette4.jpeg":
    "Le Moulin de la Galette (spring view with gardener)",
  "Van_Gogh_-_Le_Moulin_de_la_Galette.jpeg":
    "Le Moulin de la Galette (hilltop view with elevated platform)",
  "Vincent_van_Gogh_-_Le_Moulin_de_la_Galette.jpg":
    "Le Moulin de la Galette (slope view from below)",

  // Caravaggio Lute Player — Hermitage (with flowers, fruit, violin) +
  // Met / Wildenstein (with red carpet, spinet, recorder).
  "Michelangelo_Caravaggio_020.jpg":
    "The Lute Player (Hermitage)",
  "1596_Caravaggio,_The_Lute_Player_New_York.jpg":
    "The Lute Player (Metropolitan Museum)",

  // Rubens Adam and Eve — early Rubenshuis panel (c. 1599) vs Prado
  // copy-after-Titian (1628–29).
  "Rubens_Painting_Adam_Eve.jpg":
    "Adam and Eve (Rubenshuis, c. 1599)",
  "Peter_Paul_Rubens_-_Adam_and_Eve,_after_Titian,_between_1628_and_1629.jpg":
    "Adam and Eve (after Titian, 1628–29)",

  // Rubens Descent from the Cross cluster — the "(outside right)" file
  // is actually Saint Christopher on the closed wing of the Antwerp
  // triptych; the other two are distinct Descent compositions.
  "Peter_Paul_Rubens_-_Descent_from_the_Cross_(outside_right)_-_WGA20217.jpg":
    "Saint Christopher (outside right wing of the Descent from the Cross triptych)",
  "Kalisz_Rubens.jpg":
    "Descent from the Cross (Kalisz Cathedral)",
  "Descente_de_croix_rubens.jpg":
    "Descent from the Cross (Hermitage)",

  // Rubens Raising of the Cross — Met oil sketch vs the 1638 modello
  // after the Antwerp Cathedral triptych.
  "Peter_Paul_Rubens_-_The_Elevation_of_the_Cross.jpeg":
    "The Raising of the Cross (oil sketch, Metropolitan Museum)",
  "Peter_Paul_Rubens_-_The_Raising_of_the_Cross_(1638).jpeg":
    "The Raising of the Cross (modello after the Antwerp triptych, 1638)",

  // Rubens Madonna and Child — Lady Margaret Hall copy with Saint Anne
  // (three figures) vs the 1627 Madonna-and-Child-with-Flowers
  // collaboration with Jan Brueghel the Elder.
  "Peter_Paul_Rubens_(1577-1640)_(copy_after)_-_Madonna_and_Child_-_PCF48_-_Lady_Margaret_Hall.jpg":
    "Madonna and Child with Saint Anne (after Rubens, Lady Margaret Hall)",
  "1627_Rubens_Maria_mit_dem_Kind_anagoria.jpeg":
    "Madonna and Child with Flowers (with Jan Brueghel the Elder, c. 1620)",

  // Rubens Massacre of the Innocents — two surviving autograph works.
  "Rubens,_Peter_Paul_-_Massacre_of_the_Innocents_-_Art_Gallery_of_Ontario.jpg":
    "The Massacre of the Innocents (Art Gallery of Ontario, c. 1611)",
  "The_Massacre_of_the_Innocents_-_Peter_Paul_Rubens_(Unframed).jpg":
    "The Massacre of the Innocents (Alte Pinakothek, c. 1638)",

  // Rubens Judgement of Paris — two Prado versions, c. 1606 and c. 1638.
  "Peter_Paul_Rubens_-_The_Judgement_of_Paris,_c.1606_(Museo_del_Prado).jpg":
    "The Judgement of Paris (early version, c. 1606)",
  "Peter_Paul_Rubens_115.jpg":
    "The Judgement of Paris (late version, c. 1638)",

  // Rubens Landscape with Rainbow — Hermitage shepherds version vs the
  // Wallace Collection cattle-and-rainbow version.
  "Rubens-Landscape.with.Rainbow1632-1635.jpg":
    "Landscape with a Rainbow (Hermitage, c. 1632–35)",
  "Peter_Paul_Rubens_-_Landscape_with_a_Rainbow_-_WGA20411.jpg":
    "Landscape with Cattle and a Rainbow (Wallace Collection)",

  // Gentileschi — two Madonnas; the 1609–10 panel at Galleria Spada is
  // the better-known of the pair.
  "Artemisia_Gentileschi_-_Madonna_con_Bambino_(1609-1610).jpg":
    "Madonna and Child (Galleria Spada, c. 1610)",

  // Gentileschi Susanna and the Elders — Pommersfelden 1610 (her earliest
  // signed work) vs a later autograph version.
  "Susanna_and_the_Elders_(1610),_Artemisia_Gentileschi.jpg":
    "Susanna and the Elders (Pommersfelden, 1610)",
  "Susanna_and_the_Elders.jpg":
    "Susanna and the Elders (later autograph version)",

  // Ingres Odalisque with Slave — Fogg Art Museum (1839, by Ingres) vs
  // Walters (1842, composition by Ingres with landscape by Flandrin).
  "Ingres_Odalisque_esclave_Fogg_Art.jpeg":
    "Odalisque with Slave (Fogg Art Museum, 1839)",
  "Jean-Paul_Flandrin_-_Odalisque_with_Slave_-_Walters_37887.jpg":
    "Odalisque with Slave (Walters Art Museum, 1842; landscape by Jean-Paul Flandrin)",

  // Dürer Adam and Eve — 1504 copper engraving vs the 1507 Prado oil
  // diptych.
  "Albrecht_Dürer,_Adam_and_Eve,_1504,_Engraving.jpg":
    "Adam and Eve (engraving, 1504)",
  "Albrecht_Dürer_-_Adam_and_Eve_(Prado)_2.jpg":
    "Adam and Eve (Prado oil diptych, 1507)",

  // Cranach the Elder — 1509 woodcut vs 1531 panel painting.
  "AdamEveParadiseCranach.jpg":
    "Adam and Eve in Paradise (woodcut, 1509)",
  "Lucas_Cranach_the_Elder_-_Adam_und_Eva_im_Paradies_(Sündenfall)_-_Google_Art_Project.jpg":
    "Adam and Eve in Paradise (Gemäldegalerie Berlin, 1531)",

  // Gérôme — Met Bashi-Bazouk (green coat, front-on) vs the c. 1869
  // "Black Bashi-Bazouk" (pink coat, three-quarter back view).
  "Jean-Léon_Gérôme_-_Bashi-Bazouk_-_2014.435.1_-_Metropolitan_Museum_of_Art.jpg":
    "Bashi-Bazouk (Metropolitan Museum)",
  "1280px-Gérôme-Black_Bashi-Bazouk-c._1869.jpg":
    "Black Bashi-Bazouk (c. 1869)",

  // Seurat — conté drawing study vs the National Gallery oil painting
  // it informed.
  "Georges_Seurat,_Seated_Nude,_Study_for_Une_Baignade,_1883,_Scottish_National_Gallery.jpg":
    "Seated Nude (study for Bathers at Asnières, 1883)",
  "Baigneurs_a_Asnieres.jpg":
    "Bathers at Asnières",

  // Vereshchagin — two "Afghan" portraits with very different costume +
  // pose.
  "Афганец.jpg":
    "The Afghan (white tunic, green turban)",
  "Афганец_(2).jpg":
    "The Afghan (chain mail, striped skirt)",

  // Vereshchagin — two Alatau-mountains scenes.
  "В_горах_Алатау.jpg":
    "In the Alatau Mountains (deer in meadow)",
  "В_горах_Алатау_2.jpg":
    "In the Alatau Mountains (horsemen on slope)",
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
