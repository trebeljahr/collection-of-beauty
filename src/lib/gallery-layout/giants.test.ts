import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { frameExtents, pickFrameDesign } from "./frame-design";
import { fitsStorey, GIANT_MIN_PX_PER_METRE, giantSize } from "./giants";
import { BLOCK_HALLS, layoutBlock } from "./layout-block";
import { MAX_PAINTING_W, PAINTING_FLOOR_GAP, sizeWork } from "./place-paintings";
import type { Placement, RoomLayout } from "./types";
import { CELL_SIZE, FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "./world-coords";

function work(id: string, era: string, widthCm: number, heightCm: number, px = 9000) {
  return {
    id,
    objectKey: `folder/${id}.jpg`,
    movement: ERAS.find((e) => e.id === era)!.movements[0],
    year: null,
    artistSlug: `${id}-artist`,
    width: px,
    height: Math.round((px * heightCm) / widthCm),
    variantWidths: [480, 960, 1920, 4096, 6144],
    realDimensions: { widthCm, heightCm, source: "wikidata" },
  } as unknown as ArtworkListing;
}

/** Room-sized works for every era, and a handful too large for a room. */
function catalogue(): ArtworkListing[] {
  const ordinary = ERAS.flatMap((era) =>
    Array.from({ length: 120 }, (_, i) =>
      work(`${era.id}-${i}`, era.id, [200, 120, 80][i % 3], [150, 90, 100][i % 3], 4200),
    ),
  );
  return [
    ...ordinary,
    // Taller than a storey: the sheer walls. Three of them too wide for
    // any wall but the end of a stair hall, which there are two of.
    work("levi", "renaissance", 1310, 555),
    work("cana", "renaissance", 994, 677),
    work("san-rocco-a", "renaissance", 465, 538),
    work("san-rocco-b", "renaissance", 455, 538),
    work("sacre", "enlightenment", 979, 621),
    work("triumph", "baroque", 755, 728),
    // A storey of a hall.
    work("alexander", "baroque", 707, 450),
    work("horatii", "enlightenment", 425, 330),
    work("nympheas", "fin-de-siecle", 850, 200),
    work("screen", "ukiyo-e", 366, 150),
    // Not tall, and longer than any stretch of a storey.
    work("orangerie", "fin-de-siecle", 1275, 200),
    // Too coarse a scan for its size: stays in its rooms.
    work("coarse", "baroque", 800, 400, 2400),
    // More of one era than its floor's court has stretches for.
    ...Array.from({ length: 24 }, (_, i) => work(`salon-${i}`, "romantic", 330, 200)),
  ];
}

const layout = layoutBlock(catalogue());
const halls = layout.allRooms.filter((r) => r.isStairwell);
const hung = (id: string) => {
  for (const room of layout.allRooms) {
    const p = room.placements.find((q) => q.artwork.id === id);
    if (p) return { room, p };
  }
  return null;
};
const key = (room: RoomLayout) => room.id.replace(/^f\d-/, "");
/** Where a placement's frame ends, above and below. */
function frame(p: Placement) {
  const e = frameExtents(p.frame ?? pickFrameDesign(p.artwork), p.widthM, p.heightM);
  return {
    top: p.position[1] + p.heightM / 2 + e.top,
    bottom: p.position[1] - p.heightM / 2 - e.bottom,
    half: p.widthM / 2 + e.side,
  };
}

describe("a giant", () => {
  it("is a work a room would shrink, with a scan good for its real size", () => {
    expect(giantSize(work("a", "baroque", 320, 200))).toBeNull();
    expect(giantSize(work("b", "baroque", 321, 200))).not.toBeNull();
    expect(giantSize(work("c", "baroque", 200, 330))).not.toBeNull();
    // 6,144 px on 16 m is 384 a metre.
    expect(giantSize(work("d", "baroque", 1600, 800))).toBeNull();
    expect(6144 / 16).toBeLessThan(GIANT_MIN_PX_PER_METRE);
    // No size, or one the plaque would not print: not a giant.
    expect(giantSize({ ...work("e", "baroque", 900, 600), realDimensions: null })).toBeNull();
    expect(
      giantSize({
        ...work("f", "baroque", 900, 600),
        realDimensions: { widthCm: 900, heightCm: 600, source: "series-default" },
      } as unknown as ArtworkListing),
    ).toBeNull();
  });

  it("keeps its real long edge and the shape of its scan", () => {
    const g = giantSize(work("cana", "renaissance", 994, 677))!;
    expect(g.wM).toBeCloseTo(9.94, 6);
    expect(g.hM).toBeCloseTo(6.77, 2);
    expect(sizeWork(g.artwork).wM).toBe(MAX_PAINTING_W);
  });
});

describe("giants in the block plan's halls", () => {
  const stairHalls = BLOCK_HALLS.filter((h) => h.design === "loggia");
  /** The end wall of a stair hall and the middle of it, world metres. */
  const endWall = (hall: (typeof BLOCK_HALLS)[number]) => {
    const west = hall.turns === 3;
    return {
      x: (west ? hall.rect.xMin : hall.rect.xMax + 1) * CELL_SIZE,
      midZ: ((hall.rect.zMin + hall.rect.zMax + 1) / 2) * CELL_SIZE,
      // Where its galleries end, measured along x.
      stripEnd: west
        ? hall.rect.xMin * CELL_SIZE + 11.45
        : (hall.rect.xMax + 1) * CELL_SIZE - 11.45,
      inward: west ? 1 : -1,
    };
  };

  it("hang at their real size, each once, and nowhere else", () => {
    const ids = ["cana", "san-rocco-a", "san-rocco-b", "sacre", "triumph", "alexander", "horatii"];
    for (const id of [...ids, "levi", "orangerie", "nympheas", "screen"]) {
      const found = hung(id);
      expect(found, id).not.toBeNull();
      expect(found!.room.isStairwell, id).toBe(true);
      expect(found!.p.giant, id).toBe(true);
      const real = found!.p.artwork.realDimensions!;
      expect(found!.p.widthM, id).toBeCloseTo(real.widthCm / 100, 1);
      expect(found!.p.heightM, id).toBeCloseTo(real.heightCm / 100, 1);
    }
    const all = layout.allRooms.flatMap((r) => r.placements.map((p) => p.artwork.id));
    expect(new Set(all).size).toBe(all.length);
    // Only giants hang in a hall, and none in a spiral's room.
    for (const room of halls) for (const p of room.placements) expect(p.giant).toBe(true);
    for (const room of halls.filter((r) => key(r).startsWith("stair-"))) {
      expect(room.placements).toHaveLength(0);
    }
  });

  it("leaves a work with too coarse a scan in its rooms, at the room's size", () => {
    const found = hung("coarse");
    if (found) {
      expect(found.room.isStairwell).toBe(false);
      expect(found.p.widthM).toBeLessThanOrEqual(MAX_PAINTING_W);
    }
  });

  it("deals the works taller than a storey to the two stair halls in turn", () => {
    // Six tall works, widest first: the two widest in the axis of a
    // stair each, the third over one of them, a pair, and one alone on a
    // side wall.
    const tall = ["levi", "cana", "sacre", "triumph", "san-rocco-a", "san-rocco-b"];
    const where = Object.fromEntries(tall.map((id) => [id, key(hung(id)!.room)]));
    expect(new Set(Object.values(where))).toEqual(new Set(stairHalls.map((h) => h.key)));
    expect(where.levi).not.toBe(where.cana);
    expect(where["san-rocco-a"]).toBe(where["san-rocco-b"]);
    const counts = stairHalls.map((h) => tall.filter((id) => where[id] === h.key).length);
    expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(1);
  });

  it("hangs the widest in the axis of each stair, level with the second floor", () => {
    for (const id of ["levi", "cana"]) {
      const { room, p } = hung(id)!;
      const hall = stairHalls.find((h) => h.key === key(room))!;
      const wall = endWall(hall);
      expect(Math.abs(p.position[0] - wall.x), id).toBeLessThan(0.05);
      expect(p.position[2], id).toBeCloseTo(wall.midZ, 6);
      expect(room.floorIndex, id).toBe(1);
      expect(frame(p).bottom, id).toBeCloseTo(FLOOR_SEPARATION + PAINTING_FLOOR_GAP, 6);
      expect(frame(p).top, id).toBeLessThan(3 * FLOOR_SEPARATION);
      // Its plaque is read from the hall floor, under it.
      expect(p.position[1] + (p.plaque?.dy ?? 0), id).toBeCloseTo(1.45, 6);
      expect(p.plaque?.dx, id).toBe(0);
    }
  });

  it("hangs a work too wide for any other wall over it, 3 m clear and under the roof", () => {
    const roof = 3 * FLOOR_SEPARATION + INTER_FLOOR_HEIGHT;
    // The third wide canvas, and the long panel no storey has a stretch
    // for: one to a hall.
    const over = ["sacre", "orangerie"].map((id) => ({ id, ...hung(id)! }));
    expect(key(over[0].room)).not.toBe(key(over[1].room));
    for (const { id, room, p } of over) {
      const hall = stairHalls.find((h) => h.key === key(room))!;
      const wall = endWall(hall);
      expect(Math.abs(p.position[0] - wall.x), id).toBeLessThan(0.05);
      expect(p.position[2], id).toBeCloseTo(wall.midZ, 6);
      const under = layout.allRooms
        .filter((r) => key(r) === hall.key && r.floorIndex === 1)
        .flatMap((r) => r.placements)
        .find(
          (q) =>
            Math.abs(q.position[0] - wall.x) < 0.05 && Math.abs(q.position[2] - wall.midZ) < 1e-6,
        )!;
      expect(frame(p).bottom - frame(under).top, id).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(frame(p).top, id).toBeLessThan(roof);
      expect(p.plaque, id).toBeNull();
      // No pair beside it: the wall has its two.
      const beside = layout.allRooms
        .filter((r) => key(r) === hall.key && r.floorIndex >= 2)
        .flatMap((r) => r.placements)
        .filter((q) => q !== p && Math.abs(q.position[0] - wall.x) < 0.05);
      expect(beside, id).toHaveLength(0);
    }
    // The long low one hangs level with the top floor, where its
    // galleries end.
    const low = over.find((o) => o.id === "orangerie")!;
    expect(frame(low.p).bottom).toBeCloseTo(3 * FLOOR_SEPARATION + PAINTING_FLOOR_GAP, 6);
  });

  it("hangs a pair of like height on the hall floor either side of it", () => {
    const a = hung("san-rocco-a")!;
    const b = hung("san-rocco-b")!;
    const hall = stairHalls.find((h) => h.key === key(a.room))!;
    const wall = endWall(hall);
    const axis = layout.allRooms
      .filter((r) => key(r) === hall.key)
      .flatMap((r) => r.placements)
      .find(
        (p) =>
          Math.abs(p.position[2] - wall.midZ) < 1e-6 && Math.abs(p.position[0] - wall.x) < 0.05,
      )!;
    for (const flank of [a, b]) {
      expect(flank.room.floorIndex).toBe(0);
      expect(Math.abs(flank.p.position[0] - wall.x)).toBeLessThan(0.05);
      expect(frame(flank.p).bottom).toBeCloseTo(PAINTING_FLOOR_GAP, 6);
      // Clear of the work in the axis by a metre, inside the corner.
      const off = Math.abs(flank.p.position[2] - wall.midZ);
      expect(off - frame(flank.p).half - frame(axis).half).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(off + frame(flank.p).half).toBeLessThan(13.75 - 0.3);
      // And under it: not as high as its foot.
      expect(frame(flank.p).top).toBeLessThanOrEqual(frame(axis).bottom + 1e-6);
    }
    expect((a.p.position[2] - wall.midZ) * (b.p.position[2] - wall.midZ)).toBeLessThan(0);
  });

  it("hangs one work alone on a side wall beyond the galleries, two storeys from the next", () => {
    for (const hall of stairHalls) {
      const wall = endWall(hall);
      const storeys = layout.allRooms.filter((r) => key(r) === hall.key);
      // Works on the two walls beside the end wall, in the part with no
      // gallery in front.
      const beyond = storeys.flatMap((room) =>
        room.placements
          .filter(
            (p) =>
              Math.abs(p.position[0] - wall.x) > 0.05 &&
              (p.position[0] - wall.stripEnd) * wall.inward < 0,
          )
          .map((p) => ({ room, p })),
      );
      for (const side of [-1, 1]) {
        const column = beyond
          .filter(({ p }) => Math.sign(p.position[2] - wall.midZ) === side)
          .sort((m, n) => m.p.position[1] - n.p.position[1]);
        // In the middle of the stretch, one over another.
        expect(new Set(column.map(({ p }) => p.position[0].toFixed(3))).size).toBeLessThanOrEqual(
          1,
        );
        for (let i = 0; i + 1 < column.length; i++) {
          expect(column[i + 1].room.floorIndex - column[i].room.floorIndex).toBe(2);
          expect(frame(column[i + 1].p).bottom - frame(column[i].p).top).toBeGreaterThan(1);
        }
        for (const { p } of column) {
          // A metre and more clear of the gallery's end.
          expect(
            (wall.stripEnd - p.position[0]) * wall.inward - frame(p).half,
          ).toBeGreaterThanOrEqual(1 - 1e-6);
        }
      }
    }
    // The widest tall work after the two in the axes hangs there.
    const { room, p } = hung("triumph")!;
    const wall = endWall(stairHalls.find((h) => h.key === key(room))!);
    expect(room.floorIndex).toBe(0);
    expect(Math.abs(p.position[0] - wall.x)).toBeGreaterThan(1);
    expect((p.position[0] - wall.stripEnd) * wall.inward).toBeLessThan(0);
  });

  it("hangs every other giant on the floor of its era, one to a stretch, the court first", () => {
    // A baroque canvas on the first floor, a neoclassical one on the
    // second, the water lilies on the third, a screen on the fourth.
    for (const [id, floor] of [
      ["alexander", 0],
      ["horatii", 1],
      ["nympheas", 2],
      ["screen", 3],
    ] as const) {
      const { room, p } = hung(id)!;
      // The largest of the others may have gone to a sheer wall.
      const onStorey = fitsStorey({ artwork: p.artwork, wM: p.widthM, hM: p.heightM });
      expect(onStorey, id).toBe(true);
      if (key(room) === "court") expect(room.floorIndex, id).toBe(floor);
    }
    // The smallest of them is no candidate for a sheer wall: it hangs
    // in the court of its floor.
    const screen = hung("screen")!;
    expect(key(screen.room)).toBe("court");
    expect(screen.room.floorIndex).toBe(3);
    // A floor's court is full before its stair halls take a work on
    // their galleries' walls: eight stretches, two to a wall.
    for (const floor of layout.floors) {
      const court = floor.rooms.find((r) => key(r) === "court")!;
      const inStairHalls = stairHalls.flatMap((hall) => {
        const wall = endWall(hall);
        return floor.rooms
          .find((r) => key(r) === hall.key)!
          .placements.filter((p) => (p.position[0] - wall.stripEnd) * wall.inward > 0);
      });
      if (inStairHalls.length > 0) expect(court.placements, `floor ${floor.index}`).toHaveLength(8);
      expect(inStairHalls.length).toBeLessThanOrEqual(8);
    }
    expect(layout.floors[1].rooms.find((r) => key(r) === "court")!.placements).toHaveLength(8);
    // No stretch of a hall's storey holds two.
    for (const room of halls) {
      const byWall = new Map<string, number[]>();
      for (const p of room.placements) {
        const alongX = Math.abs(Math.cos(p.rotation[1])) > 0.5;
        const wall = `${p.rotation[1].toFixed(2)}:${Math.round(p.position[1] / FLOOR_SEPARATION)}`;
        byWall.set(wall, [...(byWall.get(wall) ?? []), alongX ? p.position[0] : p.position[2]]);
      }
      for (const [wall, at] of byWall) {
        at.sort((m, n) => m - n);
        for (let i = 0; i + 1 < at.length; i++) {
          expect(at[i + 1] - at[i], `${room.id} ${wall}`).toBeGreaterThan(6);
        }
      }
    }
  });

  it("keeps a work on a storey under the gallery above and off the floor", () => {
    for (const room of halls.filter((r) => key(r) === "court")) {
      for (const p of room.placements) {
        const f = frame(p);
        expect(f.bottom - room.worldRect.y, p.artwork.id).toBeGreaterThanOrEqual(
          PAINTING_FLOOR_GAP - 1e-6,
        );
        expect(f.top - room.worldRect.y, p.artwork.id).toBeLessThan(INTER_FLOOR_HEIGHT - 0.1);
      }
    }
  });

  it("hangs a plaque where it can be read, or none", () => {
    for (const room of halls) {
      for (const p of room.placements) {
        if (p.plaque === null) {
          // Only a work with no floor in front of it at its own height.
          expect(room.sheer, p.artwork.id).toBeDefined();
          expect(room.floorIndex, p.artwork.id).toBeGreaterThan(0);
          continue;
        }
        const y = p.position[1] + (p.plaque?.dy ?? 0);
        const overFloor = Math.min(
          ...[0, room.worldRect.y].map((floor) => Math.abs(y - floor - 1.45)),
        );
        const beside = y - room.worldRect.y;
        expect(overFloor < 1e-6 || (beside > 1.2 && beside <= 1.9 + 1e-6), p.artwork.id).toBe(true);
      }
    }
  });

  it("hangs nothing on a gallery's wall where the gallery has ended", () => {
    for (const hall of stairHalls) {
      const wall = endWall(hall);
      for (const room of halls.filter((r) => key(r) === hall.key)) {
        for (const p of room.placements) {
          const beyond = (p.position[0] - wall.stripEnd) * wall.inward < 0;
          if (!beyond) continue;
          // On a sheer wall: the end wall, or the middle of a side
          // stretch. Never a work hung for a gallery to stand before.
          const onEnd = Math.abs(p.position[0] - wall.x) < 0.05;
          const mid = (wall.x + wall.inward * 0.3 + wall.stripEnd - wall.inward) / 2;
          expect(onEnd || Math.abs(p.position[0] - mid) < 1e-6, p.artwork.id).toBe(true);
        }
      }
    }
  });
});
