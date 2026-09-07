import { describe, expect, it } from "vitest";
import {
  FOV_DEFAULT_DEG,
  FOV_ZOOMED_DEG,
  fovZoomScaleSq,
  ZOOM_PIXEL_HEADROOM,
} from "./camera-config";

// These four numbers are the contract between three files that never
// import each other's internals: the scene sets the camera (index.tsx),
// the player animates it (player.tsx), and the LOD derives a texture
// ladder against it (painting.tsx) while the LodController converts a
// live FOV into a distance the ladder understands (lod-controller.tsx).
describe("fovZoomScaleSq", () => {
  it("is a no-op at the default FOV", () => {
    // The whole scheme rests on this: the ladder is derived at
    // FOV_DEFAULT_DEG, so an unzoomed camera must compare distances
    // against those bands untouched.
    expect(fovZoomScaleSq(FOV_DEFAULT_DEG)).toBeCloseTo(1, 12);
  });

  it("turns the F-key zoom into 2.4337x the pixel demand", () => {
    // tan(37.5 deg) / tan(17.5 deg). Narrowing the FOV is optically
    // identical to walking to 41% of the current distance.
    expect(Math.sqrt(fovZoomScaleSq(FOV_ZOOMED_DEG))).toBeCloseTo(1 / 2.4337, 4);
    expect(ZOOM_PIXEL_HEADROOM).toBeCloseTo(2.4337, 4);
  });

  it("agrees with ZOOM_PIXEL_HEADROOM, which gates the ladder", () => {
    // deriveTiers drops a painting's whole ladder when the base texture
    // already out-resolves `wantPx * ZOOM_PIXEL_HEADROOM`. If these two
    // drifted, that guard would either strand a rung the zoom can reach
    // or keep one it never can.
    expect(ZOOM_PIXEL_HEADROOM).toBeCloseTo(1 / Math.sqrt(fovZoomScaleSq(FOV_ZOOMED_DEG)), 12);
  });

  it("is monotone in FOV, so a damped transition never inverts a band", () => {
    // player.tsx damps through every intermediate FOV, and the picker
    // must climb the ladder smoothly across that sweep rather than
    // jumping around.
    let prev = Number.POSITIVE_INFINITY;
    for (let fov = FOV_DEFAULT_DEG; fov >= FOV_ZOOMED_DEG; fov -= 1) {
      const cur = fovZoomScaleSq(fov);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });
});
