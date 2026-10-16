import { describe, expect, it } from "vitest";
import { artworkListings, movements } from "@/lib/data";
import {
  FINISHES,
  type FrameDesign,
  familyOf,
  frameExtents,
  frameMoulding,
  frameReach,
  frameScale,
  hasFrameRule,
  LOOK_IDS,
  looksFor,
  pickFrameDesign,
  readPicture,
  roomHanging,
  wallHanging,
} from "./frame-design";
import { buildStyle } from "./frame-styles";

type Work = Parameters<typeof pickFrameDesign>[0];
const work = (id: string, movement: string | null, year: number | null, more = {}): Work => ({
  id,
  movement,
  year,
  ...more,
});
const work_ = (id: string) => work(id, "Rococo", 1750);
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
      expect(pickFrameDesign(work(id, "Classical East Asian", 1486)).style).toBe("mount");
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
    const known = new Set<string>(LOOK_IDS);
    const none: string[] = [];
    const unknown: string[] = [];
    const weightless: string[] = [];
    for (const movement of [...movements, null]) {
      for (const year of [1450, 1650, 1800, 1880, 1930, null]) {
        const looks = looksFor({ movement, year });
        if (!(looks.length > 0)) none.push(`${movement} ${year}`);
        for (const [look, weight] of looks) {
          if (!known.has(look)) unknown.push(`${movement} ${year}: ${look}`);
          if (!(weight > 0)) weightless.push(`${movement} ${year}: ${look} ${weight}`);
        }
      }
    }
    expect(none, "no look at all").toEqual([]);
    expect(unknown, "looks that do not exist").toEqual([]);
    expect(weightless, "looks without a weight").toEqual([]);
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
describe("variety", { timeout: 300_000 }, () => {
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

describe("pinned frames", () => {
  const restingGirl = artworkListings.find((a) =>
    a.id.startsWith("collection-of-beauty-resting-girl-by-francois-boucher-1753"),
  );

  it("hangs Boucher's Resting Girl in a gilt swept frame that swells at its corners", () => {
    expect(restingGirl).toBeDefined();
    const own = pickFrameDesign(restingGirl as Work);
    expect([own.look, own.options.variant, own.slots[0].finish]).toEqual(["louisXV", 1, "gilt"]);
  });

  it("keeps the pinned frame on any wall", () => {
    const work = restingGirl as Work;
    const own = pickFrameDesign(work);
    const hanging = roomHanging("r1", "#2e3b4f", [work, ...ids.slice(0, 6).map((id) => work_(id))]);
    expect(pickFrameDesign(work, hanging)).toBe(own);
  });
});

describe("Stuck's frame for his Salome", () => {
  const salome = artworkListings.find(
    (a) => a.id === "collection-of-beauty-franz-von-stuck-salome",
  );

  it("hangs at its real size, about 56 × 76.5 cm round a canvas of 24.7 × 45.7", () => {
    expect(salome).toBeDefined();
    const design = pickFrameDesign(salome as Work);
    expect([design.look, design.painted]).toEqual(["stuck", "stuckSalome"]);
    const e = frameExtents(design, 0.247, 0.457);
    const outer = [0.247 + 2 * e.side, 0.457 + e.top + e.bottom].map((m) => Math.round(m * 1000));
    expect(outer).toEqual([555, 765]);
  });

  it("is drawn by no school", () => {
    expect(looksOf("Symbolism", 1906)).not.toContain("stuck");
  });
});

describe("framing a room together", () => {
  const school = (movement: string, year: number, n = 24) =>
    ids.slice(0, n).map((id) => work(id, movement, year));
  const familyIn = (d: FrameDesign) => familyOf(d.look, d.slots[0].finish);
  /** The share of the list its most common entry has. */
  const most = (items: Array<string | null>) => {
    const counts = new Map<string | null, number>();
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
    return Math.max(...counts.values()) / items.length;
  };
  const rooms = Array.from({ length: 40 }, (_, i) => `room-${i}`);
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  it("leaves a work its own frame where the room has nothing to say", () => {
    const alone = work("alone", "Baroque", 1640);
    const hanging = roomHanging("room", null, [alone]);
    expect(hanging).toEqual({ wall: null, family: null, lead: null, company: null });
    expect(pickFrameDesign(alone, hanging)).toEqual(pickFrameDesign(alone));
  });

  it("gives every finish a moulding comes in a family", () => {
    const none = artworkListings
      .map((a) => pickFrameDesign(a))
      .filter((d) => familyIn(d) === null)
      .map((d) => `${d.look}/${d.slots[0].finish}`);
    expect([...new Set(none)]).toEqual([]);
  });

  it("keeps a room to one family of finishes", () => {
    // Impressionists hang in gilt, in white and grey paint, in silver
    // and in wood: left to themselves, six in ten share a family.
    const works = school("Impressionism", 1880);
    expect(most(works.map((w) => familyIn(pickFrameDesign(w))))).toBeLessThan(0.7);
    const together = rooms.map((room) => {
      const hanging = roomHanging(room, null, works);
      return most(works.map((w) => familyIn(pickFrameDesign(w, hanging))));
    });
    expect(mean(together)).toBeGreaterThan(0.85);
  });

  it("gives a moulding no finish outside the room's family where it comes in it", () => {
    const works = school("Post-Impressionism", 1890);
    // Which families each moulding was seen in, over every room.
    const comesIn = new Map<string, Set<string | null>>();
    const hung: Array<{ room: string | null; look: string; family: string | null }> = [];
    for (const room of rooms) {
      const hanging = roomHanging(room, null, works);
      for (const w of works) {
        const design = pickFrameDesign(w, hanging);
        const family = familyIn(design);
        comesIn.set(design.look, (comesIn.get(design.look) ?? new Set()).add(family));
        hung.push({ room: hanging.family, look: design.look, family });
      }
    }
    const strays = hung
      .filter((h) => comesIn.get(h.look)?.has(h.room) && h.family !== h.room)
      .map((h) => `${h.look} in ${h.family}, room in ${h.room}`);
    expect(strays).toEqual([]);
    // The canted frame comes in white, black, oak and green: it is the test.
    expect(comesIn.get("canted")?.size).toBeGreaterThanOrEqual(3);
  });

  it("draws the family again for every room", () => {
    const works = school("Impressionism", 1880);
    const counts = new Map<string | null, number>();
    for (const room of rooms) {
      const { family } = roomHanging(room, null, works);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThanOrEqual(3);
    // Gilt is what most of the works would choose, so it is the family
    // of more rooms than any other, and not of all of them.
    const gilt = counts.get("gilt") ?? 0;
    expect(gilt).toBe(Math.max(...counts.values()));
    expect(gilt).toBeLessThan(rooms.length * 0.8);
  });

  it("leads each wall with one frame", () => {
    const works = school("Romanticism", 1830);
    const wall = works.slice(0, 8);
    const own = wall.map((w) => pickFrameDesign(w));
    const leads = new Set<string>();
    const sameLook: number[] = [];
    const sameFinish: number[] = [];
    for (const room of rooms) {
      const hanging = wallHanging(roomHanging(room, null, works), `${room}/north`, wall);
      leads.add(`${hanging.lead?.look}/${hanging.lead?.finish}`);
      const designs = wall.map((w) => pickFrameDesign(w, hanging));
      sameLook.push(most(designs.map((d) => d.look)));
      sameFinish.push(most(designs.map((d) => d.slots[0].finish)));
    }
    expect(mean(sameLook)).toBeGreaterThan(most(own.map((d) => d.look)) + 0.2);
    expect(mean(sameFinish)).toBeGreaterThan(most(own.map((d) => d.slots[0].finish)) + 0.2);
    // And not the same frame on every wall.
    expect(leads.size).toBeGreaterThan(8);
  });

  it("passes over a finish of the wall's own tone", () => {
    const many = (movement: string, year: number) =>
      Array.from({ length: 200 }, (_, i) => work(`m${i}`, movement, year));
    const on = (works: Work[], wall: string | null, finishes: string[]) =>
      works
        .map((w) => pickFrameDesign(w, roomHanging("room", wall, [w])))
        .filter((d) => finishes.includes(d.slots[0].finish)).length / works.length;
    // Maple, ash and gold on the ochre of the Post-Impressionist rooms.
    const ochre = ["maple", "ash", "kiri", "gilt", "giltRed", "giltOak"];
    const postImpressionists = many("Post-Impressionism", 1890);
    expect(on(postImpressionists, null, ochre)).toBeGreaterThan(0.1);
    expect(on(postImpressionists, "#c2a15e", ochre)).toBeLessThan(0.06);
    // A white frame on a white wall.
    expect(on(postImpressionists, null, ["white"])).toBeGreaterThan(0.05);
    expect(on(postImpressionists, "#f4f4f2", ["white"])).toBeLessThan(0.03);
    // Walnut and black-stained ash on the charcoal of the East Asian ones.
    const dark = ["walnut", "rosewood", "mahogany", "stained"];
    const prints = many("Ukiyo-e", 1830);
    expect(on(prints, "#403a34", dark)).toBeLessThan(on(prints, null, dark) * 0.7);
  });

  it("keeps gilding on a wall of any colour", () => {
    const works = Array.from({ length: 200 }, (_, i) => work(`g${i}`, "Baroque", 1640));
    const gilt = (wall: string) =>
      works.filter((w) => familyIn(pickFrameDesign(w, roomHanging("room", wall, [w]))) === "gilt")
        .length / works.length;
    for (const wall of ["#8e1b2b", "#24385c", "#e0dcd0", "#c2a15e"]) {
      expect(gilt(wall), wall).toBeGreaterThan(0.6);
    }
  });

  it("cuts the mats of a wall from one board and mounts it in one silk", () => {
    const tones: Array<[string, string[]]> = [
      ["#e8e0c8", ["gold"]],
      ["#c9d6dc", ["blue"]],
      ["#d9c9a0", ["orange"]],
      ["#e4e4e0", []],
      ["#b8c8a0", ["green"]],
    ];
    const wallOf = (movement: string, more = {}) =>
      ids.slice(0, 10).map((id, i) =>
        work(id, movement, 1820, {
          dominantColor: tones[i % 5][0],
          colorBuckets: tones[i % 5][1],
          ...more,
        }),
      );
    /** How far apart the tints of one finish lie across the wall. */
    const spread = (designs: FrameDesign[], finish: string) => {
      const tints = designs.map((d) => d.slots[1]).filter((s) => s.finish === finish);
      expect(tints.length).toBe(designs.length);
      return Math.max(
        ...[0, 1, 2].map(
          (c) =>
            Math.max(...tints.map((s) => s.tint[c])) - Math.min(...tints.map((s) => s.tint[c])),
        ),
      );
    };
    const together = (works: Work[], wall: string) => {
      const hanging = wallHanging(roomHanging("room", wall, works), "room/north", works);
      return works.map((w) => pickFrameDesign(w, hanging));
    };
    const sheets = wallOf("Botanical");
    const ownMats = spread(
      sheets.map((w) => pickFrameDesign(w)),
      "mat",
    );
    expect(spread(together(sheets, "#55663f"), "mat")).toBeLessThan(ownMats * 0.4);
    const silks = wallOf("Nihonga", { width: 1000, height: 2000 });
    const ownSilks = spread(
      silks.map((w) => pickFrameDesign(w)),
      "silk",
    );
    expect(spread(together(silks, "#403a34"), "silk")).toBeLessThan(ownSilks * 0.4);
  });
});

describe("frame reach", () => {
  it("grows with the work and is the moulding's width at its scale", () => {
    // The works that break each rule, by id.
    const shrinks: string[] = [];
    const tooNarrow: string[] = [];
    const tooWide: string[] = [];
    const sideDiffers: string[] = [];
    const offScale: string[] = [];
    for (const a of artworkListings.slice(0, 400)) {
      const design = pickFrameDesign(a);
      const small = frameReach(design, 0.3, 0.4);
      const large = frameReach(design, 3.2, 2);
      if (!(large >= small)) shrinks.push(a.id);
      if (!(small > 0.009)) tooNarrow.push(a.id);
      if (!(large < 0.26)) tooWide.push(a.id);
      const reach = frameReach(design, 1, 1);
      if (!Object.is(frameExtents(design, 1, 1).side, reach)) sideDiffers.push(a.id);
      // Equal to twelve places, as `toBeCloseTo(…, 12)` has it.
      const width = buildStyle(design.style, design.options).width * frameScale(design, 1, 1);
      if (!(Math.abs(width - reach) < 5e-13)) offScale.push(a.id);
    }
    expect(shrinks, "reach on a large work below the reach on a small one").toEqual([]);
    expect(tooNarrow, "reach of 9 mm or less on a small work").toEqual([]);
    expect(tooWide, "reach of 26 cm or more on a large work").toEqual([]);
    expect(sideDiffers, "side extent is not the reach").toEqual([]);
    expect(offScale, "reach is not the moulding's width at its scale").toEqual([]);
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
  it("frames every painting on silk in a flat mount: nothing hangs as a scroll", () => {
    for (const school of ["Classical East Asian", "Nihonga"]) {
      const designs = ids.map((id) => pickFrameDesign(work(id, school, 1650)));
      const others = designs.filter((d) => d.look !== "silkMount" || d.style !== "mount");
      expect(others, school).toEqual([]);
      // A mount is mitred like any frame: one reach all round.
      const extents = frameExtents(designs[0], 0.6, 1.4);
      expect(extents.top).toBe(extents.side);
      expect(extents.bottom).toBe(extents.side);
      expect(frameMoulding(designs[0], 0.6, 1.4).rails).toEqual([]);
    }
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
