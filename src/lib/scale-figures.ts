// Outlines of the reference objects in the scale view (components/
// artwork-scale.tsx). Each is one filled silhouette, traced through a list
// of points by a closed Catmull-Rom spline, so a proportion can be changed
// by moving a point instead of editing Bézier handles. The path strings
// are built once, at module load.
//
// The boxes here are the drawings' bounding boxes. `scaleReferenceFor()`
// in real-size.ts gives the same boxes in cm, and scale-figures.test.ts
// holds the two together: the layout places the box, so a drawing wider
// than its box would spill into the gap beside the work.

/** [x, y] or [x, y, 1]; a point flagged 1 is a corner, with no tangent
 *  carried through it. */
type Point = readonly [number, number] | readonly [number, number, 1];

const num = (v: number) => String(Math.round(v * 10) / 10);

/** Closed centripetal Catmull-Rom spline through `points`, as SVG cubic
 *  Béziers. Centripetal, because the outlines mix long straight runs with
 *  tight turns (fingertips, the armpit, the feet), and the uniform
 *  variant overshoots wherever neighbouring points are unevenly spaced. */
export function splinePath(points: readonly Point[]): string {
  const n = points.length;
  // Square root of the chord length: the centripetal parameterisation.
  const span = (a: Point, b: Point) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5);
  let d = `M${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const d1 = span(p0, p1);
    const d2 = span(p1, p2);
    const d3 = span(p2, p3);
    const handle = (a: Point, b: Point, c: Point, da: number, db: number) =>
      [0, 1].map(
        (k) =>
          (da * da * c[k] - db * db * a[k] + (2 * da * da + 3 * da * db + db * db) * b[k]) /
          (3 * da * (da + db)),
      );
    const c1 = p1[2] ? p1 : handle(p0, p1, p2, d1, d2);
    const c2 = p2[2] ? p2 : handle(p3, p2, p1, d3, d2);
    d += `C${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p2[0])} ${num(p2[1])}`;
  }
  return `${d}Z`;
}

// ── Figure ──────────────────────────────────────────────────────────────

/** Standing adult, front view, arms at the sides, in cm. Proportions of
 *  a 7.5-head figure: 175 tall, head 23 from crown to chin, shoulders 46
 *  across the deltoids and hips 34, crotch 80 cm and fingertips 73 cm
 *  above the floor, knees together and feet a little apart. No face,
 *  hair or clothing. */
export const PERSON_SHAPE = { w: 50, h: 175 } as const;

/** Right half, clockwise from the top of the head to the crotch, as
 *  [distance from the centre line, depth below the top of the head]. */
// biome-ignore format: one row per stretch of the outline
const PERSON_HALF: readonly Point[] = [
  // Crown, the ear, the jaw.
  [0, 0], [4.2, 1.4], [6.6, 4.0], [7.7, 7.0], [7.9, 9.8],
  [8.1, 11.4], [8.2, 13.4], [7.7, 15.4], [7.1, 17.2], [6.3, 19.4], [5.9, 21.2],
  // Neck, trapezius, shoulder.
  [6.0, 23.0], [6.2, 25.0], [7.6, 26.6], [11.2, 27.9], [15.6, 29.3], [19.3, 30.8],
  [21.5, 32.7], [22.6, 35.8], [22.9, 40],
  // Outside of the arm, the hand, then the inside of the arm up to the armpit.
  [22.8, 46], [22.7, 53], [22.7, 61], [23.3, 69], [23.9, 78], [24.2, 84],
  [24.5, 89], [24.6, 95], [24.0, 99.6], [22.6, 102.2], [21.1, 101.4], [20.2, 97.5],
  [19.9, 92], [20.1, 87.5], [20.2, 84],
  [19.7, 77], [18.9, 69], [18.3, 62], [17.8, 54], [17.4, 46], [16.9, 40.8, 1],
  // Chest, waist, hip.
  [16.6, 44], [16.4, 49], [15.9, 56], [15.3, 63], [15.4, 69.5], [16.1, 76.5], [16.9, 84],
  [17.1, 90], [16.6, 99],
  // Outside of the leg, the foot, then the inside of the leg up to the crotch.
  [15.7, 108], [14.5, 117], [13.4, 124], [13.1, 130], [13.3, 137], [12.6, 146], [11.5, 155],
  [10.4, 161], [10.1, 164.6], [9.8, 167.6], [10.9, 170.4], [12.2, 172.8], [12.6, 174.3],
  [12.2, 175, 1], [3.6, 175, 1], [3.1, 173.8], [3.3, 171], [3.9, 167.8], [4.3, 164],
  [3.9, 158], [3.1, 150], [2.6, 141], [2.7, 133], [2.1, 125], [1.8, 117], [1.6, 108],
  [1.2, 100], [0, 95.2, 1],
];

function mirrored(half: readonly Point[], centre: number): Point[] {
  const right = half.map(([x, y, c]) => (c ? [centre + x, y, c] : [centre + x, y]) as Point);
  // The first and last points are on the centre line and shared.
  const left = half
    .slice(1, -1)
    .reverse()
    .map(([x, y, c]) => (c ? [centre - x, y, c] : [centre - x, y]) as Point);
  return [...right, ...left];
}

export const PERSON_POINTS = mirrored(PERSON_HALF, PERSON_SHAPE.w / 2);
export const PERSON_PATH = splinePath(PERSON_POINTS);

// ── Hand ────────────────────────────────────────────────────────────────

/** Open right hand, palm out, fingers up, thumb spread, in mm: 190 from
 *  the wrist to the tip of the middle finger. */
export const HAND_SHAPE = { w: 116, h: 190 } as const;

/** One finger from its base to its tip and back: left side up, a half
 *  circle over the tip, right side down. (bx, by) is the middle of the
 *  base, (tx, ty) the tip, r half the finger's width. */
function finger(bx: number, by: number, tx: number, ty: number, r: number): Point[] {
  const len = Math.hypot(tx - bx, ty - by);
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  const at = (along: number, side: number): Point => [
    bx + ux * along - uy * side,
    by + uy * along + ux * side,
  ];
  const centre = len - r;
  // Evenly spaced points up each side and round the tip. Catmull-Rom
  // overshoots where a long straight run meets a tight curve, so the side
  // gets a point half a radius short of the arc.
  const side = (s: number) =>
    [0, 0.4, 0.75, 1 - (0.45 * r) / centre, 1].map((q) => at(q * centre, s * r));
  const arc = [30, 60, 90, 120, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return at(centre + r * Math.sin(a), -r * Math.cos(a));
  });
  return [...side(-1), ...arc, ...side(1).reverse()];
}

// biome-ignore format: one row per stretch of the outline
export const HAND_POINTS: readonly Point[] = [
  // Heel of the thumb, the thumb, and the web between thumb and index.
  [42, 190, 1], [38.4, 176], [33.6, 162], [26, 148], [17.4, 133], [10.6, 119], [7.6, 107.5],
  [9.6, 99.4], [15.6, 97.2], [21.6, 101], [28, 109], [33.6, 116], [38.4, 121, 1],
  // Fingers, fanning out slightly, each followed by the gap below it.
  ...finger(46.6, 104, 44.2, 21, 8.4), [56.3, 107, 1],
  ...finger(66.2, 102, 66.2, 1.5, 8.8), [76.3, 105, 1],
  ...finger(86.2, 104, 88.2, 12.5, 8.4), [95.9, 110, 1],
  ...finger(103.2, 110, 107.4, 45, 7.2),
  // Outside of the palm down to the wrist.
  [110.4, 124], [109.4, 146], [105.6, 168], [100, 190, 1],
];
export const HAND_PATH = splinePath(HAND_POINTS);
