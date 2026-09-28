/**
 * Keeps old /artwork/<id> and /artist/<slug> URLs working after the
 * catalogue renames them.
 *
 * Artwork ids are minted from source filenames, so they change whenever a
 * file does: a low-res scan swapped for a larger one, a duplicate merged
 * into its twin, an artist folded into one spelling. Every id that was
 * ever published is in the git history of src/data/artworks.json, so this
 * script walks that history, finds the ids the current catalogue no
 * longer has, and maps each to the work it became — when the evidence is
 * strong enough to send a permanent redirect on.
 *
 * A 308 is cached by browsers and search engines for good, so only
 * evidence that names one work outright counts, strongest first:
 *   1. the same Wikimedia Commons page (commonsUrl)
 *   2. the same Commons file (fileUrl)
 *   3. the same artist and the same title after case and accents, when
 *      that artist has exactly one current work so titled, the title is
 *      not just the artist's name, and the years are within a decade
 * Word-overlap title matching was tried and dropped: it sent "After a
 * success" to Vereshchagin's "After a failure" and one Hiroshige pass to
 * another. Ids that fail all three stay unmapped and the 404 page offers
 * its nearest matches instead, which is where a guess belongs. Taken-down
 * works (metadata/takedowns.json) are never mapped: a copyright takedown
 * must keep answering 404.
 *
 * A retired artist slug maps to the slug its works now carry. The rule,
 * and why the artist entries of the last run are kept, is in
 * src/lib/artist-slug-redirects.ts.
 *
 * Writes src/data/redirects.json, read by src/lib/redirects.ts. Reads the
 * catalogue from the working tree, so running it straight after
 * `pnpm assets:build-data` also catches renames that are not committed
 * yet. Run: `pnpm redirects:build`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artistSlugRedirects, type SlugMove } from "../src/lib/artist-slug-redirects";
import { normalizeSegment, tokenize } from "../src/lib/not-found-match";
import { loadTakedowns } from "./lib/takedowns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTWORKS_FILE = "src/data/artworks.json";
const OUT_FILE = path.join(ROOT, "src/data/redirects.json");

type Record_ = {
  id: string;
  folder: string;
  objectKey: string;
  title: string;
  englishTitle: string | null;
  artist: string | null;
  artistSlug: string | null;
  commonsUrl: string | null;
  fileUrl: string | null;
  year: number | null;
};

type Evidence = "commons" | "file" | "title";

const MAX_YEAR_DRIFT = 10;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 30 });
}

function slim(a: Record_): Record_ {
  return {
    id: a.id,
    folder: a.folder,
    objectKey: a.objectKey,
    title: a.title,
    englishTitle: a.englishTitle ?? null,
    artist: a.artist ?? null,
    artistSlug: a.artistSlug ?? null,
    commonsUrl: a.commonsUrl ?? null,
    fileUrl: a.fileUrl ?? null,
    year: a.year ?? null,
  };
}

/** Every artwork id ever committed, with its most recent record. `git
 *  log` lists newest first, so the first sighting wins. */
function historicalArtworks(): Map<string, Record_> {
  const shas = git(["log", "--format=%H", "--", ARTWORKS_FILE]).trim().split("\n").filter(Boolean);
  const seen = new Map<string, Record_>();
  for (const sha of shas) {
    let parsed: Record_[];
    try {
      parsed = JSON.parse(git(["show", `${sha}:${ARTWORKS_FILE}`]));
    } catch {
      // A commit where the file was malformed or briefly absent.
      continue;
    }
    for (const a of parsed) if (!seen.has(a.id)) seen.set(a.id, slim(a));
  }
  return seen;
}

function titleKeys(a: Record_): string[] {
  return [a.title, a.englishTitle].filter((t): t is string => !!t).map(normalizeSegment);
}

/** A title that only names the artist ("Gérôme") identifies nothing. */
function titleNamesWork(a: Record_): boolean {
  const artist = new Set(tokenize(a.artist ?? ""));
  return titleKeys(a).some((t) => tokenize(t).some((w) => !artist.has(w)));
}

function yearsAgree(a: Record_, b: Record_): boolean {
  return a.year == null || b.year == null || Math.abs(a.year - b.year) <= MAX_YEAR_DRIFT;
}

function uniqueBy<T>(items: T[], key: (item: T) => string | null): Map<string, T | null> {
  const out = new Map<string, T | null>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    // null marks a key two works share: evidence that picks neither.
    out.set(k, out.has(k) ? null : item);
  }
  return out;
}

function main() {
  const current: Record_[] = JSON.parse(readFileSync(path.join(ROOT, ARTWORKS_FILE), "utf8")).map(
    slim,
  );
  const currentIds = new Set(current.map((a) => a.id));
  const history = historicalArtworks();
  const takedowns = loadTakedowns();

  const byCommons = uniqueBy(current, (a) => a.commonsUrl);
  const byFile = uniqueBy(current, (a) => a.fileUrl);
  const byArtist = new Map<string, Record_[]>();
  for (const a of current) {
    const key = normalizeSegment(a.artist ?? "");
    if (!key) continue;
    byArtist.set(key, [...(byArtist.get(key) ?? []), a]);
  }

  const artworks: Record<string, string> = {};
  const evidence: Record<Evidence, number> = { commons: 0, file: 0, title: 0 };
  let takenDown = 0;
  let unmapped = 0;

  // An id that is only a folder name came from a filename that slugified
  // to nothing (all Cyrillic, all CJK). Several works shared it at once,
  // so it names none of them.
  const folders = new Set([...history.values()].map((a) => a.folder));

  for (const old of history.values()) {
    if (currentIds.has(old.id) || folders.has(old.id)) continue;
    const slash = old.objectKey.indexOf("/");
    if (takedowns.has(old.objectKey.slice(0, slash), old.objectKey.slice(slash + 1))) {
      takenDown++;
      continue;
    }

    let target: Record_ | null = null;
    let how: Evidence | null = null;
    const commons = old.commonsUrl ? byCommons.get(old.commonsUrl) : null;
    const file = old.fileUrl ? byFile.get(old.fileUrl) : null;
    if (commons) [target, how] = [commons, "commons"];
    else if (file) [target, how] = [file, "file"];
    else if (titleNamesWork(old)) {
      const sameArtist = byArtist.get(normalizeSegment(old.artist ?? "")) ?? [];
      const oldTitles = new Set(titleKeys(old));
      const sameTitle = sameArtist.filter((a) => titleKeys(a).some((t) => oldTitles.has(t)));
      if (sameTitle.length === 1 && yearsAgree(old, sameTitle[0])) {
        [target, how] = [sameTitle[0], "title"];
      }
    }

    if (target && how) {
      artworks[old.id] = target.id;
      evidence[how]++;
    } else {
      unmapped++;
    }
  }

  // Artist slugs: follow each retired slug's works to where they are now.
  const currentById = new Map(current.map((a) => [a.id, a]));
  const moves: SlugMove[] = [];
  for (const old of history.values()) {
    const now = currentById.get(currentIds.has(old.id) ? old.id : artworks[old.id]);
    if (old.artistSlug && now?.artistSlug) moves.push({ from: old.artistSlug, to: now.artistSlug });
  }
  const currentSlugs = new Set(current.flatMap((a) => (a.artistSlug ? [a.artistSlug] : [])));
  const previous: Record<string, string> = existsSync(OUT_FILE)
    ? (JSON.parse(readFileSync(OUT_FILE, "utf8")).artists ?? {})
    : {};
  const artists = artistSlugRedirects(moves, currentSlugs, previous);
  const voted = artistSlugRedirects(moves, currentSlugs);
  const kept = Object.keys(artists).filter((slug) => !Object.hasOwn(voted, slug)).length;

  const sorted = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const out = {
    _comment:
      "Generated by scripts/build-redirects.ts from the git history of src/data/artworks.json. Old id or slug -> current one; served as 308s by src/lib/redirects.ts. Do not hand-edit: rerun `pnpm redirects:build`.",
    artworks: sorted(artworks),
    artists: sorted(artists),
  };
  writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);

  console.log(
    `${history.size} ids in history, ${current.length} current. Mapped ${Object.keys(artworks).length} artwork ids ` +
      `(commons ${evidence.commons}, file ${evidence.file}, title ${evidence.title}); ` +
      `${unmapped} left to the 404 page, ${takenDown} taken down. Mapped ${Object.keys(artists).length} artist slugs ` +
      `(${kept} kept from the last run).`,
  );
}

main();
