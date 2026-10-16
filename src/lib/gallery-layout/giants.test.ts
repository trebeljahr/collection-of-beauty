import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { frameExtents, pickFrameDesign } from "./frame-design";
import { fitsStorey, GIANT_MIN_PX_PER_METRE, giantSize } from "./giants";
import { grandStairsAt, grandSurfaceAt } from "./grand-stair";
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
    // The largest. Levi is too wide for any wall but the end of a stair
    // hall; the Triumph is the tallest, 7.28 m.
    work("levi", "renaissance", 1310, 555),
    work("cana", "renaissance", 994, 677),
    work("san-rocco-a", "renaissance", 465, 538),
    work("san-rocco-b", "renaissance", 455, 538),
    work("sacre", "enlightenment", 979, 621),
    work("triumph", "baroque", 755, 728),
    // A storey of a hall.
    work("alexander", "baroque", 707, 450),
    work("horatii", "enlightenment", 425, 330),
    work("nympheas", "fin-de-siecle", 780, 200),
    work("screen", "ukiyo-e", 366, 150),
    // Not tall, and longer than any stretch of a storey.
    work("orangerie", "fin-de-siecle", 1275, 200),
    // Too coarse a scan for its size: stays in its rooms.
    work("coarse", "baroque", 800, 400, 2400),
    // More of one era than its floor's court has stretches for.
    ...Array.from({ length: 24 }, (_, i) => work(`salon-${i}`, "romantic", 330, 200)),
    // Altarpieces of like size: what the first floor's court leaves
    // over hangs in pairs in its stair halls.
    ...Array.from({ length: 12 }, (_, i) => work(`altar-${i}`, "renaissance", 420 + i, 350)),
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
      inward: west ? 1 : -1,
    };
  };
  const hallOf = (room: RoomLayout) => stairHalls.find((h) => h.key === key(room));
  const onEnd = (room: RoomLayout, p: Placement) => {
    const hall = hallOf(room);
    return !!hall && Math.abs(p.position[0] - endWall(hall).x) < 0.05;
  };
  const middle = (p: Placement) => (frame(p).top + frame(p).bottom) / 2;

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

  it("fits every work on one storey, the tallest included", () => {
    // The Triumph of Frederick Henry, 7.28 m in the catalogue.
    for (const id of ["triumph", "cana", "sacre", "levi"]) {
      const { artwork } = hung(id)!.p;
      expect(fitsStorey(giantSize(artwork)!), id).toBe(true);
    }
    for (const room of halls) {
      for (const p of room.placements) {
        const f = frame(p);
        expect(f.bottom - room.worldRect.y, p.artwork.id).toBeGreaterThanOrEqual(
          PAINTING_FLOOR_GAP - 1e-6,
        );
        expect(f.top - room.worldRect.y, p.artwork.id).toBeLessThan(INTER_FLOOR_HEIGHT - 0.1);
        expect(p.sheer, p.artwork.id).toBeUndefined();
      }
    }
  });

  it("hangs every work of a stair hall where its storey has floor in front of it", () => {
    for (const room of halls.filter((r) => hallOf(r))) {
      const stairs = layout.grandStairs!.filter((s) => s.id.startsWith(`${key(room)}-`));
      for (const p of room.placements) {
        const along = Math.abs(Math.sin(p.rotation[1])) < 0.5;
        // Facing into the room: 1.5 m out from the wall.
        const out = 1.5;
        const x = p.position[0] + (along ? 0 : Math.sin(p.rotation[1]) * out);
        const z = p.position[2] + (along ? Math.cos(p.rotation[1]) * out : 0);
        const here = grandStairsAt(stairs, x, z, room.worldRect.y);
        expect(here.length, p.artwork.id).toBeGreaterThan(0);
        expect(grandSurfaceAt(here, x, z, room.worldRect.y)?.floorIndex, p.artwork.id).toBe(
          room.floorIndex,
        );
      }
    }
  });

  it("gives each storey's end wall the largest work of its floor, on the stair's axis", () => {
    // Levi has no stretch but an end wall; the Wedding at Cana is the
    // largest of the rest of the first floor.
    for (const [id, floor] of [
      ["levi", 0],
      ["cana", 0],
      ["sacre", 1],
      ["orangerie", 2],
    ] as const) {
      const { room, p } = hung(id)!;
      const hall = hallOf(room);
      expect(hall, id).toBeDefined();
      expect(room.floorIndex, id).toBe(floor);
      expect(onEnd(room, p), id).toBe(true);
      expect(p.position[2], id).toBeCloseTo(endWall(hall!).midZ, 6);
    }
    expect(key(hung("levi")!.room)).not.toBe(key(hung("cana")!.room));
    // One work on the axis of each storey that hangs any.
    for (const room of halls.filter((r) => hallOf(r) && r.placements.length > 0)) {
      const axis = room.placements.filter(
        (p) => onEnd(room, p) && Math.abs(p.position[2] - endWall(hallOf(room)!).midZ) < 1e-6,
      );
      expect(axis, room.id).toHaveLength(1);
    }
  });

  it("hangs a pair beside the axis work, one to each half of the end wall, their middles level", () => {
    let flanked = 0;
    for (const room of halls.filter((r) => hallOf(r))) {
      const wall = endWall(hallOf(room)!);
      const end = room.placements.filter((p) => onEnd(room, p));
      if (end.length < 2) continue;
      flanked++;
      expect(end, room.id).toHaveLength(3);
      const axis = end.find((p) => Math.abs(p.position[2] - wall.midZ) < 1e-6)!;
      const [a, b] = end.filter((p) => p !== axis);
      for (const flank of [a, b]) {
        expect(middle(flank)).toBeCloseTo(middle(axis), 6);
        // Not as tall as the work between them.
        expect(frame(flank).bottom).toBeGreaterThanOrEqual(frame(axis).bottom - 1e-6);
        expect(frame(flank).top).toBeLessThanOrEqual(frame(axis).top + 1e-6);
        // Clear of the axis work by a metre, inside the corner.
        const off = Math.abs(flank.position[2] - wall.midZ);
        expect(off - frame(flank).half - frame(axis).half).toBeGreaterThanOrEqual(1 - 1e-6);
        expect(off + frame(flank).half).toBeLessThan(13.75 - 0.3);
      }
      // Mirrored about the axis: each on the middle of its half.
      expect(a.position[2] - wall.midZ).toBeCloseTo(-(b.position[2] - wall.midZ), 6);
    }
    expect(flanked).toBeGreaterThan(0);
  });

  it("hangs the other walls of a stair hall in pairs that mirror about the axis", () => {
    let pairs = 0;
    for (const room of halls.filter((r) => hallOf(r))) {
      const wall = endWall(hallOf(room)!);
      const others = room.placements.filter((p) => !onEnd(room, p));
      for (const p of others) {
        const q = others.find(
          (o) =>
            o !== p &&
            Math.abs(o.position[0] - p.position[0]) < 1e-6 &&
            Math.abs(o.position[2] - wall.midZ + (p.position[2] - wall.midZ)) < 1e-6,
        );
        expect(q, `${room.id} ${p.artwork.id}`).toBeDefined();
        // One centre line, and of like size.
        expect(q!.position[1]).toBeCloseTo(p.position[1], 6);
        expect(Math.abs(p.heightM - q!.heightM) + Math.abs(p.widthM - q!.widthM) / 2).toBeLessThan(
          1.5 + 1e-9,
        );
        pairs += 0.5;
      }
    }
    expect(pairs).toBeGreaterThanOrEqual(3);
  });

  it("hangs every other giant on the floor of its era, one to a stretch, the court first", () => {
    for (const [id, floor] of [
      ["alexander", 0],
      ["horatii", 1],
      ["nympheas", 2],
      ["screen", 3],
    ] as const) {
      expect(hung(id)!.room.floorIndex, id).toBe(floor);
    }
    // A floor's court takes eight, two to a wall, before a stair hall
    // hangs pairs beside its stair.
    expect(layout.floors[1].rooms.find((r) => key(r) === "court")!.placements).toHaveLength(8);
    for (const floor of layout.floors) {
      const court = floor.rooms.find((r) => key(r) === "court")!;
      const paired = floor.rooms
        .filter((r) => hallOf(r))
        .flatMap((r) => r.placements.filter((p) => !onEnd(r, p)));
      if (paired.length > 0) expect(court.placements, `floor ${floor.index}`).toHaveLength(8);
    }
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

  it("hangs every plaque beside its work, at eye level over its floor", () => {
    for (const room of halls) {
      for (const p of room.placements) {
        // No plaque is left out, and none is moved: unset is beside the
        // frame at eye level over the room's own floor.
        expect(p.plaque, p.artwork.id).toBeUndefined();
      }
    }
  });
});
