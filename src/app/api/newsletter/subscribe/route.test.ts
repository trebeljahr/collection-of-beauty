import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pin the HMAC secret before importing anything that resolves the
// subscribe module — token mint reads the env at first call.
process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-for-route-tests";

// ListMonk-touching exports are replaced with stubs so the test never
// makes a real API call. The non-IO helpers (token mint, email
// normalize, rate limiter) are kept from the actual module so we
// exercise the real validation/limiter rules.
vi.mock("@/lib/newsletter/subscribe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter/subscribe")>(
    "@/lib/newsletter/subscribe",
  );
  return {
    ...actual,
    isAlreadySubscribed: vi.fn(async () => false),
    sendConfirmationEmail: vi.fn(async () => {}),
  };
});

const { POST } = await import("./route");
const subscribeMod = await import("@/lib/newsletter/subscribe");
const { _resetRateLimit } = subscribeMod;
const isAlreadySubscribed = vi.mocked(subscribeMod.isAlreadySubscribed);
const sendConfirmationEmail = vi.mocked(subscribeMod.sendConfirmationEmail);

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/newsletter/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7", // distinct per test via beforeEach reset
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetRateLimit();
  isAlreadySubscribed.mockClear();
  isAlreadySubscribed.mockResolvedValue(false);
  sendConfirmationEmail.mockClear();
  sendConfirmationEmail.mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/newsletter/subscribe", () => {
  it("returns 200 + sends confirmation email on valid input", async () => {
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendConfirmationEmail.mock.calls[0][0].to).toBe("new@example.com");
  });

  it("returns 400 + skips the send on malformed email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_email" });
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeRequest("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("trips the honeypot silently — 200 with no email sent", async () => {
    const res = await POST(makeRequest({ email: "good@example.com", website: "spam-bot-fill" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("short-circuits already-subscribed addresses", async () => {
    isAlreadySubscribed.mockResolvedValueOnce(true);
    const res = await POST(makeRequest({ email: "old@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadySubscribed: true });
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("returns 502 when the confirmation send fails", async () => {
    sendConfirmationEmail.mockRejectedValueOnce(new Error("listmonk down"));
    const res = await POST(makeRequest({ email: "fresh@example.com" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "send_failed" });
  });

  it("rate-limits after 5 requests from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest({ email: `u${i}@example.com` }));
      expect(res.status).toBe(200);
    }
    const sixth = await POST(makeRequest({ email: "blocked@example.com" }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ error: "rate_limited" });
  });
});
