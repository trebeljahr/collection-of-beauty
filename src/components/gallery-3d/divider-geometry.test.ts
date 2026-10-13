import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CellRect, Divider } from "@/lib/gallery-layout/types";
import { attachedEnds, buildDividerGeometry } from "./divider-geometry";
import { SKIRTING_CAP_PROUD, SKIRTING_HEIGHT } from "./skirting-geometry";

const ROOM: CellRect = { xMin: 0, xMax: 8, zMin: 0, zMax: 4 };
const WING: Divider = { axis: "z", line: 3, start: 0, end: 1 };
const PANEL: Divider = { axis: "x", line: 2, start: 4, end: 7 };

function box(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
}

describe("attachedEnds", () => {
  it("tells a wing wall's built-in end from its free one", () => {
    expect(attachedEnds(WING, ROOM)).toEqual({ start: true, end: false });
    expect(attachedEnds({ ...WING, start: 4, end: 5 }, ROOM)).toEqual({ start: false, end: true });
    expect(attachedEnds(PANEL, ROOM)).toEqual({ start: false, end: false });
  });
});

describe("buildDividerGeometry", () => {
  it("returns nothing for a room without dividers", () => {
    expect(buildDividerGeometry([], ROOM, 0, 4.2)).toBeNull();
  });

  it("builds a wall 0.4 m thick, from the floor to the ceiling", () => {
    const g = buildDividerGeometry([PANEL], ROOM, 12.24, 5.4);
    const b = box((g as NonNullable<typeof g>).wall);
    expect(b.min.x).toBeCloseTo(10, 4);
    expect(b.max.x).toBeCloseTo(17.5, 4);
    expect(b.min.z).toBeCloseTo(5 - 0.2, 4);
    expect(b.max.z).toBeCloseTo(5 + 0.2, 4);
    expect(b.min.y).toBeCloseTo(12.24, 4);
    expect(b.max.y).toBeCloseTo(12.24 + 5.4, 4);
  });

  it("finishes a free end and leaves a built-in one open", () => {
    const quads = (d: Divider) => {
      const g = buildDividerGeometry([d], ROOM, 0, 4.2);
      return (g as NonNullable<typeof g>).wall.getAttribute("position").count / 4;
    };
    // Two faces, plus one end for the wing wall and two for the panel.
    expect(quads(WING)).toBe(3);
    expect(quads(PANEL)).toBe(4);
  });

  it("runs the skirting round a free end and stops it at the room wall", () => {
    const g = buildDividerGeometry([WING], ROOM, 0, 4.2);
    const b = box((g as NonNullable<typeof g>).skirting);
    expect(b.min.z).toBeCloseTo(0, 4);
    expect(b.max.z).toBeCloseTo(2.5 + SKIRTING_CAP_PROUD, 4);
    expect(b.min.x).toBeCloseTo(7.5 - 0.2 - SKIRTING_CAP_PROUD, 4);
    expect(b.max.x).toBeCloseTo(7.5 + 0.2 + SKIRTING_CAP_PROUD, 4);
    expect(b.min.y).toBeCloseTo(0, 4);
    expect(b.max.y).toBeCloseTo(SKIRTING_HEIGHT, 4);
  });

  it("gives its faces UVs in metres, like the room walls", () => {
    const g = buildDividerGeometry([PANEL], ROOM, 0, 4.2);
    const uv = (g as NonNullable<typeof g>).wall.getAttribute("uv");
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < uv.count; i++) {
      maxU = Math.max(maxU, uv.getX(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    expect(maxU).toBeCloseTo(7.5, 4);
    expect(maxV).toBeCloseTo(4.2, 4);
  });

  it("faces each side outward", () => {
    const g = buildDividerGeometry([PANEL], ROOM, 0, 4.2);
    const { wall } = g as NonNullable<typeof g>;
    const pos = wall.getAttribute("position");
    const normal = wall.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      // A vertex on the south face (z above the line) looks south.
      if (Math.abs(normal.getZ(i)) > 0.5) {
        expect(Math.sign(normal.getZ(i))).toBe(Math.sign(pos.getZ(i) - 5));
      }
    }
  });

  it("has no screen geometry for walls that hang both faces", () => {
    const g = buildDividerGeometry([WING, PANEL], ROOM, 0, 4.2);
    expect((g as NonNullable<typeof g>).screen).toBeNull();
  });

  it("builds a door screen's back as its own face, turned to the door", () => {
    for (const [divider, axis] of [
      [{ ...PANEL, bare: "low" }, "z"],
      [{ ...PANEL, bare: "high" }, "z"],
      [{ axis: "z", line: 2, start: 1.5, end: 3.5, bare: "low" }, "x"],
      [{ axis: "z", line: 2, start: 1.5, end: 3.5, bare: "high" }, "x"],
    ] as Array<[Divider, "x" | "z"]>) {
      const g = buildDividerGeometry([divider], ROOM, 0, 4.2);
      const { wall, screen } = g as NonNullable<typeof g>;
      // The hung face and two ends stay with the plaster.
      expect(wall.getAttribute("position").count / 4).toBe(3);
      const back = screen as THREE.BufferGeometry;
      const pos = back.getAttribute("position");
      const normal = back.getAttribute("normal");
      expect(pos.count / 4).toBe(1);
      const out = divider.bare === "high" ? 1 : -1;
      const across = axis === "z" ? pos.getZ(0) : pos.getX(0);
      const facing = axis === "z" ? normal.getZ(0) : normal.getX(0);
      expect(across).toBeCloseTo(5 + out * 0.2, 4);
      expect(facing).toBeCloseTo(out, 4);
    }
  });
});
