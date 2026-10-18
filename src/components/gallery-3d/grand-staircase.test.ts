import { act, createRoot, extend } from "@react-three/fiber";
import { createElement, type ReactNode } from "react";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildGrandStair, type GrandStairDesign } from "@/lib/gallery-layout/grand-stair";
import { FLOOR_SEPARATION } from "@/lib/gallery-layout/world-coords";
import { buildStair, GrandStaircase } from "./grand-staircase";

const DESIGNS: GrandStairDesign[] = ["loggia", "court"];
const HALF = 13.75;
/** A loggia's end wall stands three cells inside its square, on its
 *  landings' far edge, as in the block plan. */
const backOf = (design: GrandStairDesign) => (design === "loggia" ? HALF - 7.5 : HALF);

/** The stair of one storey of a hall four floors high. */
function stairOf(design: GrandStairDesign, storey: number) {
  return buildGrandStair({
    id: `${design}-${storey}`,
    design,
    lowerFloor: storey,
    upperFloor: storey + 1,
    topFloor: design === "court" ? 3 : storey + 1,
    lowerLabel: "",
    upperLabel: "",
    lowerY: storey * FLOOR_SEPARATION,
    upperY: (storey + 1) * FLOOR_SEPARATION,
    centerX: 0,
    centerZ: 0,
    half: HALF,
    back: backOf(design),
    turns: 0,
    hasFlightBelow: storey > 0,
    hasFlightAbove: storey < 2,
  });
}

describe("grand stair geometry", () => {
  // A hall's walls are planes on its lines, and the room behind draws
  // its own on the same line. A loggia's galleries end in a balustrade
  // that runs to the side wall, and the post at that end is centred on
  // the wall: half of it stood in the long gallery next door.
  it("draws nothing outside its hall", () => {
    let furthest = Number.NEGATIVE_INFINITY;
    let where = "";
    for (const design of DESIGNS) {
      for (const storey of [0, 1, 2]) {
        const built = buildStair(stairOf(design, storey));
        for (const [name, geometry] of Object.entries(built)) {
          if (!geometry) continue;
          const at = geometry.getAttribute("position");
          for (let i = 0; i < at.count; i++) {
            // How far past the nearest wall: positive is outside.
            const reach = Math.max(
              Math.abs(at.getX(i)) - HALF,
              at.getZ(i) - HALF,
              -at.getZ(i) - backOf(design),
            );
            if (reach > furthest || Number.isNaN(reach)) {
              furthest = reach;
              where = `${design}, storey ${storey}, ${name}, vertex ${i}`;
            }
          }
          geometry.dispose();
        }
      }
    }
    expect(furthest, where).toBeLessThan(0);
  });

  it("indexes complete triangles with matching vertex attributes", () => {
    const invalid: string[] = [];
    let indexedSurfaces = 0;
    for (const design of DESIGNS) {
      const built = buildStair(stairOf(design, 0));
      try {
        for (const [name, geometry] of Object.entries(built)) {
          // Solid surfaces carry vertex colours; globes and glow use separate builders.
          if (!geometry?.getAttribute("color")) continue;
          indexedSurfaces++;
          const label = `${design}, ${name}`;
          const position = geometry.getAttribute("position");
          const index = geometry.getIndex();
          if (!index || index.count === 0 || index.count % 3 !== 0) {
            invalid.push(`${label}: missing index or incomplete triangle`);
            continue;
          }
          if (
            Object.values(geometry.attributes).some(
              (attribute) => attribute.count !== position.count,
            )
          ) {
            invalid.push(`${label}: attribute counts differ`);
            continue;
          }
          for (const attribute of Object.values(geometry.attributes)) {
            if (
              attribute.array.byteOffset !== 0 ||
              attribute.array.byteLength !== attribute.array.buffer.byteLength
            ) {
              invalid.push(`${label}: attribute retains unused backing storage`);
            }
          }
          for (let i = 0; i < index.count; i++) {
            const vertex = index.getX(i);
            if (!Number.isInteger(vertex) || vertex < 0 || vertex >= position.count) {
              invalid.push(`${label}: invalid index ${vertex} at ${i}`);
              break;
            }
          }
        }
      } finally {
        for (const geometry of Object.values(built)) geometry?.dispose();
      }
    }
    expect(indexedSurfaces).toBeGreaterThan(0);
    expect(invalid).toEqual([]);
  });

  it("keeps indices attached through geometry disposal and rebuilds them on remount", async () => {
    // Use the installed reconciler without a browser or GPU, as in static-transform.test.tsx.
    extend({ Group: THREE.Group, Mesh: THREE.Mesh });
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const root = createRoot({} as HTMLCanvasElement);
    const renderer = { render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn() };
    const stair = stairOf("loggia", 0);
    let scene: THREE.Scene;
    const render = async (children: ReactNode) => {
      await act(async () => {
        scene = root.render(children).getState().scene;
      });
    };
    const geometries = () => {
      const result: THREE.BufferGeometry[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) result.push(object.geometry);
      });
      return result;
    };
    const observeDisposal = (owned: THREE.BufferGeometry[]) =>
      owned.map((geometry) => {
        const record = {
          geometry,
          index: geometry.getIndex(),
          disposed: 0,
          indexAtDispose: null as THREE.BufferAttribute | null,
        };
        geometry.addEventListener("dispose", () => {
          record.disposed++;
          record.indexAtDispose = geometry.getIndex();
        });
        return record;
      });
    try {
      await root.configure({
        gl: renderer as unknown as THREE.WebGLRenderer,
        frameloop: "never",
        size: { width: 100, height: 100, top: 0, left: 0 },
        dpr: 1,
      });
      await render(createElement(GrandStaircase, { stair }));
      const first = observeDisposal(geometries());
      const solids = first.filter(({ geometry }) => geometry.hasAttribute("color"));
      expect(solids.length).toBeGreaterThan(0);
      expect(solids.every(({ index }) => index !== null)).toBe(true);

      await render(createElement(GrandStaircase, { stair }));
      expect(geometries().map((geometry) => geometry.uuid)).toEqual(
        first.map(({ geometry }) => geometry.uuid),
      );
      expect(
        first.every(
          ({ geometry, index, disposed }) => geometry.getIndex() === index && disposed === 0,
        ),
      ).toBe(true);

      await render(null);
      expect(geometries()).toEqual([]);
      expect(
        first.every(
          ({ index, disposed, indexAtDispose }) => disposed === 1 && indexAtDispose === index,
        ),
      ).toBe(true);

      await render(createElement(GrandStaircase, { stair }));
      const second = observeDisposal(geometries());
      const previousGeometry = new Set(first.map(({ geometry }) => geometry));
      const previousIndex = new Set(first.map(({ index }) => index));
      const previousBuffers = new Set(
        first.flatMap(({ geometry }) =>
          Object.values(geometry.attributes).map((attribute) => attribute.array.buffer),
        ),
      );
      expect(second.length).toBeGreaterThan(0);
      expect(second.every(({ geometry }) => !previousGeometry.has(geometry))).toBe(true);
      expect(
        second.every(({ geometry }) =>
          Object.values(geometry.attributes).every(
            (attribute) => !previousBuffers.has(attribute.array.buffer),
          ),
        ),
      ).toBe(true);
      expect(
        second
          .filter(({ geometry }) => geometry.hasAttribute("color"))
          .every(({ index }) => index !== null && !previousIndex.has(index)),
      ).toBe(true);
      await render(null);
      expect(
        second.every(
          ({ index, disposed, indexAtDispose }) => disposed === 1 && indexAtDispose === index,
        ),
      ).toBe(true);
      expect(renderer.render).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
