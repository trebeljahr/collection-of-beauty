import { describe, expect, it } from "vitest";
import { LOOK_DEADZONE, LOOK_FULL_AT, LOOK_START_RATE, lookStickRate } from "./look-stick";

describe("lookStickRate", () => {
  it("does nothing inside the deadzone", () => {
    expect(lookStickRate(0)).toBe(0);
    expect(lookStickRate(LOOK_DEADZONE)).toBe(0);
    expect(lookStickRate(Number.NaN)).toBe(0);
  });

  it("starts slow just past the deadzone", () => {
    expect(lookStickRate(LOOK_DEADZONE + 1e-6)).toBeCloseTo(LOOK_START_RATE, 5);
  });

  it("turns at the full rate at full throw", () => {
    expect(lookStickRate(LOOK_FULL_AT)).toBe(1);
    expect(lookStickRate(1)).toBe(1);
    // A diagonal at the pad's edge, after the library rounds x and y to
    // whole pixels of its 60 px throw.
    expect(lookStickRate(Math.hypot(42, 42) / 60)).toBe(1);
  });

  it("rises faster the further the stick is pushed", () => {
    // Whole pixels from the first that engages (10 px) to full rate (57).
    const rates: number[] = [];
    for (let px = 10; px <= 57; px++) rates.push(lookStickRate(px / 60));
    let broken: string | null = null;
    for (let i = 1; i < rates.length; i++) {
      const step = rates[i] - rates[i - 1];
      const before = i > 1 ? rates[i - 1] - rates[i - 2] : 0;
      if (step <= 0 || step < before - 1e-12) broken ??= `${10 + i} px`;
    }
    expect(broken, "rate falls or eases off at").toBeNull();
  });

  it("keeps half throw well under the full rate", () => {
    expect(lookStickRate(0.5)).toBeLessThan(0.35);
  });
});
