"use client";

import type RAPIER from "@dimforge/rapier3d-compat";
import type {
  Collider,
  KinematicCharacterController,
  RigidBody,
  World,
} from "@dimforge/rapier3d-compat";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  FLOOR_THICKNESS,
  INTER_FLOOR_HEIGHT,
  SPIRAL_COLUMN_RADIUS,
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
import { findStairAbove, spiralGateHalfArc } from "./staircase";

type RapierModule = typeof RAPIER;

type Vec3 = { x: number; y: number; z: number };

const PLAYER_COLLIDER_TOTAL_HEIGHT = 1.75;
const PLAYER_CAPSULE_HALF_HEIGHT = (PLAYER_COLLIDER_TOTAL_HEIGHT - 2 * 0.3) / 2;
const PHYSICS_OFFSET = 0.02;
const WALL_HALF_THICKNESS = 0.05;
const ARC_SEGMENT_MAX_LEN = 0.55;

let rapierPromise: Promise<RapierModule> | null = null;

async function loadRapier(): Promise<RapierModule> {
  if (!rapierPromise) {
    rapierPromise = import("@dimforge/rapier3d-compat").then(async (mod) => {
      await mod.init();
      return mod;
    });
  }
  return rapierPromise;
}

export class GalleryCollisionController {
  readonly world: World;

  private readonly body: RigidBody;
  private readonly collider: Collider;
  private readonly controller: KinematicCharacterController;

  constructor(
    rapier: RapierModule,
    floor: FloorLayout,
    allStaircases: readonly Staircase[],
    radius: number,
  ) {
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
    buildStaticColliders(rapier, this.world, floor, allStaircases);
  }

  move(fromFeet: Vec3, desired: Vec3): Vec3 {
    const centerY = fromFeet.y + PLAYER_COLLIDER_TOTAL_HEIGHT / 2;
    this.body.setTranslation({ x: fromFeet.x, y: centerY, z: fromFeet.z }, false);
    this.controller.computeColliderMovement(
      this.collider,
      desired,
      undefined,
      undefined,
      (collider) => collider.handle !== this.collider.handle,
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
  allStaircases: readonly Staircase[],
  radius: number,
): Promise<GalleryCollisionController> {
  const rapier = await loadRapier();
  return new GalleryCollisionController(rapier, floor, allStaircases, radius);
}

function buildStaticColliders(
  rapier: RapierModule,
  world: World,
  floor: FloorLayout,
  allStaircases: readonly Staircase[],
) {
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
    if (hx <= 0 || hy <= 0 || hz <= 0) return;
    world.createCollider(
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
  addStairwellColliders(floor, allStaircases, addCuboid, addCylinder, addArc);
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
  for (let z = 0; z < floor.gridSize.z; z++) {
    let startX: number | null = null;
    for (let x = 0; x <= floor.gridSize.x; x++) {
      const walkable = x < floor.gridSize.x && floor.walkable[z * floor.gridSize.x + x] === 1;
      if (walkable && startX == null) startX = x;
      if ((!walkable || x === floor.gridSize.x) && startX != null) {
        const endX = x - 1;
        const width = (endX - startX + 1) * CELL_SIZE;
        addCuboid(
          startX * CELL_SIZE + width / 2,
          y,
          z * CELL_SIZE + CELL_SIZE / 2,
          width / 2,
          FLOOR_THICKNESS / 2,
          CELL_SIZE / 2,
        );
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

function addStairwellColliders(
  floor: FloorLayout,
  allStaircases: readonly Staircase[],
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
      floor.index > 0 ? stair.innerRadius : SPIRAL_COLUMN_RADIUS,
    );
    addSpiralRailColliders(stair, "inner", addArc);
    addSpiralRailColliders(stair, "outer", addArc);
    if (!findStairAbove(stair, allStaircases) && floor.index === stair.upperFloor) {
      addTopLandingEdgeCollider(stair, addCuboid);
    }
  }

  const reference = floor.stairsOut[0] ?? floor.stairsIn[0];
  if (!reference) return;
  addCutoutRailColliders(floor, reference, addCuboid, addArc);
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
  reference: Staircase,
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
  const stairOut = floor.stairsOut[0];
  const stairIn = floor.stairsIn[0];
  const hasCutout = floor.index > 0;
  const upSideOpen = !!stairOut;
  const downSideOpen = !!stairIn;
  const gateHalfArc = spiralGateHalfArc(reference.numSteps);
  const hasSpiralEnd = !upSideOpen && !!stairIn;
  const bridgeArcSweep = hasSpiralEnd ? gateHalfArc : 0;
  const upGap = upSideOpen ? gateHalfArc : bridgeArcSweep;
  const downGap = downSideOpen ? gateHalfArc : 0;
  const cx = reference.centerX;
  const cz = reference.centerZ;

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

function addTopLandingEdgeCollider(
  stair: Staircase,
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
  const angle = stair.entryAngle + stair.direction * Math.PI;
  const innerX = stair.centerX + stair.innerRadius * Math.cos(angle);
  const innerZ = stair.centerZ + stair.innerRadius * Math.sin(angle);
  const outerX = stair.centerX + stair.outerRadius * Math.cos(angle);
  const outerZ = stair.centerZ + stair.outerRadius * Math.sin(angle);
  addRunCollider(
    innerX,
    innerZ,
    outerX,
    outerZ,
    stair.upperY + RAIL_HEIGHT / 2,
    RAIL_HEIGHT,
    addCuboid,
  );
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
