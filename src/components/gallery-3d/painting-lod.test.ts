import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  canPredictDetail,
  derivePaintingLodTiers,
  isPaintingVisible,
  LodMotion,
  type LodRequest,
  paintingApproachDistanceSq,
  paintingDistanceSq,
  planPaintingLod,
  scheduleLodRequests,
  selectLodTier,
} from "./painting-lod";

const artwork = { width: 6000, variantWidths: [480, 960, 1920, 2560, 4096] };
const tiers = derivePaintingLodTiers(artwork, 480, 1, 1.5, 1200, 8192);

describe("painting LOD policy", () => {
  it("swaps before the lower rung reaches its screen-pixel limit and holds through jitter", () => {
    const baseLimit = 1200 / (2 * Math.tan((25 * Math.PI) / 180) * 480);
    const lowest = tiers.length - 1;
    expect(selectLodTier(tiers, (baseLimit * 1.2) ** 2)).toBe(lowest);
    const boundary = tiers[lowest].upgradeSq;
    expect(selectLodTier(tiers, boundary * 1.01)).toBe(-1);
    expect(selectLodTier(tiers, boundary * 1.01, lowest)).toBe(lowest);
    expect(selectLodTier(tiers, tiers[lowest].downgradeSq * 1.01, lowest)).toBe(-1);
  });

  it("requests one sharper future rung on approach, none beyond range while standing or retreating", () => {
    const outer = Math.sqrt(tiers.at(-1)!.upgradeSq);
    const displaySq = (outer + 2) ** 2;
    const sample = { displaySq, predictedSq: displaySq, visible: true, time: 1 };
    expect(planPaintingLod(tiers, sample, -1)).toBeNull();
    const approach = planPaintingLod(tiers, { ...sample, predictedSq: (outer - 0.5) ** 2 }, -1);
    expect(approach).toMatchObject({ target: tiers.length - 1, speculative: true });
    expect(planPaintingLod(tiers, { ...sample, predictedSq: 0.1, visible: false }, -1)).toBeNull();
  });

  it("loads detail demanded by stationary zoom without requiring movement", () => {
    const displaySq = tiers.at(-1)!.upgradeSq * 0.8;
    expect(
      planPaintingLod(tiers, { displaySq, predictedSq: displaySq, visible: true, time: 1 }, -1),
    ).toMatchObject({ target: tiers.length - 1, speculative: false });
  });

  it("keeps admission rank stable when an early upgrade enters display hysteresis", () => {
    const sample = {
      displaySq: tiers[0].upgradeSq * 1.5,
      predictedSq: tiers[0].upgradeSq * 0.5,
      visible: true,
      time: 1,
    };
    const before = planPaintingLod(tiers, sample, 1);
    const after = planPaintingLod(tiers, sample, 0);
    expect(before?.speculative).toBe(true);
    expect(after?.speculative).toBe(false);
    expect(after?.priority).toBe(before?.priority);
  });

  it("deduplicates source-limited variants and caps tall textures by decoded bytes and GPU size", () => {
    const source = derivePaintingLodTiers({ ...artwork, width: 1807 }, 480, 3, 1, 2160, 8192);
    expect(source.map((tier) => tier.width)).toEqual([1920, 960]);
    const tall = derivePaintingLodTiers(artwork, 480, 3, 0.4, 2160, 8192);
    expect(tall[0].width).toBe(2560);
    const smallGpu = derivePaintingLodTiers(artwork, 480, 3, 1, 2160, 2048);
    expect(smallGpu[0].width).toBe(1920);
  });

  it("measures a large painting from its edge, not its centre", () => {
    const surface = {
      worldPos: { x: 0, y: 0, z: 0 },
      worldRight: { x: 1, y: 0, z: 0 },
      worldUp: { x: 0, y: 1, z: 0 },
      halfW: 3,
      halfH: 2,
    };
    // The forecast crosses the wall; its closest approach is the wall,
    // not the point two metres behind it. This must not downgrade detail.
    expect(
      paintingApproachDistanceSq(
        surface,
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -2 },
        { x: 0, y: 0, z: 0 },
      ),
    ).toBe(0);
    expect(paintingDistanceSq(surface, { x: 3, y: 1, z: 0.5 })).toBeCloseTo(0.25);
    expect(paintingDistanceSq(surface, { x: 4, y: 1, z: 0.5 })).toBeCloseTo(1.25);
  });
});

describe("painting visibility", () => {
  it("releases a close painting on turn-away even when the eye is inside its bounding sphere", () => {
    const surface = {
      worldPos: new THREE.Vector3(),
      worldRight: new THREE.Vector3(1, 0, 0),
      worldUp: new THREE.Vector3(0, 1, 0),
      halfW: 1,
      halfH: 1,
    };
    const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
    camera.position.set(0, 0, 0.5);
    const frustum = new THREE.Frustum();
    const box = new THREE.Box3();
    const visible = (z: number) => {
      camera.lookAt(0, 0, z);
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      return isPaintingVisible(surface, camera.position, frustum, box);
    };
    expect(visible(0)).toBe(true);
    expect(visible(2)).toBe(false);
    camera.position.z = -0.5;
    expect(visible(0)).toBe(false);
  });
});

describe("bounded prediction", () => {
  it("uses the same travel horizon at 30 and 60 fps sampling intervals", () => {
    for (const elapsed of [0.1, 4 / 30]) {
      const motion = new LodMotion();
      const out = { x: 0, y: 0, z: 0 };
      motion.predict({ x: 0, y: 1.75, z: 0 }, elapsed, true, out);
      motion.predict({ x: elapsed * 3, y: 1.75, z: 0 }, elapsed, true, out);
      expect(out.x - elapsed * 3).toBeCloseTo(2.7);
    }
  });

  it("stops at rest, follows reversal, and resets for teleports and long frame gaps", () => {
    const motion = new LodMotion();
    const out = { x: 0, y: 0, z: 0 };
    const predict = (x: number, elapsed = 0.1) => {
      motion.predict({ x, y: 1.75, z: 0 }, elapsed, true, out);
      return out.x;
    };
    expect(predict(0)).toBe(0);
    expect(predict(0.3)).toBeCloseTo(3);
    expect(predict(0)).toBeCloseTo(-2.7);
    expect(predict(0)).toBe(0);
    expect(predict(100)).toBe(100);
    expect(predict(101, 2)).toBe(101);
    expect(predict(101.5) - 101.5).toBeLessThanOrEqual(3);
  });

  it("disables speculation for save-data and slow links, preserving actual demand", () => {
    expect(canPredictDetail()).toBe(true);
    expect(canPredictDetail({ effectiveType: "4g", downlink: 10 })).toBe(true);
    expect(canPredictDetail({ saveData: true })).toBe(false);
    expect(canPredictDetail({ effectiveType: "3g" })).toBe(false);
    expect(canPredictDetail({ downlink: 0.8 })).toBe(false);
    const motion = new LodMotion();
    const out = { x: 0, y: 0, z: 0 };
    motion.predict({ x: 0, y: 0, z: 0 }, 0.1, false, out);
    motion.predict({ x: 0.3, y: 0, z: 0 }, 0.1, false, out);
    expect(out.x).toBe(0.3);
  });

  it("serves demand first and keeps a stable count/byte-bounded speculative set across ticks", () => {
    const order: number[] = [];
    const requests: LodRequest[] = Array.from({ length: 10 }, (_, i) => ({
      bytes: 20 * 1024 * 1024,
      requiredBytes: i === 9 ? 20 * 1024 * 1024 : 0,
      speculative: i !== 9,
      priority: i,
      accept: vi.fn(() => order.push(i)),
      cancel: vi.fn(),
      release: vi.fn(),
    }));
    scheduleLodRequests(requests, 320 * 1024 * 1024);
    expect(order).toEqual([9, 0, 1, 2]);
    order.length = 0;
    scheduleLodRequests(requests, 320 * 1024 * 1024);
    expect(order).toEqual([9, 0, 1, 2]);
    order.length = 0;
    scheduleLodRequests(requests, 180 * 1024 * 1024);
    expect(order).toEqual([9, 0, 1]);
  });

  it("releases lower-priority display pins before new loads and leaves room for a replacement", () => {
    const order: string[] = [];
    const requests: LodRequest[] = Array.from({ length: 4 }, (_, i) => ({
      bytes: 80 * 1024 * 1024,
      requiredBytes: 80 * 1024 * 1024,
      speculative: false,
      priority: i,
      accept: () => order.push(`load-${i}`),
      cancel: vi.fn(),
      release: () => order.push(`release-${i}`),
    }));
    scheduleLodRequests(requests, 320 * 1024 * 1024);
    expect(order).toEqual(["release-2", "release-3", "load-0", "load-1"]);
  });

  it("keeps current detail when an unaffordable prediction is declined", () => {
    const request: LodRequest = {
      bytes: 100 * 1024 * 1024,
      requiredBytes: 20 * 1024 * 1024,
      speculative: true,
      priority: 0,
      accept: vi.fn(),
      cancel: vi.fn(),
      release: vi.fn(),
    };
    scheduleLodRequests([request], 320 * 1024 * 1024);
    expect(request.accept).not.toHaveBeenCalled();
    expect(request.release).not.toHaveBeenCalled();
    expect(request.cancel).toHaveBeenCalledOnce();
  });
});
