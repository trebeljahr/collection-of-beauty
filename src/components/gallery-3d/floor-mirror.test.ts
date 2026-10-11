import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createFrameRateGuard,
  hideDistantWorks,
  MIRROR_WORKS_RANGE_M,
  placeFloorMirrorCamera,
  registerMirrorRoom,
} from "./floor-mirror";

const FLOOR_Y = 12.24;

/** A visitor's camera standing on the floor, looking a little down. */
function visitorCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(61, FLOOR_Y + 1.75, 81);
  camera.lookAt(52, FLOOR_Y + 0.6, 74);
  camera.updateMatrixWorld();
  return camera;
}

function uvOf(matrix: THREE.Matrix4, point: THREE.Vector3): THREE.Vector2 {
  const v = new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(matrix);
  return new THREE.Vector2(v.x / v.w, v.y / v.w);
}

describe("placeFloorMirrorCamera", () => {
  it("puts the mirror camera as far below the floor as the visitor is above it", () => {
    const camera = visitorCamera();
    const mirror = new THREE.PerspectiveCamera();
    expect(placeFloorMirrorCamera(camera, FLOOR_Y, mirror, new THREE.Matrix4())).toBe(true);
    expect(mirror.position.x).toBeCloseTo(61, 6);
    expect(mirror.position.y).toBeCloseTo(FLOOR_Y - 1.75, 6);
    expect(mirror.position.z).toBeCloseTo(81, 6);
  });

  it("shows a point on the wall where its reflection meets the floor", () => {
    const camera = visitorCamera();
    const mirror = new THREE.PerspectiveCamera();
    const uvMatrix = new THREE.Matrix4();
    placeFloorMirrorCamera(camera, FLOOR_Y, mirror, uvMatrix);

    // A point on a painting, and the floor point a ray from the eye to
    // the painting's mirror image passes through. The floor shader looks
    // the image up at the floor point's uv; the painting has to be there.
    const painting = new THREE.Vector3(50.2, FLOOR_Y + 1.9, 76);
    const image = painting.clone().setY(2 * FLOOR_Y - painting.y);
    const eye = camera.position;
    const t = (eye.y - FLOOR_Y) / (eye.y - image.y);
    const floorPoint = eye.clone().lerp(image, t);
    expect(floorPoint.y).toBeCloseTo(FLOOR_Y, 6);

    const atFloor = uvOf(uvMatrix, floorPoint);
    const atPainting = uvOf(uvMatrix, painting);
    expect(atFloor.x).toBeCloseTo(atPainting.x, 5);
    expect(atFloor.y).toBeCloseTo(atPainting.y, 5);
    expect(atFloor.x).toBeGreaterThan(0);
    expect(atFloor.x).toBeLessThan(1);
    expect(atFloor.y).toBeGreaterThan(0);
    expect(atFloor.y).toBeLessThan(1);
  });

  it("clips everything under the floor out of the mirror image", () => {
    const camera = visitorCamera();
    const mirror = new THREE.PerspectiveCamera();
    placeFloorMirrorCamera(camera, FLOOR_Y, mirror, new THREE.Matrix4());
    const clipZ = (point: THREE.Vector3) => {
      const v = new THREE.Vector4(point.x, point.y, point.z, 1)
        .applyMatrix4(mirror.matrixWorldInverse)
        .applyMatrix4(mirror.projectionMatrix);
      return v.z / v.w;
    };
    // Inside the near plane is ndc z > -1.
    expect(clipZ(new THREE.Vector3(52, FLOOR_Y + 1.5, 74))).toBeGreaterThan(-1);
    expect(clipZ(new THREE.Vector3(52, FLOOR_Y + 0.01, 74))).toBeGreaterThan(-1);
    // The floor itself, the pools 2 mm above it and the storey below.
    expect(clipZ(new THREE.Vector3(52, FLOOR_Y, 74))).toBeLessThan(-1);
    expect(clipZ(new THREE.Vector3(52, FLOOR_Y + 0.002, 74))).toBeLessThan(-1);
    expect(clipZ(new THREE.Vector3(52, FLOOR_Y - 3, 74))).toBeLessThan(-1);
  });

  it("declines when the camera is under the floor", () => {
    const camera = visitorCamera();
    camera.position.y = FLOOR_Y - 2;
    camera.updateMatrixWorld();
    const mirror = new THREE.PerspectiveCamera();
    mirror.position.set(1, 2, 3);
    expect(placeFloorMirrorCamera(camera, FLOOR_Y, mirror, new THREE.Matrix4())).toBe(false);
    expect(mirror.position.toArray()).toEqual([1, 2, 3]);
  });
});

describe("hideDistantWorks", () => {
  const room = (xMin: number, y = FLOOR_Y) => ({
    works: new THREE.Group(),
    xMin,
    xMax: xMin + 10,
    zMin: 0,
    zMax: 10,
    y,
  });

  it("keeps the works of the visitor's room and of a room just through a door", () => {
    const here = room(0);
    const next = room(10.2);
    const far = room(20.4);
    const below = room(0, FLOOR_Y - 6.12);
    const unregister = [here, next, far, below].map(registerMirrorRoom);
    const hidden: THREE.Object3D[] = [];

    // Standing 2 m from the wall shared with `next`.
    hideDistantWorks(8, 5, FLOOR_Y, hidden);
    expect(here.works.visible).toBe(true);
    expect(next.works.visible).toBe(true);
    expect(far.works.visible).toBe(false);
    expect(below.works.visible).toBe(false);
    expect(hidden).toEqual([far.works, below.works]);

    // Across the room, `next` is out of range as well.
    for (const works of hidden) works.visible = true;
    hidden.length = 0;
    hideDistantWorks(10 - MIRROR_WORKS_RANGE_M - 1, 5, FLOOR_Y, hidden);
    expect(here.works.visible).toBe(true);
    expect(next.works.visible).toBe(false);

    for (const off of unregister) off();
  });

  it("leaves alone a group that was already hidden, and forgets a room once unregistered", () => {
    const far = room(40);
    const gone = room(60);
    far.works.visible = false;
    const unregisterFar = registerMirrorRoom(far);
    registerMirrorRoom(gone)();
    const hidden: THREE.Object3D[] = [];
    hideDistantWorks(5, 5, FLOOR_Y, hidden);
    // Not reported, so the caller will not switch it back on.
    expect(hidden).toEqual([]);
    expect(gone.works.visible).toBe(true);
    unregisterFar();
  });
});

describe("createFrameRateGuard", () => {
  /** Feed `seconds` of frames `dt` long; true if the guard ends tripped. */
  const run = (guard: ReturnType<typeof createFrameRateGuard>, dt: number, seconds: number) => {
    let tripped = false;
    for (let t = 0; t < seconds; t += dt) tripped = guard.sample(dt);
    return tripped;
  };

  it("stays quiet at 60 and at 50 frames a second", () => {
    expect(run(createFrameRateGuard(), 1 / 60, 60)).toBe(false);
    expect(run(createFrameRateGuard(), 1 / 50, 60)).toBe(false);
  });

  it("trips when a 60 Hz screen keeps missing frames, and stays tripped", () => {
    const guard = createFrameRateGuard();
    expect(run(guard, 1 / 44, 4)).toBe(false);
    expect(run(guard, 1 / 44, 1)).toBe(true);
    expect(run(guard, 1 / 60, 10)).toBe(true);
  });

  it("trips as fast at 6 frames a second", () => {
    expect(run(createFrameRateGuard(), 1 / 6, 5.5)).toBe(true);
  });

  it("forgives a slow stretch that recovers", () => {
    const guard = createFrameRateGuard();
    for (let i = 0; i < 10; i++) {
      run(guard, 1 / 30, 3.2);
      expect(run(guard, 1 / 60, 1.6)).toBe(false);
    }
  });

  it("does not count the hitches of a loading room", () => {
    const guard = createFrameRateGuard();
    // A 120 ms upload stall every sixth frame, for a minute.
    for (let i = 0; i < 2400; i++) guard.sample(i % 6 === 0 ? 0.12 : 1 / 60);
    expect(guard.sample(1 / 60)).toBe(false);
  });

  it("does not count the long frame after a hidden tab comes back", () => {
    const guard = createFrameRateGuard();
    for (let i = 0; i < 20; i++) {
      guard.sample(45);
      run(guard, 1 / 60, 0.5);
    }
    expect(guard.sample(1 / 60)).toBe(false);
  });
});
