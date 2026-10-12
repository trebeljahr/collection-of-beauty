import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { profileWidth } from "@/lib/gallery-layout/frame-profiles";
import {
  buildStyle,
  FRAME_STYLE_IDS,
  type FrameStyleId,
  type StyleOptions,
  styleChoices,
  swollenWidth,
} from "@/lib/gallery-layout/frame-styles";
import { buildFrameGeometry, carvePeriods } from "./frame-geometry";
import { CARVE_ROWS } from "./frame-maps";

const WALL_OFFSET = 0.02;

/** A style with the first ornament of each of its lists. */
function firstOf(id: FrameStyleId, more: Partial<StyleOptions> = {}): StyleOptions {
  const c = styleChoices(id);
  return {
    sight: c.sight[0],
    field: c.field[0],
    crown: c.crown[0],
    variant: 0,
    detail: 0,
    ...more,
  };
}

describe("carvePeriods", () => {
  const half = 0.5;
  const period = 0.047;

  it("starts the ornament at the inner corner and ends on a whole period at the centre", () => {
    expect(carvePeriods(half, half, period)).toBeCloseTo(0, 12);
    expect(carvePeriods(-half, half, period)).toBeCloseTo(0, 12);
    const centre = carvePeriods(0, half, period);
    expect(centre).toBe(Math.round(half / period));
  });

  it("stretches the ornament by less than half a period per half rail", () => {
    const n = carvePeriods(0, half, period);
    expect(Math.abs(n * period - half)).toBeLessThanOrEqual(period / 2);
  });

  it("is mirrored about the rail's centre", () => {
    for (const a of [0.07, 0.31, 0.5, 0.56]) {
      expect(carvePeriods(a, half, period)).toBeCloseTo(carvePeriods(-a, half, period), 12);
    }
  });

  it("runs at the ornament's own pitch in the mitre, whatever the rail's length", () => {
    // 3 cm past the inner corner: the same count on a long and a short
    // rail, which is what lets the carving meet across the joint.
    expect(carvePeriods(half + 0.03, half, period)).toBeCloseTo(-0.03 / period, 12);
    expect(carvePeriods(0.2 + 0.03, 0.2, period)).toBeCloseTo(-0.03 / period, 12);
  });

  it("holds at least one period on a rail shorter than the ornament", () => {
    expect(carvePeriods(0, 0.01, period)).toBe(1);
  });
});

/** The whole frame of a style: moulding, swell, blocks and rails. */
function frameOf(id: FrameStyleId, more: Partial<StyleOptions>, w: number, h: number) {
  const style = buildStyle(id, firstOf(id, more));
  return buildFrameGeometry(style.profile, w, h, WALL_OFFSET, {
    swell: style.swell,
    blocks: style.blocks,
    rails: style.rails,
  });
}

describe("buildFrameGeometry", () => {
  const profile = buildStyle("leafTorus", firstOf("leafTorus")).profile;
  const geom = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET);

  it("wraps the canvas symmetrically and reaches the profile's width", () => {
    geom.computeBoundingBox();
    const box = geom.boundingBox as THREE.Box3;
    const w = profileWidth(profile);
    expect(box.max.x).toBeCloseTo(0.5 + w, 6);
    expect(box.min.x).toBeCloseTo(-0.5 - w, 6);
    expect(box.max.y).toBeCloseTo(0.3 + w, 6);
    expect(box.min.y).toBeCloseTo(-0.3 - w, 6);
    expect(box.min.z).toBeCloseTo(0.004 - WALL_OFFSET, 6);
  });

  it("puts each material slot the moulding uses in its own group", () => {
    const groupsOf = (id: FrameStyleId, more: Partial<StyleOptions> = {}) => {
      const g = frameOf(id, more, 1, 0.6);
      expect(g.groups.reduce((n, group) => n + group.count, 0)).toBe(g.index?.count);
      return g.groups.map((group) => group.materialIndex);
    };
    expect(geom.groups.map((g) => g.materialIndex)).toEqual([0]);
    // A slip, a mat, a silk border, a canvas edge.
    for (const id of ["bolection", "print", "mount", "floater", "watts"] as const) {
      expect(groupsOf(id)).toEqual([0, 1]);
    }
    // Parcel gilding, and a Hogarth frame's two gilt beads round a mat.
    expect(groupsOf("parcel")).toEqual([0, 2]);
    expect(groupsOf("print", { variant: 2 })).toEqual([0, 1, 2]);
    // A liner, a painted tabernacle, a scroll's silk and brocade.
    expect(groupsOf("barbizon", { liner: 0.03 })).toEqual([0, 1]);
    expect(groupsOf("tabernacle", { variant: 1 })).toEqual([0, 2]);
    expect(groupsOf("scroll")).toEqual([0, 1, 2]);
  });

  it.each(FRAME_STYLE_IDS)("winds every face of %s toward its normal", (id) => {
    const c = styleChoices(id);
    for (let variant = 0; variant < c.variants; variant++) {
      const detail = Math.min(1, c.details - 1);
      const g = frameOf(id, { variant, detail }, 0.8, 1.1);
      const pos = g.getAttribute("position");
      const nrm = g.getAttribute("normal");
      const idx = g.index as THREE.BufferAttribute;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c3 = new THREE.Vector3();
      const n = new THREE.Vector3();
      let faces = 0;
      for (let t = 0; t < idx.count; t += 3) {
        a.fromBufferAttribute(pos, idx.getX(t));
        b.fromBufferAttribute(pos, idx.getX(t + 1));
        c3.fromBufferAttribute(pos, idx.getX(t + 2));
        const face = b.clone().sub(a).cross(c3.clone().sub(a));
        if (face.lengthSq() < 1e-16) continue;
        n.fromBufferAttribute(nrm, idx.getX(t));
        expect(face.normalize().dot(n)).toBeGreaterThan(0.2);
        faces++;
      }
      expect(faces).toBeGreaterThan(30);
    }
  });

  it("darkens the hollows of a frame that carries patina", () => {
    const slot = { tint: [1, 1, 1] as const, rough: 1, burnish: 1, wear: 1, carve: 1 };
    const clean = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET, { slots: [slot] });
    const old = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET, {
      slots: [{ ...slot, patina: 1 }],
    });
    const a = clean.getAttribute("color");
    const b = old.getAttribute("color");
    const ao = clean.getAttribute("aFrame");
    let darker = 0;
    for (let i = 0; i < a.count; i++) {
      expect(b.getX(i)).toBeLessThanOrEqual(a.getX(i) + 1e-9);
      // A point in the open keeps its tone; one in a hollow loses some.
      if (ao.getW(i) > 0.96) expect(b.getX(i)).toBeCloseTo(a.getX(i), 6);
      if (b.getX(i) < a.getX(i) - 0.05) darker++;
    }
    expect(darker).toBeGreaterThan(a.count * 0.1);
  });

  it("points carved stretches at their atlas row and leaves the rest ungated", () => {
    const carve = geom.getAttribute("aCarveUv");
    const frame = geom.getAttribute("aFrame");
    const rows = [CARVE_ROWS.pearl, CARVE_ROWS.leaf, CARVE_ROWS.laurel];
    let carved = 0;
    for (let i = 0; i < carve.count; i++) {
      const gate = frame.getY(i);
      if (gate === 0) continue;
      carved++;
      expect(Math.abs(gate)).toBe(1);
      const v = carve.getY(i);
      expect(rows.some((r) => v >= r.v0 - 1e-6 && v <= r.v1 + 1e-6)).toBe(true);
    }
    expect(carved).toBeGreaterThan(0);
    expect(carved).toBeLessThan(carve.count);
  });

  it("carves the two rails of a corner as mirror images across the mitre", () => {
    // Reflecting a point of the top rail in the top-right mitre lands on
    // the right rail. Wherever the first is carved, the second must read
    // the same texel of the atlas.
    const pos = geom.getAttribute("position");
    const carve = geom.getAttribute("aCarveUv");
    const frame = geom.getAttribute("aFrame");
    const carved: number[] = [];
    for (let i = 0; i < pos.count; i++) if (frame.getY(i) !== 0) carved.push(i);
    let checked = 0;
    for (const i of carved) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // In the top-right mitre: past the inner corner on both axes.
      if (!(x > 0.5 + 1e-6 && y > 0.3 + 1e-6)) continue;
      // Mirror in the line through (0.5, 0.3) at 45°.
      const mx = 0.5 + (y - 0.3);
      const my = 0.3 + (x - 0.5);
      const twins = carved.filter(
        (j) =>
          Math.abs(pos.getX(j) - mx) < 1e-6 &&
          Math.abs(pos.getY(j) - my) < 1e-6 &&
          Math.abs(pos.getZ(j) - pos.getZ(i)) < 1e-6 &&
          Math.abs(carve.getY(j) - carve.getY(i)) < 1e-6,
      );
      // Both rails have a vertex there, and every one reads the same u.
      expect(twins.length).toBeGreaterThanOrEqual(2);
      for (const j of twins) expect(carve.getX(j)).toBeCloseTo(carve.getX(i), 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("writes a frame's own tone, polish, wear and carving into its vertices", () => {
    const plain = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET);
    const own = buildFrameGeometry(profile, 1, 0.6, WALL_OFFSET, {
      slots: [{ tint: [0.5, 0.25, 1.5], rough: 2, burnish: 0, wear: 0, carve: 0.5 }],
    });
    const color = own.getAttribute("color");
    const frame = own.getAttribute("aFrame");
    const base = plain.getAttribute("aFrame");
    expect(frame.itemSize).toBe(4);
    for (let i = 0; i < color.count; i += 7) {
      const ao = frame.getW(i);
      expect(ao).toBeCloseTo(base.getW(i), 6);
      expect(color.getX(i)).toBeCloseTo(0.5 * ao, 6);
      expect(color.getY(i)).toBeCloseTo(0.25 * ao, 6);
      expect(color.getZ(i)).toBeCloseTo(1.5 * ao, 6);
      // No burnishing: the roughness multiplier is the finish's alone.
      expect(frame.getX(i)).toBeCloseTo(2, 6);
      expect(frame.getZ(i)).toBe(0);
      expect(Math.abs(frame.getY(i))).toBeCloseTo(Math.abs(base.getY(i)) * 0.5, 6);
    }
  });
});

describe("a swept frame", () => {
  const style = buildStyle("swept", firstOf("swept"));
  const swell = style.swell;
  const plain = profileWidth(style.profile);
  const g = buildFrameGeometry(style.profile, 1.6, 1.2, WALL_OFFSET, { swell });
  const pos = g.getAttribute("position");
  /** Furthest the right rail reaches in a band of y. */
  const reachAt = (y0: number, y1: number) => {
    let x = 0;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y >= y0 && y <= y1) x = Math.max(x, pos.getX(i));
    }
    return x - 0.8;
  };

  it("swells at the corners and the centres and runs straight between", () => {
    if (!swell) throw new Error("swept has a swell");
    const at = (share: number) => swell.pivot + (plain - swell.pivot) * (1 + share);
    g.computeBoundingBox();
    const box = g.boundingBox as THREE.Box3;
    expect(box.max.x - 0.8).toBeCloseTo(swollenWidth(plain, swell), 6);
    expect(box.max.y - 0.6).toBeCloseTo(swollenWidth(plain, swell), 6);
    expect(reachAt(-0.001, 0.001)).toBeCloseTo(at(swell.centre), 6);
    // Where the centre swell ends and where the corner swell begins:
    // the rail between them is one straight stretch.
    expect(reachAt(swell.centreSpan - 0.001, swell.centreSpan + 0.001)).toBeCloseTo(plain, 6);
    expect(reachAt(0.599 - swell.cornerSpan, 0.601 - swell.cornerSpan)).toBeCloseTo(plain, 6);
    expect(reachAt(0.599, 0.8)).toBeCloseTo(at(swell.corner), 6);
  });

  it("leaves the sight edge straight", () => {
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      const y = Math.abs(pos.getY(i));
      // Nothing of the frame lies over the picture beyond the lip.
      expect(x > 0.8 - 0.0065 || y > 0.6 - 0.0065).toBe(true);
    }
  });

  it("carves a shell on the swells in place of the running ornament", () => {
    const carve = g.getAttribute("aCarveUv");
    const frame = g.getAttribute("aFrame");
    const shell = CARVE_ROWS.shell;
    let shells = 0;
    for (let i = 0; i < carve.count; i++) {
      if (frame.getY(i) === 0) continue;
      const v = carve.getY(i);
      if (v >= shell.v0 - 1e-6 && v <= shell.v1 + 1e-6) {
        shells++;
        // Half a tile either side of a centre line or a mitre.
        expect(carve.getX(i)).toBeGreaterThanOrEqual(0);
        expect(carve.getX(i)).toBeLessThanOrEqual(0.5 / shell.repeats + 1e-6);
      }
    }
    expect(shells).toBeGreaterThan(50);
  });

  it("stays light: a few thousand triangles", () => {
    expect((g.index as THREE.BufferAttribute).count / 3).toBeLessThan(5000);
    const straight = buildFrameGeometry(
      buildStyle("empire", firstOf("empire")).profile,
      1.6,
      1.2,
      WALL_OFFSET,
    );
    expect((straight.index as THREE.BufferAttribute).count / 3).toBeLessThan(1200);
  });
});

describe("frames built from rails", () => {
  it("builds a tabernacle frame to its three reaches and closes its ends", () => {
    const style = buildStyle("tabernacle", firstOf("tabernacle"));
    const g = frameOf("tabernacle", {}, 0.8, 1.1);
    g.computeBoundingBox();
    const box = g.boundingBox as THREE.Box3;
    expect(box.max.y - 0.55).toBeCloseTo(style.extents.top, 6);
    expect(-box.min.y - 0.55).toBeCloseTo(style.extents.bottom, 6);
    expect(box.max.x - 0.4).toBeCloseTo(style.extents.side, 6);
    expect(-box.min.x - 0.4).toBeCloseTo(style.extents.side, 6);
    // The entablature is cut square: faces at its ends look along it.
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    let caps = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nrm.getX(i)) === 1 && Math.abs(Math.abs(pos.getX(i)) - box.max.x) < 1e-6) {
        caps++;
      }
    }
    expect(caps).toBeGreaterThan(40);
    // No mitre: nothing of a pilaster lies above the canvas's top edge.
    const pilaster = style.rails.find((r) => r.side === "left");
    expect(pilaster?.past).toBe(0);
  });

  it("hangs a scroll with its roller standing out past the silk", () => {
    const style = buildStyle("scroll", firstOf("scroll"));
    const g = frameOf("scroll", {}, 0.6, 1.4);
    const pos = g.getAttribute("position");
    const silk = style.rails.find((r) => r.side === "left");
    const silkEdge = 0.3 + profileWidth(silk?.profile ?? []);
    let widestBelow = 0;
    let widestBeside = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i));
      if (pos.getY(i) < -0.7 - style.extents.bottom + 0.035) widestBelow = Math.max(widestBelow, x);
      if (Math.abs(pos.getY(i)) < 0.5) widestBeside = Math.max(widestBeside, x);
    }
    expect(widestBeside).toBeCloseTo(silkEdge, 6);
    expect(widestBelow).toBeGreaterThan(silkEdge + 0.02);
  });

  it("crosses the bars of an Oxford frame without sharing a surface", () => {
    const g = frameOf("oxford", {}, 0.5, 0.7);
    const style = buildStyle("oxford", firstOf("oxford"));
    const [top, , left] = style.rails;
    expect(left.side).toBe("left");
    const high = (rail: typeof top) => Math.max(...rail.profile.map((pt) => pt.z));
    expect(high(left)).toBeGreaterThan(high(top) + 0.0015);
    // The bars stand out past the corners both ways.
    g.computeBoundingBox();
    const box = g.boundingBox as THREE.Box3;
    expect(box.max.x - 0.25).toBeCloseTo(style.extents.side, 6);
    expect(box.max.y - 0.35).toBeCloseTo(style.extents.top, 6);
  });
});

describe("corner blocks, ears and panels", () => {
  it("sets a carved block on each corner", () => {
    const style = buildStyle("empire", firstOf("empire", { variant: 1 }));
    const plain = frameOf("empire", { variant: 0 }, 1, 0.8);
    const g = frameOf("empire", { variant: 1 }, 1, 0.8);
    plain.computeBoundingBox();
    g.computeBoundingBox();
    const lift = style.blocks?.lift ?? 0;
    expect((g.boundingBox as THREE.Box3).max.z).toBeCloseTo(
      (plain.boundingBox as THREE.Box3).max.z + lift,
      6,
    );
    // Four blocks of five faces, two triangles a face.
    const tris = (x: THREE.BufferGeometry) => (x.index as THREE.BufferAttribute).count / 3;
    expect(tris(g) - tris(plain)).toBe(40);
    const carve = g.getAttribute("aCarveUv");
    const rosette = CARVE_ROWS.rosette;
    let carved = 0;
    for (let i = 0; i < carve.count; i++) {
      const v = carve.getY(i);
      if (
        g.getAttribute("aFrame").getY(i) !== 0 &&
        v >= rosette.v0 - 1e-6 &&
        v <= rosette.v1 + 1e-6
      ) {
        carved++;
      }
    }
    expect(carved).toBe(16);
  });

  it("steps a Kent frame's corners out square", () => {
    const style = buildStyle("kent", firstOf("kent"));
    const swell = style.swell;
    if (!swell) throw new Error("kent has ears");
    const plain = profileWidth(style.profile);
    const g = frameOf("kent", {}, 1.6, 1.2);
    const pos = g.getAttribute("position");
    const reachAt = (y0: number, y1: number) => {
      let x = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y >= y0 && y <= y1) x = Math.max(x, pos.getX(i));
      }
      return x - 0.8;
    };
    const ear = swell.pivot + (plain - swell.pivot) * (1 + swell.corner);
    expect(style.width).toBeCloseTo(ear, 12);
    // Straight along the rail, full reach all along the ear.
    expect(reachAt(-0.001, 0.001)).toBeCloseTo(plain, 6);
    expect(reachAt(0.6 - swell.cornerSpan - 0.001, 0.6 - swell.cornerSpan + 0.001)).toBeCloseTo(
      plain,
      6,
    );
    // The ear is one flat run: no station between its return and the
    // corner, so nothing is found there.
    expect(reachAt(0.6 - swell.cornerSpan * 0.9, 0.6 - swell.cornerSpan * 0.5)).toBe(-0.8);
    expect(reachAt(0.6 - swell.cornerSpan * 0.941, 0.6 - swell.cornerSpan * 0.939)).toBeCloseTo(
      ear,
      6,
    );
    expect(reachAt(0.599, 0.601)).toBeCloseTo(ear, 6);
  });

  it("carves a panel frame at its corners and centres and nowhere between", () => {
    const style = buildStyle("panel", firstOf("panel", { variant: 0 }));
    const g = frameOf("panel", { variant: 0 }, 1.6, 1.2);
    g.computeBoundingBox();
    // Its outline stays straight.
    expect((g.boundingBox as THREE.Box3).max.x - 0.8).toBeCloseTo(profileWidth(style.profile), 6);
    const carve = g.getAttribute("aCarveUv");
    const frame = g.getAttribute("aFrame");
    const shell = CARVE_ROWS.shell;
    const host = CARVE_ROWS[style.swell?.host ?? "leaf"];
    let shells = 0;
    let running = 0;
    for (let i = 0; i < carve.count; i++) {
      if (frame.getY(i) === 0) continue;
      const v = carve.getY(i);
      if (v >= shell.v0 - 1e-6 && v <= shell.v1 + 1e-6) shells++;
      if (v >= host.v0 - 1e-6 && v <= host.v1 + 1e-6) running++;
    }
    expect(shells).toBeGreaterThan(50);
    expect(running).toBe(0);
    // Variant 1 carves the cushion all along as well.
    const carvedAll = frameOf("panel", { variant: 1 }, 1.6, 1.2);
    const f = carvedAll.getAttribute("aFrame");
    const c = carvedAll.getAttribute("aCarveUv");
    let along = 0;
    for (let i = 0; i < c.count; i++) {
      if (f.getY(i) !== 0 && c.getY(i) >= host.v0 - 1e-6 && c.getY(i) <= host.v1 + 1e-6) along++;
    }
    expect(along).toBeGreaterThan(50);
  });
});
