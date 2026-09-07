"use client";

// Single useFrame loop that drives every painting's hi-res LOD. One
// hook for the whole scene rather than one per painting — hundreds of
// useFrames each running their own modulo gate would still incur
// per-callback overhead from R3F's frame loop.
//
// Tick rate: every 12 frames (~5 Hz at 60 fps). The player walks at
// ~3 m/s, so over 200 ms they cross 0.6 m. That 0.6 m is exactly why
// painting.tsx sizes its prefetch lead ADDITIVELY at 1 m rather than as
// a fraction of the upgrade radius: the bands are now derived per
// painting and the tightest of them are well under a metre, so a
// proportional lead would shrink below one tick of walking on precisely
// the small works where the swap is most abrupt. Anything faster than
// 12 frames wastes CPU; slower would risk a visible texture pop.
//
// Per tick: one Vector3 read, one Set traversal, one closest-point
// squared-distance per painting (no allocation, no sqrt). For a busy
// floor of ~250 paintings that's ≪ 0.1 ms — negligible alongside GPU
// work.
//
// FOV zoom. The camera's vertical FOV is animated (player.tsx damps it
// to 35 deg on the F key), which changes on-screen size without changing
// distance. This tick converts that into a second, FOV-normalised
// distance so the derived bands in painting.tsx keep meaning what they
// say; see camera-config.ts for the arithmetic.
//
// Closest-point — not centre-distance. The sharpest rung of any given
// painting upgrades well inside a metre, which only fires reliably when
// the camera is within that radius of the SURFACE the user is looking
// at, not its centre. For a 2 m × 1.5 m painting, a player face-pressed
// against the right edge is ~1 m from the centre but only ~0.3 m from
// the rectangle — they should still get the top rung. Centre-distance
// was undershooting on big works, which is also the case the derived
// bands in painting.tsx lean on: they assume this distance is the one a
// player would call "how close am I to the picture".

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { fovZoomScaleSq } from "./camera-config";
import { forEachPainting } from "./painting-registry";
import { setHiResByteBudget, setLoadCamera } from "./texture-cache";

const TICK_INTERVAL = 12;

export function LodController() {
  const frameCount = useRef(0);
  const cameraPos = useRef(new THREE.Vector3());

  // Size the hi-res texture pool to the canvas. Every painting's LOD
  // target is now proportional to the backing height (painting.tsx), so
  // the resident working set grows with the display — a fixed pool that
  // fits a laptop overflows on a 4K panel and turns into the eviction
  // treadmill the budget exists to prevent. Done here rather than in
  // <Painting> because it is one decision for the whole scene, and this
  // is already the component that owns per-scene streaming policy.
  const backingHeight = useThree((st) => st.size.height * st.viewport.dpr);
  useEffect(() => {
    setHiResByteBudget(backingHeight);
  }, [backingHeight]);
  // Teardown lives in its own mount-only effect rather than as the
  // cleanup of the one above: sharing it would shrink the pool to base
  // and immediately re-grow it on every step of a window drag, paying a
  // round of evictions for nothing.
  useEffect(() => () => setHiResByteBudget(0), []);

  useFrame((state) => {
    frameCount.current = (frameCount.current + 1) % TICK_INTERVAL;
    if (frameCount.current !== 0) return;
    state.camera.getWorldPosition(cameraPos.current);
    const cx = cameraPos.current.x;
    const cy = cameraPos.current.y;
    const cz = cameraPos.current.z;
    // Feed the texture scheduler: its network + upload queues serve
    // whichever waiting painting is nearest the camera, so the queues
    // need to know where the player is.
    setLoadCamera(cx, cy, cz);
    // One tan for the whole scene per tick, not one per painting. 1 for
    // an orthographic or otherwise non-perspective camera, which makes
    // `displaySq` collapse back onto `distSq`.
    const cam = state.camera as THREE.PerspectiveCamera;
    const zoomScaleSq = cam.isPerspectiveCamera ? fovZoomScaleSq(cam.fov) : 1;
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
      // Second argument is the same distance expressed at the default
      // FOV, so the painting's derived bands — which are sized for that
      // FOV — stay correct while the F-key zoom is engaged. See the
      // `lodUpdate` contract in painting-registry.ts for why prefetch
      // deliberately does NOT use it.
      entry.lodUpdate(distSq, distSq * zoomScaleSq);
    });
  });

  return null;
}
