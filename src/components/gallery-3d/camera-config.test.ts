import { describe, expect, it } from "vitest";
import {
  baseFovDeg,
  FOV_DEFAULT_DEG,
  FOV_ZOOMED_DEG,
  fovZoomScaleSq,
  ladderHeightPx,
  MIN_HORIZONTAL_FOV_DEG,
  ZOOM_PIXEL_HEADROOM,
  zoomedFovDeg,
} from "./camera-config";

// These numbers are the contract between three files that never
// import each other's internals: the scene sets the camera (index.tsx),
// the player animates it (player.tsx), and the LOD derives a texture
// ladder against it (painting.tsx) while the LodController converts a
// live FOV into a distance the ladder understands (lod-controller.tsx).

const LANDSCAPE = 16 / 9;
const UPRIGHT_PHONE = 390 / 844;

function horizontalFov(vfovDeg: number, aspect: number): number {
  const half = Math.PI / 360;
  return Math.atan(Math.tan(vfovDeg * half) * aspect) / half;
}

describe("base FOV", () => {
  it("is the default on a landscape canvas", () => {
    expect(baseFovDeg(LANDSCAPE)).toBeCloseTo(FOV_DEFAULT_DEG, 12);
    expect(zoomedFovDeg(LANDSCAPE)).toBeCloseTo(FOV_ZOOMED_DEG, 12);
  });

  it("widens on an upright phone instead of seeing a slot", () => {
    expect(horizontalFov(baseFovDeg(UPRIGHT_PHONE), UPRIGHT_PHONE)).toBeCloseTo(
      MIN_HORIZONTAL_FOV_DEG,
      9,
    );
    // About the 75° the phone had before the default narrowed.
    expect(baseFovDeg(UPRIGHT_PHONE)).toBeGreaterThan(74);
    expect(baseFovDeg(UPRIGHT_PHONE)).toBeLessThan(78);
  });

  it("hands the ladder the real height on landscape and less upright", () => {
    expect(ladderHeightPx(1800, LANDSCAPE)).toBeCloseTo(1800, 9);
    expect(ladderHeightPx(1688, UPRIGHT_PHONE)).toBeLessThan(1688);
  });
});

describe("fovZoomScaleSq", () => {
  it("is a no-op at the base FOV, on any aspect", () => {
    // The whole scheme rests on this: the ladder is derived at the base
    // FOV, so an unzoomed camera must compare distances against those
    // bands untouched.
    for (const aspect of [LANDSCAPE, 1, UPRIGHT_PHONE]) {
      expect(fovZoomScaleSq(baseFovDeg(aspect), aspect)).toBeCloseTo(1, 12);
    }
  });

  it("turns the F-key zoom into 2.1034x the pixel demand, on any aspect", () => {
    // tan(25 deg) / tan(12.5 deg). Narrowing the FOV is optically
    // identical to walking to 48% of the current distance.
    for (const aspect of [LANDSCAPE, 1, UPRIGHT_PHONE]) {
      expect(Math.sqrt(fovZoomScaleSq(zoomedFovDeg(aspect), aspect))).toBeCloseTo(1 / 2.1034, 4);
    }
    expect(ZOOM_PIXEL_HEADROOM).toBeCloseTo(2.1034, 4);
  });

  it("agrees with ZOOM_PIXEL_HEADROOM, which gates the ladder", () => {
    // deriveTiers drops a painting's whole ladder when the base texture
    // already out-resolves `wantPx * ZOOM_PIXEL_HEADROOM`. If these two
    // drifted, that guard would either strand a rung the zoom can reach
    // or keep one it never can.
    expect(ZOOM_PIXEL_HEADROOM).toBeCloseTo(
      1 / Math.sqrt(fovZoomScaleSq(FOV_ZOOMED_DEG, LANDSCAPE)),
      12,
    );
  });

  it("is monotone in FOV, so a damped transition never inverts a band", () => {
    // player.tsx damps through every intermediate FOV, and the picker
    // must climb the ladder smoothly across that sweep rather than
    // jumping around.
    let prev = Number.POSITIVE_INFINITY;
    for (let fov = FOV_DEFAULT_DEG; fov >= FOV_ZOOMED_DEG; fov -= 1) {
      const cur = fovZoomScaleSq(fov, LANDSCAPE);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });
});
