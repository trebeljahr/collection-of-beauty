import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.NEWSLETTER_TOKEN_SECRET = "fixture-confirm-secret";
vi.mock("@/lib/newsletter/subscribe", async () => {
  const actual = await vi.importActual<typeof import("@/lib/newsletter/subscribe")>(
    "@/lib/newsletter/subscribe",
  );
  return {
    ...actual,
    confirmSubscription: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/newsletter/editions", () => ({
  loadPublishedEditions: () => [{ fileSlug: "fixture" }],
}));
vi.mock("@/lib/newsletter/render", () => ({
  renderEdition: async () => ({ subject: "fixture", html: "<p>fixture</p>" }),
}));
vi.mock("@/lib/newsletter/listmonk", () => ({
  isConfirmedOnList: vi.fn(async () => false),
  sendTransactional: vi.fn(async () => {}),
}));

const { GET, POST } = await import("./route");
const { CONFIRM_TOKEN_TTL_MS, mintConfirmToken, confirmSubscription } = await import(
  "@/lib/newsletter/subscribe"
);
const { isConfirmedOnList, sendTransactional } = await import("@/lib/newsletter/listmonk");

const ADDRESS = "reader@example.com";

function link(token: string): string {
  return `http://localhost/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
}

/** What a mail filter does, and what a link from an old email does. */
function open(token: string): Promise<Response> {
  return GET(new NextRequest(link(token)));
}

function press(token: string): Promise<Response> {
  return POST(new NextRequest(link(token), { method: "POST" }));
}

/** A token as emails carried it until November 2026: the address readable, then a signature. */
function oldToken(email: string, issuedAt: number): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, x: issuedAt + CONFIRM_TOKEN_TTL_MS }),
  ).toString("base64url");
  const signature = createHmac("sha256", "fixture-confirm-secret")
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function expectNothingTouched(): void {
  expect(isConfirmedOnList).not.toHaveBeenCalled();
  expect(confirmSubscription).not.toHaveBeenCalled();
  expect(sendTransactional).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.mocked(confirmSubscription).mockReset().mockResolvedValue();
  vi.mocked(sendTransactional).mockReset().mockResolvedValue();
  vi.mocked(isConfirmedOnList).mockReset().mockResolvedValue(false);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("opening a confirm link", () => {
  it("leads to the page with the button, and changes nothing", async () => {
    const response = await open(mintConfirmToken(ADDRESS));

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sub/confirm");
    expect(location.searchParams.get("token")).toBeTruthy();
    expectNothingTouched();
  });

  it("takes an emailed link from before the button to the same page", async () => {
    const response = await open(oldToken(ADDRESS, Date.now() - 60_000));

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/sub/confirm");
    expectNothingTouched();
  });

  it("does not put the address of an old link in the page's URL", async () => {
    const old = oldToken(ADDRESS, Date.now());
    const response = await open(old);

    const location = response.headers.get("location") ?? "";
    const token = new URL(location).searchParams.get("token") ?? "";
    expect(location).not.toContain(old.split(".")[0]);
    expect(Buffer.from(token, "base64url").toString("latin1")).not.toContain(ADDRESS);
  });

  it("keeps an old link's date for the consent check", async () => {
    const issuedAt = Date.now() - 60_000;
    const opened = await open(oldToken(ADDRESS, issuedAt));
    const token = new URL(opened.headers.get("location") ?? "").searchParams.get("token") ?? "";

    await press(token);

    expect(confirmSubscription).toHaveBeenCalledWith(ADDRESS, issuedAt);
  });

  it("does not give an expired link new life", async () => {
    const issuedAt = Date.now() - CONFIRM_TOKEN_TTL_MS - 1;

    for (const token of [oldToken(ADDRESS, issuedAt), mintConfirmToken(ADDRESS, issuedAt)]) {
      const response = await open(token);
      expect(response.headers.get("location")).toContain("/sub/error?reason=expired");
    }
    expectNothingTouched();
  });

  it("sends a forged or missing token to the error page", async () => {
    const forged = await open(`${oldToken(ADDRESS, Date.now()).slice(0, -2)}XX`);
    expect(forged.headers.get("location")).toContain("/sub/error?reason=bad_signature");

    const missing = await GET(new NextRequest("http://localhost/api/newsletter/confirm"));
    expect(missing.headers.get("location")).toContain("/sub/error?reason=missing");
    expectNothingTouched();
  });
});

describe("pressing the button", () => {
  it("confirms and sends the welcome copy once", async () => {
    const response = await press(mintConfirmToken(ADDRESS));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/\/sub\/confirmed\?welcome=1$/);
    expect(confirmSubscription).toHaveBeenCalledTimes(1);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
    expect(sendTransactional).toHaveBeenCalledWith(expect.objectContaining({ to: ADDRESS }));
  });

  it("sends no second copy when the button is pressed again later", async () => {
    const token = mintConfirmToken(ADDRESS);
    await press(token);
    vi.mocked(isConfirmedOnList).mockResolvedValue(true);

    const response = await press(token);

    expect(response.headers.get("location")).toMatch(/\/sub\/confirmed$/);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
  });

  it("sends one copy for a double click, and tells both presses the same", async () => {
    const token = mintConfirmToken(ADDRESS);

    const [first, second] = await Promise.all([press(token), press(token)]);

    expect(confirmSubscription).toHaveBeenCalledTimes(1);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
    expect(first.headers.get("location")).toMatch(/\/sub\/confirmed\?welcome=1$/);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
  });

  it("does not make two addresses wait for each other", async () => {
    await Promise.all([
      press(mintConfirmToken(ADDRESS)),
      press(mintConfirmToken("other@example.com")),
    ]);

    expect(confirmSubscription).toHaveBeenCalledTimes(2);
    expect(sendTransactional).toHaveBeenCalledTimes(2);
  });

  it("can be pressed again after a failure", async () => {
    vi.mocked(isConfirmedOnList).mockRejectedValueOnce(new Error("ListMonk unavailable"));
    const token = mintConfirmToken(ADDRESS);
    await press(token);

    const response = await press(token);

    expect(response.headers.get("location")).toMatch(/\/sub\/confirmed\?welcome=1$/);
    expect(sendTransactional).toHaveBeenCalledTimes(1);
  });

  it("refuses a forged, expired or missing token and changes nothing", async () => {
    const issuedAt = Date.now() - CONFIRM_TOKEN_TTL_MS - 1;
    const answers = await Promise.all([
      press("forged"),
      press(mintConfirmToken(ADDRESS, issuedAt)),
      POST(new NextRequest("http://localhost/api/newsletter/confirm", { method: "POST" })),
    ]);

    expect(answers.map((answer) => answer.headers.get("location"))).toEqual([
      expect.stringContaining("/sub/error?reason=malformed"),
      expect.stringContaining("/sub/error?reason=expired"),
      expect.stringContaining("/sub/error?reason=missing"),
    ]);
    expectNothingTouched();
  });
});

describe("the log", () => {
  // What `listmonkFetch` throws when a lookup fails: its path holds the address.
  const refusal = new Error(
    `listmonk GET /api/subscribers?search=%5E${encodeURIComponent(ADDRESS)}%24: 500 refused`,
  );

  it.each([
    ["list_lookup_failed", () => vi.mocked(isConfirmedOnList).mockRejectedValueOnce(refusal)],
    ["list_add_failed", () => vi.mocked(confirmSubscription).mockRejectedValueOnce(refusal)],
    ["welcome_send_failed", () => vi.mocked(sendTransactional).mockRejectedValueOnce(refusal)],
  ])("names no address on %s", async (event, fail) => {
    vi.mocked(console.error).mockClear();
    fail();

    await press(mintConfirmToken(ADDRESS));

    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain(event);
    expect(logged).not.toMatch(/reader|example/);
  });
});

describe("confirmation consent boundary", () => {
  it("passes authenticated token issuance time to the consent check", async () => {
    const now = Date.now();
    const token = mintConfirmToken(ADDRESS, now);
    const response = await press(token);
    expect(confirmSubscription).toHaveBeenCalledWith(ADDRESS, now);
    expect(response.headers.get("location")).toContain("/sub/confirmed");
    expect(sendTransactional).toHaveBeenCalledTimes(1);
  });

  it("does not send a welcome when suppression blocks confirmation", async () => {
    vi.mocked(confirmSubscription).mockRejectedValueOnce(new Error("Subscriber is suppressed"));
    const response = await press(mintConfirmToken(ADDRESS));
    expect(response.headers.get("location")).toContain("reason=list_add_failed");
    expect(sendTransactional).not.toHaveBeenCalled();
  });

  it("reports a lookup failure before changing membership", async () => {
    vi.mocked(isConfirmedOnList).mockRejectedValueOnce(new Error("ListMonk unavailable"));
    const response = await press(mintConfirmToken(ADDRESS));
    expect(response.headers.get("location")).toContain("reason=list_lookup_failed");
    expect(confirmSubscription).not.toHaveBeenCalled();
    expect(sendTransactional).not.toHaveBeenCalled();
  });
});
