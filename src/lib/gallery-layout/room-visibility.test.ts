import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { ArtworkListing } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { layoutBlock } from "./layout-block";
import { layoutMuseum } from "./layout-museum";
import {
  isWholeScreen,
  NEAR_OPENING_M,
  type Opening,
  openingOnScreen,
  type ScreenRect,
  shaftKey,
  sphereInScreenRect,
  type VisibilityRoom,
  visibilityRoom,
  visibleRooms,
  wallSharers,
} from "./room-visibility";
import type { RoomLayout } from "./types";
import { FLOOR_SEPARATION, INTER_FLOOR_HEIGHT } from "./world-coords";

const EYE_HEIGHT = 1.75;

/** A camera at `eye` looking at `target`, as three hands it to the walk. */
function view(
  eye: [number, number, number],
  target: [number, number, number],
  { fov = 75, aspect = 16 / 9 } = {},
) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
  camera.position.set(...eye);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  const matrix = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  return { camera, eye: { x: eye[0], y: eye[1], z: eye[2] }, viewProjection: matrix.elements };
}

function room(
  id: string,
  x: number,
  z: number,
  openings: Opening[],
  { storey = 0, shaft = null as string | null } = {},
): VisibilityRoom {
  return {
    id,
    xMin: x,
    xMax: x + 10,
    zMin: z,
    zMax: z + 10,
    yMin: storey * FLOOR_SEPARATION,
    yMax: (storey + 1) * FLOOR_SEPARATION,
    openings,
    shaft,
  };
}

/** A 1.4 m door in the wall x = `x`, centred on z = 5. */
const doorAtX = (to: string, x: number): Opening => ({
  to,
  x0: x,
  z0: 4.3,
  x1: x,
  z1: 5.7,
  yMin: 0,
  yMax: 2.4,
});

/** Three rooms in a row, west to east, with their doors on one line,
 *  and a fourth north of the middle one.
 *
 *        ┌─────┐
 *        │  D  │
 *  ┌─────┼─ ───┼─────┐
 *  │  A     B     C  │
 *  └─────┴─────┴─────┘
 */
function enfilade(): Map<string, VisibilityRoom> {
  const bd: Opening = { to: "D", x0: 14.3, z0: 0, x1: 15.7, z1: 0, yMin: 0, yMax: 2.4 };
  return new Map(
    [
      room("A", 0, 0, [doorAtX("B", 10)]),
      room("B", 10, 0, [doorAtX("A", 10), doorAtX("C", 20), bd]),
      room("C", 20, 0, [doorAtX("B", 20)]),
      room("D", 10, -10, [{ ...bd, to: "B" }]),
    ].map((r) => [r.id, r]),
  );
}

const ids = (seen: Map<string, ScreenRect> | null) => (seen ? [...seen.keys()].sort() : null);

describe("visibleRooms", () => {
  it("sees the visitor's own room and nothing else with no door in view", () => {
    const { eye, viewProjection } = view([2, EYE_HEIGHT, 5], [0, EYE_HEIGHT, 5]);
    const seen = visibleRooms(enfilade(), eye, viewProjection);
    expect(ids(seen)).toEqual(["A"]);
    expect(isWholeScreen(seen?.get("A") as ScreenRect)).toBe(true);
  });

  it("sees down an enfilade and not into the room off its side", () => {
    const { eye, viewProjection } = view([2, EYE_HEIGHT, 5], [30, EYE_HEIGHT, 5]);
    const seen = visibleRooms(enfilade(), eye, viewProjection);
    // D's door is 21° off the line of sight; the door into B covers 5°.
    expect(ids(seen)).toEqual(["A", "B", "C"]);
    const b = seen?.get("B") as ScreenRect;
    const c = seen?.get("C") as ScreenRect;
    expect(isWholeScreen(b)).toBe(false);
    // Each door further on covers less of the screen.
    expect(c.x1 - c.x0).toBeLessThan(b.x1 - b.x0);
    expect(c.x0).toBeGreaterThanOrEqual(b.x0);
    expect(c.x1).toBeLessThanOrEqual(b.x1);
  });

  it("stops at a second door that is in the frustum but not behind the first", () => {
    // From the corner of A the door into B is in view, and so is the
    // door from B into C, but no line passes through both.
    const { eye, viewProjection } = view([2, EYE_HEIGHT, 9], [30, EYE_HEIGHT, 5]);
    expect(ids(visibleRooms(enfilade(), eye, viewProjection))).toEqual(["A", "B"]);
  });

  it("counts a visitor on a threshold as standing in both rooms", () => {
    // On the line between A and B, looking along the wall: the door is
    // edge-on and half the view is each room.
    const { eye, viewProjection } = view([10, EYE_HEIGHT, 5], [10, EYE_HEIGHT, 0]);
    const seen = visibleRooms(enfilade(), eye, viewProjection);
    expect(isWholeScreen(seen?.get("A") as ScreenRect)).toBe(true);
    expect(isWholeScreen(seen?.get("B") as ScreenRect)).toBe(true);
  });

  it("keeps both rooms whole a step either side of the threshold", () => {
    for (const x of [10 - NEAR_OPENING_M + 0.05, 10 + NEAR_OPENING_M - 0.05]) {
      // Back turned to the door.
      const away = x < 10 ? 0 : 30;
      const { eye, viewProjection } = view([x, EYE_HEIGHT, 5], [away, EYE_HEIGHT, 5]);
      const seen = visibleRooms(enfilade(), eye, viewProjection);
      expect(isWholeScreen(seen?.get("A") as ScreenRect)).toBe(true);
      expect(isWholeScreen(seen?.get("B") as ScreenRect)).toBe(true);
    }
  });

  it("drops a room whose door is above or below the screen", () => {
    // 4 m from the door, looking down at the floor in front of it. The
    // threshold is 24° below the horizon and the top of the screen 35°
    // below it at this pitch.
    const down = view([6, EYE_HEIGHT, 5], [6.5, 0.2, 5]);
    expect(ids(visibleRooms(enfilade(), down.eye, down.viewProjection))).toEqual(["A"]);
    // Looking up over the lintel, 17° above the horizon from 2 m.
    const up = view([8, EYE_HEIGHT, 5], [9, EYE_HEIGHT + Math.sqrt(3), 5]);
    expect(ids(visibleRooms(enfilade(), up.eye, up.viewProjection))).toEqual(["A"]);
  });

  it("returns null for an eye in no room", () => {
    const { eye, viewProjection } = view([-5, EYE_HEIGHT, 5], [30, EYE_HEIGHT, 5]);
    expect(visibleRooms(enfilade(), eye, viewProjection)).toBeNull();
    const below = view([2, -3, 5], [30, EYE_HEIGHT, 5]);
    expect(visibleRooms(enfilade(), below.eye, below.viewProjection)).toBeNull();
  });

  it("keeps what every way into a room shows of it", () => {
    // Two cabinets side by side east of A, each with a door from A and a
    // door on into one long room X. X is seen through both, in two
    // separate parts of the screen, and has a door on into Y1 behind the
    // first and Y2 behind the second.
    //
    //  ┌─────┬────┬─────┬────┐
    //  │        B1        Y1 │
    //  │  A  ├────┤  X  ├────┤
    //  │        B2        Y2 │
    //  └─────┴────┴─────┴────┘
    const door = (to: string, x: number, z: number): Opening => ({
      to,
      x0: x,
      z0: z - 0.7,
      x1: x,
      z1: z + 0.7,
      yMin: 0,
      yMax: 2.4,
    });
    const box = (id: string, x: number, z: number, depth: number, openings: Opening[]) => ({
      ...room(id, x, z, openings),
      zMax: z + depth,
    });
    // The doors of each way stand on one line from the eye at (2, 10):
    // z = 10 ∓ 0.3 (x - 2).
    const rooms = new Map(
      [
        box("A", 0, 0, 20, [door("B1", 10, 7.6), door("B2", 10, 12.4)]),
        box("B1", 10, 0, 10, [door("A", 10, 7.6), door("X", 20, 4.6)]),
        box("B2", 10, 10, 10, [door("A", 10, 12.4), door("X", 20, 15.4)]),
        box("X", 20, 0, 20, [
          door("B1", 20, 4.6),
          door("B2", 20, 15.4),
          door("Y1", 30, 1.6),
          door("Y2", 30, 18.4),
        ]),
        box("Y1", 30, 0, 10, [door("X", 30, 1.6)]),
        box("Y2", 30, 10, 10, [door("X", 30, 18.4)]),
      ].map((r) => [r.id, r]),
    );
    const { eye, viewProjection } = view([2, EYE_HEIGHT, 10], [30, EYE_HEIGHT, 10]);
    const seen = visibleRooms(rooms, eye, viewProjection);
    expect(ids(seen)).toEqual(["A", "B1", "B2", "X", "Y1", "Y2"]);
    // X holds both parts of the screen, not the one it was reached in
    // first.
    const x = seen?.get("X") as ScreenRect;
    expect(x.x0).toBeLessThan(0);
    expect(x.x1).toBeGreaterThan(0);
  });

  it("ignores an opening into a room that is not mounted", () => {
    const rooms = enfilade();
    rooms.delete("B");
    const { eye, viewProjection } = view([2, EYE_HEIGHT, 5], [30, EYE_HEIGHT, 5]);
    expect(ids(visibleRooms(rooms, eye, viewProjection))).toEqual(["A"]);
  });
});

describe("visibleRooms, the stairwell", () => {
  /** Two storeys. On each, a stairwell with a hall south of it and a
   *  3.5 m portal between them. */
  function stack(): Map<string, VisibilityRoom> {
    const rooms: VisibilityRoom[] = [];
    for (const storey of [0, 1]) {
      const y = storey * FLOOR_SEPARATION;
      const portal = (to: string): Opening => ({
        to,
        x0: 3.25,
        z0: 10,
        x1: 6.75,
        z1: 10,
        yMin: y,
        yMax: y + 3,
      });
      rooms.push(
        room(`stair-${storey}`, 0, 0, [portal(`hall-${storey}`)], { storey, shaft: "well" }),
        room(`hall-${storey}`, 0, 10, [portal(`stair-${storey}`)], { storey }),
      );
    }
    return new Map(rooms.map((r) => [r.id, r]));
  }

  it("sees every storey's stairwell from inside one", () => {
    // Back to the portal: the well is open whatever the camera faces.
    const { eye, viewProjection } = view([5, EYE_HEIGHT, 5], [5, EYE_HEIGHT, 0]);
    const seen = visibleRooms(stack(), eye, viewProjection);
    expect(ids(seen)).toEqual(["stair-0", "stair-1"]);
    expect(isWholeScreen(seen?.get("stair-1") as ScreenRect)).toBe(true);
  });

  it("places a visitor part-way up the stair", () => {
    // Eye above the upper floor's level, feet still on the flight,
    // looking up at the upper portal. The lower one is under the view.
    const y = FLOOR_SEPARATION + 0.4;
    const { eye, viewProjection } = view([5, y, 5], [5, y + 2, 20]);
    expect(ids(visibleRooms(stack(), eye, viewProjection))).toEqual([
      "hall-1",
      "stair-0",
      "stair-1",
    ]);
  });

  it("sees the whole well through the portal, and no room of the storey above", () => {
    const { eye, viewProjection } = view([5, EYE_HEIGHT, 15], [5, EYE_HEIGHT, 0]);
    const seen = visibleRooms(stack(), eye, viewProjection);
    // The upper hall's portal is above this one's lintel on screen.
    expect(ids(seen)).toEqual(["hall-0", "stair-0", "stair-1"]);
    expect(seen?.get("stair-1")).toEqual(seen?.get("stair-0"));
    expect(isWholeScreen(seen?.get("stair-0") as ScreenRect)).toBe(false);
  });

  it("sees a room of the next storey through the well's far portal", () => {
    // On the upper landing looking down across the well at the lower
    // storey's portal.
    const y = FLOOR_SEPARATION + EYE_HEIGHT;
    const { eye, viewProjection } = view([5, y, 1], [5, 1.2, 10]);
    expect(ids(visibleRooms(stack(), eye, viewProjection))).toContain("hall-0");
  });

  it("keeps the stair halls of one floor apart and stacks each through the floors", () => {
    // A hall of the block plan starts on the floor its stair leaves:
    // one hall on the first floor, two on the second, three from there.
    // Each keeps one key through every floor it is a hall on.
    const keys = blockPlan.floors.map((floor) => floor.rooms.flatMap((r) => shaftKey(r) ?? []));
    const top = keys[keys.length - 1];
    expect(new Set(top).size).toBe(3);
    expect(keys.map((k) => new Set(k).size)).toEqual([1, 2, 3, 3]);
    for (const floorKeys of keys) for (const key of floorKeys) expect(top).toContain(key);
    expect(tower.flatMap((r) => shaftKey(r) ?? [])).toHaveLength(1);
  });

  it("hides the well from a hall with its back to the portal", () => {
    const { eye, viewProjection } = view([5, EYE_HEIGHT, 15], [5, EYE_HEIGHT, 20]);
    expect(ids(visibleRooms(stack(), eye, viewProjection))).toEqual(["hall-0"]);
  });
});

describe("openingOnScreen", () => {
  const out: ScreenRect = { x0: 0, y0: 0, x1: 0, y1: 0 };

  it("bounds a door ahead", () => {
    const { viewProjection } = view([2, EYE_HEIGHT, 5], [30, EYE_HEIGHT, 5]);
    expect(openingOnScreen(doorAtX("B", 10), viewProjection, out)).toBe(true);
    expect(out.x0).toBeCloseTo(-out.x1, 6);
    expect(out.x1).toBeGreaterThan(0.02);
    expect(out.x1).toBeLessThan(0.2);
  });

  it("rejects a door behind the eye", () => {
    const { viewProjection } = view([2, EYE_HEIGHT, 5], [0, EYE_HEIGHT, 5]);
    expect(openingOnScreen(doorAtX("B", 10), viewProjection, out)).toBe(false);
  });

  it("runs a door that passes the eye off the edge of the screen", () => {
    // Beside the door, looking along the wall: one jamb is ahead, the
    // other behind.
    const { viewProjection } = view([9, EYE_HEIGHT, 5], [9, EYE_HEIGHT, 0]);
    expect(openingOnScreen(doorAtX("B", 10), viewProjection, out)).toBe(true);
    expect(out.x1).toBeGreaterThan(1);
  });
});

describe("sphereInScreenRect", () => {
  const { viewProjection } = view([0, 0, 0], [0, 0, -1]);
  const centre: ScreenRect = { x0: -0.1, y0: -0.3, x1: 0.1, y1: 0.3 };

  it("accepts a sphere that shows in the rectangle", () => {
    expect(sphereInScreenRect(viewProjection, centre, 0, 0, -20, 1)).toBe(true);
    // Centre outside, edge inside.
    expect(sphereInScreenRect(viewProjection, centre, 3.2, 0, -20, 2)).toBe(true);
  });

  it("rejects one beside, above or below it", () => {
    expect(sphereInScreenRect(viewProjection, centre, 8, 0, -20, 1)).toBe(false);
    expect(sphereInScreenRect(viewProjection, centre, -8, 0, -20, 1)).toBe(false);
    expect(sphereInScreenRect(viewProjection, centre, 0, 9, -20, 1)).toBe(false);
    expect(sphereInScreenRect(viewProjection, centre, 0, -9, -20, 1)).toBe(false);
  });

  it("accepts a sphere round the eye and rejects one behind it", () => {
    expect(sphereInScreenRect(viewProjection, centre, 3, 0, 0.5, 4)).toBe(true);
    expect(sphereInScreenRect(viewProjection, centre, 0, 0, 20, 1)).toBe(false);
  });
});

// ── The museum's own floors ──────────────────────────────────────────
// Rays stand in for pixels. Each is followed from the eye through the
// rooms it crosses: on through a door, stopped by a wall, floor or
// ceiling. A room a ray enters is a room with a pixel on screen, and the
// walk must have it, in a rectangle that holds that pixel.

const works = Array.from(
  { length: 300 },
  (_, i) =>
    ({
      id: `work-${i}`,
      objectKey: `folder/work-${i}.jpg`,
      movement: "Baroque",
      year: 1650,
      artistSlug: `artist-${i % 40}`,
      width: 1600,
      height: 1200,
      realDimensions: { widthCm: 150, heightCm: 112 },
    }) as unknown as ArtworkListing,
);
const tower = layoutMuseum(works).floors.find((f) => f.era.id === "baroque")?.rooms ?? [];

/** The second plan (layout-block.ts): three stair halls a floor, a door
 *  in every wall two rooms share, each room in its own era's colour. */
const blockPlan = layoutBlock(
  ERAS.flatMap((era) =>
    Array.from(
      { length: 60 },
      (_, i) =>
        ({
          id: `${era.id}-${i}`,
          objectKey: `folder/${era.id}-${i}.jpg`,
          movement: era.movements[0],
          year: null,
          artistSlug: `${era.id}-artist-${i % 20}`,
          width: 4096,
          height: 3072,
          realDimensions: { widthCm: 120, heightCm: 90 },
        }) as unknown as ArtworkListing,
    ),
  ),
);
const block = blockPlan.floors[0]?.rooms ?? [];

/** Deterministic stand-in for Math.random. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe.each([
  ["the tower's Baroque floor", tower, 8],
  // Thirteen: twelve rooms and three stair halls, less the two a floor
  // joins into its long gallery.
  ["a floor of the block plan", block, 13],
])("visibleRooms on %s", (_name, floorRooms, atLeast) => {
  const byId = new Map(floorRooms.map((r) => [r.id, r]));
  const visibility = new Map(floorRooms.map((r) => [r.id, visibilityRoom(r)]));

  /** Rooms a ray from `origin` (inside `start`) passes through. */
  function roomsAlongRay(start: RoomLayout, origin: THREE.Vector3, direction: THREE.Vector3) {
    const entered: string[] = [];
    let current = start;
    const p = origin.clone();
    const d = direction;
    for (let hop = 0; hop < 64; hop++) {
      entered.push(current.id);
      const box = visibility.get(current.id) as VisibilityRoom;
      const floorY = current.worldRect.y;
      const ceilingY = floorY + (current.isStairwell ? INTER_FLOOR_HEIGHT : current.ceilingHeight);
      const tx = d.x > 0 ? (box.xMax - p.x) / d.x : d.x < 0 ? (box.xMin - p.x) / d.x : Infinity;
      const tz = d.z > 0 ? (box.zMax - p.z) / d.z : d.z < 0 ? (box.zMin - p.z) / d.z : Infinity;
      const ty = d.y > 0 ? (ceilingY - p.y) / d.y : d.y < 0 ? (floorY - p.y) / d.y : Infinity;
      const t = Math.min(tx, tz, ty);
      if (!Number.isFinite(t)) return entered;
      p.addScaledVector(d, t);
      if (t === ty) return entered;
      const side = t === tx ? (d.x > 0 ? "east" : "west") : d.z > 0 ? "south" : "north";
      const door = current.doors.find((candidate) => {
        if (candidate.side !== side) return false;
        const along =
          side === "east" || side === "west" ? p.z - candidate.worldZ : p.x - candidate.worldX;
        return Math.abs(along) <= candidate.width / 2 && p.y - floorY <= candidate.height;
      });
      const next = door && byId.get(door.connectsTo.roomId);
      if (!next) return entered;
      current = next;
    }
    return entered;
  }

  it("opens enough rooms for the check to mean something", () => {
    expect(floorRooms.length).toBeGreaterThanOrEqual(atLeast);
  });

  // About a second for both floors on a quiet machine. The limit is for
  // a busy one: several agent sessions share this repo's machine.
  it("never leaves out a room a ray from the eye enters", { timeout: 120_000 }, () => {
    const random = mulberry32(20261012);
    const target = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const point = new THREE.Vector3();
    let poses = 0;
    let rays = 0;
    let roomsSeen = 0;
    const missed: string[] = [];

    const check = (
      start: RoomLayout,
      eye: [number, number, number],
      yaw: number,
      pitch: number,
      options: { fov: number; aspect: number },
    ) => {
      target.set(
        eye[0] + Math.cos(pitch) * Math.cos(yaw),
        eye[1] + Math.sin(pitch),
        eye[2] + Math.cos(pitch) * Math.sin(yaw),
      );
      const v = view(eye, [target.x, target.y, target.z], options);
      const seen = visibleRooms(visibility, v.eye, v.viewProjection);
      if (!seen) {
        missed.push(`no room at ${eye.join(", ")}`);
        return;
      }
      poses++;
      roomsSeen += seen.size;
      const origin = new THREE.Vector3(...eye);
      for (let ix = 0; ix <= 24; ix++) {
        for (let iy = 0; iy <= 14; iy++) {
          const nx = -1 + ix / 12;
          const ny = -1 + iy / 7;
          point.set(nx, ny, 0.5).unproject(v.camera);
          direction.copy(point).sub(origin).normalize();
          rays++;
          const entered = roomsAlongRay(start, origin, direction);
          for (let i = 1; i < entered.length; i++) {
            const rect = seen.get(entered[i]);
            const slack = 1e-6;
            if (
              !rect ||
              nx < rect.x0 - slack ||
              nx > rect.x1 + slack ||
              ny < rect.y0 - slack ||
              ny > rect.y1 + slack
            ) {
              missed.push(
                `${entered[i]} from ${start.id} at ${eye.map((n) => n.toFixed(2)).join(", ")} yaw ${yaw.toFixed(2)} pitch ${pitch.toFixed(2)} ray ${nx.toFixed(2)}, ${ny.toFixed(2)}: ${rect ? "outside its rectangle" : "not seen"}`,
              );
            }
          }
        }
      }
    };

    const lenses = [
      { fov: 75, aspect: 16 / 9 },
      { fov: 35, aspect: 16 / 9 },
      { fov: 75, aspect: 9 / 19.5 },
    ];
    for (const start of floorRooms) {
      const box = visibility.get(start.id) as VisibilityRoom;
      const y = start.worldRect.y;
      // Anywhere in the room, at the three eye heights the player has.
      for (let i = 0; i < 40; i++) {
        const eye: [number, number, number] = [
          box.xMin + 0.3 + random() * (box.xMax - box.xMin - 0.6),
          y + [1.05, 1.75, 2.15][i % 3],
          box.zMin + 0.3 + random() * (box.zMax - box.zMin - 0.6),
        ];
        check(start, eye, random() * Math.PI * 2, (random() - 0.6) * 2.2, lenses[i % 3]);
      }
      // In and beside each doorway, where a door fills the view or is
      // seen edge-on.
      for (const door of start.doors) {
        const inward =
          door.side === "north"
            ? [0, 1]
            : door.side === "south"
              ? [0, -1]
              : door.side === "west"
                ? [1, 0]
                : [-1, 0];
        for (const back of [0.001, 0.05, 0.3, NEAR_OPENING_M - 0.01, NEAR_OPENING_M + 0.01, 1.5]) {
          for (let i = 0; i < 6; i++) {
            const across = (random() - 0.5) * (door.width - 0.1);
            const eye: [number, number, number] = [
              door.worldX + inward[0] * back + (inward[0] === 0 ? across : 0),
              y + EYE_HEIGHT,
              door.worldZ + inward[1] * back + (inward[1] === 0 ? across : 0),
            ];
            check(start, eye, random() * Math.PI * 2, (random() - 0.6) * 1.6, lenses[i % 3]);
          }
        }
      }
    }

    // Along every line through two doors in a row, where the far room
    // shows as a sliver.
    for (const start of floorRooms) {
      const y = start.worldRect.y;
      const box = visibility.get(start.id) as VisibilityRoom;
      for (const first of start.doors) {
        const middle = byId.get(first.connectsTo.roomId);
        for (const second of middle?.doors ?? []) {
          if (second.connectsTo.roomId === start.id) continue;
          const dx = second.worldX - first.worldX;
          const dz = second.worldZ - first.worldZ;
          const length = Math.hypot(dx, dz);
          for (const back of [1, 3, 6, 10]) {
            const eye: [number, number, number] = [
              first.worldX - (dx / length) * back,
              y + EYE_HEIGHT,
              first.worldZ - (dz / length) * back,
            ];
            if (
              eye[0] < box.xMin + 0.3 ||
              eye[0] > box.xMax - 0.3 ||
              eye[2] < box.zMin + 0.3 ||
              eye[2] > box.zMax - 0.3
            ) {
              continue;
            }
            for (let i = 0; i < 3; i++) {
              const yaw = Math.atan2(dz, dx) + (random() - 0.5) * 0.6;
              check(start, eye, yaw, (random() - 0.5) * 0.5, lenses[(i + back) % 3]);
            }
          }
        }
      }
    }

    expect(missed.slice(0, 5)).toEqual([]);
    expect(poses).toBeGreaterThan(1000);
    expect(rays).toBe(poses * 375);
    // And it culls: a pose sees well under half the floor on average.
    expect(roomsSeen / poses).toBeLessThan(floorRooms.length * 0.4);
  });
});

const SIDES = ["north", "south", "east", "west"] as const;
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east" } as const;

describe("wallSharers", () => {
  const floorRooms = tower;
  const stairwell = floorRooms.find((r) => r.isStairwell) as RoomLayout;
  const named = (suffix: string) => floorRooms.find((r) => r.id.endsWith(suffix)) as RoomLayout;

  it("names the rooms that stand against each side", () => {
    expect(wallSharers(stairwell, floorRooms)).toEqual({
      // Leaves its south wall out: the stairwell's is the only one.
      north: [named("n-hall").id],
      // Draws its own north wall on the same line.
      south: [named("grand-hall").id],
      // No door on these two, and still one wall between two rooms.
      east: [named("-east").id],
      west: [named("-west").id],
    });
  });

  it("leaves an outside wall to its own room", () => {
    const strip = named("s-strip");
    expect(wallSharers(strip, floorRooms).south).toEqual([]);
  });

  it.each([
    ["the tower", tower],
    ["the block plan", block],
  ])("finds a drawn wall for every wall a room of %s leaves out", (_name, rooms) => {
    // Every stretch of a left-out wall, cell by cell: a wall can run
    // past more than one neighbour.
    for (const r of rooms) {
      for (const side of SIDES) {
        if (!r.suppressWalls?.[side]) continue;
        const across = rooms.filter((other) =>
          wallSharers(other, rooms)[OPPOSITE[side]].includes(r.id),
        );
        const alongX = side === "north" || side === "south";
        const from = alongX ? r.cellBounds.xMin : r.cellBounds.zMin;
        const to = alongX ? r.cellBounds.xMax : r.cellBounds.zMax;
        for (let cell = from; cell <= to; cell++) {
          const neighbour = across.find((other) =>
            alongX
              ? other.cellBounds.xMin <= cell && cell <= other.cellBounds.xMax
              : other.cellBounds.zMin <= cell && cell <= other.cellBounds.zMax,
          );
          // Nothing stands there: an outside wall nobody draws is the
          // plan's affair, not culling's.
          if (!neighbour) continue;
          expect(neighbour.suppressWalls?.[OPPOSITE[side]], `${r.id} ${side} @${cell}`).toBeFalsy();
        }
      }
    }
  });

  it.each([
    ["the tower", tower],
    ["the block plan", block],
  ])("pairs up in %s: a room is on its neighbour's list for the facing side", (_name, rooms) => {
    const byId = new Map(rooms.map((r) => [r.id, r]));
    for (const r of rooms) {
      const shared = wallSharers(r, rooms);
      for (const side of SIDES) {
        for (const id of shared[side]) {
          const other = byId.get(id) as RoomLayout;
          expect(wallSharers(other, rooms)[OPPOSITE[side]]).toContain(r.id);
        }
      }
    }
  });
});
