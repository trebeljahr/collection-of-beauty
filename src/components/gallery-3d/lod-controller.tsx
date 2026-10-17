"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { fovZoomScaleSq } from "./camera-config";
import {
  canPredictDetail,
  isPaintingVisible,
  LOD_TICK_SECONDS,
  LodMotion,
  type LodRequest,
  paintingApproachDistanceSq,
  paintingDistanceSq,
  scheduleLodRequests,
} from "./painting-lod";
import { forEachPainting } from "./painting-registry";
import { getHiResByteBudget, setHiResByteBudget, setLoadCamera } from "./texture-cache";

/** One timed scan for the whole room. Prediction and frustum checks use
 * scratch objects; there are no per-painting frame hooks or raycasts. */
export function LodController() {
  const scratch = useRef({
    elapsed: LOD_TICK_SECONDS,
    time: 0,
    motion: new LodMotion(),
    position: new THREE.Vector3(),
    predicted: new THREE.Vector3(),
    approach: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    frustum: new THREE.Frustum(),
    bounds: new THREE.Box3(),
    requests: [] as LodRequest[],
  });
  const backingHeight = useThree((st) => st.size.height * st.viewport.dpr);
  useEffect(() => {
    setHiResByteBudget(backingHeight);
  }, [backingHeight]);
  useEffect(() => () => setHiResByteBudget(0), []);

  useFrame((state, delta) => {
    const s = scratch.current;
    s.elapsed += delta;
    s.time += delta;
    if (s.elapsed < LOD_TICK_SECONDS) return;
    const elapsed = s.elapsed;
    s.elapsed = 0;
    state.camera.getWorldPosition(s.position);
    setLoadCamera(s.position.x, s.position.y, s.position.z);
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string; downlink?: number };
      }
    ).connection;
    s.motion.predict(s.position, elapsed, canPredictDetail(connection), s.predicted);
    const camera = state.camera as THREE.PerspectiveCamera;
    const zoomScaleSq = camera.isPerspectiveCamera ? fovZoomScaleSq(camera.fov, camera.aspect) : 1;
    s.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    s.frustum.setFromProjectionMatrix(s.matrix);
    s.requests.length = 0;
    forEachPainting((entry) => {
      if (!entry.lodUpdate) return;
      const distSq = paintingDistanceSq(entry, s.position);
      const predictedSq = paintingApproachDistanceSq(entry, s.position, s.predicted, s.approach);
      const request = entry.lodUpdate({
        displaySq: distSq * zoomScaleSq,
        // Only approach buys extra distance. Retreat never fetches ahead.
        predictedSq: Math.min(distSq, predictedSq) * zoomScaleSq,
        visible: isPaintingVisible(entry, s.position, s.frustum, s.bounds),
        time: s.time,
      });
      if (request) s.requests.push(request);
    });
    scheduleLodRequests(s.requests, getHiResByteBudget());
  });

  return null;
}
