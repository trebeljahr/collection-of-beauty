#!/usr/bin/env node
/**
 * Perceptual-hash sweep over every artwork's cover image. Flags clusters
 * that are visually identical (exact dHash) or near-identical (hamming
 * distance <= NEAR_THRESHOLD). Reads from the pre-shrunk assets-web/
 * tree at width 256 so we touch < 200 MB instead of the 45 GB originals.
 *
 * Outputs:
 *   metadata/duplicate-images.json  — machine-readable clusters
 *   metadata/duplicate-images.md    — human-readable report (curator triage)
 *
 * Re-run any time after assets:shrink + build:data.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ARTWORKS_PATH = path.join(ROOT, "src/data/artworks.json");
const ASSETS_WEB = process.env.ASSETS_WEB_DIR
  ? path.resolve(process.env.ASSETS_WEB_DIR)
  : path.join(ROOT, "assets-web");
const ASSETS_RAW = process.env.ASSETS_DIR
  ? path.resolve(process.env.ASSETS_DIR)
  : path.join(ROOT, "assets");
const OUT_JSON = path.join(ROOT, "metadata/duplicate-images.json");
const OUT_MD = path.join(ROOT, "metadata/duplicate-images.md");
// Curator-confirmed not-a-duplicate clusters. Suppressed from the
// report so we don't re-triage the same "series sharing a title" /
// "visually similar but distinct works" findings every run.
const ALLOWLIST_PATH = path.join(ROOT, "metadata/duplicate-images-allowlist.json");

const HASH_W = 9;
const HASH_H = 8;
const NEAR_THRESHOLD = 4; // hamming distance for "near duplicate"
const CONCURRENCY = 12;

/** Pick the smallest pre-shrunk variant we have for a given objectKey. */
async function resolveImagePath(objectKey, variantWidths) {
  const ext = path.extname(objectKey);
  const baseDir = path.dirname(objectKey);
  const baseName = path.basename(objectKey, ext);
  const variantDir = path.join(ASSETS_WEB, baseDir, baseName);

  if (Array.isArray(variantWidths) && variantWidths.length > 0) {
    const smallest = Math.min(...variantWidths);
    const avif = path.join(variantDir, `${smallest}.avif`);
    if (await exists(avif)) return avif;
    const webp = path.join(variantDir, `${smallest}.webp`);
    if (await exists(webp)) return webp;
  }

  // Fall back: scan the variant dir for anything.
  try {
    const entries = await fs.readdir(variantDir);
    const ranked = entries
      .filter((e) => /\.(avif|webp)$/i.test(e))
      .map((e) => ({ name: e, w: Number.parseInt(e, 10) || Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.w - b.w);
    if (ranked[0]) return path.join(variantDir, ranked[0].name);
  } catch {
    // ignore
  }

  // Last resort: hash the original.
  const raw = path.join(ASSETS_RAW, objectKey);
  if (await exists(raw)) return raw;
  return null;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 64-bit difference hash. Resize to 9x8 greyscale, compare each pixel
 * with its right neighbour, pack 72 - 8 = 64 bits.
 */
async function dHash(filePath) {
  const raw = await sharp(filePath)
    .resize(HASH_W, HASH_H, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  const bits = new Uint8Array(8);
  let bitIdx = 0;
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const left = raw[y * HASH_W + x];
      const right = raw[y * HASH_W + x + 1];
      if (left < right) {
        const byte = bitIdx >> 3;
        const bit = bitIdx & 7;
        bits[byte] |= 1 << bit;
      }
      bitIdx++;
    }
  }
  return Buffer.from(bits).toString("hex");
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    const ba = Number.parseInt(a.slice(i, i + 2), 16);
    const bb = Number.parseInt(b.slice(i, i + 2), 16);
    let x = ba ^ bb;
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (err) {
        out[idx] = { error: String(err?.message ?? err) };
      }
      if ((idx + 1) % 200 === 0 || idx + 1 === items.length) {
        process.stderr.write(`  hashed ${idx + 1}/${items.length}\n`);
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function clusterByExact(records) {
  const buckets = new Map();
  for (const r of records) {
    if (!r.hash) continue;
    const list = buckets.get(r.hash) ?? [];
    list.push(r);
    buckets.set(r.hash, list);
  }
  return [...buckets.values()].filter((list) => list.length > 1);
}

/**
 * Greedy near-dupe clustering. For each record, find the nearest unassigned
 * neighbour within NEAR_THRESHOLD. Reasonable for ~3k records (~4.5M pairs).
 */
function clusterByNear(records, exactClusterIds) {
  const exactMembers = new Set();
  for (const cluster of exactClusterIds) for (const r of cluster) exactMembers.add(r.id);

  const candidates = records.filter((r) => r.hash && !exactMembers.has(r.id));
  const assigned = new Set();
  const clusters = [];

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue;
    const seed = candidates[i];
    const cluster = [{ ...seed, distance: 0 }];
    assigned.add(i);
    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue;
      const d = hamming(seed.hash, candidates[j].hash);
      if (d > 0 && d <= NEAR_THRESHOLD) {
        cluster.push({ ...candidates[j], distance: d });
        assigned.add(j);
      }
    }
    if (cluster.length > 1) clusters.push(cluster);
  }
  return clusters;
}

function normalizeTitle(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clusterByTitle(artworks, hashById) {
  const buckets = new Map();
  for (const a of artworks) {
    const t = normalizeTitle(a.englishTitle ?? a.title);
    if (!t) continue;
    const key = `${a.artistSlug ?? "_"}::${t}`;
    const list = buckets.get(key) ?? [];
    list.push(a);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      // Min hamming distance between any two members. Low value =
      // same-title members also visually overlap (likely true duplicate);
      // high value = series of distinct works that share a title.
      let minDistance = null;
      for (let i = 0; i < list.length; i++) {
        const hi = hashById.get(list[i].id);
        if (!hi) continue;
        for (let j = i + 1; j < list.length; j++) {
          const hj = hashById.get(list[j].id);
          if (!hj) continue;
          const d = hamming(hi, hj);
          if (minDistance == null || d < minDistance) minDistance = d;
        }
      }
      return { key, members: list, minDistance };
    })
    .sort((a, b) => (a.minDistance ?? 99) - (b.minDistance ?? 99));
}

function renderMarkdown(exact, near, titleClusters, stats) {
  const lines = [];
  lines.push("# Duplicate image sweep");
  lines.push("");
  lines.push(`_Generated ${new Date().toISOString()} from ${stats.hashed}/${stats.total} artworks (${stats.skipped} skipped: no resolvable image)._`);
  lines.push("");
  lines.push(`- Exact dHash collisions: **${exact.length}** clusters covering **${exact.reduce((n, c) => n + c.length, 0)}** artworks`);
  lines.push(`- Near duplicates (hamming ≤ ${NEAR_THRESHOLD}): **${near.length}** clusters covering **${near.reduce((n, c) => n + c.length, 0)}** artworks`);
  lines.push(`- Same artist + same normalized title: **${titleClusters.length}** clusters covering **${titleClusters.reduce((n, c) => n + c.members.length, 0)}** artworks`);
  lines.push("");
  lines.push("## Same artist + same title");
  lines.push("");
  lines.push("_Sorted by min pairwise hamming distance: low Δ likely = same work scanned twice; high Δ likely = a legitimate series sharing one title._");
  lines.push("");
  if (!titleClusters.length) {
    lines.push("_None._");
  } else {
    for (const cluster of titleClusters) {
      const dLabel = cluster.minDistance == null ? "Δ?" : `min Δ${cluster.minDistance}`;
      lines.push(`### \`${cluster.key}\` — ${dLabel}`);
      for (const a of cluster.members) {
        lines.push(`- \`${a.id}\` — ${a.title}${a.englishTitle && a.englishTitle !== a.title ? ` / ${a.englishTitle}` : ""} — \`${a.objectKey}\``);
      }
      lines.push("");
    }
  }
  lines.push("## Exact dHash matches");
  lines.push("");
  if (!exact.length) {
    lines.push("_None._");
  } else {
    for (const cluster of exact) {
      lines.push(`### \`${cluster[0].hash}\``);
      for (const r of cluster) {
        lines.push(`- \`${r.id}\` — ${r.title} — ${r.artist} — \`${r.objectKey}\``);
      }
      lines.push("");
    }
  }
  lines.push("## Near duplicates");
  lines.push("");
  if (!near.length) {
    lines.push("_None._");
  } else {
    for (const cluster of near) {
      lines.push(`### Seed \`${cluster[0].hash}\``);
      for (const r of cluster) {
        const suffix = r.distance === 0 ? "(seed)" : `(Δ${r.distance})`;
        lines.push(`- ${suffix} \`${r.id}\` — ${r.title} — ${r.artist} — \`${r.objectKey}\``);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function loadAllowlist() {
  try {
    const raw = await fs.readFile(ALLOWLIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      nearSeeds: new Set(parsed.nearSeeds ?? []),
      titleKeys: new Set(parsed.titleKeys ?? []),
    };
  } catch {
    return { nearSeeds: new Set(), titleKeys: new Set() };
  }
}

async function main() {
  const artworks = JSON.parse(await fs.readFile(ARTWORKS_PATH, "utf8"));
  const allowlist = await loadAllowlist();
  process.stderr.write(`Resolving image paths for ${artworks.length} artworks...\n`);

  const records = await mapLimit(artworks, CONCURRENCY, async (a) => {
    const filePath = await resolveImagePath(a.objectKey, a.variantWidths);
    if (!filePath) {
      return { id: a.id, title: a.title, artist: a.artist, objectKey: a.objectKey, hash: null, reason: "no-variant" };
    }
    const hash = await dHash(filePath);
    return { id: a.id, title: a.title, artist: a.artist, objectKey: a.objectKey, hash };
  });

  const hashed = records.filter((r) => r.hash);
  const skipped = records.filter((r) => !r.hash);
  process.stderr.write(`Hashed ${hashed.length}; skipped ${skipped.length}.\n`);

  const exact = clusterByExact(hashed);
  process.stderr.write(`Found ${exact.length} exact clusters; computing near duplicates...\n`);
  const nearAll = clusterByNear(hashed, exact);
  const near = nearAll.filter((c) => !allowlist.nearSeeds.has(c[0].hash));
  const nearSuppressed = nearAll.length - near.length;
  process.stderr.write(
    `Found ${nearAll.length} near-dup clusters (${nearSuppressed} suppressed via allowlist).\n`,
  );
  const hashById = new Map(hashed.map((r) => [r.id, r.hash]));
  const titleClustersAll = clusterByTitle(artworks, hashById);
  const titleClusters = titleClustersAll.filter((c) => !allowlist.titleKeys.has(c.key));
  const titleSuppressed = titleClustersAll.length - titleClusters.length;
  process.stderr.write(
    `Found ${titleClustersAll.length} artist+title clusters (${titleSuppressed} suppressed via allowlist).\n`,
  );

  const stats = { total: artworks.length, hashed: hashed.length, skipped: skipped.length };
  const payload = {
    generatedAt: new Date().toISOString(),
    threshold: NEAR_THRESHOLD,
    stats,
    exact: exact.map((c) => ({ hash: c[0].hash, members: c.map(({ id, title, artist, objectKey }) => ({ id, title, artist, objectKey })) })),
    near: near.map((c) => ({ seedHash: c[0].hash, members: c.map(({ id, title, artist, objectKey, distance, hash }) => ({ id, title, artist, objectKey, hash, distance })) })),
    titleClusters: titleClusters.map(({ key, members, minDistance }) => ({
      key,
      minDistance,
      members: members.map(({ id, title, englishTitle, artist, objectKey }) => ({ id, title, englishTitle, artist, objectKey })),
    })),
    skipped: skipped.map(({ id, objectKey, reason }) => ({ id, objectKey, reason })),
  };

  await fs.writeFile(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(OUT_MD, `${renderMarkdown(exact, near, titleClusters, stats)}\n`);
  process.stderr.write(`Wrote ${path.relative(ROOT, OUT_JSON)} and ${path.relative(ROOT, OUT_MD)}.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
