"use client";

import type { Artwork } from "@/lib/data";
import type { FloorLayout, Staircase } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { raycastNearestPainting } from "./painting-registry";
import {
  findStairAbove,
  findStairBelow,
  isInsideStair,
  spiralRawAngle,
  stairHeightAt,
} from "./staircase";

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 5;
const RUN_SPEED = 10;
const JUMP_IMPULSE = 6;
const GRAVITY = 22;
// Keep the player this far back from a wall face. Cell-size is 2.5 m;
// 0.3 m leaves headroom for the wall plane + trim geometry.
const PLAYER_RADIUS = 0.3;
// Max distance (m) at which the crosshair swaps to the magnifying-glass
// "inspect" affordance. Click-to-zoom still works at any range; this is
// purely the visual hover threshold so the cursor only changes when the
// player is right up against the painting they're looking at.
const AIM_MAX_DIST = 2;

/**
 * First-person player with grid-based collision. The active floor's
 * `walkable` mask is consulted every frame: a proposed move is accepted
 * if the new cell is walkable, otherwise the player slides along
 * whichever axis individually lands on a walkable cell.
 */
export function Player({
  enabled,
  floor,
  allStaircases,
  spawnAt,
  onRoomChange,
  onFloorChange,
  onPositionSample,
  onZoomRequest,
  onAimChange,
}: {
  enabled: boolean;
  floor: FloorLayout;
  /** Every staircase in the building. Needed so the spiral physics can
   *  transition the player from one storey's flight to the next when
   *  their cumulative angle crosses a revolution boundary. */
  allStaircases: readonly Staircase[];
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
  /** Fires when the painting under the crosshair changes (or null when
   *  none is in range). Throttled to ~10 Hz inside this component;
   *  consumers can use it to swap the crosshair to a magnifying-glass
   *  affordance and show a "Press E to inspect" hint. */
  onAimChange?: (artwork: Artwork | null) => void;
}) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const lastRoomIdx = useRef<number>(-2);
  // Click and aim raycasters share the same INSPECT_RANGE so the
  // crosshair affordance and the click-to-zoom action agree: if the
  // magnifying-glass cursor isn't showing, the click won't open
  // anything either. Two separate Raycaster instances avoid having
  // tryZoom re-set the throttled aim raycaster mid-frame.
  const raycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, AIM_MAX_DIST));
  const aimRaycaster = useRef(new THREE.Raycaster(undefined, undefined, 0.1, AIM_MAX_DIST));
  const rayOrigin = useRef(new THREE.Vector3());
  const rayDir = useRef(new THREE.Vector3());
  const aimFrameCount = useRef(0);
  const aimLast = useRef<Artwork | null>(null);
  /** Cumulative-angle state for the spiral. `cumulativeAngle ∈ [0, 2π]`
   *  describes how far around the current stair's revolution the
   *  player has walked; `lastRaw` is the previous frame's raw angle so
   *  per-frame deltas can be integrated even across the 2π wraparound.
   *  When cumulative crosses 2π or 0 we transition to the next/prev
   *  stair so the player can ride a continuous spiral across all
   *  storeys. Cleared when the player leaves the spiral annulus. */
  const spiralState = useRef<{
    staircaseId: string;
    cumulativeAngle: number;
    lastRaw: number;
  } | null>(null);

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
      const artwork = raycastNearestPainting(
        raycaster.current,
        rayOrigin.current,
        rayDir.current,
        AIM_MAX_DIST,
      );
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
    const running = keys.current.ShiftLeft || keys.current.ShiftRight || false;
    const speed = running ? RUN_SPEED : WALK_SPEED;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() > 0) right.normalize();

    const move = new THREE.Vector3();
    if (keys.current.KeyW || keys.current.ArrowUp) move.add(forward);
    if (keys.current.KeyS || keys.current.ArrowDown) move.sub(forward);
    if (keys.current.KeyD || keys.current.ArrowRight) move.add(right);
    if (keys.current.KeyA || keys.current.ArrowLeft) move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      const curX = camera.position.x;
      const curZ = camera.position.z;
      const nx = curX + move.x;
      const nz = curZ + move.z;

      // Collision model:
      //  - The spiral annulus passes always when entering, so the
      //    player can step onto the on-ramp from any direction.
      //  - LEAVING the spiral is gated on cumulative ≈ 0 / 2π — the
      //    player has to be at a real floor's height to step off,
      //    otherwise canStepTo refuses (no more "beam up/down" when
      //    they wander out mid-flight).
      //  - Otherwise the grid mask + per-edge wall mask decides.
      const currentStairId = spiralState.current?.staircaseId ?? null;
      const currentCum = spiralState.current?.cumulativeAngle ?? 0;
      if (canStepTo(floor, curX, curZ, nx, nz, currentStairId, currentCum)) {
        camera.position.x = nx;
        camera.position.z = nz;
      } else if (canStepTo(floor, curX, curZ, nx, curZ, currentStairId, currentCum)) {
        camera.position.x = nx;
      } else if (canStepTo(floor, curX, curZ, curX, nz, currentStairId, currentCum)) {
        camera.position.z = nz;
      }
    }

    // Vertical physics — on the spiral, derive Y from cumulative angle
    // (continuous across flight boundaries so the player walks one
    // long spiral from floor 0 to the top without per-storey jumps).
    // Off the spiral, normal gravity + floor-plane clamp.
    let activeStair = findStairAt(floor, camera.position.x, camera.position.z);
    // Prefer the stair the player is already tracked on, even when
    // both stairsIn and stairsOut overlap the same annulus on this
    // floor — the existing state's stair is the one we want.
    if (spiralState.current) {
      const tracked = allStaircases.find((s) => s.id === spiralState.current!.staircaseId);
      if (tracked && isInsideStair(tracked, camera.position.x, camera.position.z)) {
        activeStair = tracked;
      }
    }

    if (activeStair) {
      const raw = spiralRawAngle(activeStair, camera.position.x, camera.position.z);
      let st = spiralState.current;
      if (!st || st.staircaseId !== activeStair.id) {
        // Stepping onto the spiral fresh. If we're entering at the
        // floor that is this stair's lowerFloor, start at cumulative=0
        // (bottom). If we're entering at upperFloor, start at 2π (top).
        const initial = floor.index === activeStair.upperFloor ? Math.PI * 2 : 0;
        st = { staircaseId: activeStair.id, cumulativeAngle: initial, lastRaw: raw };
        spiralState.current = st;
      } else {
        let d = raw - st.lastRaw;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        st.cumulativeAngle += d;
        st.lastRaw = raw;
      }

      // Stair-to-stair transitions. Walking past the top of this
      // revolution rolls cumulative back to 0 on the next stair up
      // and fires onFloorChange(upperFloor); walking past the bottom
      // rolls it forward to 2π on the stair below and fires
      // onFloorChange(lowerFloor). When there's no next/prev stair
      // (top of building or ground floor) we clamp AND emit a
      // matching floor change so the player's `floor` prop is always
      // the one whose Y matches their feet by the time they exit.
      while (st.cumulativeAngle >= Math.PI * 2) {
        const next = findStairAbove(activeStair, allStaircases);
        if (!next) {
          st.cumulativeAngle = Math.PI * 2;
          if (onFloorChange && floor.index !== activeStair.upperFloor) {
            onFloorChange(activeStair.upperFloor);
          }
          break;
        }
        st.staircaseId = next.id;
        st.cumulativeAngle -= Math.PI * 2;
        activeStair = next;
        if (onFloorChange && floor.index !== next.lowerFloor) {
          onFloorChange(next.lowerFloor);
        }
      }
      while (st.cumulativeAngle <= 0) {
        if (st.cumulativeAngle === 0) {
          if (onFloorChange && floor.index !== activeStair.lowerFloor) {
            onFloorChange(activeStair.lowerFloor);
          }
          break;
        }
        const prev = findStairBelow(activeStair, allStaircases);
        if (!prev) {
          st.cumulativeAngle = 0;
          if (onFloorChange && floor.index !== activeStair.lowerFloor) {
            onFloorChange(activeStair.lowerFloor);
          }
          break;
        }
        st.staircaseId = prev.id;
        st.cumulativeAngle += Math.PI * 2;
        activeStair = prev;
        if (onFloorChange && floor.index !== prev.upperFloor) {
          onFloorChange(prev.upperFloor);
        }
      }

      const targetY = stairHeightAt(activeStair, st.cumulativeAngle) + EYE_HEIGHT;
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 20, dt);
      velocityY.current = 0;
      grounded.current = true;
    } else {
      spiralState.current = null;
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

    // Throttled aim raycast for the inspect-cursor affordance. ~10 Hz
    // (every 6 frames at 60 fps) is indistinguishable from real-time and
    // keeps the per-frame work tiny — painting-registry already
    // distance/forward-dot prefilters, so the actual ray test runs
    // against the handful of paintings plausibly in the player's path.
    if (onAimChange) {
      aimFrameCount.current = (aimFrameCount.current + 1) % 6;
      if (aimFrameCount.current === 0) {
        camera.getWorldPosition(rayOrigin.current);
        camera.getWorldDirection(rayDir.current);
        aimRaycaster.current.set(rayOrigin.current, rayDir.current);
        const aimed = raycastNearestPainting(
          aimRaycaster.current,
          rayOrigin.current,
          rayDir.current,
          AIM_MAX_DIST,
        );
        if (aimed !== aimLast.current) {
          aimLast.current = aimed;
          onAimChange(aimed);
        }
      }
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

/** Return any staircase whose annulus contains (worldX, worldZ).
 *  When both stairsIn (descent) and stairsOut (ascent) overlap the
 *  same annulus, prefer the one whose upper/lower end matches this
 *  floor — i.e. on floor i pick stair S_i (ascending) by default; the
 *  spiral physics will transition to S_{i-1} via the stair-to-stair
 *  rollover when the player walks descending past cumulative=0. */
function findStairAt(floor: FloorLayout, worldX: number, worldZ: number): Staircase | null {
  for (const s of floor.stairsOut) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  for (const s of floor.stairsIn) {
    if (isInsideStair(s, worldX, worldZ)) return s;
  }
  return null;
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

/** Top-level predicate used by movement.
 *
 *  - Stepping ONTO the spiral always passes — the cumulative-angle
 *    init in useFrame snaps the player's Y to the right floor.
 *  - Stepping OFF the spiral (target outside the annulus while
 *    `currentStairId` is set) only passes if the player is at a real
 *    floor's height — i.e. cumulative is near 0 (lower floor) or near
 *    2π (upper floor). Mid-flight exit is blocked, which is what
 *    kills the old "beam up/down to the wrong floor" bug when the
 *    player wandered off mid-spiral.
 *  - Off the spiral, the grid mask + per-edge wall mask decide. */
function canStepTo(
  floor: FloorLayout,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  currentStairId: string | null,
  currentCum: number,
): boolean {
  const stair = findStairAt(floor, toX, toZ);
  if (stair) return true;
  if (currentStairId !== null) {
    // Trying to leave the spiral. Allow only when the player's
    // cumulative is in a "landing" arc near 0 or 2π — the heights
    // where stepping off lands them flush with a real floor.
    const EXIT_TOL = 0.5; // ~28°
    const onLowerLanding = currentCum <= EXIT_TOL;
    const onUpperLanding = currentCum >= Math.PI * 2 - EXIT_TOL;
    if (!onLowerLanding && !onUpperLanding) return false;
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
  const fromCellsX = [Math.floor((fromX - r) / CELL_SIZE), Math.floor((fromX + r) / CELL_SIZE)];
  const toCellsX = [Math.floor((toX - r) / CELL_SIZE), Math.floor((toX + r) / CELL_SIZE)];
  const fromCellsZ = [Math.floor((fromZ - r) / CELL_SIZE), Math.floor((fromZ + r) / CELL_SIZE)];
  const toCellsZ = [Math.floor((toZ - r) / CELL_SIZE), Math.floor((toZ + r) / CELL_SIZE)];

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
