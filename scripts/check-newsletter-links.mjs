// Link checker for content/newsletter/*.md.
//
// Offline checks (always): /newsletter/<slug> cross-links against edition
// files, /artist/<slug> against src/data/artists.json, /artwork/<id>
// against src/data/artworks.json.
//
// Online check (--external): every external URL gets a request. Wikipedia
// links go through the API so a redirect counts as resolving but a missing
// page fails. Other hosts get a plain GET and fail on >= 400.
//
// Usage: node scripts/check-newsletter-links.mjs [--external]

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NEWSLETTER_DIR = path.join(ROOT, "content", "newsletter");
const CHECK_EXTERNAL = process.argv.includes("--external");

const editionFiles = fs.readdirSync(NEWSLETTER_DIR).filter((f) => /^\d{4}-.*\.md$/.test(f));
const editionSlugs = new Set(editionFiles.map((f) => f.replace(/\.md$/, "")));
const artistSlugs = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/artists.json"), "utf8")).map(
    (a) => a.slug,
  ),
);
const artworkIds = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/artworks.json"), "utf8")).map(
    (a) => a.id,
  ),
);

// Markdown link destinations, tolerating one level of balanced parens
// (Wikipedia disambiguation URLs like .../Bokashi_(printing)).
const LINK_RX = /\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

const failures = [];
const externalByUrl = new Map(); // url -> [file:line, ...]

for (const file of editionFiles) {
  const lines = fs.readFileSync(path.join(NEWSLETTER_DIR, file), "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LINK_RX)) {
      const url = m[1];
      const where = `${file}:${i + 1}`;
      if (url.startsWith("/newsletter/")) {
        if (!editionSlugs.has(url.slice("/newsletter/".length)))
          failures.push(`${where} broken edition link: ${url}`);
      } else if (url.startsWith("/artist/")) {
        if (!artistSlugs.has(url.slice("/artist/".length)))
          failures.push(`${where} broken artist link: ${url}`);
      } else if (url.startsWith("/artwork/")) {
        if (!artworkIds.has(url.slice("/artwork/".length)))
          failures.push(`${where} broken artwork link: ${url}`);
      } else if (url.startsWith("/")) {
        failures.push(`${where} unknown internal link shape: ${url}`);
      } else if (/^https?:\/\//.test(url)) {
        if (!externalByUrl.has(url)) externalByUrl.set(url, []);
        externalByUrl.get(url).push(where);
      } else {
        failures.push(`${where} unparseable link destination: ${url}`);
      }
    }
  });
}

const UA = { "User-Agent": "collection-of-beauty-linkcheck/1.0 (ricotrebeljahr@gmail.com)" };

async function checkWikipedia(urls) {
  const titles = urls.map((u) =>
    decodeURIComponent(new URL(u).pathname.slice("/wiki/".length)).replace(/_/g, " "),
  );
  const missing = new Set();
  for (let i = 0; i < titles.length; i += 50) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      titles: titles.slice(i, i + 50).join("|"),
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: UA });
    const json = await res.json();
    // map normalized/redirected titles back to what we asked for
    const renames = new Map();
    for (const n of json.query?.normalized ?? []) renames.set(n.to, n.from);
    for (const r of json.query?.redirects ?? [])
      renames.set(r.to, renames.get(r.from) ?? r.from);
    for (const p of json.query?.pages ?? []) {
      if (p.missing) missing.add(renames.get(p.title) ?? p.title);
    }
  }
  return missing;
}

if (CHECK_EXTERNAL) {
  const urls = [...externalByUrl.keys()];
  const wikiUrls = urls.filter((u) => /^https:\/\/en\.wikipedia\.org\/wiki\//.test(u));
  const otherUrls = urls.filter((u) => !wikiUrls.includes(u));

  const missingTitles = await checkWikipedia(wikiUrls);
  for (const u of wikiUrls) {
    const title = decodeURIComponent(new URL(u).pathname.slice("/wiki/".length)).replace(
      /_/g,
      " ",
    );
    if (missingTitles.has(title)) {
      for (const where of externalByUrl.get(u))
        failures.push(`${where} missing Wikipedia page: ${u}`);
    }
  }

  for (const u of otherUrls) {
    try {
      const res = await fetch(u, { headers: UA, redirect: "follow" });
      if (res.status >= 400) {
        for (const where of externalByUrl.get(u))
          failures.push(`${where} HTTP ${res.status}: ${u}`);
      }
    } catch (e) {
      for (const where of externalByUrl.get(u)) failures.push(`${where} fetch failed: ${u}`);
    }
  }
}

const checked = `${editionFiles.length} editions, ${externalByUrl.size} external urls${CHECK_EXTERNAL ? " (verified)" : " (offline run, use --external to verify)"}`;
if (failures.length) {
  console.error(`[check-newsletter-links] ${checked}`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(`[check-newsletter-links] OK — ${checked}`);
