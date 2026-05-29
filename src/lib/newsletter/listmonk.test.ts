import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findSubscriber, isConfirmedOnList, upsertSubscriber } from "./listmonk";

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
    expect(url.searchParams.get("search")).toBe("reader@example.com");
    expect(url.searchParams.get("query")).toBeNull();
    expect(url.searchParams.get("per_page")).toBe("all");
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

describe("upsertSubscriber", () => {
  it("adds the configured list to existing subscribers", async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ data: { results: [], total: 0 } }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { results: [subscriber], total: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ data: true }))
      .mockResolvedValueOnce(jsonResponse({ data: { results: [subscriber], total: 1 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(upsertSubscriber("reader@example.com", "unconfirmed")).resolves.toEqual(
      subscriber,
    );

    const updateCall = fetchMock.mock.calls[1];
    expect(new URL(updateCall[0] as string).pathname).toBe("/api/subscribers/lists");
    expect(updateCall[1]).toMatchObject({ method: "PUT" });
    expect(JSON.parse((updateCall[1] as RequestInit).body as string)).toEqual({
      ids: [42],
      action: "add",
      target_list_ids: [4],
      status: "unconfirmed",
    });
  });
});
