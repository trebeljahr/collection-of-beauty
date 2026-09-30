import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSubscription,
  ensureSubscriber,
  findSubscriber,
  isConfirmedOnList,
  sendCampaign,
  sendTransactional,
} from "./listmonk";

const subscriber = {
  id: 42,
  uuid: "sub-uuid",
  email: "reader@example.com",
  name: "reader@example.com",
  status: "enabled" as const,
  lists: [
    {
      id: 4,
      uuid: "list-uuid",
      name: "Dev list",
      subscription_status: "confirmed" as const,
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.LISTMONK_URL = "https://listmonk.test";
  process.env.LISTMONK_API_USER = "api-user";
  process.env.LISTMONK_API_TOKEN = "api-token";
  process.env.LISTMONK_LIST_ID = "4";
  process.env.LISTMONK_TX_TEMPLATE_ID = "5";
  process.env.LISTMONK_CAMPAIGN_TEMPLATE_ID = "6";
  process.env.SES_FROM_EMAIL = "noreply@example.com";
  delete process.env.LISTMONK_MESSENGER;
  delete process.env.NEWSLETTER_WRITES_PAUSED;
  delete process.env.NEWSLETTER_MIGRATION_STARTED_AT;
  delete process.env.LISTMONK_FROM;
  delete process.env.LISTMONK_REPLY_TO;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findSubscriber", () => {
  it("uses ListMonk search instead of SQL query permission", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        data: { results: [subscriber], total: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(findSubscriber("Reader@Example.com")).resolves.toEqual(subscriber);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/api/subscribers");
    expect(url.searchParams.get("search")).toBe("^reader@example\\.com$");
    expect(url.searchParams.get("query")).toBeNull();
    expect(url.searchParams.get("per_page")).toBe("all");
  });

  it("quotes regex characters so a plus-address matches itself", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { results: [], total: 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await findSubscriber("reader+test@example.com");

    const search = new URL(fetchMock.mock.calls[0][0] as string).searchParams.get("search");
    expect(search).toBe("^reader\\+test@example\\.com$");
    // Same semantics as Postgres `~*` for this pattern.
    expect(new RegExp(search as string, "i").test("reader+test@example.com")).toBe(true);
    expect(new RegExp(search as string, "i").test("readerrtest@example.com")).toBe(false);
  });

  it("exact-matches the email returned by broad search", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        data: {
          results: [{ ...subscriber, email: "other@example.com", name: "reader@example.com" }],
          total: 1,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(findSubscriber("reader@example.com")).resolves.toBeNull();
  });
});

describe("sendTransactional", () => {
  it("passes the configured ListMonk sender and reply-to overrides", async () => {
    process.env.LISTMONK_FROM = "Drops of Beauty <noreply@example.com>";
    process.env.LISTMONK_REPLY_TO = "Drops of Beauty <hello@example.com>";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendTransactional({
      to: "reader@example.com",
      subject: "Confirm your subscription",
      html: "<p>Hello</p>",
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({
      subscriber_email: "reader@example.com",
      template_id: 5,
      from_email: "Drops of Beauty <noreply@example.com>",
      headers: [{ "Reply-To": "Drops of Beauty <hello@example.com>" }],
    });
  });
});

describe("isConfirmedOnList", () => {
  it("checks membership on the configured list", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        data: { results: [subscriber], total: 1 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(isConfirmedOnList("reader@example.com")).resolves.toBe(true);
  });
});

type FetchCall = [RequestInfo | URL, RequestInit?];

/** Every request except the `findSubscriber` lookups, as "METHOD /path". */
function writes(calls: FetchCall[]): string[] {
  return calls
    .filter(([, init]) => (init?.method ?? "GET") !== "GET")
    .map(([input, init]) => `${init?.method} ${new URL(input as string).pathname}`);
}

function body(call: FetchCall): unknown {
  return JSON.parse(call[1]?.body as string);
}

describe("ensureSubscriber", () => {
  it("creates a missing subscriber on no list", async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: { results: [], total: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...subscriber, lists: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureSubscriber("Reader@Example.com");

    expect(writes(fetchMock.mock.calls)).toEqual(["POST /api/subscribers"]);
    expect(body(fetchMock.mock.calls[1])).toMatchObject({
      email: "reader@example.com",
      lists: [],
    });
  });

  it("leaves an existing subscriber's lists alone", async () => {
    // Unsubscribed from ours: submitting the form again must not re-add it.
    const existing = {
      ...subscriber,
      lists: [{ ...subscriber.lists[0], subscription_status: "unsubscribed" as const }],
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { results: [existing], total: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureSubscriber("reader@example.com")).resolves.toEqual(existing);
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });
});

describe("confirmSubscription", () => {
  it("adds an existing subscriber to the configured list as confirmed", async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ data: true }))
      .mockResolvedValueOnce(
        jsonResponse({ data: { results: [{ ...subscriber, lists: [] }], total: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await confirmSubscription("reader@example.com");

    expect(writes(fetchMock.mock.calls)).toEqual(["PUT /api/subscribers/lists"]);
    expect(body(fetchMock.mock.calls[1])).toEqual({
      ids: [42],
      action: "add",
      target_list_ids: [4],
      status: "confirmed",
    });
  });

  it("recreates a missing subscriber on the list, preconfirmed", async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ data: { results: [], total: 0 } }))
      .mockResolvedValueOnce(jsonResponse({ data: subscriber }));
    vi.stubGlobal("fetch", fetchMock);

    await confirmSubscription("reader@example.com");

    expect(writes(fetchMock.mock.calls)).toEqual(["POST /api/subscribers"]);
    expect(body(fetchMock.mock.calls[1])).toMatchObject({
      email: "reader@example.com",
      lists: [4],
      preconfirm_subscriptions: true,
    });
  });
});

describe("dedicated messenger", () => {
  const tx = { to: "reader@example.com", subject: "fixture", html: "<p>fixture</p>" };
  const campaign = { name: "fixture", subject: "fixture", html: "<p>fixture</p>", text: "fixture" };

  it("selects project-ses for transactional and campaign requests", async () => {
    process.env.LISTMONK_MESSENGER = "project-ses";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { id: 11 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendTransactional(tx);
    await sendCampaign(campaign);
    for (const call of fetchMock.mock.calls.slice(0, 2)) {
      expect(body(call)).toMatchObject({
        messenger: "project-ses",
        from_email: "noreply@example.com",
      });
      expect(body(call)).not.toHaveProperty("headers");
    }
  });

  it("keeps existing transport selection when no messenger is configured", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { id: 11 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendTransactional(tx);
    await sendCampaign(campaign);
    expect(body(fetchMock.mock.calls[0])).toMatchObject({ messenger: "email" });
    expect(body(fetchMock.mock.calls[1])).not.toHaveProperty("messenger");
  });

  it.each([
    "display-name",
    "foreign-sender",
    "reply-to",
  ])("rejects incompatible %s before a write", async (setting) => {
    process.env.LISTMONK_MESSENGER = "project-ses";
    if (setting === "display-name") process.env.LISTMONK_FROM = "CoB <noreply@example.com>";
    if (setting === "foreign-sender") process.env.LISTMONK_FROM = "foreign@example.com";
    if (setting === "reply-to") process.env.LISTMONK_REPLY_TO = "hello@example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTransactional(tx)).rejects.toThrow(/project-ses/);
    await expect(sendCampaign(campaign)).rejects.toThrow(/project-ses/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pauses all app newsletter writes before requesting Listmonk", async () => {
    process.env.NEWSLETTER_WRITES_PAUSED = "true";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const action of [
      () => ensureSubscriber(tx.to),
      () => confirmSubscription(tx.to),
      () => sendTransactional(tx),
      () => sendCampaign(campaign),
    ]) {
      await expect(action()).rejects.toThrow(/paused/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("consent and suppression", () => {
  function existing(value: object | null) {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ data: { results: value ? [value] : [], total: value ? 1 : 0 } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each([
    "disabled",
    "blocklisted",
  ])("does not confirm or send confirmation to %s subscribers", async (status) => {
    const fetchMock = existing({ ...subscriber, status });
    await expect(isConfirmedOnList(subscriber.email)).resolves.toBe(false);
    await expect(ensureSubscriber(subscriber.email)).rejects.toThrow(/suppressed/);
    await expect(confirmSubscription(subscriber.email, Date.now())).rejects.toThrow(/suppressed/);
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });

  it.each([
    undefined,
    "bad-date",
    "2026-09-30T00:00:00.000Z",
  ])("holds stale or unproven consent (%s)", async (date) => {
    const fetchMock = existing({
      ...subscriber,
      lists: [
        {
          ...subscriber.lists[0],
          subscription_status: "unsubscribed",
          subscription_updated_at: date,
        },
      ],
    });
    await expect(
      confirmSubscription(subscriber.email, Date.parse("2026-09-30T00:00:00.000Z")),
    ).rejects.toThrow(/consent timing|predates/);
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });

  it("allows fresh consent after an unsubscribe without enabling suppressed addresses", async () => {
    const fetchMock = existing({
      ...subscriber,
      lists: [
        {
          ...subscriber.lists[0],
          subscription_status: "unsubscribed",
          subscription_updated_at: "2026-09-29T00:00:00.000Z",
        },
      ],
    });
    await confirmSubscription(subscriber.email, Date.parse("2026-09-30T00:00:00.000Z"));
    expect(writes(fetchMock.mock.calls)).toEqual(["PUT /api/subscribers/lists"]);
  });

  it.each([
    null,
    { ...subscriber, lists: [] },
  ])("holds legacy orphan confirmations during migration", async (record) => {
    process.env.NEWSLETTER_MIGRATION_STARTED_AT = "2026-09-30T00:00:00.000Z";
    const fetchMock = existing(record);
    await expect(
      confirmSubscription(subscriber.email, Date.parse("2026-09-29T00:00:00.000Z")),
    ).rejects.toThrow(/suppression reconciliation/);
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });

  it("accepts a legacy token after reviewed project membership is present", async () => {
    process.env.NEWSLETTER_MIGRATION_STARTED_AT = "2026-09-30T00:00:00.000Z";
    const fetchMock = existing({
      ...subscriber,
      lists: [{ ...subscriber.lists[0], subscription_status: "unconfirmed" }],
    });
    await confirmSubscription(subscriber.email, Date.parse("2026-09-29T00:00:00.000Z"));
    expect(writes(fetchMock.mock.calls)).toEqual(["PUT /api/subscribers/lists"]);
  });

  it("allows new signups after migration starts", async () => {
    process.env.NEWSLETTER_MIGRATION_STARTED_AT = "2026-09-30T00:00:00.000Z";
    const fetchMock = existing(null);
    await confirmSubscription(subscriber.email, Date.parse("2026-09-30T00:01:00.000Z"));
    expect(writes(fetchMock.mock.calls)).toEqual(["POST /api/subscribers"]);
  });

  it("fails closed on an invalid migration date", async () => {
    process.env.NEWSLETTER_MIGRATION_STARTED_AT = "bad-date";
    const fetchMock = existing(subscriber);
    await expect(confirmSubscription(subscriber.email, Date.now())).rejects.toThrow(
      /timing is invalid/,
    );
    expect(writes(fetchMock.mock.calls)).toEqual([]);
  });
});
