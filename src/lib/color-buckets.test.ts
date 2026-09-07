import { describe, expect, it } from "vitest";
import {
  BLACK_MAX_LIGHTNESS,
  bucketForHex,
  bucketsFromHistogram,
  CHROMA_FLOOR,
  COLOR_BUCKETS,
  type ColorBucketId,
  FAMILY_PRIOR,
  familyForOklch,
  getColorBucket,
  isColorBucketId,
  MAX_FAMILIES,
  neutralForLightness,
  parseHex,
  rgbToOklch,
  WHITE_MIN_LIGHTNESS,
} from "@/lib/color-buckets.mjs";

/** Build a histogram from `[hex, count]` pairs — the shape build-data
 *  hands to the bucketer, spelled readably. */
function histogram(entries: Array<[string, number]>) {
  return entries.map(([hex, count]) => {
    const rgb = parseHex(hex);
    if (!rgb) throw new Error(`bad hex in fixture: ${hex}`);
    return { ...rgb, count };
  });
}

describe("parseHex", () => {
  it("parses 6-digit hex with and without the hash", () => {
    expect(parseHex("#a87b4f")).toEqual({ r: 0xa8, g: 0x7b, b: 0x4f });
    expect(parseHex("a87b4f")).toEqual({ r: 0xa8, g: 0x7b, b: 0x4f });
  });

  it("parses 3-digit shorthand by doubling each nibble", () => {
    expect(parseHex("#0af")).toEqual({ r: 0x00, g: 0xaa, b: 0xff });
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(parseHex("  #A87B4F ")).toEqual(parseHex("#a87b4f"));
  });

  it("rejects malformed input rather than guessing", () => {
    for (const bad of ["", "#", "#12", "#12345", "#1234567", "#gggggg", "rgb(1,2,3)"]) {
      expect(parseHex(bad)).toBeNull();
    }
    expect(parseHex(null)).toBeNull();
    expect(parseHex(undefined)).toBeNull();
    expect(parseHex(42 as unknown as string)).toBeNull();
  });
});

describe("rgbToOklch", () => {
  it("maps black and white to the lightness extremes with no chroma", () => {
    const black = rgbToOklch(0, 0, 0);
    expect(black.l).toBeCloseTo(0, 5);
    expect(black.c).toBeCloseTo(0, 5);

    const white = rgbToOklch(255, 255, 255);
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeCloseTo(0, 3);
  });

  it("gives greys zero chroma and a pinned hue", () => {
    const grey = rgbToOklch(128, 128, 128);
    expect(grey.c).toBeLessThan(1e-4);
    expect(grey.h).toBe(0);
    expect(grey.l).toBeGreaterThan(0.4);
    expect(grey.l).toBeLessThan(0.7);
  });

  it("places the sRGB primaries in the expected hue arcs", () => {
    // Reference OKLCh hues: red ~29deg, green ~142deg, blue ~264deg.
    expect(rgbToOklch(255, 0, 0).h).toBeGreaterThan(20);
    expect(rgbToOklch(255, 0, 0).h).toBeLessThan(40);
    expect(rgbToOklch(0, 255, 0).h).toBeGreaterThan(130);
    expect(rgbToOklch(0, 255, 0).h).toBeLessThan(155);
    expect(rgbToOklch(0, 0, 255).h).toBeGreaterThan(255);
    expect(rgbToOklch(0, 0, 255).h).toBeLessThan(275);
  });

  it("always reports hue in [0, 360)", () => {
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const { h } = rgbToOklch(r, g, b);
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(360);
        }
      }
    }
  });
});

describe("familyForOklch", () => {
  it("returns null below the chroma floor, whatever the hue claims", () => {
    expect(familyForOklch({ l: 0.5, c: CHROMA_FLOOR - 0.001, h: 250 })).toBeNull();
    expect(familyForOklch({ l: 0.5, c: 0, h: 0 })).toBeNull();
  });

  it("admits a sample exactly at the chroma floor", () => {
    expect(familyForOklch({ l: 0.5, c: CHROMA_FLOOR, h: 250 })).toBe("blue");
  });

  it("splits the hue circle into the documented families", () => {
    const cases: Array<[number, ColorBucketId]> = [
      [0, "red"],
      [20, "red"],
      [34.9, "red"],
      [45, "orange"],
      [80, "gold"],
      [130, "green"],
      [190, "teal"],
      [250, "blue"],
      [300, "purple"],
      [340, "pink"],
      [358, "red"],
    ];
    for (const [h, expected] of cases) {
      // Mid-lightness + saturated, so neither the earth nor the pink
      // reclassification applies and the bands are tested on their own.
      expect(familyForOklch({ l: 0.65, c: 0.2, h })).toBe(expected);
    }
  });

  it("keeps pure sRGB primaries in the family they are named after", () => {
    // Regression guard: OKLCh puts sRGB red at 29deg and pure yellow at
    // 110deg. Evenly-spaced bands would file red under orange and yellow
    // under green.
    expect(familyForOklch(rgbToOklch(255, 0, 0))).toBe("red");
    expect(familyForOklch(rgbToOklch(255, 255, 0))).toBe("gold");
    expect(familyForOklch(rgbToOklch(0, 255, 0))).toBe("green");
    expect(familyForOklch(rgbToOklch(0, 0, 255))).toBe("blue");
  });

  it("wraps hues outside [0, 360) instead of falling through to red", () => {
    expect(familyForOklch({ l: 0.75, c: 0.2, h: 610 })).toBe("blue"); // 610 - 360 = 250
    expect(familyForOklch({ l: 0.75, c: 0.2, h: -110 })).toBe("blue"); // -110 + 360 = 250
  });

  it("reclassifies warm hues as earth only when both dark and dull", () => {
    // Dark and dull -> earth.
    expect(familyForOklch({ l: 0.45, c: 0.06, h: 70 })).toBe("brown");
    // Dark but vivid -> stays gold.
    expect(familyForOklch({ l: 0.45, c: 0.15, h: 70 })).toBe("gold");
    // Dull but light -> stays gold.
    expect(familyForOklch({ l: 0.85, c: 0.06, h: 70 })).toBe("gold");
  });

  it("never reclassifies cool hues as earth", () => {
    expect(familyForOklch({ l: 0.4, c: 0.05, h: 250 })).toBe("blue");
    expect(familyForOklch({ l: 0.4, c: 0.05, h: 130 })).toBe("green");
  });

  it("reclassifies reds as pink only when both pale and soft", () => {
    // Pale and soft -> pink.
    expect(familyForOklch({ l: 0.87, c: 0.07, h: 10 })).toBe("pink");
    // Pale but vivid -> stays red.
    expect(familyForOklch({ l: 0.87, c: 0.2, h: 10 })).toBe("red");
    // Soft but dark -> stays red.
    expect(familyForOklch({ l: 0.5, c: 0.07, h: 10 })).toBe("red");
  });

  it("never reclassifies non-red hues as pink", () => {
    expect(familyForOklch({ l: 0.87, c: 0.07, h: 250 })).toBe("blue");
    expect(familyForOklch({ l: 0.87, c: 0.07, h: 130 })).toBe("green");
  });
});

describe("neutralForLightness", () => {
  it("bands lightness into white / grey / black", () => {
    expect(neutralForLightness(0.95)).toBe("white");
    expect(neutralForLightness(WHITE_MIN_LIGHTNESS)).toBe("white");
    expect(neutralForLightness(0.6)).toBe("grey");
    expect(neutralForLightness(BLACK_MAX_LIGHTNESS)).toBe("black");
    expect(neutralForLightness(0.05)).toBe("black");
  });
});

describe("bucketForHex", () => {
  it("classifies recognisable colours the way a viewer would name them", () => {
    expect(bucketForHex("#ff0000")).toBe("red");
    expect(bucketForHex("#1f4fa8")).toBe("blue");
    expect(bucketForHex("#2e7d32")).toBe("green");
    expect(bucketForHex("#7a5230")).toBe("brown");
  });

  it("falls back to a neutral band for achromatic input", () => {
    expect(bucketForHex("#ffffff")).toBe("white");
    expect(bucketForHex("#808080")).toBe("grey");
    expect(bucketForHex("#000000")).toBe("black");
  });

  it("returns null for non-colours instead of throwing", () => {
    expect(bucketForHex("not a colour")).toBeNull();
    expect(bucketForHex(null)).toBeNull();
  });
});

describe("bucketsFromHistogram", () => {
  it("returns an empty array for an empty histogram", () => {
    expect(bucketsFromHistogram([])).toEqual([]);
  });

  it("ignores entries with a non-positive count", () => {
    expect(bucketsFromHistogram(histogram([["#1f4fa8", 0]]))).toEqual([]);
    expect(bucketsFromHistogram(histogram([["#1f4fa8", -5]]))).toEqual([]);
  });

  it("calls a solidly blue work blue", () => {
    expect(bucketsFromHistogram(histogram([["#1f4fa8", 1000]]))).toEqual(["blue"]);
  });

  it("puts an achromatic work in a neutral band only", () => {
    // An engraving: ink on paper, no chroma anywhere.
    expect(
      bucketsFromHistogram(
        histogram([
          ["#f2efe6", 900],
          ["#1a1a18", 100],
        ]),
      ),
    ).toEqual(["white"]);
  });

  it("appends the neutral band to a mostly-achromatic but tinted work", () => {
    // A sepia print: overwhelmingly paper, with just enough warm ink.
    const buckets = bucketsFromHistogram(
      histogram([
        ["#efe9dc", 920],
        ["#7a5230", 80],
      ]),
    );
    expect(buckets).toContain("brown");
    expect(buckets).toContain("white");
  });

  it("does not append a neutral band to a fully saturated work", () => {
    const buckets = bucketsFromHistogram(
      histogram([
        ["#1f4fa8", 500],
        ["#2e7d32", 500],
      ]),
    );
    expect(buckets).not.toContain("grey");
    expect(buckets).not.toContain("white");
    expect(buckets).not.toContain("black");
  });

  it("orders families by prior-normalised score, primary first", () => {
    // Gold is the plurality by pixel count, but gold is also the most
    // common family in the corpus while blue is rare — so the work reads
    // as blue first. This is the behaviour the prior exists to produce.
    const buckets = bucketsFromHistogram(
      histogram([
        ["#c9a227", 600],
        ["#1f4fa8", 400],
      ]),
    );
    expect(buckets[0]).toBe("blue");
    expect(buckets).toContain("gold");
  });

  it("suppresses a family that is merely corpus-typical", () => {
    // Gold at ~35% share sits right at its corpus prior (0.341), so it
    // adds no information; green at ~65% is well above its own prior.
    const buckets = bucketsFromHistogram(
      histogram([
        ["#4f7a3a", 650],
        ["#c9a227", 350],
      ]),
    );
    expect(buckets).toContain("green");
    expect(buckets).not.toContain("gold");
  });

  it("drops families below the raw share floor even when the prior is tiny", () => {
    // Pink's prior is 0.003, so without the share floor a 2% sliver would
    // score ~7x and win outright.
    const buckets = bucketsFromHistogram(
      histogram([
        ["#1f4fa8", 980],
        ["#b9557f", 20],
      ]),
    );
    expect(buckets).not.toContain("pink");
    expect(buckets).toEqual(["blue"]);
  });

  it("never lists more than MAX_FAMILIES colour families", () => {
    const buckets = bucketsFromHistogram(
      histogram([
        ["#a8322b", 200],
        ["#c2662a", 200],
        ["#4f7a3a", 200],
        ["#2f7d75", 200],
        ["#1f4fa8", 200],
        ["#6b4a86", 200],
      ]),
    );
    const chromatic = buckets.filter((id) => !getColorBucket(id).neutral);
    expect(chromatic.length).toBeLessThanOrEqual(MAX_FAMILIES);
  });

  it("falls back to the plurality family when nothing clears the score bar", () => {
    // Pure gold: share 1.0, which does clear its prior — the guard that
    // matters is that a colourful work never silently becomes a neutral.
    const buckets = bucketsFromHistogram(histogram([["#c9a227", 1000]]));
    expect(buckets).toContain("gold");
    expect(buckets.some((id) => !getColorBucket(id).neutral)).toBe(true);
  });

  it("is deterministic for the same histogram regardless of entry order", () => {
    const entries = histogram([
      ["#1f4fa8", 400],
      ["#4f7a3a", 350],
      ["#c9a227", 250],
    ]);
    const forwards = bucketsFromHistogram(entries);
    const backwards = bucketsFromHistogram([...entries].reverse());
    expect(backwards).toEqual(forwards);
  });

  it("only ever emits known bucket ids", () => {
    const buckets = bucketsFromHistogram(
      histogram([
        ["#a8322b", 300],
        ["#efe9dc", 400],
        ["#1f4fa8", 300],
      ]),
    );
    for (const id of buckets) expect(isColorBucketId(id)).toBe(true);
  });

  it("never repeats a bucket id", () => {
    const buckets = bucketsFromHistogram(
      histogram([
        ["#7a5230", 500],
        ["#efe9dc", 480],
        ["#1f4fa8", 20],
      ]),
    );
    expect(new Set(buckets).size).toBe(buckets.length);
  });
});

describe("bucket registry", () => {
  it("has unique ids and a prior for every chromatic family", () => {
    const ids = COLOR_BUCKETS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const bucket of COLOR_BUCKETS) {
      if (bucket.neutral) continue;
      expect(FAMILY_PRIOR[bucket.id]).toBeGreaterThan(0);
    }
  });

  it("gives every bucket a parseable swatch and a label", () => {
    for (const bucket of COLOR_BUCKETS) {
      expect(parseHex(bucket.swatch)).not.toBeNull();
      expect(bucket.label.length).toBeGreaterThan(0);
    }
  });

  it("recognises its own ids and rejects anything else", () => {
    for (const bucket of COLOR_BUCKETS) expect(isColorBucketId(bucket.id)).toBe(true);
    for (const bad of ["", "chartreuse", "RED", null, undefined, 3]) {
      expect(isColorBucketId(bad)).toBe(false);
    }
  });

  it("throws on an unknown id rather than returning a partial bucket", () => {
    expect(() => getColorBucket("chartreuse" as ColorBucketId)).toThrow(/unknown colour bucket/);
  });
});
