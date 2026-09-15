import { describe, expect, it } from "vitest";
import { ARTIST_COVERS, type CoverPick, ERA_COVERS } from "./cover-picks";
import { artists, artworkListings } from "./data";
import { assignEra, ERAS } from "./gallery-eras";

const listingById = new Map(artworkListings.map((a) => [a.id, a]));

// Two percentages, e.g. "50% 20%". Anything else is either a typo that CSS
// silently drops or a keyword whose crop nobody checked by eye.
const POSITION = /^\d{1,3}% \d{1,3}%$/;

function expectValidPick(pick: CoverPick) {
  if (pick.position !== undefined) expect(pick.position).toMatch(POSITION);
  if (pick.fit !== undefined) expect(pick.position).toBeUndefined();
}

describe("ARTIST_COVERS", () => {
  const knownSlugs = new Set(artists.map((a) => a.slug));

  it.each(Object.entries(ARTIST_COVERS))("%s picks one of the artist's own works", (slug, pick) => {
    expect(knownSlugs.has(slug)).toBe(true);
    expect(listingById.get(pick.id)?.artistSlug).toBe(slug);
    expectValidPick(pick);
  });

  it("is what the exported artists carry", () => {
    for (const artist of artists) {
      const pick = ARTIST_COVERS[artist.slug];
      if (!pick) continue;
      expect(artist.coverObjectKey).toBe(listingById.get(pick.id)?.objectKey);
      expect(artist.coverPosition).toBe(pick.position ?? null);
    }
  });
});

describe("ERA_COVERS", () => {
  it.each(ERAS.map((e) => e.id))("%s picks a work that hangs in that era", (id) => {
    const pick = ERA_COVERS[id];
    expect(pick).toBeDefined();
    const work = listingById.get(pick.id);
    expect(work).toBeDefined();
    expect(assignEra(work!)).toBe(id);
    expect(pick.fit).toBeUndefined();
    expectValidPick(pick);
  });
});
