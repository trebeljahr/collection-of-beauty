#!/usr/bin/env node

// Write docs/marketing/manifest.json: every marketing image of the repo
// with its size, bytes, SHA-256, the script that makes it and what it is
// for. The images stay where their scripts write them:
//
//   public/marketing/                 press images and museum screenshots
//                                     (served by the site, zipped by
//                                     build-press-kit-zip.mjs)
//   docs/marketing/screenshots/       screenshots of the 2D site
//   docs/marketing/social-preview/    the GitHub social preview card options
//
// Run after any of the marketing scripts:
//   pnpm marketing:manifest

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { VARIANTS } from "./build-social-preview.mjs";
import { SHOTS } from "./capture-site-screenshots.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "marketing", "manifest.json");

async function json(rel) {
  return JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
}

async function describe(rel, extra) {
  const buf = await readFile(path.join(ROOT, rel));
  const { width, height } = await sharp(buf).metadata();
  return {
    path: rel,
    width,
    height,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    ...extra,
  };
}

async function main() {
  const pressImages = await json("src/data/press-images.json");
  const pressShots = await json("src/data/press-screenshots.json");
  const files = [];

  for (const img of pressImages.images) {
    for (const href of [img.href, img.large.href]) {
      files.push(
        await describe(`public${href}`, {
          kind: "press-image",
          purpose: img.use,
          madeBy: "scripts/build-marketing-images.mjs (pnpm marketing:images)",
          source: "Whole public-domain works from the catalogue; see public/marketing/credits.txt",
          alt: img.alt,
        }),
      );
    }
  }

  for (const shot of pressShots.screenshots) {
    for (const href of [shot.href, shot.large.href]) {
      files.push(
        await describe(`public${href}`, {
          kind: "museum-screenshot",
          purpose: `3D museum: ${shot.label}${shot.floor ? `, ${shot.floor} floor` : ""}`,
          madeBy: "scripts/build-museum-screenshots.mjs (pnpm marketing:screenshots)",
          source: `${pressShots.source}, captured ${pressShots.capturedAt}`,
          alt: shot.alt,
        }),
      );
    }
  }

  const shotsDir = "docs/marketing/screenshots";
  const onDisk = new Set(await readdir(path.join(ROOT, shotsDir)));
  for (const shot of SHOTS) {
    const name = `collection-of-beauty-site-${shot.slug}.jpg`;
    if (!onDisk.has(name)) continue;
    files.push(
      await describe(`${shotsDir}/${name}`, {
        kind: "site-screenshot",
        purpose: `README and repository page: ${shot.path}`,
        madeBy: "scripts/capture-site-screenshots.mjs (pnpm marketing:site-screenshots)",
        source: `https://collectionofbeauty.com${shot.path}, ${shot.device.viewport.width}x${shot.device.viewport.height} CSS px at ${shot.device.deviceScaleFactor}x`,
        alt: shot.alt,
      }),
    );
  }

  for (const variant of VARIANTS) {
    files.push(
      await describe(`docs/marketing/social-preview/social-preview-${variant.id}.png`, {
        kind: "social-preview",
        purpose: `GitHub social preview, option ${variant.label}: ${variant.what}`,
        madeBy: "scripts/build-social-preview.mjs (pnpm marketing:social-preview)",
        source:
          "The press images' design at 2:1 (SOCIAL_PREVIEW_FORMATS in scripts/build-marketing-images.mjs); works named in docs/marketing/social-preview/credits.txt",
      }),
    );
  }

  const manifest = {
    note: "Written by scripts/build-marketing-manifest.mjs. Do not edit by hand.",
    files,
  };
  await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${path.relative(ROOT, OUT)}: ${files.length} files`);
}

await main();
