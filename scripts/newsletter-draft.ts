#!/usr/bin/env -S npx tsx
/**
 * Scaffold a new newsletter edition file under content/newsletter/.
 *
 *   pnpm newsletter:draft <theme-slug> [--title "..."] [id1 id2 id3 id4 id5]
 *
 * Behavior:
 *   - Issue number is auto-derived (highest existing + 1, zero-padded to 4).
 *   - If artwork ids are supplied (5 of them), they're used verbatim and
 *     validated against the catalogue.
 *   - If none are supplied, 5 unsent artworks are picked at random — the
 *     file is marked `draft: true` so it won't appear publicly until you
 *     edit it. Most of the time you'll want Claude (via the
 *     /newsletter-draft command) to pick by theme rather than relying on
 *     this random fallback.
 *
 * The resulting markdown has placeholder frontmatter and a TODO body for
 * you to fill in.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { artworks as ALL_ARTWORKS } from "../src/lib/data";
import {
  _resetEditionsCache,
  highestIssueNumber,
  sentArtworkIds,
} from "../src/lib/newsletter/editions";
import { pickArtworks } from "../src/lib/newsletter/select";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(__dirname, "..");
process.chdir(ROOT);

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const flagNames = new Set(["title"]);
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    if (flagNames.has(a.slice(2))) i++;
    continue;
  }
  positional.push(a);
}

const themeSlug = positional[0];
if (!themeSlug) {
  console.error(
    "usage: pnpm newsletter:draft <theme-slug> [--title \"Full Title\"] [id1 id2 id3 id4 id5]",
  );
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(themeSlug)) {
  console.error(`Theme slug must be lowercase kebab-case (got "${themeSlug}").`);
  process.exit(1);
}

const explicitIds = positional.slice(1);
if (explicitIds.length > 0 && explicitIds.length !== 5) {
  console.error(`Expected 5 artwork ids (got ${explicitIds.length}).`);
  process.exit(1);
}

_resetEditionsCache();
const nextNumber = highestIssueNumber() + 1;
const padded = String(nextNumber).padStart(4, "0");
const fileSlug = `${padded}-${themeSlug}`;
const filePath = path.join(ROOT, "content", "newsletter", `${fileSlug}.md`);

if (existsSync(filePath)) {
  console.error(`Refusing to overwrite ${filePath}. Pick a different slug.`);
  process.exit(1);
}

let chosenIds: string[];
if (explicitIds.length === 5) {
  const byId = new Map(ALL_ARTWORKS.map((a) => [a.id, a]));
  const missing = explicitIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    console.error(`Unknown artwork id(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  chosenIds = explicitIds;
} else {
  const seed = `${fileSlug}-${Date.now()}`;
  chosenIds = pickArtworks(ALL_ARTWORKS, sentArtworkIds(), seed, 5).map((a) => a.id);
}

const today = new Date().toISOString().slice(0, 10);
const title = getFlag("title") ?? titleFromSlug(themeSlug);

const yamlArtworks = chosenIds
  .map((id) => {
    const a = ALL_ARTWORKS.find((x) => x.id === id);
    const meta = a ? `  # ${a.title}${a.artist ? ` — ${a.artist}` : ""}` : "";
    return `  - id: "${id}"${meta}\n    # note: "Short editorial blurb shown below this artwork."`;
  })
  .join("\n");

const frontmatter = `---
title: "${title}"
subject: "${title}"
publishedAt: "${today}"
excerpt: "TODO — one-sentence summary used in OG tags and the archive index."
draft: true
# Optional: drop in the lead artwork's id (or remove this block to fall back
# to the first entry under "artworks:"). Use { src, alt } instead for a
# non-artwork cover.
cover:
  artworkId: "${chosenIds[0]}"
tags:
  # - "impressionism"
  # - "spring"
artworks:
${yamlArtworks}
---

TODO — the editorial intro for this issue. Two to four short paragraphs
introducing the theme and stitching the five works together. Plain
markdown; rendered both on the archive page and in the email body.
`;

mkdirSync(path.dirname(filePath), { recursive: true });
writeFileSync(filePath, frontmatter, "utf8");

console.info(`Created: ${path.relative(ROOT, filePath)}`);
console.info(`Issue number: ${nextNumber}`);
console.info(`Artworks: ${chosenIds.join(", ")}`);
console.info(`\nNext steps:`);
console.info(`  1. Edit the file — replace TODO bits, refine artwork picks, write blurbs/intro.`);
console.info(`  2. Flip "draft: true" → "draft: false" when ready.`);
console.info(`  3. pnpm newsletter:send ${fileSlug}                                   # dry-run`);
console.info(`  4. pnpm newsletter:send ${fileSlug} --confirm                         # send to LISTMONK_TEST_LIST_ID`);
console.info(`  5. NODE_ENV=production pnpm newsletter:send ${fileSlug} --confirm     # send to LISTMONK_LIST_ID (real)`);

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
