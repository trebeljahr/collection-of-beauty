// A diptych or triptych photographed as one object: how its panels hang.
//
// The scan is one image and stays one texture. Its panels are rectangles
// of it (`Artwork.polyptych`, from metadata/scan-crops.json); what lies
// between them in the scan (the frames between the panels, or a white
// ground) is not drawn. Each panel hangs in a frame of its own, as its
// museum frames it: at the panel's real size, in a frame of the recorded
// width, the frames touching where the wings are hinged and apart where
// two pictures hang side by side.
//
// The hang measures the whole as one work (`polyptychSize`): the panels,
// the frames and gaps between them, and its own frame on either side.
// When it scales a work down to fit a room, the panels, frames and gaps
// scale with it.
//
// No three.js here: the hang and the tests read it.

import type { Polyptych } from "@/lib/data";

export type PanelPlacement = {
  /** Centre of the panel's canvas in the work's own frame, metres
   *  (x right, y up, the work's centre at 0). */
  x: number;
  y: number;
  /** Size of the panel's canvas, metres. */
  w: number;
  h: number;
  /** How far its frame reaches past the canvas, metres. */
  reach: number;
  /** The panel's rectangle of the texture: u0, v0, u1, v1, v up. */
  uv: [number, number, number, number];
};

/** What the hang treats as the work's canvas, cm: from the left edge of
 *  the first panel to the right edge of the last, with the frames and
 *  gaps between, and as tall as the tallest panel. The outer frames are
 *  the work's frame (`frameCm`). */
export function polyptychSize(p: Polyptych): { wCm: number; hCm: number } {
  const n = p.panels.length;
  const panels = p.panels.reduce((a, q) => a + q.wCm, 0);
  return {
    wCm: panels + (n - 1) * (2 * p.frameCm + p.gapCm),
    hCm: Math.max(...p.panels.map((q) => q.hCm)),
  };
}

/** Lay out a polyptych hung `widthM` wide (as `polyptychSize` measures
 *  it): panels centred on one line, left to right. */
export function layoutPanels(p: Polyptych, widthM: number): PanelPlacement[] {
  const s = widthM / (polyptychSize(p).wCm / 100);
  const reach = (p.frameCm / 100) * s;
  const gap = (p.gapCm / 100) * s;
  let cursor = -widthM / 2;
  return p.panels.map((q) => {
    const w = (q.wCm / 100) * s;
    const x = cursor + w / 2;
    cursor += w + 2 * reach + gap;
    return {
      x,
      y: 0,
      w,
      h: (q.hCm / 100) * s,
      reach,
      uv: [q.x0, 1 - q.y1, q.x1, 1 - q.y0],
    };
  });
}
