import { describe, expect, it } from "vitest";
import type { Artwork } from "@/lib/data";
import { isoWeekKey, pickArtworks } from "./select";

function makeArtwork(id: string): Artwork {
  return {
    id,
    title: id,
    englishTitle: null,
    artist: null,
    artistSlug: "unknown",
    year: null,
    dateCreated: null,
    originalDateString: null,
    description: null,
    folder: "x",
    objectKey: `x/${id}.jpg`,
    width: null,
    height: null,
    realDimensions: null,
    variantWidths: null,
    dominantColor: null,
    colorBuckets: null,
    colorStrength: null,
    fileUrl: "",
    commonsUrl: "",
    credit: null,
    license: "Public domain",
    movement: null,
    nationality: null,
    provenance: null,
  };
}

describe("isoWeekKey", () => {
  it("returns ISO-8601 'YYYY-Www' shape", () => {
    // The week key is the seed for the random pick and the label a curator
    // reads off an edition, so the shape is part of the file's identity.
    expect(isoWeekKey(new Date(Date.UTC(2026, 0, 5)))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("handles year-boundary weeks per ISO spec", () => {
    // Jan 1 2023 was a Sunday — under ISO 8601 it belongs to W52 of 2022,
    // not W1 of 2023. The "Thursday determines the year" rule.
    expect(isoWeekKey(new Date(Date.UTC(2023, 0, 1)))).toBe("2022-W52");
    // Dec 31 2024 was a Tuesday, but the Thursday of its ISO week
    // lands on Jan 2 2025 → 2025-W01.
    expect(isoWeekKey(new Date(Date.UTC(2024, 11, 31)))).toBe("2025-W01");
  });

  it("is timezone-independent (UTC-based)", () => {
    // Both instants sit within half an hour of a UTC week boundary, in
    // opposite directions, so an implementation that read local getters
    // instead of the UTC ones would put at least one of them in the wrong
    // week on any machine that isn't itself on UTC.
    // Sunday 23:30 UTC — already Monday (next ISO week) east of UTC.
    expect(isoWeekKey(new Date("2026-04-19T23:30:00Z"))).toBe("2026-W16");
    // Monday 00:30 UTC — still Sunday (previous ISO week) west of UTC.
    expect(isoWeekKey(new Date("2026-04-20T00:30:00Z"))).toBe("2026-W17");
  });
});

describe("pickArtworks", () => {
  const pool = Array.from({ length: 20 }, (_, i) => makeArtwork(`a${i}`));

  it("is deterministic per weekKey", () => {
    // Same seed ⇒ same picks. The scaffolder may be re-run against the
    // same seed, and `sendNewsletter --dry-run` has to preview exactly
    // the works the real send would carry.
    const first = pickArtworks(pool, new Set(), "2026-W17");
    const second = pickArtworks(pool, new Set(), "2026-W17");
    expect(first.map((a) => a.id)).toEqual(second.map((a) => a.id));
  });

  it("returns distinct picks across consecutive weeks", () => {
    // Loose property check — two adjacent weeks shouldn't accidentally
    // hash to the same seed. If they did, the no-repeat exclusion list
    // would still catch it, but the assertion guards the upstream RNG.
    const w17 = pickArtworks(pool, new Set(), "2026-W17");
    const w18 = pickArtworks(pool, new Set(), "2026-W18");
    expect(w17.map((a) => a.id)).not.toEqual(w18.map((a) => a.id));
  });

  it("excludes already-sent ids", () => {
    const excluded = new Set(["a0", "a1", "a2"]);
    const picks = pickArtworks(pool, excluded, "2026-W17");
    expect(picks.every((p) => !excluded.has(p.id))).toBe(true);
  });

  it("throws when exclusion shrinks the pool below count", () => {
    // `pnpm newsletter:draft` surfaces this as a failed scaffold —
    // the signal that every catalogued work has already been featured
    // in some edition under content/newsletter/.
    const excludeAll = new Set(pool.map((p) => p.id));
    expect(() => pickArtworks(pool, excludeAll, "2026-W17")).toThrow(/remain.*need/);
  });
});
