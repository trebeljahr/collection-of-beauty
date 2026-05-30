import { describe, expect, it } from "vitest";
import { isNewsletterEmailVisit } from "./email-origin";

describe("isNewsletterEmailVisit", () => {
  it("detects direct issue links generated for newsletter emails", () => {
    expect(isNewsletterEmailVisit({ from: "email" })).toBe(true);
  });

  it("detects common email campaign query params", () => {
    expect(isNewsletterEmailVisit({ utm_medium: "email" })).toBe(true);
    expect(isNewsletterEmailVisit({ utm_source: "newsletter" })).toBe(true);
  });

  it("handles repeated params", () => {
    expect(isNewsletterEmailVisit({ from: ["web", "email"] })).toBe(true);
  });

  it("keeps normal web visits eligible for the form", () => {
    expect(isNewsletterEmailVisit({})).toBe(false);
    expect(isNewsletterEmailVisit({ from: "archive" })).toBe(false);
  });
});
