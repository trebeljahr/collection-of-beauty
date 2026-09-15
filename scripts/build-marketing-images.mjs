#!/usr/bin/env node

// Build the press image kit: the same set of public-domain works, hung on a
// plain wall in several aspect ratios, with and without the title.
//
// Every work is shown whole. Nothing is cropped: each image keeps its own
// aspect ratio and the works are packed into justified rows, like a photo
// album, so a portrait's face or a landscape's horizon never falls outside
// its tile. The previous mosaic cropped every cell to a fixed 4:3 box and
// cut the Turner, the Audubon turkey and the Hiroshige in half.
//
// Inputs:
//   src/data/artworks.json, src/data/summary.json
//   assets-web/<folder>/<basename>/<width>.avif (built variants)
// Outputs:
//   public/marketing/collection-of-beauty-*.jpg   press kit images
//   public/marketing/credits.txt                   works shown, per image
//   src/app/opengraph-image.png (+ .alt.txt)       site-wide link preview
//   src/data/press-images.json                     manifest read by /press
//
// Run:
//   pnpm marketing:images && pnpm marketing:press-kit-zip

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import seedrandom from "seedrandom";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

// `assets-web/` is gitignored and only materialised in the main worktree.
// From a worktree clone, read the canonical project's variants instead.
const LOCAL_ASSETS = path.join(ROOT, "assets-web");
const FALLBACK_ASSETS = "/Users/rico/projects/collection-of-beauty/assets-web";
const ASSETS_WEB = existsSync(LOCAL_ASSETS) ? LOCAL_ASSETS : FALLBACK_ASSETS;

const OUT_DIR = path.join(ROOT, "public", "marketing");
const OUT_OG = path.join(ROOT, "src", "app", "opengraph-image.png");
const OUT_MANIFEST = path.join(ROOT, "src", "data", "press-images.json");
const SITE_URL = "collectionofbeauty.com";
const FILE_PREFIX = "collection-of-beauty";

// The largest ladder rung. Above it sit full-size encodes of up to 16,384px,
// which are slow to decode and never needed for a tile in these images.
const MAX_SOURCE_WIDTH = 4096;

// Candidate works, in order of preference. The layout search picks a subset
// and an order per format, so this list only has to be varied: portraits and
// landscapes, oil and woodblock and book plates, Europe and East Asia.
const POOL = [
  "collection-of-beauty-1665-girl-with-a-pearl-earring",
  "collection-of-beauty-tsunami-by-hokusai-19th-century",
  "collection-of-beauty-vincent-van-gogh-1853-1890-cafeterras-bij-nacht-place-du-forum-kroller-muller-museum-otterlo-23-8-2",
  "collection-of-beauty-sandro-botticelli-la-nascita-di-venere-google-art-project-edited",
  "audubon-birds-431-american-flamingo",
  "collection-of-beauty-caspar-david-friedrich-wanderer-above-the-sea-of-fog",
  "collection-of-beauty-2560px-pieter-bruegel-the-elder-hunters-in-the-snow-winter-google-art-project",
  "kunstformen-images-haeckel-actiniae",
  "collection-of-beauty-boy-with-a-basket-of-fruit-caravaggio-1593",
  "collection-of-beauty-xsxlt-fankuan",
  "collection-of-beauty-vangogh-starry-night-ballance1",
  "redoute-roses-rosa-centifolia",
  "collection-of-beauty-john-singer-sargent-cancale",
  "collection-of-beauty-el-greco-view-of-toledo",
  "collection-of-beauty-hiroshige-53-stations-hoeido-37-akasaka-mfa-01",
  "collection-of-beauty-alfons-mucha-1896-spring",
  "collection-of-beauty-the-rising-squall-hot-wells-from-st-vincent-s-rock-bristol",
  "collection-of-beauty-mary-cassatt-the-child-s-bath-google-art-project",
  "collection-of-beauty-sandro-botticelli-idealized-portrait-of-a-lady-portrait-of-simonetta-vespucci-as-nymph-google-art-p",
  "collection-of-beauty-katsushika-hokusai-1760-1849-ono-waterval-aan-de-kisokaido-1835",
  "collection-of-beauty-claude-monet-052",
  "audubon-birds-1-wild-turkey",
];

const THEMES = {
  light: {
    wall: { r: 247, g: 243, b: 236 },
    shadow: "rgba(40, 28, 12, 0.28)",
    title: "#1a1208",
    body: "#3a2a16",
    accent: "#7a5a2f",
  },
  dark: {
    wall: { r: 28, g: 25, b: 23 },
    shadow: "rgba(0, 0, 0, 0.6)",
    title: "#f5f1e8",
    body: "#d6cbb8",
    accent: "#b8996a",
  },
};

// Each format names its purpose, because that is what a reader picks by.
// `wall` is the area the works hang in and `text` the title block, both as
// fractions of the canvas. `rows` bounds the layout search.
const FORMATS = [
  {
    slug: "16x9",
    label: "Landscape 16:9",
    use: "Article header, slides, video thumbnail",
    width: 2560,
    height: 1440,
    theme: "light",
    seed: 1,
    count: [9, 14],
    rows: [3, 4],
    wall: { x: 0, y: 0, w: 0.66, h: 1 },
    text: { x: 0.66, y: 0, w: 0.34, h: 1, size: 1 },
  },
  {
    slug: "16x9-dark",
    label: "Landscape 16:9, dark",
    use: "Article header, slides, video thumbnail",
    width: 2560,
    height: 1440,
    theme: "dark",
    seed: 2,
    count: [9, 14],
    rows: [3, 4],
    wall: { x: 0, y: 0, w: 0.66, h: 1 },
    text: { x: 0.66, y: 0, w: 0.34, h: 1, size: 1 },
  },
  {
    slug: "16x9-works",
    label: "Landscape 16:9, works only",
    use: "Background or your own layout, at 4K",
    width: 3840,
    height: 2160,
    theme: "light",
    seed: 3,
    count: [12, 20],
    rows: [3, 4],
    wall: { x: 0, y: 0, w: 1, h: 1 },
  },
  {
    slug: "1x1",
    label: "Square 1:1",
    use: "Instagram, Mastodon or Bluesky post",
    width: 1080,
    height: 1080,
    theme: "light",
    seed: 4,
    count: [6, 10],
    rows: [2, 3],
    wall: { x: 0, y: 0, w: 1, h: 0.72 },
    text: { x: 0, y: 0.72, w: 1, h: 0.28, size: 0.62, compact: true, titleLines: 1 },
  },
  {
    slug: "4x5",
    label: "Portrait 4:5",
    use: "Instagram feed post",
    width: 1080,
    height: 1350,
    theme: "light",
    seed: 5,
    count: [7, 11],
    rows: [3, 4],
    wall: { x: 0, y: 0, w: 1, h: 0.76 },
    text: { x: 0, y: 0.76, w: 1, h: 0.24, size: 0.62, compact: true, titleLines: 1 },
  },
  {
    slug: "9x16-dark",
    label: "Story 9:16, dark",
    use: "Instagram or WhatsApp story",
    width: 1080,
    height: 1920,
    theme: "dark",
    seed: 6,
    count: [10, 16],
    rows: [4, 7],
    // Stories put the account name over the top 14% and the reply bar over
    // the bottom 12%, so the works and the title stay between the two.
    wall: { x: 0, y: 0.12, w: 1, h: 0.6 },
    text: { x: 0, y: 0.72, w: 1, h: 0.16, size: 0.7, compact: true, titleLines: 1 },
  },
  {
    slug: "3x1",
    label: "Banner 3:1",
    use: "X or LinkedIn header, newsletter banner",
    width: 1500,
    height: 500,
    theme: "light",
    seed: 7,
    count: [4, 7],
    rows: [1, 1],
    wall: { x: 0.36, y: 0, w: 0.64, h: 1 },
    text: { x: 0, y: 0, w: 0.36, h: 1, size: 1.6, compact: true },
  },
  {
    slug: "og",
    label: "Link preview 1.91:1",
    use: "The image the site shows when a link is shared",
    width: 1200,
    height: 630,
    theme: "light",
    seed: 8,
    count: [5, 9],
    rows: [2, 3],
    wall: { x: 0, y: 0, w: 0.62, h: 1 },
    text: { x: 0.62, y: 0, w: 0.38, h: 1, size: 1.3, compact: true },
    alsoWrite: OUT_OG,
  },
];

// ─── Copy ──────────────────────────────────────────────────────────────────
// Counts round down, as on /press: the collection only grows, so a rounded-
// down figure baked into a JPEG stays true after every rebuild.

function atLeast(n, step) {
  return `${(Math.floor(n / step) * step).toLocaleString("en-US")}+`;
}

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function buildCopy(summary) {
  const works = atLeast(summary.totalArtworks, 1000);
  const artists = atLeast(summary.totalArtists, 50);
  const { min, max } = summary.yearRange;
  const period = `${ordinal(Math.floor(min / 100) + 1)} century to the ${Math.floor(max / 10) * 10}s`;
  return {
    title: "Collection of Beauty",
    lede: `${works} handpicked public-domain paintings, prints and book plates.`,
    body: "Browse them by era, artist, colour or decade, or walk through a 3D museum.",
    stats: `${artists} artists · ${period}`,
    url: SITE_URL,
  };
}

// ─── Layout ────────────────────────────────────────────────────────────────

/**
 * Split `items` (in order) into `k` rows so each row, justified to the full
 * width, comes out as close as possible to the same height. Classic linear
 * partition, solved by DP over row break points.
 */
function partitionRows(items, k, width, gap, targetRowH) {
  const n = items.length;
  const prefix = [0];
  for (const it of items) prefix.push(prefix.at(-1) + it.aspect);
  const rowHeight = (i, j) => (width - (j - i - 1) * gap) / (prefix[j] - prefix[i]);

  const INF = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(INF));
  const from = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let r = 1; r <= k; r++) {
    for (let j = r; j <= n; j++) {
      for (let i = r - 1; i < j; i++) {
        if (cost[r - 1][i] === INF) continue;
        const d = rowHeight(i, j) - targetRowH;
        const c = cost[r - 1][i] + d * d;
        if (c < cost[r][j]) {
          cost[r][j] = c;
          from[r][j] = i;
        }
      }
    }
  }
  if (cost[k][n] === INF) return null;
  const breaks = [n];
  for (let r = k, j = n; r > 0; r--) {
    j = from[r][j];
    breaks.unshift(j);
  }
  const rows = [];
  for (let r = 0; r < k; r++) rows.push(items.slice(breaks[r], breaks[r + 1]));
  return rows;
}

/** Place justified rows inside `area`. Returns rectangles plus a score. */
function layoutRows(rows, area, gap) {
  const heights = rows.map(
    (row) => (area.w - (row.length - 1) * gap) / row.reduce((s, it) => s + it.aspect, 0),
  );
  const natural = heights.reduce((s, h) => s + h, 0) + (rows.length - 1) * gap;
  // Too tall: shrink every row by the same factor and centre the block, so
  // the side margins stay equal. Too short: centre vertically.
  const scale = Math.min(
    1,
    (area.h - (rows.length - 1) * gap) / (natural - (rows.length - 1) * gap),
  );
  const blockH = heights.reduce((s, h) => s + h * scale, 0) + (rows.length - 1) * gap;
  let y = area.y + (area.h - blockH) / 2;
  const rects = [];
  let covered = 0;
  let minW = Number.POSITIVE_INFINITY;
  rows.forEach((row, r) => {
    const h = heights[r] * scale;
    const rowW = row.reduce((s, it) => s + it.aspect * h, 0) + (row.length - 1) * gap;
    let x = area.x + (area.w - rowW) / 2;
    for (const it of row) {
      const w = it.aspect * h;
      rects.push({ item: it, x, y, w, h });
      covered += w * h;
      minW = Math.min(minW, w);
      x += w + gap;
    }
    y += h + gap;
  });
  const spread = Math.max(...heights) / Math.min(...heights);
  return { rects, coverage: covered / (area.w * area.h), spread, minW };
}

function sameArtistNeighbours(rows) {
  let hits = 0;
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) if (row[i].artist === row[i - 1].artist) hits++;
  }
  for (let r = 1; r < rows.length; r++) {
    if (rows[r][0].artist === rows[r - 1].at(-1).artist) hits++;
  }
  return hits;
}

/**
 * Search seeded orderings of the pool for the layout that covers the wall
 * best with rows of even height. Favoured works (early in POOL) earn a small
 * bonus, so the well-known pictures tend to make the cut.
 */
function searchLayout(pool, format, area, gap) {
  const rng = seedrandom(`press-images-${format.seed}`);
  const [minN, maxN] = format.count;
  const [minK, maxK] = format.rows;
  let best = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    // Keep a bias towards the front of the pool: weighted shuffle.
    const order = pool
      .map((it, rank) => ({ it, key: rng() ** (1 / (1 + (pool.length - rank) * 0.08)) }))
      .sort((a, b) => b.key - a.key)
      .map((e) => e.it);
    for (let n = minN; n <= Math.min(maxN, order.length); n++) {
      const items = order.slice(0, n);
      for (let k = minK; k <= maxK; k++) {
        if (k > n) continue;
        const target = (area.h - (k - 1) * gap) / k;
        const rows = partitionRows(items, k, area.w, gap, target);
        if (!rows) continue;
        const placed = layoutRows(rows, area, gap);
        // A sliver of a painting is no use to anyone; reject narrow tiles.
        if (placed.minW < area.w * (k === 1 ? 0.1 : 0.12)) continue;
        const favour = items.reduce((s, it) => s + 1 / (1 + it.rank * 0.15), 0) / n;
        const score =
          placed.coverage -
          0.25 * (placed.spread - 1) -
          0.05 * sameArtistNeighbours(rows) +
          0.08 * favour;
        if (!best || score > best.score) best = { score, ...placed };
      }
    }
  }
  if (!best) throw new Error(`no layout fits format ${format.slug}`);
  return best;
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function sourceFor(item, targetWidth) {
  const segments = item.objectKey.split("/");
  const base = segments.pop().replace(/\.[^.]+$/, "");
  const dir = path.join(ASSETS_WEB, ...segments, base);
  const widths = (item.variantWidths ?? [])
    .filter((w) => w <= MAX_SOURCE_WIDTH)
    .sort((a, b) => a - b);
  const pick = widths.find((w) => w >= targetWidth) ?? widths.at(-1);
  // Commons filenames reach the disk both NFC- and NFD-normalised.
  for (const d of [dir, dir.normalize("NFC"), dir.normalize("NFD")]) {
    const p = path.join(d, `${pick}.avif`);
    if (existsSync(p)) return p;
  }
  throw new Error(`no ${pick}px variant for ${item.id} under ${dir}`);
}

async function tile(rect) {
  const w = Math.round(rect.w);
  const h = Math.round(rect.h);
  const src = sourceFor(rect.item, w * 1.25);
  // fit: "fill" only absorbs the sub-pixel rounding between the justified
  // width and the whole-pixel tile; the aspect ratio is the source's own.
  return sharp(src).resize({ width: w, height: h, fit: "fill" }).toBuffer();
}

function shadowSvg(rects, width, height, shadow, blur) {
  const shapes = rects
    .map(
      (r) =>
        `<rect x="${(r.x + blur * 0.15).toFixed(1)}" y="${(r.y + blur * 0.45).toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}"/>`,
    )
    .join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
  <g fill="${shadow}" filter="url(#s)">${shapes}</g>
</svg>`);
}

function escapeMarkup(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One wrapped Pango text block, rendered to a transparent PNG. */
async function textBlock(markup, { font, width, align = "left", spacing = 0 }) {
  const { data, info } = await sharp({
    text: { text: markup, font, width: Math.round(width), rgba: true, dpi: 72, align, spacing },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Title block: title, lede, body, then a rule with stats and URL. Sizes
 * start from the canvas's short side times the format's `size` factor and
 * shrink until the title keeps to its line budget and the whole stack fits
 * the box, so one set of proportions serves every format.
 */
async function renderText(format, copy, theme) {
  const { width: W, height: H } = format;
  const t = format.text;
  for (let unit = Math.min(W, H) * 0.001 * t.size; unit > 0.2; unit *= 0.94) {
    const result = await stackText(format, copy, theme, unit);
    if (result) return result;
  }
  throw new Error(`title does not fit format ${format.slug}`);
}

async function stackText(format, copy, theme, unit) {
  const { width: W, height: H } = format;
  const t = format.text;
  const box = { x: t.x * W, y: t.y * H, w: t.w * W, h: t.h * H };
  const padX = box.w * (t.compact ? 0.07 : 0.1);
  const innerW = box.w - padX * 2;
  const align = format.text.y > 0 ? "centre" : "left";

  const titleSize = Math.round(120 * unit);
  const title = await textBlock(
    `<span foreground="${theme.title}" weight="bold">${escapeMarkup(copy.title)}</span>`,
    { font: `Georgia ${titleSize}`, width: innerW, align },
  );
  // Pango lets a word wider than the box overflow it, and a title that
  // wraps more than the budget reads as a paragraph. Both mean: smaller.
  const maxTitleLines = t.titleLines ?? 2;
  if (title.width > innerW || title.height > titleSize * 1.25 * maxTitleLines) return null;

  const lede = await textBlock(
    `<span foreground="${theme.body}">${escapeMarkup(copy.lede)}</span>`,
    {
      font: `Georgia ${Math.round(36 * unit)}`,
      width: innerW,
      align,
      spacing: Math.round(12 * unit),
    },
  );
  const body = t.compact
    ? null
    : await textBlock(
        `<span foreground="${theme.body}" font_style="italic">${escapeMarkup(copy.body)}</span>`,
        {
          font: `Georgia ${Math.round(32 * unit)}`,
          width: innerW,
          align,
          spacing: Math.round(12 * unit),
        },
      );
  const metaFont = `Georgia ${Math.round(26 * unit)}`;
  const stats = t.compact
    ? null
    : await textBlock(`<span foreground="${theme.accent}">${escapeMarkup(copy.stats)}</span>`, {
        font: metaFont,
        width: innerW,
        align,
      });
  const url = await textBlock(
    `<span foreground="${theme.accent}">${escapeMarkup(copy.url)}</span>`,
    {
      font: metaFont,
      width: innerW,
      align,
    },
  );

  const ruleThickness = Math.max(1, Math.round(2 * unit));
  const steps = [
    { img: title, gap: 0 },
    { img: lede, gap: 30 * unit },
    ...(body ? [{ img: body, gap: 22 * unit }] : []),
    { rule: true, gap: 44 * unit },
    ...(stats ? [{ img: stats, gap: 24 * unit }] : []),
    { img: url, gap: stats ? 10 * unit : 24 * unit },
  ];
  const stackH = steps.reduce((s, st) => s + st.gap + (st.rule ? ruleThickness : st.img.height), 0);
  if (stackH > box.h * 0.86) return null;

  let y = box.y + (box.h - stackH) / 2;
  const ruleW = align === "centre" ? Math.min(innerW, 180 * unit) : innerW;
  const leftOf = (w) => Math.round(align === "centre" ? box.x + (box.w - w) / 2 : box.x + padX);
  const composites = [];
  for (const st of steps) {
    y += st.gap;
    if (st.rule) {
      composites.push({
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(ruleW)}" height="${ruleThickness}"><rect width="100%" height="100%" fill="${theme.accent}"/></svg>`,
        ),
        left: leftOf(ruleW),
        top: Math.round(y),
      });
      y += ruleThickness;
    } else {
      composites.push({ input: st.img.data, left: leftOf(st.img.width), top: Math.round(y) });
      y += st.img.height;
    }
  }
  return composites;
}

async function renderFormat(format, pool, copy) {
  const { width: W, height: H } = format;
  const theme = THEMES[format.theme];
  const margin = Math.round(Math.min(W, H) * 0.045);
  const gap = Math.round(Math.min(W, H) * 0.022);
  const wallArea = {
    x: format.wall.x * W + margin,
    y: format.wall.y * H + margin,
    w:
      format.wall.w * W -
      margin * (format.text && format.wall.x === 0 && format.text.x > 0 ? 1.5 : 2),
    h: format.wall.h * H - margin * 2,
  };
  // A side panel shares the seam margin with the wall; keep the works off it.
  if (format.text && format.wall.x > 0) {
    wallArea.x = format.wall.x * W + margin * 0.5;
    wallArea.w = format.wall.w * W - margin * 1.5;
  }
  if (format.text && format.text.y > 0) wallArea.h = format.wall.h * H - margin * 1.5;

  const layout = searchLayout(pool, format, wallArea, gap);
  const composites = [
    {
      input: shadowSvg(layout.rects, W, H, theme.shadow, Math.max(2, Math.round(gap * 0.35))),
      left: 0,
      top: 0,
    },
  ];
  for (const rect of layout.rects) {
    composites.push({ input: await tile(rect), left: Math.round(rect.x), top: Math.round(rect.y) });
  }
  if (format.text) composites.push(...(await renderText(format, copy, theme)));

  const canvas = sharp({ create: { width: W, height: H, channels: 3, background: theme.wall } });
  const png = await canvas.composite(composites).png().toBuffer();
  return { png, rects: layout.rects, coverage: layout.coverage };
}

// Same rule as displayTitle() in src/lib/artwork-format.ts: many catalogue
// titles are Commons filenames, and the English title is the readable one.
function displayTitle(a) {
  return a.englishTitle?.trim() || a.title;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const artworks = JSON.parse(await readFile(path.join(ROOT, "src/data/artworks.json"), "utf8"));
  const summary = JSON.parse(await readFile(path.join(ROOT, "src/data/summary.json"), "utf8"));
  const byId = new Map(artworks.map((a) => [a.id, a]));
  const pool = POOL.map((id, rank) => {
    const a = byId.get(id);
    if (!a) throw new Error(`pool work not in the catalogue: ${id}`);
    return { ...a, rank, aspect: a.width / a.height };
  });
  const copy = buildCopy(summary);

  await mkdir(OUT_DIR, { recursive: true });
  // Clear the previous kit so a renamed or dropped format leaves no orphan
  // that the press kit ZIP would then pick up. The museum screenshots share
  // the folder and belong to build-museum-screenshots.mjs, so they stay.
  for (const name of await readdir(OUT_DIR)) {
    if (name.startsWith(`${FILE_PREFIX}-museum-`)) continue;
    await rm(path.join(OUT_DIR, name));
  }

  const images = [];
  const credits = [];
  for (const format of FORMATS) {
    const { png, rects, coverage } = await renderFormat(format, pool, copy);
    const file = `${FILE_PREFIX}-${format.slug}.jpg`;
    const outPath = path.join(OUT_DIR, file);
    await sharp(png)
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toFile(outPath);
    if (format.alsoWrite) {
      await sharp(png).png({ compressionLevel: 9, palette: false }).toFile(format.alsoWrite);
    }
    // Reading order: rows top to bottom, left to right within a row.
    const works = [...rects]
      .sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x)
      .map((r) => r.item.id);
    const artists = [...new Set(works.map((id) => byId.get(id).artist).filter(Boolean))].slice(
      0,
      4,
    );
    const alt = `${format.text ? `${copy.title}: ` : ""}${works.length} public-domain works shown whole on a ${format.theme} wall, including works by ${artists.slice(0, -1).join(", ")} and ${artists.at(-1)}.`;
    if (format.alsoWrite) {
      await writeFile(format.alsoWrite.replace(/\.png$/, ".alt.txt"), alt);
    }
    images.push({
      slug: format.slug,
      label: format.label,
      use: format.use,
      href: `/marketing/${file}`,
      width: format.width,
      height: format.height,
      bytes: (await stat(outPath)).size,
      theme: format.theme,
      hasTitle: Boolean(format.text),
      alt,
      works,
    });
    credits.push(
      `${file} (${format.width} x ${format.height})`,
      ...works.map((id) => {
        const a = byId.get(id);
        return `  ${a.artist ?? "Unknown artist"}, ${displayTitle(a)}${a.year ? `, ${a.year}` : ""}. https://${SITE_URL}/artwork/${id}`;
      }),
      "",
    );
    console.log(
      `[${format.slug}] ${file} ${format.width}x${format.height}, ${works.length} works, ${Math.round(coverage * 100)}% of the wall`,
    );
  }

  const usedIds = [...new Set(images.flatMap((img) => img.works))];
  const manifest = {
    images,
    works: usedIds.map((id) => {
      const a = byId.get(id);
      return { id, title: displayTitle(a), artist: a.artist, year: a.year };
    }),
  };
  await writeFile(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    path.join(OUT_DIR, "credits.txt"),
    [
      "Collection of Beauty press images",
      "",
      "Every work shown is in the public domain and appears whole, without cropping.",
      "The works in each image, top row first, left to right:",
      "",
      ...credits,
    ].join("\n"),
  );
  console.log(`wrote ${path.relative(ROOT, OUT_MANIFEST)} and credits.txt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
