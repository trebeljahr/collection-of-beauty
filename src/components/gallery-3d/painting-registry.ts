"use client";

// Global registry of mounted painting meshes for the Player's aim
// raycaster. Traversing scene.children recursively on every click
// scales with total mesh count (walls + floors + ceilings + paintings +
// stair steps + signs + lamps = hundreds per floor). The registry
// keeps raycasting bounded to O(mounted paintings) instead.
//
// Ported from src/components/gallery-3d.tsx's `paintingEntries` pattern
// — same trick, same benefit.

import * as THREE from "three";
import type { Artwork } from "@/lib/data";

export type PaintingEntry = {
  mesh: THREE.Mesh;
  /** Painting group's world position. Captured on registration —
   *  paintings don't move, so no need to re-read every frame. */
  worldPos: THREE.Vector3;
  /** World-space basis for closest-point distance: the painting's local
   *  +X (right, along width) and +Y (up, along height) after the parent
   *  group's rotation. Paintings don't move, so captured once. */
  worldRight: THREE.Vector3;
  worldUp: THREE.Vector3;
  /** Painting half-extents in metres. Mutable: the parent re-fits the
   *  plane to the texture's true aspect once the 960 px load reports it,
   *  so these can change shortly after register. The LodController reads
   *  them every tick to compute the closest-point distance against the
   *  painting's rectangular surface (rather than its centre — the
   *  difference matters for large paintings: a player face-pressed
   *  against the right edge of a 3 m work is centre-distance ~1.5 m
   *  away but should still be in the 4096 px band). */
  halfW: number;
  halfH: number;
  artwork: Artwork;
  /** Optional LOD tick. Called by the LodController with the squared
   *  closest-point distance from the camera to this painting's surface;
   *  the painting decides whether to prefetch, swap, or release its
   *  hi-res texture. Only PaintingPlane sets this — fallback swatches
   *  don't have a texture to upgrade. */
  lodUpdate?: (distSq: number) => void;
};

const entries = new Set<PaintingEntry>();

export function registerPainting(e: PaintingEntry): void {
  entries.add(e);
}

export function unregisterPainting(e: PaintingEntry): void {
  entries.delete(e);
}

export function forEachPainting(fn: (e: PaintingEntry) => void): void {
  for (const e of entries) fn(e);
}

/**
 * Raycast against only the registered paintings, prefiltered by
 * distance + rough forward direction. Returns the nearest Artwork hit
 * or null.
 *
 * Pre-filter parameters chosen to match the range of interactive aim:
 * - maxDistance: the player's arms can't reach farther than this, so
 *   don't bother with true ray/triangle tests beyond it.
 * - forwardDot > 0: painting must be in front of the camera (behind
 *   paintings get rejected cheaply before the ray/triangle test).
 */
export function raycastNearestPainting(
  raycaster: THREE.Raycaster,
  cameraPos: THREE.Vector3,
  cameraDir: THREE.Vector3,
  maxDistance = 12,
): Artwork | null {
  const candidates: THREE.Mesh[] = [];
  const _tmp = new THREE.Vector3();
  for (const e of entries) {
    _tmp.subVectors(e.worldPos, cameraPos);
    const dist = _tmp.length();
    if (dist > maxDistance + 1) continue;
    // Normalise in place and take dot with camera direction. Skip
    // anything that's behind the camera (forwardDot < 0.2 ≈ > 80° off).
    _tmp.divideScalar(dist || 1);
    if (_tmp.dot(cameraDir) < 0.2) continue;
    candidates.push(e.mesh);
  }
  if (candidates.length === 0) return null;

  const hits = raycaster.intersectObjects(candidates, false);
  for (const hit of hits) {
    const artwork = hit.object.userData?.artwork as Artwork | undefined;
    if (artwork) return artwork;
  }
  return null;
}

export const _paintingRegistryDebug = {
  get size() {
    return entries.size;
  },
};
