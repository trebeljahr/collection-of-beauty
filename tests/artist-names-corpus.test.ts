import { describe, expect, it } from "vitest";

import artistsDb from "../scripts/artists-db.json";
import artists from "../src/data/artists.json";
import { flagArtistName } from "../src/lib/artist-name";

/**
 * Tripwire over the *generated* data.
 *
 * Roughly a dozen artist pages were named after Wikimedia Commons uploader
 * usernames — "Ji-Elle", "Gsimonov", "PMRMaeyaert" — because Commons' single
 * free-text `Artist` field names whoever photographed the painting. They
 * rendered as real artist pages and sat in the sitemap. Corrections live in
 * `metadata/artist-overrides.json`; this test stops the class from silently
 * coming back with the next ingest.
 *
 * Failing here is a data problem, not a code one: add the work to
 * `metadata/artist-overrides.json` (with the Commons evidence for the real
 * creator, or `null` when there isn't one) and re-run
 * `pnpm assets:build-data`.
 */

type ArtistRecord = { slug: string; name: string; count: number };
type ArtistsDb = { artists: { name: string; aliases?: string[] }[] };

const roster = artists as ArtistRecord[];

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

const curated = new Set<string>();
for (const entry of (artistsDb as ArtistsDb).artists) {
  curated.add(fold(entry.name));
  for (const alias of entry.aliases ?? []) curated.add(fold(alias));
}

describe("generated artist roster", () => {
  it("has no artist named after an uploader handle or placeholder", () => {
    const offenders = roster
      .map((a) => ({ ...a, flag: flagArtistName(a.name) }))
      .filter((a) => a.flag === "uploader-handle" || a.flag === "placeholder")
      .map(
        (a) =>
          `${a.name} (${a.flag}, ${a.count} work${a.count === 1 ? "" : "s"}, /artist/${a.slug})`,
      );

    expect(offenders).toEqual([]);
  });

  it("only ships single-word artist names that the curated DB confirms", () => {
    // "Giorgione" and "Illufant" are the same shape; the artists DB is what
    // separates a mononym painter from a Commons username.
    const unconfirmed = roster
      .filter((a) => flagArtistName(a.name) === "unconfirmed-mononym")
      .filter((a) => !curated.has(fold(a.name)))
      .map((a) => `${a.name} (${a.count} work${a.count === 1 ? "" : "s"}, /artist/${a.slug})`);

    expect(unconfirmed).toEqual([]);
  });

  it("gives every artist page a slug and at least one work", () => {
    for (const a of roster) {
      expect(a.slug, a.name).toMatch(/^[a-z0-9-]+$/);
      expect(a.count, a.name).toBeGreaterThan(0);
    }
  });
});
