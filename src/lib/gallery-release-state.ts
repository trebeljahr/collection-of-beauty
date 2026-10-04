import type { MuseumLayout } from "./gallery-layout/types";
import { FLOOR_SEPARATION, worldToCell } from "./gallery-layout/world-coords";
import { readReleaseState } from "./release-session";

export const GALLERY_RELEASE_KEY = "gallery-visit";
export type GalleryPose = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};
export type GalleryReleaseState = {
  layout: string;
  floorEra: string;
  pose: GalleryPose | null;
  artworkId: string | null;
  started: boolean;
  mapOpen: boolean;
  settingsOpen: boolean;
  viewedFloorEra: string;
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100_000;
export function isGalleryReleaseState(value: unknown): value is GalleryReleaseState {
  if (!value || typeof value !== "object") return false;
  const v = value as GalleryReleaseState;
  return (
    typeof v.layout === "string" &&
    v.layout.length < 100 &&
    typeof v.floorEra === "string" &&
    typeof v.viewedFloorEra === "string" &&
    (v.artworkId === null || (typeof v.artworkId === "string" && v.artworkId.length < 300)) &&
    typeof v.started === "boolean" &&
    typeof v.mapOpen === "boolean" &&
    typeof v.settingsOpen === "boolean" &&
    (v.pose === null ||
      (!!v.pose &&
        typeof v.pose === "object" &&
        Array.isArray(v.pose.position) &&
        v.pose.position.length === 3 &&
        v.pose.position.every(finite) &&
        Array.isArray(v.pose.quaternion) &&
        v.pose.quaternion.length === 4 &&
        v.pose.quaternion.every(finite) &&
        Math.abs(v.pose.quaternion.reduce((n, x) => n + x * x, 0) - 1) < 0.01))
  );
}

/** Geometry identity only: changes to code or artwork descriptions keep a visit's position. */
export function galleryLayoutIdentity(layout: MuseumLayout): string {
  const geometry = JSON.stringify(
    layout.floors.map((floor) => [
      floor.era.id,
      floor.y,
      floor.gridSize,
      floor.rooms.map((room) => [room.id, room.worldRect]),
      floor.stairsIn,
      floor.stairsOut,
    ]),
  );
  let hash = 2166136261;
  for (let i = 0; i < geometry.length; i++)
    hash = Math.imul(hash ^ geometry.charCodeAt(i), 16777619);
  return `geometry-v1-${(hash >>> 0).toString(16)}-${geometry.length}`;
}

export function restoreGalleryVisit(layout: MuseumLayout, identity: string) {
  const saved = readReleaseState(GALLERY_RELEASE_KEY, isGalleryReleaseState);
  if (!saved) return null;
  const floorIndex = layout.floors.findIndex((floor) => floor.era.id === saved.floorEra);
  if (floorIndex < 0) return null;
  const floor = layout.floors[floorIndex];
  // A changed floor plan cannot safely reuse world coordinates. Keep the era
  // and selected artwork, but resume at that floor's safe room centre.
  const room = floor.rooms.find((value) => value.isAnchor) ?? floor.rooms[0];
  if (!room) return null;
  const sameLayout = saved.layout === identity;
  const cell = saved.pose && worldToCell(saved.pose.position[0], saved.pose.position[2]);
  const validPosition =
    saved.pose &&
    cell &&
    cell.x >= 0 &&
    cell.z >= 0 &&
    cell.x < floor.gridSize.x &&
    cell.z < floor.gridSize.z &&
    floor.walkable[cell.z * floor.gridSize.x + cell.x] === 1 &&
    saved.pose.position[1] >= floor.y - FLOOR_SEPARATION &&
    saved.pose.position[1] <= floor.y + FLOOR_SEPARATION + 2.2;
  const pose = sameLayout && validPosition ? saved.pose : null;
  const spawn: [number, number, number] = pose
    ? [pose.position[0], pose.position[1] - 1.75, pose.position[2]]
    : [
        (room.worldRect.xMin + room.worldRect.xMax) / 2,
        room.worldRect.y,
        (room.worldRect.zMin + room.worldRect.zMax) / 2,
      ];
  return { saved, floorIndex, pose, spawn, layoutChanged: !sameLayout };
}
