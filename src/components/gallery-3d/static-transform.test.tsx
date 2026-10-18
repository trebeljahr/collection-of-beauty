import { act, createRoot, extend } from "@react-three/fiber";
import { type ReactNode, useEffect, useState } from "react";
import * as THREE from "three";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { staticTransform } from "./static-transform";

extend({ Group: THREE.Group, Mesh: THREE.Mesh, BoxGeometry: THREE.BoxGeometry });

const roots: ReturnType<typeof createRoot>[] = [];

beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterAll(() => vi.unstubAllGlobals());
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
});

/** Exercise the installed reconciler without a browser or GPU. */
async function mount() {
  const renderer = { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() };
  const root = createRoot({} as HTMLCanvasElement);
  roots.push(root);
  await root.configure({
    gl: renderer as unknown as THREE.WebGLRenderer,
    frameloop: "never",
    size: { width: 100, height: 100, top: 0, left: 0 },
    dpr: 1,
  });
  let scene: THREE.Scene;
  return {
    renderer,
    async render(children: ReactNode) {
      await act(async () => {
        scene = root.render(children).getState().scene;
      });
      return scene!;
    },
  };
}

function expectVector(actual: THREE.Vector3, expected: number[]) {
  actual.toArray().forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index], 8);
  });
}

function expectBounds(object: THREE.Object3D, min: number[], max: number[]) {
  const bounds = new THREE.Box3().setFromObject(object);
  expectVector(bounds.min, min);
  expectVector(bounds.max, max);
}

describe("React-owned static transforms", () => {
  it("makes local transforms available to mount effects before the first render", async () => {
    let mesh: THREE.Mesh | null = null;
    let registered: THREE.Vector3 | undefined;
    function Registration() {
      useEffect(() => {
        registered = mesh!.getWorldPosition(new THREE.Vector3());
      }, []);
      return (
        <group {...staticTransform} position={[5, 2, -4]} rotation={[0, Math.PI / 2, 0]}>
          <mesh
            {...staticTransform}
            ref={(value) => {
              mesh = value;
            }}
            position={[2, 1, 0]}
          >
            <boxGeometry args={[2, 4, 6]} />
          </mesh>
        </group>
      );
    }
    const mounted = await mount();
    await mounted.render(<Registration />);
    expectVector(registered!, [5, 3, -6]);
    expectBounds(mesh!, [2, 1, -7], [8, 5, -5]);
    expect(mounted.renderer.render).not.toHaveBeenCalled();
  });

  it("tracks changed React props and parent movement without recomposing on each scene pass", async () => {
    const mounted = await mount();
    const content = (x: number, angle: number, scale: number) => (
      <group {...staticTransform} name="parent" position={[x, 2, 0]} rotation={[0, angle, 0]}>
        <mesh {...staticTransform} name="work" position={[2, 1, 0]} scale={scale}>
          <boxGeometry args={[2, 2, 2]} />
        </mesh>
      </group>
    );
    const scene = await mounted.render(content(1, 0, 1));
    const parent = scene.getObjectByName("parent")!;
    const work = scene.getObjectByName("work")!;
    expectVector(work.getWorldPosition(new THREE.Vector3()), [3, 3, 0]);
    await mounted.render(content(5, Math.PI / 2, 2));
    expect(scene.getObjectByName("work")).toBe(work);
    expectVector(work.getWorldPosition(new THREE.Vector3()), [5, 3, -2]);
    expectBounds(work, [3, 1, -4], [7, 5, 0]);
    expect(work.matrixWorldAutoUpdate).toBe(true);
    const compose = vi.spyOn(work, "updateMatrix");
    scene.updateMatrixWorld();
    scene.updateMatrixWorld();
    expect(compose).not.toHaveBeenCalled();
    // A moving ancestor still carries a static child, including callers
    // that explicitly update an imperatively changed parent transform.
    parent.position.x = 8;
    parent.updateMatrix();
    scene.updateMatrixWorld();
    expectVector(new THREE.Vector3().setFromMatrixPosition(work.matrixWorld), [8, 3, -2]);
    compose.mockRestore();
  });

  it("handles async child-only layout updates while leaving unowned descendants dynamic", async () => {
    let resize: (height: number) => void = () => {};
    let parentRenders = 0;
    function PlaqueLikeChild() {
      const [height, setHeight] = useState(2);
      useEffect(() => {
        resize = setHeight;
      }, []);
      return (
        <group {...staticTransform} name="plaque" position={[0, 5 - height / 2, 0]}>
          <mesh {...staticTransform} name="plate">
            <boxGeometry args={[2, height, 0.2]} />
          </mesh>
          <mesh name="text-owned-elsewhere" position={[0, 0, 0.2]} />
        </group>
      );
    }
    function Parent() {
      parentRenders++;
      return (
        <group {...staticTransform}>
          <PlaqueLikeChild />
        </group>
      );
    }
    const mounted = await mount();
    const scene = await mounted.render(<Parent />);
    const plaque = scene.getObjectByName("plaque")!;
    const plate = scene.getObjectByName("plate") as THREE.Mesh;
    const initialGeometry = plate.geometry;
    await act(async () => {
      await Promise.resolve().then(() => resize(4));
    });
    expect(parentRenders).toBe(1);
    expect(plaque.matrix.elements[13]).toBe(3);
    expect(plate.geometry).not.toBe(initialGeometry);
    expectVector(plate.getWorldPosition(new THREE.Vector3()), [0, 3, 0]);
    expectBounds(plate, [-1, 1, -0.1], [1, 5, 0.1]);
    const text = scene.getObjectByName("text-owned-elsewhere")!;
    expect(text.matrixAutoUpdate).toBe(true);
    text.position.x = 1;
    scene.updateMatrixWorld();
    expectVector(new THREE.Vector3().setFromMatrixPosition(text.matrixWorld), [1, 3, 0.2]);
  });

  it("updates newly mounted and reconstructed objects after reveal or geometry changes", async () => {
    const mounted = await mount();
    const content = (revealed: boolean, width: number) => (
      <group {...staticTransform} position={[3, 0, -2]}>
        {revealed ? (
          <group {...staticTransform} key="revealed" position={[2, 1, 0]}>
            <mesh {...staticTransform} name="frame">
              <boxGeometry args={[width, 2, 0.2]} />
            </mesh>
          </group>
        ) : (
          <mesh {...staticTransform} key="stand-in" name="stand-in" position={[0, 0, 0.1]} />
        )}
      </group>
    );
    const scene = await mounted.render(content(false, 2));
    expectVector(
      scene.getObjectByName("stand-in")!.getWorldPosition(new THREE.Vector3()),
      [3, 0, -1.9],
    );
    await mounted.render(content(true, 2));
    expect(scene.getObjectByName("stand-in")).toBeUndefined();
    const frame = scene.getObjectByName("frame") as THREE.Mesh;
    expectVector(frame.getWorldPosition(new THREE.Vector3()), [5, 1, -2]);
    const geometry = frame.geometry;
    await mounted.render(content(true, 4));
    expect(frame.geometry).not.toBe(geometry);
    expectBounds(frame, [3, 0, -2.1], [7, 2, -1.9]);
    await mounted.render(content(false, 2));
    expect(scene.getObjectByName("frame")).toBeUndefined();
  });
});
