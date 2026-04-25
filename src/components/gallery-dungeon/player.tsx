"use client";

import type { Artwork } from "@/lib/data";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { raycastNearestPainting } from "./painting-registry";
import { canCrossStairMidline, isInsideStair, stairHeightAt } from "./staircase";

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;
// Keep the player this far back from a wall face. Cell-size is 2.5 m;
// 0.3 m leaves headroom for the wall plane + trim geometry.
const PLAYER_RADIUS = 0.3;

/**
 * First-person player with grid-based collision. The active floor's
 * `walkable` mask is consulted every frame: a proposed move is accepted
 * if the new cell is walkable, otherwise the player slides along
 * whichever axis individually lands on a walkable cell.
 */
export function Player({
  enabled,
  floor,
  spawnAt,
  onRoomChange,
  onFloorChange,
  onPositionSample,
  onZoomRequest,
}: {
  enabled: boolean;
  floor: FloorLayout;
  spawnAt: [number, number, number];
  onRoomChange?: (roomIndex: number) => void;
  /** Called when the player's Y crosses the midpoint between the
   *  current floor and an adjacent floor (via stairs). The callback
   *  is fired with the new floor index; the host should update state
   *  so this component re-mounts with the new `floor` prop. */
  onFloorChange?: (newFloorIndex: number) => void;
  /** Fires each frame with the player's XZ and map-space yaw (radians;
   *  0 = facing +x on the minimap, grows clockwise as the player turns
   *  right). Used by the host to remember position across floor-swap
   *  remounts and to drive the minimap compass arrow. */
  onPositionSample?: (x: number, z: number, yaw: number) => void;
  /** Called with an Artwork when the player clicks/aims at a painting,
   *  so the host can open an inspect/zoom overlay. */
  onZoomRequest?: (artwork: Artwork) => void;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const lastRoomIdx = useRef<number>(-2);
  const raycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, 12));
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  /** Tracks which U-stair the player is currently riding so the
   *  collision check can let them roam freely on the flight they're on
   *  (otherwise the same XZ footprint as the descent stair would also
   *  match and the lookup would flicker between the two). Cleared when
   *  the player steps off the stair. */
  const currentStairRef = useRef<string | null>(null);

  useEffect(() => {
    camera.position.set(spawnAt[0], spawnAt[1] + EYE_HEIGHT, spawnAt[2]);
    // Face "into" the floor from the spawn point.
    camera.lookAt(spawnAt[0] + 5, spawnAt[1] + EYE_HEIGHT, spawnAt[2]);
  }, [camera, spawnAt]);

  useEffect(() => {
    const tryZoom = () => {
      if (!onZoomRequest) return;
      camera.getWorldPosition(rayOrigin.current);
      camera.getWorldDirection(rayDir.current);
      raycaster.current.set(rayOrigin.current, rayDir.current);
      // Painting-registry prefilter — bounds the raycast to the
      // ~handful of paintings in the player's forward cone instead of
      // traversing hundreds of wall/floor/step meshes on every click.
      const artwork = raycastNearestPainting(raycaster.current, rayOrigin.current, rayDir.current);
      if (artwork) onZoomRequest(artwork);
    };
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!enabled) return;
      if (e.code === "Space" && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        e.preventDefault();
      }
      if (e.code === "KeyE" || e.code === "KeyF") tryZoom();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const mouse = (e: MouseEvent) => {
      if (!enabled) return;
      // Only treat clicks as zoom requests while the pointer is already
      // locked. The first click after returning from the zoom modal is
      // PointerLockControls reacquiring the lock — without this guard
      // it would also raycast and immediately re-open the painting.
      if (!document.pointerLockElement) return;
      if (e.button === 0) tryZoom();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mouse);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mouse);
    };
  }, [enabled, camera, onZoomRequest]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running = keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) move.add(forward);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) move.sub(forward);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) move.add(right);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      const curX = camera.position.x;
      const curZ = camera.position.z;
      const nx = curX + move.x;
      const nz = curZ + move.z;

      // Collision model:
      //  - The U-stair footprint is always walkable (Y comes from
      //    stairHeightAt below); inside it, the central rib blocks
      //    midline crossings except over the landing.
      //  - Otherwise the grid mask + per-edge wall mask decides.
      const currentStairId = currentStairRef.current;
      if (canStepTo(floor, curX, curZ, nx, nz, currentStairId)) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (canStepTo(floor, curX, curZ, nx, curZ, currentStairId)) {
        camera.position.x = nx;
      } else if (canStepTo(floor, curX, curZ, curX, nz, currentStairId)) {
        camera.position.z = nz;
      }
    }

    // Vertical physics — on the U-stair, derive Y directly from XZ
    // (each flight is a smooth ramp; the landing is flat). Off the
    // stair, normal gravity + floor-plane clamp.
    const stair = findStairAt(floor, camera.position.x, camera.position.z);
    if (stair) {
      currentStairRef.current = stair.id;
      const stairY = stairHeightAt(stair, camera.position.x, camera.position.z);
      if (stairY != null) {
        const targetY = stairY + EYE_HEIGHT;
        camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 20, dt);
        velocityY.current = 0;
        grounded.current = true;

        // Floor swap when the player crosses the midway height. A small
        // hysteresis around midwayY keeps the swap from chattering when
        // the player loiters on the landing.
        const midwayY = (stair.lowerY + stair.upperY) / 2;
        const HYST = 0.4;
        if (onFloorChange) {
          if (floor.index === stair.lowerFloor && stairY > midwayY + HYST) {
            onFloorChange(stair.upperFloor);
          } else if (floor.index === stair.upperFloor && stairY < midwayY - HYST) {
            onFloorChange(stair.lowerFloor);
          }
        }
      }
    } else {
      currentStairRef.current = null;
      velocityY.current -= GRAVITY * dt;
      camera.position.y += velocityY.current * dt;
      const floorHeight = floor.y + EYE_HEIGHT;
      if (camera.position.y <= floorHeight) {
        camera.position.y = floorHeight;
        velocityY.current = 0;
        grounded.current = true;
      } else {
        grounded.current = false;
      }
    }

    if (onPositionSample) {
      // Map-space yaw: atan2(fz, fx) where (fx, fz) is the horizontal
      // forward vector. On the minimap +x is right, +z is down, so this
      // angle tells the arrow which way to point directly.
      const yaw = Math.atan2(forward.z, forward.x);
      onPositionSample(camera.position.x, camera.position.z, yaw);
    }

    // Active-room detection — emit a callback when the owner cell changes.
    if (onRoomChange) {
      const cx = Math.floor(camera.position.x / CELL_SIZE);
      const cz = Math.floor(camera.position.z / CELL_SIZE);
      if (cx >= 0 && cx < floor.gridSize.x && cz >= 0 && cz < floor.gridSize.z) {
        const owner = floor.cellOwner[cz * floor.gridSize.x + cx];
        if (owner !== lastRoomIdx.current) {
          lastRoomIdx.current = owner;
          onRoomChange(owner);
        }
      }
    }
  });

  return null;
}

/** Return the staircase the player is standing on, picking by the X
 *  half of the footprint when both stairsIn (descent) and stairsOut
 *  (ascent) overlap the same cells:
 *    - west half (dx ≤ 0) → ascent stair (this floor is the lower).
 *    - east half (dx > 0) → descent stair (this floor is the upper).
 *  In the landing strip the two flights merge — preference flips to
 *  whichever stair has the player's `currentFloor` matching its
 *  closer end so floor swaps don't bounce between the two stairs. */
function findStairAt(floor: FloorLayout, worldX: number, worldZ: number): Staircase | null {
  const candidates: Staircase[] = [];
  for (const s of floor.stairsOut) {
    if (isInsideStair(s, worldX, worldZ)) candidates.push(s);
  }
  for (const s of floor.stairsIn) {
    if (isInsideStair(s, worldX, worldZ)) candidates.push(s);
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  // Two stairs overlap (in + out at same XZ). Pick by which half of
  // the footprint we're on.
  for (const s of candidates) {
    const dx = worldX - s.centerX;
    if (dx <= 0 && s.lowerFloor === floor.index) return s;
    if (dx > 0 && s.upperFloor === floor.index) return s;
  }
  return candidates[0];
}

/** True if the grid cell at (worldX, worldZ) is walkable for a player of
 *  PLAYER_RADIUS — i.e. none of the four corners of the player's bbox
 *  lie in a non-walkable cell. Keeps the player's silhouette out of
 *  wall planes. */
function isWalkable(floor: FloorLayout, worldX: number, worldZ: number): boolean {
  const r = PLAYER_RADIUS;
  const corners: Array<[number, number]> = [
    [worldX - r, worldZ - r],
    [worldX + r, worldZ - r],
    [worldX - r, worldZ + r],
    [worldX + r, worldZ + r],
  ];
  for (const [x, z] of corners) {
    const cx = Math.floor(x / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    if (cx < 0 || cx >= floor.gridSize.x) return false;
    if (cz < 0 || cz >= floor.gridSize.z) return false;
    if (floor.walkable[cz * floor.gridSize.x + cx] !== 1) return false;
  }
  return true;
}

/** Top-level predicate used by movement: U-stair footprint passes
 *  always (Y comes from stairHeightAt; the central rib between flights
 *  is enforced via canCrossStairMidline so the player must use the
 *  landing to switch sides). Off the stair, the grid + per-edge wall
 *  masks decide. */
function canStepTo(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentStairId: string | null,
): boolean {
  const stair = findStairAt(floor, toX, toZ);
  if (stair) {
    if (currentStairId !== stair.id) {
      // First step onto a stair — gate it on the target Y matching the
      // player's current floor, so a player on the lower floor can't
      // wander onto the east flight (whose south end sits at upperY)
      // and snap a full storey upward.
      const targetY = stairHeightAt(stair, toX, toZ);
      if (targetY == null) return false;
      const ENTRY_TOL = 0.3;
      if (Math.abs(targetY - floor.y) > ENTRY_TOL) return false;
    }
    if (!canCrossStairMidline(stair, fromX, fromZ, toX, toZ)) return false;
    return true;
  }
  if (!isWalkable(floor, toX, toZ)) return false;
  if (!canCrossEdges(floor, fromX, fromZ, toX, toZ)) return false;
  return true;
}

/** Walk every cell-boundary edge the player's bbox sweeps through and
 *  reject if any of them is wall-blocked. Splits the move into single
 *  cell-boundary crossings so a fast diagonal step can't slip through
 *  a corner. */
function canCrossEdges(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): boolean {
  const r = PLAYER_RADIUS;
  // Check both leading edges of the player's bbox along each axis: a
  // step from (fromX, fromZ) to (toX, toZ) crosses an EW edge iff
  // some corner's cell-x changes; same for NS.
  const fromCellsX = [
    Math.floor((fromX - r) / CELL_SIZE),
    Math.floor((fromX + r) / CELL_SIZE),
  ];
  const toCellsX = [
    Math.floor((toX - r) / CELL_SIZE),
    Math.floor((toX + r) / CELL_SIZE),
  ];
  const fromCellsZ = [
    Math.floor((fromZ - r) / CELL_SIZE),
    Math.floor((fromZ + r) / CELL_SIZE),
  ];
  const toCellsZ = [
    Math.floor((toZ - r) / CELL_SIZE),
    Math.floor((toZ + r) / CELL_SIZE),
  ];

  // EW edge crossings — for each (front, back) corner pair, if the
  // x-cell changes, the player crosses an EW edge between min and max.
  for (let i = 0; i < 2; i++) {
    const fcx = fromCellsX[i];
    const tcx = toCellsX[i];
    if (fcx === tcx) continue;
    // Z-cells the player straddles after the move (use its bbox).
    for (const cz of [toCellsZ[0], toCellsZ[1]]) {
      if (cz < 0 || cz >= floor.gridSize.z) continue;
      const lo = Math.min(fcx, tcx);
      const hi = Math.max(fcx, tcx);
      for (let xx = lo; xx < hi; xx++) {
        if (xx < 0 || xx >= floor.gridSize.x - 1) continue;
        if (floor.blockedEdgesEW[cz * (floor.gridSize.x - 1) + xx]) return false;
      }
    }
  }
  // NS edge crossings.
  for (let i = 0; i < 2; i++) {
    const fcz = fromCellsZ[i];
    const tcz = toCellsZ[i];
    if (fcz === tcz) continue;
    for (const cx of [toCellsX[0], toCellsX[1]]) {
      if (cx < 0 || cx >= floor.gridSize.x) continue;
      const lo = Math.min(fcz, tcz);
      const hi = Math.max(fcz, tcz);
      for (let zz = lo; zz < hi; zz++) {
        if (zz < 0 || zz >= floor.gridSize.z - 1) continue;
        if (floor.blockedEdgesNS[zz * floor.gridSize.x + cx]) return false;
      }
    }
  }
  return true;
}
