import { describe, expect, it } from "vitest";

import { artworkAlt, displayTitle, originalTitleSubtitle } from "./artwork-format";
import { artworks } from "./data";

describe("originalTitleSubtitle", () => {
  it("shows the original title when the source is in another script", () => {
    expect(
      originalTitleSubtitle({ title: "Спящая царевна", englishTitle: "The Sleeping Princess" }),
    ).toBe("Спящая царевна");
    expect(
      originalTitleSubtitle({
        title: "冨嶽三十六景 神奈川沖浪裏",
        englishTitle: "The Great Wave off Kanagawa",
      }),
    ).toBe("冨嶽三十六景 神奈川沖浪裏");
  });

  it("hides the source title when an override merely cleans up Latin text", () => {
    expect(
      originalTitleSubtitle({
        title: "The Gold Scab - Eruption in Frilthy Lucre",
        englishTitle: "The Gold Scab: Eruption in Filthy Lucre (The Creditor)",
      }),
    ).toBeNull();
    expect(
      originalTitleSubtitle({ title: "Monet w24", englishTitle: "Road to the Saint-Siméon Farm" }),
    ).toBeNull();
  });

  it("returns null when there is no override or no letters", () => {
    expect(originalTitleSubtitle({ title: "Nighthawks", englishTitle: null })).toBeNull();
    expect(originalTitleSubtitle({ title: "Nighthawks", englishTitle: "Nighthawks" })).toBeNull();
    expect(originalTitleSubtitle({ title: "1234", englishTitle: "Some Title" })).toBeNull();
  });
});

describe("displayTitle / artworkAlt", () => {
  it("prefers the English override and builds alt text", () => {
    const art = {
      title: "Спящая царевна",
      englishTitle: "The Sleeping Princess",
      artist: "Viktor Vasnetsov",
      year: 1900,
    };
    expect(displayTitle(art)).toBe("The Sleeping Princess");
    expect(artworkAlt(art)).toBe("The Sleeping Princess by Viktor Vasnetsov, 1900");
  });
});

describe("catalogue titles", () => {
  it("carry no prefix of a saved preview", () => {
    // A browser saves a Wikipedia preview as "1280px-<name>", and a title
    // made from that filename kept the prefix until build-data began to
    // strip it. The source title also goes out as JSON-LD `alternateName`.
    const prefix = /^\d+px-/;
    const prefixed = artworks
      .filter((a) => prefix.test(a.title) || prefix.test(a.englishTitle ?? ""))
      .map((a) => a.id);
    expect(prefixed).toEqual([]);
  });
});
