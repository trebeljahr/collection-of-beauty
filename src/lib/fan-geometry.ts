/**
 * Geometry of a hand of cards fanned about one pivot, for the edition fan
 * on /sub/confirmed. A card is pulled to the top of the hand the way a
 * real one is: it slides out along its own axis until it clears every
 * card lying on it, and only then changes places in the stack. These
 * functions say which cards lie on it and how far "clear" is.
 *
 * Coordinates are screen pixels (y down) with the pivot at the origin.
 */

export type FanCard = {
  /** Clockwise turn about the pivot, in radians. */
  angle: number;
  width: number;
  height: number;
  /** Distance from the pivot up to the card's bottom edge. */
  inset: number;
};

type Point = readonly [number, number];

/**
 * Stacking order of an `n`-card hand: the middle card on top, the rest
 * falling away symmetrically, ties going to the later card as they would
 * in document order. Returns a z-index from 1 to n per card.
 */
export function fanStack(n: number): number[] {
  const middle = (n - 1) / 2;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => Math.abs(b - middle) - Math.abs(a - middle) || a - b,
  );
  const z = new Array<number>(n);
  order.forEach((card, rank) => {
    z[card] = rank + 1;
  });
  return z;
}

/** Corners of a card slid `slide` pixels out along its axis. */
export function cardCorners(card: FanCard, slide = 0): Point[] {
  const cos = Math.cos(card.angle);
  const sin = Math.sin(card.angle);
  const half = card.width / 2;
  const near = card.inset + slide;
  const far = near + card.height;
  // (x, r): across the card, and up its axis away from the pivot.
  const local: Point[] = [
    [-half, near],
    [half, near],
    [half, far],
    [-half, far],
  ];
  return local.map(([x, r]) => [x * cos + r * sin, x * sin - r * cos]);
}

function project(quad: Point[], axis: Point): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [x, y] of quad) {
    const d = x * axis[0] + y * axis[1];
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Whether two rectangles overlap. Touching edges do not count. */
export function rectsOverlap(a: Point[], b: Point[]): boolean {
  // Separating-axis test. A rectangle has two distinct edge normals.
  for (const quad of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const [x0, y0] = quad[i];
      const [x1, y1] = quad[i + 1];
      const axis: Point = [y0 - y1, x1 - x0];
      const [aMin, aMax] = project(a, axis);
      const [bMin, bMax] = project(b, axis);
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

/**
 * The cards lying on card `index` at rest: those between it and the top
 * of the stack, higher in `stack`, that overlap it. Cards on the far side
 * of the top card can touch it too, at the bottom corners, but only
 * underneath the top card, so lifting them would look like a stray twitch.
 */
export function coveringCards(cards: FanCard[], stack: number[], index: number): number[] {
  const top = stack.indexOf(Math.max(...stack));
  const step = Math.sign(top - index);
  if (step === 0) return [];
  const own = cardCorners(cards[index]);
  const covering: number[] = [];
  for (let j = index + step; j !== top + step; j += step) {
    if (stack[j] > stack[index] && rectsOverlap(own, cardCorners(cards[j]))) {
      covering.push(j);
    }
  }
  return covering;
}

/**
 * How far card `index` has to slide out along its axis before it overlaps
 * none of `covering`. `grow` enlarges the covering cards about their
 * bottom edge, as the lift does, so the slide clears them lifted too.
 */
export function clearance(cards: FanCard[], index: number, covering: number[], grow = 1): number {
  if (covering.length === 0) return 0;
  const obstacles = covering.map((j) => {
    const c = cards[j];
    return cardCorners({ ...c, width: c.width * grow, height: c.height * grow });
  });
  const blocked = (slide: number) =>
    obstacles.some((quad) => rectsOverlap(cardCorners(cards[index], slide), quad));
  // Once the card's bottom edge is further from the pivot than every
  // obstacle corner, it cannot overlap them.
  let high = 0;
  for (const quad of obstacles) {
    for (const [x, y] of quad) high = Math.max(high, Math.hypot(x, y));
  }
  let low = 0;
  // The slides that overlap form one interval starting at 0, because the
  // card moves along a line and the obstacles are convex.
  for (let i = 0; i < 30 && high - low > 0.25; i++) {
    const mid = (low + high) / 2;
    if (blocked(mid)) low = mid;
    else high = mid;
  }
  return high;
}
