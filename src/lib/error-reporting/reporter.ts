import {
  type CHUNK_RELOAD_REFUSED,
  releaseName,
  scrubBreadcrumb,
  scrubEvent,
  shouldDropEvent,
  usableDsn,
} from "./scrub";
import type * as Sdk from "./sdk";

/**
 * Error reports from the browser to the GlitchTip project
 * `collection-of-beauty`, the same project the server reports to
 * (`server.ts`).
 *
 * Opt-in per build: `NEXT_PUBLIC_SENTRY_DSN` comes from `.env.production`
 * and is inlined by `next build`, and a build without it never loads the
 * SDK. The SDK is a dynamic import started after mount
 * (`components/error-reporting.tsx`), so it is never part of the HTML or
 * the first chunks.
 *
 * What a report may contain is `scrub.ts`. What it adds is only the
 * release and the platform. No session replay, no performance tracing and
 * no session pings: the SDK sends something only when an error happens.
 */

/** The SDK surface the reporter uses: the named re-exports in `sdk.ts`. */
type Sentry = typeof Sdk;

/** Where a report was captured by this code, rather than by the SDK's global handlers. */
export interface ReportContext {
  /** `app` is app/error.tsx, `global` is app/global-error.tsx. */
  source: "app" | "global";
  /** Next's hash of a server-side error, the `ref:` the error card shows. */
  digest?: string;
  /** Set when the reload-once guard in lib/stale-deploy.ts refused to reload for this error. */
  chunkReload?: typeof CHUNK_RELOAD_REFUSED;
}

export interface ErrorReporter {
  /** Loads and starts the SDK once. Resolves false when there is no DSN or the SDK failed to load. */
  start(): Promise<boolean>;
  /** Reports an error an error boundary caught. A no-op without a DSN. */
  report(error: unknown, context: ReportContext): void;
}

export interface ErrorReporterOptions {
  dsn: string;
  /** Imports the SDK. Never called when `dsn` is empty. */
  load: () => Promise<Sentry>;
  release: string | undefined;
  environment: string;
}

/** Errors held while the SDK loads. An error before mount is the likeliest to matter. */
const MAX_PENDING = 20;

export function createErrorReporter(options: ErrorReporterOptions): ErrorReporter {
  let started: Promise<boolean> | null = null;
  let sdk: Sentry | null = null;
  let pending: Array<{ error: unknown; context: ReportContext }> = [];

  const capture = (client: Sentry, error: unknown, context: ReportContext): void => {
    client.captureException(error, {
      tags: {
        source: context.source,
        ...(context.digest ? { digest: context.digest } : {}),
        ...(context.chunkReload ? { chunk_reload: context.chunkReload } : {}),
      },
    });
  };

  const start = (): Promise<boolean> => {
    if (!options.dsn) return Promise.resolve(false);
    started ??= options
      .load()
      .then((client) => {
        client.init({
          dsn: options.dsn,
          release: options.release,
          environment: options.environment,
          sendDefaultPii: false,
          sendClientReports: false,
          // No tracing: no tracesSampleRate and no browserTracingIntegration.
          // The list replaces the SDK defaults, leaving out the session
          // integration (a ping on every page load), the culture context and
          // the DOM and console breadcrumbs.
          defaultIntegrations: false,
          integrations: [
            client.eventFiltersIntegration(),
            client.functionToStringIntegration(),
            client.browserApiErrorsIntegration(),
            client.breadcrumbsIntegration({
              console: false,
              dom: false,
              sentry: false,
              fetch: true,
              xhr: true,
              history: true,
            }),
            client.globalHandlersIntegration(),
            client.linkedErrorsIntegration(),
            client.dedupeIntegration(),
            client.httpContextIntegration(),
          ],
          maxBreadcrumbs: 30,
          beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
          beforeSend: (event, hint) => (shouldDropEvent(event, hint) ? null : scrubEvent(event)),
          initialScope: { tags: { platform: "web" } },
        });
        sdk = client;
        const held = pending;
        pending = [];
        for (const { error, context } of held) capture(client, error, context);
        return true;
      })
      .catch(() => {
        // The SDK chunk itself failed to load (offline, or a deploy removed
        // it). Caught here so it never reaches ReleaseNavigationGuard's
        // unhandledrejection listener as a stale-deploy error of the app's own.
        pending = [];
        return false;
      });
    return started;
  };

  return {
    start,
    report(error, context) {
      if (!options.dsn) return;
      if (sdk) {
        capture(sdk, error, context);
        return;
      }
      if (pending.length < MAX_PENDING) pending.push({ error, context });
      void start();
    },
  };
}

const DSN = usableDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * The SDK import, behind a condition on the inlined DSN in the same
 * expression. `next.config.mjs` defines `NEXT_PUBLIC_SENTRY_DSN` as "" when
 * it is unset, so in a build without it the condition is a literal and the
 * import, with the SDK chunk, drops out. The import names `./sdk`, not the
 * package, so the chunk holds only what the reporter uses.
 */
const loadSentry = (): Promise<Sentry> =>
  process.env.NEXT_PUBLIC_SENTRY_DSN
    ? import("./sdk")
    : Promise.reject(new Error("error reporting is not configured"));

const reporter = createErrorReporter({
  dsn: DSN,
  load: loadSentry,
  release: releaseName(process.env.NEXT_PUBLIC_BUILD_COMMIT),
  // `NEXT_PUBLIC_SENTRY_ENVIRONMENT=wiring-check` marks a test run; unset, it is the build mode.
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
});

/** Starts reporting if this build has a DSN. Call from an effect. */
export const startErrorReporting = (): Promise<boolean> => reporter.start();

/** Reports an error an error boundary caught. A no-op in a build without a DSN. */
export const reportClientError = (error: unknown, context: ReportContext): void =>
  reporter.report(error, context);
