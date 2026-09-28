import { describe, expect, it } from "vitest";
import {
  editDistance,
  maxEdits,
  normalizePath,
  suggestFor,
  type TypoTarget,
  tokenize,
} from "./not-found-match";

const artwork = (id: string, label: string): TypoTarget => ({
  href: `/artwork/${id}`,
  label,
  keys: [id, id.replace(/^(collection-of-beauty|audubon-birds)-/, "")],
});

const TARGETS: TypoTarget[] = [
  artwork("collection-of-beauty-charles-le-brun-the-sacrifice-of-polyxena", "Polyxena"),
  artwork("audubon-birds-55-cuvier-s-regulus", "Cuvier's Regulus"),
  artwork("audubon-birds-1-wild-turkey", "Wild Turkey, plate 1"),
  artwork("audubon-birds-6-wild-turkey", "Wild Turkey, plate 6"),
  { href: "/artist/rembrandt-van-rijn", label: "Rembrandt", keys: ["rembrandt-van-rijn"] },
  { href: "/timeline", label: "Timeline", keys: ["timeline"] },
  { href: "/gallery-3d", label: "The Museum", keys: ["gallery-3d", "3d", "museum"] },
  { href: "/colours/blue", label: "Blue", keys: ["blue"] },
  { href: "/colours/red", label: "Red", keys: ["red"] },
];

const hrefFor = (path: string) => suggestFor(TARGETS, path)?.href ?? null;

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

describe("editDistance", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(editDistance("rembrnadt", "rembrandt")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("kitten", "sitting", 1)).toBe(2);
  });
});

describe("maxEdits", () => {
  it("allows more typos in longer slugs and none in short ones", () => {
    expect(maxEdits(3)).toBe(0);
    expect(maxEdits(7)).toBe(1);
    expect(maxEdits(18)).toBe(2);
    expect(maxEdits(53)).toBe(3);
  });
});

describe("suggestFor", () => {
  it("names the page a typo misspells", () => {
    expect(hrefFor("/timelin")).toBe("/timeline");
    expect(hrefFor("/artist/rembrant-van-rijn")).toBe("/artist/rembrandt-van-rijn");
    expect(hrefFor("/artwork/audubon-birds-6-wild-turky")).toBe(
      "/artwork/audubon-birds-6-wild-turkey",
    );
    expect(hrefFor("/artwork/charles-le-brun-the-sacrifice-of-polyxana")).toBe(
      "/artwork/collection-of-beauty-charles-le-brun-the-sacrifice-of-polyxena",
    );
  });

  it("matches a respelling and an alias exactly", () => {
    expect(hrefFor("/Timeline/")).toBe("/timeline");
    expect(hrefFor("/3d")).toBe("/gallery-3d");
  });

  it("returns the label with the link", () => {
    expect(suggestFor(TARGETS, "/timelin")).toEqual({ href: "/timeline", label: "Timeline" });
  });

  it("gives up on a tie between two pages", () => {
    // One edit from plate 1 and from plate 6.
    expect(hrefFor("/artwork/audubon-birds-7-wild-turkey")).toBeNull();
  });

  it("allows no typo in a short slug", () => {
    expect(hrefFor("/colours/blu")).toBeNull();
    expect(hrefFor("/rad")).toBeNull();
  });

  it("returns nothing for scanner noise or an empty path", () => {
    expect(hrefFor("/wp-admin/setup-config.php")).toBeNull();
    expect(hrefFor("/")).toBeNull();
  });
});
