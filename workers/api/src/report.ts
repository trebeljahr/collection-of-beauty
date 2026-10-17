/**
 * Error reports from the API Worker to the GlitchTip project
 * `collection-of-beauty`, the project the browser reports to. The Next
 * server used `@sentry/node-core`, which does not run in a Worker; this
 * sends the same kind of event by hand, through the Sentry envelope API
 * GlitchTip accepts.
 *
 * What a report carries follows src/lib/error-reporting/scrub.ts and
 * /privacy: the error's type and its message through `scrubText` (URLs cut
 * at the query, addresses and bearer tokens replaced), `source` and
 * `event` tags, release and environment. No request, no headers, no stack
 * frames with their URLs. GlitchTip records the sender's address on
 * ingest; the sender here is a Cloudflare data centre, never the visitor.
 *
 * Off unless `SENTRY_DSN` is set (a Worker secret).
 */
import { releaseName, scrubText, usableDsn } from "../../../src/lib/error-reporting/scrub";

export type ReportContext = {
  source: "newsletter.subscribe" | "newsletter.confirm" | "newsletter.unsubscribe";
  event: string;
};

export type ReportEnv = {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  /** The deploying commit (wrangler `--var`), as the site's `build-commit`. */
  BUILD_COMMIT?: string;
};

export type Reporter = (error: unknown, context: ReportContext) => Promise<void>;

type ParsedDsn = { endpoint: string; key: string; dsn: string };

function parseDsn(raw: string | undefined): ParsedDsn | null {
  const value = usableDsn(raw);
  if (!value) return null;
  try {
    const url = new URL(value);
    const project = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !/^\d+$/.test(project)) return null;
    return {
      endpoint: `${url.origin}/api/${project}/envelope/`,
      key: url.username,
      dsn: value,
    };
  } catch {
    return null;
  }
}

function describe(error: unknown): { type: string; value: string } {
  if (error instanceof Error)
    return { type: error.name || "Error", value: scrubText(error.message) };
  return { type: "Error", value: scrubText(String(error)) };
}

export function createReporter(env: ReportEnv, send: typeof fetch = fetch): Reporter {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return async () => {};
  const release = releaseName(env.BUILD_COMMIT);

  return async (error, context) => {
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const now = new Date().toISOString();
    const event = {
      event_id: eventId,
      timestamp: now,
      platform: "javascript",
      level: "error",
      logger: "collection-of-beauty-api",
      environment: env.SENTRY_ENVIRONMENT || "production",
      ...(release ? { release } : {}),
      tags: { source: context.source, event: context.event, runtime: "cloudflare-worker" },
      exception: { values: [describe(error)] },
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: now, dsn: dsn.dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    try {
      await send(dsn.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=collection-of-beauty-api/1`,
        },
        body,
      });
    } catch {
      // A report that cannot be sent is dropped; the JSON log line stays.
    }
  };
}
