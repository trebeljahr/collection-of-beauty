// Which room's light a material is shaded by.
//
// A room's fill light is an environment map painted from its palette
// (room-env-map.tsx). Until 13 October 2026 one map lit the whole scene,
// bound to `scene.environment`: the map of the room the visitor stood
// in. In the tower a floor is one palette, so the map changed on the
// stairs and nowhere else. In the block plan a floor holds three eras
// and its halls a fourth palette, and the map changed in every doorway
// between them. One step from the court into the crimson gallery beside
// it took a fifth of the brightness off every wall, floor and ceiling in
// view, and the step back put it on again: the lights seemed to go off
// and on as the visitor went from room to room.
//
// So the light is the room's, not the visitor's. A material that
// belongs to a room carries that room's map as its own `envMap`, which
// three prefers to `scene.environment`, and a room looks the same from
// inside as through a door. What is shared by every room (a frame's
// leaf, a bench's leather) is cloned once per palette (`inRoomLight`):
// the clones run the same shader program and differ in one texture
// binding. What belongs to no room, the stairs and their rails, keeps
// `scene.environment`.
//
// The maps belong to a renderer, the materials to the page. The
// component that owns the maps hands them in with `setRoomLightSource`
// and takes them out again when its renderer goes.

import type * as THREE from "three";
import type { Palette } from "@/lib/gallery-eras";

/** `room` is the plain gradient that lights plaster. `highlight` is the
 *  same gradient with lamps in it (frame-env.ts), for what is polished
 *  enough to show a glint. */
export type RoomLightKind = "room" | "highlight";

export type RoomLightSource = {
  /** The map of a palette, for the renderer the source belongs to. */
  map(palette: Palette, kind: RoomLightKind): THREE.Texture;
  /** The room's fill level: `envMapIntensity` before a material's own
   *  `userData.envScale`. */
  intensity: number;
};

/** Materials that reflect the highlight map. A clone made for a room
 *  takes the kind of the material it was made from. */
export const HIGHLIGHT_ENV_MATERIALS: THREE.MeshStandardMaterial[] = [];

const lit = new Map<THREE.MeshStandardMaterial, { palette: Palette; kind: RoomLightKind }>();
let source: RoomLightSource | null = null;

function bind(material: THREE.MeshStandardMaterial, palette: Palette, kind: RoomLightKind): void {
  if (!source) return;
  material.envMap = source.map(palette, kind);
  // A material may ask for less of the room than the walls get: gilt
  // that mirrors a pale room at full strength is one flat yellow.
  material.envMapIntensity =
    source.intensity * ((material.userData.envScale as number | undefined) ?? 1);
  material.needsUpdate = true;
}

/** Light `material` as a room of `palette` is lit, wherever the visitor
 *  stands. For a material that is made for one palette. */
export function litByRoom<T extends THREE.MeshStandardMaterial>(
  material: T,
  palette: Palette,
  kind: RoomLightKind = "room",
): T {
  lit.set(material, { palette, kind });
  bind(material, palette, kind);
  return material;
}

const variants = new WeakMap<
  THREE.MeshStandardMaterial,
  Map<Palette, THREE.MeshStandardMaterial>
>();

/** `base` as it is lit in a room of `palette`: a clone, made once and
 *  kept. For a material every room shares. Change `base` after its
 *  first clone and the clones do not follow. */
export function inRoomLight<T extends THREE.MeshStandardMaterial>(base: T, palette: Palette): T {
  let byPalette = variants.get(base);
  if (!byPalette) {
    byPalette = new Map();
    variants.set(base, byPalette);
  }
  let variant = byPalette.get(palette) as T | undefined;
  if (!variant) {
    variant = base.clone() as T;
    // `clone` leaves the shader patch behind. With the same patch and
    // the same cache key the clone runs the program its base runs.
    variant.onBeforeCompile = base.onBeforeCompile;
    variant.customProgramCacheKey = base.customProgramCacheKey;
    byPalette.set(palette, variant);
    litByRoom(variant, palette, HIGHLIGHT_ENV_MATERIALS.includes(base) ? "highlight" : "room");
  }
  return variant;
}

/** Hand in the maps of a renderer, or take them out with `null`: a map
 *  from a lost WebGL context samples to nothing. */
export function setRoomLightSource(next: RoomLightSource | null): void {
  source = next;
  for (const [material, { palette, kind }] of lit) {
    if (next) {
      bind(material, palette, kind);
    } else {
      material.envMap = null;
      material.needsUpdate = true;
    }
  }
}
