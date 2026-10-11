"use client";

// Gallery benches. The model is in bench-geometry.ts; where they stand
// is decided by the layout (`RoomLayout.benches`, see fittings.ts), and
// the same rectangles are colliders in gallery-physics.ts.
//
// The rooms have no three.js lights that cast shadows, so a bench would
// float on the parquet. Each one gets a soft dark quad under it instead,
// the same trick the picture lights use for a frame's shadow.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Bench } from "@/lib/gallery-layout/types";
import { buildBenchesGeometry, SHADOW_FADE_U, SHADOW_FADE_V } from "./bench-geometry";
import { UNREFLECTED_LAYER } from "./floor-mirror";

// Dark saddle leather and a walnut frame. Neither takes its colour from
// the era's palette: the same benches stand on every storey.
const leatherMaterial = new THREE.MeshStandardMaterial({
  color: "#7a482d",
  roughness: 0.42,
  metalness: 0,
  vertexColors: true,
});
const woodMaterial = new THREE.MeshStandardMaterial({
  color: "#3a281d",
  roughness: 0.5,
  metalness: 0.05,
  vertexColors: true,
});

const SHADOW_PX = 64;
/** Darkest the floor gets under the middle of a bench. */
const SHADOW_STRENGTH = 0.5;
/** Height of the shadow quad above the floor, metres. Above the floor
 *  pools of the picture lights (2 mm), which it must darken too. */
const SHADOW_LIFT = 0.004;

let shadowMaterial: THREE.MeshBasicMaterial | null = null;

/** Shared across every room, and painted once. A CanvasTexture holds
 *  its pixels on the CPU, so it re-uploads by itself after the Canvas
 *  remounts on a lost WebGL context. */
function getShadowMaterial(): THREE.MeshBasicMaterial {
  if (shadowMaterial) return shadowMaterial;
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_PX;
  canvas.height = SHADOW_PX;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Black whose alpha rises from the quad's edge to a plateau under
    // the seat. The texture is square and the quad is not, so the fade
    // is a different share of each axis and the same width in metres.
    const image = ctx.createImageData(SHADOW_PX, SHADOW_PX);
    for (let y = 0; y < SHADOW_PX; y++) {
      for (let x = 0; x < SHADOW_PX; x++) {
        const u = Math.min(x + 0.5, SHADOW_PX - x - 0.5) / (SHADOW_PX / 2);
        const v = Math.min(y + 0.5, SHADOW_PX - y - 0.5) / (SHADOW_PX / 2);
        const edge = Math.min(1, u / SHADOW_FADE_U, v / SHADOW_FADE_V);
        const alpha = edge * edge * (3 - 2 * edge);
        image.data[(y * SHADOW_PX + x) * 4 + 3] = Math.round(255 * SHADOW_STRENGTH * alpha);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  shadowMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  return shadowMaterial;
}

/** Every bench of one room: three draw calls however many there are.
 *  Seat and frame stay in the floor's reflection, where a bench is one
 *  of the few things standing on the parquet; the shadow is skipped. */
export function RoomBenches({ benches, floorY }: { benches: readonly Bench[]; floorY: number }) {
  const geometry = useMemo(() => buildBenchesGeometry(benches, floorY), [benches, floorY]);
  useEffect(
    () => () => {
      geometry?.seat.dispose();
      geometry?.frame.dispose();
      geometry?.shadow.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  return (
    <>
      <mesh geometry={geometry.seat} material={leatherMaterial} />
      <mesh geometry={geometry.frame} material={woodMaterial} />
      <mesh
        geometry={geometry.shadow}
        material={getShadowMaterial()}
        position={[0, SHADOW_LIFT, 0]}
        renderOrder={2}
        layers={UNREFLECTED_LAYER}
      />
    </>
  );
}
