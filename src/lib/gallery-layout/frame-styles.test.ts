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

describe("frame styles", () => {
  it.each(FRAME_STYLE_IDS)("%s clears the canvas and ends on the wall", (id) => {
    for (const options of optionsOf(id)) {
      const { profile } = buildStyle(id, options);
      if (profile[0].o < 0) {
        // A lip must sit in front of the canvas face or it z-fights it.
        expect(profile[0].z).toBeGreaterThan(CANVAS_FACE_Z + 0.002);
      } else {
        // No lip (a floater): the profile starts at the canvas edge, just
        // behind its face.
        expect(profile[0].o).toBe(0);
        expect(profile[0].z).toBeLessThan(CANVAS_FACE_Z);
      }
      // The frame ends on (just off) the wall, at its widest.
      const last = profile[profile.length - 1];
      expect(last.z).toBeLessThan(0.01);
      expect(last.z).toBeGreaterThan(0);
      expect(last.o).toBeCloseTo(profileWidth(profile), 9);
    }
  });

  it.each(FRAME_STYLE_IDS)("%s is one clean outline", (id) => {
    for (const options of optionsOf(id)) {
      const { profile } = buildStyle(id, options);
      for (let i = 0; i < profile.length - 1; i++) {
        const a = profile[i];
        const b = profile[i + 1];
        // No doubled point: a zero-length segment has no normal.
        expect(Math.hypot(b.o - a.o, b.z - a.z), `${id} point ${i}`).toBeGreaterThan(1e-5);
        expect(a.slot ?? 0).toBeLessThan(FRAME_SLOTS);
        // Nothing reaches behind the wall or sits on it.
        expect(a.z).toBeGreaterThanOrEqual(0.004);
      }
      // A moulding does not fold back over itself by more than a bead.
      let reach = profile[0].o;
      for (const pt of profile) {
        expect(pt.o, `${id} folds back`).toBeGreaterThan(reach - 0.016);
        reach = Math.max(reach, pt.o);
      }
    }
  });

  it("keeps the lip in front of the canvas when cut small", () => {
    for (const id of FRAME_STYLE_IDS) {
      const { profile } = buildStyle(id, optionsOf(id)[0]);
      if (profile[0].o >= 0) continue;
      const small = scaleProfile(profile, styleChoices(id).scale[0] * 0.9);
      expect(small[0].z).toBeGreaterThan(CANVAS_FACE_Z);
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
});
