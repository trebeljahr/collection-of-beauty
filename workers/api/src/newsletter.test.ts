import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pinned before the token code runs: mint and verify read it per call.
const SECRET = "test-secret-for-worker-tests";
process.env.NEWSLETTER_TOKEN_SECRET = SECRET;

const tokens = await import("../../../src/lib/newsletter/tokens");
const { CONFIRM_TOKEN_PLACEHOLDER, UNSUBSCRIBE_TOKEN_PLACEHOLDER } = await import(
  "../../../src/lib/newsletter/email-placeholders"
);
const nl = await import("./newsletter");
type Deps = import("./newsletter").NewsletterDeps;

const SITE = "https://collectionofbeauty.com";
const ADDRESS = "new@example.com";

function listmonkFake() {
  return {
    confirmSubscription: vi.fn(async (_email: string, _issuedAt?: number) => {}),
    ensureSubscriber: vi.fn(async (email: string) => ({ id: 1, email }) as never),
    isConfirmedOnList: vi.fn(async (_email: string) => false),
    isListmonkUp: vi.fn(async () => true),
    sendTransactional: vi.fn(
      async (_p: { to: string; subject: string; html: string; headers?: object }) => {},
    ),
    unsubscribeFromList: vi.fn(async (_email: string) => {}),
  };
}

type Harness = Deps & {
  listmonk: ReturnType<typeof listmonkFake>;
  report: ReturnType<typeof vi.fn>;
  limiter: { limit: ReturnType<typeof vi.fn> };
  /** Runs what was handed to `after`, as the runtime does once the response is out. */
  settle: () => Promise<void>;
};

function harness(): Harness {
  const tasks: Array<() => Promise<unknown>> = [];
  const h = {
    siteUrl: SITE,
    emails: {
      confirm: {
        subject: "Confirm your subscription · Drops of Beauty",
        html: `<a href="${SITE}/sub/confirm?token=${CONFIRM_TOKEN_PLACEHOLDER}">Confirm</a>`,
      },
      alreadySubscribed: {
        subject: "You're already on the list · Drops of Beauty",
        html: "<p>already</p>",
      },
      welcome: {
        edition: "0024-ruins",
        subject: "Welcome — Ruins",
        html: `<a href="${SITE}/sub/unsubscribe?token=${UNSUBSCRIBE_TOKEN_PLACEHOLDER}">Unsubscribe</a>`,
      },
    },
    limiter: { limit: vi.fn(async (_o: { key: string }) => ({ success: true })) },
    report: vi.fn(async () => {}),
    listmonk: listmonkFake(),
    after: (task: () => Promise<unknown>) => {
      tasks.push(task);
    },
    settle: async () => {
      while (tasks.length) await tasks.shift()?.();
    },
  };
  return h as unknown as Harness;
}

function subscribe(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://collection-of-beauty-api.example/api/newsletter/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "172.69.23.119",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Every byte a caller can read from a response. */
async function wire(res: Response) {
  return { status: res.status, headers: [...res.headers], body: await res.text() };
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A token as emails carried them before November 2026: `<payload>.<hmac>`. */
function signedToken(email: string, expiresAt: number): string {
  const payload = b64url(Buffer.from(JSON.stringify({ e: email, x: expiresAt })));
  const sig = b64url(createHmac("sha256", SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

let logged: string[];
beforeEach(() => {
  logged = [];
  for (const level of ["info", "error", "log", "warn"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/newsletter/subscribe", () => {
  it("answers before it asks ListMonk about the address, then mails the confirmation", async () => {
    const h = harness();
    const res = await nl.handleSubscribe(subscribe({ email: "New@Example.com" }), h);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.listmonk.isConfirmedOnList).not.toHaveBeenCalled();
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();

    await h.settle();
    expect(h.listmonk.ensureSubscriber).toHaveBeenCalledWith(ADDRESS);
    const [sent] = h.listmonk.sendTransactional.mock.calls[0];
    expect(sent.to).toBe(ADDRESS);
    const link = /href="([^"]+)"/.exec(sent.html)?.[1] ?? "";
    // From the configured origin, never the request's host.
    expect(link.startsWith(`${SITE}/sub/confirm?token=`)).toBe(true);
    const token = decodeURIComponent(new URL(link).searchParams.get("token") ?? "");
    expect(tokens.verifyConfirmToken(token)).toMatchObject({ ok: true, email: ADDRESS });
    expect(link).not.toContain("example.com/sub");
    expect(sent.html).not.toContain(CONFIRM_TOKEN_PLACEHOLDER);
  });

  it("returns 400 and sends nothing for a malformed address or body", async () => {
    const h = harness();
    expect((await nl.handleSubscribe(subscribe({ email: "nope" }), h)).status).toBe(400);
    expect((await nl.handleSubscribe(subscribe("{not json"), h)).status).toBe(400);
    await h.settle();
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
  });

  it("trips the honeypot silently: 200, nothing sent", async () => {
    const h = harness();
    const res = await nl.handleSubscribe(subscribe({ email: ADDRESS, website: "x" }), h);
    expect(await res.json()).toEqual({ ok: true });
    await h.settle();
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
    expect(h.listmonk.isListmonkUp).not.toHaveBeenCalled();
  });

  it("mails a confirmed member the note, with no token and no new subscriber", async () => {
    const h = harness();
    h.listmonk.isConfirmedOnList.mockResolvedValue(true);
    await nl.handleSubscribe(subscribe({ email: ADDRESS }), h);
    await h.settle();
    expect(h.listmonk.ensureSubscriber).not.toHaveBeenCalled();
    expect(h.listmonk.sendTransactional).toHaveBeenCalledWith({
      to: ADDRESS,
      ...h.emails.alreadySubscribed,
    });
  });

  it("answers a new, a confirmed and a failing address with the same bytes", async () => {
    const answers = [];
    for (const setup of [
      (h: Harness) => h.listmonk.isConfirmedOnList.mockResolvedValue(false),
      (h: Harness) => h.listmonk.isConfirmedOnList.mockResolvedValue(true),
      (h: Harness) => h.listmonk.isConfirmedOnList.mockRejectedValue(new Error("down")),
    ]) {
      const h = harness();
      setup(h);
      answers.push(await wire(await nl.handleSubscribe(subscribe({ email: ADDRESS }), h)));
      await h.settle();
    }
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it("tells every address to try again during an outage, reports it, and sends nothing", async () => {
    const h = harness();
    h.listmonk.isListmonkUp.mockResolvedValue(false);
    const res = await nl.handleSubscribe(subscribe({ email: ADDRESS }), h);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "send_failed" });
    await h.settle();
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), {
      source: "newsletter.subscribe",
      event: "listmonk_unreachable",
    });
  });

  it("reports a send that fails after the answer, and names no address in the log", async () => {
    const h = harness();
    h.listmonk.sendTransactional.mockRejectedValue(new Error(`ListMonk refused ${ADDRESS}`));
    const res = await nl.handleSubscribe(subscribe({ email: ADDRESS }), h);
    expect(res.status).toBe(200);
    await h.settle();
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), {
      source: "newsletter.subscribe",
      event: "send_failed",
    });
    expect(logged.join("\n")).toContain("send_failed");
    expect(logged.join("\n")).not.toContain(ADDRESS);
    expect(logged.join("\n")).not.toContain("203.0.113.7");
  });

  it("answers 429 when the limiter says so, and sends nothing", async () => {
    const h = harness();
    h.limiter.limit.mockResolvedValue({ success: false });
    const res = await nl.handleSubscribe(subscribe({ email: ADDRESS }), h);
    expect(res.status).toBe(429);
    await h.settle();
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
  });
});

describe("rate-limit key", () => {
  const key = (headers: Record<string, string>) =>
    nl.rateLimitKey(new Request("https://x/", { headers }));

  it("is the visitor's address, whatever x-forwarded-for says", () => {
    expect(key({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })).toBe(
      "203.0.113.7",
    );
  });

  it("buckets an IPv6 client by its /64, however the address is written", () => {
    expect(key({ "cf-connecting-ip": "2001:db8:abcd:12::1" })).toBe("2001:db8:abcd:12");
    expect(key({ "cf-connecting-ip": "2001:0db8:abcd:0012:ffff::9" })).toBe("2001:db8:abcd:12");
    expect(key({ "cf-connecting-ip": "2001:db8::1" })).toBe("2001:db8:0:0");
  });

  it("gives a Worker subrequest and a request with no address one shared bucket", () => {
    expect(key({ "cf-connecting-ip": "203.0.113.7", "cf-worker": "evil.example" })).toBe("unknown");
    expect(key({})).toBe("unknown");
  });
});

describe("opening a confirm link (GET)", () => {
  it("leads to the page with the button, sealed, and changes nothing", () => {
    const h = harness();
    const token = tokens.mintConfirmToken(ADDRESS);
    const res = nl.handleConfirmLink(
      new URL(`${SITE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`),
      h,
    );
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(`${SITE}/sub/confirm`);
    expect(tokens.verifyConfirmToken(location.searchParams.get("token") ?? "")).toMatchObject({
      ok: true,
      email: ADDRESS,
    });
    expect(Object.values(h.listmonk).some((fn) => fn.mock.calls.length > 0)).toBe(false);
  });

  it("seals an old signed link, keeping its date, so the page URL holds no address", () => {
    const h = harness();
    const expiresAt = Date.now() + 5 * 24 * 60 * 60 * 1000;
    const res = nl.handleConfirmLink(
      new URL(`${SITE}/api/newsletter/confirm?token=${signedToken(ADDRESS, expiresAt)}`),
      h,
    );
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain(Buffer.from(ADDRESS).toString("base64").slice(0, 8));
    const sealed = new URL(location).searchParams.get("token") ?? "";
    const read = tokens.verifyConfirmToken(sealed);
    expect(read).toMatchObject({ ok: true, email: ADDRESS });
    expect(read.ok && read.issuedAt).toBe(expiresAt - tokens.CONFIRM_TOKEN_TTL_MS);
  });

  it("sends an expired, forged or missing token to the error page", () => {
    const h = harness();
    const expired = signedToken(ADDRESS, Date.now() - 1000);
    const cases: Array<[string, string]> = [
      [`?token=${expired}`, "expired"],
      ["?token=abc.def", "bad_signature"],
      ["", "missing"],
    ];
    for (const [query, reason] of cases) {
      const res = nl.handleConfirmLink(new URL(`${SITE}/api/newsletter/confirm${query}`), h);
      expect(res.headers.get("location")).toBe(`${SITE}/sub/error?reason=${reason}`);
    }
  });
});

describe("pressing the confirm button (POST)", () => {
  const press = (h: Harness, token = tokens.mintConfirmToken(ADDRESS)) =>
    nl.handleConfirmPress(
      new URL(`${SITE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`),
      h,
    );

  it("confirms with the token's date and sends one welcome copy with its unsubscribe link", async () => {
    const h = harness();
    const before = Date.now();
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/confirmed?welcome=1`);
    const [email, issuedAt] = h.listmonk.confirmSubscription.mock.calls[0];
    expect(email).toBe(ADDRESS);
    expect(issuedAt).toBeGreaterThanOrEqual(before - 1000);

    expect(h.listmonk.sendTransactional).toHaveBeenCalledTimes(1);
    const [sent] = h.listmonk.sendTransactional.mock.calls[0];
    expect(sent.subject).toBe("Welcome — Ruins");
    const link = /href="([^"]+)"/.exec(sent.html)?.[1] ?? "";
    const unsubscribe = decodeURIComponent(new URL(link).searchParams.get("token") ?? "");
    expect(tokens.verifyUnsubscribeToken(unsubscribe)).toBe(ADDRESS);
    expect(sent.headers).toEqual({
      "List-Unsubscribe": `<${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribe)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("sends no second copy when the address is already confirmed", async () => {
    const h = harness();
    h.listmonk.isConfirmedOnList.mockResolvedValue(true);
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/confirmed`);
    await h.settle();
    expect(h.listmonk.confirmSubscription).toHaveBeenCalledTimes(1);
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
  });

  it("sends one copy for a double click, and tells both presses the same", async () => {
    const h = harness();
    let release!: () => void;
    h.listmonk.isConfirmedOnList.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          release = () => done(false);
        }),
    );
    const first = press(h);
    const second = press(h);
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.headers.get("location")).toBe(b.headers.get("location"));
    expect(h.listmonk.isConfirmedOnList).toHaveBeenCalledTimes(1);
    expect(h.listmonk.sendTransactional).toHaveBeenCalledTimes(1);
  });

  it("reports a lookup failure before changing membership", async () => {
    const h = harness();
    h.listmonk.isConfirmedOnList.mockRejectedValue(new Error(`lookup ${ADDRESS}`));
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/error?reason=list_lookup_failed`);
    expect(h.listmonk.confirmSubscription).not.toHaveBeenCalled();
    await h.settle();
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), {
      source: "newsletter.confirm",
      event: "list_lookup_failed",
    });
    expect(logged.join("\n")).not.toContain(ADDRESS);
  });

  it("sends no welcome when ListMonk refuses the confirmation", async () => {
    const h = harness();
    h.listmonk.confirmSubscription.mockRejectedValue(new Error("suppressed"));
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/error?reason=list_add_failed`);
    expect(h.listmonk.sendTransactional).not.toHaveBeenCalled();
  });

  it("still confirms when the welcome copy fails", async () => {
    const h = harness();
    h.listmonk.sendTransactional.mockRejectedValue(new Error("tx down"));
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/confirmed`);
    await h.settle();
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), {
      source: "newsletter.confirm",
      event: "welcome_send_failed",
    });
  });

  it("can be pressed again after a failure", async () => {
    const h = harness();
    h.listmonk.confirmSubscription.mockRejectedValueOnce(new Error("blip"));
    await press(h);
    const res = await press(h);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/confirmed?welcome=1`);
  });

  it("refuses a forged or missing token and changes nothing", async () => {
    const h = harness();
    const forged = await nl.handleConfirmPress(
      new URL(`${SITE}/api/newsletter/confirm?token=abc.def`),
      h,
    );
    expect(forged.headers.get("location")).toBe(`${SITE}/sub/error?reason=bad_signature`);
    const missing = await nl.handleConfirmPress(new URL(`${SITE}/api/newsletter/confirm`), h);
    expect(missing.headers.get("location")).toBe(`${SITE}/sub/error?reason=missing`);
    expect(h.listmonk.confirmSubscription).not.toHaveBeenCalled();
  });
});

describe("unsubscribe", () => {
  const url = (token: string) =>
    new URL(`${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`);
  const post = (token: string, form?: Record<string, string>) =>
    new Request(url(token), {
      method: "POST",
      ...(form ? { body: new URLSearchParams(form) } : {}),
    });

  it("changes nothing on GET, which is all a mail filter does", () => {
    const h = harness();
    const token = tokens.mintUnsubscribeToken(ADDRESS);
    const res = nl.handleUnsubscribeLink(url(token), h);
    expect(res.headers.get("location")).toBe(
      `${SITE}/sub/unsubscribe?token=${encodeURIComponent(token)}`,
    );
    expect(h.listmonk.unsubscribeFromList).not.toHaveBeenCalled();
  });

  it("takes the address off the list from the page's button", async () => {
    const h = harness();
    const token = tokens.mintUnsubscribeToken(ADDRESS);
    const res = await nl.handleUnsubscribePress(post(token), url(token), h);
    expect(h.listmonk.unsubscribeFromList).toHaveBeenCalledWith(ADDRESS);
    expect(res.headers.get("location")).toBe(`${SITE}/sub/unsubscribe?done=1`);
  });

  it("refuses a confirm token and a forged one, and calls ListMonk for neither", async () => {
    const h = harness();
    for (const token of [tokens.mintConfirmToken(ADDRESS), "forged"]) {
      const res = await nl.handleUnsubscribePress(post(token), url(token), h);
      expect(res.headers.get("location")).toBe(`${SITE}/sub/unsubscribe?invalid=1`);
    }
    expect(h.listmonk.unsubscribeFromList).not.toHaveBeenCalled();
  });

  it("says so when ListMonk fails, keeps the button, and logs no address", async () => {
    const h = harness();
    h.listmonk.unsubscribeFromList.mockRejectedValue(new Error(`no ${ADDRESS}`));
    const token = tokens.mintUnsubscribeToken(ADDRESS);
    const res = await nl.handleUnsubscribePress(post(token), url(token), h);
    expect(res.headers.get("location")).toBe(
      `${SITE}/sub/unsubscribe?token=${encodeURIComponent(token)}&failed=1`,
    );
    await h.settle();
    expect(h.report).toHaveBeenCalledWith(expect.any(Error), {
      source: "newsletter.unsubscribe",
      event: "unsubscribe_failed",
    });
    expect(logged.join("\n")).not.toContain(ADDRESS);
  });

  it("answers a mail client's one-click with a status, never a redirect", async () => {
    const oneClick = { "List-Unsubscribe": "One-Click" };
    const token = tokens.mintUnsubscribeToken(ADDRESS);

    const ok = harness();
    const done = await nl.handleUnsubscribePress(post(token, oneClick), url(token), ok);
    expect([done.status, done.headers.get("location")]).toEqual([200, null]);

    const forged = await nl.handleUnsubscribePress(post("x", oneClick), url("x"), harness());
    expect([forged.status, forged.headers.get("location")]).toEqual([400, null]);

    const failing = harness();
    failing.listmonk.unsubscribeFromList.mockRejectedValue(new Error("down"));
    const failed = await nl.handleUnsubscribePress(post(token, oneClick), url(token), failing);
    expect([failed.status, failed.headers.get("location")]).toEqual([500, null]);
  });
});
