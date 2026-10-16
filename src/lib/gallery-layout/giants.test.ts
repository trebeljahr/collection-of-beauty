import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { frameExtents, pickFrameDesign } from "./frame-design";
import {
  fitsStorey,
  GIANT_MIN_PX_PER_METRE,
  giantSize,
  SALON_MIN_PX_PER_METRE,
  salonSize,
} from "./giants";
import { grandStairsAt, grandSurfaceAt } from "./grand-stair";
import { BLOCK_HALLS, layoutBlock } from "./layout-block";
import { MAX_PAINTING_W, PAINTING_FLOOR_GAP, PLAQUE_EYE, sizeWork } from "./place-paintings";
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
    // Too coarse a scan for a hall, good enough for the salon, where a
    // work hangs in a pair: two of like size.
    work("coarse", "baroque", 800, 400, 2400),
    work("coarse-b", "baroque", 780, 400, 2400),
    // Taller than a storey and too coarse for a hall: the salon's far
    // wall. A work by the same hand hangs in its era's galleries.
    { ...work("judgment", "renaissance", 1231, 1370, 3950), artistSlug: "buonarroti" },
    { ...work("adam", "renaissance", 570, 262, 1614), artistSlug: "buonarroti" },
    // Too coarse a scan even for the salon: stays in its rooms.
    work("coarser", "baroque", 800, 400, 1600),
    // More of one era than its floor's court has stretches for.
    ...Array.from({ length: 24 }, (_, i) => work(`salon-${i}`, "romantic", 330, 200)),
    // Altarpieces of like size: what the first floor's court leaves
    // over hangs in pairs in its stair halls.
    ...Array.from({ length: 12 }, (_, i) => work(`altar-${i}`, "renaissance", 420 + i, 350)),
  ];
}

const layout = layoutBlock(catalogue());
const halls = layout.allRooms.filter((r) => r.isStairwell);
/** The halls whose every work hangs on a storey: all but the salon. */
const storeyHalls = halls.filter((r) => !r.id.endsWith("-salon"));
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
  /** The landing a work hangs over, or null for one over its storey's
   *  floor: a work over a landing has its plaque moved to eye level
   *  there. */
  const landingOf = (room: RoomLayout, p: Placement) =>
    p.plaque && room.endWall?.landing ? room.endWall.landing : null;
  /** Height of the floor or landing a work is seen from. */
  const standOf = (room: RoomLayout, p: Placement) =>
    room.worldRect.y + (landingOf(room, p)?.y ?? 0);

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

  it("leaves a work with too coarse a scan for the salon in its rooms, at the room's size", () => {
    const found = hung("coarser");
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
    for (const room of storeyHalls) {
      for (const p of room.placements) {
        const f = frame(p);
        const landing = landingOf(room, p);
        const stand = standOf(room, p);
        // Every frame starts at one height over its floor or landing.
        expect(f.bottom - stand, p.artwork.id).toBeCloseTo(PAINTING_FLOOR_GAP, 6);
        // Under the next landing up, or the storey's ceiling.
        const clear = landing ? landing.top - landing.y : INTER_FLOOR_HEIGHT;
        expect(f.top - stand, p.artwork.id).toBeLessThan(clear - 0.1);
      }
    }
  });

  it("hangs every work of a stair hall where its storey or its landing is in front of it", () => {
    let over = 0;
    for (const room of halls.filter((r) => hallOf(r))) {
      const stairs = layout.grandStairs!.filter((s) => s.id.startsWith(`${key(room)}-`));
      for (const p of room.placements) {
        const along = Math.abs(Math.sin(p.rotation[1])) < 0.5;
        // Facing into the room: 1.5 m out from the wall.
        const out = 1.5;
        const x = p.position[0] + (along ? 0 : Math.sin(p.rotation[1]) * out);
        const z = p.position[2] + (along ? Math.cos(p.rotation[1]) * out : 0);
        const stand = standOf(room, p);
        const here = grandStairsAt(stairs, x, z, stand);
        expect(here.length, p.artwork.id).toBeGreaterThan(0);
        const surface = grandSurfaceAt(here, x, z, stand);
        if (landingOf(room, p)) {
          over++;
          // The landing of the stair that leaves this storey.
          expect(surface?.stair?.lowerFloor, p.artwork.id).toBe(room.floorIndex);
          expect(surface?.y, p.artwork.id).toBeCloseTo(stand, 6);
        } else {
          expect(surface?.floorIndex, p.artwork.id).toBe(room.floorIndex);
        }
      }
    }
    expect(over).toBeGreaterThan(0);
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
    // One work on the axis of each storey with a landing that hangs any.
    for (const room of halls.filter((r) => r.endWall?.landing && r.placements.length > 0)) {
      const axis = room.placements.filter(
        (p) => onEnd(room, p) && Math.abs(p.position[2] - endWall(hallOf(room)!).midZ) < 1e-6,
      );
      expect(axis, room.id).toHaveLength(1);
    }
  });

  it("hangs the axis work over the landing, and any pair beside it there, their middles level", () => {
    let axes = 0;
    for (const room of halls.filter((r) => hallOf(r))) {
      const wall = endWall(hallOf(room)!);
      const landing = room.placements.filter((p) => onEnd(room, p) && landingOf(room, p));
      if (landing.length === 0) continue;
      axes++;
      expect([1, 3], room.id).toContain(landing.length);
      const axis = landing.find((p) => Math.abs(p.position[2] - wall.midZ) < 1e-6)!;
      expect(axis, room.id).toBeDefined();
      // Inside the landing's ends.
      for (const p of landing) {
        expect(Math.abs(p.position[2] - wall.midZ) + frame(p).half, p.artwork.id).toBeLessThan(
          room.endWall!.half,
        );
      }
      const flanks = landing.filter((p) => p !== axis);
      for (const flank of flanks) {
        expect(frame(flank).bottom).toBeCloseTo(frame(axis).bottom, 6);
        // Not as tall as the work between them.
        expect(frame(flank).top).toBeLessThanOrEqual(frame(axis).top + 1e-6);
        // Clear of the axis work by a metre.
        const off = Math.abs(flank.position[2] - wall.midZ);
        expect(off - frame(flank).half - frame(axis).half).toBeGreaterThanOrEqual(1 - 1e-6);
      }
      if (flanks.length === 2) {
        const [a, b] = flanks;
        expect(a.position[2] - wall.midZ).toBeCloseTo(-(b.position[2] - wall.midZ), 6);
      }
    }
    expect(axes).toBeGreaterThan(0);
    // The top storey has no landing of its own, and no axis work.
    for (const room of halls.filter(
      (r) => hallOf(r) && r.floorIndex === layout.floors.length - 1,
    )) {
      expect(room.endWall?.landing, room.id).toBeNull();
      expect(
        room.placements.filter((p) => landingOf(room, p)),
        room.id,
      ).toHaveLength(0);
    }
  });

  it("hangs the end wall beside the landing in a pair, over the storey's floor", () => {
    for (const room of halls.filter((r) => hallOf(r))) {
      const wall = endWall(hallOf(room)!);
      const beside = room.placements.filter((p) => onEnd(room, p) && !landingOf(room, p));
      expect([0, 2], room.id).toContain(beside.length);
      if (beside.length < 2) continue;
      const [a, b] = beside;
      expect(a.position[2] - wall.midZ).toBeCloseTo(-(b.position[2] - wall.midZ), 6);
      expect(frame(a).bottom).toBeCloseTo(frame(b).bottom, 6);
      for (const p of beside) {
        expect(Math.abs(p.position[2] - wall.midZ) - frame(p).half, p.artwork.id).toBeGreaterThan(
          room.endWall!.half,
        );
      }
    }
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
        // One bottom line, and of like size.
        expect(frame(q!).bottom).toBeCloseTo(frame(p).bottom, 6);
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
    for (const room of storeyHalls) {
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

  it("hangs every plaque beside its work, at eye level over its floor or its landing", () => {
    for (const room of storeyHalls) {
      for (const p of room.placements) {
        // No plaque is left out. Unset is beside the frame at eye level
        // over the room's own floor; over a landing it is moved up to
        // eye level there, and stays beside the frame.
        if (!landingOf(room, p)) {
          expect(p.plaque, p.artwork.id).toBeUndefined();
          continue;
        }
        expect(p.plaque?.dx, p.artwork.id).toBeUndefined();
        expect(p.position[1] + p.plaque!.dy, p.artwork.id).toBeCloseTo(
          standOf(room, p) + PLAQUE_EYE,
          6,
        );
      }
    }
  });
});

describe("the salon", () => {
  const salon = layout.floors.flatMap((f) => f.rooms.filter((r) => key(r) === "salon"));
  const inSalon = (id: string) => {
    const found = hung(id);
    return found && key(found.room) === "salon" ? found : null;
  };
  const hall = BLOCK_HALLS.find((h) => h.design === "salon")!;
  const axisX = ((hall.rect.xMin + hall.rect.xMax + 1) / 2) * CELL_SIZE;
  const farZ = (hall.rect.zMax + 1) * CELL_SIZE;

  it("takes a work too large for a storey and too coarse for a hall", () => {
    expect(giantSize(hung("judgment")!.p.artwork)).toBeNull();
    expect(salonSize(hung("judgment")!.p.artwork)).not.toBeNull();
    expect(3950 / 12.31).toBeGreaterThan(SALON_MIN_PX_PER_METRE);
    expect(inSalon("coarse"), "coarse").not.toBeNull();
    expect(hung("coarser")?.room.isStairwell ?? false).toBe(false);
  });

  it("hangs the largest on its far wall, on the hall floor, at its real size", () => {
    const { room, p } = inSalon("judgment")!;
    expect(room).toBe(salon[0]);
    expect(p.position[0]).toBeCloseTo(axisX, 6);
    expect(p.position[2]).toBeCloseTo(farZ, 1);
    expect(p.widthM).toBeCloseTo(12.31, 2);
    expect(p.heightM).toBeCloseTo(13.7, 1);
    expect(frame(p).bottom).toBeGreaterThanOrEqual(PAINTING_FLOOR_GAP - 1e-6);
    expect(frame(p).top).toBeGreaterThan(FLOOR_SEPARATION);
  });

  it("hangs nothing over it, under a roof two storeys and a bit up", () => {
    const below = inSalon("judgment")!.p;
    const onFar = salon.flatMap((room) =>
      room.placements.filter(
        (p) => Math.abs(p.position[2] - farZ) < 0.1 && Math.abs(p.position[0] - axisX) < 6.2,
      ),
    );
    expect(onFar.map((p) => p.artwork.id)).toEqual(["judgment"]);
    // The work by the same hand that hung over it hangs in its era's
    // galleries, at its real size.
    const adam = hung("adam");
    expect(adam?.room.isStairwell).toBe(false);
    expect(adam?.p.widthM).toBeCloseTo(5.7, 2);
    // The salon is two storeys, the top one running on to its dome.
    expect(salon.map((r) => r.floorIndex)).toEqual([0, 1]);
    const roof = salon[1].worldRect.y + salon[1].storeyHeight!;
    expect(roof).toBeGreaterThan(2 * FLOOR_SEPARATION);
    expect(frame(below).top).toBeLessThan(roof - 3);
  });

  it("hangs its side walls in pairs, at most one to each third", () => {
    for (const room of salon) {
      const sides = room.placements.filter((p) => Math.abs(Math.sin(p.rotation[1])) > 0.5);
      const at = sides.map((p) => p.position[2].toFixed(3));
      // Each pair mirrors across the axis, on one line along the walls.
      for (const z of new Set(at))
        expect(
          at.filter((x) => x === z),
          room.id,
        ).toHaveLength(2);
      expect(new Set(at).size, room.id).toBeLessThanOrEqual(3);
    }
  });

  it("hangs every other work on a storey, with floor in front of it", () => {
    for (const room of salon) {
      for (const p of room.placements) {
        if (p.artwork.id === "judgment") continue;
        const f = frame(p);
        expect(f.bottom - room.worldRect.y, p.artwork.id).toBeGreaterThanOrEqual(
          PAINTING_FLOOR_GAP - 1e-6,
        );
        expect(f.top - room.worldRect.y, p.artwork.id).toBeLessThan(INTER_FLOOR_HEIGHT - 0.1);
        expect(p.plaque, p.artwork.id).toBeUndefined();
        // On the hall floor anywhere; above it only on a wall with a
        // gallery in front: not the far wall's middle.
        if (room !== salon[0]) {
          const onFar = Math.abs(p.position[2] - farZ) < 0.1;
          expect(onFar && Math.abs(p.position[0] - axisX) < 13.75, p.artwork.id).toBe(false);
        }
      }
    }
  });
});
