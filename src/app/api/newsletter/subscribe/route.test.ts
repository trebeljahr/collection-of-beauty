import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pin the HMAC secret before importing anything that resolves the
// subscribe module — token mint reads the env at first call.
process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-for-route-tests";

// `after` needs Next's request scope, which a direct POST() does not have.
// Queue the work, so a test can read the response before any of it runs.
const afterTasks: Array<() => unknown> = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));

// ListMonk-touching exports are replaced with stubs so the test never
// makes a real API call. The non-IO helpers (email normalize, rate
// limiter) are kept from the actual module so we exercise the real
// validation/limiter rules. The token mint stays real and is watched.
vi.mock("@/lib/newsletter/subscribe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter/subscribe")>(
    "@/lib/newsletter/subscribe",
  );
  return {
    ...actual,
    isAlreadySubscribed: vi.fn(async () => false),
    isListmonkUp: vi.fn(async () => true),
    mintConfirmToken: vi.fn(actual.mintConfirmToken),
    sendAlreadySubscribedEmail: vi.fn(async () => {}),
    sendConfirmationEmail: vi.fn(async () => {}),
  };
});

vi.mock("@/lib/error-reporting/server", () => ({
  reportServerError: vi.fn(async () => {}),
}));

// Newsletter routing tests do not need the full artwork catalogue.
vi.mock("@/lib/newsletter/confirmation-cover", () => ({
  resolveConfirmHero: (origin: string) => ({
    imageUrl: `${origin}/fixture.jpg`,
    artworkUrl: `${origin}/artwork/fixture`,
    caption: "Fixture",
    alt: "Fixture",
  }),
}));

const { POST } = await import("./route");
const { SITE_URL } = await import("@/lib/links");
const subscribeMod = await import("@/lib/newsletter/subscribe");
const { _resetRateLimit } = subscribeMod;
const isAlreadySubscribed = vi.mocked(subscribeMod.isAlreadySubscribed);
const isListmonkUp = vi.mocked(subscribeMod.isListmonkUp);
const mintConfirmToken = vi.mocked(subscribeMod.mintConfirmToken);
const sendAlreadySubscribedEmail = vi.mocked(subscribeMod.sendAlreadySubscribedEmail);
const sendConfirmationEmail = vi.mocked(subscribeMod.sendConfirmationEmail);
const { reportServerError } = await import("@/lib/error-reporting/server");

/** What `after` would run once the response is on its way. */
async function runAfterTasks(): Promise<void> {
  for (const task of afterTasks.splice(0)) await task();
}

/** Every byte a caller can read from a response. */
async function wireForm(res: Response) {
  return { status: res.status, headers: [...res.headers], body: await res.text() };
}

const EDGE = "172.69.23.119";

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/newsletter/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // As the route gets them in production: the visitor, and the Cloudflare
      // edge Traefik took the request from.
      "cf-connecting-ip": "203.0.113.7", // distinct per test via beforeEach reset
      "x-forwarded-for": EDGE,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  _resetRateLimit();
  afterTasks.length = 0;
  isAlreadySubscribed.mockClear();
  isAlreadySubscribed.mockResolvedValue(false);
  isListmonkUp.mockClear();
  isListmonkUp.mockResolvedValue(true);
  mintConfirmToken.mockClear();
  sendAlreadySubscribedEmail.mockClear();
  sendAlreadySubscribedEmail.mockResolvedValue();
  sendConfirmationEmail.mockClear();
  sendConfirmationEmail.mockResolvedValue();
  vi.mocked(reportServerError).mockClear();
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
    await runAfterTasks();
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendConfirmationEmail.mock.calls[0][0].to).toBe("new@example.com");
    expect(sendAlreadySubscribedEmail).not.toHaveBeenCalled();
  });

  it("builds the confirm link from SITE_URL, not the request origin", async () => {
    // What the standalone server sees behind Coolify's proxy.
    const req = new NextRequest("http://0.0.0.0:80/api/newsletter/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.8" },
      body: JSON.stringify({ email: "proxy@example.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await runAfterTasks();
    const params = sendConfirmationEmail.mock.calls[0][0];
    expect(params.confirmUrl.startsWith(`${SITE_URL}/sub/confirm?token=`)).toBe(true);
    expect(params.heroArtworkUrl.startsWith(`${SITE_URL}/artwork/`)).toBe(true);
    expect(params.confirmUrl).not.toContain("0.0.0.0");
  });

  it("returns 400 + skips the send on malformed email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_email" });
    expect(afterTasks).toHaveLength(0);
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeRequest("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
    expect(afterTasks).toHaveLength(0);
  });

  it("trips the honeypot silently — 200 with no email sent", async () => {
    const res = await POST(makeRequest({ email: "good@example.com", website: "spam-bot-fill" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(afterTasks).toHaveLength(0);
  });

  it("sends a confirmed address the note, with no token", async () => {
    isAlreadySubscribed.mockResolvedValueOnce(true);
    const res = await POST(makeRequest({ email: "old@example.com" }));
    expect(res.status).toBe(200);
    await runAfterTasks();
    expect(sendAlreadySubscribedEmail).toHaveBeenCalledExactlyOnceWith({
      to: "old@example.com",
      siteUrl: SITE_URL,
    });
    expect(mintConfirmToken).not.toHaveBeenCalled();
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("answers a new, a confirmed and a failing address with the same bytes", async () => {
    const fresh = await wireForm(await POST(makeRequest({ email: "new@example.com" })));

    isAlreadySubscribed.mockResolvedValueOnce(true);
    const confirmed = await wireForm(await POST(makeRequest({ email: "old@example.com" })));

    sendConfirmationEmail.mockRejectedValueOnce(new Error("Subscriber is suppressed"));
    const suppressed = await wireForm(await POST(makeRequest({ email: "gone@example.com" })));

    await runAfterTasks();
    expect(sendConfirmationEmail).toHaveBeenCalledTimes(2);
    expect(sendAlreadySubscribedEmail).toHaveBeenCalledTimes(1);
    expect(fresh).toEqual({
      status: 200,
      headers: [["content-type", "application/json"]],
      body: '{"ok":true}',
    });
    expect(confirmed).toEqual(fresh);
    expect(suppressed).toEqual(fresh);
  });

  // The timing check. Time on the wire can only tell the two paths apart if
  // the response waits on something that differs between them, so nothing
  // that depends on the address may start before the response exists.
  it("has its answer before it asks ListMonk about the address", async () => {
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    expect(afterTasks).toHaveLength(1);
    expect(isListmonkUp).toHaveBeenCalledExactlyOnceWith();
    expect(isAlreadySubscribed).not.toHaveBeenCalled();
    expect(sendConfirmationEmail).not.toHaveBeenCalled();
    expect(sendAlreadySubscribedEmail).not.toHaveBeenCalled();
  });

  it("tells every address to try again during an outage, and sends nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isListmonkUp.mockResolvedValue(false);

    const fresh = await wireForm(await POST(makeRequest({ email: "new@example.com" })));
    const confirmed = await wireForm(await POST(makeRequest({ email: "old@example.com" })));

    expect(fresh.status).toBe(502);
    expect(JSON.parse(fresh.body)).toMatchObject({ error: "send_failed" });
    expect(confirmed).toEqual(fresh);
    expect(afterTasks).toHaveLength(0);
    expect(isAlreadySubscribed).not.toHaveBeenCalled();
    expect(vi.mocked(reportServerError).mock.calls[0][1]).toEqual({
      source: "newsletter.subscribe",
      event: "listmonk_unreachable",
    });
  });

  it.each([
    ["the confirmation", false, sendConfirmationEmail],
    ["the note", true, sendAlreadySubscribedEmail],
  ])("reports a failed send of %s without throwing", async (_name, confirmed, send) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    isAlreadySubscribed.mockResolvedValueOnce(confirmed);
    send.mockRejectedValueOnce(new Error("listmonk down"));

    const res = await POST(makeRequest({ email: "fresh@example.com" }));
    expect(res.status).toBe(200);
    await runAfterTasks();

    expect(vi.mocked(reportServerError).mock.calls[0][1]).toEqual({
      source: "newsletter.subscribe",
      event: "send_failed",
    });
    expect(errorLog.mock.calls[0][0]).toContain('"send_failed"');
  });

  it("rate-limits after 5 requests from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest({ email: `u${i}@example.com` }));
      expect(res.status).toBe(200);
    }
    const sixth = await POST(makeRequest({ email: "blocked@example.com" }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ error: "rate_limited" });
    expect(afterTasks).toHaveLength(5);
    expect(isListmonkUp).toHaveBeenCalledTimes(5);
  });
});

describe("POST /api/newsletter/subscribe rate-limit key", () => {
  const post = (headers: Record<string, string>) =>
    POST(makeRequest({ email: "new@example.com" }, headers));

  /** Spends a whole bucket, one set of headers a request, and checks it is spent. */
  async function spendBucket(headersFor: (i: number) => Record<string, string>) {
    for (let i = 0; i < 5; i++) expect((await post(headersFor(i))).status).toBe(200);
    expect((await post(headersFor(5))).status).toBe(429);
  }

  it("gives a forged first x-forwarded-for entry no new bucket", async () => {
    await spendBucket((i) => ({ "x-forwarded-for": `198.51.100.${i}, ${EDGE}` }));
  });

  // What the live site does with no forging at all: seven POSTs from one
  // client came through five edge addresses.
  it("gives a new Cloudflare edge address no new bucket", async () => {
    await spendBucket((i) => ({
      "x-forwarded-for": `172.70.214.${i}`,
      "x-real-ip": `172.70.214.${i}`,
    }));
  });

  it("gives two visitors behind one edge a bucket each", async () => {
    await spendBucket(() => ({ "cf-connecting-ip": "203.0.113.20" }));
    expect((await post({ "cf-connecting-ip": "203.0.113.21" })).status).toBe(200);
  });

  it("buckets an IPv6 client by its /64, however the address is written", async () => {
    const sameNetwork = [
      "2001:db8:1:2::1",
      "2001:db8:1:2:aaaa:bbbb:cccc:dddd",
      "2001:0db8:0001:0002::2",
      "2001:DB8:1:2:0:0:0:3",
      "2001:db8:1:2::4",
      "2001:db8:1:2:ffff::",
    ];
    await spendBucket((i) => ({ "cf-connecting-ip": sameNetwork[i] }));
    expect((await post({ "cf-connecting-ip": "2001:db8:1:3::1" })).status).toBe(200);
  });

  it("does not fold the zeros of a short IPv6 address into another /64", async () => {
    await spendBucket(() => ({ "cf-connecting-ip": "2001:db8::1" }));
    expect((await post({ "cf-connecting-ip": "2001:db8:0:1::1" })).status).toBe(200);
  });

  // Cloudflare documents that a Worker can set `cf-connecting-ip` on a
  // subrequest to a host off its network, and marks every subrequest.
  it("gives a Worker no bucket per address it names", async () => {
    await spendBucket((i) => ({
      "cf-connecting-ip": `198.51.100.${i}`,
      "cf-worker": "example.net",
    }));
  });

  it("puts every request without the header in one bucket", async () => {
    for (let i = 0; i < 6; i++) {
      const req = makeRequest(
        { email: "new@example.com" },
        { "x-forwarded-for": `198.51.100.${i}` },
      );
      req.headers.delete("cf-connecting-ip");
      expect((await POST(req)).status).toBe(i < 5 ? 200 : 429);
    }
  });

  // /privacy: the address "is held only by the rate limiter".
  it("writes no address to the log", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await post({});
    isAlreadySubscribed.mockResolvedValueOnce(true);
    await post({});
    sendConfirmationEmail.mockRejectedValueOnce(new Error("listmonk down"));
    await post({});
    await runAfterTasks();
    await POST(makeRequest({ email: "bot@example.com", website: "filled" }));
    await post({});
    await post({});

    const lines = [...info.mock.calls, ...error.mock.calls].map(([line]) => String(line));
    const events = lines.map((line) => JSON.parse(line).event).sort();
    expect(events).toEqual([
      "already_subscribed",
      "confirmation_sent",
      "honeypot_triggered",
      "rate_limited",
      "send_failed",
    ]);
    for (const line of lines) {
      expect(line).not.toContain("203.0.113.7");
      expect(line).not.toContain(EDGE);
      expect(JSON.parse(line)).not.toHaveProperty("ip");
    }
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
    isAlreadySubscribed.mockImplementation(actual.isAlreadySubscribed);
    isListmonkUp.mockImplementation(actual.isListmonkUp);
    sendAlreadySubscribedEmail.mockImplementation(actual.sendAlreadySubscribedEmail);
    sendConfirmationEmail.mockImplementation(actual.sendConfirmationEmail);
  });

  it("creates a new address with no list before sending the confirmation", async () => {
    const fetchMock = stubListmonk(null);
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(200);
    await runAfterTasks();
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
      status: "enabled",
      lists: [{ id: 4, subscription_status: "unsubscribed" }],
    });
    const res = await POST(makeRequest({ email: "old@example.com" }));
    expect(res.status).toBe(200);
    await runAfterTasks();
    expect(writes(fetchMock.mock.calls)).toEqual(["POST /api/tx"]);
  });

  it("mails a confirmed member the note and no link, and changes nothing", async () => {
    const fetchMock = stubListmonk({
      id: 42,
      email: "old@example.com",
      status: "enabled",
      lists: [{ id: 4, subscription_status: "confirmed" }],
    });
    const res = await POST(makeRequest({ email: "old@example.com" }));
    expect(res.status).toBe(200);
    await runAfterTasks();

    const calls = fetchMock.mock.calls;
    expect(writes(calls)).toEqual(["POST /api/tx"]);
    const tx = JSON.parse(calls.find(([, init]) => init?.method === "POST")?.[1]?.body as string);
    expect(tx.subscriber_email).toBe("old@example.com");
    expect(tx.data.subject).toContain("already on the list");
    expect(tx.data.body).toContain(SITE_URL);
    expect(tx.data.body).not.toContain("/sub/confirm?token=");
    expect(tx.data.body).not.toContain("/api/newsletter/confirm");
  });

  it("sends a suppressed address nothing and answers as for any other", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = stubListmonk({
      id: 42,
      email: "gone@example.com",
      status: "blocklisted",
      lists: [],
    });
    const res = await POST(makeRequest({ email: "gone@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    await runAfterTasks();
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });
});
