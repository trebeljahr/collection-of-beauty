/**
 * "Did you mean …?" for the 404 page: a URL one or two typos away from a
 * page that exists gets a link to that page. Nothing else is guessed. A
 * renamed id or a respelt /artwork or /artist URL never gets here, since
 * those pages redirect first (src/lib/redirects.ts).
 *
 * Pure and data-free so the tests can hand in a few literal targets: the
 * API route builds the real list from the catalogue once per process.
 */

/** A page a mistyped URL might have meant. */
export type TypoTarget = {
  href: string;
  label: string;
  /** Slugs that name the page when they are the URL's last segment: the
   *  id or slug itself, the id without its folder prefix, aliases. */
  keys: string[];
};

/** What /api/not-found sends the 404 page. */
export type NotFoundResponse = {
  suggestion: { href: string; label: string } | null;
};

/** Words that carry no identity. Most are articles in the six languages
 *  Commons filenames arrive in; the rest is filename furniture
 *  ("Google Art Project", "edited"). "art" also names nothing on a site
 *  where everything is art. */
const STOPWORDS = new Set([
  "the",
  "of",
  "a",
  "an",
  "and",
  "in",
  "on",
  "at",
  "by",
  "to",
  "with",
  "for",
  "from",
  "de",
  "la",
  "le",
  "les",
  "du",
  "des",
  "del",
  "der",
  "die",
  "das",
  "dem",
  "den",
  "von",
  "und",
  "en",
  "et",
  "el",
  "il",
  "di",
  "da",
  "lo",
  "y",
  "art",
  "google",
  "project",
  "edited",
  "jpg",
  "jpeg",
  "png",
  "tif",
  "tiff",
  "webp",
  "gif",
  "html",
  "htm",
  "php",
]);

/** Scan-size and catalogue-number tokens: "1280px", "wga08629". */
const JUNK_TOKEN = /^(\d+px|wga\d+|nga\d*)$/;

/** One URL segment in the shape catalogue slugs use: lowercase ASCII,
 *  accents folded, anything else collapsed to single hyphens. Mirrors
 *  `slugify` in utils.ts, which is how build-data minted the ids. */
export function normalizeSegment(segment: string): string {
  return segment
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/**
 * The path as normalised segments. Forgives what links pick up on the
 * way: percent-encoding, a trailing slash, the ")" or "." a chat client
 * or an email folds into the link, a file extension, doubled slashes.
 */
export function normalizePath(pathname: string): string[] {
  let path = pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // A lone "%" is not valid encoding; match on the raw string.
  }
  path = path
    .split(/[?#]/)[0]
    .replace(/[.,;:!?)\]}>'"\s]+$/, "")
    .replace(/\.(html?|php|aspx?)$/i, "");
  return path
    .split("/")
    .map(normalizeSegment)
    .filter((s) => s.length > 0);
}

export function tokenize(text: string): string[] {
  return normalizeSegment(text)
    .split("-")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !JUNK_TOKEN.test(t))
    .filter((t) => t.length >= 2 || /^\d+$/.test(t));
}

/** Optimal-string-alignment distance (Levenshtein plus adjacent swaps),
 *  giving up once every cell in a row exceeds `max`. */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/** Edits a slug of this length may carry and still name a page. Short
 *  slugs get none: "/sun" is one letter from too many things. */
export function maxEdits(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  if (length < 24) return 2;
  return 3;
}

/**
 * The page the URL's last segment misspells, if exactly one is closest
 * within `maxEdits`. A tie between two pages returns nothing: "plate 7"
 * one edit from both plate 1 and plate 6 is not a typo of either.
 */
export function suggestFor(
  targets: readonly TypoTarget[],
  pathname: string,
): { href: string; label: string } | null {
  const segments = normalizePath(pathname);
  const slug = segments.at(-1);
  if (!slug) return null;
  const limit = maxEdits(slug.length);

  let best: TypoTarget | null = null;
  let bestDistance = limit + 1;
  let tied = false;
  for (const target of targets) {
    for (const key of target.keys) {
      const distance = editDistance(slug, key, Math.min(limit, bestDistance));
      if (distance > limit || distance > bestDistance) continue;
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
        tied = false;
      } else if (target !== best) {
        tied = true;
      }
    }
  }
  if (!best || tied) return null;
  return { href: best.href, label: best.label };
}
