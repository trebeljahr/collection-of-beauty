import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEWSLETTER_TOKEN_SECRET = "fixture-confirm-secret";
vi.mock("@/lib/newsletter/subscribe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter/subscribe")>(
    "@/lib/newsletter/subscribe",
  );
  return {
    ...actual,
    isAlreadySubscribed: vi.fn(async () => false),
    confirmSubscription: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/newsletter/editions", () => ({
  loadPublishedEditions: () => [{ fileSlug: "fixture" }],
}));
vi.mock("@/lib/newsletter/render", () => ({
  renderEdition: async () => ({ subject: "fixture", html: "<p>fixture</p>" }),
}));
vi.mock("@/lib/newsletter/listmonk", () => ({ sendTransactional: vi.fn(async () => {}) }));

const { GET } = await import("./route");
const { mintConfirmToken, confirmSubscription } = await import("@/lib/newsletter/subscribe");
const { sendTransactional } = await import("@/lib/newsletter/listmonk");

beforeEach(() => {
  vi.mocked(confirmSubscription).mockReset().mockResolvedValue();
  vi.mocked(sendTransactional).mockReset().mockResolvedValue();
});

describe("confirmation consent boundary", () => {
  it("passes authenticated token issuance time to the consent check", async () => {
    const now = Date.now();
    const token = mintConfirmToken("reader@example.com", now);
    const response = await GET(
      new NextRequest(`http://localhost/api/newsletter/confirm?token=${encodeURIComponent(token)}`),
    );
    expect(confirmSubscription).toHaveBeenCalledWith("reader@example.com", now);
    expect(response.headers.get("location")).toContain("/sub/confirmed");
    expect(sendTransactional).toHaveBeenCalledTimes(1);
  });

  it("does not send a welcome when suppression or migration blocks confirmation", async () => {
    vi.mocked(confirmSubscription).mockRejectedValueOnce(new Error("Subscriber is suppressed"));
    const token = mintConfirmToken("reader@example.com");
    const response = await GET(
      new NextRequest(`http://localhost/api/newsletter/confirm?token=${encodeURIComponent(token)}`),
    );
    expect(response.headers.get("location")).toContain("reason=list_add_failed");
    expect(sendTransactional).not.toHaveBeenCalled();
  });
});
