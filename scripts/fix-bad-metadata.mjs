#!/usr/bin/env node
/**
 * One-shot metadata patcher for records with broken artist/title/description
 * fields surfaced by the 2026-06 metadata audit.
 *
 * Touches three files:
 *   metadata/collection-of-beauty.json   — artist field rewrites
 *   metadata/title-overrides.json        — English/clean titles keyed by objectKey
 *   metadata/curator-descriptions.json   — English curated descriptions keyed by id
 *
 * Run once, commit the resulting JSON diffs. Re-running is idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIDECAR = path.join(ROOT, "metadata", "collection-of-beauty.json");
const TITLES = path.join(ROOT, "metadata", "title-overrides.json");
const DESCS = path.join(ROOT, "metadata", "curator-descriptions.json");

// ---- artist rewrites in sidecar (filename → new artist) -------------------
const artistRewrites = {
  // Rijksmuseum prints — artist field currently says "Rijksmuseum"
  "Akashi_strand_Akashi_no_hama_(titel_op_object),_AK-MAK-1637.jpg": "Tsuchiya Kōitsu",
  "Blauwe_irissen,_RP-P-1999-419.jpg": "Ohara Koson",
  "De_grote_lantaarn_van_de_Kannon_tempel_in_Asakusa_Asakusa_Kannondo_ochochin_(serietitel_op_object),_RP-P-1968-275.jpg":
    "Kasamatsu Shirō",
  "De_rand_van_de_Shinobazu_vijver_tijdens_een_mistige_avond._Kasumu_yube_Shinobazu_chihan_(titel_op_object),_RP-P-1998-389.jpg":
    "Kasamatsu Shirō",
  "De_warme_bronnen_van_Shuzenji_Shuzenji_onsen_(titel_op_object),_RP-P-1968-277.jpg": "Kasamatsu Shirō",
  "Het_Suwa_meer_in_de_provincie_Shinano_Shinshu_Suwako_(titel_op_object)_36_gezichten_op_de_berg_Fuji_(serietitel)_Fugaku_sanjurokkei_(serietitel_op_object),_RP-P-1956-730.jpg":
    "Katsushika Hokusai",
  "Het_drijvende_paviljoen_te_Katada_in_de_sneeuw_Yuki_no_Katada_Ukimido_(titel_op_object),_AK-MAK-1636.jpg":
    "Tsuchiya Kōitsu",
  "Horatius_Cocles_De_Romeinse_helden_(serietitel),_RP-P-OB-10.336.jpg": "Hendrick Goltzius",
  "Irissen,_RP-P-1999-553_(cropped).jpg": "Ohara Koson",
  "Liefdespaar,_RP-P-OB-12.233.jpg": "Parmigianino",
  "Siberische_Blauwe_Nachtegaal_bij_een_pioenroos_onder_een_besneeuwde_schoof,_RP-P-2001-731.jpg": "Ohara Koson",
  "Twee_kaketoes_op_tak_met_pruimenbloesem,_RP-P-2005-472.jpg": "Ohara Koson",

  // Other records with junk in the artist field
  "WLA_moma_Monet_Reflections_of_Clouds_on_the_Water-Lily_Pond.jpg": "Claude Monet",
  "Quinten_Metsys_-_Head_of_an_Old_Man_-_Google_Art_Project.jpg": "Quinten Metsys",
  "Kunisada_futamigaura.jpg": "Utagawa Kunisada",
  "Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg": "Ivan Aivazovsky",
  "At_Eternity's_Gate_-_Vincent_Van_Gogh.jpg": "Vincent van Gogh",
  "Christ_on_the_Cross_-_Peter_Paul_Rubens_(unframed).jpg": "Peter Paul Rubens",
  "Evening_landscape_at_moonrise_-_Van_Gogh.jpg": "Vincent van Gogh",
  "Flowering_meadow_with_trees_and_dandelions_-_Vincent_Van_Gogh.jpg": "Vincent van Gogh",
  "London_National_Gallery_Turner_Hero_and_Leander.jpg": "J. M. W. Turner",
  "The_Massacre_of_the_Innocents_-_Peter_Paul_Rubens_(Unframed).jpg": "Peter Paul Rubens",

  // Grant Wood — sidecar grabbed the museum inventory code "TG 642" from
  // the Wikimedia metadata block instead of the actual artist.
  "Midnight_Ride_of_Paul_Revere.jpg": "Grant Wood",

  // Three Monet works whose artist field is the lowercased Flickr uploader
  // handle "flicker". The real attribution lives in the `credit` field.
  "Monet_w1032.jpg": "Claude Monet",
  "Monet_w1048.jpg": "Claude Monet",
  "Monet_w1061.jpg": "Claude Monet",

  // Records where the sidecar grabbed the Wikimedia Commons uploader handle
  // instead of the real artist. Real artist always clear from the title,
  // description, or filename. Sweep done 2026-06.
  "Giovanni_bellini,_crocifissione_in_un_cimitero_ebraico_(crocifisso_niccolini_da_camugliano),_1480-85_ca._04.jpg":
    "Giovanni Bellini",
  "John_singleton_copley,_testa_di_negro,_1777-78_ca_(cropped).jpg": "John Singleton Copley",
  "Albinus_skeleton_w_less_muscles.jpg": "Jan Wandelaar",
  "Albinus_skeleton_w_muscles.jpg": "Jan Wandelaar",
  "Gherardo_delle_Notti-Supper_with_a_Lute_Player.jpg": "Gerrit van Honthorst",
  "Painting_of_Susanna_and_the_Elders_by_Rubens.jpg": "Peter Paul Rubens",
  "Charles_Le_Brun_La_Colère.jpg": "Charles Le Brun",
  "Portrait_de_madame_de_Verninac_by_David_Louvre_RF1942-16_n2.jpg": "Jacques-Louis David",
  "The_Barber_Institute_of_Fine_Arts_-_Joseph_Mallord_William_Turner_-_The_Sun_Rising_through_Vapour.jpg":
    "J. M. W. Turner",
  "Claude_Monet_-_Sailing_Boat,_Evening_Effect.jpg": "Claude Monet",
  "La_Fornarina_by_Raffaello.jpg": "Raphael",
  "Schinkel2.jpg": "Karl Friedrich Schinkel",
  "Élisabeth-Louise_Vigée-Le_Brun_-_Hubert_Robert_(1788).jpg": "Élisabeth Vigée Le Brun",
  "Crucifixion_-_Andrea_Mantegna_-_Louvre_INV_368.jpg": "Andrea Mantegna",
  "Musée_de_Capodimonte_-_Le_Gréco,_portrait_de_Giulio_Clovio,_en_1571-572_-01.jpg": "El Greco",
  "Francisco_de_Zurbarán_006.jpg": "Francisco de Zurbarán",
  "Francesco_Hayez_-_Self_Portrait_in_a_Group_of_Friend_-_Google_Art_Project.jpg": "Francesco Hayez",
  "Elisabeth_Vigée-Lebrun_-_Self-Portrait_with_Her_Daughter,_Julie_-_WGA25082.jpg":
    "Élisabeth Vigée Le Brun",
  "Paul_Gauguin_-_Te_aa_no_areois_-_Google_Art_Project.jpg": "Paul Gauguin",
  "Bellini_—_Madonna_and_Child_1510.jpg": "Giovanni Bellini",
  "Bellini_—_Pietà_Martinengo.jpg": "Giovanni Bellini",
  "Gentile_and_Giovanni_Bellini_—_Saint_Mark_Preaching_in_Alexandria.jpg": "Gentile Bellini",
  "Giovanni_Bellini_—_Holy_Allegory.jpg": "Giovanni Bellini",
  "Isenheim_Altarpiece_-_Concert_of_Angels.jpg": "Matthias Grünewald",
  "Isenheim_Altarpiece_-_Saints_-_Left.jpg": "Matthias Grünewald",
  "Isenheim_Altarpiece_-_Saints_-_Right.jpg": "Matthias Grünewald",
  "Jacopo_Tintoretto_—_Creation_of_the_Animals.jpg": "Jacopo Tintoretto",
  "Matthias_Grünewald_-_Resurrection.jpg": "Matthias Grünewald",
  "Tintoretto_-_Prayer_in_the_Garden.jpg": "Jacopo Tintoretto",
  "Tintoretto_-_St_Mary_Magdalen.jpg": "Jacopo Tintoretto",
  "Tintoretto_-_The_Baptism_of_Christ.jpg": "Jacopo Tintoretto",
  "Jupiter_and_Juno_Annibale_Carracci_fragment.jpg": "Annibale Carracci",
  "Young_man_in_armor,_by_Peter_Paul_Rubens,_Timken_Museum_of_Art_-_2016_-_430_(cropped).jpg":
    "Peter Paul Rubens",
  "Édouard_Manet_by_Henri_Fantin-Latour_(Chicago_Art_Institute_1905.207).jpg":
    "Henri Fantin-Latour",
  "Pieter_Bruegel_the_Elder_-_Landscape_with_the_Fall_of_Icarus_-_Brussels,_Royal_Museums_of_Fine_Arts_of_Belgium_-_Google_Arts_&_Culture.jpg":
    "Pieter Bruegel the Elder",
  "Portrait_of_Ivan_Morozov2.jpg": "Valentin Serov",
  "FRANCESCO_HAYEZ_-_Incontro_di_Giobbe_ed_Esaù_(1844).jpg": "Francesco Hayez",
  "Bellini,_Madonna_mit_Kind,_Johannes_dem_Täufer_und_der_heiligen_Elisabeth.jpg":
    "Giovanni Bellini",
};

// ---- year + description rewrites in the sidecar ---------------------------
// The Wikimedia year-extractor sometimes grabs a four-digit number from
// dimensions ("1276 cm") or biographical asides ("1786 - 1865"). Pin the
// canonical year and (where useful) replace the upstream description with
// a clean English stub the curator-description block can later refine.
const sidecarRewrites = {
  "WLA_moma_Monet_Reflections_of_Clouds_on_the_Water-Lily_Pond.jpg": {
    year: 1920,
    date_created: "c. 1920",
    description:
      "Claude Monet, Reflections of Clouds on the Water-Lily Pond, c. 1920. Oil on canvas, three panels installed as a continuous mural at the Museum of Modern Art, New York.",
  },
  "Kunisada_futamigaura.jpg": {
    year: 1832,
    date_created: "circa 1832",
    description: "Utagawa Kunisada's design of the Wedded Rocks at Futami-ga-ura, the Shinto sunrise pilgrimage site on Ise Bay.",
  },
  "London_National_Gallery_Turner_Hero_and_Leander.jpg": {
    year: 1837,
    date_created: "c. 1837",
    description:
      "J. M. W. Turner, The Parting of Hero and Leander, exhibited 1837. National Gallery, London.",
  },
  "Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg": {
    year: 1850,
    date_created: "1850",
    description: "Ivan Aivazovsky, The Ninth Wave, 1850. Oil on canvas, Russian Museum, Saint Petersburg.",
  },
  "Midnight_Ride_of_Paul_Revere.jpg": {
    description:
      "Grant Wood, Midnight Ride of Paul Revere, 1931. Oil on Masonite, Metropolitan Museum of Art, New York.",
  },

  // Records where the canonical year is well established and the filename
  // or title encodes it. date_created left undefined here will be wiped by
  // the timestamp sweep below.
  "Bellini_—_Madonna_and_Child_1510.jpg": { year: 1510, date_created: "1510" },
  "Élisabeth-Louise_Vigée-Le_Brun_-_Hubert_Robert_(1788).jpg": { year: 1788, date_created: "1788" },
  "FRANCESCO_HAYEZ_-_Incontro_di_Giobbe_ed_Esaù_(1844).jpg": { year: 1844, date_created: "1844" },
  "Musée_de_Capodimonte_-_Le_Gréco,_portrait_de_Giulio_Clovio,_en_1571-572_-01.jpg": {
    year: 1572,
    date_created: "1571–1572",
  },
  "Elisabeth_Vigée-Lebrun_-_Self-Portrait_with_Her_Daughter,_Julie_-_WGA25082.jpg": {
    year: 1789,
    date_created: "1789",
  },
  "Paul_Gauguin_-_Te_aa_no_areois_-_Google_Art_Project.jpg": { year: 1892, date_created: "1892" },
  "Édouard_Manet_by_Henri_Fantin-Latour_(Chicago_Art_Institute_1905.207).jpg": {
    year: 1867,
    date_created: "1867",
  },
  "Portrait_of_Ivan_Morozov2.jpg": { year: 1910, date_created: "1910" },
  "Pieter_Bruegel_the_Elder_-_Landscape_with_the_Fall_of_Icarus_-_Brussels,_Royal_Museums_of_Fine_Arts_of_Belgium_-_Google_Arts_&_Culture.jpg":
    { year: 1560, date_created: "c. 1560" },
  // Picabia 291 cover — the comma-split heuristic in cleanTitle chops the
  // sidecar title at the first ',', leaving the dangling '"Ici'. Rewrite
  // the sidecar title so both the raw and english fields are sensible.
  "Francis_Picabia,_Ici,_c'est_ici_Stieglitz,_foi_et_amour,_cover_of_291,_No1,_1915.jpg": {
    title: "Ici, c'est ici Stieglitz, foi et amour",
  },
  // The Monet Étretat-period works carry no usable date on Commons; the
  // sidecar previously held a 2013 Flickr upload timestamp that the year
  // extractor rightly rejected. Leave year null and replace the
  // catalog-stub description with one that names the title and series.
  "Monet_w1032.jpg": {
    description:
      "Claude Monet, Sailboats off the Aiguille Rock at Étretat (Wildenstein 1032). From Monet's series of Normandy coast paintings made on repeated visits to Étretat.",
  },
  "Monet_w1048.jpg": {
    description:
      "Claude Monet, The Cliff and the Porte d'Amont in Rough Weather (Wildenstein 1048). One of Monet's many studies of the Étretat cliffs under shifting weather.",
  },
  "Monet_w1061.jpg": {
    description:
      "Claude Monet, Panorama of Vernon (Wildenstein 1061). A view of the Seine-side town of Vernon, downstream from Monet's home at Giverny.",
  },
};

// ---- title-overrides keyed by objectKey -----------------------------------
const titleOverrides = {
  "collection-of-beauty/WLA_moma_Monet_Reflections_of_Clouds_on_the_Water-Lily_Pond.jpg":
    "Reflections of Clouds on the Water-Lily Pond",
  "collection-of-beauty/Kunisada_futamigaura.jpg": "Sunrise at Futami-ga-ura",
  "collection-of-beauty/London_National_Gallery_Turner_Hero_and_Leander.jpg":
    "The Parting of Hero and Leander",

  // Rijksmuseum prints
  "collection-of-beauty/De_rand_van_de_Shinobazu_vijver_tijdens_een_mistige_avond._Kasumu_yube_Shinobazu_chihan_(titel_op_object),_RP-P-1998-389.jpg":
    "Edge of Shinobazu Pond on a Misty Evening (Kasumu yūbe Shinobazu chihan)",
  "collection-of-beauty/De_grote_lantaarn_van_de_Kannon_tempel_in_Asakusa_Asakusa_Kannondo_ochochin_(serietitel_op_object),_RP-P-1968-275.jpg":
    "The Great Lantern of the Kannon Temple at Asakusa (Asakusa Kannondō ōchōchin)",
  "collection-of-beauty/De_warme_bronnen_van_Shuzenji_Shuzenji_onsen_(titel_op_object),_RP-P-1968-277.jpg":
    "The Hot Springs of Shuzenji (Shuzenji onsen)",
  "collection-of-beauty/Het_Suwa_meer_in_de_provincie_Shinano_Shinshu_Suwako_(titel_op_object)_36_gezichten_op_de_berg_Fuji_(serietitel)_Fugaku_sanjurokkei_(serietitel_op_object),_RP-P-1956-730.jpg":
    "Lake Suwa in Shinano Province (Shinshū Suwako), from Thirty-six Views of Mount Fuji",
  "collection-of-beauty/Het_drijvende_paviljoen_te_Katada_in_de_sneeuw_Yuki_no_Katada_Ukimido_(titel_op_object),_AK-MAK-1636.jpg":
    "The Floating Pavilion at Katada in the Snow (Yuki no Katada Ukimidō)",
  "collection-of-beauty/Horatius_Cocles_De_Romeinse_helden_(serietitel),_RP-P-OB-10.336.jpg":
    "Horatius Cocles, from The Roman Heroes",
  "collection-of-beauty/Akashi_strand_Akashi_no_hama_(titel_op_object),_AK-MAK-1637.jpg":
    "Akashi Beach (Akashi no hama)",
  "collection-of-beauty/Blauwe_irissen,_RP-P-1999-419.jpg": "Blue Irises",
  "collection-of-beauty/Irissen,_RP-P-1999-553_(cropped).jpg": "Irises",
  "collection-of-beauty/Liefdespaar,_RP-P-OB-12.233.jpg": "Lovers in a Wood",
  "collection-of-beauty/Siberische_Blauwe_Nachtegaal_bij_een_pioenroos_onder_een_besneeuwde_schoof,_RP-P-2001-731.jpg":
    "Siberian Blue Robin with Peony Beneath a Snow-Laden Sheaf",
  "collection-of-beauty/Twee_kaketoes_op_tak_met_pruimenbloesem,_RP-P-2005-472.jpg":
    "Two Cockatoos on a Plum Branch",

  // Jordaens martyrdom already has English title; description is the issue.

  // Bilingual / non-English titles
  "collection-of-beauty/The_Triumph_of_Death_by_Pieter_Bruegel_the_Elder.jpg": "The Triumph of Death",
  "collection-of-beauty/Айвазовский_И.К._Волна.jpg": "The Wave",
  "collection-of-beauty/Ivan_Aivazovsky_-_Fog_on_the_sea.jpg": "Fog at Sea",
  "collection-of-beauty/Golden_Autumn._Золотая_осень.jpg": "Golden Autumn",
  "collection-of-beauty/Bruni_-_Christ.jpg": "Head of Christ Crowned with Thorns",
  "collection-of-beauty/De_Gion_brug_te_Hondo_in_Amakusa_Amakusa_Hondo_Gionbashi_(titel_op_object)_Selectie_van_gezichten_op_Japan_(serietitel)_Nihon_fukei_senshu_(serietitel),_RP-P-1990-147.jpg":
    "Gion Bridge at Hondo in Amakusa (Amakusa Hondō Gionbashi), from Selected Views of Japan",
  "collection-of-beauty/Het_Zojo_heiligdom_in_Shiba_Shiba_Zojoji_(titel_op_object)_Twintig_gezichten_op_Tokyo_(serietitel)_Tokyo_nijukei_(serietitel_op_object),_RP-P-1979-131.jpg":
    "The Zōjō-ji Temple at Shiba (Shiba Zōjōji), from Twenty Views of Tokyo",

  // Monet works whose live title is just the Wildenstein catalogue stub.
  "collection-of-beauty/Monet_w1032.jpg": "Sailboats off the Aiguille Rock at Étretat",
  "collection-of-beauty/Monet_w1048.jpg": "The Cliff and the Porte d'Amont, Rough Sea",
  "collection-of-beauty/Monet_w1061.jpg": "Panorama of Vernon",

  // Records whose live title is the artist's name, a filename slug, or a
  // catalogue stub — replace with the canonical work title.
  "collection-of-beauty/Giovanni_bellini,_crocifissione_in_un_cimitero_ebraico_(crocifisso_niccolini_da_camugliano),_1480-85_ca._04.jpg":
    "Crucifixion in a Jewish Cemetery (Crocifisso Niccolini da Camugliano)",
  "collection-of-beauty/John_singleton_copley,_testa_di_negro,_1777-78_ca_(cropped).jpg":
    "Head of a Black Man",
  "collection-of-beauty/Albinus_skeleton_w_less_muscles.jpg":
    "Skeletal Figure with Superficial Muscles (Tabula II, after Albinus)",
  "collection-of-beauty/Albinus_skeleton_w_muscles.jpg":
    "Skeletal Figure with Muscles (Tabula IV, after Albinus)",
  "collection-of-beauty/Charles_Le_Brun_La_Colère.jpg":
    "Anger, from the Méthode pour apprendre à dessiner les passions",
  "collection-of-beauty/La_Fornarina_by_Raffaello.jpg": "La Fornarina",
  "collection-of-beauty/Schinkel2.jpg": "Project for Orianda Palace, Crimea — Garden Terrace",
  "collection-of-beauty/Bellini_—_Madonna_and_Child_1510.jpg": "Madonna and Child",
  "collection-of-beauty/Bellini_—_Pietà_Martinengo.jpg": "Pietà Martinengo",
  "collection-of-beauty/Gentile_and_Giovanni_Bellini_—_Saint_Mark_Preaching_in_Alexandria.jpg":
    "Saint Mark Preaching in Alexandria",
  "collection-of-beauty/Giovanni_Bellini_—_Holy_Allegory.jpg": "Sacred Allegory",
  "collection-of-beauty/Jacopo_Tintoretto_—_Creation_of_the_Animals.jpg": "The Creation of the Animals",
  "collection-of-beauty/Matthias_Grünewald_-_Resurrection.jpg":
    "The Resurrection, from the Isenheim Altarpiece",
  "collection-of-beauty/Tintoretto_-_Prayer_in_the_Garden.jpg": "The Agony in the Garden",
  "collection-of-beauty/Tintoretto_-_St_Mary_Magdalen.jpg": "Saint Mary Magdalene",
  "collection-of-beauty/Tintoretto_-_The_Baptism_of_Christ.jpg": "The Baptism of Christ",
  "collection-of-beauty/Jupiter_and_Juno_Annibale_Carracci_fragment.jpg":
    "Jupiter and Juno (fragment from the Farnese Ceiling)",
  "collection-of-beauty/Musée_de_Capodimonte_-_Le_Gréco,_portrait_de_Giulio_Clovio,_en_1571-572_-01.jpg":
    "Portrait of Giulio Clovio",
  "collection-of-beauty/Francisco_de_Zurbarán_006.jpg": "Agnus Dei",
  "collection-of-beauty/Francesco_Hayez_-_Self_Portrait_in_a_Group_of_Friend_-_Google_Art_Project.jpg":
    "Self-Portrait in a Group of Friends",
  "collection-of-beauty/Elisabeth_Vigée-Lebrun_-_Self-Portrait_with_Her_Daughter,_Julie_-_WGA25082.jpg":
    "Self-Portrait with Her Daughter Julie",
  "collection-of-beauty/Paul_Gauguin_-_Te_aa_no_areois_-_Google_Art_Project.jpg": "Te aa no areois (The Seed of the Areoi)",
  "collection-of-beauty/Portrait_of_Ivan_Morozov2.jpg": "Portrait of Ivan Morozov",
  "collection-of-beauty/FRANCESCO_HAYEZ_-_Incontro_di_Giobbe_ed_Esaù_(1844).jpg":
    "The Meeting of Jacob and Esau",
  "collection-of-beauty/Painting_of_Susanna_and_the_Elders_by_Rubens.jpg": "Susanna and the Elders",
  "collection-of-beauty/Élisabeth-Louise_Vigée-Le_Brun_-_Hubert_Robert_(1788).jpg":
    "Portrait of Hubert Robert",
  "collection-of-beauty/Crucifixion_-_Andrea_Mantegna_-_Louvre_INV_368.jpg":
    "The Crucifixion (predella of the San Zeno Altarpiece)",
  "collection-of-beauty/Gherardo_delle_Notti-Supper_with_a_Lute_Player.jpg":
    "Supper Party with a Lute Player",

  // Titles polluted by raw Wikidata QS markup — fragments of alternative
  // titles, stray quotation marks, foreign-language labels ("Hungarian: …").
  // Replace with the canonical English title.
  "collection-of-beauty/The_Knife_Grinder_Principle_of_Glittering_by_Kazimir_Malevich.jpeg":
    "The Knife Grinder, or Principle of Glittering",
  "collection-of-beauty/Peter_Paul_Rubens_072.jpg": "Landscape with the Tower of Het Steen",
  "collection-of-beauty/SA_8422-De_Kloveniersdoelen_aan_de_Amstel-De_Kloveniersburgwal_op_de_hoek_van_de_Amstel_met_de_toren__Swijgh_Utrecht_.jpg":
    "The Kloveniersdoelen on the Amstel, with the Tower 'Swijgh Utrecht'",
  "collection-of-beauty/_Scorn__from_Le_Brun,_Wellcome_L0012155.jpg":
    "Scorn, from Le Brun's Conférence sur l'expression",
  "collection-of-beauty/_Weeping__from_Le_Brun,_Wellcome_L0012153.jpg":
    "Weeping, from Le Brun's Conférence sur l'expression",
  "collection-of-beauty/Paul_Gauguin,_1880,_The_Embroiderer_(La_Brodeuse),_oil_on_canvas,_116_x_81_cm,_Foundation_E.G._Bührle.jpg":
    "The Embroiderer (Mette Gauguin)",
  "collection-of-beauty/Paul_Gauguin_091.jpg": "Nevermore (O Taïti)",
  "collection-of-beauty/Aivasovsky_I_C_Ship__Twelve_Apostles_.jpg": "The Ship 'Twelve Apostles'",
  "collection-of-beauty/Albert_Gleizes,_1915,_Composition_pour_Jazz,_oil_on_cardboard,_73_x_73_cm,_Solomon_R._Guggenheim_Museum,_New_York.jpg":
    "Composition for Jazz",
  "collection-of-beauty/Leighton-Alain_Chartier-1903.jpg":
    "Alain Chartier (Margaret of Scotland Kissing the Sleeping Poet)",
  "collection-of-beauty/Francis_Picabia,_Ici,_c'est_ici_Stieglitz,_foi_et_amour,_cover_of_291,_No1,_1915.jpg":
    "Ici, c'est ici Stieglitz, foi et amour (cover of 291, No. 1)",
};

// ---- curator-descriptions keyed by artwork id -----------------------------
// IDs derive from `slugify(${folderKey}-${filenameWithoutExt})` capped at 120
// chars in build-data.mjs. The keys below mirror the live src/data/artworks.json.
const descriptions = {
  "collection-of-beauty-wla-moma-monet-reflections-of-clouds-on-the-water-lily-pond":
    "Monet's mural-scale Water-Lily triptych at the Museum of Modern Art carries the open-air pond at Giverny across forty feet of canvas. Painted in his last decade and installed as a continuous horizon, it dissolves figure and reflection into a slow shift of greens, lilac, and white.",
  "collection-of-beauty-kunisada-futamigaura":
    "Sunrise breaks over the Wedded Rocks at Futami-ga-ura on the Ise coast, their sacred shimenawa rope linking the husband and wife stones. Utagawa Kunisada was the dominant Utagawa-school designer of the late Edo period and treated the pilgrimage site many times over his long career.",
  "collection-of-beauty-london-national-gallery-turner-hero-and-leander":
    "Turner sets the doomed lovers of Hero and Leander against an apocalyptic Aegean dawn, the sea churning as Leander drowns swimming the Hellespont. Exhibited at the Royal Academy in 1837, the canvas was bought from Turner's bequest by the National Gallery and exemplifies the late Romantic intensity of his mythological seascapes.",
  "collection-of-beauty-hovhannes-aivazovsky-the-ninth-wave-google-art-project":
    "Shipwrecked sailors cling to a splintered mast as the towering ninth wave — said in Russian seafaring lore to be the most destructive of a storm — rises beneath a luminous dawn sky. Aivazovsky completed the painting in 1850 in Saint Petersburg; it has stayed at the Russian Museum since the Imperial collection and is the defining canvas of Russian Romantic marine painting.",

  // Rijksmuseum prints
  "collection-of-beauty-de-rand-van-de-shinobazu-vijver-tijdens-een-mistige-avond-kasumu-yube-shinobazu-chihan-titel-op-obj":
    "Lanterns burn in the haze of a foggy evening at Ueno Park, with figures passing beside the still water of Shinobazu Pond and a pagoda rising behind. Kasamatsu Shirō was a leading designer of the second Shin-hanga generation; this print was issued by Watanabe Shōzaburō in 1932.",
  "collection-of-beauty-de-grote-lantaarn-van-de-kannon-tempel-in-asakusa-asakusa-kannondo-ochochin-serietitel-op-object-rp":
    "Pilgrims climb the steps beneath the giant red lantern that marks the entrance to the Kannon temple at Asakusa. Kasamatsu Shirō issued the design through the Watanabe publishing house at the height of the Shin-hanga revival of traditional ukiyo-e subjects.",
  "collection-of-beauty-de-warme-bronnen-van-shuzenji-shuzenji-onsen-titel-op-object-rp-p-1968-277":
    "Lit hotels line the Katsura River at the hot-spring town of Shuzenji on the Izu peninsula, with cherry blossom in the foreground. Kasamatsu Shirō's 1937 design pairs the meticulous block-cutting of Shin-hanga with a romanticism inherited from late nineteenth-century landscape prints.",
  "collection-of-beauty-het-suwa-meer-in-de-provincie-shinano-shinshu-suwako-titel-op-object-36-gezichten-op-de-berg-fuji-s":
    "Hokusai's view across Lake Suwa, with Mount Fuji on the far horizon and a shrine and two windswept pines on a rocky outcrop in the foreground. The sheet belongs to the Thirty-six Views of Mount Fuji, printed by Nishimura Yohachi in shades of blue using imported Prussian pigment.",
  "collection-of-beauty-het-drijvende-paviljoen-te-katada-in-de-sneeuw-yuki-no-katada-ukimido-titel-op-object-ak-mak-1636":
    "A lantern-lit wooden temple stands on the snowy shore of Lake Biwa during a night snowfall. Tsuchiya Kōitsu's 1934 print exemplifies the Watanabe Shin-hanga workshop's mastery of weather and luminous nocturne.",
  "collection-of-beauty-horatius-cocles-de-romeinse-helden-serietitel-rp-p-ob-10-336":
    "The Roman hero Horatius Cocles stands sword raised on the bank of the Tiber as he singlehandedly holds off the Etruscan army behind him while the bridge is broken down. Goltzius engraved the plate in Haarlem in 1586 as the second sheet in his series of eight Roman Heroes.",
  "collection-of-beauty-akashi-strand-akashi-no-hama-titel-op-object-ak-mak-1637":
    "A solitary pine bends over the moonlit waters of Akashi Bay as sailboats drift in the distance. Tsuchiya Kōitsu designed the print for the Watanabe Shin-hanga workshop, which carried the lyric landscape tradition of Hiroshige into the twentieth century.",
  "collection-of-beauty-blauwe-irissen-rp-p-1999-419":
    "Ohara Koson's quiet study of irises pairs sharply cut leaves with delicately gradated petals. The Watanabe workshop produced the design as part of Koson's celebrated kachō-e (bird-and-flower) output, finding international markets in the early twentieth century.",
  "collection-of-beauty-irissen-rp-p-1999-553-cropped":
    "Blossoming irises rise against a softly modulated field of red, white, and blue. Ohara Koson, working with the publisher Watanabe Shōzaburō, became the foremost Shin-hanga designer of flower-and-bird prints between the wars.",
  "collection-of-beauty-liefdespaar-rp-p-ob-12-233":
    "A pair of lovers sits in a wooded grove, the nude man turning toward the woman beside him. The plate is one of the engravings published after Parmigianino's drawings, the Mannerist designs that carried his eccentric grace north into the print culture of sixteenth-century Europe.",
  "collection-of-beauty-siberische-blauwe-nachtegaal-bij-een-pioenroos-onder-een-besneeuwde-schoof-rp-p-2001-731":
    "A small green Siberian blue robin perches on a snow-dusted reed shelter above a single pink peony, the composition set against a deep black ground. Ohara Koson worked closely with the Watanabe house to produce a long sequence of bird-and-flower designs for export.",
  "collection-of-beauty-twee-kaketoes-op-tak-met-pruimenbloesem-rp-p-2005-472":
    "Two white cockatoos perch among the early flowers of a plum branch. Ohara Koson produced the design for Watanabe Shōzaburō's Shin-hanga programme, which translated the kachō-e tradition into a refined modern colour-print idiom.",

  // Jordaens martyrdom — keep correct artist, replace Dutch raw description.
  "collection-of-beauty-martelaarschap-van-h-apollonia-rp-p-ob-67-929":
    "The martyrdom of Saint Apollonia, whose teeth are being torn out while her pyre is prepared in the foreground. The print follows a composition by Jacob Jordaens and was engraved by the Antwerp printmaker Marinus Robyn van der Goes for the seventeenth-century devotional market.",

  // Stuart Hunter's Spaniels — replace raw catalog metadata with curated text.
  "collection-of-beauty-portrait-of-dr-william-hunter-s-spaniels-cropped":
    "Two white-and-brown spotted spaniels stretch beneath a Newport Chippendale mahogany tea table, the larger asleep facing left and the smaller looking out at the viewer. Painted by the young Gilbert Stuart in Newport around 1770, the canvas is among the earliest surviving works by the future portraitist of George Washington.",

  // Bruegel Triumph of Death (description currently Spanish).
  "collection-of-beauty-the-triumph-of-death-by-pieter-bruegel-the-elder":
    "Death triumphs over the world: a vast army of skeletons drives the living of every estate into a great coffin, the landscape behind reduced to ruin. Pieter Bruegel the Elder's panel of c. 1562 fuses the medieval danse macabre with the panoramic worldview that would carry into seventeenth-century Flemish painting.",

  // Aivazovsky Volna / Fog on the Sea — description currently empty in source.
  "collection-of-beauty-ayvazovskiy-i-k-volna":
    "A single dark wave rolls toward the viewer in Aivazovsky's most reductive late seascape, the painter's lifelong subject distilled to a meeting of water and sky. The Russian marine painter made the canvas in 1889 in his Crimean studio at Feodosia.",
  "collection-of-beauty-ivan-aivazovsky-fog-on-the-sea":
    "Fog lifts off the surface of the sea in one of Aivazovsky's quieter marine subjects, the picture built almost entirely from gradations of grey and luminous white. The painter worked from a Black Sea coastal studio at Feodosia for most of his long career.",

  // Levitan Golden Autumn — Russian-only description.
  "collection-of-beauty-golden-autumn-zolotaya-osen":
    "A bend in a slow river runs between banks of yellow-leaved birches under a high autumn sky. Isaac Levitan's 1895 canvas, oil on a 58 × 68 cm support and signed at the lower right, was exhibited at the Munich Secession in 1896 and became the public face of the Russian mood landscape.",

  // Bruni Head of Christ.
  "collection-of-beauty-bruni-christ":
    "Christ's head crowned with thorns is set against a darkly modelled ground in Fyodor Bruni's devotional study, painted with the careful chiaroscuro of the academic tradition. Bruni held the chair of historical painting at the Imperial Academy of Arts in St Petersburg.",

  // Kawase Hasui Dutch-titled views.
  "collection-of-beauty-de-gion-brug-te-hondo-in-amakusa-amakusa-hondo-gionbashi-titel-op-object-selectie-van-gezichten-op-":
    "Kawase Hasui's view of the Gion bridge crossing at Hondo on the Amakusa islands, from his series Selected Views of Japan. The print pairs the cool blues of an evening landscape with the softly graded skies that became his signature.",
  "collection-of-beauty-het-zojo-heiligdom-in-shiba-shiba-zojoji-titel-op-object-twintig-gezichten-op-tokyo-serietitel-toky":
    "The Zōjō-ji temple at Shiba, captured by Kawase Hasui for Twenty Views of Tokyo. Hasui became the most prolific landscape designer of the Shin-hanga revival, working closely with the publisher Watanabe Shōzaburō from the early 1920s.",

  // Grant Wood — Midnight Ride of Paul Revere.
  "collection-of-beauty-midnight-ride-of-paul-revere":
    "Grant Wood collapses the night of 18 April 1775 into a single moonlit vista, the white steeple of the Old North Church lit at upper centre as Revere gallops the country road through sleeping Lexington and Concord. Painted in 1931 on Masonite in the Iowa Regionalist's mature style, the canvas entered the collection of the Metropolitan Museum of Art in 1950.",

  // Three Monet Étretat-period works.
  "collection-of-beauty-monet-w1032":
    "Sailboats run before the wind beneath the Aiguille — the slender needle rock that rises off the cliffs of Étretat on the Normandy coast. Claude Monet returned to Étretat repeatedly through the 1880s, treating its arches, rocks, and weather in a sustained series catalogued by Daniel Wildenstein as W.1032 and its neighbours.",
  "collection-of-beauty-monet-w1048":
    "Heavy seas break against the cliff face beneath the Porte d'Amont, the northern of Étretat's three natural arches. Monet treated the Étretat coast in a long sequence of canvases through the mid-1880s, captured in Wildenstein's catalogue raisonné as W.1048 among neighbouring entries.",
  "collection-of-beauty-monet-w1061":
    "A broad view of Vernon on the Seine, the small town a short distance downstream from Monet's home at Giverny. Catalogued in Wildenstein as W.1061, the canvas belongs to the painter's quieter landscapes of the Seine valley made alongside his more famous Giverny garden series.",
};

// ---- runner ---------------------------------------------------------------
function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

const sidecar = readJson(SIDECAR);
const titles = readJson(TITLES);
const descs = readJson(DESCS);

let artistChanges = 0;
for (const [fname, artist] of Object.entries(artistRewrites)) {
  const e = sidecar.entries[fname];
  if (!e) {
    console.warn("missing sidecar entry:", fname);
    continue;
  }
  if (e.artist !== artist) {
    console.log(`artist: ${fname} :: ${e.artist} → ${artist}`);
    e.artist = artist;
    artistChanges++;
  }
}

let sidecarFieldChanges = 0;
for (const [fname, fields] of Object.entries(sidecarRewrites)) {
  const e = sidecar.entries[fname];
  if (!e) {
    console.warn("missing sidecar entry for rewrites:", fname);
    continue;
  }
  for (const [key, value] of Object.entries(fields)) {
    if (e[key] !== value) {
      console.log(`sidecar.${key}: ${fname} :: ${JSON.stringify(e[key])} → ${JSON.stringify(value)}`);
      e[key] = value;
      sidecarFieldChanges++;
    }
  }
}

// Wikimedia upload timestamps ("2013-11-05 09:38:02") sometimes survive as
// the sidecar `date_created` even though normalize-metadata set `year: null`.
// They render verbatim on the artwork detail page, producing user-visible
// "1.1.2017" / "2013-11-05 09:38:02" strings under works whose actual
// creation date is unknown. Strip them blanket so the field stays null when
// no canonical date is available; the explicit sidecarRewrites above already
// patched in the few entries where the date IS known.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}(?:[\sT]\d{2}:\d{2}(?::\d{2})?)?/;
let timestampClears = 0;
let yearOrphanClears = 0;
for (const [fname, entry] of Object.entries(sidecar.entries)) {
  if (entry.date_created && TIMESTAMP_RE.test(entry.date_created)) {
    console.log(`date_created (upload-ts): ${fname} :: ${JSON.stringify(entry.date_created)} → null`);
    entry.date_created = null;
    timestampClears++;
  }
  // Year was extracted from a now-suspect date_created. If date_created is
  // null and year_source is the plain-date extractor, the year itself was
  // derived from invalid data — clear it too. Records with an explicit year
  // override above (via sidecarRewrites) keep their year because date_created
  // is no longer null for those.
  if (
    entry.year != null &&
    entry.year_source === "date_created_plain" &&
    entry.date_created == null
  ) {
    console.log(`year (orphan, from cleared date_created): ${fname} :: ${entry.year} → null`);
    entry.year = null;
    entry.year_source = null;
    yearOrphanClears++;
  }
}

let titleChanges = 0;
for (const [k, v] of Object.entries(titleOverrides)) {
  if (titles[k] !== v) {
    titles[k] = v;
    titleChanges++;
  }
}

let descChanges = 0;
for (const [k, v] of Object.entries(descriptions)) {
  if (descs[k] !== v) {
    descs[k] = v;
    descChanges++;
  }
}

writeJson(SIDECAR, sidecar);
writeJson(TITLES, titles);
writeJson(DESCS, descs);

console.log(
  `\nfix-bad-metadata: artists=${artistChanges} sidecarFields=${sidecarFieldChanges} timestampClears=${timestampClears} yearOrphanClears=${yearOrphanClears} titles=${titleChanges} descs=${descChanges}`,
);
