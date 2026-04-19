#!/usr/bin/env node
// Pre-warm the Next.js image optimization cache by crawling every
// artwork × every breakpoint width we care about. First hit populates
// /app/.next/cache/images/; subsequent hits (real users, deployed
// prod) then serve from cache with near-zero CPU.
//
// Usage:
//   pnpm prewarm                     # defaults: localhost:3547, all sizes
//   BASE_URL=https://cob.example.com pnpm prewarm
//   WIDTHS=640,1280 pnpm prewarm
//
// Safe to re-run; already-cached variants return in a few ms.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BASE_URL = process.env.BASE_URL || "http://localhost:3547";
const ASSETS_ORIGIN = process.env.ASSETS_ORIGIN_URL || "http://localhost:9100";
const WIDTHS = (process.env.WIDTHS || "480,640,960,1280")
  .split(",")
  .map((n) => parseInt(n, 10))
  .filter(Boolean);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "8", 10);
const QUALITY = 75;

const artworks = JSON.parse(
  await readFile(path.join(ROOT, "src", "data", "artworks.json"), "utf8"),
);

const jobs = [];
for (const a of artworks) {
  if (!a.objectKey) continue;
  const origin = `${ASSETS_ORIGIN}/${a.objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  for (const w of WIDTHS) {
    const url = `${BASE_URL}/_next/image?url=${encodeURIComponent(origin)}&w=${w}&q=${QUALITY}`;
    jobs.push({ url, title: `${a.objectKey}@${w}` });
  }
}

console.log(
  `[prewarm] ${artworks.length} artworks × ${WIDTHS.length} widths = ${jobs.length} requests`,
);

let done = 0;
let failed = 0;
let cached = 0;

async function worker(iter) {
  for (const job of iter) {
    const t0 = Date.now();
    try {
      const res = await fetch(job.url, {
        headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      });
      if (!res.ok) {
        failed++;
      } else {
        // drain body to release connection
        await res.arrayBuffer();
        if (Date.now() - t0 < 80) cached++;
      }
    } catch {
      failed++;
    }
    done++;
    if (done % 50 === 0 || done === jobs.length) {
      process.stdout.write(
        `\r[prewarm] ${done}/${jobs.length}  failed=${failed}  fast(<80ms)=${cached}  `,
      );
    }
  }
}

function* chunk(items) {
  for (const item of items) yield item;
}
const shared = chunk(jobs);
await Promise.all(
  Array.from({ length: CONCURRENCY }, () => worker(shared)),
);

console.log(`\n[prewarm] done: ${done}, failed: ${failed}, fast: ${cached}`);
process.exit(failed > 0 ? 1 : 0);
