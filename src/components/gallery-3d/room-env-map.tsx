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
// Implementation: a tiny equirectangular canvas painted with a
// wall-colour-biased vertical gradient is run through PMREMGenerator
// once per palette. Output is cached by Palette identity (stable —
// `ERAS` is a module-level const) so the seven era maps are built
// lazily and reused for the lifetime of the page.

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";

const cache = new Map<Palette, THREE.WebGLRenderTarget>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar * (1 - t) + br * t, ag * (1 - t) + bg * t, ab * (1 - t) + bb * t);
}

// Equirect maps latitude → vertical canvas axis: top row projects to
// straight up, bottom row to straight down. Real interiors converge —
// after enough diffuse bounces — to an ambient that's roughly wall-
// coloured, because walls dominate the surface area. We fake that
// equilibrium in a single sample by using the wall colour as the
// dominant tone over the whole sphere, mixing partway toward the
// ceiling at the top and partway toward the floor at the bottom.
//
// Why not pure ceiling/wall/floor bands: vertical surfaces (every
// wall in the museum) integrate the upper AND lower hemispheres for
// their diffuse term. A literal floor-coloured lower hemisphere drops
// the wall's averaged irradiance to a muddy mid-tone that reads as
// dim. Biasing the whole map toward the wall colour keeps walls
// looking creamy from every viewing angle while still giving metallic
// reflections a sense of "ceiling above, floor below".
function paintRoomEquirect(palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const top = mix(palette.wallColor, palette.ceilingColor, 0.55);
  const bottom = mix(palette.wallColor, palette.floorColor, 0.4);

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, top);
  grad.addColorStop(0.4, palette.wallColor);
  grad.addColorStop(0.6, palette.wallColor);
  grad.addColorStop(1.0, bottom);
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
 * from cache) the procedural map for `palette` and binds it to
 * `scene.environment`. Default intensity sits well above 1: the
 * sunset preset we replaced was an HDRI with super-bright sky values
 * baked in, so its irradiance at 0.4 was much higher than an LDR
 * canvas at 0.4 can deliver. 1.6 brings the room's creamy ambient
 * back to roughly the level the gallery shipped with.
 */
export function RoomEnvironment({ palette, intensity = 1.6 }: Props) {
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
