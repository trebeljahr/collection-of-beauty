#!/usr/bin/env -S npx tsx
/**
 * Finish the static export in out/ for the Cloudflare Worker that serves it:
 * write `_redirects` and `_headers`, drop what storage serves instead, and
 * check the upload against the platform's limits.
 *
 *   pnpm build   (runs `next build`, then this)
 *
 * `_redirects` is every redirect the Next server answered before the site
 * became static: next.config's list (scripts/static-routing.mjs), the
 * press kit and plate-set ZIPs on the asset bucket, renamed artwork ids
 * and artist slugs (src/data/redirects.json), and the newsletter's
 * legacy and theme-slug paths. Cloudflare applies it before any file, so
 * a line must never shadow a real page; this script checks that too.
 */
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import redirectsJson from "../src/data/redirects.json" with { type: "json" };
import zipsJson from "../src/data/collection-zips.json" with { type: "json" };
import { collectionZipRedirects, validateCollectionZips } from "../src/lib/collection-zips.mjs";
import { loadPublishedEditions } from "../src/lib/newsletter/editions";
import { pressKitRedirects } from "./press-kit-download.mjs";
import { FIXED_REDIRECTS, redirectLine, SECURITY_HEADERS } from "./static-routing.mjs";

type Rule = [from: string, to: string, status: number];

const root = fileURLToPath(new URL("../", import.meta.url));
const OUT = resolve(root, process.argv[2] ?? "out");

/** Workers static assets, per version. Free allows 20,000 files; the
 *  site needs Workers Paid (docs/static-site.md). */
const MAX_FILES = Number(process.env.STATIC_MAX_FILES ?? 100_000);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_STATIC_REDIRECTS = 2_000;
const MAX_DYNAMIC_REDIRECTS = 100;
const MAX_HEADER_RULES = 100;

function isDynamic([from]: Rule): boolean {
  return from.includes(":") || from.includes("*");
}

function redirectRules(): Rule[] {
  const rules: Rule[] = [];
  for (const r of pressKitRedirects())
    rules.push([r.source, r.destination, r.permanent ? 308 : 307]);
  rules.push(...collectionZipRedirects(validateCollectionZips(zipsJson)));
  const renames = redirectsJson as {
    artworks: Record<string, string>;
    artists: Record<string, string>;
  };
  for (const [from, to] of Object.entries(renames.artworks)) {
    rules.push([`/artwork/${from}`, `/artwork/${to}`, 308]);
  }
  for (const [from, to] of Object.entries(renames.artists)) {
    rules.push([`/artist/${from}`, `/artist/${to}`, 308]);
  }
  // /drops/<slug> was a page that redirected any slug; /newsletter/<slug>
  // answered the theme slug too. Only published editions have a page.
  for (const edition of loadPublishedEditions()) {
    const target = `/newsletter/${edition.fileSlug}`;
    rules.push([`/drops/${edition.fileSlug}`, target, 308]);
    if (edition.themeSlug !== edition.fileSlug) {
      rules.push([`/drops/${edition.themeSlug}`, target, 308]);
      rules.push([`/newsletter/${edition.themeSlug}`, target, 308]);
    }
  }
  rules.push(...(FIXED_REDIRECTS as Rule[]));
  // Static lines first: Cloudflare wants them before the ones with a
  // placeholder or a splat. A stable sort keeps each group's order.
  return [...rules.filter((r) => !isDynamic(r)), ...rules.filter(isDynamic)];
}

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else found.push(path);
  }
  return found;
}

/** The file a static path is served from, if the export has one. */
function servedFile(path: string): string | null {
  for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
    const file = join(OUT, candidate);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function main() {
  if (!existsSync(join(OUT, "index.html"))) {
    throw new Error(`${OUT} holds no export; run next build first.`);
  }

  // The press kit is a redirect to the asset bucket once published; the
  // copy in public/ only feeds scripts/press-kit-download.mjs. Removed
  // before the shadow check below, which would otherwise find it.
  const pressKit = join(OUT, "press-kit.zip");
  if (pressKitRedirects().length > 0 && existsSync(pressKit)) rmSync(pressKit);

  const rules = redirectRules();
  const dynamic = rules.filter(isDynamic).length;
  const problems: string[] = [];
  if (rules.length - dynamic > MAX_STATIC_REDIRECTS) problems.push("too many static redirects");
  if (dynamic > MAX_DYNAMIC_REDIRECTS) problems.push("too many dynamic redirects");
  const seen = new Set<string>();
  for (const rule of rules) {
    const line = redirectLine(rule);
    if (line.length > 1_000) problems.push(`redirect over 1,000 characters: ${rule[0]}`);
    if (seen.has(rule[0])) problems.push(`two redirects for ${rule[0]}`);
    seen.add(rule[0]);
    // A redirect runs before the file, so one on a real page hides it.
    if (!isDynamic(rule) && servedFile(rule[0]))
      problems.push(`redirect shadows a page: ${rule[0]}`);
  }

  const headers = [
    ["/*", SECURITY_HEADERS.map((h: { key: string; value: string }) => `${h.key}: ${h.value}`)],
    // Polled by the deploy job and by open tabs, which reload on a new commit.
    ["/version.json", ["Cache-Control: no-store, max-age=0"]],
    // Read by the next deploy's chunk carry (scripts/carry-static.mjs).
    ["/release-assets.json", ["Cache-Control: no-store, max-age=0"]],
    // Polled by open tabs (release-navigation-guard.tsx).
    ["/releases.json", ["Cache-Control: no-store, max-age=0"]],
    // A file with no extension; Cloudflare would call it a byte stream.
    ["/api/artworks", ["Content-Type: application/json; charset=utf-8"]],
    // Emails link `?v=<version>`, which a static file cannot tell apart.
    ["/newsletter/*/wall.jpg", ["Cache-Control: public, max-age=3600"]],
  ] as const;
  if (headers.length > MAX_HEADER_RULES) problems.push("too many _headers rules");

  const files = walk(OUT);
  if (files.length > MAX_FILES) problems.push(`${files.length} files, over ${MAX_FILES}`);
  for (const file of files) {
    if (statSync(file).size > MAX_FILE_BYTES) {
      problems.push(`over 25 MiB: ${relative(OUT, file)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`static export is not deployable:\n  ${problems.join("\n  ")}`);
  }

  writeFileSync(join(OUT, "_redirects"), `${rules.map(redirectLine).join("\n")}\n`);
  writeFileSync(
    join(OUT, "_headers"),
    `${headers.map(([path, lines]) => [path, ...lines.map((l) => `  ${l}`)].join("\n")).join("\n")}\n`,
  );
  console.log(
    `[static] ${files.length + 2} files; _redirects: ${rules.length - dynamic} static, ${dynamic} dynamic; _headers: ${headers.length} rules`,
  );
}

main();
