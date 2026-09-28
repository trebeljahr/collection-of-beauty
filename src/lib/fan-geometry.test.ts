import { describe, expect, it } from "vitest";

import {
  cardCorners,
  clearance,
  coveringCards,
  type FanCard,
  fanStack,
  rectsOverlap,
} from "./fan-geometry";

const H = 168;
const STEP = (14 * Math.PI) / 180;

/** The confirmed page's hand at desktop size: pivot 1.4 heights below. */
function hand(aspects: number[]): FanCard[] {
  const middle = (aspects.length - 1) / 2;
  return aspects.map((aspect, i) => ({
    angle: (i - middle) * STEP,
    width: H * aspect,
    height: H,
    inset: 1.4 * H,
  }));
}

describe("fanStack", () => {
  it("puts the middle card on top and falls away symmetrically", () => {
    expect(fanStack(5)).toEqual([1, 3, 5, 4, 2]);
  });

  it("breaks the tie between the two middle cards of an even hand", () => {
    expect(fanStack(4)).toEqual([1, 3, 4, 2]);
  });
});

describe("cardCorners", () => {
  it("stands an unturned card straight up from the pivot", () => {
    const corners = cardCorners({ angle: 0, width: 100, height: 200, inset: 50 });
    expect(corners).toEqual([
      [-50, -50],
      [50, -50],
      [50, -250],
      [-50, -250],
    ]);
  });

  it("slides a turned card along its own axis", () => {
    const card = { angle: Math.PI / 2, width: 100, height: 200, inset: 50 };
    const [bottomLeft] = cardCorners(card, 10);
    // A quarter turn clockwise lays the card along +x.
    expect(bottomLeft[0]).toBeCloseTo(60);
    expect(bottomLeft[1]).toBeCloseTo(-50);
  });
});

describe("rectsOverlap", () => {
  const square = (x: number, y: number) =>
    [
      [x, y],
      [x + 10, y],
      [x + 10, y + 10],
      [x, y + 10],
    ] as const satisfies [number, number][];

  it("finds overlapping and separate rectangles", () => {
    expect(rectsOverlap([...square(0, 0)], [...square(5, 5)])).toBe(true);
    expect(rectsOverlap([...square(0, 0)], [...square(20, 0)])).toBe(false);
  });

  it("does not count touching edges", () => {
    expect(rectsOverlap([...square(0, 0)], [...square(10, 0)])).toBe(false);
  });

  it("separates turned rectangles whose bounding boxes overlap", () => {
    const a = cardCorners({ angle: -0.6, width: 20, height: 100, inset: 0 });
    const b = cardCorners({ angle: 0.6, width: 20, height: 100, inset: 0 }, 40);
    expect(rectsOverlap(a, b)).toBe(false);
  });
});

describe("coveringCards", () => {
  const cards = hand([1.1, 0.7, 1.1, 0.7, 1.1]);
  const stack = fanStack(5);

  it("leaves the top card uncovered", () => {
    expect(coveringCards(cards, stack, 2)).toEqual([]);
  });

  it("covers a card with its neighbours toward the middle", () => {
    expect(coveringCards(cards, stack, 1)).toEqual([2]);
    expect(coveringCards(cards, stack, 0)).toEqual([1, 2]);
    expect(coveringCards(cards, stack, 4)).toEqual([3, 2]);
  });

  it("skips a card toward the middle that does not reach it", () => {
    const narrow = hand([0.6, 0.6, 0.6, 0.6, 0.6]);
    expect(coveringCards(narrow, stack, 0)).toEqual([1]);
  });
});

describe("clearance", () => {
  const cards = hand([0.8, 0.75, 1.1, 0.75, 0.8]);
  const stack = fanStack(5);

  it("is zero with nothing on the card", () => {
    expect(clearance(cards, 2, [])).toBe(0);
  });

  it("slides a card just far enough to clear what lies on it", () => {
    const covering = coveringCards(cards, stack, 1);
    const slide = clearance(cards, 1, covering);
    const clear = (s: number) =>
      covering.every((j) => !rectsOverlap(cardCorners(cards[1], s), cardCorners(cards[j])));
    expect(clear(slide)).toBe(true);
    expect(clear(slide - 2)).toBe(false);
    // Roughly a card's height: the fan overlaps down to the pivot end.
    expect(slide).toBeGreaterThan(0.6 * H);
    expect(slide).toBeLessThan(1.2 * H);
  });

  it("slides further to clear lifted, enlarged cards", () => {
    const covering = coveringCards(cards, stack, 0);
    expect(clearance(cards, 0, covering, 1.05)).toBeGreaterThan(clearance(cards, 0, covering));
  });
});
