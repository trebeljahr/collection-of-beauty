// Layout for the scale view on /artwork/[id]: where the work and its
// reference object sit, in cm. ArtworkViewer turns these numbers into
// percentages of the hero frame; kept out of the component so vitest can
// reach it.

import type { RealSize, ScaleReference } from "@/lib/real-size";

/** Centre height for a hung work. Museums hang at 145–152 cm (57–60 in)
 *  to the centre; 150 is the middle of that range. A work taller than
 *  twice this would reach below the floor, so it stands on the floor. */
export const HANG_CENTRE_CM = 150;

/** Space between the work and the reference, as a share of the
 *  reference's width: 32 cm beside the figure, ~13 cm beside A4. */
export const GAP_PER_REFERENCE_WIDTH = 0.6;

/** Empty space above the taller object, as a share of its height. */
export const HEADROOM = 0.05;

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
  ref: Box;
  /** Too tall to hang at centre height, so drawn on the floor. */
  standsOnFloor: boolean;
};

/** The work on the left, the reference on the right, both in cm. Beside
 *  the figure the work hangs at museum height; beside a sheet or a hand
 *  both rest on the same baseline. */
export function layoutScene(size: RealSize, reference: ScaleReference): Scene {
  const gap = GAP_PER_REFERENCE_WIDTH * reference.widthCm;
  const hung = reference.kind === "person";
  const workBottom = hung ? Math.max(0, HANG_CENTRE_CM - size.heightCm / 2) : 0;
  const work: Box = { x: 0, y: workBottom, w: size.widthCm, h: size.heightCm };
  const ref: Box = { x: size.widthCm + gap, y: 0, w: reference.widthCm, h: reference.heightCm };
  const contentHeight = Math.max(work.y + work.h, ref.h);
  return {
    width: ref.x + ref.w,
    height: contentHeight * (1 + HEADROOM),
    work,
    ref,
    standsOnFloor: hung && size.heightCm > 2 * HANG_CENTRE_CM,
  };
}
