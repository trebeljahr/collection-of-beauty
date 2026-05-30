import type { Door, FloorLayout } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";

type DoorFrame = {
  planeAxis: "x" | "z";
  plane: number;
  openingAxis: "x" | "z";
  openingCenter: number;
  openingHalfWidth: number;
};

type DoorwayNudge = {
  x: number;
  z: number;
};

const MIN_OPENING_HALF_WIDTH = 0.05;

function doorFrame(door: Door): DoorFrame {
  if (door.side === "east" || door.side === "west") {
    return {
      planeAxis: "x",
      plane: door.worldX,
      openingAxis: "z",
      openingCenter: door.worldZ,
      openingHalfWidth: door.width / 2,
    };
  }
  return {
    planeAxis: "z",
    plane: door.worldZ,
    openingAxis: "x",
    openingCenter: door.worldX,
    openingHalfWidth: door.width / 2,
  };
}

function coord(axis: "x" | "z", x: number, z: number): number {
  return axis === "x" ? x : z;
}

function withCoord(axis: "x" | "z", x: number, z: number, value: number): DoorwayNudge {
  return axis === "x" ? { x: value, z } : { x, z: value };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Cell edge collision is grid-coarse: a visual 1.4 m doorway opens one
 * full 2.5 m cell edge. This pass restores the real doorway aperture
 * near the wall plane, so the player capsule cannot occupy the solid
 * jamb on either side of the cut-out.
 */
export function fitsDoorwayApertures(
  floor: Pick<FloorLayout, "rooms">,
  x: number,
  z: number,
  bodyRadius: number,
): boolean {
  for (const room of floor.rooms) {
    for (const door of room.doors) {
      const frame = doorFrame(door);
      const planeDist = coord(frame.planeAxis, x, z) - frame.plane;
      if (Math.abs(planeDist) >= bodyRadius) continue;

      const axisDelta = coord(frame.openingAxis, x, z) - frame.openingCenter;
      if (Math.abs(axisDelta) > CELL_SIZE / 2 + bodyRadius) continue;

      const sideClearance = Math.min(
        bodyRadius,
        Math.max(MIN_OPENING_HALF_WIDTH, frame.openingHalfWidth - MIN_OPENING_HALF_WIDTH),
      );
      const allowedAxisDelta = frame.openingHalfWidth - sideClearance;
      if (Math.abs(axisDelta) > allowedAxisDelta) return false;
    }
  }
  return true;
}

/**
 * While entering a doorway close to a jamb, add a small lateral
 * correction toward the opening's center. If the correction still
 * doesn't fit, Player can use the same result as a side-only slide.
 */
export function nudgeTowardDoorwayCenter(
  floor: Pick<FloorLayout, "rooms">,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  bodyRadius: number,
  comfortClearance: number,
  maxCorrection: number,
): DoorwayNudge | null {
  let best: { frame: DoorFrame; correction: number; planeDist: number } | null = null;

  for (const room of floor.rooms) {
    for (const door of room.doors) {
      const frame = doorFrame(door);
      const fromPlane = coord(frame.planeAxis, fromX, fromZ) - frame.plane;
      const toPlane = coord(frame.planeAxis, toX, toZ) - frame.plane;
      const nearPlane = Math.min(Math.abs(fromPlane), Math.abs(toPlane)) <= bodyRadius + 0.2;
      const movingIntoPlane =
        Math.sign(fromPlane) !== Math.sign(toPlane) || Math.abs(toPlane) < Math.abs(fromPlane);
      if (!nearPlane || !movingIntoPlane) continue;

      const axis = coord(frame.openingAxis, toX, toZ);
      const axisDelta = axis - frame.openingCenter;
      const nudgeReach = Math.max(bodyRadius, maxCorrection);
      if (Math.abs(axisDelta) > frame.openingHalfWidth + nudgeReach) continue;

      const clearance = Math.min(
        comfortClearance,
        Math.max(MIN_OPENING_HALF_WIDTH, frame.openingHalfWidth - MIN_OPENING_HALF_WIDTH),
      );
      const comfortableDelta = Math.max(MIN_OPENING_HALF_WIDTH, frame.openingHalfWidth - clearance);
      if (Math.abs(axisDelta) <= comfortableDelta) continue;

      const targetAxis =
        frame.openingCenter + clamp(axisDelta, -comfortableDelta, comfortableDelta);
      const needed = targetAxis - axis;
      const correction = clamp(needed, -maxCorrection, maxCorrection);
      if (Math.abs(correction) < 1e-6) continue;

      const planeDist = Math.abs(toPlane);
      if (!best || planeDist < best.planeDist) {
        best = { frame, correction, planeDist };
      }
    }
  }

  if (!best) return null;
  const axis = coord(best.frame.openingAxis, toX, toZ);
  return withCoord(best.frame.openingAxis, toX, toZ, axis + best.correction);
}
