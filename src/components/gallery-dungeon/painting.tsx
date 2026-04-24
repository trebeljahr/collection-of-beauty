"use client";

import type { Placement } from "@/lib/gallery-layout/types";
import { variantUrl } from "@/lib/utils";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { type PaintingEntry, registerPainting, unregisterPainting } from "./painting-registry";
import { frameMaterial } from "./palette-materials";
import { useCachedTexture } from "./texture-cache";

/**
 * One painting on a wall. Renders a thin box behind the canvas so the
 * painting has some depth (the wall behind is roughly 0.05 m away),
 * with a textured plane on the front. Registers itself with the
 * global painting-registry so the Player's aim raycast can skip the
 * full scene traversal.
 *
 * Prefer a 960 px variant — big enough to look crisp at 2 m wide, small
 * enough that a few hundred paintings on a floor fit in GPU memory
 * comfortably. The texture-cache handles LRU eviction + rAF-paced GPU
 * uploads so a floor-wide burst of loads doesn't hitch the frame.
 */
export function Painting({ placement }: { placement: Placement }) {
  const { artwork, position, rotation, widthM, heightM } = placement;
  const url = variantUrl(artwork.objectKey, 960, "webp");

  const frameDepth = 0.05;
  const frameInset = 0.03;

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[widthM + frameInset * 2, heightM + frameInset * 2, frameDepth]} />
        <primitive object={frameMaterial} attach="material" />
      </mesh>
      <Suspense fallback={<FallbackSwatch widthM={widthM} heightM={heightM} artwork={artwork} />}>
        <PaintingPlane url={url} widthM={widthM} heightM={heightM} artwork={artwork} />
      </Suspense>
    </group>
  );
}

function PaintingPlane({
  url,
  widthM,
  heightM,
  artwork,
}: {
  url: string;
  widthM: number;
  heightM: number;
  artwork: Placement["artwork"];
}) {
  const texture = useCachedTexture(url);
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const entry: PaintingEntry = {
      mesh,
      worldPos: mesh.getWorldPosition(new THREE.Vector3()),
      artwork,
    };
    registerPainting(entry);
    return () => unregisterPainting(entry);
  }, [artwork]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.03]} userData={{ artwork }}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Shown while the real texture is still fetching. */
function FallbackSwatch({
  widthM,
  heightM,
  artwork,
}: {
  widthM: number;
  heightM: number;
  artwork: Placement["artwork"];
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const entry: PaintingEntry = {
      mesh,
      worldPos: mesh.getWorldPosition(new THREE.Vector3()),
      artwork,
    };
    registerPainting(entry);
    return () => unregisterPainting(entry);
  }, [artwork]);

  return (
    <mesh ref={meshRef} position={[0, 0, 0.03]} userData={{ artwork }}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial color="#3a2e20" toneMapped={false} />
    </mesh>
  );
}
