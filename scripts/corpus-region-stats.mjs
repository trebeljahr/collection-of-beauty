#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const ARTWORKS_PATH = path.join(ROOT, "src", "data", "artworks.json");
const ARTISTS_DB_PATH = path.join(ROOT, "scripts", "artists-db.json");
const JSON_OUT_PATH = path.join(ROOT, "metadata", "corpus-stats.json");
const MARKDOWN_OUT_PATH =
  process.env.CORPUS_STATS_MARKDOWN ??
  "/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/collection-of-beauty/_corpus-stats.md";

const UNDERREPRESENTED_CHECKS = [
  {
    label: "African nationalities or movements",
    tokens: [
      "african",
      "egyptian",
      "ethiopian",
      "ghanaian",
      "malian",
      "moroccan",
      "nigerian",
      "south african",
      "sudanese",
      "yoruba",
      "benin",
    ],
  },
  {
    label: "Pre-Columbian or Mesoamerican categories",
    tokens: ["pre-columbian", "mesoamerican", "aztec", "maya", "mayan", "inca", "olmec"],
  },
  {
    label: "South or Southeast Asian nationalities/movements",
    tokens: [
      "south asian",
      "southeast asian",
      "indian",
      "mughal",
      "rajput",
      "thai",
      "khmer",
      "vietnamese",
      "burmese",
      "myanmar",
      "javanese",
      "balinese",
      "indonesian",
      "malay",
      "filipino",
    ],
  },
  {
    label: "Islamic calligraphy or manuscript categories",
    tokens: [
      "islamic",
      "calligraphy",
      "manuscript",
      "persian miniature",
      "ottoman",
      "safavid",
      "mughal",
    ],
  },
  {
    label: "Indigenous Americas, Australia, or Oceania categories",
    tokens: [
      "indigenous",
      "native american",
      "first nations",
      "aboriginal",
      "australian",
      "oceanian",
      "polynesian",
      "maori",
      "melanesian",
      "micronesian",
    ],
  },
];

function fold(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pct(value, total) {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(1));
}

function byArtworkCountThenName(a, b) {
  if (b.artworkCount !== a.artworkCount) return b.artworkCount - a.artworkCount;
  if (b.artistCount !== a.artistCount) return b.artistCount - a.artistCount;
  return a.name.localeCompare(b.name);
}

function splitFacet(value) {
  return String(value ?? "")
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildAliasMap(artists) {
  const aliases = new Map();
  for (const artist of artists) {
    for (const alias of artist.aliases || [artist.name]) {
      aliases.set(fold(alias), artist);
    }
    aliases.set(fold(artist.name), artist);
  }
  return aliases;
}

function matchArtist(name, aliases) {
  if (!name) return null;
  const key = fold(name);
  if (aliases.has(key)) return aliases.get(key);
  for (const [alias, artist] of aliases) {
    if (key.includes(alias) || alias.includes(key)) return artist;
  }
  return null;
}

function summarizeGroups(artists, field, totalArtworks) {
  const groups = new Map();
  for (const artist of artists) {
    const value = artist[field];
    if (!value) continue;
    if (!groups.has(value)) {
      groups.set(value, {
        name: value,
        artistCount: 0,
        artworkCount: 0,
        artworkShare: 0,
        artists: [],
      });
    }
    const group = groups.get(value);
    group.artistCount += 1;
    group.artworkCount += artist.artworkCount;
    group.artists.push(artist.name);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      artworkShare: pct(group.artworkCount, totalArtworks),
      artists: group.artists.sort((a, b) => a.localeCompare(b)),
    }))
    .sort(byArtworkCountThenName);
}

function summarizeFacets(artists, field, totalArtworks) {
  const groups = new Map();
  for (const artist of artists) {
    for (const facet of splitFacet(artist[field])) {
      if (!groups.has(facet)) {
        groups.set(facet, {
          name: facet,
          artistCount: 0,
          artworkCount: 0,
          artworkShare: 0,
          artists: [],
        });
      }
      const group = groups.get(facet);
      group.artistCount += 1;
      group.artworkCount += artist.artworkCount;
      group.artists.push(artist.name);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      artworkShare: pct(group.artworkCount, totalArtworks),
      artists: Array.from(new Set(group.artists)).sort((a, b) => a.localeCompare(b)),
    }))
    .sort(byArtworkCountThenName);
}

function compactArtist(artist) {
  return {
    name: artist.name,
    slug: artist.slug,
    artworkCount: artist.artworkCount,
    artworkShare: artist.artworkShare,
    yearRange: artist.yearRange,
    nationality: artist.nationality,
    movement: artist.movement,
    matchSource: artist.matchSource,
    matchedArtist: artist.matchedArtist,
  };
}

function countUnderrepresentedCoverage(artists, checks, totalArtworks) {
  return checks.map((check) => {
    const hits = artists.filter((artist) => {
      const haystack = fold([artist.nationality, artist.movement].filter(Boolean).join(" "));
      return check.tokens.some((token) => haystack.includes(token));
    });
    const artworkCount = hits.reduce((sum, artist) => sum + artist.artworkCount, 0);
    return {
      label: check.label,
      artistCount: hits.length,
      artworkCount,
      artworkShare: pct(artworkCount, totalArtworks),
      artists: hits.map((artist) => artist.name).sort((a, b) => a.localeCompare(b)),
    };
  });
}

function countCenturyBuckets(artworks) {
  const buckets = new Map();
  for (const artwork of artworks) {
    if (!Number.isFinite(artwork.year)) continue;
    const century = Math.floor((artwork.year - 1) / 100) + 1;
    const label = `${century}${ordinalSuffix(century)} century`;
    if (!buckets.has(label)) {
      buckets.set(label, { name: label, artworkCount: 0, artists: new Set() });
    }
    const bucket = buckets.get(label);
    bucket.artworkCount += 1;
    bucket.artists.add(artwork.artist || "Unknown");
  }
  return Array.from(buckets.values())
    .map((bucket) => ({
      name: bucket.name,
      artworkCount: bucket.artworkCount,
      artistCount: bucket.artists.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

function ordinalSuffix(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function renderMarkdown(stats) {
  const lines = [
    "# Corpus Region Stats",
    "",
    `Generated by \`scripts/corpus-region-stats.mjs\` on ${stats.generatedAt}.`,
    "",
    "## Coverage",
    "",
    `- Artworks: ${stats.totals.artworks}`,
    `- Unique artist buckets in corpus: ${stats.totals.uniqueArtists}`,
    `- Mapped artist buckets: ${stats.totals.mappedArtists} (${stats.totals.mappedArtistShare}%)`,
    `- Mapped artworks: ${stats.totals.mappedArtworks} (${stats.totals.mappedArtworkShare}%)`,
    `- Unmapped artist buckets: ${stats.totals.unmappedArtists}`,
    `- Unmapped artworks: ${stats.totals.unmappedArtworks} (${stats.totals.unmappedArtworkShare}%)`,
    "",
    "## Top Nationality Labels",
    "",
    "| Nationality | Artists | Works | Work share |",
    "| --- | ---: | ---: | ---: |",
    ...stats.nationalities
      .slice(0, 20)
      .map(
        (group) =>
          `| ${group.name} | ${group.artistCount} | ${group.artworkCount} | ${group.artworkShare}% |`,
      ),
    "",
    "## Top Nationality Facets",
    "",
    "Multi-national labels are split on `/`, so totals can exceed corpus size.",
    "",
    "| Nationality facet | Artists | Works | Work share |",
    "| --- | ---: | ---: | ---: |",
    ...stats.nationalityFacets
      .slice(0, 20)
      .map(
        (group) =>
          `| ${group.name} | ${group.artistCount} | ${group.artworkCount} | ${group.artworkShare}% |`,
      ),
    "",
    "## Top Movement Labels",
    "",
    "| Movement | Artists | Works | Work share |",
    "| --- | ---: | ---: | ---: |",
    ...stats.movements
      .slice(0, 25)
      .map(
        (group) =>
          `| ${group.name} | ${group.artistCount} | ${group.artworkCount} | ${group.artworkShare}% |`,
      ),
    "",
    "## Top Movement Facets",
    "",
    "Compound movement labels are split on `/`, so totals can exceed corpus size.",
    "",
    "| Movement facet | Artists | Works | Work share |",
    "| --- | ---: | ---: | ---: |",
    ...stats.movementFacets
      .slice(0, 25)
      .map(
        (group) =>
          `| ${group.name} | ${group.artistCount} | ${group.artworkCount} | ${group.artworkShare}% |`,
      ),
    "",
    "## Under-Represented Checks",
    "",
    "These checks look only at mapped nationality and movement labels.",
    "",
    "| Check | Artists | Works | Work share |",
    "| --- | ---: | ---: | ---: |",
    ...stats.underrepresentedChecks.map(
      (group) =>
        `| ${group.label} | ${group.artistCount} | ${group.artworkCount} | ${group.artworkShare}% |`,
    ),
    "",
    "## Date Coverage",
    "",
    `- Works dated 1900 or later: ${stats.dateCoverage.from1900.artworkCount} (${stats.dateCoverage.from1900.artworkShare}%) across ${stats.dateCoverage.from1900.artistCount} artist buckets.`,
    `- Works dated 1926 or later: ${stats.dateCoverage.from1926.artworkCount} (${stats.dateCoverage.from1926.artworkShare}%) across ${stats.dateCoverage.from1926.artistCount} artist buckets.`,
    `- Works dated 1945 or later: ${stats.dateCoverage.from1945.artworkCount} (${stats.dateCoverage.from1945.artworkShare}%) across ${stats.dateCoverage.from1945.artistCount} artist buckets.`,
    "",
    "## Top Unmapped Artist Buckets",
    "",
    "| Artist | Works | Year range |",
    "| --- | ---: | --- |",
    ...stats.unmappedArtists
      .slice(0, 40)
      .map(
        (artist) =>
          `| ${artist.name} | ${artist.artworkCount} | ${artist.yearRange?.min ?? "?"}-${artist.yearRange?.max ?? "?"} |`,
      ),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const [artworksRaw, artistsDbRaw] = await Promise.all([
    readFile(ARTWORKS_PATH, "utf8"),
    readFile(ARTISTS_DB_PATH, "utf8"),
  ]);
  const artworks = JSON.parse(artworksRaw);
  const { artists: artistsDb } = JSON.parse(artistsDbRaw);
  const aliases = buildAliasMap(artistsDb);
  const artistBuckets = new Map();

  for (const artwork of artworks) {
    const name = artwork.artist || "Unknown";
    const key = artwork.artistSlug || fold(name) || "unknown";
    const matched = matchArtist(name, aliases);
    const existing = artistBuckets.get(key);
    const nationality = matched?.nationality ?? artwork.nationality ?? null;
    const movement = matched?.movement ?? artwork.movement ?? null;
    const matchSource = matched ? "artists-db" : artwork.nationality || artwork.movement ? "artwork" : "unmapped";

    if (!existing) {
      artistBuckets.set(key, {
        name,
        slug: artwork.artistSlug ?? null,
        artworkCount: 0,
        artworkShare: 0,
        years: [],
        yearRange: null,
        nationality,
        movement,
        matchSource,
        matchedArtist: matched?.name ?? null,
      });
    }

    const artist = artistBuckets.get(key);
    artist.artworkCount += 1;
    if (Number.isFinite(artwork.year)) artist.years.push(artwork.year);
    if (!artist.nationality && nationality) artist.nationality = nationality;
    if (!artist.movement && movement) artist.movement = movement;
    if (artist.matchSource === "unmapped" && matchSource !== "unmapped") artist.matchSource = matchSource;
    if (!artist.matchedArtist && matched?.name) artist.matchedArtist = matched.name;
  }

  const artists = Array.from(artistBuckets.values())
    .map((artist) => {
      const years = artist.years;
      return {
        ...artist,
        artworkShare: pct(artist.artworkCount, artworks.length),
        yearRange:
          years.length > 0
            ? {
                min: Math.min(...years),
                max: Math.max(...years),
              }
            : null,
        years: undefined,
      };
    })
    .sort((a, b) => b.artworkCount - a.artworkCount || a.name.localeCompare(b.name));

  const mappedArtists = artists.filter((artist) => artist.nationality || artist.movement);
  const unmappedArtists = artists.filter((artist) => !artist.nationality && !artist.movement);
  const mappedArtworks = mappedArtists.reduce((sum, artist) => sum + artist.artworkCount, 0);
  const unmappedArtworks = artworks.length - mappedArtworks;

  const datedFrom = (year) => {
    const hits = artworks.filter((artwork) => Number.isFinite(artwork.year) && artwork.year >= year);
    return {
      artworkCount: hits.length,
      artworkShare: pct(hits.length, artworks.length),
      artistCount: new Set(hits.map((artwork) => artwork.artist || "Unknown")).size,
    };
  };

  const stats = {
    generatedAt: new Date().toISOString(),
    inputs: {
      artworks: path.relative(ROOT, ARTWORKS_PATH),
      artistsDb: path.relative(ROOT, ARTISTS_DB_PATH),
    },
    outputs: {
      json: path.relative(ROOT, JSON_OUT_PATH),
      markdown: MARKDOWN_OUT_PATH,
    },
    totals: {
      artworks: artworks.length,
      uniqueArtists: artists.length,
      mappedArtists: mappedArtists.length,
      mappedArtistShare: pct(mappedArtists.length, artists.length),
      unmappedArtists: unmappedArtists.length,
      mappedArtworks,
      mappedArtworkShare: pct(mappedArtworks, artworks.length),
      unmappedArtworks,
      unmappedArtworkShare: pct(unmappedArtworks, artworks.length),
      artistsDbEntries: artistsDb.length,
    },
    nationalities: summarizeGroups(artists, "nationality", artworks.length),
    nationalityFacets: summarizeFacets(artists, "nationality", artworks.length),
    movements: summarizeGroups(artists, "movement", artworks.length),
    movementFacets: summarizeFacets(artists, "movement", artworks.length),
    underrepresentedChecks: countUnderrepresentedCoverage(
      artists,
      UNDERREPRESENTED_CHECKS,
      artworks.length,
    ),
    dateCoverage: {
      from1900: datedFrom(1900),
      from1926: datedFrom(1926),
      from1945: datedFrom(1945),
      byCentury: countCenturyBuckets(artworks),
    },
    artists: artists.map(compactArtist),
    unmappedArtists: unmappedArtists.map(compactArtist),
  };

  await mkdir(path.dirname(JSON_OUT_PATH), { recursive: true });
  await mkdir(path.dirname(MARKDOWN_OUT_PATH), { recursive: true });
  await Promise.all([
    writeFile(JSON_OUT_PATH, `${JSON.stringify(stats, null, 2)}\n`),
    writeFile(MARKDOWN_OUT_PATH, renderMarkdown(stats)),
  ]);

  console.log(`Wrote ${path.relative(ROOT, JSON_OUT_PATH)}`);
  console.log(`Wrote ${MARKDOWN_OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
