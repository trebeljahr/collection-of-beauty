import { releaseName, scrubEvent, stripUrl, usableDsn } from "./scrub";

/**
 * Error reports from the Next server to the GlitchTip project
 * `collection-of-beauty`, the project the browser reports to (`reporter.ts`).
 *
 * Off unless `SENTRY_DSN` is set, which `.env.production` does for the
 * container: `dotenvx run` decrypts it when the server starts. `next dev`
 * never sees it. The SDK is `@sentry/node-core/light`, the Node SDK
 * without OpenTelemetry: no tracing, no instrumentation of `http` or
 * `fetch`, nothing sent but errors. It is imported on first use, so a
 * server without the DSN never loads it.
 *
 * Errors arrive three ways: `onRequestError` in `src/instrumentation.ts`
 * for anything a page, route handler or server action throws; the route
 * handlers that catch an error to answer with a message, which pass it to
 * `reportServerError` themselves; and the SDK's process handlers for an
 * uncaught exception or an unhandled rejection. Next keeps its own
 * handlers for both, so the SDK only reports and the process stays up as
 * before.
 */

type Sentry = typeof import("@sentry/node-core/light");

export interface ServerReportContext {
  /** `request` is Next's onRequestError; the others are a route handler's own catch. */
  source: "request" | "newsletter.subscribe" | "newsletter.confirm";
  /** What failed, for an error a route handler caught: `list_add_failed`. */
  event?: string;
  /** The request, as Next reports it. The query is cut before it is sent. */
  request?: { method: string; path: string };
  /** The route's file path (`/artwork/[id]`), never the address with its ids. */
  route?: string;
  /** `render`, `route`, `action` or `proxy`. */
  routeType?: string;
  /** Next's hash of the error, the `ref:` the error card shows the visitor. */
  digest?: string;
}

export interface ServerReporterOptions {
  dsn: string;
  /** Imports the SDK. Never called when `dsn` is empty. */
  load: () => Promise<Sentry>;
  release: string | undefined;
  environment: string;
}

export interface ServerReporter {
  /** Loads and starts the SDK once. Resolves false without a DSN or when the SDK failed to load. */
  start(): Promise<boolean>;
  report(error: unknown, context: ServerReportContext): Promise<void>;
}

export function createServerReporter(options: ServerReporterOptions): ServerReporter {
  let started: Promise<Sentry | null> | null = null;

  const load = (): Promise<Sentry | null> => {
    if (!options.dsn) return Promise.resolve(null);
    started ??= options
      .load()
      .then((client) => {
        // Next bundles instrumentation.ts apart from the route handlers, so
        // this module, and this guard's `started`, can exist twice in one
        // process. The SDK keeps its client on globalThis, which is one.
        if (client.isInitialized()) return client;
        client.initWithoutDefaultIntegrations({
          dsn: options.dsn,
          release: options.release,
          environment: options.environment,
          sendDefaultPii: false,
          sendClientReports: false,
          integrations: [
            client.eventFiltersIntegration(),
            client.functionToStringIntegration(),
            client.linkedErrorsIntegration(),
            client.dedupeIntegration(),
            client.onUncaughtExceptionIntegration(),
            client.onUnhandledRejectionIntegration({ mode: "warn" }),
          ],
          maxBreadcrumbs: 0,
          beforeSend: (event) => scrubEvent(event),
          initialScope: { tags: { platform: "server" } },
        });
        return client;
      })
      .catch((error: unknown) => {
        console.error(
          "[error-reporting] the SDK did not load; server errors are not reported",
          error,
        );
        return null;
      });
    return started;
  };

  return {
    start: () => load().then((client) => client !== null),
    async report(error, context) {
      const client = await load();
      if (!client) return;
      client.withScope((scope) => {
        scope.setTags({
          source: context.source,
          ...(context.event ? { event: context.event } : {}),
          ...(context.route ? { route: context.route } : {}),
          ...(context.routeType ? { route_type: context.routeType } : {}),
          ...(context.digest ? { digest: context.digest } : {}),
        });
        const request = context.request;
        if (request) {
          scope.addEventProcessor((event) => {
            event.request = { method: request.method, url: stripUrl(request.path) };
            return event;
          });
        }
        client.captureException(error);
      });
    },
  };
}

const reporter = createServerReporter({
  dsn: usableDsn(process.env.SENTRY_DSN),
  load: () => import("@sentry/node-core/light"),
  release: releaseName(process.env.NEXT_PUBLIC_BUILD_COMMIT),
  // `SENTRY_ENVIRONMENT=wiring-check` marks a test run; unset, it is the build mode.
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
});

/** Starts the SDK if this server has a DSN. Called once from `register()` in `src/instrumentation.ts`. */
export const startServerReporting = (): Promise<boolean> => reporter.start();

/**
 * Reports a server error. A no-op without `SENTRY_DSN`. Never throws, so a
 * route handler can call it in a catch block without a catch of its own.
 */
export const reportServerError = (error: unknown, context: ServerReportContext): Promise<void> =>
  reporter.report(error, context).catch(() => undefined);
