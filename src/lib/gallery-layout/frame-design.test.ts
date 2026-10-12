import { describe, expect, it } from "vitest";
import { artworkListings, movements } from "@/lib/data";
import {
  FINISHES,
  frameExtents,
  frameMoulding,
  frameReach,
  frameScale,
  hasFrameRule,
  LOOK_IDS,
  looksFor,
  pickFrameDesign,
  pickPairDesign,
  readPicture,
} from "./frame-design";
import { buildStyle } from "./frame-styles";

type Work = Parameters<typeof pickFrameDesign>[0];
const work = (id: string, movement: string | null, year: number | null, more = {}): Work => ({
  id,
  movement,
  year,
  ...more,
});
const ids = Array.from({ length: 80 }, (_, i) => `w${i}`);
const looksOf = (movement: string | null, year: number | null, more = {}) =>
  ids.map((id) => pickFrameDesign(work(id, movement, year, more)).look);
const share = (looks: string[], ...wanted: string[]) =>
  looks.filter((l) => wanted.includes(l)).length / looks.length;

describe("readPicture", () => {
  it("reads lightness from the average colour", () => {
    expect(readPicture(work("a", null, null, { dominantColor: "#1b130d" })).light).toBeLessThan(
      0.25,
    );
    expect(readPicture(work("a", null, null, { dominantColor: "#f5f6f5" })).light).toBeGreaterThan(
      0.9,
    );
  });

  it("takes warmth from the colour families more than from the average", () => {
    // Nearly every painting averages to a warm brown. The families are
    // what tell a seascape from an interior.
    const sea = readPicture(
      work("a", null, null, { dominantColor: "#6d6a5c", colorBuckets: ["blue", "teal", "grey"] }),
    );
    const interior = readPicture(
      work("a", null, null, { dominantColor: "#6d5a3c", colorBuckets: ["red", "gold", "brown"] }),
    );
    expect(sea.warmth).toBeLessThan(-0.3);
    expect(interior.warmth).toBeGreaterThan(0.5);
  });

  it("copes with a work that has no colour", () => {
    const tone = readPicture(work("a", null, null));
    expect(tone.light).toBeGreaterThan(0);
    expect(tone.warmth).toBeGreaterThanOrEqual(-1);
  });
});

describe("pickFrameDesign", () => {
  it("is stable per work", () => {
    const w = work("collection-of-beauty-some-baroque-canvas", "Baroque", 1640);
    expect(pickFrameDesign(w)).toBe(pickFrameDesign(w));
    expect(pickFrameDesign({ ...w }).key).toBe(pickFrameDesign(w).key);
  });

  it("mats prints and mounts silk whatever their date", () => {
    const matted = ["print", "oxford"];
    for (const id of ids) {
      expect(pickFrameDesign(work(id, "Ukiyo-e", 1830)).style).toBe("print");
      expect(matted).toContain(
        pickFrameDesign(work(id, "Natural history illustration", 1838)).style,
      );
      expect(matted).toContain(pickFrameDesign(work(id, "Botanical illustration", 1805)).style);
      for (const design of [
        pickFrameDesign(work(id, "Natural history illustration", 1838)),
        pickFrameDesign(work(id, "Ukiyo-e", 1830)),
      ]) {
        expect(design.slots[1].surface).toBe("board");
      }
      // Sesshū: fifteenth century, but ink on paper, not a panel.
      expect(["mount", "scroll"]).toContain(
        pickFrameDesign(work(id, "Classical East Asian", 1486)).style,
      );
    }
  });

  it("puts works before 1500 in panel frames whatever their school", () => {
    for (const movement of ["Renaissance", "Northern Renaissance", null]) {
      for (const id of ids) {
        expect(["cassetta", "tabernacle", "bolection"]).toContain(
          pickFrameDesign(work(id, movement, 1470)).style,
        );
      }
    }
  });

  it("matches the narrower school first", () => {
    // Never the Louis XV gilt a plain "Impressionism" match could give.
    expect(share(looksOf("Post-Impressionism", 1890), "louisXV", "paleGiltScoop")).toBe(0);
    expect(new Set(looksOf("Neo-Impressionism", 1888))).toEqual(
      new Set(["degasWhite", "whiteScoop", "paleGiltScoop", "canted"]),
    );
    expect(share(looksOf("Dutch Golden Age", 1650), "baroque", "salvator", "spanish")).toBe(0);
  });

  it("has a rule for every movement in the catalogue", () => {
    // A tagged work without a rule would hang in a frame chosen by its
    // year alone.
    for (const movement of movements) {
      expect(hasFrameRule(movement), `no frame rule for "${movement}"`).toBe(true);
    }
  });

  it("names only looks that exist, with a weight", () => {
    for (const movement of [...movements, null]) {
      for (const year of [1450, 1650, 1800, 1880, 1930, null]) {
        const looks = looksFor({ movement, year });
        expect(looks.length).toBeGreaterThan(0);
        for (const [look, weight] of looks) {
          expect(LOOK_IDS).toContain(look);
          expect(weight).toBeGreaterThan(0);
        }
      }
    }
  });

  it("frames a modern floor in strips and floaters and an old one in gilt", () => {
    const modern = ids.map((id) => pickFrameDesign(work(id, "Cubism", 1912)).style);
    expect(modern.filter((s) => s === "floater" || s === "strip").length).toBeGreaterThan(18);
    expect(modern.filter((s) => s === "leafTorus" || s === "swept" || s === "cassetta")).toEqual(
      [],
    );
    const old = ids.map((id) => pickFrameDesign(work(id, "Baroque", 1650)).slots[0].finish);
    expect(old.filter((f) => FINISHES[f].surface === "leaf").length).toBeGreaterThan(45);
  });
});

describe("matching the frame to the picture", () => {
  const dark = { dominantColor: "#2a1d14", colorBuckets: ["brown", "black"] };
  const pale = { dominantColor: "#d9d6c8", colorBuckets: ["white", "blue", "grey"] };

  it("gives a dark painting gilding more often than a pale one", () => {
    const gilded = (more: object) =>
      ids.filter((id) => {
        const finish = pickFrameDesign(work(id, "Realism", 1870, more)).slots[0].finish;
        return FINISHES[finish].surface === "leaf";
      }).length;
    expect(gilded(dark)).toBeGreaterThan(gilded(pale) + 5);
  });

  it("gives a high-key painting a pale or painted frame more often", () => {
    const light = (more: object) =>
      share(looksOf("Impressionism", 1880, more), "whiteScoop", "degasWhite", "paleGiltScoop");
    expect(light(pale)).toBeGreaterThan(light(dark) + 0.2);
  });

  it("warms the gold beside a cool picture and cools it beside a warm one", () => {
    const red = (more: object) =>
      ids.filter(
        (id) => pickFrameDesign(work(id, "Rococo", 1760, more)).slots[0].finish === "giltRed",
      ).length;
    const cool = { dominantColor: "#5b6468", colorBuckets: ["blue", "teal"] };
    const warm = { dominantColor: "#7a4a2c", colorBuckets: ["red", "orange", "gold"] };
    expect(red(cool)).toBeGreaterThan(red(warm) + 8);
  });

  it("frames a Spanish Baroque canvas in black and gold more than an Italian one", () => {
    const spanish = share(looksOf("Baroque", 1640, { nationality: "Spanish" }), "spanish");
    const italian = share(looksOf("Baroque", 1640, { nationality: "Italian" }), "spanish");
    expect(spanish).toBeGreaterThan(italian + 0.15);
  });

  it("cuts a mat darker than a white sheet and tints it toward the picture", () => {
    const matOf = (id: string, more: object) => {
      const design = pickFrameDesign(work(id, "Botanical illustration", 1805, more));
      expect(design.slots[1].finish).toBe("mat");
      return design.slots[1].tint;
    };
    const lum = (t: readonly number[]) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
    let warmer = 0;
    for (const id of ids) {
      const onWhite = matOf(id, { dominantColor: "#f5f6f5", colorBuckets: ["white"] });
      // A mat is board, not paper white, and never darker than mid grey.
      expect(lum(onWhite)).toBeLessThan(0.93);
      expect(lum(onWhite)).toBeGreaterThan(0.4);
      const warm = matOf(id, { dominantColor: "#c9a36a", colorBuckets: ["gold", "orange"] });
      const cool = matOf(id, { dominantColor: "#7f95a8", colorBuckets: ["blue"] });
      if (warm[0] / warm[2] > cool[0] / cool[2]) warmer++;
    }
    expect(warmer).toBeGreaterThan(ids.length * 0.9);
  });
});

// These walk the whole catalogue: about 4,500 designs.
describe("variety", { timeout: 60_000 }, () => {
  it("gives almost every work in the catalogue a frame of its own", () => {
    const keys = new Set(artworkListings.map((a) => pickFrameDesign(a).key));
    expect(keys.size).toBeGreaterThan(artworkListings.length * 0.97);
  });

  it("spreads each large school over several mouldings and finishes", () => {
    const bySchool = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const a of artworkListings) {
      const d = pickFrameDesign(a);
      const school = a.movement ?? "untagged";
      const kinds = bySchool.get(school) ?? new Set();
      kinds.add(`${d.style}/${d.options.variant}/${d.slots[0].finish}`);
      bySchool.set(school, kinds);
      counts.set(school, (counts.get(school) ?? 0) + 1);
    }
    for (const [school, n] of counts) {
      if (n < 100) continue;
      expect(bySchool.get(school)?.size, school).toBeGreaterThanOrEqual(8);
    }
  });

  it("uses every look and every moulding somewhere in the catalogue", () => {
    const looks = new Set(artworkListings.map((a) => pickFrameDesign(a).look));
    for (const look of LOOK_IDS) expect(looks.has(look), look).toBe(true);
  });
});

describe("pickPairDesign", () => {
  it("draws from the looks both schools hang in", () => {
    // Baroque and Dutch Golden Age share one look: the wood bolection.
    for (const id of ids) {
      const a = pickPairDesign(work(id, "Baroque", 1640), work("b", "Dutch Golden Age", 1642));
      const b = pickPairDesign(work(id, "Dutch Golden Age", 1642), work("b", "Baroque", 1640));
      expect(a.look).toBe("bolection");
      expect(b.look).toBe("bolection");
    }
  });

  it("is one of the lead's own looks when the schools are the same", () => {
    const own = new Set(looksFor({ movement: "Romanticism", year: 1830 }).map(([look]) => look));
    for (const id of ids) {
      const pair = pickPairDesign(
        work(id, "Romanticism", 1830),
        work(`${id}-twin`, "Romanticism", 1820),
      );
      expect(own.has(pair.look)).toBe(true);
    }
  });

  it("falls back to the lead's own frame when the schools share none", () => {
    for (const id of ids) {
      const lead = work(id, "Ukiyo-e", 1830);
      expect(pickPairDesign(lead, work("b", "Baroque", 1640))).toBe(pickFrameDesign(lead));
    }
    expect(pickPairDesign(work("a", "Nihonga", 1907), work("b", "Shin-hanga", 1916)).style).toBe(
      "mount",
    );
  });

  it("weighs both pictures", () => {
    // A pale partner pulls a Realist pair away from dark wood.
    const dark = { dominantColor: "#2a1d14", colorBuckets: ["brown"] };
    const pale = { dominantColor: "#dcd9cc", colorBuckets: ["white", "grey"] };
    const gilt = (partner: object) =>
      ids.filter((id) => {
        const pair = pickPairDesign(
          work(id, "Realism", 1870, dark),
          work("b", "Realism", 1875, partner),
        );
        return FINISHES[pair.slots[0].finish].surface === "leaf";
      }).length;
    expect(gilt(dark)).toBeGreaterThanOrEqual(gilt(pale));
  });
});

describe("frame reach", () => {
  it("grows with the work and is the moulding's width at its scale", () => {
    for (const a of artworkListings.slice(0, 400)) {
      const design = pickFrameDesign(a);
      const small = frameReach(design, 0.3, 0.4);
      const large = frameReach(design, 3.2, 2);
      expect(large).toBeGreaterThanOrEqual(small);
      expect(small).toBeGreaterThan(0.009);
      expect(large).toBeLessThan(0.26);
      expect(frameExtents(design, 1, 1).side).toBe(frameReach(design, 1, 1));
      expect(frameReach(design, 1, 1)).toBeCloseTo(
        buildStyle(design.style, design.options).width * frameScale(design, 1, 1),
        12,
      );
    }
  });

  it("cuts a floater at one size", () => {
    const floater = ids
      .map((id) => pickFrameDesign(work(id, "Suprematism", 1915)))
      .find((d) => d.style === "floater");
    expect(floater).toBeDefined();
    if (floater) expect(frameReach(floater, 0.4, 0.4)).toBe(frameReach(floater, 3, 3));
  });
});

describe("shape and subject", () => {
  const silk = (id: string, width: number, height: number) =>
    work(id, "Classical East Asian", 1650, { width, height });

  it("hangs an upright painting on silk as a scroll and a wide one in a flat mount", () => {
    const upright = ids.map((id) => pickFrameDesign(silk(id, 1000, 2400)).style);
    const wide = ids.map((id) => pickFrameDesign(silk(id, 3000, 1400)).style);
    expect(wide.every((s) => s === "mount")).toBe(true);
    expect(upright.filter((s) => s === "scroll").length).toBeGreaterThan(ids.length * 0.6);
  });

  it("lets a scroll reach further down than sideways", () => {
    const scroll = ids
      .map((id) => pickFrameDesign(silk(id, 1000, 2400)))
      .find((d) => d.style === "scroll");
    expect(scroll).toBeDefined();
    if (!scroll) return;
    const extents = frameExtents(scroll, 0.6, 1.4);
    expect(extents.top).toBeGreaterThan(extents.bottom);
    expect(extents.bottom).toBeGreaterThan(extents.side * 1.5);
    const moulding = frameMoulding(scroll, 0.6, 1.4);
    expect(moulding.profile).toEqual([]);
    expect(moulding.rails.length).toBe(5);
    expect(moulding.frontZ).toBeGreaterThan(0.034);
  });

  it("keeps the tabernacle frame for sacred subjects", () => {
    const share = (title: string) =>
      ids.filter(
        (id) => pickFrameDesign(work(id, "Renaissance", 1510, { title })).style === "tabernacle",
      ).length / ids.length;
    expect(share("Madonna and Child with Saints")).toBeGreaterThan(share("Portrait of a Man") * 3);
    expect(share("Portrait of a Man")).toBeLessThan(0.12);
  });

  it("keeps narrow frames for small works", () => {
    const share = (cm: number) =>
      ids.filter((id) => {
        const design = pickFrameDesign(
          work(id, "Realism", 1870, { realDimensions: { widthCm: cm, heightCm: cm * 0.8 } }),
        );
        return design.style === "morland";
      }).length;
    expect(share(40)).toBeGreaterThan(share(220) + 5);
  });

  it("fits some frames with a liner and some mats with a second board", () => {
    const barbizon = artworkListings
      .map((a) => pickFrameDesign(a))
      .filter((d) => d.look === "barbizon");
    const lined = barbizon.filter((d) => (d.options.liner ?? 0) > 0);
    expect(lined.length).toBeGreaterThan(barbizon.length * 0.15);
    expect(lined.length).toBeLessThan(barbizon.length * 0.5);
    for (const d of lined) expect(["cloth", "leaf"]).toContain(d.slots[1].surface);

    const prints = artworkListings
      .map((a) => pickFrameDesign(a))
      .filter((d) => d.style === "print");
    const doubled = prints.filter((d) => (d.options.detail & 16) !== 0);
    expect(doubled.length).toBeGreaterThan(prints.length * 0.1);
    for (const d of doubled) expect(d.slots[2].finish).toBe("matInner");
  });
});
