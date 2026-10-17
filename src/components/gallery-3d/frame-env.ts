// Reflection map for frames and fixtures. The room's own environment
// (room-env-map.tsx) is a smooth gradient: right for lighting plaster,
// but a gilt moulding that reflects only a gradient reads as flat
// yellow paint. A real gilt frame glints because it mirrors the ceiling
// lights. This map is the same room gradient plus a ring of small,
// very bright warm spots high up, standing in for the track heads, so
// every bead and roll of a moulding catches a highlight as the viewer
// moves. Float data, so the spots can be far brighter than white.

import * as THREE from "three";

const W = 256;
const H = 128;
/** Spots around the horizon, their elevation, angular radius and radiance. */
const LAMP_COUNT = 10;
const LAMP_ELEVATION_DEG = 48;
const LAMP_RADIUS_DEG = 5;
const LAMP_RADIANCE = 14;
const LAMP_TINT: [number, number, number] = [1, 0.84, 0.64];

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function hexLinear(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  // THREE.Color stores linear values once colour management is on, but
  // read the sRGB hex directly so this stays independent of that flag.
  const h = c.getHexString();
  return [0, 2, 4].map((i) => srgbToLinear(Number.parseInt(h.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
}

/** Equirect radiance: `top`/`wall`/`bottom` gradient plus the lamp ring. */
export function buildFrameEnvEquirect(
  top: string,
  wall: string,
  bottom: string,
): THREE.DataTexture {
  const t = hexLinear(top);
  const w = hexLinear(wall);
  const b = hexLinear(bottom);
  const data = new Float32Array(W * H * 4);
  const lampR = (LAMP_RADIUS_DEG * Math.PI) / 180;
  const lampDirs: Array<[number, number, number]> = [];
  const el = (LAMP_ELEVATION_DEG * Math.PI) / 180;
  for (let k = 0; k < LAMP_COUNT; k++) {
    const az = (k / LAMP_COUNT) * Math.PI * 2 + 0.3;
    lampDirs.push([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
  }
  for (let y = 0; y < H; y++) {
    // Row 0 is straight down. A DataTexture is uploaded without flipY,
    // so its first row is v = 0, and three's equirect lookup puts v = 0
    // at -y. Until 17 October 2026 row 0 was written as straight up:
    // the lamps stood 48° under the horizon, and a gold rail seen from
    // above caught them on its underside.
    const lat = -Math.PI / 2 + ((y + 0.5) / H) * Math.PI;
    // v runs from the top of the sky (0) to straight down (1).
    const v = 1 - (y + 0.5) / H;
    let base: [number, number, number];
    if (v < 0.4) {
      const k = v / 0.4;
      base = [t[0] + (w[0] - t[0]) * k, t[1] + (w[1] - t[1]) * k, t[2] + (w[2] - t[2]) * k];
    } else if (v < 0.6) {
      base = w;
    } else {
      const k = (v - 0.6) / 0.4;
      base = [w[0] + (b[0] - w[0]) * k, w[1] + (b[1] - w[1]) * k, w[2] + (b[2] - w[2]) * k];
    }
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const dir = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      let lamp = 0;
      for (const d of lampDirs) {
        const cosA = dir[0] * d[0] + dir[1] * d[1] + dir[2] * d[2];
        const a = Math.acos(Math.min(1, cosA));
        lamp += Math.exp(-((a / lampR) ** 2));
      }
      const i = (y * W + x) * 4;
      data[i] = base[0] + lamp * LAMP_RADIANCE * LAMP_TINT[0];
      data[i + 1] = base[1] + lamp * LAMP_RADIANCE * LAMP_TINT[1];
      data[i + 2] = base[2] + lamp * LAMP_RADIANCE * LAMP_TINT[2];
      data[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
