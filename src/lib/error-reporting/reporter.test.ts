import { describe, expect, it, vi } from "vitest";
import type * as Sdk from "./sdk";

let sdkImported = false;
vi.mock("@sentry/browser", () => {
  sdkImported = true;
  return {};
});

const { createErrorReporter, reportClientError, startErrorReporting } = await import("./reporter");

type Sentry = typeof Sdk;

/** A stand-in SDK that records what it was asked to do. */
const fakeSdk = () => {
  const init = vi.fn();
  const capture = vi.fn();
  const integration = (name: string) => () => ({ name });
  const sdk = {
    init,
    captureException: capture,
    eventFiltersIntegration: integration("EventFilters"),
    functionToStringIntegration: integration("FunctionToString"),
    browserApiErrorsIntegration: integration("BrowserApiErrors"),
    breadcrumbsIntegration: vi.fn(integration("Breadcrumbs")),
    globalHandlersIntegration: integration("GlobalHandlers"),
    linkedErrorsIntegration: integration("LinkedErrors"),
    dedupeIntegration: integration("Dedupe"),
    httpContextIntegration: integration("HttpContext"),
  } as unknown as Sentry;
  return { sdk, init, capture };
};

const options = (dsn: string, load: () => Promise<Sentry>) => ({
  dsn,
  load,
  release: "collection-of-beauty@eef0ebdd83da",
  environment: "production",
});

describe("without a DSN", () => {
  it("never loads the SDK, and reporting does nothing", async () => {
    const load = vi.fn();
    const reporter = createErrorReporter(options("", load));
    reporter.report(new Error("boom"), { source: "app" });
    expect(await reporter.start()).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("is what a build without one does: the default reporter imports nothing", async () => {
    expect(process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").toBe("");
    reportClientError(new Error("boom"), { source: "global" });
    expect(await startErrorReporting()).toBe(false);
    expect(sdkImported).toBe(false);
  });
});

describe("with a DSN", () => {
  it("loads the SDK once and starts it without tracing, replay, sessions or default integrations", async () => {
    const { sdk, init } = fakeSdk();
    const load = vi.fn(async () => sdk);
    const reporter = createErrorReporter(options("https://key@glitchtip.example.com/2", load));

    expect(await Promise.all([reporter.start(), reporter.start()])).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);

    const config = init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config).toMatchObject({
      dsn: "https://key@glitchtip.example.com/2",
      release: "collection-of-beauty@eef0ebdd83da",
      environment: "production",
      sendDefaultPii: false,
      sendClientReports: false,
      defaultIntegrations: false,
      initialScope: { tags: { platform: "web" } },
    });
    expect(config).not.toHaveProperty("tracesSampleRate");
    expect(config).not.toHaveProperty("replaysSessionSampleRate");
    const names = (config.integrations as Array<{ name: string }>).map((i) => i.name);
    expect(names).not.toContain("BrowserSession");
    expect(names).not.toContain("BrowserTracing");
    expect(names).not.toContain("Replay");
    expect(sdk.breadcrumbsIntegration).toHaveBeenCalledWith(
      expect.objectContaining({ console: false, dom: false }),
    );
  });

  it("sends the errors caught before the SDK loaded, with their tags", async () => {
    const { sdk, capture } = fakeSdk();
    let resolve: (value: Sentry) => void = () => undefined;
    const reporter = createErrorReporter(
      options("https://k@h/1", () => new Promise((r) => (resolve = r))),
    );

    const early = new Error("before mount");
    reporter.report(early, { source: "global", digest: "1234567890" });
    const chunk = new Error("Loading chunk 3 failed.");
    reporter.report(chunk, { source: "app", chunkReload: "refused" });
    expect(capture).not.toHaveBeenCalled();

    resolve(sdk);
    await reporter.start();
    expect(capture).toHaveBeenNthCalledWith(1, early, {
      tags: { source: "global", digest: "1234567890" },
    });
    expect(capture).toHaveBeenNthCalledWith(2, chunk, {
      tags: { source: "app", chunk_reload: "refused" },
    });

    const later = new Error("after");
    reporter.report(later, { source: "app" });
    expect(capture).toHaveBeenLastCalledWith(later, { tags: { source: "app" } });
  });

  it("gives up quietly when the SDK chunk cannot load", async () => {
    const reporter = createErrorReporter(
      options("https://k@h/1", () =>
        Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
      ),
    );
    reporter.report(new Error("boom"), { source: "app" });
    expect(await reporter.start()).toBe(false);
  });

  it("scrubs in beforeSend and drops a stale-deploy error the reload guard is handling", async () => {
    const { sdk, init } = fakeSdk();
    const reporter = createErrorReporter(options("https://k@h/1", async () => sdk));
    await reporter.start();
    const { beforeSend } = init.mock.calls[0]?.[0] as {
      beforeSend: (
        event: Record<string, unknown>,
        hint: Record<string, unknown>,
      ) => Record<string, unknown> | null;
    };
    expect(beforeSend({ user: { email: "a@b.co" }, message: "x" }, {})).toEqual({ message: "x" });
    const chunkError = new Error("Loading chunk 1 failed.");
    expect(beforeSend({ exception: { values: [] } }, { originalException: chunkError })).toBeNull();
  });
});
