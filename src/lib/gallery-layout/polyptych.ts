// A diptych or triptych photographed as one object: how its panels hang.
//
// The scan is one image and stays one texture. Its panels are rectangles
// of it (`Artwork.panels`, from metadata/scan-crops.json); what lies
// between them in the scan (the frames between the panels, or a white
// ground) is not drawn. Each panel hangs in a frame of its own, the
// work's frame cut for that panel's size, and the frames touch, as the
// frames of an altarpiece's wings meet at their hinges.
//
// The group takes the wall the hang gave the work as a whole: its width
// with its frame on both sides. The panels are scaled together so their
// canvases and frames fit there and no panel is taller than the work's
// canvas, and they keep the heights and the vertical offsets they have
// in the scan.
//
// No three.js here: the hang and the tests read it.

import type { ScanPanel } from "@/lib/data";

export type PanelPlacement = {
  /** Centre of the panel's canvas in the work's own frame, metres
   *  (x right, y up, the work's centre at 0). */
  x: number;
  y: number;
  /** Size of the panel's canvas, metres. */
  w: number;
  h: number;
  /** The panel's rectangle of the texture: u0, v0, u1, v1, v up. */
  uv: [number, number, number, number];
};

/**
 * Lay out a polyptych's panels for a work hung `widthM` × `heightM`.
 * `reach(w, h)` is how far the work's frame reaches to each side of a
 * canvas of that size.
 */
export function layoutPanels(
  panels: readonly ScanPanel[],
  widthM: number,
  heightM: number,
  reach: (w: number, h: number) => number,
): PanelPlacement[] {
  const room = widthM + 2 * reach(widthM, heightM);
  const fw = panels.map((p) => p.x1 - p.x0);
  const fh = panels.map((p) => p.y1 - p.y0);
  const sumW = fw.reduce((a, b) => a + b, 0);
  const tallest = Math.max(...fh);
  // A panel's frame depends on its size, its size on the scale: three
  // rounds settle it to well under a millimetre.
  let s = 1;
  let reaches = panels.map(() => 0);
  for (let round = 0; round < 3; round++) {
    reaches = panels.map((_, i) => reach(fw[i] * widthM * s, fh[i] * heightM * s));
    const frames = reaches.reduce((a, r) => a + 2 * r, 0);
    s = Math.min((room - frames) / (sumW * widthM), 1 / tallest);
  }
  reaches = panels.map((_, i) => reach(fw[i] * widthM * s, fh[i] * heightM * s));

  const total = panels.reduce((a, _, i) => a + fw[i] * widthM * s + 2 * reaches[i], 0);
  let cursor = -total / 2;
  return panels.map((p, i) => {
    const w = fw[i] * widthM * s;
    const h = fh[i] * heightM * s;
    const x = cursor + reaches[i] + w / 2;
    cursor += w + 2 * reaches[i];
    return {
      x,
      y: -((p.y0 + p.y1) / 2 - 0.5) * heightM * s,
      w,
      h,
      uv: [p.x0, 1 - p.y1, p.x1, 1 - p.y0],
    };
  });
}
