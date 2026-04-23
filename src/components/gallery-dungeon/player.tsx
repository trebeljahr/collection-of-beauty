"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import {
  CELL_SIZE,
  FLOOR_SEPARATION,
} from "@/lib/gallery-layout/world-coords";
import { isInsideStair, stairHeightAt } from "./staircase";

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
  /** Fires each frame with the player's XZ — used by the host to
   *  remember the position across mount/unmount cycles triggered by
   *  floor swaps. */
  onPositionSample?: (x: number, z: number) => void;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const lastRoomIdx = useRef<number>(-2);

  useEffect(() => {
    camera.position.set(spawnAt[0], spawnAt[1] + EYE_HEIGHT, spawnAt[2]);
    // Face "into" the floor from the spawn point.
    camera.lookAt(spawnAt[0] + 5, spawnAt[1] + EYE_HEIGHT, spawnAt[2]);
  }, [camera, spawnAt]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (!enabled) return;
      if (e.code === "Space" && grounded.current) {
        velocityY.current = JUMP_IMPULSE;
        grounded.current = false;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [enabled]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 0.1);
    const running =
      keys.current["ShiftLeft"] || keys.current["ShiftRight"] || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0),
    );
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

      // Check if either the current or the proposed position is on a
      // staircase. Stairs override normal grid collision so the player
      // can walk up them out of the stairwell's cell-based walkable
      // footprint.
      const onStair = findStairAt(floor, nx, nz);
      if (onStair) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (isWalkable(floor, nx, nz)) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (isWalkable(floor, nx, curZ)) {
        camera.position.x = nx;
      } else if (isWalkable(floor, curX, nz)) {
        camera.position.z = nz;
      }
    }

    // Vertical physics — two cases.
    const stair = findStairAt(floor, camera.position.x, camera.position.z);
    if (stair) {
      // On a stair: Y is determined by horizontal progress along the
      // flight. Smoothly lerp rather than snap to avoid a jarring jump
      // when entering/leaving the stair footprint.
      const targetY =
        stairHeightAt(stair, camera.position.x, camera.position.z)! +
        EYE_HEIGHT;
      camera.position.y = THREE.MathUtils.damp(
        camera.position.y,
        targetY,
        20,
        dt,
      );
      velocityY.current = 0;
      grounded.current = true;

      // Floor swap when Y crosses the halfway point.
      const midY = floor.y + FLOOR_SEPARATION / 2 + EYE_HEIGHT;
      if (onFloorChange) {
        if (
          camera.position.y > midY &&
          floor.index < stair.upperFloor
        ) {
          onFloorChange(stair.upperFloor);
        } else if (
          camera.position.y < floor.y - FLOOR_SEPARATION / 2 + EYE_HEIGHT &&
          floor.index > stair.lowerFloor
        ) {
          onFloorChange(stair.lowerFloor);
        }
      }
    } else {
      // Not on stairs — normal gravity + jump + floor-plane clamp.
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
      onPositionSample(camera.position.x, camera.position.z);
    }

    // Active-room detection — emit a callback when the owner cell changes.
    if (onRoomChange) {
      const cx = Math.floor(camera.position.x / CELL_SIZE);
      const cz = Math.floor(camera.position.z / CELL_SIZE);
      if (
        cx >= 0 &&
        cx < floor.gridSize.x &&
        cz >= 0 &&
        cz < floor.gridSize.z
      ) {
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

/** Return the first staircase connected to this floor that contains
 *  the given world XZ position, or null if none. "Connected" means
 *  stairsIn[*] (going from below up to this floor) or stairsOut[*]
 *  (going from this floor up to the next) — both sets' footprints sit
 *  partly inside the stairwell room of this floor. */
function findStairAt(
  floor: FloorLayout,
  worldX: number,
  worldZ: number,
): Staircase | null {
  for (const s of floor.stairsOut) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  for (const s of floor.stairsIn) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  return null;
}

/** True if the cell at (worldX, worldZ) is walkable for a player of
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
