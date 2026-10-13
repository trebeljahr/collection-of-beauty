import { describe, expect, it } from "vitest";
import { CANVAS_FACE_Z, FRAME_SLOTS, profileWidth, scaleProfile } from "./frame-profiles";
import {
  buildStyle,
  FRAME_STYLE_IDS,
  type FrameStyleId,
  type StyleOptions,
  styleChoices,
  swollenWidth,
} from "./frame-styles";

/** Every structural alternate of a style, with its first and its last
 *  ornament on each member. Of a long list of details (the print mat's
 *  sixteen) it takes the ends and one of each kind. */
function optionsOf(id: FrameStyleId): StyleOptions[] {
  const c = styleChoices(id);
  const details = [...new Set([0, 1, 5, 10, c.details - 1].filter((d) => d < c.details))];
  const out: StyleOptions[] = [];
  for (let variant = 0; variant < c.variants; variant++) {
    for (const detail of details) {
      for (const pick of [0, -1]) {
        out.push({
          sight: c.sight.at(pick) ?? null,
          field: c.field.at(pick) ?? null,
          crown: c.crown.at(pick) ?? null,
          variant,
          detail,
        });
      }
    }
  }
  return out;
}

/** Every cross-section a style is made of: its mitred moulding and
 *  its rails. */
function sections(id: FrameStyleId, options: StyleOptions) {
  const style = buildStyle(id, options);
  return [style.profile, ...style.rails.map((rail) => rail.profile)].filter((s) => s.length > 0);
}

describe("frame styles", () => {
  it.each(FRAME_STYLE_IDS)("%s clears the canvas and ends on the wall", (id) => {
    for (const options of optionsOf(id)) {
      const all = sections(id, options);
      expect(all.length).toBeGreaterThan(0);
      for (const profile of all) {
        if (profile[0].o < 0) {
          // A lip must sit in front of the canvas face or it z-fights it.
          expect(profile[0].z).toBeGreaterThan(CANVAS_FACE_Z + 0.002);
        } else if (profile[0].o === 0) {
          // No lip (a floater): the section starts at the canvas edge,
          // just behind its face.
          expect(profile[0].z).toBeLessThan(CANVAS_FACE_Z);
        } else {
          // A bar that stands clear of the canvas starts on the wall.
          expect(profile[0].z).toBeLessThan(0.01);
        }
        // It ends on (just off) the wall, at its widest.
        const last = profile[profile.length - 1];
        expect(last.z).toBeLessThan(0.01);
        expect(last.z).toBeGreaterThan(0);
        expect(last.o).toBeCloseTo(profileWidth(profile), 9);
      }
    }
  });

  it.each(FRAME_STYLE_IDS)("%s is one clean outline", (id) => {
    // Each rule is asserted once for the style, on the point of all its
    // sections that comes nearest to breaking it. An `expect` per point
    // was 4,000 calls for the print mat. A NaN is kept once met, so it
    // fails its rule.
    let shortest = Infinity;
    let shortestAt = "";
    let topSlot = -Infinity;
    let topSlotAt = "";
    let lowest = Infinity;
    let lowestAt = "";
    let fold = Infinity;
    let foldAt = "";
    optionsOf(id).forEach((options, n) => {
      sections(id, options).forEach((profile, s) => {
        const at = (i: number) =>
          `${id} variant ${options.variant} detail ${options.detail} (options ${n}), section ${s}, point ${i}`;
        for (let i = 0; i < profile.length - 1; i++) {
          const a = profile[i];
          const b = profile[i + 1];
          const length = Math.hypot(b.o - a.o, b.z - a.z);
          if (length < shortest || Number.isNaN(length)) {
            shortest = length;
            shortestAt = at(i);
          }
          const slot = a.slot ?? 0;
          if (slot > topSlot || Number.isNaN(slot)) {
            topSlot = slot;
            topSlotAt = at(i);
          }
          if (a.z < lowest || Number.isNaN(a.z)) {
            lowest = a.z;
            lowestAt = at(i);
          }
        }
        // How far each point stays ahead of a bead's width behind the
        // furthest reach before it.
        let reach = profile[0].o;
        profile.forEach((pt, i) => {
          const ahead = pt.o - (reach - 0.016);
          if (ahead < fold || Number.isNaN(ahead)) {
            fold = ahead;
            foldAt = at(i);
          }
          reach = Math.max(reach, pt.o);
        });
      });
    });
    // No doubled point: a zero-length segment has no normal.
    expect(shortest, shortestAt).toBeGreaterThan(1e-5);
    expect(topSlot, topSlotAt).toBeLessThan(FRAME_SLOTS);
    // Nothing reaches behind the wall or sits on it.
    expect(lowest, lowestAt).toBeGreaterThanOrEqual(0.004);
    // A moulding does not fold back over itself by more than a bead.
    expect(fold, `${foldAt} folds back`).toBeGreaterThan(0);
  });

  it("keeps the lip in front of the canvas when cut small", () => {
    for (const id of FRAME_STYLE_IDS) {
      for (const profile of sections(id, optionsOf(id)[0])) {
        if (profile[0].o >= 0) continue;
        const small = scaleProfile(profile, styleChoices(id).scale[0] * 0.9);
        expect(small[0].z).toBeGreaterThan(CANVAS_FACE_Z);
      }
    }
  });

  it("builds a combination once", () => {
    const options = optionsOf("leafTorus")[0];
    expect(buildStyle("leafTorus", options)).toBe(buildStyle("leafTorus", { ...options }));
  });

  it("carves the ornament it is given", () => {
    const options = { ...optionsOf("leafTorus")[0], field: "acanthus" as const, crown: null };
    const bands = new Set(buildStyle("leafTorus", options).profile.map((pt) => pt.band));
    expect(bands.has("acanthus")).toBe(true);
    expect(bands.has("laurel")).toBe(false);
  });

  it("counts a swell in the frame's reach", () => {
    const swept = buildStyle("swept", optionsOf("swept")[0]);
    expect(swept.swell).not.toBeNull();
    const plain = profileWidth(swept.profile);
    expect(swept.width).toBeCloseTo(swollenWidth(plain, swept.swell), 12);
    expect(swept.width).toBeGreaterThan(plain * 1.1);
    expect(swept.width).toBeLessThan(plain * 1.4);
    const straight = buildStyle("empire", optionsOf("empire")[0]);
    expect(straight.swell).toBeNull();
    expect(straight.width).toBe(profileWidth(straight.profile));
  });

  it("stays wide enough to budget for and narrow enough to hang a wall of", () => {
    for (const id of FRAME_STYLE_IDS) {
      for (const options of optionsOf(id)) {
        const { width } = buildStyle(id, options);
        const [lo, hi] = styleChoices(id).scale;
        expect(width * lo).toBeGreaterThan(0.009);
        expect(width * hi, id).toBeLessThan(0.21);
      }
    }
  });

  it("sets a liner inside the mouldings that take one", () => {
    const options = optionsOf("empire")[0];
    const plain = buildStyle("empire", options);
    const lined = buildStyle("empire", { ...options, liner: 0.03 });
    expect(lined.width).toBeCloseTo(plain.width + 0.03, 12);
    // The liner is slot 1, flat, and lower than the lip that rises from it.
    expect(lined.profile[0].slot).toBe(1);
    expect(lined.profile[2].z).toBeLessThan(lined.profile[3].z);
    expect(lined.profile.slice(3).every((pt) => pt.slot !== 1)).toBe(true);
    // A swell and a corner block move out with the moulding.
    const swept = buildStyle("swept", optionsOf("swept")[0]);
    const sweptLined = buildStyle("swept", { ...optionsOf("swept")[0], liner: 0.02 });
    expect(sweptLined.swell?.pivot).toBeCloseTo((swept.swell?.pivot ?? 0) + 0.02, 12);
    // A style that has its own inner member takes none.
    const print = buildStyle("print", optionsOf("print")[0]);
    expect(buildStyle("print", { ...optionsOf("print")[0], liner: 0.03 }).width).toBe(print.width);
  });

  it("gives a mitred frame one reach all round and a railed one three", () => {
    const empire = buildStyle("empire", optionsOf("empire")[0]);
    expect(empire.extents).toEqual({ side: empire.width, top: empire.width, bottom: empire.width });
    expect(empire.rails).toEqual([]);

    const tabernacle = buildStyle("tabernacle", optionsOf("tabernacle")[0]);
    expect(tabernacle.profile).toEqual([]);
    expect(tabernacle.rails.map((r) => r.side).sort()).toEqual(["bottom", "left", "right", "top"]);
    // Entablature above, plinth below, and both run past the pilasters.
    expect(tabernacle.extents.top).toBeGreaterThan(tabernacle.extents.bottom);
    expect(tabernacle.extents.bottom).toBeGreaterThan(tabernacle.extents.side);
    const pilaster = tabernacle.rails.find((r) => r.side === "left");
    expect(tabernacle.extents.side).toBeGreaterThan(profileWidth(pilaster?.profile ?? []));
    expect(tabernacle.width).toBe(tabernacle.extents.side);

    // An Oxford frame's bars run on past the corners, the same all round.
    const oxford = buildStyle("oxford", optionsOf("oxford")[0]);
    expect(oxford.extents.top).toBeCloseTo(oxford.extents.side, 12);
    expect(oxford.extents.side).toBeGreaterThan(profileWidth(oxford.profile) + 0.03);
  });

  it("puts blocks on the corners of the styles that have them", () => {
    const first = optionsOf("empire")[0];
    expect(buildStyle("empire", { ...first, variant: 0 }).blocks).toBeNull();
    const blocked = buildStyle("empire", { ...first, variant: 1 });
    expect(blocked.blocks?.lift).toBeGreaterThan(0);
    expect(blocked.frontZ).toBeGreaterThan(buildStyle("empire", { ...first, variant: 0 }).frontZ);
  });
});
