#!/usr/bin/env node
// Compose the OG image (1200×630) and a wide hero shot (1920×1080) from a
// curated set of public-domain artworks already shipped in the gallery.
// Each output is a tiled mosaic of paintings on the left and a typographic
// "Collection of Beauty" panel on the right.
//
// Inputs: assets-web/<folder>/<basename>/<width>.avif (built variants).
// Outputs:
//   src/app/opengraph-image.png        — Next.js file-convention OG image
//   public/marketing/hero.png          — 1920×1080 hero for press kit
//   public/marketing/hero.jpg          — JPEG twin for social sharing
//
// Run:
//   node scripts/build-marketing-images.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);

// `assets-web/` is gitignored and only materialized in the main worktree
// (the one that runs `pnpm assets:shrink`). When the script runs from a
// worktree clone, fall back to the canonical project path so we can still
// read the pre-built variants without duplicating the cache.
const LOCAL_ASSETS = path.join(ROOT, "assets-web");
const FALLBACK_ASSETS = "/Users/rico/projects/collection-of-beauty/assets-web";
const ASSETS_WEB = existsSync(LOCAL_ASSETS) ? LOCAL_ASSETS : FALLBACK_ASSETS;
const FONTS_DIR = path.join(ROOT, "scripts", "fonts");
const OUT_APP = path.join(ROOT, "src", "app", "opengraph-image.png");
const OUT_HERO_PNG = path.join(ROOT, "public", "marketing", "hero.png");
const OUT_HERO_JPG = path.join(ROOT, "public", "marketing", "hero.jpg");

// Curated picks. Keys are basenames inside assets-web/<folder>/.
// Order = visual placement order in the mosaic, top-left → bottom-right.
const PICKS_OG = [
  { folder: "collection-of-beauty", base: "Hiroshige-53-Stations-Hoeido-37-Akasaka-MFA-01" },
  { folder: "collection-of-beauty", base: "1665_Girl_with_a_Pearl_Earring" },
  {
    folder: "collection-of-beauty",
    base: "Vincent_van_Gogh_(1853-1890)_Caféterras_bij_nacht_(place_du_Forum)_Kröller-Müller_Museum_Otterlo_23-8-2016_13-35-40",
  },
  { folder: "collection-of-beauty", base: "Boy_with_a_Basket_of_Fruit-Caravaggio_(1593)" },
  {
    folder: "collection-of-beauty",
    base: "Katsushika_Hokusai_(1760-1849),_Ono_waterval_aan_de_Kisokaido_(1835)",
  },
  { folder: "collection-of-beauty", base: "Botticelli_-_A_Virgem_e_o_Menino_com_um_anjo" },
];

const PICKS_HERO = [
  ...PICKS_OG,
  { folder: "collection-of-beauty", base: "The_Rising_Squall,_Hot_Wells,_from_St_Vincent's_Rock,_Bristol)" },
  { folder: "collection-of-beauty", base: "El_Greco_View_of_Toledo" },
  { folder: "audubon-birds", base: "1_Wild_Turkey" },
  { folder: "collection-of-beauty", base: "Caspar_David_Friedrich_-_Das_Kreuz_im_Gebirge" },
  {
    folder: "collection-of-beauty",
    base: "Sandro_Botticelli_-_Idealized_Portrait_of_a_Lady_(Portrait_of_Simonetta_Vespucci_as_Nymph)_-_Google_Art_Project",
  },
  { folder: "collection-of-beauty", base: "John_Singer_Sargent_-_Cancale" },
];

// Pick the smallest variant ≥ targetWidth, fall back to the largest.
function variantPath(pick, targetWidth) {
  const dir = path.join(ASSETS_WEB, pick.folder, pick.base);
  const candidates = [256, 480, 640, 960, 1280, 1920, 2560, 4096];
  for (const w of candidates) {
    if (w >= targetWidth) {
      const p = path.join(dir, `${w}.avif`);
      if (existsSync(p)) return p;
    }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const p = path.join(dir, `${candidates[i]}.avif`);
    if (existsSync(p)) return p;
  }
  throw new Error(`no variant for ${pick.folder}/${pick.base}`);
}

async function tileCell(pick, cellW, cellH) {
  const src = variantPath(pick, Math.max(cellW, cellH) * 1.2);
  return sharp(src)
    .resize({
      width: cellW,
      height: cellH,
      fit: "cover",
      position: "attention",
    })
    .toBuffer();
}

// SVG text panel — anti-aliased and resolution-independent. The image
// composite layer keeps it crisp regardless of output PNG size.
function textPanelSvg({
  width,
  height,
  eyebrow,
  title,
  tagline,
  stats,
  url,
  titleSize,
  taglineSize,
  eyebrowSize,
  metaSize,
}) {
  const padding = Math.round(width * 0.08);
  const innerWidth = width - padding * 2;
  // Center the title block vertically inside the panel.
  const titleLines = title.split("\n");
  const titleLineHeight = Math.round(titleSize * 1.0);
  const titleBlockHeight = titleLineHeight * titleLines.length;
  const eyebrowGap = Math.round(eyebrowSize * 1.8);
  const taglineGap = Math.round(titleSize * 0.55);
  const taglineLineHeight = Math.round(taglineSize * 1.35);
  const taglineLines = wrapText(tagline, Math.floor(innerWidth / (taglineSize * 0.42)));
  const taglineBlockHeight = taglineLineHeight * taglineLines.length;
  const blockHeight = eyebrowGap + titleBlockHeight + taglineGap + taglineBlockHeight;
  const blockTop = Math.round((height - blockHeight) / 2);

  const titleY = blockTop + eyebrowGap + titleSize;
  const taglineY = titleY + titleBlockHeight - titleSize * 0.15 + taglineGap;

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="${padding}" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  const taglineTspans = taglineLines
    .map(
      (line, i) =>
        `<tspan x="${padding}" dy="${i === 0 ? 0 : taglineLineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  const footerY = height - padding;
  const rule = footerY - metaSize * 1.6;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7f3ec"/>
      <stop offset="60%" stop-color="#ece4d4"/>
      <stop offset="100%" stop-color="#d9c9ad"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="${padding}" y="${blockTop + eyebrowSize}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${eyebrowSize}"
        fill="#7a5a2f"
        letter-spacing="${Math.round(eyebrowSize * 0.25)}"
        font-weight="400"
        text-rendering="geometricPrecision">${escapeXml(eyebrow.toUpperCase())}</text>
  <text y="${titleY}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${titleSize}"
        fill="#1a1208"
        font-weight="700"
        letter-spacing="-${Math.round(titleSize * 0.02)}"
        text-rendering="geometricPrecision">${titleTspans}</text>
  <text y="${taglineY}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${taglineSize}"
        fill="#2c1f10"
        font-style="italic"
        text-rendering="geometricPrecision">${taglineTspans}</text>
  <line x1="${padding}" y1="${rule}" x2="${width - padding}" y2="${rule}" stroke="#7a5a2f" stroke-width="2"/>
  <text x="${padding}" y="${footerY}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${metaSize}"
        fill="#3a2a16">${escapeXml(stats)}</text>
  <text x="${width - padding}" y="${footerY}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${metaSize}"
        fill="#7a5a2f"
        text-anchor="end">${escapeXml(url)}</text>
</svg>`;
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function composeOg() {
  const W = 1200;
  const H = 630;
  const mosaicW = 760;
  const textW = W - mosaicW;
  const cols = 3;
  const rows = 2;
  const cellW = Math.floor(mosaicW / cols);
  const cellH = Math.floor(H / rows);

  const composites = [];
  for (let i = 0; i < PICKS_OG.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const buf = await tileCell(PICKS_OG[i], cellW, cellH);
    composites.push({ input: buf, top: r * cellH, left: c * cellW });
  }

  // Subtle inner shadow at the seam between mosaic and text panel.
  const seamSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient></defs>
    <rect width="24" height="${H}" fill="url(#g)"/>
  </svg>`;
  composites.push({ input: Buffer.from(seamSvg), top: 0, left: mosaicW });

  const textSvg = textPanelSvg({
    width: textW,
    height: H,
    eyebrow: "A public-domain gallery",
    title: "Collection\nof Beauty",
    tagline: "A small, slow, hand-curated wing of the commons — with a 3D museum you can walk through.",
    stats: "~2,900 works · ~225 artists",
    url: "beauty.trebeljahr.com",
    titleSize: 72,
    taglineSize: 22,
    eyebrowSize: 16,
    metaSize: 16,
  });
  composites.push({ input: Buffer.from(textSvg), top: 0, left: mosaicW });

  const base = sharp({
    create: { width: W, height: H, channels: 3, background: { r: 247, g: 243, b: 236 } },
  });
  await base.composite(composites).png({ compressionLevel: 9 }).toFile(OUT_APP);
  console.log(`[og] wrote ${OUT_APP} (${W}×${H})`);
}

async function composeHero() {
  const W = 1920;
  const H = 1080;
  const mosaicW = 1280;
  const textW = W - mosaicW;
  const cols = 4;
  const rows = 3;
  const cellW = Math.floor(mosaicW / cols);
  const cellH = Math.floor(H / rows);

  const picks = PICKS_HERO.slice(0, cols * rows);
  const composites = [];
  for (let i = 0; i < picks.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const buf = await tileCell(picks[i], cellW, cellH);
    composites.push({ input: buf, top: r * cellH, left: c * cellW });
  }

  const seamSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,0.3)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient></defs>
    <rect width="32" height="${H}" fill="url(#g)"/>
  </svg>`;
  composites.push({ input: Buffer.from(seamSvg), top: 0, left: mosaicW });

  const textSvg = textPanelSvg({
    width: textW,
    height: H,
    eyebrow: "A public-domain gallery",
    title: "Collection\nof Beauty",
    tagline:
      "A small, slow, hand-curated wing of the commons — with a multi-floor 3D museum you can walk through.",
    stats: "~2,900 works · ~225 artists",
    url: "beauty.trebeljahr.com",
    titleSize: 96,
    taglineSize: 26,
    eyebrowSize: 20,
    metaSize: 18,
  });
  composites.push({ input: Buffer.from(textSvg), top: 0, left: mosaicW });

  await mkdir(path.dirname(OUT_HERO_PNG), { recursive: true });
  const baseHero = sharp({
    create: { width: W, height: H, channels: 3, background: { r: 247, g: 243, b: 236 } },
  });
  const pngBuf = await baseHero.composite(composites).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(OUT_HERO_PNG, pngBuf);
  // JPEG twin for social platforms that prefer it.
  await sharp(pngBuf).jpeg({ quality: 92, mozjpeg: true }).toFile(OUT_HERO_JPG);
  console.log(`[hero] wrote ${OUT_HERO_PNG} + ${OUT_HERO_JPG} (${W}×${H})`);
}

async function main() {
  await composeOg();
  await composeHero();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
