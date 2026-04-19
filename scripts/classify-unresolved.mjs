#!/usr/bin/env node
// For entries in metadata/<folder>.json that are still resolved=false after
// Wikimedia passes, apply filename-based heuristics to guess the source and
// copyright status. Writes the enriched index back in place.
//
// Heuristics come from metadata/non_wikimedia_sources.json and from hand
// analysis of common prefixes/artist names.
//
// Usage: node scripts/classify-unresolved.mjs "Collection of Beauty"

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// Ordered rules — first match wins. Each rule reports a classification and a
// best-guess copyright status; the user can still override.
const rules = [
  {
    name: "christies_hgk_2013_auction",
    test: (f) => /^2013_HGK_/.test(f),
    apply: () => ({
      guessed_source: "Christie's auction lot image (Hong Kong 2013, sale 3211 — 'Fine Chinese Modern Paintings')",
      guessed_artists: "20th-century Chinese painters (Huang Binhong, Zhang Daqian, Ya Ming, Song Wenzhi, Wu Changshuo, Pu Ru, etc.) — lot description embedded in filename",
      copyright: {
        copyrighted: true,
        license: "Underlying works mostly still under copyright (artists died after 1930); auction-house photography carries its own rights.",
        notes: "Treat as copyrighted. See https://www.christies.com/en/auction/fine-chinese-modern-paintings-24302/",
      },
      needs_review: false,
    }),
  },
  {
    name: "escher",
    test: (f) => /escher|Escher|metamorphose|Metamorphosis|Belvedere|Relativity|Waterfall\.|Drawing_Hands|Hand_with_Reflecting|Three_Spheres|Day_and_Night|Sky_and_Water|Reptiles|Castrovalva|Bonifacio|Bond_of_Union|Fish[_ ]in[_ ]Baarn|Still_Life_and_Street|House_of_Stairs|Other_World|Snakes\.|Ascending_and_Descending|Convex_and_Concave|M%C3%B6bius|Mobius/i.test(f),
    apply: () => ({
      guessed_source: "Escher in Het Paleis museum / Wikimedia en.wiki fair-use / Escher Foundation",
      guessed_artists: "M. C. Escher (1898–1972)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — The M.C. Escher Company B.V.",
        notes: "Escher works enter public domain in most jurisdictions 2043 (70 years post-mortem). Reuse requires permission.",
      },
      needs_review: false,
    }),
  },
  {
    name: "dali",
    test: (f) => /DaliG|Dal%C3%AD|Dali[_-]|[-_]Dali\.|Dal%C3%AD|The[_ ]Accommodations|Persistence[_ ]of[_ ]Memory|persistence_20of_20memory|Apparatus_and_Hand|Apparition_of_Face|Enigma[_ ]of[_ ]Hitler|First[_ ]Days[_ ]of[_ ]Spring|GreatMasturbator|Salvador[-_ ]Dali/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia en.wiki fair-use or external art-reference site",
      guessed_artists: "Salvador Dalí (1904–1989)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — Fundació Gala-Salvador Dalí / VEGAP",
        notes: "Dalí works remain under copyright until ~2060 in Spain (80 years post-mortem for authors who died before 1987).",
      },
      needs_review: false,
    }),
  },
  {
    name: "gorey",
    test: (f) => /Edward[_ ]Gorey|gorey/i.test(f),
    apply: () => ({
      guessed_source: "Art Institute of Chicago collection (artic.edu) or similar",
      guessed_artists: "Edward Gorey (1925–2000)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — Edward Gorey Charitable Trust",
        notes: "Copyrighted until at least 2070 in the US (95 years from publication for most works).",
      },
      needs_review: false,
    }),
  },
  {
    name: "daniel_kordan",
    test: (f) => /kordan|Kordan|DSC_\d{4}jj|g7-60_60/i.test(f),
    apply: () => ({
      guessed_source: "danielkordan.com",
      guessed_artists: "Daniel Kordan (contemporary landscape photographer)",
      copyright: { copyrighted: true, license: "All rights reserved", notes: null },
      needs_review: false,
    }),
  },
  {
    name: "mccurry",
    test: (f) => /McCurry|mccurry|Dust.Storm.Rajasthan|INDIA-10841/i.test(f),
    apply: () => ({
      guessed_source: "Magnum Photos / solldn.com",
      guessed_artists: "Steve McCurry (contemporary photojournalist)",
      copyright: { copyrighted: true, license: "All rights reserved", notes: null },
      needs_review: false,
    }),
  },
  {
    name: "nasa",
    test: (f) => /^PIA\d|^GSFC_\d|^STScI-|carina_nebula/i.test(f),
    apply: () => ({
      guessed_source: "NASA (images.nasa.gov / assets.science.nasa.gov)",
      guessed_artists: "NASA (various missions: Hubble, JWST, Cassini, etc.)",
      copyright: {
        copyrighted: false,
        license: "NASA media usage guidelines — generally public domain in the US",
        notes: "Non-NASA partner imagery (e.g. ESA/Hubble) may have separate terms.",
      },
      needs_review: false,
    }),
  },
  {
    name: "ernie_barnes",
    test: (f) => /[Ee]rnie[_ -]?[Bb]arnes|Sugar[_+ ]Shack|High[_+ ]Aspirations|Tunesmith|The[_+ ]Rhythmic[_+ ]Gymnast|head[_+ ]over[_+ ]heels|Springboard-Ernie|His[_+ ]Effort/i.test(f),
    apply: () => ({
      guessed_source: "erniebarnes.com",
      guessed_artists: "Ernie Barnes (1938–2009)",
      copyright: { copyrighted: true, license: "All rights reserved — The Ernie Barnes Family Trust", notes: null },
      needs_review: false,
    }),
  },
  {
    name: "durer",
    test: (f) => /^d[uü]rer[\s_]|^Dürer|Albrecht[_ ]D[uü]rer/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons (file renamed locally — filename starts with lowercase 'dürer' so the API lookup missed it)",
      guessed_artists: "Albrecht Dürer (1471–1528)",
      copyright: { copyrighted: false, license: "Public domain", notes: "Author died 1528. Public domain worldwide." },
      needs_review: false,
    }),
  },
  {
    name: "julie_de_graag",
    test: (f) => /Julie[_ ]de[_ ]Graag/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons / Rijksmuseum (file renamed locally, spaces instead of underscores)",
      guessed_artists: "Julie de Graag (1877–1924) — Dutch graphic artist",
      copyright: { copyrighted: false, license: "Public domain", notes: "Author died 1924. Public domain worldwide." },
      needs_review: false,
    }),
  },
  {
    name: "picasso",
    test: (f) => /Picasso|picasso|Old_guitarist|La[_ ]Vie[_ ]by[_ ]Pablo/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia en.wiki fair-use or external art-reference",
      guessed_artists: "Pablo Picasso (1881–1973)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — Succession Picasso",
        notes: "Picasso works enter public domain in 2044 (70 years post-mortem). Fully copyrighted.",
      },
      needs_review: false,
    }),
  },
  {
    name: "magritte",
    test: (f) => /Magritte|magritte|Chateau[_ ]de[_ ]Pyrenes|Empire[_ ]of[_ ]Light/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia en.wiki fair-use or external",
      guessed_artists: "René Magritte (1898–1967)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — C. Herscovici / Succession Magritte",
        notes: "Magritte works enter public domain in 2038 (70 years post-mortem).",
      },
      needs_review: false,
    }),
  },
  {
    name: "andrew_wyeth",
    test: (f) => /Wyeth|wyeth|Christinas[_ -]?World|Christina's[_ ]World/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia en.wiki fair-use or museum reproduction (MoMA)",
      guessed_artists: "Andrew Wyeth (1917–2009)",
      copyright: { copyrighted: true, license: "All rights reserved — Andrew Wyeth estate", notes: null },
      needs_review: false,
    }),
  },
  {
    name: "de_chirico",
    test: (f) => /Chirico|chirico|Disquieting[_ ]Muses/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia en.wiki fair-use or external",
      guessed_artists: "Giorgio de Chirico (1888–1978)",
      copyright: {
        copyrighted: true,
        license: "All rights reserved — Fondazione Giorgio e Isa de Chirico",
        notes: "Works enter public domain in 2049 (70 years post-mortem).",
      },
      needs_review: false,
    }),
  },
  {
    name: "bonnard",
    test: (f) => /bonnard|Bonnard/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons / museum",
      guessed_artists: "Pierre Bonnard (1867–1947)",
      copyright: {
        copyrighted: false,
        license: "Public domain in most jurisdictions (70y PMA reached 2018)",
        notes: "Still under URAA restoration in the US for some works. Generally safe as PD elsewhere.",
      },
      needs_review: false,
    }),
  },
  {
    name: "hiroshige_hokusai_shotei_yoshida_spaced",
    test: (f) => /^Hiroshige |^Hokusai |Hiroshi[_ ]Yoshida|Takahashi[_ ]Sh[oō]tei|Takahashi[_ ]Hiroaki|Takahashi_nude|Keisai[_ ]Eisen|Nishikawa[_ ]Sukenobu|Snow_on_Ayase|Bridge_over_waterfall|^Ariko[_ ]/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons — file uses spaces or variant naming not found directly; underlying work is a known Japanese woodblock print",
      guessed_artists: "Japanese woodblock/shin-hanga artists: Hiroshige (1797–1858), Hokusai (1760–1849), Takahashi Shōtei / Hiroaki (1871–1945), Hiroshi Yoshida (1876–1950), Keisai Eisen (1790–1848), Nishikawa Sukenobu (1671–1750)",
      copyright: {
        copyrighted: false,
        license: "Public domain",
        notes: "All listed artists died well before the 70-year PMA cutoff.",
      },
      needs_review: false,
    }),
  },
  {
    name: "huang_binhong_zhang_shanzi",
    test: (f) => /huang[_ -]binhong|zhang[_ ]shanzi/i.test(f),
    apply: () => ({
      guessed_source: "Auction house (bonhams.com / christies.com)",
      guessed_artists: "Huang Binhong (1865–1955) or Zhang Shanzi (1882–1940) — 20th-century Chinese painters",
      copyright: {
        copyrighted: true,
        license: "Likely still under copyright in most jurisdictions (China: 50y PMA from end of death year — Huang PD in China 2006, Zhang Shanzi PD in China 1991; US: depends on pre-1978 publication status)",
        notes: "Treat as copyrighted to be safe.",
      },
      needs_review: false,
    }),
  },
  {
    name: "famous_pd_old_master_renamed",
    test: (f) =>
      /Carl[_ ]Spitzweg|Carracci|Constable|Baldung|East[_ ]Cowes[_ ]Castle|Hieronym[ou]us[_ ]Bosch|Rembrandt|Van[_ ]Gogh|van[_ ]Gogh|Vincent[_ ]Van[_ ]Gogh|Courbet|Turner|Plompton|Pope's[_ ]Villa|Monet|Manet|Gainsborough|Mucha|Much[_ ]Slavnost|Rubens|Gauguin|van[_ ]Eyck|Chancellor[_ ]Rolin|Life-Boat[_ ]and[_ ]Manby|Manby[_ ]Apparatus/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons (file renamed locally — cannot auto-resolve but the title matches a famous pre-1930 Old-Master or Impressionist work)",
      guessed_artists: "Known pre-1930 European masters (artist derivable from filename)",
      copyright: {
        copyrighted: false,
        license: "Public domain",
        notes: "All implied artists died before 1955 so underlying works are public domain worldwide. Verify by manual Wikimedia search if an authoritative source URL is needed.",
      },
      needs_review: false,
    }),
  },
  {
    name: "metzinger",
    test: (f) => /Metzinger/i.test(f),
    apply: () => ({
      guessed_source: "Wikimedia Commons",
      guessed_artists: "Jean Metzinger (1883–1956)",
      copyright: {
        copyrighted: false,
        license: "Public domain in life+70 jurisdictions (since 2027 — borderline, check for specific works)",
        notes: "Public domain in most jurisdictions reached 2027-01-01 under 70y PMA; previously still under copyright. Today (2026) it is borderline — some works already PD via earlier publication, others not until 2027.",
      },
      needs_review: true,
    }),
  },
  {
    name: "flickr_hash",
    test: (f) => /^\d{10,}_[0-9a-f]{10,}(_o)?\./i.test(f),
    apply: () => ({
      guessed_source: "Flickr CDN (filename pattern <photo-id>_<secret>_o.<ext>)",
      guessed_artists: null,
      copyright: {
        copyrighted: null,
        license: null,
        notes: "Cannot be determined from filename alone. The photo-id in the filename can be looked up on Flickr: https://www.flickr.com/photo.gne?id=<photo-id>. Check the photo's license there.",
      },
      needs_review: true,
    }),
  },
  {
    name: "uuid_filename",
    test: (f) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(f),
    apply: () => ({
      guessed_source: "Unknown — filename is a bare UUID (possibly a CMS upload hash, sanity.io/cdn CDN, etc.)",
      guessed_artists: null,
      copyright: { copyrighted: null, license: null, notes: "Impossible to identify without inspecting the image content." },
      needs_review: true,
    }),
  },
  {
    name: "auction_lot_generic",
    test: (f) => /^H\d{5}-L\d{6,}|L\d{7,}_original/i.test(f),
    apply: () => ({
      guessed_source: "Invaluable / LiveAuctioneers / Sotheby's auction lot image",
      guessed_artists: null,
      copyright: { copyrighted: null, license: null, notes: "Auction lot numeric ID — underlying work and copyright depend on the specific lot." },
      needs_review: true,
    }),
  },
  {
    name: "webp_unknown",
    test: (f) => /\.webp(\.png)?$/i.test(f),
    apply: () => ({
      guessed_source: "Unknown (.webp files rarely come from Wikimedia; likely downloaded from a museum site, blog, or CDN)",
      guessed_artists: null,
      copyright: { copyrighted: null, license: null, notes: "Inspect the filename for artist clues; treat as needs_review." },
      needs_review: true,
    }),
  },
  {
    name: "codex_seraphinianus",
    test: (f) => /Serafin|Seraphinian|Codex.?Serafin/i.test(f),
    apply: () => ({
      guessed_source: "Codex Seraphinianus (Luigi Serafini, 1981)",
      guessed_artists: "Luigi Serafini (b. 1949)",
      copyright: { copyrighted: true, license: "All rights reserved — Rizzoli / Luigi Serafini", notes: null },
      needs_review: false,
    }),
  },
];

// Default fallthrough: everything else becomes "unknown, needs manual review"
function classifyFallback(filename) {
  return {
    guessed_source: "Unknown — not found on Wikimedia Commons by filename. Possibly renamed, from another site, or has a typo.",
    guessed_artists: null,
    copyright: { copyrighted: null, license: null, notes: "Needs manual review — compare against bookmarks.txt." },
    needs_review: true,
  };
}

async function processFolder(folderName) {
  const indexPath = path.join(ROOT, "metadata", `${folderName}.json`);
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

  const counts = { total_unresolved: 0 };
  for (const entry of Object.values(index.entries)) {
    if (entry.resolved) continue;
    counts.total_unresolved++;

    let classification = null;
    let ruleName = null;
    // NFC-normalize for regex matching. macOS stores filenames in NFD so
    // non-ASCII characters like 'ü' appear as 'u + combining diaeresis'
    // which character classes like [uü] cannot match.
    const normalizedName = entry.filename.normalize("NFC");
    for (const rule of rules) {
      if (rule.test(normalizedName)) {
        classification = rule.apply();
        ruleName = rule.name;
        break;
      }
    }
    if (!classification) {
      classification = classifyFallback(entry.filename);
      ruleName = "fallback_unknown";
    }
    counts[ruleName] = (counts[ruleName] || 0) + 1;

    // merge classification onto the entry
    entry.classification_rule = ruleName;
    entry.guessed_source = classification.guessed_source;
    entry.guessed_artists = classification.guessed_artists;
    entry.copyright = {
      ...(entry.copyright || {}),
      ...classification.copyright,
    };
    entry.needs_review = classification.needs_review;
  }

  index.classification_summary = counts;
  index.generated_at = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  console.log(`[${folderName}] classification summary:`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
}

const folders = process.argv.slice(2);
if (!folders.length) {
  console.error("usage: node classify-unresolved.mjs <folder> [folder...]");
  process.exit(1);
}
for (const f of folders) await processFolder(f);
