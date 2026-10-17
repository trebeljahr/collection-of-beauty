// collection-of-beauty-api: the part of collectionofbeauty.com that is not
// a static file. Cloudflare sends it two paths, by route:
//
//   collectionofbeauty.com/api/newsletter/*  → newsletter.ts
//   collectionofbeauty.com/api/download/*    → download.ts
//
// Everything else on the host is the static export, served by the assets
// Worker `collection-of-beauty` without running any code. Each request
// here counts toward the account's Workers request quota; static files
// do not. See workers/api/README.md.
//
// The entry module (index.ts) may export handlers only, so the router
// lives here where tests can import it.

import { SECURITY_HEADERS } from "../../../scripts/static-routing.mjs";
import type { WorkerEmails } from "../../../src/lib/newsletter/worker-emails";
import downloads from "../generated/downloads.json";
import emails from "../generated/emails.json";
import { type DownloadManifest, handleDownload } from "./download";
import {
  handleConfirmLink,
  handleConfirmPress,
  handleSubscribe,
  handleUnsubscribeLink,
  handleUnsubscribePress,
  type RateLimit,
} from "./newsletter";
import { createReporter, type ReportEnv } from "./report";

export interface Env extends ReportEnv {
  /** Public origin of the site; links and redirects point here. */
  SITE_URL: string;
  /** Public asset host the variants are read from. */
  ASSETS_BASE_URL: string;
  SUBSCRIBE_LIMITER?: RateLimit;
  // LISTMONK_*, NEWSLETTER_TOKEN_SECRET and SENTRY_DSN are secrets. The
  // first two reach the shared ListMonk client and token code through
  // process.env (nodejs_compat).
}

type NewsletterOverrides = Parameters<typeof handleSubscribe>[1]["listmonk"];

const DOWNLOAD_PATH = /^\/api\/download\/([^/]+)\/?$/;

function methodNotAllowed(allow: string): Response {
  return new Response("Method not allowed", { status: 405, headers: { Allow: allow } });
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

/** The site's browser-hardening headers, which `_headers` gives every
 *  static file but not a Worker's own responses. A copy, since a
 *  `Response.redirect` comes with headers that cannot be changed. */
export function withSecurityHeaders(response: Response): Response {
  const out = new Response(response.body, response);
  for (const { key, value } of SECURITY_HEADERS) out.headers.set(key, value);
  return out;
}

export type Context = { waitUntil(work: Promise<unknown>): void };

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: Context,
  overrides: { listmonk?: NewsletterOverrides } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const siteUrl = trimSlash(env.SITE_URL);
  const deps = {
    siteUrl,
    emails: emails as WorkerEmails,
    limiter: env.SUBSCRIBE_LIMITER,
    report: createReporter(env),
    // After the response, as Next's `after`: a timer turn first, so the
    // mail work cannot start before the answer is on its way.
    after: (task: () => Promise<unknown>) =>
      ctx.waitUntil(new Promise((settle) => setTimeout(settle, 0)).then(task)),
    listmonk: overrides.listmonk,
  };
  const isGet = request.method === "GET" || request.method === "HEAD";

  if (url.pathname === "/api/newsletter/subscribe") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return handleSubscribe(request, deps);
  }
  if (url.pathname === "/api/newsletter/confirm") {
    if (request.method === "POST") return handleConfirmPress(url, deps);
    if (isGet) return handleConfirmLink(url, deps);
    return methodNotAllowed("GET, POST");
  }
  if (url.pathname === "/api/newsletter/unsubscribe") {
    if (request.method === "POST") return handleUnsubscribePress(request, url, deps);
    if (isGet) return handleUnsubscribeLink(url, deps);
    return methodNotAllowed("GET, POST");
  }
  const download = DOWNLOAD_PATH.exec(url.pathname);
  if (download) {
    if (!isGet) return methodNotAllowed("GET");
    let id: string;
    try {
      id = decodeURIComponent(download[1]);
    } catch {
      return new Response("Not found", { status: 404 });
    }
    return handleDownload(
      url,
      id,
      downloads as unknown as DownloadManifest,
      trimSlash(env.ASSETS_BASE_URL),
    );
  }
  return Response.json({ error: "Not found." }, { status: 404 });
}
