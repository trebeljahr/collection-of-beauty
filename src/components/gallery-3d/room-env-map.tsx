"use client";

// Procedural environment map keyed off the active era's palette.
//
// We previously fed the scene a `sunset` HDRI from drei. That gave
// metallic surfaces (gilded frames, plaque chrome rims) something to
// reflect, but the warm orange/pink hemisphere also tinted every wall
// and ceiling — which read as light coming through the walls from a
// world outside the museum. Procedurally painting the env map from the
// room's own ceiling/wall/floor colors keeps reflections coherent with
// the actual room: walls reflect the wall tone, the floor underfoot
// reads on the underside of metallic frames, and there's no synthetic
// "exterior" leaking in.
//
// Implementation: a tiny equirectangular canvas (3-band vertical
// gradient) is run through PMREMGenerator once per palette. Output is
// cached by Palette identity (stable — `ERAS` is a module-level const)
// so the seven era maps are built lazily and reused for the lifetime
// of the page.

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";

const cache = new Map<Palette, THREE.WebGLRenderTarget>();

// Equirect maps latitude → vertical canvas axis. Top row of pixels
// projects to the north pole (straight up), bottom row to the south
// pole (straight down), middle row to the horizon. A purely vertical
// gradient therefore reads as: ceiling overhead, walls at eye level,
// floor underfoot — which is exactly what we want a closed room's
// reflection to look like.
function paintRoomEquirect(palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  // Hard-ish bands with short cross-fades. A pure gradient over the
  // full height blurs the wall colour into a wide twilight band that
  // doesn't match what the eye sees standing in the room — real walls
  // dominate the horizon, so we keep ~30 % of the latitude range as
  // each surface and use the remaining ~10 % as cross-fades.
  grad.addColorStop(0.0, palette.ceilingColor);
  grad.addColorStop(0.32, palette.ceilingColor);
  grad.addColorStop(0.42, palette.wallColor);
  grad.addColorStop(0.58, palette.wallColor);
  grad.addColorStop(0.68, palette.floorColor);
  grad.addColorStop(1.0, palette.floorColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  return canvas;
}

function getRoomEnvironmentMap(palette: Palette, renderer: THREE.WebGLRenderer): THREE.Texture {
  const cached = cache.get(palette);
  if (cached) return cached.texture;

  const canvas = paintRoomEquirect(palette);
  const equirect = new THREE.CanvasTexture(canvas);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  // Canvas pixels are sRGB; without this flag PMREM treats them as
  // linear and the integrated irradiance comes out roughly twice as
  // bright (and warmer) than the colour we actually painted.
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.needsUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  pmrem.dispose();
  equirect.dispose();

  cache.set(palette, target);
  return target.texture;
}

type Props = {
  palette: Palette;
  /** Multiplier on the env map's contribution to PBR shading. */
  intensity?: number;
};

/**
 * Drop-in replacement for drei's `<Environment>`. Builds (or recalls
 * from cache) the procedural map for `palette`, assigns it to
 * `scene.environment`, and sets `scene.environmentIntensity` so the
 * existing materials read at the same level they did under the
 * `sunset` preset.
 */
export function RoomEnvironment({ palette, intensity = 0.4 }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const envMap = getRoomEnvironmentMap(palette, gl);
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
    return () => {
      // Don't dispose — the cache keeps the target alive across floor
      // swaps. Just detach so a re-mount isn't briefly lit by the
      // previous palette's map.
      scene.environment = null;
    };
  }, [palette, intensity, gl, scene]);

  return null;
}
