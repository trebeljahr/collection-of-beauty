// Layout for the scale view on /artwork/[id]: where the work, its frame
// and its reference object sit, in cm. ArtworkViewer turns these numbers
// into percentages of the hero frame; kept out of the component so vitest
// can reach it.

import type { RealSize, ScaleReference } from "@/lib/real-size";

/** Centre height for a hung work. Museums hang at 145–152 cm (57–60 in)
 *  to the centre; 150 is the middle of that range. A work whose frame
 *  would reach below the floor stands on the floor instead. */
export const HANG_CENTRE_CM = 150;

/** Space between the frame and the reference, as a share of the
 *  reference's width: 24 cm beside the figure, 7 cm beside the hand. */
export const GAP_PER_REFERENCE_WIDTH = 0.6;

/** Empty space above the taller object, as a share of its height. */
export const HEADROOM = 0.05;

/** The frame round the work: a moulding with a mat inside it, the 404
 *  wall's frame (globals.css) drawn to scale. Each is a share of the
 *  work's long edge, so a print and an altarpiece look framed alike,
 *  and capped, so a 10 m canvas does not gain a metre of frame. The
 *  shares are about twice the 404 wall's: at the 404's, the moulding
 *  round a 36 cm print beside the figure is 3 px wide. */
export const MOULDING_SHARE = 0.04;
export const MOULDING_MAX_CM = 8;
export const MAT_SHARE = 0.05;
export const MAT_MAX_CM = 10;

export type Box = {
  /** Left edge, cm from the scene's left. */
  x: number;
  /** Bottom edge, cm above the floor. */
  y: number;
  w: number;
  h: number;
};

export type Scene = {
  width: number;
  height: number;
  work: Box;
  /** The mat's outer edge, where the moulding starts. */
  mat: Box;
  /** The moulding's outer edge. */
  frame: Box;
  ref: Box;
  /** Too tall to hang at centre height, so drawn on the floor. */
  standsOnFloor: boolean;
};

/** The framed work on the left, the reference on the right, both in cm.
 *  Beside the figure the work hangs at museum height; beside the hand
 *  both rest on the same baseline. */
export function layoutScene(size: RealSize, reference: ScaleReference): Scene {
  const longEdge = Math.max(size.widthCm, size.heightCm);
  const moulding = Math.min(MOULDING_SHARE * longEdge, MOULDING_MAX_CM);
  const matWidth = Math.min(MAT_SHARE * longEdge, MAT_MAX_CM);
  const border = moulding + matWidth;
  const gap = GAP_PER_REFERENCE_WIDTH * reference.widthCm;
  const hung = reference.kind === "person";
  const hangBottom = HANG_CENTRE_CM - size.heightCm / 2;
  const workBottom = hung ? Math.max(border, hangBottom) : border;
  const work: Box = { x: border, y: workBottom, w: size.widthCm, h: size.heightCm };
  const mat = grow(work, matWidth);
  const frame = grow(work, border);
  const ref: Box = {
    x: frame.x + frame.w + gap,
    y: 0,
    w: reference.widthCm,
    h: reference.heightCm,
  };
  const contentHeight = Math.max(frame.y + frame.h, ref.h);
  return {
    width: ref.x + ref.w,
    height: contentHeight * (1 + HEADROOM),
    work,
    mat,
    frame,
    ref,
    standsOnFloor: hung && hangBottom < border,
  };
}

function grow(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by };
}
