import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@react-email/render";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmSubscription from "../../../../../emails/confirm-subscription";

process.env.NEWSLETTER_TOKEN_SECRET = "fixture-unsubscribe-secret";

const route = await import("./route");
const { GET: openConfirmLink, POST: confirm } = await import("../confirm/route");
const { mintConfirmToken, mintUnsubscribeToken } = await import("@/lib/newsletter/subscribe");

const ADDRESS = "reader@example.com";
const OUR_LIST = 4;

type Membership = {
  id: number;
  subscription_status: "confirmed" | "unsubscribed";
  subscription_updated_at: string;
};

/**
 * A ListMonk that keeps one subscriber and applies the two list actions the
 * way its SQL does. Unsubscribing moves the date, on the named list only,
 * and the subscriber's own status never changes.
 */
function fakeListmonk(lists: Membership[]) {
  const writes: unknown[] = [];
  const mails: { body: string; headers?: Record<string, string>[] }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    let answer: unknown = { data: true };
    if (url.includes("/api/subscribers?")) {
      answer = {
        data: {
          results: [{ id: 42, uuid: "sub", email: ADDRESS, name: "", status: "enabled", lists }],
          total: 1,
        },
      };
    } else if (url.endsWith("/api/subscribers/lists")) {
      writes.push(body);
      for (const id of body.target_list_ids) {
        const member = lists.find((list) => list.id === id);
        if (body.action === "add" && !member) {
          lists.push({
            id,
            subscription_status: body.status,
            subscription_updated_at: new Date().toISOString(),
          });
        } else if (member) {
          member.subscription_status = body.action === "add" ? body.status : "unsubscribed";
          member.subscription_updated_at = new Date().toISOString();
        }
      }
    } else if (url.endsWith("/api/tx")) {
      mails.push({ body: body.data.body, headers: body.headers });
    }
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { lists, writes, mails, fetchMock };
}

function post(token: string): Promise<Response> {
  const url = `http://localhost/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
  return route.POST(new NextRequest(url, { method: "POST" }));
}

function confirmUrl(token: string): string {
  return `http://localhost/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

function confirmClick(token: string): Promise<Response> {
  return confirm(new NextRequest(confirmUrl(token), { method: "POST" }));
}

beforeEach(() => {
  process.env.LISTMONK_URL = "https://listmonk.test";
  process.env.LISTMONK_API_USER = "api-user";
  process.env.LISTMONK_API_TOKEN = "api-token";
  process.env.LISTMONK_LIST_ID = String(OUR_LIST);
  process.env.LISTMONK_TX_TEMPLATE_ID = "5";
  process.env.SES_FROM_EMAIL = "noreply@example.com";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the welcome copy's unsubscribe link", () => {
  it("is in the real edition, and takes that address off the list as a campaign does", async () => {
    const listmonk = fakeListmonk([
      { id: 99, subscription_status: "confirmed", subscription_updated_at: "2026-01-01T00:00:00Z" },
    ]);

    await confirmClick(mintConfirmToken(ADDRESS));

    const html = listmonk.mails[0]?.body ?? "";
    expect(html).not.toContain("{{");
    const href = html.match(/<a[^>]*href="([^"]+)"[^>]*>\s*Unsubscribe\s*</)?.[1] ?? "";
    expect(href).toMatch(/\/sub\/unsubscribe\?token=/);
    const token = decodeURIComponent(new URL(href).searchParams.get("token") ?? "");

    const response = await post(token);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/\/sub\/unsubscribe\?done=1$/);

    expect(listmonk.writes.at(-1)).toEqual({
      ids: [42],
      action: "unsubscribe",
      target_list_ids: [OUR_LIST],
    });
    const status = (id: number) =>
      listmonk.lists.find((list) => list.id === id)?.subscription_status;
    expect(status(OUR_LIST)).toBe("unsubscribed");
    // Another project's list on the same ListMonk is left alone.
    expect(status(99)).toBe("confirmed");
  });

  it("leaves the address suppressed: a confirm link minted earlier cannot re-add it", async () => {
    const listmonk = fakeListmonk([
      {
        id: OUR_LIST,
        subscription_status: "confirmed",
        subscription_updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const staleConfirm = mintConfirmToken(ADDRESS, Date.now() - 60_000);

    await post(mintUnsubscribeToken(ADDRESS));
    const writesAfterUnsubscribe = listmonk.writes.length;
    const response = await confirmClick(staleConfirm);

    expect(response.headers.get("location")).toContain("reason=list_add_failed");
    expect(listmonk.writes).toHaveLength(writesAfterUnsubscribe);
    expect(listmonk.mails).toHaveLength(0);
  });

  it("leaves the address suppressed when that link is opened first, as an old email's is", async () => {
    const listmonk = fakeListmonk([
      {
        id: OUR_LIST,
        subscription_status: "confirmed",
        subscription_updated_at: "2026-01-01T00:00:00Z",
      },
    ]);
    const staleConfirm = mintConfirmToken(ADDRESS, Date.now() - 60_000);

    await post(mintUnsubscribeToken(ADDRESS));
    const writesAfterUnsubscribe = listmonk.writes.length;
    const opened = await openConfirmLink(new NextRequest(confirmUrl(staleConfirm)));
    const sealed = new URL(opened.headers.get("location") ?? "").searchParams.get("token") ?? "";
    const response = await confirmClick(sealed);

    expect(response.headers.get("location")).toContain("reason=list_add_failed");
    expect(listmonk.writes).toHaveLength(writesAfterUnsubscribe);
    expect(listmonk.mails).toHaveLength(0);
  });

  it("calls ListMonk for nothing when the confirm link is only opened", async () => {
    const listmonk = fakeListmonk([]);

    const response = await openConfirmLink(new NextRequest(confirmUrl(mintConfirmToken(ADDRESS))));

    expect(response.headers.get("location")).toContain("/sub/confirm?token=");
    expect(listmonk.fetchMock).not.toHaveBeenCalled();
  });

  it("adds the address and sends one welcome copy when the confirm button is pressed", async () => {
    const listmonk = fakeListmonk([]);

    const response = await confirmClick(mintConfirmToken(ADDRESS));

    expect(response.headers.get("location")).toMatch(/\/sub\/confirmed\?welcome=1$/);
    expect(listmonk.lists).toEqual([
      expect.objectContaining({ id: OUR_LIST, subscription_status: "confirmed" }),
    ]);
    expect(listmonk.mails).toHaveLength(1);
  });

  it("does not move the unsubscribe date on a second press", async () => {
    const date = "2026-01-01T00:00:00Z";
    const listmonk = fakeListmonk([
      { id: OUR_LIST, subscription_status: "unsubscribed", subscription_updated_at: date },
    ]);

    const response = await post(mintUnsubscribeToken(ADDRESS));

    expect(response.headers.get("location")).toMatch(/\?done=1$/);
    expect(listmonk.writes).toEqual([]);
    expect(listmonk.lists[0].subscription_updated_at).toBe(date);
  });

  it("changes nothing on GET, which is all a mail filter does", async () => {
    const listmonk = fakeListmonk([]);
    const token = mintUnsubscribeToken(ADDRESS);
    const url = `http://localhost/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;

    const response = route.GET(new NextRequest(url));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sub/unsubscribe");
    expect(location.searchParams.get("token")).toBe(token);
    expect(listmonk.fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a confirm token and a forged one, and calls ListMonk for neither", async () => {
    const listmonk = fakeListmonk([]);

    for (const token of [mintConfirmToken(ADDRESS), "forged", ""]) {
      const response = await post(token);
      expect(response.headers.get("location")).toMatch(/\/sub\/unsubscribe\?invalid=1$/);
    }
    expect(listmonk.fetchMock).not.toHaveBeenCalled();
  });

  it("says so when ListMonk fails, keeps the button, and logs no address", async () => {
    const token = mintUnsubscribeToken(ADDRESS);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        return new Response(`refused ${String(input)}`, { status: 500 });
      }),
    );

    const response = await post(token);

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sub/unsubscribe");
    expect(location.searchParams.get("failed")).toBe("1");
    expect(location.searchParams.get("token")).toBe(token);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("unsubscribe_failed");
    expect(logged).not.toMatch(/reader|example\.com/);
  });
});

describe("the mail client's own Unsubscribe button", () => {
  const confirmed = (): Membership[] => [
    {
      id: OUR_LIST,
      subscription_status: "confirmed",
      subscription_updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  function urlEncoded(): URLSearchParams {
    return new URLSearchParams({ "List-Unsubscribe": "One-Click" });
  }

  function multipart(): FormData {
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    return form;
  }

  function press(url: string, body: BodyInit): Promise<Response> {
    return route.POST(new NextRequest(url, { method: "POST", body }));
  }

  it.each([
    ["application/x-www-form-urlencoded", urlEncoded],
    ["multipart/form-data", multipart],
  ])("takes the address off the list from the real send's headers, by %s, with no redirect", async (_type, body) => {
    const listmonk = fakeListmonk([]);
    await confirmClick(mintConfirmToken(ADDRESS));

    const headers = Object.assign({}, ...(listmonk.mails[0]?.headers ?? []));
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = headers["List-Unsubscribe"]?.match(/^<(.+)>$/)?.[1] ?? "";
    expect(url).toContain("/api/newsletter/unsubscribe?token=");

    const response = await press(url, body());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(listmonk.writes.at(-1)).toEqual({
      ids: [42],
      action: "unsubscribe",
      target_list_ids: [OUR_LIST],
    });
  });

  it("answers a forged token and a ListMonk failure with a status, never a redirect", async () => {
    fakeListmonk(confirmed());
    const forged = await press(
      "http://localhost/api/newsletter/unsubscribe?token=forged",
      urlEncoded(),
    );
    expect(forged.status).toBe(400);
    expect(forged.headers.get("location")).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    const token = encodeURIComponent(mintUnsubscribeToken(ADDRESS));
    const failed = await press(
      `http://localhost/api/newsletter/unsubscribe?token=${token}`,
      urlEncoded(),
    );
    expect(failed.status).toBe(500);
    expect(failed.headers.get("location")).toBeNull();
  });

  it("still sends the page's own button back to the page", async () => {
    fakeListmonk(confirmed());
    const token = encodeURIComponent(mintUnsubscribeToken(ADDRESS));

    const response = await press(
      `http://localhost/api/newsletter/unsubscribe?token=${token}`,
      new URLSearchParams(),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/\/sub\/unsubscribe\?done=1$/);
  });
});

describe("what the pages promise", () => {
  it("/privacy and the confirmation email both say what ships", async () => {
    const privacy = readFileSync(path.join(process.cwd(), "src/app/privacy/page.tsx"), "utf8");
    const policy = privacy.replace(/\s+/g, " ");
    expect(policy).toContain("the unsubscribe link in every issue");
    expect(policy).toContain("press the button on that page");
    expect(policy).not.toContain("clicking the confirmation link");

    const email = await render(createElement(ConfirmSubscription as React.ComponentType), {
      plainText: true,
    });
    const line = email.replace(/\s+/g, " ");
    expect(line).toContain("every edition carries an unsubscribe link in its footer");
    expect(line).toContain("until you press that button");
    expect(line).toContain("/sub/confirm?token=");
    expect(line).not.toMatch(/one[- ]click/i);
    expect(line).not.toContain("until you click");
    expect(line).not.toContain("/api/newsletter/confirm");
  });
});
