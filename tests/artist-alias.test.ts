import { describe, expect, it } from "vitest";

import {
  buildArtistAliasIndex,
  isQualifiedArtistName,
  matchArtist,
  matchArtistExact,
  unqualifiedArtistName,
} from "../scripts/lib/artist-alias.mjs";

const byAlias = buildArtistAliasIndex([
  { name: "Hieronymus Bosch", aliases: ["Hieronymus Bosch", "Jheronimus Bosch", "Bosch"] },
  { name: "Rembrandt van Rijn", aliases: ["Rembrandt van Rijn", "Rembrandt"] },
  { name: "Titian", aliases: ["Titian", "Tiziano Vecellio"] },
  { name: "Michelangelo Buonarroti", aliases: ["Michelangelo Buonarroti", "Michelangelo"] },
  { name: "Gustaf Lundberg", aliases: ["Gustaf Lundberg"] },
  { name: "Vincent van Gogh", aliases: ["Vincent van Gogh", "Van Gogh"] },
]);

const nameOf = (name: string) => matchArtist(name, byAlias)?.name ?? null;

describe("matchArtist", () => {
  it("does not read the painter out of a qualified name", () => {
    expect(nameOf("Follower of Hieronymus Bosch")).toBeNull();
    expect(nameOf("Circle of Rembrandt")).toBeNull();
    expect(nameOf("Workshop of Rembrandt")).toBeNull();
    expect(nameOf("Imitator of Rembrandt")).toBeNull();
    expect(nameOf("After Hieronymus Bosch")).toBeNull();
  });

  it("matches the credited maker, not the painter a copy or print is after", () => {
    expect(nameOf("Giovanni Cariani / Formerly attributed to Titian")).toBeNull();
    expect(nameOf("Bastiano da Sangallo / After Michelangelo")).toBeNull();
    expect(nameOf("Gustaf Lundberg / After Jean-Baptiste Santerre")).toBe("Gustaf Lundberg");
    expect(nameOf("Vincent van Gogh / After Jean-François Millet")).toBe("Vincent van Gogh");
  });

  it("keeps the names museums catalogue under the painter", () => {
    expect(nameOf("Attributed to Rembrandt")).toBe("Rembrandt van Rijn");
    expect(nameOf("Hieronymus Bosch or workshop")).toBe("Hieronymus Bosch");
    expect(nameOf("Rembrandt van Rijn and workshop")).toBe("Rembrandt van Rijn");
  });

  it("still matches plain names by alias, containment and last token", () => {
    expect(nameOf("Jheronimus Bosch")).toBe("Hieronymus Bosch");
    expect(nameOf("Vincent van Gogh.")).toBe("Vincent van Gogh");
    expect(nameOf("Tiziano Vecellio")).toBe("Titian");
  });
});

describe("unqualifiedArtistName", () => {
  it("drops qualified credits and cuts a credit at its qualifier", () => {
    expect(unqualifiedArtistName("Follower of Hieronymus Bosch")).toBe("");
    expect(unqualifiedArtistName("After Jacob Jordaens / Marinus Robyn van der Goes")).toBe(
      "Marinus Robyn van der Goes",
    );
    expect(unqualifiedArtistName("Jean-Nicolas Laugier after Jacques-Louis David.")).toBe(
      "Jean-Nicolas Laugier",
    );
    expect(unqualifiedArtistName("Titian / Giorgione")).toBe("Titian / Giorgione");
  });
});

describe("isQualifiedArtistName", () => {
  it("flags follower, circle, workshop, imitator, after and formerly attributed", () => {
    expect(isQualifiedArtistName("Workshop of Gerard van Honthorst")).toBe(true);
    expect(isQualifiedArtistName("Giovanni Cariani / Formerly attributed to Titian")).toBe(true);
    expect(isQualifiedArtistName("Attributed to Francisco Goya")).toBe(false);
    expect(isQualifiedArtistName("Frans Snyders and workshop")).toBe(false);
    expect(isQualifiedArtistName(null)).toBe(false);
  });
});

describe("matchArtistExact", () => {
  it("leaves a researched qualified name as its own artist", () => {
    expect(matchArtistExact("Attributed to Rembrandt", byAlias)).toBeNull();
    expect(matchArtistExact("Rembrandt", byAlias)?.name).toBe("Rembrandt van Rijn");
  });
});
