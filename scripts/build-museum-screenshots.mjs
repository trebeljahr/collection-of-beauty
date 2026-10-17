#!/usr/bin/env node

// Take the press screenshots of the 3D museum in a headless Chrome: click
// Enter, jump to a floor with its digit key, put the camera on a fixed
// pose, wait for the textures, take the shot.
//
// The poses are world coordinates on the block plan (layout-block.ts), so
// a shot frames the same works on every run. They are set through
// `window.__galleryCamera`, which the museum exposes only with `?debug` on
// a development build (debug-overlay.tsx). So the script runs against a
// dev server, not production. A change to the plan or the hang can move a
// work off its pose: look at the output after every run, and read new
// coordinates from `museumLayout` (src/lib/gallery-layout/precomputed.ts)
// with a tsx script.
//
// Headless Chrome refuses the Pointer Lock API, and the museum only takes
// Enter once the canvas holds the lock. The init script below stands in
// for the API. Nothing in the app changes for the capture.
//
// Outputs:
//   public/marketing/collection-of-beauty-museum-*.jpg (+ *-large.jpg)
//   src/data/press-screenshots.json   manifest read by /press
//
// Run (a GPU makes it much faster; uses Playwright's cached headless
// shell when there is one, else Google Chrome):
//   pnpm marketing:screenshots                          # main's dev server on :3547
//   pnpm marketing:screenshots --base http://localhost:4000
//   pnpm marketing:screenshots --only salon,court       # retake a few
//   pnpm marketing:screenshots --only court --out /tmp/x  # preview, no manifest
// then `pnpm marketing:press-kit-zip`.

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_ARG = process.argv.indexOf("--out");
// `--out <dir>` writes the shots there and leaves the manifest alone: a
// preview, or the two sides of a before/after.
const PREVIEW_DIR = OUT_ARG > 0 ? path.resolve(process.argv[OUT_ARG + 1]) : undefined;
const OUT_DIR = PREVIEW_DIR ?? path.join(ROOT, "public", "marketing");
const OUT_MANIFEST = path.join(ROOT, "src", "data", "press-screenshots.json");
const FILE_PREFIX = "collection-of-beauty-museum-";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const BASE_URL = arg("--base") ?? "http://localhost:3547";
const ONLY = arg("--only")?.split(",");

// Rendered at 2x, the most the museum's canvas allows (dpr={[1, 2]} in
// gallery-3d/index.tsx), so one frame yields a native 5120x2880 large file
// and a 2560x1440 one scaled down from it, which also smooths frame edges
// and label text. The bigger drawing buffer makes the LOD controller load
// sharper painting textures too.
const VIEWPORT = { width: 2560, height: 1440 };
const SCALE = 2;
const OUTPUT = { width: 2560, height: 1440 };
const OUTPUT_LARGE = { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE };

const STOREY = 8.7; // FLOOR_SEPARATION in world-coords.ts
const EYE = 1.75; // EYE_HEIGHT in player.tsx

// Each shot: the floor (0-based, the digit key is floor + 1), where the
// eye stands ([x, z], at eye height over that floor) and the point it
// looks at ([x, y over that floor, z]). Coordinates are the block plan's,
// read from museumLayout on 17 October 2026.
const ALL_SHOTS = [
  {
    // Where a visit starts: the court's first floor, looking north past
    // two of its bench islands to the Jordaens and the School of Athens,
    // with the galleries of the three floors above.
    slug: "court",
    label: "Central court",
    subject:
      "the central court, open through all four floors, with the largest paintings of the floor hung at their real size",
    floor: 0,
    eye: [58.75, 43.2],
    look: [58.75, 6.2, 17.6],
  },
  {
    // The imperial stair of the west stair hall, from its lobby, with
    // Veronese's Feast in the House of Levi (13 m) on the end wall over
    // the half landing.
    slug: "stair-hall",
    label: "Grand staircase",
    subject:
      "the grand staircase of the west stair hall, with Veronese's Feast in the House of Levi on the wall over its landing",
    floor: 0,
    eye: [26.6, 31.25],
    look: [7.5, 6.4, 31.25],
  },
  {
    // The salon beyond the south front: the Last Judgment on its far wall
    // under the glazed dome, two storeys and a bit high.
    slug: "salon",
    label: "Grand salon",
    subject:
      "the Grand Salon, two storeys high, with Michelangelo's Last Judgment at its real size on the far wall",
    floor: 0,
    eye: [58.75, 64.2],
    look: [58.75, 7.6, 99.9],
  },
  {
    // The Mona Lisa alone on a door screen, with its bench in front.
    slug: "mona-lisa",
    label: "Italian Renaissance gallery",
    subject: "the Mona Lisa hung alone on a free-standing wall, with a bench in front of it",
    floor: 0,
    eye: [32.9, 8.6],
    look: [36.25, 1.5, 14.8],
  },
  {
    // A gallery of the Dutch Golden Age and Spain: Las Meninas on the long
    // south wall, between two rows of free-standing panels, with the bench
    // that faces it.
    slug: "baroque",
    label: "Baroque gallery",
    subject: "a Baroque gallery, with a bench in front of Velázquez's Las Meninas at its real size",
    floor: 0,
    eye: [81.25, 51.5],
    look: [81.25, 2.2, 62.4],
  },
  {
    // The spiral stair that runs through all four floors, from the far
    // corner of its room by the salon's door.
    slug: "spiral",
    label: "Spiral staircase",
    subject: "the spiral staircase that runs through all four floors, seen from the first floor",
    floor: 0,
    eye: [48.6, 61.6],
    look: [58.75, 3.8, 53.75],
  },
  {
    // Monet's water garden: the Two Willows, 17 m long, across the north
    // wall of the artist's room of the third floor.
    slug: "water-garden",
    label: "Monet's water garden",
    subject: "Monet's Water Lilies panels, among them the 17 m Two Willows, in a room of their own",
    floor: 2,
    eye: [58.75, 15.6],
    look: [58.75, 2.6, 0.1],
  },
  {
    // Hokusai's room on the top floor, from its west door down the aisle
    // between two rows of panels, Red Fuji on the nearest.
    slug: "hokusai",
    label: "Hokusai room",
    subject: "the Hokusai room, with his views of Mount Fuji on free-standing panels",
    floor: 3,
    eye: [48.6, 8.75],
    look: [64.0, 1.7, 10.8],
  },
  {
    // Audubon's room of the natural history wing, from its south side.
    slug: "natural-history",
    label: "Audubon room",
    subject: "Audubon's bird plates from The Birds of America in pale mounts",
    floor: 3,
    eye: [36.25, 43.6],
    look: [36.25, 1.8, 20.0],
  },
];
const SHOTS = ALL_SHOTS.filter((shot) => !ONLY || ONLY.includes(shot.slug));

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
  return async function settled({ quietMs = 3000, minMs = 4000, maxMs = 60000 } = {}) {
    const start = Date.now();
    await page.waitForTimeout(minMs);
    while (Date.now() - start < maxMs) {
      if (open <= 0 && Date.now() - lastChange >= quietMs) return;
      await page.waitForTimeout(250);
    }
    console.warn(`  textures still loading after ${maxMs / 1000}s, taking the shot anyway`);
  };
}

/** Playwright's cached headless shell renders WebGL on the GPU through
 *  ANGLE Metal on a Mac. Fall back to an installed Google Chrome. */
async function launch() {
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  const shells = existsSync(cache)
    ? (await readdir(cache)).filter((d) => d.startsWith("chromium_headless_shell-")).sort()
    : [];
  const shell = shells.at(-1);
  const executablePath = shell
    ? path.join(cache, shell, "chrome-headless-shell-mac-arm64", "chrome-headless-shell")
    : undefined;
  const args = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=metal"];
  if (executablePath && existsSync(executablePath)) {
    return chromium.launch({ executablePath, headless: true, args });
  }
  return chromium.launch({ channel: "chrome", headless: true, args });
}

async function main() {
  const browser = await launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  // Keep the capture out of the site's analytics.
  await page.route(/plausible/, (route) => route.abort());
  await page.addInitScript(fakePointerLock);
  const settled = trackImages(page);

  console.log(`opening ${BASE_URL}/gallery-3d?debug`);
  await page.goto(`${BASE_URL}/gallery-3d?debug`, { waitUntil: "domcontentloaded" });
  const enter = page.getByRole("button", { name: /^Enter/ });
  await enter.waitFor({ timeout: 600_000 });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => /^Enter/.test(b.textContent.trim()) && !b.disabled,
      ),
    null,
    { timeout: 600_000, polling: 1000 },
  );
  await enter.click();
  await page.waitForFunction(() => Boolean(window.__galleryCamera), null, { timeout: 60_000 });
  // The floor reflection gives itself up for the visit when frames run
  // slow, and a busy machine trips that in the first seconds. Pin it on
  // before it can.
  await page.evaluate(() => window.__galleryFloorReflection?.(true));
  await page.waitForTimeout(1500);

  // Everything layered over the canvas is HUD: minimap, key hints, room
  // card, music player, debug overlay. `nextjs-portal` is the dev
  // server's own badge in the corner.
  await page.addStyleTag({
    content:
      ".gallery-canvas-host ~ * { visibility: hidden !important; } nextjs-portal { display: none !important; }",
  });
  const floorTitle = () =>
    page.evaluate(() => {
      for (const el of document.querySelectorAll("div, p, span")) {
        // "Floor 1 · Old Masters · Baroque & …": the floor, then the era
        // of the room the visitor is in.
        const m = el.childElementCount === 0 && el.textContent.match(/^Floor \d+ · ([^·]+)/);
        if (m) return m[1].trim();
      }
      return null;
    });
  const pose = (eye, look, floorY) =>
    page.evaluate(
      ([e, l, y, eyeH]) => {
        const cam = window.__galleryCamera;
        cam.position.set(e[0], y + eyeH, e[1]);
        cam.lookAt(l[0], y + l[1], l[2]);
        cam.updateMatrixWorld();
      },
      [eye, look, floorY, EYE],
    );

  await mkdir(OUT_DIR, { recursive: true });
  const screenshots = [];
  let floor = 0;
  for (const shot of SHOTS) {
    if (shot.floor !== floor) {
      await page.keyboard.press(`Digit${shot.floor + 1}`);
      floor = shot.floor;
      await page.waitForTimeout(1500);
    }
    const floorY = shot.floor * STOREY;
    await pose(shot.eye, shot.look, floorY);
    // Textures load for the rooms near the camera, so wait at the pose,
    // then set it again: the player damps the eye back to its height
    // over the floor under it, and the spawn effect can re-aim it.
    await settled();
    await pose(shot.eye, shot.look, floorY);
    await page.waitForTimeout(1500);
    const floorName = await floorTitle();

    const file = `${FILE_PREFIX}${shot.slug}.jpg`;
    const outPath = path.join(OUT_DIR, file);
    const largeFile = `${FILE_PREFIX}${shot.slug}-large.jpg`;
    const largePath = path.join(OUT_DIR, largeFile);
    // A 5120x2880 PNG takes well over Playwright's 30s default to encode.
    const png = await page.screenshot({ type: "png", timeout: 300_000 });
    const jpeg = { quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" };
    await sharp(png).resize(OUTPUT.width, OUTPUT.height).jpeg(jpeg).toFile(outPath);
    await sharp(png).resize(OUTPUT_LARGE.width, OUTPUT_LARGE.height).jpeg(jpeg).toFile(largePath);
    screenshots.push({
      slug: shot.slug,
      label: shot.label,
      floor: floorName,
      href: `/marketing/${file}`,
      width: OUTPUT.width,
      height: OUTPUT.height,
      bytes: (await stat(outPath)).size,
      large: {
        href: `/marketing/${largeFile}`,
        width: OUTPUT_LARGE.width,
        height: OUTPUT_LARGE.height,
        bytes: (await stat(largePath)).size,
      },
      alt: `Collection of Beauty 3D museum${floorName ? `, ${floorName} floor` : ""}: ${shot.subject}.`,
    });
    console.log(`[${shot.slug}] ${file}${floorName ? ` (${floorName})` : ""}`);
  }
  await browser.close();
  if (PREVIEW_DIR) return;

  // A partial run (--only) keeps the other shots of the manifest; a full
  // run replaces it and removes the files of shots no longer listed.
  const previous = existsSync(OUT_MANIFEST)
    ? JSON.parse(await readFile(OUT_MANIFEST, "utf8")).screenshots
    : [];
  const taken = new Set(screenshots.map((s) => s.slug));
  const kept = ONLY ? previous.filter((s) => !taken.has(s.slug)) : [];
  if (!ONLY) {
    const current = new Set(
      screenshots.flatMap((s) => [path.basename(s.href), path.basename(s.large.href)]),
    );
    for (const name of await readdir(OUT_DIR)) {
      if (name.startsWith(FILE_PREFIX) && !current.has(name)) {
        await unlink(path.join(OUT_DIR, name));
      }
    }
  }
  const manifest = {
    // Month, not day: the page says when the museum looked like this.
    capturedAt: new Date().toISOString().slice(0, 7),
    source: "https://collectionofbeauty.com/gallery-3d",
    screenshots: [...kept, ...screenshots].sort(
      (a, b) =>
        ALL_SHOTS.findIndex((s) => s.slug === a.slug) -
        ALL_SHOTS.findIndex((s) => s.slug === b.slug),
    ),
  };
  await writeFile(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${path.relative(ROOT, OUT_MANIFEST)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
