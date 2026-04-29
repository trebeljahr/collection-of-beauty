"use client";

// Single useFrame loop that drives every painting's hi-res LOD. One
// hook for the whole scene rather than one per painting — hundreds of
// useFrames each running their own modulo gate would still incur
// per-callback overhead from R3F's frame loop.
//
// Tick rate: every 12 frames (~5 Hz at 60 fps). The player walks at
// ~3 m/s, so over 200 ms they cross 0.6 m — well within the 1 m gap
// between the prefetch (4 m) and display (~1.8 m) bands. Anything
// faster wastes CPU; slower would risk a visible texture pop.
//
// Per tick: one Vector3 read, one Set traversal, one squared-distance
// per painting (no allocation, no sqrt). For a busy floor of ~250
// paintings that's ≪ 0.1 ms — negligible alongside GPU work.

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { forEachPainting } from "./painting-registry";

const TICK_INTERVAL = 12;

export function LodController() {
  const frameCount = useRef(0);
  const cameraPos = useRef(new THREE.Vector3());

  useFrame((state) => {
    frameCount.current = (frameCount.current + 1) % TICK_INTERVAL;
    if (frameCount.current !== 0) return;
    state.camera.getWorldPosition(cameraPos.current);
    const cx = cameraPos.current.x;
    const cy = cameraPos.current.y;
    const cz = cameraPos.current.z;
    forEachPainting((entry) => {
      if (!entry.lodUpdate) return;
      const dx = entry.worldPos.x - cx;
      const dy = entry.worldPos.y - cy;
      const dz = entry.worldPos.z - cz;
      const distSq = dx * dx + dy * dy + dz * dz;
      entry.lodUpdate(distSq);
    });
  });

  return null;
}
