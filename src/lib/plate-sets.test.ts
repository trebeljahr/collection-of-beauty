import { describe, expect, it } from "vitest";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { encodeScope, parseScope, resolveScope } from "@/lib/artwork-scope";
import { COLLECTIONS, collectionArtworks } from "@/lib/collections";
import { artworks } from "@/lib/data";
import {
  getPlateSet,
  getPlateSets,
  holdingCaveats,
  holdingSentence,
  isPlateSetId,
  plateLabel,
  plateNumberFor,
  plateSetForArtwork,
  plateSetListings,
} from "@/lib/plate-sets";

describe("plate sets", () => {
  const sets = getPlateSets();

  // The two lists describe the same four books from different angles —
  // COLLECTIONS owns the bibliography and the ZIPs, PLATE_SETS owns the
  // plate numbering and the editorial page. If they drift, one surface
  // starts asserting facts the other contradicts.
  it("stays in step with COLLECTIONS: same ids, same folders", () => {
    expect(sets.map((s) => s.id).sort()).toEqual(COLLECTIONS.map((c) => c.slug).sort());
    for (const set of sets) {
      const book = COLLECTIONS.find((c) => c.slug === set.id);
      expect(book, set.id).toBeDefined();
      expect(set.folder).toBe(book?.folder);
      // Read through, not copied.
      expect(set.title).toBe(book?.title);
      expect(set.author).toBe(book?.creator);
      expect(set.scanNote).toBe(book?.sourceNote);
    }
  });

  it("gives the ZIP surface the same plate order as the collection page", () => {
    for (const book of COLLECTIONS) {
      const viaCollections = collectionArtworks(book).map((a) => a.id);
      const viaPlateSet = plateSetListings(book.slug).map((a) => a.id);
      expect(viaCollections, book.slug).toEqual(viaPlateSet);
    }
  });

  it("orders Audubon by plate number, not alphabetically by subject", () => {
    // The title sort this replaced opened the folio on the American
    // Avocet (plate 318) rather than the Wild Turkey (plate 1).
    const first = collectionArtworks(COLLECTIONS.find((c) => c.folder === "audubon-birds")!)[0];
    expect(first.title).toMatch(/Wild Turkey/);
  });

  it("defines exactly the four plate sets, each backed by a distinct folder", () => {
    expect(sets.map((s) => s.id)).toEqual([
      "audubon-birds-of-america",
      "haeckel-kunstformen-der-natur",
      "redoute-les-roses",
      "redoute-les-liliacees",
    ]);
    expect(new Set(sets.map((s) => s.folder)).size).toBe(4);
  });

  it.each(
    sets.map((s) => [s.id, s] as const),
  )("%s holds every artwork in its folder", (_id, set) => {
    const inFolder = artworks.filter((a) => a.folder === set.folder);
    expect(set.presentCount).toBe(inFolder.length);
    expect(new Set(set.plates.map((p) => p.listing.id)).size).toBe(inFolder.length);
  });

  it.each(sets.map((s) => [s.id, s] as const))("%s is ordered by plate number", (_id, set) => {
    const numbered = set.plates.filter((p) => p.plateNumber != null).map((p) => p.plateNumber!);
    const ascending = [...numbered].sort((a, b) => a - b);
    expect(numbered).toEqual(ascending);
    // Unnumbered plates sort to the end, never interleaved.
    const firstUnnumbered = set.plates.findIndex((p) => p.plateNumber == null);
    if (firstUnnumbered !== -1) {
      expect(set.plates.slice(firstUnnumbered).every((p) => p.plateNumber == null)).toBe(true);
    }
  });

  it.each(
    sets.map((s) => [s.id, s] as const),
  )("%s never claims a plate number outside the published extent", (_id, set) => {
    for (const plate of set.plates) {
      if (plate.plateNumber == null) continue;
      expect(plate.plateNumber).toBeGreaterThanOrEqual(1);
      expect(plate.plateNumber).toBeLessThanOrEqual(set.canonicalPlateCount);
    }
  });

  // The completeness claim is the whole point of these pages, so it is
  // asserted against the corpus rather than trusted.
  it("reports the three complete sets as complete", () => {
    for (const id of [
      "audubon-birds-of-america",
      "haeckel-kunstformen-der-natur",
      "redoute-les-roses",
    ]) {
      const set = getPlateSet(id);
      expect(set?.isComplete, id).toBe(true);
      expect(set?.presentCount).toBe(set?.canonicalPlateCount);
      expect(holdingSentence(set!)).toMatch(/^All \d+ plates of the complete work are here/);
    }
  });

  it("reports Les Liliacées as short of the full set, and says by how much", () => {
    const set = getPlateSet("redoute-les-liliacees");
    expect(set?.isComplete).toBe(false);
    expect(set?.presentCount).toBeLessThan(set!.canonicalPlateCount);
    expect(holdingSentence(set!)).toContain(`${set!.presentCount} of the work's`);
    // The gap must be enumerated, not merely alluded to.
    const caveat = holdingCaveats(set!).join(" ");
    expect(caveat).toContain(String(set!.missingPlateNumbers[0]));
    expect(caveat).toContain(String(set!.missingPlateNumbers.length));
  });

  it("never says 'complete' for a set with a shortfall", () => {
    for (const set of sets) {
      if (set.isComplete) continue;
      expect(holdingSentence(set)).not.toContain("complete");
    }
  });

  it("flags duplicated plate numbers instead of hiding them", () => {
    // Kunstformen holds all 100 plates but one credit line duplicates a
    // number, so it is complete AND carries a numbering caveat.
    const set = getPlateSet("haeckel-kunstformen-der-natur");
    expect(set?.isComplete).toBe(true);
    expect(set!.sharedPlateNumbers.length).toBeGreaterThan(0);
    const caveat = holdingCaveats(set!).join(" ");
    expect(caveat).toContain("Every plate is present");
    expect(caveat).toContain(String(set!.sharedPlateNumbers[0]));
  });

  it("derives the publication span without absorbing bracketed painting dates", () => {
    // Audubon's dateCreated reads "1827-1838 (publication; from a
    // painting made in Louisiana in 1821)" — 1821 is not publication.
    expect(getPlateSet("audubon-birds-of-america")?.publishedLabel).toBe("1827–1838");
    expect(getPlateSet("haeckel-kunstformen-der-natur")?.publishedLabel).toBe("1904");
  });

  it("exposes publication years as numbers, not just a display label", () => {
    // The label carries an en dash and can't be used as a schema.org
    // date; JSON-LD reads the numeric pair instead.
    const roses = getPlateSet("redoute-les-roses")!;
    expect(roses.publishedLabel).toBe(`${roses.publishedFrom}\u2013${roses.publishedTo}`);
    const haeckel = getPlateSet("haeckel-kunstformen-der-natur")!;
    expect(haeckel.publishedFrom).toBe(haeckel.publishedTo);
    expect(haeckel.publishedLabel).toBe(String(haeckel.publishedFrom));
    for (const set of sets) {
      expect(set.publishedFrom).toBeGreaterThan(1700);
      expect(set.publishedTo).toBeGreaterThanOrEqual(set.publishedFrom);
    }
  });

  it("strips redundant artist and plate-number noise from plate labels", () => {
    const haeckel = getPlateSet("haeckel-kunstformen-der-natur")!;
    for (const plate of haeckel.plates) {
      const label = plateLabel(haeckel, plate);
      expect(label).not.toMatch(/^Haeckel/i);
      expect(label).not.toMatch(/\d$/);
    }
    const audubon = getPlateSet("audubon-birds-of-america")!;
    for (const plate of audubon.plates.slice(0, 40)) {
      expect(plateLabel(audubon, plate)).not.toMatch(/\(Plate \d+\)$/);
    }
  });

  it("resolves a plate set and plate number from an artwork", () => {
    const avocet = artworks.find((a) => a.objectKey === "audubon-birds/318_American_Avocet.jpg");
    const set = plateSetForArtwork(avocet!);
    expect(set?.id).toBe("audubon-birds-of-america");
    expect(plateNumberFor(avocet!.id, "audubon-birds-of-america")).toBe(318);
  });

  it("returns null for artworks outside any plate set", () => {
    const other = artworks.find((a) => a.folder === "collection-of-beauty");
    expect(plateSetForArtwork(other!)).toBeNull();
  });

  it("returns nothing for an unknown set id", () => {
    expect(getPlateSet("not-a-set")).toBeNull();
    expect(isPlateSetId("not-a-set")).toBe(false);
    expect(plateSetListings("not-a-set")).toEqual([]);
  });
});

describe("collection scope", () => {
  it("round-trips through parseScope/encodeScope", () => {
    const scope = { kind: "collection", id: "redoute-les-roses" } as const;
    expect(encodeScope(scope)).toBe("collection:redoute-les-roses");
    expect(parseScope("collection:redoute-les-roses")).toEqual(scope);
  });

  it("rejects an unknown collection id rather than resolving an empty scope", () => {
    expect(parseScope("collection:nope")).toBeNull();
  });

  it("resolves to plate order, matching the page", () => {
    const resolved = resolveScope({ kind: "collection", id: "audubon-birds-of-america" });
    expect(resolved.map((a) => a.id)).toEqual(
      plateSetListings("audubon-birds-of-america").map((a) => a.id),
    );
  });
});

describe("collection pagination", () => {
  // Load-more batches must stitch onto the server-rendered first page
  // exactly; a mismatch silently repeats or skips plates mid-scroll.
  it.each(
    getPlateSets().map((s) => [s.id] as const),
  )("%s pages through in the same order the page renders", (id) => {
    const expected = plateSetListings(id).map((a) => a.id);
    const collected: string[] = [];
    let offset = 0;
    for (;;) {
      const page = getArtworkListingPage({ collection: id, sort: "plate", offset, limit: 80 });
      expect(page.total).toBe(expected.length);
      collected.push(...page.items.map((a) => a.id));
      if (page.nextOffset == null) break;
      offset = page.nextOffset;
    }
    expect(collected).toEqual(expected);
  });

  it("ignores an unknown collection id instead of falling back to the whole corpus", () => {
    const page = getArtworkListingPage({ collection: "nope", sort: "plate", limit: 10 });
    expect(page.total).toBe(0);
  });
});
