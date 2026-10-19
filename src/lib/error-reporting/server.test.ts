import { describe, expect, it, vi } from "vitest";

let sdkImported = false;
vi.mock("@sentry/node-core/light", () => {
  sdkImported = true;
  return {};
});

const { createServerReporter, reportServerError, startServerReporting } = await import("./server");

type Sentry = typeof import("@sentry/node-core/light");

/** A stand-in SDK that records what it was asked to do, and runs scopes for real enough. */
const fakeSdk = (initialized = false) => {
  const init = vi.fn();
  const capture = vi.fn();
  const processors: Array<(event: Record<string, unknown>) => Record<string, unknown>> = [];
  const scope = {
    setTags: vi.fn(),
    addEventProcessor: vi.fn((processor) => processors.push(processor)),
  };
  const integration = (name: string) => () => ({ name });
  const sdk = {
    isInitialized: () => initialized,
    initWithoutDefaultIntegrations: init,
    captureException: capture,
    withScope: (callback: (s: typeof scope) => void) => callback(scope),
    eventFiltersIntegration: integration("EventFilters"),
    functionToStringIntegration: integration("FunctionToString"),
    linkedErrorsIntegration: integration("LinkedErrors"),
    dedupeIntegration: integration("Dedupe"),
    onUncaughtExceptionIntegration: integration("OnUncaughtException"),
    onUnhandledRejectionIntegration: vi.fn(integration("OnUnhandledRejection")),
  } as unknown as Sentry;
  return { sdk, init, capture, scope, processors };
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
    const reporter = createServerReporter(options("", load));
    await reporter.report(new Error("boom"), { source: "request" });
    expect(await reporter.start()).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it("is what `next dev` and the tests do: the default reporter imports nothing", async () => {
    expect(process.env.SENTRY_DSN ?? "").toBe("");
    await reportServerError(new Error("boom"), { source: "newsletter.subscribe" });
    expect(await startServerReporting()).toBe(false);
    expect(sdkImported).toBe(false);
  });
});

describe("with a DSN", () => {
  it("starts the light SDK once, with errors only and no person", async () => {
    const { sdk, init } = fakeSdk();
    const load = vi.fn(async () => sdk);
    const reporter = createServerReporter(options("https://key@glitchtip.example.com/2", load));

    expect(await Promise.all([reporter.start(), reporter.start()])).toEqual([true, true]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
    const config = init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config).toMatchObject({
      dsn: "https://key@glitchtip.example.com/2",
      release: "collection-of-beauty@eef0ebdd83da",
      environment: "production",
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      initialScope: { tags: { platform: "server" } },
    });
    expect(config).not.toHaveProperty("tracesSampleRate");
    expect(sdk.onUnhandledRejectionIntegration).toHaveBeenCalledWith({ mode: "warn" });
  });

  it("leaves an SDK another bundle of this module started alone", async () => {
    const { sdk, init } = fakeSdk(true);
    const reporter = createServerReporter(options("https://k@h/1", async () => sdk));
    expect(await reporter.start()).toBe(true);
    expect(init).not.toHaveBeenCalled();
  });

  it("tags a request error and sends its path without the query", async () => {
    const { sdk, capture, scope, processors } = fakeSdk();
    const reporter = createServerReporter(options("https://k@h/1", async () => sdk));
    const error = new Error("render failed");
    await reporter.report(error, {
      source: "request",
      request: { method: "GET", path: "/api/newsletter/confirm?token=secret" },
      route: "/api/newsletter/confirm",
      routeType: "route",
      digest: "987",
    });
    expect(capture).toHaveBeenCalledWith(error);
    expect(scope.setTags).toHaveBeenCalledWith({
      source: "request",
      route: "/api/newsletter/confirm",
      route_type: "route",
      digest: "987",
    });
    expect(processors).toHaveLength(1);
    expect(processors[0]?.({})).toEqual({
      request: { method: "GET", url: "/api/newsletter/confirm" },
    });
  });

  it("scrubs in beforeSend", async () => {
    const { sdk, init } = fakeSdk();
    const reporter = createServerReporter(options("https://k@h/1", async () => sdk));
    await reporter.start();
    const { beforeSend } = init.mock.calls[0]?.[0] as {
      beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(
      beforeSend({
        server_name: "3f2a9c0d1b7e",
        user: { ip_address: "1.2.3.4" },
        message: "for a@b.co",
      }),
    ).toEqual({ message: "for [email]" });
  });

  it("swallows a failed SDK load", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reporter = createServerReporter(
      options("https://k@h/1", () => Promise.reject(new Error("no module"))),
    );
    await reporter.report(new Error("boom"), { source: "request" });
    expect(await reporter.start()).toBe(false);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
