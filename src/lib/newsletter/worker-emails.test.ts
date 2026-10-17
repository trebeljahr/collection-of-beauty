import { describe, expect, it } from "vitest";
import {
  CONFIRM_TOKEN_PLACEHOLDER,
  fillToken,
  UNSUBSCRIBE_TOKEN_PLACEHOLDER,
} from "./email-placeholders";
import { renderWorkerEmails } from "./worker-emails";

const SITE = "https://collectionofbeauty.com";

describe("renderWorkerEmails", () => {
  it("keeps each per-recipient token a placeholder inside its link", async () => {
    const emails = await renderWorkerEmails(`${SITE}/`);
    expect(emails.confirm.html).toContain(`${SITE}/sub/confirm?token=${CONFIRM_TOKEN_PLACEHOLDER}`);
    expect(emails.alreadySubscribed.html).not.toContain("PLACEHOLDER");
    expect(emails.welcome?.html).toContain(
      `${SITE}/sub/unsubscribe?token=${UNSUBSCRIBE_TOKEN_PLACEHOLDER}`,
    );
    expect(emails.welcome?.subject.startsWith("Welcome — ")).toBe(true);
  });

  it("fills every placeholder, encoded, and refuses a template without one", () => {
    const html = `<a href="x?t=${CONFIRM_TOKEN_PLACEHOLDER}">a</a><a href="y?t=${CONFIRM_TOKEN_PLACEHOLDER}">b</a>`;
    expect(fillToken(html, CONFIRM_TOKEN_PLACEHOLDER, "a+b/c")).toBe(
      '<a href="x?t=a%2Bb%2Fc">a</a><a href="y?t=a%2Bb%2Fc">b</a>',
    );
    expect(() => fillToken("<p/>", CONFIRM_TOKEN_PLACEHOLDER, "t")).toThrow(/missing/);
  });
});
