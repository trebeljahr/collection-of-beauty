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

/** Closed Catmull-Rom spline through `points`, as SVG cubic Béziers. */
export function splinePath(points: readonly Point[]): string {
  const n = points.length;
  const k = 1 / 6;
  let d = `M${num(points[0][0])} ${num(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1 = p1[2] ? p1 : [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2 = p2[2] ? p2 : [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${num(c1[0])} ${num(c1[1])} ${num(c2[0])} ${num(c2[1])} ${num(p2[0])} ${num(p2[1])}`;
  }
  return `${d}Z`;
}

// ── Figure ──────────────────────────────────────────────────────────────

/** Standing adult, front view, arms at the sides, in cm: 175 tall, head
 *  about one eighth of that, shoulders 44 wide, fingertips 71 cm above
 *  the floor. No face, hair or clothing. */
export const PERSON_SHAPE = { w: 54, h: 175 } as const;

/** Right half, clockwise from the top of the head to the crotch, as
 *  [distance from the centre line, depth below the top of the head]. */
// biome-ignore format: one row per stretch of the outline
const PERSON_HALF: readonly Point[] = [
  [0, 0], [4.9, 1.2], [7.3, 4.9], [7.8, 10.3], [7.0, 15.6], [6.0, 19.3], [5.7, 22.2],
  // Neck and shoulder.
  [6.0, 25.3], [9.9, 27.7], [15.9, 29.5], [20.3, 31.7], [22.2, 35.9],
  // Outside of the arm, the hand, then the inside of the arm up to the armpit.
  [22.8, 44], [23.4, 54], [24.0, 63], [24.7, 73], [25.2, 83],
  [25.9, 88.5], [26.2, 95], [25.5, 100.8], [23.7, 103.6], [21.9, 102.3], [21.0, 97],
  [20.8, 90], [20.7, 85], [20.2, 76], [19.4, 65], [18.5, 54], [17.3, 45], [16.1, 40.2, 1],
  // Chest, waist, hip.
  [15.6, 45], [14.8, 55], [13.9, 65], [14.6, 73], [16.4, 81], [17.0, 89], [16.6, 98],
  // Outside of the leg, the foot, then the inside of the leg up to the crotch.
  [15.3, 110], [13.4, 122], [13.6, 132], [12.3, 146], [10.0, 158.5], [9.2, 165],
  [10.0, 169.8], [11.3, 172.9], [11.1, 175, 1], [3.1, 175, 1], [2.8, 171.4], [3.4, 165.5],
  [3.5, 150], [4.5, 138], [4.0, 125], [3.0, 112], [1.8, 100], [0, 94.5, 1],
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
