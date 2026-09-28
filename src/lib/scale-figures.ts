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

/** Woman standing with her arms folded, in the manner of an architect's
 *  scale figure: long hair over her left shoulder, a knee-length coat,
 *  feet a little apart. 175 cm tall, in cm. No face or other detail. */
export const PERSON_SHAPE = { w: 40.6, h: 175 } as const;

/** Clockwise from the top of the head, as [cm from the left edge, cm
 *  below the top of the head]. */
// biome-ignore format: one row per stretch of the outline
export const PERSON_POINTS: readonly Point[] = [
  // Head, and the hair falling over her left shoulder (the viewer's right).
  [20.8, 0], [24.8, 0.8], [27.7, 3.4], [29.1, 7.4], [29.3, 12], [29, 17], [29.4, 21.5],
  [30.2, 25], [31, 27.4, 1],
  // Shoulder, the folded arm's elbow, then the coat down to its hem.
  [33.7, 29.1], [36.6, 31], [38.2, 34.3], [38.8, 40], [39.1, 47], [39.7, 55], [40.2, 61],
  [39.5, 65.4], [37.4, 67.4], [35.4, 70.5], [34.7, 80], [35.2, 92], [36, 108], [36.8, 122],
  [37.2, 131.8, 1], [32.4, 133.1], [28.4, 133.6], [27.6, 133.8, 1],
  // Her left leg and shoe.
  [28, 140], [27.8, 147], [26.6, 156], [25.4, 164], [25.8, 168], [27.4, 171], [28.6, 173.4],
  [28.4, 175, 1], [21.4, 175, 1], [21, 172.6], [21.3, 168], [21.1, 164], [21, 156], [20.9, 148],
  [21.2, 140], [20.3, 134.4, 1],
  // Her right leg and shoe.
  [19.4, 140], [19.6, 148], [19.2, 156], [18.7, 164], [18.6, 168], [18.8, 172.5],
  [18.9, 175, 1], [11.4, 175, 1], [11.2, 173.4], [12.4, 171], [14, 168.4], [14.4, 164],
  [13.3, 156], [12.6, 147], [12.8, 140], [13.4, 134, 1],
  // Hem, coat and elbow up to the shoulder.
  [9.6, 133.3], [5, 131.5, 1], [5.4, 122], [6, 108], [6.6, 92], [7, 80], [5.9, 70.5],
  [3.8, 67.2], [1.2, 65.2], [0.4, 60], [0.9, 53], [1.4, 46], [1.9, 39], [2.9, 33.8],
  [5.2, 30.8], [7.8, 28.9],
  // Neck and jaw on the side where the hair is tucked behind.
  [10.6, 27.6], [13.2, 26.2], [14, 24.2], [13.9, 21.8], [13, 19.6], [12.2, 16.4], [11.9, 12],
  [12.4, 7.2], [13.9, 3.4], [16.7, 0.8],
];
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
