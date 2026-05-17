import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Edition, EditionArtworkEntry, EditionCover } from "./types";

/**
 * Average adult reads ~225 words per minute on prose. We round up so a
 * 1-second skim doesn't show as "0 min read", which looks broken.
 */
const WORDS_PER_MINUTE = 225;

export function estimateReadingTimeMinutes(body: string): number {
  const trimmed = body.trim();
  if (trimmed.length === 0) return 0;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/**
 * Newsletter editions live as plain markdown under content/newsletter/ at
 * the repo root. The directory is read at build time (this module is
 * server-only) and acts as the single source of truth for "what's been
 * published" — the git history is the archive.
 */
const CONTENT_DIR = path.join(process.cwd(), "content", "newsletter");

const FILENAME_RE = /^(\d{4})-([a-z0-9-]+)\.md$/;

let cache: Edition[] | null = null;

/** Test-only — drop the in-memory cache so unit tests stay isolated. */
export function _resetEditionsCache(): void {
  cache = null;
}

/**
 * Parse one file's contents. Pure — exposed for unit testing.
 * Throws with a path-prefixed message if anything required is missing
 * so a malformed file fails the build loudly rather than silently
 * disappearing from the archive.
 */
export function parseEdition(filename: string, raw: string): Edition {
  const match = FILENAME_RE.exec(filename);
  if (!match) {
    throw new Error(
      `Newsletter filename "${filename}" must look like NNNN-theme-slug.md (4-digit number, hyphens).`,
    );
  }
  const [, numStr, themeSlug] = match;
  const number = Number.parseInt(numStr, 10);
  const fileSlug = `${numStr}-${themeSlug}`;

  const { data, content } = matter(raw);

  function need<T>(key: string, value: T | undefined, kind: string): T {
    if (value === undefined || value === null || (typeof value === "string" && value === "")) {
      throw new Error(`${filename}: missing or empty frontmatter "${key}" (${kind}).`);
    }
    return value;
  }

  const title = need("title", data.title as string | undefined, "string");
  const subject = (data.subject as string | undefined) ?? title;
  const publishedAt = need("publishedAt", data.publishedAt as string | undefined, "string");
  const excerpt = need("excerpt", data.excerpt as string | undefined, "string");
  const draft = Boolean(data.draft);

  const tags = parseTags(filename, data.tags);
  const cover = parseCover(filename, data.cover);

  const rawArtworks = data.artworks;
  if (!Array.isArray(rawArtworks) || rawArtworks.length !== 5) {
    throw new Error(
      `${filename}: frontmatter "artworks" must be an array of exactly 5 entries (got ${
        Array.isArray(rawArtworks) ? rawArtworks.length : typeof rawArtworks
      }).`,
    );
  }
  const artworks: EditionArtworkEntry[] = rawArtworks.map((entry: unknown, i: number) => {
    if (typeof entry === "string") return { id: entry };
    if (entry && typeof entry === "object" && "id" in entry) {
      const e = entry as { id: unknown; note?: unknown };
      if (typeof e.id !== "string" || e.id.length === 0) {
        throw new Error(`${filename}: artworks[${i}].id must be a non-empty string.`);
      }
      const note = typeof e.note === "string" && e.note.length > 0 ? e.note : undefined;
      return { id: e.id, ...(note ? { note } : {}) };
    }
    throw new Error(`${filename}: artworks[${i}] must be a string id or { id, note } object.`);
  });

  const body = content.trim();
  return {
    number,
    themeSlug,
    fileSlug,
    title,
    subject,
    publishedAt,
    excerpt,
    artworks,
    body,
    draft,
    tags,
    cover,
    readingTimeMinutes: estimateReadingTimeMinutes(body),
  };
}

function parseTags(filename: string, raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`${filename}: frontmatter "tags" must be an array of strings.`);
  }
  return raw.map((t, i) => {
    if (typeof t !== "string" || t.length === 0) {
      throw new Error(`${filename}: tags[${i}] must be a non-empty string.`);
    }
    return t;
  });
}

function parseCover(filename: string, raw: unknown): EditionCover | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") {
    throw new Error(
      `${filename}: frontmatter "cover" must be either { artworkId, alt? } or { src, alt }.`,
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.artworkId === "string" && obj.artworkId.length > 0) {
    const alt = typeof obj.alt === "string" && obj.alt.length > 0 ? obj.alt : undefined;
    return alt !== undefined ? { artworkId: obj.artworkId, alt } : { artworkId: obj.artworkId };
  }
  if (typeof obj.src === "string" && obj.src.length > 0) {
    if (typeof obj.alt !== "string" || obj.alt.length === 0) {
      throw new Error(`${filename}: cover.alt is required when cover.src is set.`);
    }
    return { src: obj.src, alt: obj.alt };
  }
  throw new Error(`${filename}: cover must set either "artworkId" or "src" + "alt".`);
}

/**
 * Load every edition from disk. Cached after the first call — the
 * directory is read-only at runtime. Sorted by issue number ascending.
 */
export function loadEditions(): Edition[] {
  if (cache) return cache;

  let entries: string[];
  try {
    entries = readdirSync(CONTENT_DIR);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      cache = [];
      return cache;
    }
    throw err;
  }

  const editions: Edition[] = [];
  const seen = new Set<number>();
  for (const filename of entries) {
    if (!filename.endsWith(".md")) continue;
    if (filename.startsWith("README")) continue;
    const raw = readFileSync(path.join(CONTENT_DIR, filename), "utf8");
    const ed = parseEdition(filename, raw);
    if (seen.has(ed.number)) {
      throw new Error(
        `Duplicate newsletter issue number ${ed.number} (file: ${filename}). ` +
          `Each edition must have a unique 4-digit prefix.`,
      );
    }
    seen.add(ed.number);
    editions.push(ed);
  }
  editions.sort((a, b) => a.number - b.number);
  cache = editions;
  return cache;
}

/** Public editions only — drafts are hidden from the site and sitemap. */
export function loadPublishedEditions(): Edition[] {
  return loadEditions().filter((e) => !e.draft);
}

export function findEdition(slug: string): Edition | undefined {
  return loadEditions().find((e) => e.fileSlug === slug || e.themeSlug === slug);
}

/**
 * Every artwork id featured in any edition so far. Drafts count — once
 * an id is in a draft we don't want the picker to suggest it for a
 * different edition, and the cost of being conservative here is zero.
 */
export function sentArtworkIds(): Set<string> {
  const set = new Set<string>();
  for (const ed of loadEditions()) {
    for (const entry of ed.artworks) set.add(entry.id);
  }
  return set;
}

/** Highest issue number used so far. 0 if none. */
export function highestIssueNumber(): number {
  const editions = loadEditions();
  if (editions.length === 0) return 0;
  return editions[editions.length - 1].number;
}
