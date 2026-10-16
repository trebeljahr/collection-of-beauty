import { describe, expect, it } from "vitest";
import { newRound, nextFromBag, shuffled } from "./shuffle-bag";

// Deterministic [0, 1) source for repeatable tests.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const IDS = ["a", "b", "c", "d", "e", "f", "g"];

describe("shuffled", () => {
  it("keeps every item once", () => {
    expect(shuffled(IDS, seeded(1)).sort()).toEqual(IDS);
  });
});

describe("nextFromBag", () => {
  it("plays every id once before any repeats, and never one twice in a row", () => {
    const random = seeded(42);
    let remaining: string[] = [];
    let last: string | null = null;
    const played: string[] = [];
    for (let i = 0; i < IDS.length * 200; i++) {
      const step = nextFromBag(IDS, remaining, last, random);
      if (step.next === null) throw new Error("bag ran dry");
      played.push(step.next);
      remaining = step.remaining;
      last = step.next;
    }
    const badRounds: number[] = [];
    for (let r = 0; r < played.length / IDS.length; r++) {
      const round = played.slice(r * IDS.length, (r + 1) * IDS.length);
      if (new Set(round).size !== IDS.length) badRounds.push(r);
    }
    expect(badRounds, "rounds with a repeat").toEqual([]);
    const repeats = played.filter((id, i) => i > 0 && played[i - 1] === id).length;
    expect(repeats, "back-to-back repeats").toBe(0);
  });

  it("drops ids a stored round holds that the list no longer has", () => {
    expect(nextFromBag(["a", "b"], ["x", "b"], "a")).toEqual({ next: "b", remaining: [] });
  });

  it("starts a new round when the stored one is spent", () => {
    const { next, remaining } = nextFromBag(IDS, [], null, seeded(7));
    expect([next, ...remaining].sort()).toEqual(IDS);
  });

  it("returns nothing for an empty list", () => {
    expect(nextFromBag([], ["a"], null)).toEqual({ next: null, remaining: [] });
  });
});

describe("newRound", () => {
  it("never opens with the id the last round ended on", () => {
    const random = seeded(3);
    let opened = 0;
    for (let i = 0; i < 500; i++) if (newRound(IDS, "c", random)[0] === "c") opened++;
    expect(opened).toBe(0);
  });

  it("plays a single id again, having no other", () => {
    expect(newRound(["a"], "a")).toEqual(["a"]);
  });
});
