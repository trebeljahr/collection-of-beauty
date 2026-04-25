"use client";

import type { Artwork } from "@/lib/data";
import type { Placement } from "@/lib/gallery-layout/types";
import { variantUrl } from "@/lib/utils";
import { Text } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { type PaintingEntry, registerPainting, unregisterPainting } from "./painting-registry";
import { frameMaterial, plaqueBaseMaterial } from "./palette-materials";
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
  const url = variantUrl(artwork.objectKey, 960, "avif");

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
      <Plaque artwork={artwork} widthM={widthM} />
    </group>
  );
}

// ── Plaque ────────────────────────────────────────────────────────────
// A small museum-style label card to the right of each painting at
// canvas centre height. Carries title, artist, year, dimensions.

// A small museum-style label card. Sized so the painting + plaque
// reach (paintingW + GAP + PLAQUE_W) stays under one cell width
// (~2.5 m), preventing overlap with the next slot's plaque/painting.
const PLAQUE_W = 0.22;
const PLAQUE_H = 0.18;
const PLAQUE_DEPTH = 0.012;
const PLAQUE_GAP = 0.05;

function Plaque({
  artwork,
  widthM,
}: {
  artwork: Artwork;
  widthM: number;
}) {
  // Plaque sits to the painting's right at canvas mid-height (eye
  // level — the group origin is already at the painting's centre).
  const localX = widthM / 2 + PLAQUE_GAP + PLAQUE_W / 2;
  const localY = 0;
  const localZ = 0.04;

  const title = stripBrackets(artwork.title);
  const year = artwork.year ? `, ${artwork.year}` : "";
  const byline = `${artwork.artist ?? "Unknown"}${year}`;
  const dims = artwork.realDimensions
    ? `${artwork.realDimensions.widthCm.toFixed(0)} × ${artwork.realDimensions.heightCm.toFixed(0)} cm`
    : "";
  const text = [title, "", byline, dims].filter(Boolean).join("\n");

  return (
    <group position={[localX, localY, localZ]}>
      <mesh>
        <boxGeometry args={[PLAQUE_W, PLAQUE_H, PLAQUE_DEPTH]} />
        <primitive object={plaqueBaseMaterial} attach="material" />
      </mesh>
      <Text
        position={[0, 0, PLAQUE_DEPTH / 2 + 0.002]}
        fontSize={0.018}
        lineHeight={1.35}
        color="#241810"
        anchorX="center"
        anchorY="middle"
        maxWidth={PLAQUE_W - 0.024}
        textAlign="center"
      >
        {text}
      </Text>
    </group>
  );
}

/** Trim Wikimedia title noise: `label QS:Len,"Foo"` → `Foo`, drop
 *  trailing language-tagged duplicates. */
function stripBrackets(title: string): string {
  const m = title.match(/label QS:L\w+,"([^"]+)"/);
  if (m) return m[1];
  const cut = title.indexOf(" label QS:");
  if (cut > 0) return title.slice(0, cut).trim();
  return title;
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
