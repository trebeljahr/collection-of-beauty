import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MuseumLayout } from "./gallery-layout/types";
import {
  GALLERY_RELEASE_KEY,
  type GalleryReleaseState,
  galleryLayoutIdentity,
  isGalleryReleaseState,
  restoreGalleryVisit,
} from "./gallery-release-state";
import { rememberReleaseState } from "./release-session";

const layout = {
  floors: [0, 1].map((index) => ({
    era: { id: `era-${index}` },
    y: index * 6.12,
    gridSize: { x: 4, z: 4 },
    walkable: new Uint8Array(16).fill(1),
    stairsIn: [],
    stairsOut: [],
    rooms: [
      {
        id: `room-${index}`,
        isAnchor: true,
        worldRect: { xMin: 0, xMax: 10, zMin: 0, zMax: 10, y: index * 6.12 },
      },
    ],
  })),
} as unknown as MuseumLayout;
const identity = galleryLayoutIdentity(layout);
const saved: GalleryReleaseState = {
  layout: identity,
  floorEra: "era-1",
  viewedFloorEra: "era-0",
  pose: { position: [3, 7.87, 4], quaternion: [0, 0, 0, 1] },
  artworkId: "fixture-art",
  started: true,
  mapOpen: true,
  settingsOpen: false,
};
describe("gallery release recovery", () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("restores a non-entry floor, exact camera pose and selected work", () => {
    rememberReleaseState(GALLERY_RELEASE_KEY, saved);
    const restored = restoreGalleryVisit(layout, identity)!;
    expect(restored.floorIndex).toBe(1);
    expect(restored.pose).toEqual(saved.pose);
    expect(restored.saved.artworkId).toBe("fixture-art");
    expect(restored.spawn).toEqual([3, 6.12, 4]);
  });
  it("keeps the era and work but uses a safe room anchor after geometry changes", () => {
    rememberReleaseState(GALLERY_RELEASE_KEY, { ...saved, layout: "old-geometry" });
    const restored = restoreGalleryVisit(layout, identity)!;
    expect(restored.pose).toBeNull();
    expect(restored.spawn).toEqual([5, 6.12, 5]);
    expect(restored.saved.artworkId).toBe(saved.artworkId);
  });
  it("refuses malformed poses and falls back from coordinates outside the walkable floor", () => {
    expect(isGalleryReleaseState({ ...saved, pose: undefined })).toBe(false);
    expect(
      isGalleryReleaseState({ ...saved, pose: { position: [1, 2, 3], quaternion: [0, 0, 0, 0] } }),
    ).toBe(false);
    rememberReleaseState(GALLERY_RELEASE_KEY, {
      ...saved,
      pose: { ...saved.pose, position: [900, 7.87, 4] },
    });
    expect(restoreGalleryVisit(layout, identity)!.pose).toBeNull();
    rememberReleaseState(GALLERY_RELEASE_KEY, { ...saved, floorEra: "deleted-era" });
    expect(restoreGalleryVisit(layout, identity)).toBeNull();
  });
});
