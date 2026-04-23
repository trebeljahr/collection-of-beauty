"use client";

import { Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Placement } from "@/lib/gallery-layout/types";
import { variantUrl } from "@/lib/utils";

/**
 * One painting on a wall. Renders a thin box behind the canvas so the
 * painting has some depth (the wall behind is roughly 0.05 m away), with
 * a textured plane on the front. Texture is loaded via useLoader so
 * three.js caches per URL.
 *
 * Prefer a 960 px variant — big enough to look crisp at 2 m wide, small
 * enough that 40 paintings on a floor fit in GPU memory comfortably.
 */
export function Painting({ placement }: { placement: Placement }) {
  const { artwork, position, rotation, widthM, heightM } = placement;
  const url = variantUrl(artwork.objectKey, 960, "webp");

  const frameDepth = 0.05;
  const frameInset = 0.03;

  return (
    <group position={position} rotation={rotation}>
      {/* Frame (simple dark box) */}
      <mesh>
        <boxGeometry args={[widthM + frameInset * 2, heightM + frameInset * 2, frameDepth]} />
        <meshStandardMaterial color="#1a1108" roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Canvas plane — sits just in front of the frame. */}
      <Suspense fallback={<FallbackSwatch widthM={widthM} heightM={heightM} />}>
        <PaintingPlane url={url} widthM={widthM} heightM={heightM} />
      </Suspense>
    </group>
  );
}

function PaintingPlane({
  url,
  widthM,
  heightM,
}: {
  url: string;
  widthM: number;
  heightM: number;
}) {
  const texture = useLoader(THREE.TextureLoader, url) as THREE.Texture;
  // sRGB colour space — raw PNG/WebP data is non-linear.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return (
    <mesh position={[0, 0, 0.03]}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Shown while the real texture is still fetching. Subtle neutral swatch
 *  keeps the wall from flashing bright white. */
function FallbackSwatch({
  widthM,
  heightM,
}: {
  widthM: number;
  heightM: number;
}) {
  return (
    <mesh position={[0, 0, 0.03]}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial color="#3a2e20" toneMapped={false} />
    </mesh>
  );
}
