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
const { SITE_URL } = await import("@/lib/links");
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
  vi.unstubAllGlobals();
});

describe("POST /api/newsletter/subscribe", () => {
  it("returns 200 + sends confirmation email on valid input", async () => {
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendConfirmationEmail.mock.calls[0][0].to).toBe("new@example.com");
  });

  it("builds the confirm link from SITE_URL, not the request origin", async () => {
    // What the standalone server sees behind Coolify's proxy.
    const req = new NextRequest("http://0.0.0.0:80/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
      body: JSON.stringify({ email: "proxy@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const params = sendConfirmationEmail.mock.calls[0][0];
    expect(params.confirmUrl.startsWith(`${SITE_URL}/api/newsletter/confirm?token=`)).toBe(true);
    expect(params.heroArtworkUrl.startsWith(`${SITE_URL}/artwork/`)).toBe(true);
    expect(params.confirmUrl).not.toContain("0.0.0.0");
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

// An `unconfirmed` membership either gets campaigns (single opt-in list)
// or a second, ListMonk-sent opt-in email (double). These run the real
// `sendConfirmationEmail` against a stubbed ListMonk to prove the form
// never touches list membership; only the confirm route may add it.
const actual = await vi.importActual<typeof import("@/lib/newsletter/subscribe")>(
  "@/lib/newsletter/subscribe",
);

describe("POST /api/newsletter/subscribe → ListMonk", () => {
  type FetchCall = [RequestInfo | URL, RequestInit?];

  function stubListmonk(existing: object | null) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = `${init?.method ?? "GET"} ${new URL(input as string).pathname}`;
      const data =
        path === "GET /api/subscribers"
          ? { results: existing ? [existing] : [], total: existing ? 1 : 0 }
          : path === "POST /api/subscribers"
            ? { id: 42, email: "new@example.com", lists: [] }
            : true;
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function writes(calls: FetchCall[]): string[] {
    return calls
      .filter(([, init]) => (init?.method ?? "GET") !== "GET")
      .map(([input, init]) => `${init?.method} ${new URL(input as string).pathname}`);
  }

  beforeEach(() => {
    process.env.LISTMONK_URL = "https://listmonk.test";
    process.env.LISTMONK_API_USER = "api-user";
    process.env.LISTMONK_API_TOKEN = "api-token";
    process.env.LISTMONK_LIST_ID = "4";
    process.env.LISTMONK_TX_TEMPLATE_ID = "5";
    process.env.SES_FROM_EMAIL = "noreply@example.com";
    sendConfirmationEmail.mockImplementation(actual.sendConfirmationEmail);
  });

  it("creates a new address with no list before sending the confirmation", async () => {
    const fetchMock = stubListmonk(null);
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    const calls = fetchMock.mock.calls;
    expect(writes(calls)).toEqual(["POST /api/subscribers", "POST /api/tx"]);
    const created = calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(created?.[1]?.body as string).lists).toEqual([]);
  });

  it("does not put a re-submitting subscriber on the list", async () => {
    // Known to ListMonk (another project's list, or unsubscribed from
    // ours) but not a confirmed member, so the form sends a new link.
    const fetchMock = stubListmonk({
      id: 42,
      email: "old@example.com",
      lists: [{ id: 4, subscription_status: "unsubscribed" }],
    });
    const res = await POST(makeRequest({ email: "old@example.com" }));
    expect(res.status).toBe(200);
    expect(writes(fetchMock.mock.calls)).toEqual(["POST /api/tx"]);
  });
});
