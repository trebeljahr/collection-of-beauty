import { describe, expect, it } from "vitest";
import { FRAME_WIDTH, hangLayout, WALL_COLOURS, wallPalette } from "./wall-layout";
import { wallFrameBoxes, wallPictureBoxes, wallSvg } from "./wall-svg";

const RATIOS = [1.572, 0.512, 1.279, 0.665, 1.27];
const layout = hangLayout(RATIOS, 0);

describe("wallPictureBoxes", () => {
  it.each([1, 2])("sits every picture inside its frame, inset by the moulding, at %ix", (scale) => {
    const frames = wallFrameBoxes(layout, scale);
    const border = FRAME_WIDTH * scale;
    for (const [n, picture] of wallPictureBoxes(layout, scale).entries()) {
      const frame = frames[n];
      expect(picture.index).toBe(frame.index);
      expect(picture.x - frame.x).toBe(border);
      expect(picture.y - frame.y).toBe(border);
      expect(frame.x + frame.w - (picture.x + picture.w)).toBe(border);
      expect(frame.y + frame.h - (picture.y + picture.h)).toBe(border);
    }
  });
});

describe("wallSvg", () => {
  it("has a viewBox the size of its pixels, so the page can scale it", () => {
    const svg = wallSvg(layout, wallPalette(WALL_COLOURS.navy.base), 2);
    const size = `${layout.width * 2} ${layout.height * 2}`;
    expect(svg).toContain(`viewBox="0 0 ${size}"`);
    expect(svg).toContain(`stop-color="${WALL_COLOURS.navy.base}"`);
  });
});
