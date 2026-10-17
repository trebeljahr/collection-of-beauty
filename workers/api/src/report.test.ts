import { describe, expect, it, vi } from "vitest";
import { createReporter } from "./report";

const DSN = "https://abc123@glitchtip.example.com/7";

describe("createReporter", () => {
  it("sends nothing without a usable DSN", async () => {
    const send = vi.fn();
    await createReporter({}, send)(new Error("x"), { source: "newsletter.confirm", event: "e" });
    await createReporter({ SENTRY_DSN: "encrypted:abc" }, send)(new Error("x"), {
      source: "newsletter.confirm",
      event: "e",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("posts one scrubbed event to the project's envelope endpoint", async () => {
    const send = vi.fn(async () => new Response(null, { status: 200 }));
    const report = createReporter(
      { SENTRY_DSN: DSN, BUILD_COMMIT: "0123456789abcdef0123" },
      send as never,
    );
    await report(
      new Error("ListMonk refused new@example.com at https://lm.example/api/subscribers?query=x"),
      { source: "newsletter.subscribe", event: "send_failed" },
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://glitchtip.example.com/api/7/envelope/");
    expect(String((init.headers as Record<string, string>)["X-Sentry-Auth"])).toContain(
      "sentry_key=abc123",
    );
    const [, item, eventLine] = String(init.body).split("\n");
    expect(JSON.parse(item)).toEqual({ type: "event" });
    const event = JSON.parse(eventLine);
    expect(event.release).toBe("collection-of-beauty@0123456789ab");
    expect(event.tags).toMatchObject({ source: "newsletter.subscribe", event: "send_failed" });
    const text = JSON.stringify(event);
    expect(text).not.toContain("new@example.com");
    expect(text).not.toContain("query=x");
  });

  it("swallows a failed send", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      createReporter({ SENTRY_DSN: DSN }, send as never)(new Error("x"), {
        source: "newsletter.unsubscribe",
        event: "e",
      }),
    ).resolves.toBeUndefined();
  });
});
