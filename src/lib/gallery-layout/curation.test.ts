import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { getEra } from "@/lib/gallery-eras";
import { curatedQueue, roomDescription, roomTitle, schoolOf } from "./curation";

const work = (
  id: string,
  artist: string,
  nationality: string | null,
  movement: string | null,
  year: number | null,
): ArtworkListing =>
  ({
    id,
    title: id,
    artist,
    artistSlug: artist.toLowerCase().replace(/\s+/g, "-"),
    nationality,
    movement,
    year,
  }) as ArtworkListing;

const baroque = getEra("baroque");

describe("schoolOf", () => {
  it("puts the country in front of a movement that spans Europe", () => {
    expect(schoolOf(work("a", "Rubens", "Flemish", "Baroque", 1620), baroque)).toBe(
      "Flemish Baroque",
    );
    expect(schoolOf(work("b", "Velázquez", "Spanish", "Baroque", 1650), baroque)).toBe(
      "Spanish Golden Age",
    );
    expect(schoolOf(work("c", "El Greco", "Greek / Spanish", "Mannerism", 1590), baroque)).toBe(
      "Spanish Mannerism",
    );
  });

  it("keeps a movement that names itself", () => {
    expect(schoolOf(work("d", "Rembrandt", "Dutch", "Dutch Golden Age", 1650), baroque)).toBe(
      "Dutch Golden Age",
    );
  });

  it("files natural history by its books' authors", () => {
    const era = getEra("natural-history");
    expect(
      schoolOf(
        work("e", "John James Audubon", "American / French", "Natural history illustration", 1830),
        era,
      ),
    ).toBe("John James Audubon");
  });
});

describe("curatedQueue", () => {
  it("hangs a country's schools together, and an artist's works together in date order", () => {
    const works = [
      work("r2", "Rubens", "Flemish", "Baroque", 1630),
      work("c1", "Caravaggio", "Italian", "Baroque", 1600),
      work("p1", "Poussin", "French", "Baroque", 1650),
      work("r1", "Rubens", "Flemish", "Baroque", 1610),
      work("v1", "van Dyck", "Flemish", "Baroque", 1635),
      work("c2", "Caravaggio", "Italian", "Baroque", 1605),
    ];
    const queue = curatedQueue(baroque, works);
    expect(queue.map((s) => s.name)).toEqual([
      "Italian Baroque",
      "Flemish Baroque",
      "French Baroque",
    ]);
    expect(queue[1].artworks.map((a) => a.id)).toEqual(["r1", "r2", "v1"]);
  });
});

describe("roomTitle", () => {
  it("names a room after the artist who hangs most of it", () => {
    const works = [1, 2, 3, 4].map((i) => work(`r${i}`, "Rubens", "Flemish", "Baroque", 1620));
    works.push(work("v", "van Dyck", "Flemish", "Baroque", 1630));
    expect(roomTitle(works, baroque)).toBe("Rubens");
  });

  it("names a room of two schools of one movement after both", () => {
    const works = [
      work("a", "A", "Flemish", "Baroque", 1620),
      work("b", "B", "Flemish", "Baroque", 1620),
      work("c", "C", "Italian", "Baroque", 1620),
      work("d", "D", "Italian", "Baroque", 1620),
    ];
    expect(roomTitle(works, baroque)).toBe("Flemish and Italian Baroque");
  });

  it("falls back to the era for a room of many schools", () => {
    const works = [
      work("a", "A", "Flemish", "Baroque", 1620),
      work("b", "B", "Italian", "Baroque", 1620),
      work("c", "C", "French", "Baroque", 1620),
      work("d", "D", "Spanish", "Baroque", 1620),
    ];
    expect(roomTitle(works, baroque)).toBe(baroque.title);
  });
});

describe("roomDescription", () => {
  it("gives the count, the years and the artists who hang most", () => {
    const works = [
      work("a", "A", null, null, 1610),
      work("b", "A", null, null, 1630),
      work("c", "B", null, null, 1620),
    ];
    expect(roomDescription(works, "Room")).toBe("3 works, 1610–1630: A, B");
  });
});
