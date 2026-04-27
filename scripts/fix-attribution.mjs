#!/usr/bin/env node
// One-shot fixes for entries in metadata/collection-of-beauty.json where the
// Wikimedia "Artist" field was the photographer/uploader (Sailko, Didier
// Descouens, Daderot, Rijksmuseum, etc.) rather than the actual painter.
//
// For each fix we may override `title`, `artist`, `year`, `date_created` and
// flip `year_source`. The original Wikimedia source link is left intact so
// the Commons URL still works.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "metadata", "collection-of-beauty.json");

// `null` in a field means: leave whatever was there. To explicitly clear a
// field, use the special token "@CLEAR".
const CLEAR = "@CLEAR";

const fixes = {
  // --- Sailko (Wikimedia photographer Francesco Bini) ---
  "Peter_paul_rubens,_susanna_e_i_vecchioni,_1605-07_(cropped).jpg": {
    title: "Susanna and the Elders",
    artist: "Peter Paul Rubens",
    year: 1606,
    date_created: "circa 1605–1607",
    year_source: "wiki",
  },
  "Katsushika_Hokusai,_tempesta_sotto_la_vetta,_dalla_serie_delle_36_vedute_del_monte_fuji,_1831_ca.jpg":
    {
      title: "Storm Below the Summit (Sanka Hakuu), from Thirty-six Views of Mount Fuji",
      artist: "Katsushika Hokusai",
      year: 1831,
      date_created: "circa 1831",
      year_source: "wiki",
    },
  "Ohara_koson,_gatto_e_vasca_con_pesci_rossi,_1933,_xilografia_colorata.jpg": {
    title: "Cat and Goldfish Bowl",
    artist: "Ohara Koson",
    year: 1933,
    date_created: "1933",
    year_source: "wiki",
  },

  // --- Didier Descouens (Wikimedia photographer) ---
  "(Barcelona)_Apullia_in_Search_of_Appullus_1814_-_William_Turner_-_Tate_Britain.jpg": {
    title: "Apullia in Search of Appullus",
    artist: "J. M. W. Turner",
    year: 1814,
    date_created: "1814",
    year_source: "wiki",
  },
  "(Barcelona)_Lake_Lucerne_;_the_Bay_of_Uri_from_above_Brunnen_-_William_Turner_-_Tate_Britain.jpg":
    {
      title: "Lake Lucerne: the Bay of Uri from above Brunnen",
      artist: "J. M. W. Turner",
      year: 1842,
      date_created: "circa 1841–1842",
      year_source: "wiki",
    },
  "(Barcelona)_Shipping_-_1825-30_-_William_Turner_in_Tate_Britain.jpg": {
    title: "Shipping",
    artist: "J. M. W. Turner",
    year: 1825,
    date_created: "circa 1825–1830",
    year_source: "wiki",
  },
  "(Barcelona)_Story_of_Apollo_and_Daphne_1837_-_William_Turner_-_Tate_Britain.jpg": {
    title: "The Story of Apollo and Daphne",
    artist: "J. M. W. Turner",
    year: 1837,
    date_created: "1837",
    year_source: "wiki",
  },
  "(Barcelona)_Stromy_Sea_with_Blazing_Wreck_-_William_Turner_-_Tate_Britain.jpg": {
    title: "Stormy Sea with Blazing Wreck",
    artist: "J. M. W. Turner",
    year: 1835,
    date_created: "circa 1835–1840",
    year_source: "wiki",
  },
  "(Barcelona)_The_Lake,_Petworth,_Sunset;_Sample_Study_-_William_Turner_-_Tate_Britain.jpg": {
    title: "The Lake, Petworth: Sunset; Sample Study",
    artist: "J. M. W. Turner",
    year: 1827,
    date_created: "circa 1827–1828",
    year_source: "wiki",
  },
  "(Barcelona)_The_New_Moon;_or,_‘I’ve_lost_My_Boat,_You_shan’t_have_Your_Hoop’_-_William_Turner_-_Tate_Britain.jpg":
    {
      title: "The New Moon; or, 'I've lost My Boat, You shan't have Your Hoop'",
      artist: "J. M. W. Turner",
      year: 1840,
      date_created: "1840",
      year_source: "wiki",
    },
  "(Venice)_Aristotele_by_Francesco_Hayez_in_gallerie_Accademia_Venice.jpg": {
    title: "Aristotle",
    artist: "Francesco Hayez",
    year: 1811,
    date_created: "1811",
    year_source: "wiki",
  },
  "(Venice)_La_distruzione_del_tempio_di_Gerusalemme_-Francesco_Hayez_-_gallerie_Accademia_Venice.jpg":
    {
      title: "The Destruction of the Temple of Jerusalem",
      artist: "Francesco Hayez",
      year: 1867,
      date_created: "1867",
      year_source: "wiki",
    },
  "Augustins_-_Le_Christ_entre_les_deux_larrons_-_Rubens.jpg": {
    title: "Christ between the Two Thieves",
    artist: "Peter Paul Rubens",
    year: 1620,
    date_created: "circa 1620",
    year_source: "wiki",
  },
  "Bemberg_Fondation_Toulouse_-_Bateaux_sur_la_plage_à_Etretat_-_Claude_Monet_-_1883_65x81_Inv.2077.jpg":
    {
      title: "Boats on the Beach at Étretat",
      artist: "Claude Monet",
      year: 1883,
      date_created: "1883",
      year_source: "wiki",
    },
  "Bemberg_Fondation_Toulouse_-_Self-portrait_paintings_by_Henri_Fantin-Latour.jpg": {
    title: "Self-Portrait",
    artist: "Henri Fantin-Latour",
    year: 1858,
    date_created: "circa 1858",
    year_source: "wiki",
  },

  // --- Daderot (uploader); also a duplicate "1280px-..." entry ---
  "The_Gold_Scab_-_Eruption_in_Frilthy_Lucre_(The_Creditor)_by_James_McNeill_Whistler,_1879,_oil_on_canvas_-_De_Young_Museum_-_DSC00889.jpeg":
    {
      title: "The Gold Scab: Eruption in Frilthy Lucre (The Creditor)",
      artist: "James McNeill Whistler",
      year: 1879,
      date_created: "1879",
      year_source: "wiki",
    },
  "1280px-The_Gold_Scab_-_Eruption_in_Frilthy_Lucre_(The_Creditor)_by_James_McNeill_Whistler,_1879,_oil_on_canvas_-_De_Young_Museum_-_DSC00889.jpeg":
    {
      title: "The Gold Scab: Eruption in Frilthy Lucre (The Creditor)",
      artist: "James McNeill Whistler",
      year: 1879,
      date_created: "1879",
      year_source: "wiki",
    },

  // --- anagoria (uploader) ---
  "1815_Schinkel_Mittelalterliche_Stadt_an_einem_Fluss_anagoria.jpeg": {
    title: "Medieval City on a River",
    artist: "Karl Friedrich Schinkel",
    year: 1815,
    date_created: "1815",
    year_source: "wiki",
  },

  // --- GoldenArtists (uploader, atelier reproductions) ---
  "At_Eternity's_Gate_-_Vincent_Van_Gogh.jpg": {
    title: "At Eternity's Gate",
    artist: "Vincent van Gogh",
    year: 1890,
    date_created: "May 1890",
    year_source: "wiki",
  },
  "Christ_on_the_Cross_-_Peter_Paul_Rubens_(unframed).jpg": {
    title: "Christ on the Cross",
    artist: "Peter Paul Rubens",
    year: 1610,
    date_created: "circa 1610–1611",
    year_source: "wiki",
  },
  "Evening_landscape_at_moonrise_-_Van_Gogh.jpg": {
    title: "Evening Landscape at Moonrise",
    artist: "Vincent van Gogh",
    year: 1889,
    date_created: "July 1889",
    year_source: "wiki",
  },
  "Flowering_meadow_with_trees_and_dandelions_-_Vincent_Van_Gogh.jpg": {
    title: "Flowering Meadow with Trees and Dandelions",
    artist: "Vincent van Gogh",
    year: 1890,
    date_created: "April 1890",
    year_source: "wiki",
  },
  "The_Massacre_of_the_Innocents_-_Peter_Paul_Rubens_(Unframed).jpg": {
    title: "The Massacre of the Innocents",
    artist: "Peter Paul Rubens",
    year: 1611,
    date_created: "circa 1611–1612",
    year_source: "wiki",
  },

  // --- Wilfredor (uploader) ---
  "Crucifixion_-_Andrea_Mantegna_-_Louvre_INV_368.jpg": {
    title: "Crucifixion",
    artist: "Andrea Mantegna",
    year: 1457,
    date_created: "1457–1459",
    year_source: "wiki",
  },

  // --- Gleb Simonov / Gsimonov (uploader) ---
  "Henri_Rousseau_—_The_Hungry_Lion_Throws_Itself_on_the_Antelope.jpg": {
    title: "The Hungry Lion Throws Itself on the Antelope",
    artist: "Henri Rousseau",
    year: 1905,
    date_created: "1905",
    year_source: "wiki",
  },
  "Holbein_—_Dead_Christ.jpg": {
    title: "The Body of the Dead Christ in the Tomb",
    artist: "Hans Holbein the Younger",
    year: 1521,
    date_created: "1521–1522",
    year_source: "wiki",
  },
  "Isenheim_Altarpiece_-_Concert_of_Angels.jpg": {
    title: "Concert of Angels (Isenheim Altarpiece)",
    artist: "Matthias Grünewald",
    year: 1515,
    date_created: "circa 1512–1516",
    year_source: "wiki",
  },
  "Jacopo_Tintoretto_—_Creation_of_the_Animals.jpg": {
    title: "The Creation of the Animals",
    artist: "Tintoretto",
    year: 1551,
    date_created: "circa 1550–1553",
    year_source: "wiki",
  },
  "Tintoretto_-_Prayer_in_the_Garden.jpg": {
    title: "The Prayer in the Garden",
    artist: "Tintoretto",
    year: 1578,
    date_created: "circa 1578–1581",
    year_source: "wiki",
  },
  "Tintoretto_-_St_Mary_Magdalen.jpg": {
    title: "Saint Mary Magdalen",
    artist: "Tintoretto",
    year: 1583,
    date_created: "circa 1583–1587",
    year_source: "wiki",
  },
  "Tintoretto_-_The_Baptism_of_Christ.jpg": {
    title: "The Baptism of Christ",
    artist: "Tintoretto",
    year: 1580,
    date_created: "circa 1578–1581",
    year_source: "wiki",
  },

  // --- Rijksmuseum (institution) — real artist sits in description ---
  "Akashi_strand_Akashi_no_hama_(titel_op_object),_AK-MAK-1637.jpg": {
    title: "Akashi Beach (Akashi no Hama)",
    artist: "Tsuchiya Kōitsu",
    year: 1957,
    date_created: "after 1957",
    year_source: "wiki",
  },
  "Blauwe_irissen,_RP-P-1999-419.jpg": {
    title: "Blue Irises",
    artist: "Ohara Koson",
    year: 1915,
    date_created: "circa 1900–1930",
    year_source: "wiki",
  },
  "De_grote_lantaarn_van_de_Kannon_tempel_in_Asakusa_Asakusa_Kannondo_ochochin_(serietitel_op_object),_RP-P-1968-275.jpg":
    {
      title: "The Great Lantern of the Kannon Temple at Asakusa (Asakusa Kannondō Ōchōchin)",
      artist: "Kasamatsu Shirō",
      year: 1934,
      date_created: "1934",
      year_source: "wiki",
    },
  "De_rand_van_de_Shinobazu_vijver_tijdens_een_mistige_avond._Kasumu_yube_Shinobazu_chihan_(titel_op_object),_RP-P-1998-389.jpg":
    {
      title: "Misty Evening at Shinobazu Pond (Kasumu Yūbe Shinobazu Chihan)",
      artist: "Kasamatsu Shirō",
      year: 1932,
      date_created: "1932",
      year_source: "wiki",
    },
  "De_warme_bronnen_van_Shuzenji_Shuzenji_onsen_(titel_op_object),_RP-P-1968-277.jpg": {
    title: "The Hot Springs of Shuzenji (Shuzenji Onsen)",
    artist: "Kasamatsu Shirō",
    year: 1937,
    date_created: "1937",
    year_source: "wiki",
  },
  "Het_Suwa_meer_in_de_provincie_Shinano_Shinshu_Suwako_(titel_op_object)_36_gezichten_op_de_berg_Fuji_(serietitel)_Fugaku_sanjurokkei_(serietitel_op_object),_RP-P-1956-730.jpg":
    {
      title: "Lake Suwa in Shinano Province, from Thirty-six Views of Mount Fuji",
      artist: "Katsushika Hokusai",
      year: 1830,
      date_created: "circa 1829–1833",
      year_source: "wiki",
    },
  "Het_drijvende_paviljoen_te_Katada_in_de_sneeuw_Yuki_no_Katada_Ukimido_(titel_op_object),_AK-MAK-1636.jpg":
    {
      title: "The Floating Pavilion at Katada in Snow (Yuki no Katada Ukimidō)",
      artist: "Tsuchiya Kōitsu",
      year: 1934,
      date_created: "March 1934",
      year_source: "wiki",
    },
  "Horatius_Cocles_De_Romeinse_helden_(serietitel),_RP-P-OB-10.336.jpg": {
    title: "Horatius Cocles, from The Roman Heroes",
    artist: "Hendrik Goltzius",
    year: 1586,
    date_created: "1586",
    year_source: "wiki",
  },
  "Irissen,_RP-P-1999-553_(cropped).jpg": {
    title: "Irises",
    artist: "Ohara Koson",
    year: 1930,
    date_created: "circa 1925–1936",
    year_source: "wiki",
  },
  "Liefdespaar,_RP-P-OB-12.233.jpg": {
    title: "Lovers",
    artist: "Parmigianino",
    year: 1527,
    date_created: "circa 1527–1530",
    year_source: "wiki",
  },
  "Siberische_Blauwe_Nachtegaal_bij_een_pioenroos_onder_een_besneeuwde_schoof,_RP-P-2001-731.jpg":
    {
      title: "Siberian Blue Nightingale by a Peony beneath a Snow-laden Sheaf",
      artist: "Ohara Koson",
      year: 1930,
      date_created: "circa 1925–1936",
      year_source: "wiki",
    },
  "Twee_kaketoes_op_tak_met_pruimenbloesem,_RP-P-2005-472.jpg": {
    title: "Two Cockatoos on a Branch with Plum Blossom",
    artist: "Ohara Koson",
    year: 1930,
    date_created: "circa 1925–1936",
    year_source: "wiki",
  },

  // --- Other photographer/uploader cases ---
  "Kunisada_futamigaura.jpg": {
    title: "Futamigaura",
    artist: "Utagawa Kunisada",
    year: 1832,
    date_created: "circa 1832",
    year_source: "wiki",
  },
  "La_Fornarina_by_Raffaello.jpg": {
    title: "La Fornarina",
    artist: "Raphael",
    year: 1519,
    date_created: "circa 1519–1520",
    year_source: "wiki",
  },
  "Michelangelo_libyan.jpg": {
    title: "Studies for the Libyan Sibyl",
    artist: "Michelangelo",
    year: 1511,
    date_created: "circa 1511",
    year_source: "wiki",
  },
  "Midnight_Ride_of_Paul_Revere.jpg": {
    title: "The Midnight Ride of Paul Revere",
    artist: "Grant Wood",
    year: 1931,
    date_created: "1931",
    year_source: "wiki",
  },
  "Monet_w1032.jpg": {
    artist: "Claude Monet",
  },
  "Monet_w1048.jpg": {
    artist: "Claude Monet",
  },
  "Monet_w1061.jpg": {
    artist: "Claude Monet",
  },
  "PM_147978_B_Tournai.jpg": {
    artist: CLEAR,
    needs_review: true,
  },
  "Sir_David_Wilkie's_residence_in_Kensington_London,_by_William_Collins_1841_(painted_just_after_Wilkie's_death).jpeg":
    {
      title: "Sir David Wilkie's Residence in Kensington, London",
      artist: "William Collins",
      year: 1841,
      date_created: "1841",
      year_source: "wiki",
    },
  "Stieler_-_Auguste_Strobl_(Schönheitengalerie).jpg": {
    title: "Portrait of Auguste Strobl (Gallery of Beauties)",
    artist: "Joseph Karl Stieler",
    year: 1827,
    date_created: "1827",
    year_source: "wiki",
  },
  "The_Muezzin,_1865,_Jean-Léon_Gérôme_(French,_1824–1904).jpg": {
    title: "The Muezzin",
    artist: "Jean-Léon Gérôme",
    year: 1865,
    date_created: "1865",
    year_source: "wiki",
  },
  "Turner_-_Venice-The_Dogana_and_San_Giorgio_Maggiore.jpg": {
    title: "Venice — The Dogana and San Giorgio Maggiore",
    artist: "J. M. W. Turner",
    year: 1834,
    date_created: "1834",
    year_source: "wiki",
  },
  "WLA_moma_Monet_Reflections_of_Clouds_on_the_Water-Lily_Pond.jpg": {
    title: "Reflections of Clouds on the Water-Lily Pond",
    artist: "Claude Monet",
    year: 1920,
    date_created: "circa 1914–1926",
    year_source: "wiki",
  },
  "Élisabeth-Louise_Vigée-Le_Brun_-_Hubert_Robert_(1788).jpg": {
    title: "Portrait of Hubert Robert",
    artist: "Élisabeth Louise Vigée Le Brun",
    year: 1788,
    date_created: "1788",
    year_source: "wiki",
  },
  "Albinus_skeleton_w_less_muscles.jpg": {
    title: "Skeleton with fewer muscles (Tabulae sceleti et musculorum corporis humani, plate IV)",
    artist: "Bernhard Siegfried Albinus",
    year: 1747,
    date_created: "1747",
    year_source: "wiki",
  },
  "Albinus_skeleton_w_muscles.jpg": {
    title: "Skeleton with muscles (Tabulae sceleti et musculorum corporis humani, plate V)",
    artist: "Bernhard Siegfried Albinus",
    year: 1747,
    date_created: "1747",
    year_source: "wiki",
  },

  // --- "Unknown author / artist / photographer" entries that are not
  //     actually unknown — the artist sits in the filename or title. ---
  "Ave_Caesar_Morituri_te_Salutant_(Gérôme)_01.jpg": {
    artist: "Jean-Léon Gérôme",
  },
  "Claude_Monet_-_Cliff_Walk_at_Pourville_-_Google_Art_Project.jpg": {
    artist: "Claude Monet",
  },
  "Elisabeth_Vigée-Lebrun_-_Self-Portrait_with_Her_Daughter,_Julie_-_WGA25082.jpg": {
    artist: "Élisabeth Louise Vigée Le Brun",
  },
  "Francesco_Hayez_-_Self_Portrait_in_a_Group_of_Friend_-_Google_Art_Project.jpg": {
    artist: "Francesco Hayez",
  },
  "Francisco_de_Zurbarán_006.jpg": {
    artist: "Francisco de Zurbarán",
  },
  "Paolo_Veronese_008.jpg": {
    artist: "Paolo Veronese",
  },

  // --- More uploader/institutional artist values ---
  "Claude_Monet_-_Sailing_Boat,_Evening_Effect.jpg": {
    artist: "Claude Monet",
  },
  "FRANCESCO_HAYEZ_-_Incontro_di_Giobbe_ed_Esaù_(1844).jpg": {
    title: "Meeting of Job and Esau",
    artist: "Francesco Hayez",
    year: 1844,
    date_created: "1844",
    year_source: "wiki",
  },
  "Jupiter_and_Juno_Annibale_Carracci_fragment.jpg": {
    title: "Jupiter and Juno (fragment)",
    artist: "Annibale Carracci",
    year: 1602,
    date_created: "circa 1597–1602",
    year_source: "wiki",
  },
  "London_National_Gallery_Turner_Hero_and_Leander.jpg": {
    title: "The Parting of Hero and Leander",
    artist: "J. M. W. Turner",
    year: 1837,
    date_created: "before 1837",
    year_source: "wiki",
  },
  "Painting_of_Susanna_and_the_Elders_by_Rubens.jpg": {
    title: "Susanna and the Elders",
    artist: "Peter Paul Rubens",
    year: 1638,
    date_created: "circa 1636–1639",
    year_source: "wiki",
  },
  "The_Barber_Institute_of_Fine_Arts_-_Joseph_Mallord_William_Turner_-_The_Sun_Rising_through_Vapour.jpg":
    {
      title: "The Sun Rising through Vapour",
      artist: "J. M. W. Turner",
      year: 1809,
      date_created: "circa 1809",
      year_source: "wiki",
    },
  "The_Devil's_Bridge,_St_Gotthard_Pass.jpg": {
    title: "The Devil's Bridge, St Gotthard Pass",
    artist: "J. M. W. Turner",
    year: 1804,
    date_created: "circa 1803–1804",
    year_source: "wiki",
  },
  "Elisabeth_Louise_Vigee_Le_Brun_-_Countess_Anna_Ivanovna_Tolstaya.jpg": {
    artist: "Élisabeth Louise Vigée Le Brun",
  },
  "Édouard_Manet_by_Henri_Fantin-Latour_(Chicago_Art_Institute_1905.207).jpg": {
    title: "Portrait of Édouard Manet",
    artist: "Henri Fantin-Latour",
    year: 1867,
    date_created: "1867",
    year_source: "wiki",
  },
};

const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
// Build a Unicode-normalized index so the corrections map can use either NFC
// (precomposed "é") or NFD (e + combining acute) keys; macOS fs and Wikimedia
// disagree, and our metadata file mixes both.
const nfcIndex = new Map();
for (const key of Object.keys(raw.entries)) {
  nfcIndex.set(key.normalize("NFC"), key);
}
let applied = 0;
let missing = 0;
for (const [filename, fix] of Object.entries(fixes)) {
  let actualKey = filename;
  let entry = raw.entries[actualKey];
  if (!entry) {
    actualKey = nfcIndex.get(filename.normalize("NFC"));
    if (actualKey) entry = raw.entries[actualKey];
  }
  if (!entry) {
    console.warn("missing entry:", filename);
    missing++;
    continue;
  }
  for (const [key, value] of Object.entries(fix)) {
    if (value === CLEAR) {
      entry[key] = null;
    } else {
      entry[key] = value;
    }
  }
  applied++;
}

fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + "\n");
console.log(`applied ${applied} fixes${missing ? ` (${missing} missing)` : ""}`);
