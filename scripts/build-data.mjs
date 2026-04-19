import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");
const ASSETS = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "src", "data");

// Probe only the first 64 KB of each image to extract width/height — enough
// for every format we have (jpg/png/webp/tif). Reading full files would OOM
// the container on the larger 16 MB plates.
const PROBE_BYTES = 64 * 1024;
const probeBuf = Buffer.alloc(PROBE_BYTES);
const dimensionCache = new Map();

function dimensionsFor(folderKey, filename) {
  const key = `${folderKey}/${filename}`;
  if (dimensionCache.has(key)) return dimensionCache.get(key);
  let result = null;
  const file = path.join(ASSETS, folderKey, filename);
  if (existsSync(file)) {
    try {
      const fd = openSync(file, "r");
      const n = readSync(fd, probeBuf, 0, PROBE_BYTES, 0);
      closeSync(fd);
      const slice = n < PROBE_BYTES ? probeBuf.subarray(0, n) : probeBuf;
      const { width, height } = imageSize(slice);
      if (width && height) result = { width, height };
    } catch {
      // leave null
    }
  }
  dimensionCache.set(key, result);
  return result;
}

const WIKIMEDIA_FOLDERS = [
  "collection-of-beauty",
  "audubon-birds",
  "kunstformen-images",
];

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function stripQuickStatements(input) {
  if (!input) return input;
  return input
    .replace(/\s*(title|label)\s+QS:[^,]+(,[^,]+)*/g, "")
    .replace(/\s*date\s+QS:[^,\s]+(,[^,\s]+)*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(raw, fallback) {
  if (!raw) return fallback;
  const first = raw.split(/[,(]/)[0];
  const cleaned = stripQuickStatements(first).replace(/^["']|["']$/g, "").trim();
  return cleaned || fallback;
}

function firstLineDescription(raw) {
  if (!raw) return null;
  const t = stripQuickStatements(raw);
  const oneline = t.split(/[.!?\n]/)[0].trim();
  if (oneline.length < 8) return null;
  if (oneline.length > 240) return oneline.slice(0, 237) + "...";
  return oneline;
}

function extractYear(entry) {
  if (typeof entry.year === "number") return entry.year;
  if (!entry.date_created) return null;
  const m = entry.date_created.match(/\b(\d{3,4})\b/);
  return m ? Number(m[1]) : null;
}

function keepEntry(entry) {
  if (!entry.source?.file_url) return false;
  if (entry.needs_review) return false;
  const cp = entry.copyright;
  if (!cp) return false;
  if (cp.copyrighted === false) return true;
  const lic = (cp.license_short || "").toLowerCase();
  if (!lic) return false;
  return (
    lic.includes("cc0") ||
    lic.includes("cc by") ||
    lic.includes("public") ||
    lic.includes("no restrictions")
  );
}

function normalizeArtistName(raw) {
  if (!raw) return null;
  let s = stripQuickStatements(raw);
  s = s.replace(/\s*\([^)]*\)/g, "");
  s = s.replace(/\b(artist|painter|sculptor|unknown)\b/gi, "").trim();
  s = s.replace(/\s+/g, " ");
  return s || null;
}

async function loadArtistsDb() {
  const raw = await readFile(
    path.join(ROOT, "scripts", "artists-db.json"),
    "utf8",
  );
  const { artists } = JSON.parse(raw);
  const byAlias = new Map();
  for (const a of artists) {
    for (const alias of a.aliases || [a.name]) {
      byAlias.set(alias.toLowerCase(), a);
    }
    byAlias.set(a.name.toLowerCase(), a);
  }
  return { artists, byAlias };
}

function matchArtist(name, byAlias) {
  if (!name) return null;
  const low = name.toLowerCase();
  if (byAlias.has(low)) return byAlias.get(low);
  for (const [alias, a] of byAlias) {
    if (low.includes(alias) || alias.includes(low)) return a;
  }
  return null;
}

function buildMovementGroups(artists) {
  const groups = new Map();
  for (const a of artists) {
    if (!a.movement) continue;
    if (!groups.has(a.movement)) groups.set(a.movement, []);
    groups.get(a.movement).push(a);
  }
  return groups;
}

function overlapYears(a, b) {
  const aStart = a.born ?? 0;
  const aEnd = a.died ?? 2100;
  const bStart = b.born ?? 0;
  const bEnd = b.died ?? 2100;
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const KNOWN_CONNECTIONS = [
  ["Claude Monet", "Édouard Manet", "contemporaries in Impressionist circle"],
  ["Claude Monet", "Pierre-Auguste Renoir", "painted side-by-side at La Grenouillère"],
  ["Claude Monet", "Camille Pissarro", "exhibited together, Impressionist co-founders"],
  ["Claude Monet", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Edgar Degas", "Impressionist exhibitions"],
  ["Pierre-Auguste Renoir", "Camille Pissarro", "Impressionist exhibitions"],
  ["Vincent van Gogh", "Paul Gauguin", "lived together in Arles, 1888"],
  ["Vincent van Gogh", "Paul Cézanne", "contemporaries, Post-Impressionists"],
  ["Vincent van Gogh", "Camille Pissarro", "Pissarro mentored van Gogh in Paris"],
  ["Paul Cézanne", "Camille Pissarro", "Pissarro was Cézanne's mentor"],
  ["Paul Cézanne", "Pierre-Auguste Renoir", "contemporaries"],
  ["Édouard Manet", "Edgar Degas", "close friends, frequent correspondents"],
  ["Édouard Manet", "Berthe Morisot", "brother-in-law and painting peers"],
  ["Berthe Morisot", "Claude Monet", "Impressionist group"],
  ["Berthe Morisot", "Edgar Degas", "Impressionist group"],
  ["Henri de Toulouse-Lautrec", "Vincent van Gogh", "Paris, late 1880s"],
  ["Henri de Toulouse-Lautrec", "Paul Gauguin", "Paris contemporaries"],
  ["Georges Seurat", "Paul Signac", "co-developed Pointillism"],
  ["Georges Seurat", "Camille Pissarro", "Pissarro adopted Pointillism briefly"],
  ["Pablo Picasso", "Georges Braque", "co-founders of Cubism"],
  ["Pablo Picasso", "Henri Matisse", "lifelong rivals and friends"],
  ["Henri Matisse", "André Derain", "Fauvism co-founders"],
  ["Wassily Kandinsky", "Franz Marc", "Der Blaue Reiter co-founders"],
  ["Wassily Kandinsky", "Paul Klee", "Bauhaus colleagues"],
  ["Paul Klee", "Franz Marc", "Der Blaue Reiter"],
  ["Paul Klee", "August Macke", "Tunisia trip, 1914"],
  ["Gustav Klimt", "Egon Schiele", "Klimt mentored Schiele in Vienna"],
  ["Gustav Klimt", "Koloman Moser", "Vienna Secession co-founders"],
  ["Egon Schiele", "Oskar Kokoschka", "Vienna Secession"],
  ["Peter Paul Rubens", "Anthony van Dyck", "van Dyck was Rubens's assistant"],
  ["Leonardo da Vinci", "Michelangelo Buonarroti", "rivals in Florence"],
  ["Leonardo da Vinci", "Raphael", "Raphael studied Leonardo's technique"],
  ["Michelangelo Buonarroti", "Raphael", "rivals in Rome"],
  ["Rembrandt van Rijn", "Johannes Vermeer", "Dutch Golden Age peers"],
  ["J. M. W. Turner", "John Constable", "Romantic rivals at the Royal Academy"],
  ["Eugène Delacroix", "Théodore Géricault", "Romantic peers"],
  ["Jean-Auguste-Dominique Ingres", "Eugène Delacroix", "Neoclassical vs Romantic rivals"],
  ["Katsushika Hokusai", "Utagawa Hiroshige", "ukiyo-e masters"],
  ["Utagawa Hiroshige", "Utagawa Kuniyoshi", "Utagawa school"],
  ["Claude Monet", "James McNeill Whistler", "friends and correspondents"],
  ["James McNeill Whistler", "John Singer Sargent", "American expatriates, London"],
  ["John Singer Sargent", "Claude Monet", "Sargent visited Monet at Giverny"],
  ["Mary Cassatt", "Edgar Degas", "Degas invited Cassatt into Impressionists"],
  ["Mary Cassatt", "Camille Pissarro", "Impressionist group"],
  ["Salvador Dalí", "Pablo Picasso", "Spanish contemporaries"],
  ["Salvador Dalí", "Joan Miró", "Spanish Surrealists"],
  ["René Magritte", "Salvador Dalí", "Surrealist peers"],
  ["Marc Chagall", "Pablo Picasso", "Paris contemporaries"],
  ["Vincent van Gogh", "Émile Bernard", "close correspondents"],
  ["Paul Gauguin", "Émile Bernard", "developed Synthetism together"],
  ["Hasui Kawase", "Yoshida Hiroshi", "shin-hanga movement peers"],
  ["John James Audubon", "John Gould", "ornithological illustrators, contemporaries"],
];

async function main() {
  const [cob, birds, haeckel] = await Promise.all(
    WIKIMEDIA_FOLDERS.map((f) =>
      readFile(path.join(META, `${f}.json`), "utf8").then(JSON.parse),
    ),
  );
  const { artists: artistsDb, byAlias } = await loadArtistsDb();

  const artworks = [];
  const artistAggregates = new Map();

  function pushFromFolder(folderKey, data) {
    for (const [fname, entry] of Object.entries(data.entries)) {
      if (!keepEntry(entry)) continue;
      const artistName = normalizeArtistName(entry.artist) ?? null;
      const title = cleanTitle(entry.title, fname.replace(/[_.]/g, " "));
      const year = extractYear(entry);
      const artistInfo = entry.artist_info ?? matchArtist(artistName, byAlias);
      const artistSlug = artistName ? slugify(artistName) : "unknown";
      const id = slugify(
        `${folderKey}-${fname.replace(/\.[^.]+$/, "")}`,
      ).slice(0, 120);

      const dims = dimensionsFor(folderKey, fname);
      artworks.push({
        id,
        title,
        artist: artistName,
        artistSlug,
        year,
        dateCreated: stripQuickStatements(entry.date_created) || null,
        description: firstLineDescription(entry.description),
        folder: folderKey,
        objectKey: `${folderKey}/${fname}`,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        fileUrl: entry.source.file_url,
        commonsUrl: entry.source.url,
        credit: entry.source.credit || null,
        license: entry.copyright.license_short || "Public domain",
        movement: artistInfo?.movement || null,
        nationality: artistInfo?.nationality || null,
      });

      if (artistName) {
        if (!artistAggregates.has(artistSlug)) {
          artistAggregates.set(artistSlug, {
            slug: artistSlug,
            name: artistName,
            born: artistInfo?.born ?? null,
            died: artistInfo?.died ?? null,
            nationality: artistInfo?.nationality ?? null,
            movement: artistInfo?.movement ?? null,
            count: 0,
            minYear: null,
            maxYear: null,
            coverFileUrl: null,
            coverObjectKey: null,
            coverTitle: null,
          });
        }
        const agg = artistAggregates.get(artistSlug);
        agg.count += 1;
        if (year != null) {
          if (agg.minYear == null || year < agg.minYear) agg.minYear = year;
          if (agg.maxYear == null || year > agg.maxYear) agg.maxYear = year;
        }
        if (!agg.coverFileUrl) {
          agg.coverFileUrl = entry.source.file_url;
          agg.coverObjectKey = `${folderKey}/${fname}`;
          agg.coverTitle = title;
        }
      }
    }
  }

  pushFromFolder("collection-of-beauty", cob);
  pushFromFolder("audubon-birds", birds);
  pushFromFolder("kunstformen-images", haeckel);

  artworks.sort((a, b) => {
    const ay = a.year ?? 99999;
    const by = b.year ?? 99999;
    if (ay !== by) return ay - by;
    return (a.title || "").localeCompare(b.title || "");
  });

  const artists = Array.from(artistAggregates.values()).sort((a, b) =>
    b.count - a.count || a.name.localeCompare(b.name),
  );

  const movements = Array.from(
    new Set(artists.map((a) => a.movement).filter(Boolean)),
  ).sort();

  const knownArtistByName = new Map(artists.map((a) => [a.name, a]));
  const artistSlugByName = new Map(artists.map((a) => [a.name, a.slug]));

  const edges = [];
  for (const [a, b, label] of KNOWN_CONNECTIONS) {
    const aa = knownArtistByName.get(a);
    const bb = knownArtistByName.get(b);
    if (!aa || !bb) continue;
    edges.push({
      source: aa.slug,
      target: bb.slug,
      label,
      kind: "known",
    });
  }

  const movementGroups = buildMovementGroups(artists);
  const existingPairs = new Set(
    edges.map((e) => [e.source, e.target].sort().join("|")),
  );
  for (const [movement, members] of movementGroups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const x = members[i];
        const y = members[j];
        if (overlapYears(x, y) < 5) continue;
        const key = [x.slug, y.slug].sort().join("|");
        if (existingPairs.has(key)) continue;
        existingPairs.add(key);
        edges.push({
          source: x.slug,
          target: y.slug,
          label: `shared movement: ${movement}`,
          kind: "movement",
        });
      }
    }
  }

  const summary = {
    totalArtworks: artworks.length,
    totalArtists: artists.length,
    totalMovements: movements.length,
    totalConnections: edges.length,
    yearRange: {
      min: artworks.reduce(
        (m, a) => (a.year != null && (m == null || a.year < m) ? a.year : m),
        null,
      ),
      max: artworks.reduce(
        (m, a) => (a.year != null && (m == null || a.year > m) ? a.year : m),
        null,
      ),
    },
  };

  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  await writeFile(
    path.join(OUT, "artworks.json"),
    JSON.stringify(artworks),
  );
  await writeFile(
    path.join(OUT, "artists.json"),
    JSON.stringify(artists),
  );
  await writeFile(
    path.join(OUT, "movements.json"),
    JSON.stringify(movements),
  );
  await writeFile(
    path.join(OUT, "connections.json"),
    JSON.stringify(edges),
  );
  await writeFile(
    path.join(OUT, "summary.json"),
    JSON.stringify(summary, null, 2),
  );

  console.log("[build-data]", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
