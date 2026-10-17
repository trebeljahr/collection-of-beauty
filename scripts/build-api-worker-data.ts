#!/usr/bin/env -S npx tsx
/**
 * Compile what the API Worker (workers/api) reads at run time, so it needs
 * neither react nor the 6 MB catalogue:
 *
 *   workers/api/generated/emails.json     the confirmation, already-subscribed
 *                                         and welcome emails, their per-
 *                                         recipient tokens placeholders
 *   workers/api/generated/downloads.json  id → variant directory, files,
 *                                         filename stem, credit, licence
 *
 *   pnpm api:data
 *
 * Run before every deploy of the Worker: a new edition or a re-shrunk work
 * reaches it only this way. SITE_URL (default https://collectionofbeauty.com)
 * is the origin the emails link to.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectionForFolder } from "../src/lib/collections";
import { artworks } from "../src/lib/data";
import { attributionText, downloadFilename, downloadOptions } from "../src/lib/downloads";
import { renderWorkerEmails } from "../src/lib/newsletter/worker-emails";
import type { DownloadEntry, DownloadManifest } from "../workers/api/src/download";

const root = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(root, "workers/api/generated");
const SITE_URL = (process.env.SITE_URL ?? "https://collectionofbeauty.com").replace(/\/+$/, "");

function encodedVariantDir(objectKey: string): string {
  const slash = objectKey.lastIndexOf("/");
  const segments = [
    ...objectKey.slice(0, slash).split("/"),
    objectKey.slice(slash + 1).replace(/\.[^.]+$/, ""),
  ];
  return segments.map(encodeURIComponent).join("/");
}

export function buildDownloadManifest(): DownloadManifest {
  const manifest: DownloadManifest = {};
  for (const art of artworks) {
    if (!art.objectKey) continue;
    const files = downloadOptions(art).map((o) => `${o.width}.${o.format}`);
    // downloadFilename is `<stem>-<width>px.<format>`; keep the stem.
    const stem = downloadFilename(art, 0, "avif").replace(/-0px\.avif$/, "");
    const entry: DownloadEntry = [
      encodedVariantDir(art.objectKey),
      files,
      stem,
      attributionText(art),
      art.license,
      collectionForFolder(art.folder)?.slug ?? null,
    ];
    manifest[art.id] = entry;
  }
  return manifest;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = buildDownloadManifest();
  writeFileSync(join(OUT, "downloads.json"), JSON.stringify(manifest));
  const rendered = await renderWorkerEmails(SITE_URL);
  writeFileSync(join(OUT, "emails.json"), JSON.stringify(rendered));
  console.log(
    `[api-data] ${Object.keys(manifest).length} downloadable works; welcome issue: ${rendered.welcome?.edition ?? "none"}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
