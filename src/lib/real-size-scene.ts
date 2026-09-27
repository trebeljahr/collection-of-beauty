// Layout for the scale drawing on /artwork/[id] (components/artwork-scale.tsx):
// where the work and its reference object sit, in cm, and the `sizes` hint
// for the work's image. Kept out of the component so vitest can reach it;
// the component only turns these numbers into percentages and markup.

import type { RealSize, ScaleReference } from "@/lib/real-size";

/** Centre height for a hung work. Museums hang at 145–152 cm (57–60 in)
 *  to the centre; 150 is the middle of that range. A work taller than
 *  twice this would reach below the floor, so it stands on the floor. */
export const HANG_CENTRE_CM = 150;

/** Space between the work and the reference, as a share of the
 *  reference's width: 30 cm beside the figure, ~13 cm beside A4. */
export const GAP_PER_REFERENCE_WIDTH = 0.6;

/** Empty space above the taller object, as a share of its height. */
export const HEADROOM = 0.05;

/** Tallest the scene may render. A 4 m altarpiece at column width would
 *  otherwise be ~800 px tall on a phone; capped, it narrows instead. */
export const SCENE_MAX_HEIGHT_REM = 22;
const REM_PX = 16;

// Page geometry the `sizes` hint depends on. If the artwork page's
// container, grid or the scale frame's padding changes, change these.
/** Page `px-4`, both sides. */
const PAGE_GUTTER_PX = 32;
/** The scale frame's border (2 × 1) and `px-3` (2 × 12). */
const FRAME_CHROME_PX = 26;
/** Tailwind `md`: from here the page is two columns. */
const MD_BREAKPOINT_PX = 768;
/** `max-w-6xl`, padding included (border-box). */
const CONTAINER_MAX_PX = 1152;
/** `gap-8` between the two columns. */
const GRID_GAP_PX = 32;
/** `md:grid-cols-[1.3fr_1fr]`: the aside is 1 of 2.3 fr. */
const GRID_FR_TOTAL = 2.3;
/** Widest the scene gets: (1152 − 32 − 32) / 2.3 − 26 ≈ 447 px. */
const DESKTOP_SCENE_MAX_PX =
  (CONTAINER_MAX_PX - PAGE_GUTTER_PX - GRID_GAP_PX) / GRID_FR_TOTAL - FRAME_CHROME_PX;

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

/** Widest the scene may render, in rem, so that its height stays at or
 *  under SCENE_MAX_HEIGHT_REM. */
export function sceneMaxWidthRem(scene: Scene): number {
  return (SCENE_MAX_HEIGHT_REM * scene.width) / scene.height;
}

/** `sizes` for the work box. Its rendered width is the scene's width times
 *  the work's share of it. In each layout band the scene is as wide as the
 *  column until its height reaches the cap, and from there it keeps the
 *  capped width. Written with calc() only: min() inside `sizes` is not
 *  parsed everywhere, and an entry a browser cannot parse is dropped in
 *  favour of 100vw. */
export function workSizes(scene: Scene, work: Box): string {
  const share = work.w / scene.width;
  const k = share.toFixed(4);
  const cappedScenePx = sceneMaxWidthRem(scene) * REM_PX;
  const px = (scenePx: number) => `${Math.max(1, Math.ceil(scenePx * share))}px`;

  // [largest viewport width the entry applies to (null: all wider), size].
  const entries: [number | null, string][] = [];

  // Below md the scene spans the viewport less the page gutter and frame.
  const mobileChrome = PAGE_GUTTER_PX + FRAME_CHROME_PX;
  const mobileCapVw = Math.floor(cappedScenePx + mobileChrome);
  entries.push([
    Math.min(mobileCapVw, MD_BREAKPOINT_PX - 1),
    `calc((100vw - ${mobileChrome}px) * ${k})`,
  ]);
  if (mobileCapVw < MD_BREAKPOINT_PX - 1) entries.push([MD_BREAKPOINT_PX - 1, px(cappedScenePx)]);

  // From md until the container stops growing, the aside is 1/2.3 of the
  // content box.
  const midChrome = PAGE_GUTTER_PX + GRID_GAP_PX;
  const midCapVw = Math.floor((cappedScenePx + FRAME_CHROME_PX) * GRID_FR_TOTAL + midChrome);
  if (midCapVw >= MD_BREAKPOINT_PX) {
    entries.push([
      Math.min(midCapVw, CONTAINER_MAX_PX - 1),
      `calc(((100vw - ${midChrome}px) / ${GRID_FR_TOTAL} - ${FRAME_CHROME_PX}px) * ${k})`,
    ]);
  }

  entries.push([null, px(Math.min(DESKTOP_SCENE_MAX_PX, cappedScenePx))]);

  // Where two neighbours give the same size, the wider one covers both.
  const merged = entries.filter((e, i) => i === entries.length - 1 || e[1] !== entries[i + 1][1]);
  return merged
    .map(([max, size]) => (max === null ? size : `(max-width: ${max}px) ${size}`))
    .join(", ");
}
