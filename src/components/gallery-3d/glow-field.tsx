"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { UNREFLECTED_LAYER } from "./floor-mirror";
import { buildGlowGeometry, type Glow, lampGlowMaterial } from "./glow";

// The lens glows of every picture light, as one mesh for the scene. A
// floor mounts a light for each of its works, stand-ins included, and a
// glow mesh apiece would be a draw call a work. A work's lights do not
// move, so each registers its glows in world space once, and the mesh
// is rebuilt in the frame after the set changes.
//
// It belongs to no room, so room culling leaves it drawn. A glow in a
// room that is culled stands behind the walls that hide that room, and
// the depth test hides it with them.

const sources = new Map<object, readonly Glow[]>();
let version = 0;

/** Put a light's glows in the scene's batch, or take them out (`null`). */
export function setGlows(key: object, glows: readonly Glow[] | null): void {
  if (glows && glows.length > 0) sources.set(key, glows);
  else if (!sources.delete(key)) return;
  version++;
}

export function GlowField() {
  const mesh = useRef<THREE.Mesh>(null);
  const built = useRef(-1);
  const geometry = useRef<THREE.BufferGeometry | null>(null);

  useFrame(() => {
    const m = mesh.current;
    if (!m || built.current === version) return;
    built.current = version;
    const next = buildGlowGeometry([...sources.values()].flat());
    geometry.current?.dispose();
    geometry.current = next;
    m.visible = next !== null;
    if (next) m.geometry = next;
  });

  useEffect(() => () => geometry.current?.dispose(), []);

  return (
    <mesh
      ref={mesh}
      material={lampGlowMaterial}
      renderOrder={2}
      layers={UNREFLECTED_LAYER}
      visible={false}
      // Its bounds are the building's.
      frustumCulled={false}
    />
  );
}
