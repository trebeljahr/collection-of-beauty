"use client";

import type RAPIER from "@dimforge/rapier3d-compat";
import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World,
} from "@dimforge/rapier3d-compat";
import { benchRect, clearsBenches, dividerRect } from "@/lib/gallery-layout/fittings";
import {
  GRAND_RAIL_HEIGHT,
  type GrandStair,
  openingInWorld,
  railInWorld,
  toStairWorld,
} from "@/lib/gallery-layout/grand-stair";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  doorOpenHalfSpan,
  FLOOR_THICKNESS,
  hasStairwellCutout,
  INTER_FLOOR_HEIGHT,
  SPIRAL_COLUMN_RADIUS,
  SPIRAL_FLOOR_CUTOUT_RADIUS,
} from "@/lib/gallery-layout/world-coords";
import {
  BALUSTER_HEIGHT,
  BALUSTER_SIZE,
  CUTOUT_RAIL_RADIUS,
  GATE_POST_HEIGHT,
  GATE_POST_RADIAL_DEPTH,
  GATE_POST_TANGENT_WIDTH,
  RAIL_BAR_HALF_WIDTH,
  RAIL_HEIGHT,
} from "./rail-constants";
import { floorShafts, type StairShaft, spiralGateHalfArc } from "./spiral-physics";

type RapierModule = typeof RAPIER;

type Vec3 = { x: number; y: number; z: number };

const PLAYER_COLLIDER_TOTAL_HEIGHT = 1.75;
const PLAYER_CAPSULE_HALF_HEIGHT = (PLAYER_COLLIDER_TOTAL_HEIGHT - 2 * 0.3) / 2;
const PHYSICS_OFFSET = 0.02;
const WALL_HALF_THICKNESS = 0.05;
const ARC_SEGMENT_MAX_LEN = 0.55;
// A bench's collider is taller than the bench. The player's capsule
// ends in a 0.3 m hemisphere, and a box that stops within that height
// of its feet meets it on the curve, where the contact normal points up
// and the character controller rides over the bench as if it were a
// ramp. So the box is a wall for as long as the feet are under the
// seat, and `move` leaves it out altogether once they are not: getting
// onto a bench takes a jump. What the player then stands on is not this
// collider. The seat's height comes from `benchUnder` in `player.tsx`.
const BENCH_COLLIDER_HEIGHT = 1.5;

let rapierPromise: Promise<RapierModule> | null = null;

async function loadRapier(): Promise<RapierModule> {
  if (!rapierPromise) {
    rapierPromise = import("@dimforge/rapier3d-compat")
      .then(async (mod) => {
        await mod.init();
        return mod;
      })
      // Drop the memo on failure. A stale chunk hash after a redeploy
      // otherwise sticks for the page's lifetime and every later floor
      // swap silently falls back to coarse collision.
      .catch((err) => {
        rapierPromise = null;
        throw err;
      });
  }
  return rapierPromise;
}

export class GalleryCollisionController {
  readonly world: World;

  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: KinematicCharacterController;
  private readonly floorY: number;
  private readonly benchHandles: ReadonlySet<number>;

  constructor(rapier: RapierModule, floor: FloorLayout, radius: number) {
    this.world = new rapier.World({ x: 0, y: 0, z: 0 });
    this.body = this.world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased());
    this.collider = this.world.createCollider(
      rapier.ColliderDesc.capsule(PLAYER_CAPSULE_HALF_HEIGHT, radius).setFriction(0),
      this.body,
    );
    this.controller = this.world.createCharacterController(PHYSICS_OFFSET);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.32, radius * 2, false);
    this.controller.enableSnapToGround(0.12);
    this.floorY = floor.y;
    this.benchHandles = buildStaticColliders(rapier, this.world, floor);
  }

  move(fromFeet: Vec3, desired: Vec3): Vec3 {
    const centerY = fromFeet.y + PLAYER_COLLIDER_TOTAL_HEIGHT / 2;
    this.body.setTranslation({ x: fromFeet.x, y: centerY, z: fromFeet.z }, false);
    // Rapier's character controller queries the broad phase. The
    // camera owns the player pose, so every frame we teleport the
    // kinematic body to match it; stepping the zero-gravity world here
    // flushes that pose into the collider sets before the KCC casts
    // against rail/wall colliders.
    this.world.step();
    const overBenches = clearsBenches(fromFeet.y - this.floorY);
    this.controller.computeColliderMovement(
      this.collider,
      desired,
      undefined,
      undefined,
      (collider) =>
        collider.handle !== this.collider.handle &&
        !(overBenches && this.benchHandles.has(collider.handle)),
    );
    return this.controller.computedMovement();
  }

  dispose() {
    this.world.removeCharacterController(this.controller);
    this.world.free();
  }
}

export async function createGalleryCollisionController(
  floor: FloorLayout,
  radius: number,
): Promise<GalleryCollisionController> {
  const rapier = await loadRapier();
  return new GalleryCollisionController(rapier, floor, radius);
}

/** Builds the floor's colliders and returns the handles of its benches. */
function buildStaticColliders(rapier: RapierModule, world: World, floor: FloorLayout): Set<number> {
  const fixedBody = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const addCuboid = (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY = 0,
  ) => {
    if (hx <= 0 || hy <= 0 || hz <= 0) return null;
    return world.createCollider(
      rapier.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(cx, cy, cz)
        .setRotation(yRotation(rotY))
        .setFriction(0),
      fixedBody,
    );
  };
  const addCylinder = (cx: number, cy: number, cz: number, halfHeight: number, radius: number) => {
    if (halfHeight <= 0 || radius <= 0) return;
    world.createCollider(
      rapier.ColliderDesc.cylinder(halfHeight, radius).setTranslation(cx, cy, cz).setFriction(0),
      fixedBody,
    );
  };
  const addArc = (
    cx: number,
    cz: number,
    radius: number,
    startTheta: number,
    sweep: number,
    yCenterForTheta: (theta: number, t: number) => number,
    heightForSegment: (theta: number, t: number) => number,
    thickness: number,
  ) => {
    const arcLen = Math.abs(sweep) * radius;
    const segments = Math.max(1, Math.ceil(arcLen / ARC_SEGMENT_MAX_LEN));
    for (let i = 0; i < segments; i++) {
      const t1 = i / segments;
      const t2 = (i + 1) / segments;
      const a1 = startTheta + sweep * t1;
      const a2 = startTheta + sweep * t2;
      const midT = (t1 + t2) / 2;
      const am = (a1 + a2) / 2;
      const x1 = cx + radius * Math.cos(a1);
      const z1 = cz + radius * Math.sin(a1);
      const x2 = cx + radius * Math.cos(a2);
      const z2 = cz + radius * Math.sin(a2);
      const mx = (x1 + x2) / 2;
      const mz = (z1 + z2) / 2;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const height = heightForSegment(am, midT);
      addCuboid(
        mx,
        yCenterForTheta(am, midT),
        mz,
        len / 2,
        height / 2,
        thickness / 2,
        -Math.atan2(z2 - z1, x2 - x1),
      );
    }
  };

  addFloorColliders(floor, addCuboid);
  addWallColliders(floor, addCuboid);
  addPortalJambColliders(floor, addCuboid);
  const benchHandles = addFittingColliders(floor, addCuboid);
  addStairwellColliders(floor, addCuboid, addCylinder, addArc);
  addGrandStairColliders(floor, addCuboid);
  return benchHandles;
}

/** Margin a floor collider keeps back from a grand stair's opening. A
 *  flight runs along the opening's edge, and a visitor on it passes the
 *  slab at shoulder height: the slab must not reach them. The
 *  balustrade is what stops a visitor on the gallery. */
const OPENING_COLLIDER_MARGIN = 0.4;
const GRAND_RAIL_THICKNESS = 0.24;
const GRAND_RAIL_PIECE = 0.7;

/**
 * Balustrades and piers of the grand stairs that meet this floor. A
 * rail on a flight is a row of short boxes, each at its own height,
 * because the visitor's capsule is put at their feet's height each
 * frame: a rail only stops a visitor who is level with it. Where a rail
 * stands on masonry the box runs down to the floor it stands on.
 */
function addGrandStairColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => unknown,
) {
  // Every rail of a stair is in the world of each floor of its hall,
  // at its own height: the balcony's on its floor, the flights' below.
  const stairs: GrandStair[] = floor.grandHalls ?? [
    ...(floor.grandStairsIn ?? []),
    ...(floor.grandStairsOut ?? []),
  ];
  for (const stair of stairs) {
    for (const local of stair.rails) {
      const r = railInWorld(stair, local);
      const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
      if (len < 0.01) continue;
      const pieces = Math.max(1, Math.ceil(len / GRAND_RAIL_PIECE));
      const rotY = -Math.atan2(r.z1 - r.z0, r.x1 - r.x0);
      for (let i = 0; i < pieces; i++) {
        const t0 = i / pieces;
        const t1 = (i + 1) / pieces;
        const ya = r.y0 + (r.y1 - r.y0) * t0;
        const yb = r.y0 + (r.y1 - r.y0) * t1;
        const bottom = r.skirtTo ?? Math.min(ya, yb);
        const top = Math.max(ya, yb) + GRAND_RAIL_HEIGHT;
        const tm = (t0 + t1) / 2;
        addCuboid(
          r.x0 + (r.x1 - r.x0) * tm,
          (bottom + top) / 2,
          r.z0 + (r.z1 - r.z0) * tm,
          len / pieces / 2,
          (top - bottom) / 2,
          GRAND_RAIL_THICKNESS / 2,
          rotY,
        );
      }
    }
    for (const column of stair.columns) {
      const at = toStairWorld(stair, column.x, column.z);
      addCuboid(
        at.x,
        (column.y0 + column.y1) / 2,
        at.z,
        column.size / 2,
        (column.y1 - column.y0) / 2,
        column.size / 2,
      );
    }
  }
}

function addFloorColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
) {
  const y = floor.y - FLOOR_THICKNESS / 2 - 0.001;
  // Above the ground floor the stairwell slab is RENDERED with a
  // circular hole around the spiral (StairwellFloor's `cutHole`), so
  // the descending flight stays visible. The collider set has to punch
  // the same hole. Without it the slab is solid right across the well,
  // and a player riding the spiral past this storey's level — the last
  // ~8% of a climb, the first ~30% of a descent, i.e. exactly the
  // landings — has their capsule impaled on it. Rapier then reports the
  // slab's merged row strips as a pair of opposing vertical walls and
  // computedMovement() collapses to zero. Because the spiral's Y is
  // derived from how far the player has walked *around* it, zero
  // horizontal movement also means zero vertical movement: the player
  // sticks to the stairs and can't walk out of it. Nothing stands on
  // this collider anyway — vertical position on the spiral and on a
  // plain floor is both driven analytically in `player.tsx`, and the
  // cutout rail keeps a player at floor level well outside the hole.
  type Hole =
    | { kind: "disc"; x: number; z: number; r: number }
    | { kind: "rect"; xMin: number; xMax: number; zMin: number; zMax: number };
  const holes: Hole[] = hasStairwellCutout(floor.index)
    ? floorShafts(floor).map((shaft) => ({
        kind: "disc",
        x: shaft.reference.centerX,
        z: shaft.reference.centerZ,
        r: SPIRAL_FLOOR_CUTOUT_RADIUS,
      }))
    : [];
  // A grand stair's opening, in the floor it arrives on and in every
  // balcony floor of its hall above that.
  const openStairs =
    floor.grandHalls?.filter((stair) => floor.index > stair.lowerFloor) ??
    floor.grandStairsIn ??
    [];
  for (const stair of openStairs) {
    const o = openingInWorld(stair);
    const m = OPENING_COLLIDER_MARGIN;
    if (o.kind === "disc") {
      holes.push({ ...o, r: o.r + m });
      continue;
    }
    for (const r of o.rects) {
      holes.push({
        kind: "rect",
        xMin: r.xMin - m,
        xMax: r.xMax + m,
        zMin: r.zMin - m,
        zMax: r.zMax + m,
      });
    }
  }
  const emitRun = (startX: number, endX: number, z: number) => {
    const x0 = startX * CELL_SIZE;
    const x1 = (endX + 1) * CELL_SIZE;
    const cz = z * CELL_SIZE + CELL_SIZE / 2;
    let spans: Array<[number, number]> = [[x0, x1]];
    for (const hole of holes) {
      let holeMin: number;
      let holeMax: number;
      if (hole.kind === "rect") {
        if ((z + 1) * CELL_SIZE <= hole.zMin || z * CELL_SIZE >= hole.zMax) continue;
        holeMin = hole.xMin;
        holeMax = hole.xMax;
      } else {
        // Widest chord the hole cuts anywhere in this row's z-band —
        // measured at whichever row edge is nearest the centre, or 0 when
        // the row straddles it — so a row the circle merely clips still
        // loses its whole overlap rather than a cell-quantised slice.
        const zNear = z * CELL_SIZE - hole.z;
        const zFar = (z + 1) * CELL_SIZE - hole.z;
        const near = zNear * zFar <= 0 ? 0 : Math.min(Math.abs(zNear), Math.abs(zFar));
        if (near >= hole.r) continue;
        const half = Math.sqrt(hole.r * hole.r - near * near);
        holeMin = hole.x - half;
        holeMax = hole.x + half;
      }
      // A row can cross more than one well: cut each out of what the
      // wells before it left.
      const cut: Array<[number, number]> = [];
      for (const [a, b] of spans) {
        if (a < holeMin) cut.push([a, Math.min(b, holeMin)]);
        if (b > holeMax) cut.push([Math.max(a, holeMax), b]);
      }
      spans = cut;
    }
    for (const [a, b] of spans) {
      const width = b - a;
      if (width <= 0) continue;
      addCuboid(a + width / 2, y, cz, width / 2, FLOOR_THICKNESS / 2, CELL_SIZE / 2);
    }
  };

  for (let z = 0; z < floor.gridSize.z; z++) {
    let startX: number | null = null;
    for (let x = 0; x <= floor.gridSize.x; x++) {
      const walkable = x < floor.gridSize.x && floor.walkable[z * floor.gridSize.x + x] === 1;
      if (walkable && startX == null) startX = x;
      if ((!walkable || x === floor.gridSize.x) && startX != null) {
        emitRun(startX, x - 1, z);
        startX = null;
      }
    }
  }
}

function addWallColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
) {
  const seen = new Set<string>();
  const wallY = floor.y + INTER_FLOOR_HEIGHT / 2;
  const wallHalfY = INTER_FLOOR_HEIGHT / 2;
  const isWalkableCell = (x: number, z: number) =>
    x >= 0 &&
    x < floor.gridSize.x &&
    z >= 0 &&
    z < floor.gridSize.z &&
    floor.walkable[z * floor.gridSize.x + x] === 1;
  const isBlockedEW = (x: number, z: number) =>
    x >= 0 &&
    x < floor.gridSize.x - 1 &&
    z >= 0 &&
    z < floor.gridSize.z &&
    floor.blockedEdgesEW[z * (floor.gridSize.x - 1) + x] === 1;
  const isBlockedNS = (x: number, z: number) =>
    x >= 0 &&
    x < floor.gridSize.x &&
    z >= 0 &&
    z < floor.gridSize.z - 1 &&
    floor.blockedEdgesNS[z * floor.gridSize.x + x] === 1;

  for (let z = 0; z < floor.gridSize.z; z++) {
    for (let x = 0; x < floor.gridSize.x; x++) {
      if (!isWalkableCell(x, z)) continue;
      const x0 = x * CELL_SIZE;
      const z0 = z * CELL_SIZE;
      const addEW = (edgeX: number) => {
        const key = `ew:${edgeX}:${z}`;
        if (seen.has(key)) return;
        seen.add(key);
        addCuboid(
          (edgeX + 1) * CELL_SIZE,
          wallY,
          z0 + CELL_SIZE / 2,
          WALL_HALF_THICKNESS,
          wallHalfY,
          CELL_SIZE / 2,
        );
      };
      const addNS = (edgeZ: number) => {
        const key = `ns:${x}:${edgeZ}`;
        if (seen.has(key)) return;
        seen.add(key);
        addCuboid(
          x0 + CELL_SIZE / 2,
          wallY,
          (edgeZ + 1) * CELL_SIZE,
          CELL_SIZE / 2,
          wallHalfY,
          WALL_HALF_THICKNESS,
        );
      };

      if (!isWalkableCell(x - 1, z) || isBlockedEW(x - 1, z)) addEW(x - 1);
      if (!isWalkableCell(x + 1, z) || isBlockedEW(x, z)) addEW(x);
      if (!isWalkableCell(x, z - 1) || isBlockedNS(x, z - 1)) addNS(z - 1);
      if (!isWalkableCell(x, z + 1) || isBlockedNS(x, z)) addNS(z);
    }
  }
}

/**
 * The wall either side of a portal. A portal opens three cell edges in
 * the masks and is narrower than the three cells, so the mask leaves
 * its jambs without a wall collider: a metre of each. A 1.4 m door has
 * the same gap on a smaller scale (0.55 m), which `fitsDoorwayApertures`
 * and the doorway nudge handle well enough; a portal's jamb is long
 * enough to walk into square on, and needs something to slide along.
 */
function addPortalJambColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
) {
  const seen = new Set<string>();
  const wallY = floor.y + INTER_FLOOR_HEIGHT / 2;
  const wallHalfY = INTER_FLOOR_HEIGHT / 2;
  for (const room of floor.rooms) {
    for (const door of room.doors) {
      const openHalf = doorOpenHalfSpan(door.width);
      const jamb = openHalf - door.width / 2;
      if (openHalf <= CELL_SIZE / 2 || jamb <= 0.01) continue;
      // Both rooms carry the door; build its jambs once.
      const key = `${door.worldX.toFixed(2)}:${door.worldZ.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const alongX = door.side === "north" || door.side === "south";
      for (const side of [-1, 1]) {
        const offset = side * (door.width / 2 + jamb / 2);
        addCuboid(
          door.worldX + (alongX ? offset : 0),
          wallY,
          door.worldZ + (alongX ? 0 : offset),
          alongX ? jamb / 2 : WALL_HALF_THICKNESS,
          wallHalfY,
          alongX ? WALL_HALF_THICKNESS : jamb / 2,
        );
      }
    }
  }
}

/**
 * Dividers and benches, as the boxes they are. The edge masks already
 * carry a divider as a 0.1 m wall on its grid line; this is its real
 * 0.4 m, so the player stops at the plaster and not inside it. A bench
 * is in no mask at all (it is smaller than a cell) and this is its only
 * collider. `clearOfFittings` is the same rule without a physics world.
 * Returns the benches' collider handles.
 */
function addFittingColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => Collider | null,
): Set<number> {
  const benchHandles = new Set<number>();
  for (const room of floor.rooms) {
    for (const divider of room.dividers) {
      const r = dividerRect(divider);
      addCuboid(
        (r.xMin + r.xMax) / 2,
        floor.y + room.ceilingHeight / 2,
        (r.zMin + r.zMax) / 2,
        (r.xMax - r.xMin) / 2,
        room.ceilingHeight / 2,
        (r.zMax - r.zMin) / 2,
      );
    }
    for (const bench of room.benches) {
      const r = benchRect(bench);
      const collider = addCuboid(
        (r.xMin + r.xMax) / 2,
        floor.y + BENCH_COLLIDER_HEIGHT / 2,
        (r.zMin + r.zMax) / 2,
        (r.xMax - r.xMin) / 2,
        BENCH_COLLIDER_HEIGHT / 2,
        (r.zMax - r.zMin) / 2,
      );
      if (collider) benchHandles.add(collider.handle);
    }
  }
  return benchHandles;
}

function addStairwellColliders(
  floor: FloorLayout,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
  addCylinder: (cx: number, cy: number, cz: number, halfHeight: number, radius: number) => void,
  addArc: (
    cx: number,
    cz: number,
    radius: number,
    startTheta: number,
    sweep: number,
    yCenterForTheta: (theta: number, t: number) => number,
    heightForSegment: (theta: number, t: number) => number,
    thickness: number,
  ) => void,
) {
  const stairs = uniqueStairs([...floor.stairsIn, ...floor.stairsOut]);
  for (const stair of stairs) {
    addCylinder(
      stair.centerX,
      floor.y + INTER_FLOOR_HEIGHT / 2,
      stair.centerZ,
      INTER_FLOOR_HEIGHT / 2,
      hasStairwellCutout(floor.index) ? stair.innerRadius : SPIRAL_COLUMN_RADIUS,
    );
    addSpiralRailColliders(stair, "inner", addArc);
    addSpiralRailColliders(stair, "outer", addArc);
  }

  for (const shaft of floorShafts(floor)) addCutoutRailColliders(floor, shaft, addCuboid, addArc);
}

function addSpiralRailColliders(
  stair: Staircase,
  side: "inner" | "outer",
  addArc: (
    cx: number,
    cz: number,
    radius: number,
    startTheta: number,
    sweep: number,
    yCenterForTheta: (theta: number, t: number) => number,
    heightForSegment: (theta: number, t: number) => number,
    thickness: number,
  ) => void,
) {
  const radius =
    side === "inner"
      ? stair.innerRadius + RAIL_BAR_HALF_WIDTH
      : stair.outerRadius - RAIL_BAR_HALF_WIDTH;
  const gate = side === "outer" ? spiralGateHalfArc(stair.numSteps) : 0;
  const ranges = gate > 0 ? [[gate, Math.PI * 2 - 2 * gate]] : [[0, Math.PI * 2]];
  for (const [rawStart, rawSweep] of ranges) {
    addArc(
      stair.centerX,
      stair.centerZ,
      radius,
      stair.entryAngle + stair.direction * rawStart,
      stair.direction * rawSweep,
      (_theta, t) => {
        const raw = rawStart + rawSweep * t;
        const treadY = stair.lowerY + (raw / (Math.PI * 2)) * (stair.upperY - stair.lowerY);
        return treadY + RAIL_HEIGHT / 2;
      },
      () => RAIL_HEIGHT,
      Math.max(BALUSTER_SIZE, RAIL_BAR_HALF_WIDTH * 2),
    );
  }
}

function addCutoutRailColliders(
  floor: FloorLayout,
  shaft: StairShaft,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
  addArc: (
    cx: number,
    cz: number,
    radius: number,
    startTheta: number,
    sweep: number,
    yCenterForTheta: (theta: number, t: number) => number,
    heightForSegment: (theta: number, t: number) => number,
    thickness: number,
  ) => void,
) {
  const { stairOut, stairIn, reference } = shaft;
  const hasCutout = hasStairwellCutout(floor.index);
  const upSideOpen = !!stairOut;
  const downSideOpen = !!stairIn;
  const gateHalfArc = spiralGateHalfArc(reference.numSteps);
  const hasSpiralEnd = !upSideOpen && !!stairIn;
  const bridgeArcSweep = hasSpiralEnd ? gateHalfArc : 0;
  const upGap = upSideOpen ? gateHalfArc : bridgeArcSweep;
  const downGap = downSideOpen ? gateHalfArc : 0;
  const cx = reference.centerX;
  const cz = reference.centerZ;

  // Fall-prevention rail around the well, mirroring the geometry in
  // `stairwell-rail.tsx`. Floors above ground only: the ground floor's
  // spiral rises out of solid slab, so there is no hole to fence. What
  // keeps a ground-floor player off the low treads is the entry rule in
  // `canAcceptPhysicsMove`, not a collider ring — and that rule lets
  // them walk the part of the footprint where the flight is a storey
  // overhead, so a ring here would wall off a room as well as a stair.
  if (hasCutout) {
    addArc(
      cx,
      cz,
      CUTOUT_RAIL_RADIUS,
      reference.entryAngle + upGap,
      Math.PI * 2 - upGap - downGap,
      () => floor.y + RAIL_HEIGHT / 2,
      () => RAIL_HEIGHT,
      Math.max(BALUSTER_SIZE, RAIL_BAR_HALF_WIDTH * 2),
    );
  }

  const addGatePost = (angle: number) => {
    const x = cx + CUTOUT_RAIL_RADIUS * Math.cos(angle);
    const z = cz + CUTOUT_RAIL_RADIUS * Math.sin(angle);
    const rotY = Math.PI / 2 - angle;
    addCuboid(
      x,
      floor.y + GATE_POST_HEIGHT / 2,
      z,
      GATE_POST_TANGENT_WIDTH / 2,
      GATE_POST_HEIGHT / 2,
      GATE_POST_RADIAL_DEPTH / 2,
      rotY,
    );
  };
  if (upSideOpen) addGatePost(reference.entryAngle + gateHalfArc);
  if (downSideOpen) addGatePost(reference.entryAngle - gateHalfArc);

  if (hasCutout && hasSpiralEnd && stairIn) {
    addTopBridgeColliders(floor, stairIn, bridgeArcSweep, addCuboid);
  }
}

function addTopBridgeColliders(
  floor: FloorLayout,
  stairIn: Staircase,
  bridgeArcSweep: number,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
) {
  const aAngle = stairIn.entryAngle;
  const aR = stairIn.innerRadius + RAIL_BAR_HALF_WIDTH;
  const ax = stairIn.centerX + aR * Math.cos(aAngle);
  const az = stairIn.centerZ + aR * Math.sin(aAngle);
  const bAngle = stairIn.entryAngle + bridgeArcSweep;
  const bx = stairIn.centerX + CUTOUT_RAIL_RADIUS * Math.cos(bAngle);
  const bz = stairIn.centerZ + CUTOUT_RAIL_RADIUS * Math.sin(bAngle);
  const tx = -Math.sin(aAngle);
  const tz = Math.cos(aAngle);
  const dx = bx - ax;
  const dz = bz - az;
  const tComp = dx * tx + dz * tz;
  const cornerX = ax + tComp * tx;
  const cornerZ = az + tComp * tz;
  const y = floor.y + RAIL_HEIGHT / 2;
  addRunCollider(ax, az, cornerX, cornerZ, y, RAIL_HEIGHT, addCuboid);
  addRunCollider(cornerX, cornerZ, bx, bz, y, RAIL_HEIGHT, addCuboid);
  const postY = floor.y + BALUSTER_HEIGHT / 2;
  addCuboid(cornerX, postY, cornerZ, BALUSTER_SIZE / 2, BALUSTER_HEIGHT / 2, BALUSTER_SIZE / 2);
  addCuboid(bx, postY, bz, BALUSTER_SIZE / 2, BALUSTER_HEIGHT / 2, BALUSTER_SIZE / 2);
}

function addRunCollider(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  height: number,
  addCuboid: (
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    rotY?: number,
  ) => void,
) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len <= 0.001) return;
  addCuboid(
    (x1 + x2) / 2,
    y,
    (z1 + z2) / 2,
    len / 2,
    height / 2,
    Math.max(BALUSTER_SIZE, RAIL_BAR_HALF_WIDTH * 2) / 2,
    -Math.atan2(z2 - z1, x2 - x1),
  );
}

function uniqueStairs(stairs: Staircase[]): Staircase[] {
  const seen = new Set<string>();
  const out: Staircase[] = [];
  for (const stair of stairs) {
    if (seen.has(stair.id)) continue;
    seen.add(stair.id);
    out.push(stair);
  }
  return out;
}

function yRotation(rotY: number) {
  return {
    x: 0,
    y: Math.sin(rotY / 2),
    z: 0,
    w: Math.cos(rotY / 2),
  };
}
