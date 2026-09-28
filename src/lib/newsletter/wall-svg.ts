// The wall as SVG: spotlight gradient, shadows and empty frames. Pure, no
// sharp import. The email's JPEG (wall-image.ts) rasterises it and
// composites the works into the frames; the edition page inlines it and
// lays the works over it as <picture> elements. Both draw from this one
// function, so the page header and the email header can't drift apart.

import { FRAME_WIDTH, type HangLayout, type WallPalette } from "./wall-layout";

/** A box in device pixels at some scale. `index` points into the issue's works. */
export type WallBox = { index: number; x: number; y: number; w: number; h: number };

/** Outer box of every frame at `scale`. Edges are rounded, not sizes, so
 *  a frame and the picture inside it land on the same pixel grid. */
export function wallFrameBoxes(layout: HangLayout, scale: number): WallBox[] {
  const px = (v: number) => Math.round(v * scale);
  return layout.frames.map((f) => ({
    index: f.index,
    x: px(f.x),
    y: px(f.y),
    w: px(f.x + f.width) - px(f.x),
    h: px(f.y + f.height) - px(f.y),
  }));
}

/** Where each work goes: its frame's box minus the frame moulding. */
export function wallPictureBoxes(layout: HangLayout, scale: number): WallBox[] {
  const border = Math.round(FRAME_WIDTH * scale);
  return wallFrameBoxes(layout, scale).map((f) => ({
    index: f.index,
    x: f.x + border,
    y: f.y + border,
    w: f.w - 2 * border,
    h: f.h - 2 * border,
  }));
}

/**
 * The wall and its empty frames, `layout.width * scale` wide. The
 * viewBox matches the pixel size, so a browser can scale it to any width.
 */
export function wallSvg(layout: HangLayout, palette: WallPalette, scale: number): string {
  const width = layout.width * scale;
  const height = layout.height * scale;

  // The gradient must reach the base colour before the bottom edge:
  // centred at 10% of the height, radius 85% of the height (1.6x wider).
  const cy = height * 0.1;
  const r = height * 0.85;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="wall-light" gradientUnits="userSpaceOnUse" cx="${width / 2}" cy="${cy}" r="${r}"
      gradientTransform="translate(${width / 2} ${cy}) scale(1.6 1) translate(${-width / 2} ${-cy})">
      <stop offset="0" stop-color="${palette.spot}"/>
      <stop offset="1" stop-color="${palette.base}"/>
    </radialGradient>
    <filter id="wall-shadow-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${9 * scale}"/></filter>
    <filter id="wall-shadow-tight" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${1 * scale}"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wall-light)"/>
  ${wallFrameBoxes(layout, scale)
    .map((f) => frameSvg(f, scale))
    .join("\n")}
</svg>`;
}

const FRAME_COLOUR = "#17140f";

/** A soft drop shadow, a tight contact shadow, then the frame itself. */
function frameSvg(f: WallBox, scale: number): string {
  const box = `x="${f.x}" width="${f.w}" height="${f.h}"`;
  return [
    `<rect ${box} y="${f.y + 8 * scale}" fill="#000" fill-opacity="0.45" filter="url(#wall-shadow-soft)"/>`,
    `<rect ${box} y="${f.y + 1 * scale}" fill="#000" fill-opacity="0.4" filter="url(#wall-shadow-tight)"/>`,
    `<rect ${box} y="${f.y}" fill="${FRAME_COLOUR}"/>`,
  ].join("\n");
}
