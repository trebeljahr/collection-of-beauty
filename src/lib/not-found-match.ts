/**
 * "Did you mean …?" for the 404 page: match a URL nobody serves against
 * every page that does exist, and say how sure the match is.
 *
 * The confidence is what the 404 page acts on. `exact` means the URL names
 * one existing page once case, accents, separators, a stray trailing
 * bracket or a missing folder prefix are forgiven — nothing is guessed.
 * `high` is a single clear winner (a typo, a truncated link); the page
 * hangs that work where the random one would go. `medium` is several
 * plausible pages, listed without picking one. Anything weaker returns
 * null and the visitor gets the random work.
 *
 * Pure and data-free so the tests can hand in a few literal docs: the API
 * route builds the real index from the catalogue once per process.
 *
 * Scoring is token-based rather than fuse.js's character bitap. Ids are
 * long hyphenated filenames (median 53 chars, max 120), and bitap splits
 * patterns past 32 characters into chunks and averages them, which makes
 * "one clear winner" impossible to read off the score. Tokens also let
 * plate numbers match exactly: Audubon plate 55 is not plate 56.
 */

import type { ArtworkListing } from "@/lib/data";

export type MatchKind = "artwork" | "artist" | "page";

export type MatchDoc = {
  kind: MatchKind;
  /** Canonical path, e.g. "/artwork/audubon-birds-6-wild-turkey". */
  href: string;
  /** Slugs that name this doc outright when they are the URL's last
   *  segment: the id or slug itself, plus the id without its folder
   *  prefix for artworks. */
  keys: string[];
  /** Free text that describes the doc: title, English title, artist
   *  name, page label. Tokenised together with `keys`. */
  text: string[];
};

export type MatchHit = { doc: MatchDoc; score: number };

export type MatchResult = {
  confidence: "exact" | "high" | "medium";
  hits: MatchHit[];
};

export type MatchIndex = {
  docs: MatchDoc[];
  /** Distinct token → indices of the docs that contain it. */
  postings: Map<string, number[]>;
  /** Each doc's keys and text entries, tokenised one field at a time,
   *  for the coverage term. */
  docFields: string[][][];
  byHref: Map<string, number>;
  /** Key → doc indices. More than one index means the key is ambiguous
   *  and cannot count as an exact match. */
  byKey: Map<string, number[]>;
  /** Every key, sorted, for the truncated-link lookup. */
  sortedKeys: string[];
  /** The vocabulary sorted, for prefix scans. */
  sortedVocab: string[];
  /** Every vocabulary word of four letters or more under itself and
   *  under each of its one-letter deletions. A query word looks up its
   *  own deletions here and gets back every word one edit away (plus
   *  some two away) without scanning the vocabulary — the SymSpell
   *  trick. */
  deletions: Map<string, string[]>;
  prefixes: string[];
};

/** First-segment spellings a visitor might reach for, mapped to the path
 *  prefix of the pages they point at. A hint, not a filter: every doc is
 *  still scored, but a clear winner is judged among the hinted ones, so
 *  "/artist/rembrant" lands on Rembrandt even though an artwork id
 *  carries the same misspelling. */
const SECTION_HINTS: Record<string, string> = {
  artwork: "/artwork/",
  artworks: "/artwork/",
  art: "/artwork/",
  work: "/artwork/",
  works: "/artwork/",
  painting: "/artwork/",
  paintings: "/artwork/",
  artist: "/artist/",
  artists: "/artist/",
  painter: "/artist/",
  painters: "/artist/",
  era: "/era/",
  eras: "/era/",
  colour: "/colours/",
  colours: "/colours/",
  color: "/colours/",
  colors: "/colours/",
  collection: "/collection/",
  collections: "/collection/",
};

/** Ties go to the broader page: an artist before one of their works. */
const KIND_ORDER: Record<MatchKind, number> = { page: 0, artist: 1, artwork: 2 };

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

const MIN_MEDIUM_SCORE = 0.55;
const MIN_HIGH_SCORE = 0.75;
/** How far ahead of the runner-up a winner has to be to count as the
 *  page the visitor meant. */
const HIGH_MARGIN = 0.12;
const MAX_HITS = 4;
const MAX_QUERY_TOKENS = 12;
/** A cut-off link has to keep this much of the id, or its folder
 *  prefix, before a unique prefix counts as naming it. Shorter, a slug
 *  of whole words ("starry-night") is a search, not a truncated id. */
const MIN_PREFIX_LENGTH = 24;

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

export function buildMatchIndex(
  docs: MatchDoc[],
  options: { prefixes?: string[] } = {},
): MatchIndex {
  const postings = new Map<string, number[]>();
  const docFields: string[][][] = [];
  const byHref = new Map<string, number>();
  const byKey = new Map<string, number[]>();

  docs.forEach((doc, i) => {
    const fields = doc.keys
      .concat(doc.text)
      .map((field) => [...new Set(tokenize(field))])
      .filter((field) => field.length > 0);
    docFields.push(fields);
    for (const t of new Set(fields.flat())) {
      const list = postings.get(t);
      if (list) list.push(i);
      else postings.set(t, [i]);
    }
    byHref.set(doc.href, i);
    for (const key of new Set(doc.keys)) {
      const list = byKey.get(key);
      if (list) list.push(i);
      else byKey.set(key, [i]);
    }
  });

  const deletions = new Map<string, string[]>();
  for (const token of postings.keys()) {
    if (token.length < 4 || /^\d+$/.test(token)) continue;
    for (const variant of deletionVariants(token)) {
      const list = deletions.get(variant);
      if (list) list.push(token);
      else deletions.set(variant, [token]);
    }
  }

  return {
    docs,
    postings,
    docFields,
    byHref,
    byKey,
    sortedKeys: [...byKey.keys()].sort(),
    sortedVocab: [...postings.keys()].sort(),
    deletions,
    prefixes: [...(options.prefixes ?? [])].sort((a, b) => b.length - a.length),
  };
}

/**
 * How well query token `q` stands in for catalogue token `v`, 0–1.
 * Numbers must match exactly. Words tolerate one typo from four letters
 * and two from seven, and a word cut short counts as long as four
 * letters of it survive — which is what a truncated link looks like.
 */
export function tokenSimilarity(q: string, v: string): number {
  if (q === v) return 1;
  if (/^\d+$/.test(q) || /^\d+$/.test(v)) return 0;
  const shorter = Math.min(q.length, v.length);
  if (Math.abs(q.length - v.length) > 2 && !(q.length >= 4 && v.startsWith(q))) return 0;
  if (q.length >= 4 && v.startsWith(q)) return 0.8;
  if (shorter < 4) return 0;
  const distance = editDistance(q, v, 2);
  if (distance <= 1) return 0.85;
  if (distance === 2 && shorter >= 7) return 0.7;
  return 0;
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

/**
 * Split a path into a kind hint and the slug to match. "/artwork/foo"
 * hints artwork; "/foo" hints nothing. A misspelt section ("/artwrok/")
 * still counts as that section.
 */
function readSection(segments: string[]): { hint: string | null; rest: string[] } {
  if (segments.length < 2) return { hint: "/", rest: segments };
  const [first, ...rest] = segments;
  const direct = SECTION_HINTS[first];
  if (direct) return { hint: direct, rest };
  for (const [alias, kind] of Object.entries(SECTION_HINTS)) {
    if (alias.length >= 5 && editDistance(first, alias, 2) <= 2) return { hint: kind, rest };
  }
  return { hint: null, rest: segments };
}

/** Index of the first entry >= `value` in a sorted array. */
function lowerBound(sorted: string[], value: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The word itself and every way of deleting one letter from it. */
function deletionVariants(word: string): Set<string> {
  const out = new Set([word]);
  for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1));
  return out;
}

/** The vocabulary words `tokenSimilarity` could score above zero for
 *  `q`: itself, the words it is a prefix of, and the words that share a
 *  one-letter deletion with it. Nothing else is scored. */
function candidateTokens(index: MatchIndex, q: string): Set<string> {
  const out = new Set<string>();
  if (index.postings.has(q)) out.add(q);
  if (q.length < 4 || /^\d+$/.test(q)) return out;
  const vocab = index.sortedVocab;
  for (let i = lowerBound(vocab, q); i < vocab.length && vocab[i].startsWith(q); i++) {
    out.add(vocab[i]);
  }
  for (const variant of deletionVariants(q)) {
    for (const v of index.deletions.get(variant) ?? []) out.add(v);
  }
  return out;
}

function stripPrefix(slug: string, prefixes: string[]): string {
  for (const prefix of prefixes) {
    if (slug.startsWith(prefix) && slug.length > prefix.length) return slug.slice(prefix.length);
  }
  return slug;
}

function matchesHint(doc: MatchDoc, hint: string | null): boolean {
  if (!hint) return false;
  // "/" is a URL with no section: "/timline", "/monet". Someone typing a
  // bare word is after a page or a person more often than one work.
  if (hint === "/") return doc.kind !== "artwork";
  return doc.href.startsWith(hint);
}

/** Narrow to the hinted docs when any are there, so a key that is also
 *  a word in some other doc's id doesn't make the hinted one ambiguous. */
function preferHinted(index: MatchIndex, found: number[], hint: string | null): number[] {
  const hinted = found.filter((i) => matchesHint(index.docs[i], hint));
  return hinted.length > 0 ? hinted : found;
}

/** The one doc a slug names outright, if exactly one does. */
function exactDoc(index: MatchIndex, slug: string, hint: string | null): number | null {
  for (const candidate of [slug, stripPrefix(slug, index.prefixes)]) {
    const found = index.byKey.get(candidate);
    if (!found) continue;
    const pool = [...new Set(preferHinted(index, found, hint))];
    if (pool.length === 1) return pool[0];
  }
  return null;
}

/**
 * The one doc whose key starts with the slug: a link cut off by a line
 * wrap or a character limit. Works mid-word, which token matching can't
 * ("…tropical-forest-with-mon"), and for plate numbers, which it
 * deliberately won't fuzz ("audubon-birds-55").
 */
function prefixDoc(index: MatchIndex, slug: string, hint: string | null): number | null {
  const hasFolder = stripPrefix(slug, index.prefixes) !== slug;
  if (slug.length < MIN_PREFIX_LENGTH && !hasFolder) return null;
  const keys = index.sortedKeys;
  const lo = lowerBound(keys, slug);
  const remainder = stripPrefix(slug, index.prefixes);
  const found = new Set<number>();
  for (let i = lo; i < keys.length && keys[i].startsWith(slug); i++) {
    // Cut mid-word only counts on a long remainder: "…-with-mon" is a
    // truncated link, "cb9001" against "cb9001fb" is a different file.
    const atBoundary = keys[i].length === slug.length || keys[i][slug.length] === "-";
    if (!atBoundary && remainder.length < 12) continue;
    // A bare number names a plate ("audubon-birds-55"), never a year:
    // "1871" is the start of too many filenames to point at one.
    if (/^\d+$/.test(remainder) && remainder.length > 3) continue;
    for (const d of index.byKey.get(keys[i]) ?? []) found.add(d);
    // More than a handful means the prefix is a family, not a link.
    if (found.size > 3) return null;
  }
  const pool = [...new Set(preferHinted(index, [...found], hint))];
  if (pool.length !== 1) return null;
  // Under a section, only a doc from that section: "/artist/rembrant" is
  // a misspelt name, not the start of an artwork id that shares it.
  const sectioned = hint !== null && hint !== "/";
  return sectioned && !matchesHint(index.docs[pool[0]], hint) ? null : pool[0];
}

export function matchPath(index: MatchIndex, pathname: string): MatchResult | null {
  const segments = normalizePath(pathname);
  if (segments.length === 0) return null;

  const normalizedHref = `/${segments.join("/")}`;
  const direct = index.byHref.get(normalizedHref);
  if (direct !== undefined) {
    return { confidence: "exact", hits: [{ doc: index.docs[direct], score: 1 }] };
  }

  const { hint, rest } = readSection(segments);
  const slug = rest.join("-");
  const exact = exactDoc(index, slug, hint);
  if (exact !== null) {
    return { confidence: "exact", hits: [{ doc: index.docs[exact], score: 1 }] };
  }
  const truncated = prefixDoc(index, slug, hint);
  if (truncated !== null) {
    return { confidence: "high", hits: [{ doc: index.docs[truncated], score: 0.95 }] };
  }

  // Capped: past a dozen words the query is an old filename, and each
  // extra token is another pass over the vocabulary.
  const queryTokens = [...new Set(tokenize(stripPrefix(slug, index.prefixes)))].slice(
    0,
    MAX_QUERY_TOKENS,
  );
  if (queryTokens.length === 0) return null;
  // A lone short word ("sun", "3d") matches too much to mean anything.
  if (queryTokens.length === 1 && queryTokens[0].length < 4) return null;

  // best[doc][queryToken] — the strongest stand-in each doc offers for
  // each query token. Scoring vocabulary words rather than docs keeps it
  // to one similarity call per distinct catalogue word.
  const best = new Map<number, Float64Array>();
  const touched = new Map<number, Set<string>>();
  queryTokens.forEach((q, qi) => {
    for (const token of candidateTokens(index, q)) {
      const similarity = tokenSimilarity(q, token);
      if (similarity === 0) continue;
      for (const d of index.postings.get(token) ?? []) {
        let row = best.get(d);
        if (!row) {
          row = new Float64Array(queryTokens.length);
          best.set(d, row);
        }
        if (similarity > row[qi]) row[qi] = similarity;
        let hit = touched.get(d);
        if (!hit) {
          hit = new Set();
          touched.set(d, hit);
        }
        hit.add(token);
      }
    }
  });

  // Recall carries the score: how much of what the visitor typed this
  // doc explains. Coverage breaks ties toward the doc whose title (or
  // name, or slug) the query fills best, so "starry night" prefers a
  // work called exactly that over one with the phrase inside a longer
  // title. It is taken per field because ids drag in museum names and
  // inventory numbers nobody types.
  const scored: MatchHit[] = [];
  for (const [d, row] of best) {
    const recall = row.reduce((sum, s) => sum + s, 0) / queryTokens.length;
    const hit = touched.get(d) ?? new Set<string>();
    const coverage = Math.max(
      0,
      ...index.docFields[d].map((field) => field.filter((t) => hit.has(t)).length / field.length),
    );
    scored.push({ doc: index.docs[d], score: Math.min(1, 0.85 * recall + 0.15 * coverage) });
  }
  const byRank = (a: MatchHit, b: MatchHit) =>
    Number(matchesHint(b.doc, hint)) - Number(matchesHint(a.doc, hint)) ||
    b.score - a.score ||
    KIND_ORDER[a.doc.kind] - KIND_ORDER[b.doc.kind] ||
    a.doc.href.localeCompare(b.doc.href);

  const good = scored.filter((h) => h.score >= MIN_MEDIUM_SCORE);
  const hinted = good.filter((h) => matchesHint(h.doc, hint)).sort(byRank);
  // Judge the winner among the hinted docs when there are any, else
  // among everything.
  const field = hinted.length > 0 ? hinted : good.sort(byRank);
  const top = field[0];
  if (!top) return null;
  const runnerUp = field[1];

  const near = field.filter((h) => h.score >= top.score - 0.2);
  const clearWinner = !runnerUp || top.score - runnerUp.score >= HIGH_MARGIN;
  // Years and inventory numbers alone never pick a page.
  const hasWord = queryTokens.some((t) => !/^\d+$/.test(t));
  if (top.score >= MIN_HIGH_SCORE && clearWinner && hasWord) {
    return { confidence: "high", hits: near.slice(0, MAX_HITS) };
  }
  // Undecided: pad with strong matches from outside the hinted section,
  // since the hint itself may be what the visitor got wrong.
  const others = good
    .filter((h) => !field.includes(h) && h.score >= top.score - 0.1)
    .sort((a, b) => b.score - a.score);
  return { confidence: "medium", hits: [...near, ...others].slice(0, MAX_HITS) };
}

/** One suggestion as /api/not-found sends it to the 404 page. */
export type NotFoundItem = {
  kind: MatchKind;
  href: string;
  label: string;
  /** Works by the artist, for artist suggestions. */
  count: number | null;
  /** The work to show for it: the artwork itself, an artist's cover, an
   *  era's cover, a collection's first plate. Null for plain pages. */
  work: ArtworkListing | null;
};

export type NotFoundResponse = {
  suggestion: { confidence: MatchResult["confidence"]; items: NotFoundItem[] } | null;
  /** A few works to hang when nothing matched, or to swap through. */
  random: ArtworkListing[];
};
