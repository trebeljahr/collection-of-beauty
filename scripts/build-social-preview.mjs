#!/usr/bin/env node

// Render the GitHub social preview card (1280 x 640) in its three
// variants from docs/marketing/social-preview/template.html.
//
// The template reads the museum screenshots from public/marketing/ and
// the works from the asset origin. When `assets-web/` is on disk (this
// checkout or the main one), the works are served from it instead, so a
// render needs no network for them.
//
// GitHub wants the card under 1 MB. A render over that is saved as a
// 256-colour PNG.
//
// Outputs:
//   docs/marketing/social-preview/social-preview-{a,b,c}.png
//   <dir>/review-sheet.jpg and the three PNGs, with --review <dir>
//
// Run:
//   pnpm marketing:social-preview
//   pnpm marketing:social-preview --review /path/to/folder
// then `pnpm marketing:manifest`.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "docs", "marketing", "social-preview");
const TEMPLATE = path.join(DIR, "template.html");
const ASSET_ORIGIN = "https://assets.collectionofbeauty.com/";
const LOCAL_ASSETS = path.join(ROOT, "assets-web");
const FALLBACK_ASSETS = "/Users/rico/projects/collection-of-beauty/assets-web";
const ASSETS_WEB = [LOCAL_ASSETS, FALLBACK_ASSETS].find((dir) => existsSync(dir));
const MAX_BYTES = 1_000_000;

export const VARIANTS = [
  { id: "a", label: "A", what: "Light. The Grand Salon of the 3D museum beside the title." },
  { id: "b", label: "B", what: "Light. The title over a row of five whole works." },
  { id: "c", label: "C", what: "Dark. Three views of the 3D museum over the title." },
];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const REVIEW_DIR = arg("--review");

/** Same launcher as build-museum-screenshots.mjs. */
async function launch() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const shells = existsSync(cache)
    ? (await readdir(cache)).filter((d) => d.startsWith("chromium_headless_shell-")).sort()
    : [];
  const shell = shells.at(-1);
  const executablePath = shell
    ? path.join(cache, shell, "chrome-headless-shell-mac-arm64", "chrome-headless-shell")
    : undefined;
  // File URLs may read their own folder's neighbours only with this.
  const args = ["--allow-file-access-from-files"];
  if (executablePath && existsSync(executablePath)) {
    return chromium.launch({ executablePath, headless: true, args });
  }
  return chromium.launch({ channel: "chrome", headless: true, args });
}

/** Serve a work from assets-web/ when the file is there. */
async function serveLocalWorks(page) {
  if (!ASSETS_WEB) return;
  await page.route(`${ASSET_ORIGIN}**`, async (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    // Commons filenames reach the disk both NFC- and NFD-normalised.
    for (const form of [rel, rel.normalize("NFC"), rel.normalize("NFD")]) {
      const file = path.join(ASSETS_WEB, form);
      if (existsSync(file)) {
        return route.fulfill({ body: await readFile(file), contentType: "image/avif" });
      }
    }
    return route.continue();
  });
}

async function encode(png) {
  const full = await sharp(png).png({ compressionLevel: 9, effort: 10 }).toBuffer();
  if (full.length <= MAX_BYTES) return full;
  return sharp(png)
    .png({
      palette: true,
      colours: 256,
      quality: 100,
      dither: 0.6,
      compressionLevel: 9,
      effort: 10,
    })
    .toBuffer();
}

async function reviewSheet(files, out) {
  const W = 1280;
  const H = 640;
  const pad = 48;
  const labelH = 72;
  const sheetW = pad + VARIANTS.length * (W + pad);
  const sheetH = pad + labelH + H + pad;
  const composites = [];
  for (const [i, variant] of VARIANTS.entries()) {
    const x = pad + i * (W + pad);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${labelH}">` +
        `<text x="0" y="48" font-family="Georgia" font-size="44" font-weight="bold" fill="#1a1208">${variant.label}</text>` +
        `<text x="56" y="48" font-family="Georgia" font-size="30" fill="#3a2a16">${variant.what}</text>` +
        "</svg>",
    );
    composites.push({ input: label, left: x, top: pad });
    composites.push({ input: files[i], left: x, top: pad + labelH });
  }
  // sharp resizes before it composites, so the sheet is built first.
  const sheet = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: "#e8e2d6" },
  })
    .composite(composites)
    .png()
    .toBuffer();
  await sharp(sheet)
    .resize({ width: Math.round(sheetW / 2) })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(out);
}

async function main() {
  const browser = await launch();
  const outputs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
    await serveLocalWorks(page);
    for (const variant of VARIANTS) {
      const url = `${pathToFileURL(TEMPLATE).href}?v=${variant.id}`;
      await page.goto(url, { waitUntil: "load" });
      await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
      const shot = await page.locator(`#${variant.id}`).screenshot({ type: "png" });
      const file = path.join(DIR, `social-preview-${variant.id}.png`);
      await sharp(await encode(shot)).toFile(file);
      const { size } = await stat(file);
      if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes, over GitHub's 1 MB`);
      console.log(`${path.relative(ROOT, file)}  1280x640  ${Math.round(size / 1024)} KB`);
      outputs.push(file);
    }
  } finally {
    await browser.close();
  }

  if (REVIEW_DIR) {
    await mkdir(REVIEW_DIR, { recursive: true });
    for (const file of outputs) await copyFile(file, path.join(REVIEW_DIR, path.basename(file)));
    const sheet = path.join(REVIEW_DIR, "review-sheet.jpg");
    await reviewSheet(outputs, sheet);
    console.log(sheet);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
