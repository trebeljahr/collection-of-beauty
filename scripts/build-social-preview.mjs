#!/usr/bin/env node

// Render the GitHub social preview card (1280 x 640) in its four options.
// Each is the press images' design at 2:1: the same works hung whole on
// the same walls, the same Georgia title block, laid out by the same code
// (SOCIAL_PREVIEW_FORMATS and renderFormat in build-marketing-images.mjs).
// The counts in the text come from src/data/summary.json at render time.
//
// GitHub wants the card under 1 MB. A render over that is saved as a
// 256-colour PNG.
//
// It also writes two og:image cards, 1200 x 630:
//   og-wordmark.png  the site's link-preview card,
//     public/marketing/collection-of-beauty-og-large.jpg (made by
//     build-marketing-images.mjs), downscaled from 2400 x 1260
//   og-clean.png  that card's design with the title panel gone and the wall
//     widened to the full card. The five works of the link-preview card keep
//     their places on the left (Caravaggio and Botticelli's Venus above;
//     Vermeer, Haeckel and Monet below); Hokusai's wave and Seurat's Grande
//     Jatte continue the two rows to the right edge. Same light wall,
//     margins, gaps, shadow and whole-work justified rows, drawn at 2x.
// Both are downscaled with ImageMagick (`magick`).
//
// Outputs:
//   docs/marketing/social-preview/social-preview-{a,b,c,d}.png
//   docs/marketing/social-preview/og-{wordmark,clean}.png
//   docs/marketing/social-preview/credits.txt   works shown, per card
//   <dir>/review-sheet.jpg and the four PNGs, with --review <dir>
//
// Run:
//   pnpm marketing:social-preview
//   pnpm marketing:social-preview --review /path/to/folder
// then `pnpm marketing:manifest`.

import { execFileSync } from "node:child_process";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  composeFormat,
  displayTitle,
  layoutRows,
  loadCatalogue,
  renderFormat,
  SITE_URL,
  SOCIAL_PREVIEW_FORMATS,
  wallAreaFor,
} from "./build-marketing-images.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(ROOT, "docs", "marketing", "social-preview");
const MAX_BYTES = 1_000_000;

export const VARIANTS = SOCIAL_PREVIEW_FORMATS.map(({ id, slug, what }) => ({
  id,
  slug,
  label: id.toUpperCase(),
  what,
}));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const REVIEW_DIR = arg("--review");

export const OG_CARDS = [
  {
    id: "og-wordmark",
    what: "The link-preview card (public/marketing/collection-of-beauty-og-large.jpg), downscaled.",
  },
  {
    id: "og-clean",
    what: "Works only, no text: the link-preview card's wall widened to the full card.",
  },
];
const OG_CLEAN_ROWS = [
  [
    "collection-of-beauty-boy-with-a-basket-of-fruit-caravaggio-1593",
    "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
    "collection-of-beauty-tsunami-by-hokusai-19th-century",
  ],
  [
    "collection-of-beauty-1665-girl-with-a-pearl-earring",
    "kunstformen-images-haeckel-actiniae",
    "collection-of-beauty-claude-monet-052",
    "collection-of-beauty-a-sunday-on-la-grande-jatte-georges-seurat-1884",
  ],
];

/** Downscale a PNG or JPEG to exactly 1200 x 630 with ImageMagick. */
function toOgSize(input, out) {
  try {
    // No date chunks, so an unchanged card keeps its SHA-256.
    execFileSync(
      "magick",
      [
        typeof input === "string" ? input : "png:-",
        "-resize",
        "1200x630!",
        "-define",
        "png:exclude-chunks=date,time",
        out,
      ],
      typeof input === "string" ? {} : { input },
    );
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error("The og:image cards need ImageMagick: brew install imagemagick");
    throw error;
  }
}

async function renderOgCards({ byId, copy }) {
  toOgSize(
    path.join(ROOT, "public", "marketing", "collection-of-beauty-og-large.jpg"),
    path.join(DIR, "og-wordmark.png"),
  );
  const format = { width: 1200, height: 630, theme: "light", wall: { x: 0, y: 0, w: 1, h: 1 } };
  const { wallArea, gap } = wallAreaFor(format);
  const rows = OG_CLEAN_ROWS.map((ids) =>
    ids.map((id) => {
      const a = byId.get(id);
      if (!a) throw new Error(`og-clean work not in the catalogue: ${id}`);
      return { ...a, aspect: a.width / a.height };
    }),
  );
  const { png } = await composeFormat(format, layoutRows(rows, wallArea, gap), copy, 2);
  toOgSize(png, path.join(DIR, "og-clean.png"));
  for (const { id } of OG_CARDS)
    console.log(`${path.relative(ROOT, path.join(DIR, `${id}.png`))}  1200x630`);
  return rows.flat().map((a) => a.id);
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

/** All options on one sheet, two to a row, each labelled. */
async function reviewSheet(files, out) {
  const W = 1280;
  const H = 640;
  const pad = 48;
  const labelH = 72;
  const cols = 2;
  const rows = Math.ceil(VARIANTS.length / cols);
  const sheetW = pad + cols * (W + pad);
  const sheetH = pad + rows * (labelH + H + pad);
  const composites = [];
  for (const [i, variant] of VARIANTS.entries()) {
    const x = pad + (i % cols) * (W + pad);
    const y = pad + Math.floor(i / cols) * (labelH + H + pad);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${labelH}">` +
        `<text x="0" y="48" font-family="Georgia" font-size="44" font-weight="bold" fill="#1a1208">${variant.label}</text>` +
        `<text x="56" y="48" font-family="Georgia" font-size="28" fill="#3a2a16">${variant.what}</text>` +
        "</svg>",
    );
    composites.push({ input: label, left: x, top: y });
    composites.push({ input: files[i], left: x, top: y + labelH });
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
  const catalogue = await loadCatalogue();
  const { byId } = catalogue;
  const credit = (id) => {
    const a = byId.get(id);
    return `  ${a.artist ?? "Unknown artist"}, ${displayTitle(a)}${a.year ? `, ${a.year}` : ""}. https://${SITE_URL}/artwork/${id}`;
  };
  await mkdir(DIR, { recursive: true });

  const outputs = [];
  const credits = [];
  for (const format of SOCIAL_PREVIEW_FORMATS) {
    const { png, works } = await renderFormat(format, catalogue);
    const file = path.join(DIR, `social-preview-${format.id}.png`);
    await writeFile(file, await encode(png));
    const { size } = await stat(file);
    if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes, over GitHub's 1 MB`);
    console.log(
      `${path.relative(ROOT, file)}  ${format.width}x${format.height}  ${Math.round(size / 1024)} KB  ${works.length} works`,
    );
    outputs.push(file);
    credits.push(
      `${path.basename(file)} (${format.width} x ${format.height})`,
      ...works.map(credit),
      "",
    );
  }
  const ogWorks = await renderOgCards(catalogue);
  credits.push("og-clean.png (1200 x 630)", ...ogWorks.map(credit), "");
  await writeFile(
    path.join(DIR, "credits.txt"),
    [
      "Collection of Beauty GitHub social preview and og:image cards",
      "",
      "Every work shown is in the public domain and appears whole, without cropping.",
      "The works in each card, top row first, left to right:",
      "",
      ...credits,
    ].join("\n"),
  );

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
