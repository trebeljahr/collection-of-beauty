import type { Breadcrumb, ErrorEvent } from "@sentry/browser";
import { describe, expect, it } from "vitest";
import {
  CHUNK_RELOAD_REFUSED,
  releaseName,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  shouldDropEvent,
  stripUrl,
  usableDsn,
} from "./scrub";

describe("stripUrl", () => {
  it("drops the query string and fragment of every kind of address the site has", () => {
    expect(stripUrl("https://collectionofbeauty.com/api/newsletter/confirm?token=abc.def")).toBe(
      "https://collectionofbeauty.com/api/newsletter/confirm",
    );
    expect(stripUrl("/artists?q=monet#top")).toBe("/artists");
    expect(stripUrl("/timeline#decade-1880")).toBe("/timeline");
  });

  it("drops credentials in the authority", () => {
    expect(stripUrl("https://user:secret@api.example.com/x")).toBe("https://api.example.com/x");
  });
});

describe("scrubText", () => {
  it("replaces email addresses and bearer tokens", () => {
    expect(scrubText("ListMonk refused jane.doe+art@example.co.uk")).toBe(
      "ListMonk refused [email]",
    );
    expect(scrubText("Authorization: Bearer abc.DEF-123_=")).toBe(
      "Authorization: Bearer [redacted]",
    );
  });

  it("keeps package paths that only look like addresses", () => {
    const path =
      "/app/node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3/build/Release/better_sqlite3.node";
    expect(scrubText(`The module '${path}' was compiled`)).toBe(
      `The module '${path}' was compiled`,
    );
    expect(scrubText("mailto:me@example.com")).toBe("mailto:[email]");
  });

  it("strips query strings from URLs and paths inside a message", () => {
    expect(
      scrubText(
        "fetch failed: https://listmonk.example/api/subscribers?query=email%3D'a@b.co' (500)",
      ),
    ).toBe("fetch failed: https://listmonk.example/api/subscribers (500)");
    expect(scrubText("redirect to /api/newsletter/confirm?token=deadbeef failed")).toBe(
      "redirect to /api/newsletter/confirm failed",
    );
  });

  it("leaves ordinary messages alone", () => {
    const message = "Minified React error #418; Cannot read properties of undefined (reading 'id')";
    expect(scrubText(message)).toBe(message);
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console, click and keypress breadcrumbs, whatever they hold", () => {
    expect(scrubBreadcrumb({ category: "console", message: "user jane@example.com" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.click", message: "input[name=email]" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "input#email" })).toBeNull();
    expect(scrubBreadcrumb({ message: "no category" })).toBeNull();
  });

  it("keeps method, status and a stripped URL of a request, and nothing else", () => {
    const crumb: Breadcrumb = {
      type: "http",
      category: "fetch",
      timestamp: 1,
      data: {
        method: "POST",
        status_code: 502,
        url: "/api/newsletter/subscribe?ref=footer",
        request_body_size: 10,
      },
    };
    expect(scrubBreadcrumb(crumb)).toEqual({
      type: "http",
      category: "fetch",
      level: undefined,
      timestamp: 1,
      data: { method: "POST", status_code: 502, url: "/api/newsletter/subscribe" },
    });
  });

  it("strips both ends of a navigation", () => {
    const crumb = scrubBreadcrumb({
      category: "navigation",
      data: { from: "/artists?q=jane@example.com", to: "/sub/error?reason=expired" },
    });
    expect(crumb?.data).toEqual({ from: "/artists", to: "/sub/error" });
  });
});

const baseEvent = (): ErrorEvent => ({
  type: undefined,
  event_id: "e",
  server_name: "3f2a9c0d1b7e",
  message: "Subscribe for jane@example.com failed",
  user: { id: "u1", email: "jane@example.com", ip_address: "203.0.113.9", username: "Jane" },
  extra: { body: "anything" },
  request: {
    method: "GET",
    url: "https://collectionofbeauty.com/api/newsletter/confirm?token=secret#frag",
    query_string: "token=secret",
    cookies: { session: "tok" },
    data: { email: "jane@example.com" },
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: "https://collectionofbeauty.com/?token=secret",
      Authorization: "Bearer tok",
      Cookie: "session=tok",
      "X-Forwarded-For": "203.0.113.9",
    },
  },
  contexts: {
    browser: { name: "Chrome" },
    os: { name: "macOS" },
    trace: { trace_id: "t", span_id: "s" },
    form: { email: "jane@example.com" },
  },
  exception: {
    values: [
      {
        type: "Error",
        value: "No subscriber jane@example.com at https://listmonk.example/api/x?token=secret",
        stacktrace: {
          frames: [
            {
              filename: "https://collectionofbeauty.com/_next/static/chunks/app.js?dpl=abc",
              abs_path: "https://collectionofbeauty.com/_next/static/chunks/app.js?dpl=abc",
              vars: { email: "jane@example.com" },
            },
          ],
        },
      },
    ],
  },
  breadcrumbs: [
    { category: "console", message: "jane@example.com" },
    { category: "navigation", data: { from: "/", to: "/sub/confirmed?token=secret" } },
  ],
});

describe("scrubEvent", () => {
  it("removes the person, the body, cookies, headers but the browser identifier, and every query string", () => {
    const event = scrubEvent(baseEvent());
    expect(event.user).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.request).toEqual({
      method: "GET",
      url: "https://collectionofbeauty.com/api/newsletter/confirm",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    expect(Object.keys(event.contexts ?? {}).sort()).toEqual(["browser", "os", "trace"]);
    expect(event.message).toBe("Subscribe for [email] failed");
    const exception = event.exception?.values?.[0];
    expect(exception?.value).toBe("No subscriber [email] at https://listmonk.example/api/x");
    expect(exception?.stacktrace?.frames?.[0]).toEqual({
      filename: "https://collectionofbeauty.com/_next/static/chunks/app.js",
      abs_path: "https://collectionofbeauty.com/_next/static/chunks/app.js",
    });
    expect(event.breadcrumbs).toEqual([
      {
        type: undefined,
        category: "navigation",
        level: undefined,
        timestamp: undefined,
        data: { from: "/", to: "/sub/confirmed" },
      },
    ]);
  });

  it("leaves nothing that looks like an email, a token or an address anywhere in the event", () => {
    const serialized = JSON.stringify(scrubEvent(baseEvent()));
    expect(serialized).not.toMatch(/jane@example\.com/);
    expect(serialized).not.toMatch(/secret/);
    expect(serialized).not.toMatch(/tok\b/);
    expect(serialized).not.toMatch(/203\.0\.113\.9/);
    expect(serialized).not.toMatch(/3f2a9c0d1b7e/);
  });
});

describe("shouldDropEvent", () => {
  const chunkEvent = (tags?: Record<string, string>): ErrorEvent => ({
    type: undefined,
    tags,
    exception: { values: [{ type: "ChunkLoadError", value: "Loading chunk 12 failed." }] },
  });

  it("drops a stale-deploy error the reload-once guard is handling", () => {
    expect(shouldDropEvent(chunkEvent(), {})).toBe(true);
    expect(
      shouldDropEvent(
        { type: undefined },
        { originalException: new TypeError("Failed to fetch dynamically imported module: /a.js") },
      ),
    ).toBe(true);
    expect(
      shouldDropEvent(
        {
          type: undefined,
          exception: { values: [{ type: "Error", value: "module factory is not available" }] },
        },
        {},
      ),
    ).toBe(true);
  });

  it("keeps one the guard refused", () => {
    expect(shouldDropEvent(chunkEvent({ chunk_reload: CHUNK_RELOAD_REFUSED }), {})).toBe(false);
  });

  it("keeps any other error", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    };
    expect(shouldDropEvent(event, { originalException: new TypeError("x is undefined") })).toBe(
      false,
    );
  });
});

describe("usableDsn", () => {
  it("takes a DSN and refuses an undecrypted or empty value", () => {
    expect(usableDsn(" https://abc123@glitchtip.trebeljahr.com/42 ")).toBe(
      "https://abc123@glitchtip.trebeljahr.com/42",
    );
    expect(usableDsn("encrypted:BDx0abc")).toBe("");
    expect(usableDsn("")).toBe("");
    expect(usableDsn(undefined)).toBe("");
  });
});

describe("releaseName", () => {
  it("is the app and the short commit, and nothing without a commit", () => {
    expect(releaseName("eef0ebdd83da77f46f2a0597eb0407de1df1aef2")).toBe(
      "collection-of-beauty@eef0ebdd83da",
    );
    expect(releaseName("development")).toBeUndefined();
    expect(releaseName(undefined)).toBeUndefined();
  });
});
