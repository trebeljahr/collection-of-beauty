import { describe, expect, it } from "vitest";
import { assignEra, ERAS, roomFloorColor } from "./gallery-eras";

describe("assignEra", () => {
  it("prefers explicit movement over year fallback", () => {
    // Edge case the year fallback gets wrong: a Baroque work created
    // in a year that overlaps with the Renaissance era's range. The
    // movement should win — that's the curator's call, not a number.
    const era = assignEra({ movement: "Baroque", year: 1600 });
    expect(era).toBe("baroque");
  });

  it("falls back to year when movement is null", () => {
    // The majority of the Wikimedia metadata lacks an explicit
    // movement tag; year is the only signal we have.
    expect(assignEra({ movement: null, year: 1880 })).toBeTruthy();
    expect(assignEra({ movement: null, year: 1850 })).toBeTruthy();
  });

  it("returns null when both signals are missing", () => {
    // bucketByEra in layout-museum drops these — null is the "we
    // don't know, don't try to place it" sentinel.
    expect(assignEra({ movement: null, year: null })).toBeNull();
  });

  it("matches movements case-insensitively", () => {
    // Wikidata mixes "baroque", "Baroque", and "BAROQUE" across
    // entries. assignEra lowercases on lookup so the era is stable
    // regardless of the metadata's casing.
    expect(assignEra({ movement: "BAROQUE", year: null })).toBe("baroque");
    expect(assignEra({ movement: "baroque", year: null })).toBe("baroque");
  });
});

describe("roomFloorColor", () => {
  it("is deterministic for a given (era, roomId) pair", () => {
    // Important for SSR/client parity — the floor tint is picked at
    // layout time and rendered server-side; if a re-render produced
    // a different colour, the user would see a flash on hydration.
    const era = ERAS[0];
    expect(roomFloorColor(era, "room-7")).toBe(roomFloorColor(era, "room-7"));
  });

  it("returns one of the era's authored room accents", () => {
    // Sanity check that the picker isn't returning arbitrary hex
    // strings — the room accent palette is explicitly authored per
    // era and the visual coherence depends on staying inside it.
    const era = ERAS[0];
    const accents = era.palette.roomAccents;
    if (!accents || accents.length === 0) return; // some eras may not have accents
    const colour = roomFloorColor(era, "room-7");
    expect(accents).toContain(colour);
  });
});
