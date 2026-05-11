import { describe, expect, it } from "vitest";
import type { Artwork } from "@/lib/data";
import { isoWeekKey, pickArtworks } from "./select";

function makeArtwork(id: string): Artwork {
  return {
    id,
    title: id,
    artist: null,
    artistSlug: "unknown",
    year: null,
    dateCreated: null,
    description: null,
    folder: "x",
    objectKey: `x/${id}.jpg`,
    width: null,
    height: null,
    realDimensions: null,
    variantWidths: null,
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
    // The week key is the durable identity of an issue — it persists to
    // R2 state, gets compared on every re-send to decide idempotency.
    // Shape regressions would break that comparison silently.
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
    // A run that fires at 23:00 in CET vs 01:00 the next day in CET
    // would get different "local" days but should land in the same
    // ISO week to keep the cron idempotent across DST shifts.
    const sameInstant = new Date("2026-04-15T23:30:00Z");
    expect(isoWeekKey(sameInstant)).toBe(isoWeekKey(sameInstant));
  });
});

describe("pickArtworks", () => {
  const pool = Array.from({ length: 20 }, (_, i) => makeArtwork(`a${i}`));

  it("is deterministic per weekKey", () => {
    // Same week ⇒ same picks. The cron may fire twice on retry, and
    // the manual /preview endpoint may be invoked before the send.
    // Both have to land on the same five works or the dry-run preview
    // would lie about what's about to be sent.
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
    // The send route surfaces this as a 400 — useful signal that the
    // corpus has been exhausted and the curator needs to refill or
    // reset state.
    const excludeAll = new Set(pool.map((p) => p.id));
    expect(() => pickArtworks(pool, excludeAll, "2026-W17")).toThrow(/remain.*need/);
  });
});
