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
    // Taller than a storey: the sheer wall.
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
    // Too coarse a scan for its size: stays in its rooms.
    work("coarse", "baroque", 800, 400, 2400),
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

describe("giants in the block plan's stair halls", () => {
  it("hang at their real size, each once, and nowhere else", () => {
    const ids = ["cana", "san-rocco-a", "san-rocco-b", "sacre", "triumph", "alexander", "horatii"];
    for (const id of [...ids, "nympheas", "screen"]) {
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
    // Only giants hang in a hall.
    for (const room of halls) for (const p of room.placements) expect(p.giant).toBe(true);
  });

  it("leaves a work with too coarse a scan in its rooms, at the room's size", () => {
    const found = hung("coarse");
    if (found) {
      expect(found.room.isStairwell).toBe(false);
      expect(found.p.widthM).toBeLessThanOrEqual(MAX_PAINTING_W);
    }
  });

  it("gives each hall the giants of the floor its stair leaves", () => {
    expect(key(hung("alexander")!.room)).toBe("hall-c");
    expect(key(hung("horatii")!.room)).toBe("hall-w");
    expect(key(hung("nympheas")!.room)).toBe("hall-e");
    // The top floor has no hall of its own: its screens hang in the
    // east hall, on their own floor.
    const screen = hung("screen")!;
    expect(key(screen.room)).toBe("hall-e");
    expect(screen.room.floorIndex).toBe(3);
  });

  it("keeps a work on a storey under the gallery above and off the floor", () => {
    for (const id of ["alexander", "horatii", "nympheas", "screen"]) {
      const { room, p } = hung(id)!;
      const f = frame(p);
      expect(fitsStorey({ artwork: p.artwork, wM: p.widthM, hM: p.heightM }), id).toBe(true);
      expect(f.bottom - room.worldRect.y, id).toBeGreaterThanOrEqual(PAINTING_FLOOR_GAP - 1e-6);
      expect(f.top - room.worldRect.y, id).toBeLessThan(INTER_FLOOR_HEIGHT - 0.1);
    }
  });

  it("composes the sheer wall: the widest over the landing, a pair beside it, a tier above", () => {
    const hall = BLOCK_HALLS.find((h) => h.sheer)!;
    const wallZ = hall.rect.zMin * CELL_SIZE;
    const midX = ((hall.rect.xMin + hall.rect.xMax + 1) / 2) * CELL_SIZE;
    const onWall = (id: string) => {
      const found = hung(id)!;
      expect(key(found.room), id).toBe(hall.key);
      expect(Math.abs(found.p.position[2] - wallZ), id).toBeLessThan(0.05);
      return found;
    };
    // Lower tier, in the hall's first room.
    const cana = onWall("cana");
    expect(cana.room.floorIndex).toBe(0);
    expect(cana.p.position[0]).toBeCloseTo(midX, 6);
    // The hall has no door in that wall. The work is lifted over the
    // stair's half landing all the same, to be seen from the hall's door.
    expect(cana.room.doors.some((d) => d.side === "north")).toBe(false);
    expect(frame(cana.p).bottom).toBeGreaterThan(FLOOR_SEPARATION / 2 + 0.5);
    const a = onWall("san-rocco-a");
    const b = onWall("san-rocco-b");
    for (const flank of [a, b]) {
      expect(flank.room.floorIndex).toBe(0);
      expect(frame(flank.p).bottom).toBeCloseTo(PAINTING_FLOOR_GAP, 6);
      // Clear of the work over the door, inside the hall's corners.
      const gap = Math.abs(flank.p.position[0] - midX) - frame(flank.p).half - frame(cana.p).half;
      expect(gap).toBeGreaterThan(0.5);
      expect(Math.abs(flank.p.position[0] - midX) + frame(flank.p).half).toBeLessThan(
        ((hall.rect.xMax - hall.rect.xMin + 1) * CELL_SIZE) / 2,
      );
    }
    expect((a.p.position[0] - midX) * (b.p.position[0] - midX)).toBeLessThan(0);
    // Upper tier: two storeys up, clear of the lower, under the roof.
    const lowerTop = Math.max(...[cana, a, b].map((w) => frame(w.p).top));
    const roof = 3 * FLOOR_SEPARATION + INTER_FLOOR_HEIGHT;
    for (const id of ["sacre", "triumph"]) {
      const upper = onWall(id);
      expect(upper.room.floorIndex, id).toBe(2);
      expect(frame(upper.p).bottom, id).toBeGreaterThan(lowerTop + 0.9);
      expect(frame(upper.p).top, id).toBeLessThan(roof);
      expect(upper.p.plaque, id).toBeNull();
    }
  });

  it("hangs a tall work's plaque where it can be read", () => {
    for (const room of halls) {
      for (const p of room.placements) {
        if (p.plaque === null) continue;
        const y = p.position[1] + (p.plaque?.dy ?? 0) - room.worldRect.y;
        expect(y, p.artwork.id).toBeGreaterThan(1.2);
        expect(y, p.artwork.id).toBeLessThanOrEqual(1.9 + 1e-6);
      }
    }
  });

  it("hangs nothing on a wall with no floor in front of it", () => {
    const hall = BLOCK_HALLS.find((h) => h.sheer)!;
    const stripZ = hall.rect.zMin * CELL_SIZE + 5.75;
    for (const room of halls.filter((r) => key(r) === hall.key && r.floorIndex > hall.from)) {
      for (const p of room.placements) {
        // On the sheer wall itself (the upper tier), or south of the strip.
        const onSheer = Math.abs(p.position[2] - hall.rect.zMin * CELL_SIZE) < 0.05;
        if (!onSheer) expect(p.position[2], p.artwork.id).toBeGreaterThan(stripZ);
      }
    }
  });
});
