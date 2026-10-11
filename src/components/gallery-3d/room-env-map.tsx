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
// wall-colour-biased vertical gradient is run through PMREMGenerator,
// then cached per renderer → palette and reused for the lifetime of
// that renderer.

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";
import { buildFrameEnvEquirect } from "./frame-env";
import { HIGHLIGHT_ENV_MATERIALS } from "./palette-materials";
import { greyOf, hexToRgb, rgbToHex, wallAsLightSource } from "./wall-light";

// A PMREM WebGLRenderTarget's texture is bound to the GL context that
// built it. Keying the cache by Palette alone (module-scope, lifetime
// of the page) meant that after the Canvas remounts to recover from a
// WebGL context loss (see `canvasKey` in index.tsx), env maps built
// against the now-dead context sampled to nothing — the entry floor
// lost all ambient fill (only lamps left), while floors first entered
// after the remount rebuilt fresh and looked fine. So key by the live
// renderer first: a remount misses the cache and rebuilds against the
// new context. WeakMap so a dead renderer's targets are GC'd once it is
// (its GPU memory already died with the context — no manual dispose).
const cacheByRenderer = new WeakMap<THREE.WebGLRenderer, Map<Palette, THREE.WebGLRenderTarget>>();
// Same keying for the frame highlight map (frame-env.ts).
const frameCacheByRenderer = new WeakMap<
  THREE.WebGLRenderer,
  Map<Palette, THREE.WebGLRenderTarget>
>();

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar * (1 - t) + br * t, ag * (1 - t) + bg * t, ab * (1 - t) + bb * t);
}

/** Pull a colour most of the way to its own grey.
 *
 *  The map lights the walls, and a wall's shaded colour is its albedo
 *  times the light's colour. Lit by a map of its own cream, a cream wall
 *  comes out cream squared: khaki. That was invisible while the map ran
 *  at 1.6 and tone mapping bleached the result back toward white, and it
 *  showed as soon as the rooms were dimmed for the picture lights. Real
 *  inter-reflection does tint a room, but far less than one full
 *  multiply, so the light keeps only part of the palette's hue. */
const LIGHT_HUE_KEPT = 0.12;
function asLight(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const grey = greyOf(hex);
  const k = LIGHT_HUE_KEPT;
  return rgbToHex(grey + (r - grey) * k, grey + (g - grey) * k, grey + (b - grey) * k);
}

/** The three stops of the room gradient, shared with the frame map.
 *  The wall enters as `wallAsLightSource`, so a deep wall colour does
 *  not dim the room it is painted on (see wall-light.ts). */
function roomLightStops(palette: Palette): { top: string; wall: string; bottom: string } {
  const wall = wallAsLightSource(palette.wallColor);
  return {
    top: asLight(mix(wall, palette.ceilingColor, 0.55)),
    wall: asLight(wall),
    bottom: asLight(mix(wall, palette.floorColor, 0.4)),
  };
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

  const { top, wall, bottom } = roomLightStops(palette);

  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0.0, top);
  grad.addColorStop(0.4, wall);
  grad.addColorStop(0.6, wall);
  grad.addColorStop(1.0, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  return canvas;
}

function getRoomEnvironmentMap(palette: Palette, renderer: THREE.WebGLRenderer): THREE.Texture {
  let perPalette = cacheByRenderer.get(renderer);
  if (!perPalette) {
    perPalette = new Map();
    cacheByRenderer.set(renderer, perPalette);
  }
  const cached = perPalette.get(palette);
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

  perPalette.set(palette, target);
  return target.texture;
}

function getFrameEnvironmentMap(palette: Palette, renderer: THREE.WebGLRenderer): THREE.Texture {
  let perPalette = frameCacheByRenderer.get(renderer);
  if (!perPalette) {
    perPalette = new Map();
    frameCacheByRenderer.set(renderer, perPalette);
  }
  const cached = perPalette.get(palette);
  if (cached) return cached.texture;

  const { top, wall, bottom } = roomLightStops(palette);
  const equirect = buildFrameEnvEquirect(top, wall, bottom);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  pmrem.dispose();
  equirect.dispose();
  perPalette.set(palette, target);
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
 * `scene.environment`. The default intensity is the room's fill level:
 * it puts a pale wall at a mid tone, so the picture lights' pools
 * (painting-light.tsx) have headroom above it. It ran at 1.6 before the
 * works had lights of their own, which left the walls at near-white
 * and nothing for a pool to add.
 */
export function RoomEnvironment({ palette, intensity = 0.74 }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const envMap = getRoomEnvironmentMap(palette, gl);
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
    // Frames and fixtures reflect the highlight map instead, at the
    // same strength as the room's.
    const frameEnv = getFrameEnvironmentMap(palette, gl);
    for (const m of HIGHLIGHT_ENV_MATERIALS) {
      m.envMap = frameEnv;
      m.envMapIntensity = intensity;
      m.needsUpdate = true;
    }
    return () => {
      // Don't dispose — the cache keeps the target alive across floor
      // swaps. Just detach so a re-mount isn't briefly lit by the
      // previous palette's map, and so a remounted renderer never
      // samples a target from a lost context.
      scene.environment = null;
      for (const m of HIGHLIGHT_ENV_MATERIALS) {
        m.envMap = null;
        m.needsUpdate = true;
      }
    };
  }, [palette, intensity, gl, scene]);

  return null;
}
