import type * as THREE from "three";
import type { ArtworkListing } from "@/lib/data";
import { estimateTextureBytes } from "@/lib/gallery-layout/reveal-budget";
import { GALLERY_LOD_WIDTH } from "@/lib/utils";
import { FOV_DEFAULT_DEG, ZOOM_PIXEL_HEADROOM } from "./camera-config";
import { HIRES_ENTRY_BYTE_CAP } from "./texture-cache";

export type LodTier = {
  width: number;
  bytes: number;
  upgradeSq: number;
  downgradeSq: number;
  releaseSq: number;
};

export type LodSample = {
  displaySq: number;
  predictedSq: number;
  visible: boolean;
  /** Seconds on the controller's clock; used for turn-away grace. */
  time: number;
};

export type LodRequest = {
  bytes: number;
  /** Cost of current demand if the future upgrade is declined. */
  requiredBytes: number;
  speculative: boolean;
  priority: number;
  /** Called even for resident candidates, to keep the chosen set stable. */
  accept: () => void;
  cancel: () => void;
  /** Release displayed detail when nearer works need the working set. */
  release: () => void;
};

const LADDER = [960, 1920, 2560, 4096, GALLERY_LOD_WIDTH];
const CLOSE_VIEW_M = 0.45;
// Swap while the previous texture still has 1.35 texels per screen pixel.
// This margin covers filtering and the controller's sampling interval.
const DETAIL_HEADROOM = 1.35;
const TAN_HALF_FOV = Math.tan((FOV_DEFAULT_DEG * Math.PI) / 360);
export const LOD_TICK_SECONDS = 0.1;

/** Filename widths can exceed a source's actual pixels. Dedupe those
 * rungs and retain the existing per-source, GPU and decoded-byte caps. */
export function derivePaintingLodTiers(
  artwork: Pick<ArtworkListing, "variantWidths" | "width">,
  baseWidth: number,
  renderWidthM: number,
  aspect: number,
  backingHeightPx: number,
  maxTextureSize: number,
): LodTier[] {
  if (!artwork.variantWidths?.length) return [];
  const effective = (width: number) =>
    artwork.width && artwork.width > 0 ? Math.min(width, artwork.width) : width;
  const oneToOne = (renderWidthM * (backingHeightPx || 1080)) / (2 * TAN_HALF_FOV);
  const wantPx = oneToOne / CLOSE_VIEW_M;
  let below = effective(baseWidth);
  if (below >= wantPx * ZOOM_PIXEL_HEADROOM) return [];
  const tiers: LodTier[] = [];
  for (const width of LADDER) {
    const pixels = effective(width);
    const height = Math.max(1, Math.round(pixels / aspect));
    const bytes = estimateTextureBytes(pixels, height);
    if (pixels > maxTextureSize || height > maxTextureSize || bytes > HIRES_ENTRY_BYTE_CAP) break;
    if (!artwork.variantWidths.includes(width) || pixels <= below) continue;
    const upgrade = (oneToOne / below) * DETAIL_HEADROOM;
    tiers.push({
      width,
      bytes,
      upgradeSq: upgrade * upgrade,
      downgradeSq: (upgrade * 1.4) ** 2,
      releaseSq: (upgrade * 1.7 + 1) ** 2,
    });
    below = pixels;
    if (pixels >= wantPx) break;
  }
  return tiers.reverse();
}

/** Highest useful rung, with a wider retreat boundary for the one on screen. */
export function selectLodTier(
  tiers: readonly LodTier[],
  displaySq: number,
  displayed = -1,
): number {
  return tiers.findIndex(
    (tier, i) => displaySq < (i === displayed ? tier.downgradeSq : tier.upgradeSq),
  );
}

export function planPaintingLod(tiers: readonly LodTier[], sample: LodSample, displayed: number) {
  if (!sample.visible) return null;
  const current = selectLodTier(tiers, sample.displaySq, displayed);
  const predicted = selectLodTier(tiers, sample.predictedSq);
  const target =
    current === -1 ? predicted : predicted === -1 ? current : Math.min(current, predicted);
  if (target === -1) return null;
  const actual = selectLodTier(tiers, sample.displaySq);
  return {
    target,
    speculative: current === -1 || target < current,
    // Ranking must not change just because a speculative map was installed.
    priority:
      sample.displaySq / tiers[actual === -1 ? tiers.length - 1 : actual].upgradeSq +
      (actual === -1 ? 100 : 0),
  };
}

/** Rank actual demand first. Count resident predictions too: otherwise
 * every tick would fill another batch of speculative paintings. */
export function scheduleLodRequests(requests: LodRequest[], byteBudget: number): void {
  requests.sort((a, b) => a.priority - b.priority);
  // Leave one maximum-sized rung free for a swap. Without transition
  // headroom, displayed pins can block their own replacements forever.
  const workingBudget = Math.max(0, byteBudget - HIRES_ENTRY_BYTE_CAP);
  let committedBytes = 0;
  const admitted = new Set<LodRequest>();
  for (const request of requests) {
    if (
      (request.requiredBytes > 0 && admitted.size >= 48) ||
      committedBytes + request.requiredBytes > workingBudget
    ) {
      request.release();
    } else {
      committedBytes += request.requiredBytes;
      admitted.add(request);
    }
  }
  let speculativeCount = 0;
  let speculativeBytes = 0;
  const limit = Math.min(96 * 1024 * 1024, byteBudget / 3);
  // Start required loads before speculative ones can consume both slots.
  for (const request of requests) {
    if (admitted.has(request) && !request.speculative) request.accept();
  }
  for (const request of requests) {
    if (!admitted.has(request) || !request.speculative) continue;
    const extraBytes = Math.max(0, request.bytes - request.requiredBytes);
    if (
      speculativeCount >= 3 ||
      speculativeBytes + request.bytes > limit ||
      committedBytes + extraBytes > workingBudget
    ) {
      request.cancel();
      continue;
    }
    committedBytes += extraBytes;
    speculativeCount++;
    speculativeBytes += request.bytes;
    request.accept();
  }
}

type Point = { x: number; y: number; z: number };
type PaintingSurface = {
  worldPos: Point;
  worldRight: Point;
  worldUp: Point;
  halfW: number;
  halfH: number;
};

/** A thin world-space box stays behind the eye on a close turn-away.
 * A bounding sphere encloses the eye there and cannot reject the work. */
export function isPaintingVisible(
  surface: PaintingSurface,
  camera: Point,
  frustum: THREE.Frustum,
  box: THREE.Box3,
): boolean {
  const { worldPos: p, worldRight: r, worldUp: u, halfW, halfH } = surface;
  const front =
    (camera.x - p.x) * (r.y * u.z - r.z * u.y) +
    (camera.y - p.y) * (r.z * u.x - r.x * u.z) +
    (camera.z - p.z) * (r.x * u.y - r.y * u.x);
  if (front <= 0) return false;
  const x = Math.abs(r.x) * halfW + Math.abs(u.x) * halfH + 0.15;
  const y = Math.abs(r.y) * halfW + Math.abs(u.y) * halfH + 0.15;
  const z = Math.abs(r.z) * halfW + Math.abs(u.z) * halfH + 0.15;
  box.min.set(p.x - x, p.y - y, p.z - z);
  box.max.set(p.x + x, p.y + y, p.z + z);
  return frustum.intersectsBox(box);
}

/** Closest point on the canvas, including its edges, rather than its centre. */
export function paintingDistanceSq(surface: PaintingSurface, point: Point): number {
  const dx = point.x - surface.worldPos.x;
  const dy = point.y - surface.worldPos.y;
  const dz = point.z - surface.worldPos.z;
  const r = surface.worldRight;
  const u = surface.worldUp;
  const localR = dx * r.x + dy * r.y + dz * r.z;
  const localU = dx * u.x + dy * u.y + dz * u.z;
  const perpSq = Math.max(0, dx * dx + dy * dy + dz * dz - localR ** 2 - localU ** 2);
  return (
    Math.max(0, Math.abs(localR) - surface.halfW) ** 2 +
    Math.max(0, Math.abs(localU) - surface.halfH) ** 2 +
    perpSq
  );
}

/** A walking forecast must stop at the wall, not continue through it
 * and interpret the far side as retreat. Reuse the caller's scratch point. */
export function paintingApproachDistanceSq(
  surface: PaintingSurface,
  from: Point,
  to: Point,
  scratch: Point,
): number {
  const r = surface.worldRight;
  const u = surface.worldUp;
  const nx = r.y * u.z - r.z * u.y;
  const ny = r.z * u.x - r.x * u.z;
  const nz = r.x * u.y - r.y * u.x;
  const signed = (p: Point) =>
    (p.x - surface.worldPos.x) * nx +
    (p.y - surface.worldPos.y) * ny +
    (p.z - surface.worldPos.z) * nz;
  const start = signed(from);
  const end = signed(to);
  const t = start * end < 0 ? start / (start - end) : 1;
  scratch.x = from.x + (to.x - from.x) * t;
  scratch.y = from.y + (to.y - from.y) * t;
  scratch.z = from.z + (to.z - from.z) * t;
  return Math.min(paintingDistanceSq(surface, from), paintingDistanceSq(surface, scratch));
}

type ConnectionHints = { saveData?: boolean; effectiveType?: string; downlink?: number };

export function canPredictDetail(connection?: ConnectionHints): boolean {
  return (
    !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "") &&
    !(connection?.downlink !== undefined && connection.downlink < 1.5)
  );
}

/** Horizontal velocity only. Reset on a pause/teleport; clamp prediction
 * to three metres. A direction reversal uses the new motion immediately. */
export class LodMotion {
  private previous: Point | null = null;
  private vx = 0;
  private vz = 0;

  predict(position: Point, elapsed: number, enabled: boolean, out: Point): void {
    const previous = this.previous;
    this.previous ??= { ...position };
    const dx = previous ? position.x - previous.x : 0;
    const dz = previous ? position.z - previous.z : 0;
    const distance = Math.hypot(dx, dz);
    if (!previous || elapsed <= 0 || elapsed > 0.5 || distance / elapsed > 6 || distance < 0.015) {
      this.vx = this.vz = 0;
    } else {
      const vx = dx / elapsed;
      const vz = dz / elapsed;
      const blend = vx * this.vx + vz * this.vz <= 0 ? 1 : 0.65;
      this.vx += (vx - this.vx) * blend;
      this.vz += (vz - this.vz) * blend;
    }
    Object.assign(this.previous, position);
    const horizon = enabled ? Math.min(0.9, 3 / (Math.hypot(this.vx, this.vz) || 1)) : 0;
    out.x = position.x + this.vx * horizon;
    out.y = position.y;
    out.z = position.z + this.vz * horizon;
  }
}
