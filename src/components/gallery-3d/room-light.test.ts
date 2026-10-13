import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { getEra } from "@/lib/gallery-eras";
import {
  HIGHLIGHT_ENV_MATERIALS,
  inRoomLight,
  litByRoom,
  type RoomLightKind,
  setRoomLightSource,
} from "./room-light";

const stone = getEra("gothic").palette;
const crimson = getEra("baroque").palette;

/** A source that hands out one texture per palette and kind, as the
 *  renderer's cache does. */
function source(intensity = 0.74) {
  const maps = new Map<string, THREE.Texture>();
  const map = (palette: typeof stone, kind: RoomLightKind) => {
    const key = `${palette.wallColor}:${kind}`;
    let texture = maps.get(key);
    if (!texture) {
      texture = new THREE.Texture();
      texture.name = key;
      maps.set(key, texture);
    }
    return texture;
  };
  return { map, intensity };
}

afterEach(() => setRoomLightSource(null));

describe("litByRoom", () => {
  it("gives a material the map of its own palette, whenever the maps arrive", () => {
    const early = litByRoom(new THREE.MeshStandardMaterial(), crimson);
    expect(early.envMap).toBeNull();

    const maps = source();
    setRoomLightSource(maps);
    expect(early.envMap).toBe(maps.map(crimson, "room"));
    expect(early.envMapIntensity).toBeCloseTo(0.74, 6);

    const late = litByRoom(new THREE.MeshStandardMaterial(), stone);
    expect(late.envMap).toBe(maps.map(stone, "room"));
    // The first is still lit as its own room is.
    expect(early.envMap).toBe(maps.map(crimson, "room"));
  });

  it("lets go of the maps when their renderer goes, and takes the next one's", () => {
    const material = litByRoom(new THREE.MeshStandardMaterial(), stone);
    setRoomLightSource(source());
    setRoomLightSource(null);
    expect(material.envMap).toBeNull();

    const next = source();
    setRoomLightSource(next);
    expect(material.envMap).toBe(next.map(stone, "room"));
  });
});

describe("inRoomLight", () => {
  it("makes one clone per palette and keeps it", () => {
    const base = new THREE.MeshStandardMaterial({ color: "#7a482d", roughness: 0.42 });
    const inStone = inRoomLight(base, stone);
    expect(inStone).not.toBe(base);
    expect(inRoomLight(base, stone)).toBe(inStone);
    expect(inRoomLight(base, crimson)).not.toBe(inStone);
    expect(inStone.color.getHexString()).toBe(base.color.getHexString());
    expect(inStone.roughness).toBe(0.42);
  });

  it("lights each clone as its room is and leaves the base to the scene", () => {
    const base = new THREE.MeshStandardMaterial();
    const maps = source();
    setRoomLightSource(maps);
    expect(inRoomLight(base, stone).envMap).toBe(maps.map(stone, "room"));
    expect(inRoomLight(base, crimson).envMap).toBe(maps.map(crimson, "room"));
    expect(base.envMap).toBeNull();
  });

  it("keeps the shader patch, so a clone runs its base's program", () => {
    const base = new THREE.MeshStandardMaterial();
    base.onBeforeCompile = () => {};
    base.customProgramCacheKey = () => "patched";
    const clone = inRoomLight(base, stone);
    expect(clone.onBeforeCompile).toBe(base.onBeforeCompile);
    expect(clone.customProgramCacheKey()).toBe("patched");
  });

  it("gives a polished material the highlight map, at its own share of the room", () => {
    const gilt = new THREE.MeshStandardMaterial({ metalness: 1 });
    gilt.userData.envScale = 0.6;
    HIGHLIGHT_ENV_MATERIALS.push(gilt);
    const maps = source(0.5);
    setRoomLightSource(maps);
    const clone = inRoomLight(gilt, crimson);
    expect(clone.envMap).toBe(maps.map(crimson, "highlight"));
    expect(clone.envMapIntensity).toBeCloseTo(0.3, 6);
    HIGHLIGHT_ENV_MATERIALS.splice(HIGHLIGHT_ENV_MATERIALS.indexOf(gilt), 1);
  });
});
