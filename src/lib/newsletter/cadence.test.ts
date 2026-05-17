import { describe, expect, it } from "vitest";
import { daysUntilNextDayOfWeek, daysUntilNextPublishDay } from "./cadence";

describe("daysUntilNextDayOfWeek", () => {
  // Anchor: 2026-05-17 is a Sunday (UTC).
  const sun = new Date(Date.UTC(2026, 4, 17, 12));
  const mon = new Date(Date.UTC(2026, 4, 18, 12));
  const wed = new Date(Date.UTC(2026, 4, 20, 12));
  const sat = new Date(Date.UTC(2026, 4, 23, 12));

  it("returns 7 (not 0) when called on the target day", () => {
    expect(daysUntilNextDayOfWeek(0, sun)).toBe(7);
  });

  it("counts forward through the week", () => {
    expect(daysUntilNextDayOfWeek(0, mon)).toBe(6);
    expect(daysUntilNextDayOfWeek(0, wed)).toBe(4);
    expect(daysUntilNextDayOfWeek(0, sat)).toBe(1);
  });

  it("works for non-Sunday targets too", () => {
    expect(daysUntilNextDayOfWeek(3, mon)).toBe(2); // Mon → Wed
    expect(daysUntilNextDayOfWeek(1, sun)).toBe(1); // Sun → Mon
  });
});

describe("daysUntilNextPublishDay", () => {
  it("defaults to Sunday cadence", () => {
    const mon = new Date(Date.UTC(2026, 4, 18, 12));
    expect(daysUntilNextPublishDay(mon)).toBe(6);
  });
});
