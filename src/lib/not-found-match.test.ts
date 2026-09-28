import { describe, expect, it } from "vitest";
import {
  buildMatchIndex,
  editDistance,
  type MatchDoc,
  matchPath,
  normalizePath,
  tokenize,
  tokenSimilarity,
} from "./not-found-match";

const artwork = (id: string, title: string, artist: string): MatchDoc => ({
  kind: "artwork",
  href: `/artwork/${id}`,
  keys: [id, id.replace(/^(collection-of-beauty|audubon-birds)-/, "")],
  text: [title, artist],
});

const DOCS: MatchDoc[] = [
  artwork(
    "collection-of-beauty-charles-le-brun-the-sacrifice-of-polyxena",
    "The Sacrifice of Polyxena",
    "Charles Le Brun",
  ),
  artwork(
    "collection-of-beauty-henri-rousseau-tropical-forest-with-monkeys-1910-nga-61253",
    "Tropical Forest with Monkeys",
    "Henri Rousseau",
  ),
  artwork("collection-of-beauty-surprised-rousseau", "Surprised!", "Henri Rousseau"),
  artwork("audubon-birds-55-cuvier-s-regulus", "Cuvier's Regulus", "John James Audubon"),
  artwork("audubon-birds-56-red-shouldered-hawk", "Red-shouldered Hawk", "John James Audubon"),
  artwork("audubon-birds-1-wild-turkey", "Wild Turkey", "John James Audubon"),
  artwork("audubon-birds-6-wild-turkey", "Wild Turkey", "John James Audubon"),
  artwork(
    "collection-of-beauty-descent-from-the-cross-rembrant",
    "Descent from the Cross",
    "Rembrandt van Rijn",
  ),
  {
    kind: "artist",
    href: "/artist/rembrandt-van-rijn",
    keys: ["rembrandt-van-rijn"],
    text: ["Rembrandt van Rijn"],
  },
  {
    kind: "artist",
    href: "/artist/john-james-audubon",
    keys: ["john-james-audubon"],
    text: ["John James Audubon"],
  },
  { kind: "page", href: "/timeline", keys: ["timeline"], text: ["Timeline"] },
  { kind: "page", href: "/gallery-3d", keys: ["gallery-3d", "3d", "museum"], text: ["The Museum"] },
  { kind: "page", href: "/colours/blue", keys: ["blue"], text: ["Blue"] },
  {
    kind: "page",
    href: "/era/baroque",
    keys: ["baroque"],
    text: ["Baroque & the Dutch Golden Age"],
  },
];

const INDEX = buildMatchIndex(DOCS, { prefixes: ["collection-of-beauty-", "audubon-birds-"] });

const top = (path: string) => {
  const result = matchPath(INDEX, path);
  return result && { confidence: result.confidence, href: result.hits[0]?.doc.href };
};

describe("normalizePath", () => {
  it("forgives what links pick up on the way", () => {
    expect(normalizePath("/Artwork/Foo_Bar).")).toEqual(["artwork", "foo-bar"]);
    expect(normalizePath("/artwork/caf%C3%A9-scene.html")).toEqual(["artwork", "cafe-scene"]);
    expect(normalizePath("//artist//monet/")).toEqual(["artist", "monet"]);
    expect(normalizePath("/artwork/100%")).toEqual(["artwork", "100"]);
  });
});

describe("tokenize", () => {
  it("drops articles, filename furniture and scan sizes", () => {
    expect(tokenize("1280px-The_Night_Watch_-_Google_Art_Project.jpg")).toEqual(["night", "watch"]);
  });
});

describe("tokenSimilarity", () => {
  it("scores typos, truncations and exact words", () => {
    expect(tokenSimilarity("polyxena", "polyxena")).toBe(1);
    expect(tokenSimilarity("polyxana", "polyxena")).toBeGreaterThan(0.8);
    expect(tokenSimilarity("mon", "monkeys")).toBe(0);
    expect(tokenSimilarity("monk", "monkeys")).toBe(0.8);
  });

  it("never fuzzes numbers: plate 55 is not plate 56", () => {
    expect(tokenSimilarity("55", "56")).toBe(0);
    expect(tokenSimilarity("1871", "1872")).toBe(0);
  });
});

describe("editDistance", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(editDistance("rembrnadt", "rembrandt")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("kitten", "sitting", 1)).toBe(2);
  });
});

describe("matchPath", () => {
  it("calls a respelling of an existing page exact", () => {
    expect(
      top("/Artwork/Collection-of-Beauty-Charles-Le-Brun-The-Sacrifice-of-Polyxena)."),
    ).toEqual({
      confidence: "exact",
      href: "/artwork/collection-of-beauty-charles-le-brun-the-sacrifice-of-polyxena",
    });
    // Folder prefix left off.
    expect(top("/artwork/charles-le-brun-the-sacrifice-of-polyxena")?.confidence).toBe("exact");
    expect(top("/3d")).toEqual({ confidence: "exact", href: "/gallery-3d" });
  });

  it("picks one clear winner for a typo", () => {
    expect(top("/artwork/the-sacrifice-of-polyxana")).toEqual({
      confidence: "high",
      href: "/artwork/collection-of-beauty-charles-le-brun-the-sacrifice-of-polyxena",
    });
    expect(top("/timline")).toEqual({ confidence: "high", href: "/timeline" });
    expect(top("/colours/bleu")).toEqual({ confidence: "high", href: "/colours/blue" });
  });

  it("finds the work behind a cut-off link", () => {
    expect(top("/artwork/collection-of-beauty-henri-rousseau-tropical-forest-with-mon")).toEqual({
      confidence: "high",
      href: "/artwork/collection-of-beauty-henri-rousseau-tropical-forest-with-monkeys-1910-nga-61253",
    });
    expect(top("/artwork/audubon-birds-55")).toEqual({
      confidence: "high",
      href: "/artwork/audubon-birds-55-cuvier-s-regulus",
    });
  });

  it("prefers the section the URL names", () => {
    // An artwork id carries the same misspelling, but the URL asked for
    // an artist.
    expect(top("/artist/rembrant")).toEqual({
      confidence: "high",
      href: "/artist/rembrandt-van-rijn",
    });
  });

  it("lists ties without picking one", () => {
    const result = matchPath(INDEX, "/artwork/wild-turkey");
    expect(result?.confidence).toBe("medium");
    expect(result?.hits.map((h) => h.doc.href)).toEqual([
      "/artwork/audubon-birds-1-wild-turkey",
      "/artwork/audubon-birds-6-wild-turkey",
    ]);
  });

  it("never lets a bare number pick a page", () => {
    expect(matchPath(INDEX, "/artwork/1910")?.confidence ?? null).not.toBe("high");
    expect(top("/artwork/12345")).toBeNull();
  });

  it("returns nothing for scanner noise", () => {
    expect(top("/wp-admin")).toBeNull();
    expect(top("/xmlrpc.php")).toBeNull();
    expect(top("/")).toBeNull();
  });
});
