#!/usr/bin/env node

// Take screenshots of the 2D site for the README and the GitHub page:
// a colour page of the catalogue and a work's own page, on a desktop
// and on a phone. The 3D museum has its own script
// (build-museum-screenshots.mjs), which needs a dev server for its
// camera poses; these pages need none, so the default is the live site,
// read-only.
//
// The pages chosen are the ones that look the same on every visit: the
// home page shuffles its grid, a colour page sorts by colour strength.
//
// Outputs:
//   docs/marketing/screenshots/collection-of-beauty-site-*.jpg
//
// Run (uses Playwright's cached headless shell when there is one, else
// Google Chrome):
//   pnpm marketing:site-screenshots
//   pnpm marketing:site-screenshots --base http://127.0.0.1:52011
//   pnpm marketing:site-screenshots --only colours-blue
// then `pnpm marketing:manifest`.

import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "docs", "marketing", "screenshots");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const BASE_URL = (arg("--base") ?? "https://collectionofbeauty.com").replace(/\/$/, "");
const ONLY = arg("--only")?.split(",");

const DESKTOP = { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

export const SHOTS = [
  {
    slug: "colours-blue",
    path: "/colours/blue",
    device: DESKTOP,
    alt: "Collection of Beauty, the Blue colour page: a colour wheel with 513 works and a grid of blue paintings and prints, The Starry Night among them.",
  },
  {
    slug: "artwork",
    path: "/artwork/collection-of-beauty-1665-girl-with-a-pearl-earring",
    device: DESKTOP,
    alt: "Collection of Beauty, the page of Vermeer's Girl with a Pearl Earring: the painting, its description, its size, a download button for the 12,285 × 14,550 px file and a credit line.",
  },
  {
    slug: "artwork-phone",
    path: "/artwork/collection-of-beauty-1665-girl-with-a-pearl-earring",
    device: PHONE,
    alt: "Collection of Beauty on a phone: the page of Vermeer's Girl with a Pearl Earring, the painting above its title, artist and date.",
  },
];

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
  if (executablePath && existsSync(executablePath)) {
    return chromium.launch({ executablePath, headless: true });
  }
  return chromium.launch({ channel: "chrome", headless: true });
}

/** Wait until every image in the viewport has decoded. */
async function imagesInView(page) {
  await page.waitForFunction(
    () =>
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return r.bottom > 0 && r.top < innerHeight && r.width > 0;
        })
        .every((img) => img.complete && img.naturalWidth > 0),
    undefined,
    { timeout: 30_000 },
  );
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launch();
  try {
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.slug)) continue;
      const context = await browser.newContext({ ...shot.device, colorScheme: "light" });
      // Keep the capture out of the site's analytics and error reports.
      await context.route(/plausible|cloudflareinsights|glitchtip|sentry/, (route) =>
        route.abort(),
      );
      const page = await context.newPage();
      await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "networkidle" });
      await imagesInView(page);
      // Let the ThumbHash previews finish their fade to the pixels.
      await page.waitForTimeout(1200);
      const png = await page.screenshot({ type: "png" });
      const file = path.join(OUT_DIR, `collection-of-beauty-site-${shot.slug}.jpg`);
      await sharp(png).jpeg({ quality: 80, mozjpeg: true }).toFile(file);
      const meta = await sharp(file).metadata();
      console.log(`${path.relative(ROOT, file)}  ${meta.width}x${meta.height}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
