#!/usr/bin/env node
// Build the public press kit archive.
//
// Regenerate with:
//   pnpm marketing:press-kit-zip
//
// Output:
//   public/press-kit.zip
//
// The archive includes public/marketing/, the live OG image, the live
// wordmark when a wordmark asset exists, and a plaintext fact-sheet.txt
// derived from the project press-kit note. ZIP entries are sorted and their
// timestamp fields are zeroed so repeated runs are deterministic.

import { constants as fsConstants, existsSync } from "node:fs";
import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);

const SOURCE_PRESS_KIT =
  "/Users/rico/projects/ricos.site/src/content/Notes/texts/misc/claude-chat-gpt-generated/projects/collection-of-beauty/collection-of-beauty-press-kit.md";
const MARKETING_DIR = path.join(ROOT, "public", "marketing");
const OUT_ZIP = path.join(ROOT, "public", "press-kit.zip");
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

const OG_CANDIDATES = [
  { source: path.join(ROOT, "src", "app", "opengraph-image.png"), zipPath: "opengraph-image.png" },
  { source: path.join(ROOT, "public", "opengraph-image.png"), zipPath: "opengraph-image.png" },
];

const WORDMARK_CANDIDATES = [
  { source: path.join(ROOT, "public", "logo-wordmark.svg"), zipPath: "logo-wordmark.svg" },
  { source: path.join(ROOT, "public", "wordmark.svg"), zipPath: "wordmark.svg" },
  { source: path.join(ROOT, "public", "marketing", "logo-wordmark.svg"), zipPath: "logo-wordmark.svg" },
  { source: path.join(ROOT, "public", "marketing", "wordmark.svg"), zipPath: "wordmark.svg" },
  { source: path.join(ROOT, "src", "app", "logo-wordmark.svg"), zipPath: "logo-wordmark.svg" },
  { source: path.join(ROOT, "src", "app", "wordmark.svg"), zipPath: "wordmark.svg" },
];

const REGULAR_FILE_MODE = (0o100644 << 16) >>> 0;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const ZERO_DOS_TIME = 0;
const ZERO_DOS_DATE = 0;

async function main() {
  const entries = [];

  for (const file of await listFiles(MARKETING_DIR)) {
    const relativePath = path.relative(MARKETING_DIR, file).split(path.sep).join("/");
    entries.push({
      source: file,
      zipPath: `marketing/${relativePath}`,
      data: await readFile(file),
    });
  }

  await addFirstExisting(entries, WORDMARK_CANDIDATES, "wordmark");
  await addFirstExisting(entries, OG_CANDIDATES, "OG image");

  entries.push({
    zipPath: "fact-sheet.txt",
    data: Buffer.from(await buildFactSheetText(), "utf8"),
  });

  const zip = buildZip(entries);
  await mkdir(path.dirname(OUT_ZIP), { recursive: true });
  await writeFile(OUT_ZIP, zip);

  const size = (await stat(OUT_ZIP)).size;
  if (size > MAX_ZIP_BYTES) {
    await unlink(OUT_ZIP);
    throw new Error(
      `press kit zip is ${formatBytes(size)}, which exceeds ${formatBytes(MAX_ZIP_BYTES)}`,
    );
  }

  console.log(`wrote ${path.relative(ROOT, OUT_ZIP)} (${formatBytes(size)}, ${entries.length} files)`);
}

async function addFirstExisting(entries, candidates, label) {
  for (const candidate of candidates) {
    if (!(await isReadableFile(candidate.source))) continue;

    entries.push({
      source: candidate.source,
      zipPath: candidate.zipPath,
      data: await readFile(candidate.source),
    });
    console.log(`included ${label}: ${path.relative(ROOT, candidate.source)}`);
    return;
  }

  console.log(`skipped ${label}: no asset found`);
}

async function isReadableFile(file) {
  try {
    await access(file, fsConstants.R_OK);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function listFiles(dir) {
  if (!existsSync(dir)) return [];

  const dirents = await readdir(dir, { withFileTypes: true });
  const sorted = dirents.sort((a, b) => a.name.localeCompare(b.name, "en"));
  const files = [];

  for (const dirent of sorted) {
    const file = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...(await listFiles(file)));
    } else if (dirent.isFile()) {
      files.push(file);
    }
  }

  return files;
}

async function buildFactSheetText() {
  const source = await readFile(SOURCE_PRESS_KIT, "utf8");
  const factSheetSection = extractSecondLevelHeading(source, "Fact sheet");
  const tiersSection = extractSecondLevelHeading(source, "Three description tiers");
  const factSheetBlock = extractFirstCodeBlock(factSheetSection);
  const tiersText = stripMarkdown(tiersSection);

  return [
    "Collection of Beauty Press Kit",
    "",
    "Fact Sheet",
    "",
    factSheetBlock,
    "",
    "Description Tiers",
    "",
    tiersText,
    "",
  ].join("\n");
}

function extractSecondLevelHeading(markdown, heading) {
  const pattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
  const match = markdown.match(pattern);
  if (!match || match.index === undefined) {
    throw new Error(`missing section: ## ${heading}`);
  }

  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function extractFirstCodeBlock(markdown) {
  const match = markdown.match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error("missing fact-sheet code block");
  }

  return match[1].replace(/\r\n/g, "\n").trim();
}

function stripMarkdown(markdown) {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildZip(rawEntries) {
  const entries = dedupeAndSortEntries(rawEntries);
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.zipPath, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(STORE_METHOD, 8);
    localHeader.writeUInt16LE(ZERO_DOS_TIME, 10);
    localHeader.writeUInt16LE(ZERO_DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(STORE_METHOD, 10);
    centralHeader.writeUInt16LE(ZERO_DOS_TIME, 12);
    centralHeader.writeUInt16LE(ZERO_DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(REGULAR_FILE_MODE, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectory.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((total, chunk) => total + chunk.length, 0);
  chunks.push(...centralDirectory);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);

  return Buffer.concat(chunks);
}

function dedupeAndSortEntries(entries) {
  const byPath = new Map();

  for (const entry of entries) {
    if (path.isAbsolute(entry.zipPath) || entry.zipPath.includes("..") || entry.zipPath.includes("\\")) {
      throw new Error(`unsafe zip path: ${entry.zipPath}`);
    }
    if (byPath.has(entry.zipPath)) {
      throw new Error(`duplicate zip path: ${entry.zipPath}`);
    }
    byPath.set(entry.zipPath, entry);
  }

  return [...byPath.values()].sort((a, b) => a.zipPath.localeCompare(b.zipPath, "en"));
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i++) {
  let value = i;
  for (let j = 0; j < 8; j++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[i] = value >>> 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
