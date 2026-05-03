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
// Per tick: one Vector3 read, one Set traversal, one closest-point
// squared-distance per painting (no allocation, no sqrt). For a busy
// floor of ~250 paintings that's ≪ 0.1 ms — negligible alongside GPU
// work.
//
// Closest-point — not centre-distance. The 4096 px tier upgrades at
// ~0.55 m, which only fires reliably when the camera is within that
// radius of the SURFACE the user is looking at, not its centre. For a
// 2 m × 1.5 m painting, a player face-pressed against the right edge
// is ~1 m from the centre but only ~0.3 m from the rectangle — they
// should still see 4096 px. Centre-distance was undershooting on big
// works and matched zoom-modal max-res only at the centre line.

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
      // Camera offset from painting centre, in world space.
      const dx = cx - entry.worldPos.x;
      const dy = cy - entry.worldPos.y;
      const dz = cz - entry.worldPos.z;
      // Project onto painting's local axes. localR / localU are the
      // signed offsets along the painting's width and height; the
      // remaining component (perpSq below) is the squared perpendicular
      // distance to the painting plane.
      const r = entry.worldRight;
      const u = entry.worldUp;
      const localR = dx * r.x + dy * r.y + dz * r.z;
      const localU = dx * u.x + dy * u.y + dz * u.z;
      const totalSq = dx * dx + dy * dy + dz * dz;
      // Clamp tiny negatives from float error so distSq is never NaN
      // after the sqrt-free decomposition.
      const perpSq = Math.max(0, totalSq - localR * localR - localU * localU);
      // Overshoot past each edge — zero when the camera projects inside
      // the rectangle (i.e. the closest point is directly in front).
      const overR = Math.max(0, Math.abs(localR) - entry.halfW);
      const overU = Math.max(0, Math.abs(localU) - entry.halfH);
      const distSq = overR * overR + overU * overU + perpSq;
      entry.lodUpdate(distSq);
    });
  });

  return null;
}
