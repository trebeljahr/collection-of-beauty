import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyBridge } from "./bridge";

const original = { ...process.env };
beforeEach(() => {
  process.env = { ...original };
  for (const name of [
    "NEWSLETTER_BRIDGE_URL",
    "NEWSLETTER_BRIDGE_PASSWORD",
    "NEWSLETTER_BRIDGE_LIST_ROLE",
    "NEWSLETTER_WRITES_PAUSED",
    "NEWSLETTER_MIGRATION_STARTED_AT",
    "LISTMONK_MESSENGER",
  ])
    delete process.env[name];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"ok":true}')),
  );
});
afterEach(() => {
  process.env = { ...original };
  vi.unstubAllGlobals();
});
const configured = () => {
  process.env.NEWSLETTER_BRIDGE_URL = "https://news.example.com";
  process.env.LISTMONK_URL = "https://news.example.com";
  process.env.NEWSLETTER_BRIDGE_PASSWORD = "x".repeat(32);
  process.env.NEWSLETTER_BRIDGE_LIST_ROLE = "live";
};
describe("legacy bridge", () => {
  it("leaves the old transport unchanged when disabled", async () => {
    expect(await legacyBridge("prepare")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed for a migration without a bridge", async () => {
    process.env.LISTMONK_MESSENGER = "project-ses";
    // Missing cutoff must not silently restore the direct-write path.
    await expect(legacyBridge("confirm", "token")).rejects.toThrow(/required/);
  });
  it("forwards the raw signed token and project role with project-only auth", async () => {
    configured();
    expect(await legacyBridge("confirm", "signed-token")).toBe(true);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://news.example.com/bridge/confirm");
    expect(JSON.parse(init!.body as string)).toEqual({ token: "signed-token", role: "live" });
    expect(init!.redirect).toBe("error");
  });
  it("holds on bridge outage and never falls back to a direct write", async () => {
    configured();
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));
    await expect(legacyBridge("confirm", "signed-token")).rejects.toThrow(/held/);
  });
  it("refuses credential forwarding to another origin or a paused migration", async () => {
    configured();
    process.env.NEWSLETTER_BRIDGE_URL = "https://foreign.example.com";
    await expect(legacyBridge("prepare", "token")).rejects.toThrow(/invalid/);
    configured();
    process.env.NEWSLETTER_WRITES_PAUSED = "true";
    await expect(legacyBridge("prepare", "token")).rejects.toThrow(/paused/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
