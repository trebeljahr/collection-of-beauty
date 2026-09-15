#!/usr/bin/env node

// Take the press screenshots of the 3D museum by walking a headless Chrome
// through the live site, the way a visitor would: click Enter, teleport
// with the floor keys, walk with WASD, turn with the mouse, zoom with F.
//
// Headless Chrome refuses the Pointer Lock API, and the museum only turns
// the camera while the canvas holds the lock. The init script below stands
// in for the API, so the page's own PointerLockControls read the synthetic
// mouse moves. Nothing in the app changes for the capture.
//
// Shots are scripted as key presses and mouse deltas, not camera
// coordinates, so a change to the floor plan can move them. Walking is
// timed, so the framing also shifts a little between runs. Look at the
// output after every run and adjust SHOTS if a painting is cut.
//
// Outputs:
//   public/marketing/collection-of-beauty-museum-*.jpg
//   src/data/press-screenshots.json   manifest read by /press
//
// Run (needs Google Chrome installed; a GPU makes it much faster):
//   pnpm marketing:screenshots                       # against production
//   pnpm marketing:screenshots --base http://localhost:3547
// then `pnpm marketing:press-kit-zip`.

import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, "public", "marketing");
const OUT_MANIFEST = path.join(ROOT, "src", "data", "press-screenshots.json");
const FILE_PREFIX = "collection-of-beauty-museum-";

const baseArg = process.argv.indexOf("--base");
const BASE_URL = baseArg > 0 ? process.argv[baseArg + 1] : "https://collectionofbeauty.com";

// Rendered at 2x and scaled down: the downscale smooths the frame edges and
// the hairline label text, and the LOD controller loads sharper textures
// for the larger drawing buffer.
const VIEWPORT = { width: 1920, height: 1080 };
const SCALE = 2;
const OUTPUT = { width: 2560, height: 1440 };

// three-stdlib's PointerLockControls turns 0.002 rad per pixel of movementX.
const PX_PER_DEGREE = Math.PI / 180 / 0.002;
const deg = (d) => Math.round(d * PX_PER_DEGREE);

// Walk into the wall opposite the floor's anchor view, then step back about
// a metre. Every wall shot starts from there, so the angle alone decides
// how far along the wall the view runs.
const TO_WALL = [{ turn: 180 }, { hold: "KeyW", ms: 4000 }, { hold: "KeyS", ms: 250 }];

const SHOTS = [
  {
    // First, before any teleport: the entry point is the ground-floor
    // stairwell, facing the spiral.
    slug: "stairwell",
    label: "Spiral staircase",
    subject: "the spiral staircase that joins the floors, seen from the ground floor",
    steps: [{ hold: "KeyW", ms: 2800 }, { pitch: 8 }],
  },
  {
    slug: "baroque",
    label: "Baroque floor",
    subject: "Baroque paintings hung at their real size along a gallery wall, each with a label",
    floorKey: 3,
    steps: [...TO_WALL, { turn: 20 }, { zoom: true }],
  },
  {
    slug: "natural-history",
    label: "Natural history floor",
    subject: "Audubon's bird plates in pale mounts along a gallery wall",
    floorKey: 6,
    steps: [...TO_WALL, { turn: 60 }, { zoom: true }],
  },
  {
    slug: "east-asian",
    label: "East Asian painting floor",
    subject: "Japanese woodblock prints along a gallery wall, with their labels",
    floorKey: 8,
    steps: [...TO_WALL, { turn: 55 }, { zoom: true }],
  },
  {
    slug: "impressionism",
    label: "Impressionism floor",
    subject: "Impressionist landscapes and portraits along a gallery wall",
    floorKey: 9,
    steps: [...TO_WALL, { turn: 12 }, { zoom: true }],
  },
];

// Stand-in for the Pointer Lock API (see the header). Fullscreen is stubbed
// for the same reason: the Enter click asks for it and headless says no.
function fakePointerLock() {
  const setLock = (el) => {
    Object.defineProperty(Document.prototype, "pointerLockElement", {
      configurable: true,
      get: () => el,
    });
    setTimeout(() => document.dispatchEvent(new Event("pointerlockchange")), 0);
  };
  Element.prototype.requestPointerLock = function () {
    setLock(this);
    return Promise.resolve();
  };
  Document.prototype.exitPointerLock = () => setLock(null);
  Element.prototype.requestFullscreen = () => Promise.resolve();
}

/** Resolve once no image request has been open for `quietMs`. */
function trackImages(page) {
  let open = 0;
  let lastChange = Date.now();
  const isImage = (req) =>
    req.resourceType() === "image" || /\.(avif|webp|jpe?g|png)(\?|$)/.test(req.url());
  const bump = (d) => (req) => {
    if (!isImage(req)) return;
    open += d;
    lastChange = Date.now();
  };
  page.on("request", bump(1));
  page.on("requestfinished", bump(-1));
  page.on("requestfailed", bump(-1));
  return async function settled({ quietMs = 2500, minMs = 3000, maxMs = 20000 } = {}) {
    const start = Date.now();
    await page.waitForTimeout(minMs);
    while (Date.now() - start < maxMs) {
      if (open <= 0 && Date.now() - lastChange >= quietMs) return;
      await page.waitForTimeout(250);
    }
    console.warn(`  textures still loading after ${maxMs / 1000}s, taking the shot anyway`);
  };
}

async function main() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  // Keep the capture out of the site's analytics.
  await page.route(/plausible/, (route) => route.abort());
  await page.addInitScript(fakePointerLock);
  const settled = trackImages(page);

  console.log(`opening ${BASE_URL}/gallery-3d`);
  await page.goto(`${BASE_URL}/gallery-3d`, { waitUntil: "domcontentloaded" });
  const enter = page.getByRole("button", { name: /^Enter/ });
  await enter.waitFor({ timeout: 180_000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => /^Enter/.test(b.textContent.trim()) && !b.disabled,
      ),
    null,
    { timeout: 180_000 },
  );
  await enter.click();
  await page.waitForTimeout(1500);

  // Everything layered over the canvas is HUD: minimap, key hints, room
  // card, settings button.
  await page.addStyleTag({
    content: ".gallery-canvas-host ~ * { visibility: hidden !important; }",
  });
  // The look controls mount only after Enter, and remount on some state
  // changes, so they can miss the lock event. Asking again re-sends it.
  const relock = async () => {
    await page.evaluate(() =>
      document.querySelector(".gallery-canvas-host canvas")?.requestPointerLock(),
    );
    await page.waitForTimeout(300);
  };
  const turn = (dx, dy) =>
    page.evaluate(
      ([x, y]) =>
        document.dispatchEvent(new MouseEvent("mousemove", { movementX: x, movementY: y })),
      [dx, dy],
    );
  const floorTitle = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll("div, p, span")) {
        const m = el.childElementCount === 0 && el.textContent.match(/^Floor \d+ · (.+)$/);
        if (m) return m[1].trim();
      }
      return null;
    });

  await mkdir(OUT_DIR, { recursive: true });
  for (const name of await readdir(OUT_DIR)) {
    if (name.startsWith(FILE_PREFIX)) await rm(path.join(OUT_DIR, name));
  }

  const screenshots = [];
  let zoomed = false;
  for (const shot of SHOTS) {
    if (zoomed) {
      await page.keyboard.press("KeyF");
      zoomed = false;
    }
    if (shot.floorKey) {
      await page.keyboard.press(`Digit${shot.floorKey}`);
      await page.waitForTimeout(800);
    }
    await relock();
    for (const step of shot.steps) {
      if (step.turn) await turn(deg(step.turn), 0);
      if (step.pitch) await turn(0, -deg(step.pitch));
      if (step.hold) {
        await page.keyboard.down(step.hold);
        await page.waitForTimeout(step.ms);
        await page.keyboard.up(step.hold);
      }
      if (step.zoom !== undefined && step.zoom !== zoomed) {
        await page.keyboard.press("KeyF");
        zoomed = step.zoom;
      }
    }
    await settled();
    const floor = await floorTitle();

    const file = `${FILE_PREFIX}${shot.slug}.jpg`;
    const outPath = path.join(OUT_DIR, file);
    const png = await page.screenshot({ type: "png" });
    await sharp(png)
      .resize(OUTPUT.width, OUTPUT.height)
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toFile(outPath);
    screenshots.push({
      slug: shot.slug,
      label: shot.label,
      floor,
      href: `/marketing/${file}`,
      width: OUTPUT.width,
      height: OUTPUT.height,
      bytes: (await stat(outPath)).size,
      alt: `Collection of Beauty 3D museum${floor ? `, ${floor} floor` : ""}: ${shot.subject}.`,
    });
    console.log(`[${shot.slug}] ${file}${floor ? ` (${floor})` : ""}`);
  }
  await browser.close();

  const manifest = {
    // Month, not day: the page says when the museum looked like this.
    capturedAt: new Date().toISOString().slice(0, 7),
    source: BASE_URL,
    screenshots,
  };
  await writeFile(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT_MANIFEST)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
