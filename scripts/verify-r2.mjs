#!/usr/bin/env node
/**
 * Verify that every artwork's variant files exist on the public assets
 * URL (Cloudflare R2 in prod). Catches the class of bug where the
 * catalogue's objectKey drifts from the on-disk / R2 variant directory
 * name — exactly what happened with the eight `"`-containing filenames
 * that 404'd in dev and prod.
 *
 * What it checks, per artwork in src/data/artworks.json:
 *   - <base>/<dir>/<basename>/<w>.avif for every w in variantWidths
 *   - <base>/<dir>/<basename>/1280.webp (shrink-sources always emits)
 *
 * What it does NOT check:
 *   - The original (assetUrl(objectKey)) — assets-web/ is the only thing
 *     synced to R2, so the original isn't there. Modern browsers honour
 *     <source srcSet> AVIF first and never request the <img src>
 *     fallback in practice.
 *   - Entries with variantWidths === null — build-data should never
 *     emit those any more; if it does, that's a separate alarm (see
 *     `--check-unshrunk`).
 *
 * Modes:
 *   default        HTTP HEAD against PUBLIC_ASSETS_BASE_URL. No R2
 *                  creds needed — runs anywhere with outbound HTTPS.
 *   --bulk         List R2 once via rclone, check membership in memory.
 *                  Needs R2_ENDPOINT / R2_ACCESS_KEY_ID /
 *                  R2_SECRET_ACCESS_KEY / R2_ASSETS_BUCKET. ~10× faster
 *                  on a 27k-key check.
 *
 * Flags:
 *   --base <url>           Override PUBLIC_ASSETS_BASE_URL.
 *   --sample <N>           Check only N random artworks (smoke test).
 *   --concurrency <N>      HEAD concurrency cap (default 32).
 *   --check-unshrunk       Also fail if any artwork has variantWidths===null
 *                          (defence in depth — build-data's filter should
 *                          have caught it, but this proves the catalogue
 *                          is internally consistent).
 *   --warn                 Exit 0 even when files are missing; just print
 *                          the report. For diagnostic runs.
 *
 * Exit codes:
 *   0  every expected variant present
 *   1  at least one variant missing (or unshrunk entry with --check-unshrunk)
 *   2  bad invocation / network failure
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE = "https://assets.beauty.trebeljahr.com";
// shrink-sources.mjs emits exactly one WebP per source, at 1280w, for
// OG meta tags + email clients. Mirror that here so the verifier
// matches reality.
const WEBP_WIDTH = 1280;

function parseArgs(argv) {
  const args = {
    bulk: false,
    base: process.env.NEXT_PUBLIC_ASSETS_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE,
    sample: null,
    concurrency: 32,
    checkUnshrunk: false,
    warn: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--bulk") args.bulk = true;
    else if (a === "--warn") args.warn = true;
    else if (a === "--check-unshrunk") args.checkUnshrunk = true;
    else if (a === "--base") args.base = argv[++i]?.replace(/\/$/, "");
    else if (a === "--sample") args.sample = Number.parseInt(argv[++i] ?? "0", 10);
    else if (a === "--concurrency") args.concurrency = Number.parseInt(argv[++i] ?? "32", 10);
    else if (a === "-h" || a === "--help") {
      process.stdout.write(
        "verify-r2: HEAD-check every artwork's variants against the public assets URL.\n" +
          "  --bulk                        bulk-list R2 via rclone (needs R2_* env)\n" +
          "  --base <url>                  override base URL\n" +
          "  --sample <N>                  random subset (smoke test)\n" +
          "  --concurrency <N>             HEAD concurrency (default 32)\n" +
          "  --check-unshrunk              also fail on variantWidths===null\n" +
          "  --warn                        exit 0 even when files missing\n",
      );
      process.exit(0);
    } else if (a.startsWith("--")) {
      console.error(`verify-r2: unknown flag ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function encodePath(segments) {
  return segments.map(encodeURIComponent).join("/");
}

// Mirror src/lib/utils.ts's variantPath() — same basename rule, same
// path shape. If those diverge this script verifies the wrong URL.
function variantKey(objectKey, width, ext) {
  const lastSlash = objectKey.lastIndexOf("/");
  const dir = objectKey.slice(0, lastSlash);
  const filename = objectKey.slice(lastSlash + 1);
  const basename = filename.replace(/\.[^.]+$/, "");
  return [...dir.split("/"), basename, `${width}.${ext}`].join("/");
}

function expectedKeysFor(artwork) {
  const keys = [];
  const widths = artwork.variantWidths;
  if (!widths || widths.length === 0) return keys;
  for (const w of widths) keys.push(variantKey(artwork.objectKey, w, "avif"));
  // The 1280.webp is always emitted by shrink-sources, even though it
  // isn't surfaced in artwork.variantWidths (those track AVIF widths).
  keys.push(variantKey(artwork.objectKey, WEBP_WIDTH, "webp"));
  return keys;
}

async function headOne(base, key, attempt = 0) {
  const url = `${base}/${encodePath(key.split("/"))}`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return { key, ok: true };
    // Transient 5xx — retry once. 4xx is terminal.
    if (res.status >= 500 && attempt === 0) {
      return headOne(base, key, attempt + 1);
    }
    return { key, ok: false, status: res.status };
  } catch (err) {
    if (attempt === 0) return headOne(base, key, attempt + 1);
    return { key, ok: false, error: err.message };
  }
}

async function runConcurrent(items, fn, concurrency, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
      done++;
      if (onProgress && done % 200 === 0) onProgress(done, items.length);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function listR2Bulk() {
  const required = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ASSETS_BUCKET"];
  for (const v of required) {
    if (!process.env[v]) {
      console.error(`verify-r2: --bulk needs ${v}; missing from environment.`);
      process.exit(2);
    }
  }
  // rclone in docker mirrors the sync-assets.sh setup so the verify
  // and sync paths can't drift on rclone version or backend config.
  const dockerCheck = spawnSync("docker", ["--version"], { stdio: "ignore" });
  if (dockerCheck.status !== 0) {
    console.error("verify-r2: --bulk needs docker on PATH.");
    process.exit(2);
  }
  console.error("[verify-r2] listing R2 bucket via rclone…");
  const res = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      "RCLONE_S3_PROVIDER=Cloudflare",
      "-e",
      `RCLONE_S3_ENDPOINT=${process.env.R2_ENDPOINT}`,
      "-e",
      `RCLONE_S3_ACCESS_KEY_ID=${process.env.R2_ACCESS_KEY_ID}`,
      "-e",
      `RCLONE_S3_SECRET_ACCESS_KEY=${process.env.R2_SECRET_ACCESS_KEY}`,
      "rclone/rclone:latest",
      "lsf",
      "--recursive",
      "--files-only",
      `:s3:${process.env.R2_ASSETS_BUCKET}`,
    ],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    console.error("verify-r2: rclone lsf failed:");
    console.error(res.stderr);
    process.exit(2);
  }
  const set = new Set(res.stdout.split("\n").filter(Boolean));
  console.error(`[verify-r2] R2 contains ${set.size} keys`);
  return set;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = JSON.parse(readFileSync(path.join(ROOT, "src/data/artworks.json"), "utf8"));

  // Pre-flight: unshrunk-catalogue check. variantWidths===null means
  // an artwork made it through build-data without any AVIF variants
  // resolved — the exact failure mode that caused the "Scorn" 404
  // class. Surface it regardless of --check-unshrunk; only the exit
  // code is gated by the flag.
  const unshrunk = data.filter((a) => !a.variantWidths || a.variantWidths.length === 0);
  if (unshrunk.length > 0) {
    console.error(`[verify-r2] ${unshrunk.length} artwork(s) have no variantWidths:`);
    for (const a of unshrunk.slice(0, 20)) console.error(`  - ${a.objectKey}`);
    if (unshrunk.length > 20) console.error(`  … and ${unshrunk.length - 20} more`);
  }

  let artworks = data;
  if (args.sample && args.sample > 0 && args.sample < data.length) {
    // Deterministic sampling: pick evenly spaced indices so the
    // smoke test covers the catalogue alphabetically/structurally
    // rather than clustering on one folder. Avoids the variance of
    // random sampling across CI re-runs.
    const step = Math.floor(data.length / args.sample);
    artworks = Array.from({ length: args.sample }, (_, i) => data[i * step]);
  }

  const allKeys = [];
  for (const a of artworks) for (const k of expectedKeysFor(a)) allKeys.push(k);
  console.error(
    `[verify-r2] checking ${allKeys.length} variant keys across ${artworks.length} artworks (base=${args.base})`,
  );

  let missing = [];
  if (args.bulk) {
    const present = listR2Bulk();
    for (const k of allKeys) if (!present.has(k)) missing.push({ key: k, status: "absent" });
  } else {
    const results = await runConcurrent(
      allKeys,
      (k) => headOne(args.base, k),
      args.concurrency,
      (done, total) => console.error(`[verify-r2] ${done}/${total}`),
    );
    missing = results.filter((r) => !r.ok);
  }

  if (missing.length === 0 && unshrunk.length === 0) {
    console.log(`[verify-r2] OK — ${allKeys.length} variants verified`);
    process.exit(0);
  }

  if (missing.length > 0) {
    console.error(`[verify-r2] ${missing.length} variant(s) missing:`);
    for (const m of missing.slice(0, 50)) {
      console.error(`  - ${m.key}${m.status ? ` (${m.status})` : ""}${m.error ? ` (${m.error})` : ""}`);
    }
    if (missing.length > 50) console.error(`  … and ${missing.length - 50} more`);
  }

  const fail = (missing.length > 0 || (args.checkUnshrunk && unshrunk.length > 0)) && !args.warn;
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("verify-r2: fatal:", err);
  process.exit(2);
});
