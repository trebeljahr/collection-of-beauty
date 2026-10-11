// Where a room's laylights go. One glazed panel fills the ceiling,
// inset from the walls so the picture lights have plain ceiling to hang
// from. A divider tall enough to reach the ceiling needs the same
// margin on both its faces, so the panel is cut wherever one stands
// under it: the room ends up with one laylight per bay or, in a hall
// with panels, one down the nave.
//
// Pure geometry, so it is testable without a renderer. laylight.tsx
// draws the rectangles this returns.

import { dividerRect, type Rect } from "@/lib/gallery-layout/fittings";
import type { CellRect, Divider } from "@/lib/gallery-layout/types";
import { CELL_SIZE } from "@/lib/gallery-layout/world-coords";
import {
  LIGHT_CEILING_DROP,
  LIGHT_MAX_THROW,
  LIGHT_MIN_THROW,
  LIGHT_TILT_DEG,
} from "./painting-light-rig";

/** Clear ceiling left between a panel and the room's walls. The picture
 *  lights hang in this margin (LIGHT_MAX_THROW is 2.0 m). */
export const LAYLIGHT_MARGIN_M = 2.6;
/** A panel narrower than this in either direction is not built. */
export const LAYLIGHT_MIN_PANEL_M = 2.4;
/** Ceiling a picture light's can and the panel's frame need between
 *  them, beyond the can's throw. */
const CAN_CLEARANCE = 0.3;
/** Height of the eye line the lights are aimed at (place-paintings'
 *  CANONICAL_Y_CENTER_OFFSET). */
const AIM_HEIGHT = 1.65;

/** How far from its wall a picture light hangs under a ceiling of this
 *  height. Mirrors `fitHead` in painting-light-rig.ts for a work on the
 *  eye line. */
function lightThrow(ceilingHeight: number): number {
  const drop = ceilingHeight - LIGHT_CEILING_DROP - AIM_HEIGHT;
  return Math.min(
    LIGHT_MAX_THROW,
    Math.max(LIGHT_MIN_THROW, drop * Math.tan((LIGHT_TILT_DEG * Math.PI) / 180)),
  );
}

/** Laylight panels for a room, as world rectangles. */
export function laylightPanels(room: {
  cellBounds: CellRect;
  ceilingHeight: number;
  dividers: readonly Divider[];
}): Rect[] {
  const b = room.cellBounds;
  let panels: Rect[] = [
    {
      xMin: b.xMin * CELL_SIZE + LAYLIGHT_MARGIN_M,
      xMax: (b.xMax + 1) * CELL_SIZE - LAYLIGHT_MARGIN_M,
      zMin: b.zMin * CELL_SIZE + LAYLIGHT_MARGIN_M,
      zMax: (b.zMax + 1) * CELL_SIZE - LAYLIGHT_MARGIN_M,
    },
  ];

  const reach = lightThrow(room.ceilingHeight) + CAN_CLEARANCE;
  for (const divider of room.dividers) {
    const wall = dividerRect(divider);
    // The strip of ceiling the divider and the lights on both its
    // faces take up.
    const keep: Rect =
      divider.axis === "x"
        ? { ...wall, zMin: wall.zMin - reach, zMax: wall.zMax + reach }
        : { ...wall, xMin: wall.xMin - reach, xMax: wall.xMax + reach };
    panels = panels.flatMap((p) => {
      const apart =
        keep.xMin >= p.xMax || keep.xMax <= p.xMin || keep.zMin >= p.zMax || keep.zMax <= p.zMin;
      if (apart) return [p];
      // Cut right across the panel, so what is left is two rectangles.
      return divider.axis === "x"
        ? [
            { ...p, zMax: keep.zMin },
            { ...p, zMin: keep.zMax },
          ]
        : [
            { ...p, xMax: keep.xMin },
            { ...p, xMin: keep.xMax },
          ];
    });
  }

  return panels.filter(
    (p) => p.xMax - p.xMin >= LAYLIGHT_MIN_PANEL_M && p.zMax - p.zMin >= LAYLIGHT_MIN_PANEL_M,
  );
}
