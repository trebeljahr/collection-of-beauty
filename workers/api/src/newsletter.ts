/**
 * Newsletter double opt-in and unsubscribe, moved out of the Next route
 * handlers when the site became a static export. Same behaviour as those
 * routes had on 11 November 2026 (src/app/api/newsletter/* in git history);
 * the ListMonk client and the token code are the modules the send CLI uses
 * (src/lib/newsletter/listmonk.ts, tokens.ts), which read their settings
 * from `process.env`, filled by `nodejs_compat` from this Worker's vars
 * and secrets.
 *
 *   POST /api/newsletter/subscribe    JSON { email, website } → JSON, as the form expects
 *   GET  /api/newsletter/confirm      old email link → 303 /sub/confirm, token sealed
 *   POST /api/newsletter/confirm      the button on /sub/confirm → list membership → 303
 *   GET  /api/newsletter/unsubscribe  List-Unsubscribe address → 303 /sub/unsubscribe
 *   POST /api/newsletter/unsubscribe  the page's button, or RFC 8058 one-click → off the list
 *
 * The emails are rendered at build time (src/lib/newsletter/worker-emails.ts)
 * with placeholders for the per-recipient tokens.
 *
 * No address and no IP on any log line or report: /privacy says the rate
 * limiter alone holds the address, for its one-minute window.
 */

import {
  CONFIRM_TOKEN_PLACEHOLDER,
  fillToken,
  UNSUBSCRIBE_TOKEN_PLACEHOLDER,
} from "../../../src/lib/newsletter/email-placeholders";
import {
  confirmSubscription,
  ensureSubscriber,
  isConfirmedOnList,
  isListmonkUp,
  sendTransactional,
  unsubscribeFromList,
} from "../../../src/lib/newsletter/listmonk";
import {
  mintConfirmToken,
  mintUnsubscribeToken,
  normalizeEmail,
  verifyConfirmToken,
  verifyUnsubscribeToken,
} from "../../../src/lib/newsletter/tokens";
import type { WorkerEmails } from "../../../src/lib/newsletter/worker-emails";
import type { Reporter } from "./report";

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type ListmonkClient = {
  confirmSubscription: typeof confirmSubscription;
  ensureSubscriber: typeof ensureSubscriber;
  isConfirmedOnList: typeof isConfirmedOnList;
  isListmonkUp: typeof isListmonkUp;
  sendTransactional: typeof sendTransactional;
  unsubscribeFromList: typeof unsubscribeFromList;
};

const LISTMONK: ListmonkClient = {
  confirmSubscription,
  ensureSubscriber,
  isConfirmedOnList,
  isListmonkUp,
  sendTransactional,
  unsubscribeFromList,
};

export type NewsletterDeps = {
  siteUrl: string;
  emails: WorkerEmails;
  limiter?: RateLimit;
  report: Reporter;
  /**
   * Runs `task` once the response is on its way and keeps the Worker alive
   * for it, as Next's `after` did (router.ts: `ctx.waitUntil`). The task
   * must not throw.
   */
  after: (task: () => Promise<unknown>) => void;
  /** Seam for tests. */
  listmonk?: Partial<ListmonkClient>;
};

type Scope = "newsletter.subscribe" | "newsletter.confirm" | "newsletter.unsubscribe";

function log(scope: Scope, level: "info" | "error", event: string, extra: object = {}): void {
  const line = JSON.stringify({ scope, level, event, ...extra });
  if (level === "error") console.error(line);
  else console.info(line);
}

function lm(deps: NewsletterDeps): ListmonkClient {
  return { ...LISTMONK, ...deps.listmonk };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

// ── subscribe ──────────────────────────────────────────────────────────────

/**
 * An IPv6 client is handed a /64 or more and can use any address in it, so its
 * bucket is the /64.
 */
export function ipv6Network(ip: string): string {
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const left = head.split(":").filter(Boolean);
  const right = tail.split(":").filter(Boolean);
  const zeros = Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0");
  return [...left, ...zeros, ...right]
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":");
}

/**
 * What the rate limiter keys on, which a client must not be able to choose.
 * Cloudflare sets `cf-connecting-ip` on every request that reaches a Worker
 * and answers 403 to a client that sends its own. A subrequest from a
 * Worker on another account can set it, and Cloudflare marks those with
 * `cf-worker`: they share one bucket with any request that has no address.
 */
export function rateLimitKey(request: Request): string {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || request.headers.has("cf-worker")) return "unknown";
  return ip.includes(":") ? ipv6Network(ip) : ip;
}

type SubscribeBody = {
  email?: string;
  /** Honeypot — bots fill hidden form fields; humans leave them empty. */
  website?: string;
};

/**
 * Send the email this address should get: a confirmation link, or a note
 * that it is already on the list. Only the address's owner learns which.
 */
async function mailAddress(email: string, deps: NewsletterDeps): Promise<void> {
  const client = lm(deps);
  // A lookup that fails falls through to the confirmation email, which
  // confirms nothing on its own.
  const confirmed = await client.isConfirmedOnList(email).catch(() => false);
  if (confirmed) {
    await client.sendTransactional({ to: email, ...deps.emails.alreadySubscribed });
    log("newsletter.subscribe", "info", "already_subscribed");
    return;
  }

  // The recipient must exist as a ListMonk subscriber before /api/tx will
  // accept the send. It stays off the list until the button is pressed.
  await client.ensureSubscriber(email);
  const { subject, html } = deps.emails.confirm;
  await client.sendTransactional({
    to: email,
    subject,
    html: fillToken(html, CONFIRM_TOKEN_PLACEHOLDER, mintConfirmToken(email)),
  });
  log("newsletter.subscribe", "info", "confirmation_sent");
}

export async function handleSubscribe(request: Request, deps: NewsletterDeps): Promise<Response> {
  if (deps.limiter && !(await deps.limiter.limit({ key: rateLimitKey(request) })).success) {
    log("newsletter.subscribe", "info", "rate_limited");
    return json(
      { error: "rate_limited", message: "Too many requests. Please wait a minute." },
      429,
    );
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return json(
      { error: "invalid_json", message: "Couldn't read the request. Please try again." },
      400,
    );
  }

  // Honeypot: real users never fill this. Return a 200-shaped success so
  // bots get no signal about what tripped them.
  if (typeof body?.website === "string" && body.website.trim().length > 0) {
    log("newsletter.subscribe", "info", "honeypot_triggered");
    return json({ ok: true });
  }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return json({ error: "invalid_email", message: "Please enter a valid email address." }, 400);
  }

  // The health check takes no address, so an outage can tell a visitor to try
  // again without saying anything about the address they typed.
  if (!(await lm(deps).isListmonkUp())) {
    deps.after(() =>
      deps.report(new Error("ListMonk health check failed"), {
        source: "newsletter.subscribe",
        event: "listmonk_unreachable",
      }),
    );
    log("newsletter.subscribe", "error", "listmonk_unreachable");
    return json(
      {
        error: "send_failed",
        message: "Could not send the email. Please try again in a few minutes.",
      },
      502,
    );
  }

  // Anyone can type anyone's address, so every valid address gets this same
  // answer, and it goes out before anything asks ListMonk about this one.
  // Waiting would give the answer away by time: a new address takes two
  // more ListMonk calls than a confirmed one. A send that fails after the
  // health check reaches GlitchTip and the log, and the form still says
  // "check your inbox".
  deps.after(() =>
    mailAddress(email, deps).catch(async (err: unknown) => {
      // No message: a failed lookup names the address in its path.
      log("newsletter.subscribe", "error", "send_failed");
      await deps.report(err, { source: "newsletter.subscribe", event: "send_failed" });
    }),
  );
  return json({ ok: true });
}

// ── confirm ────────────────────────────────────────────────────────────────

/**
 * The latest edition to the address that just finished double opt-in,
 * through ListMonk's transactional API. ListMonk substitutes no unsubscribe
 * link on this path, so the copy carries a signed link to our own page and
 * the mail client's own Unsubscribe button.
 */
async function sendWelcomeIssue(email: string, deps: NewsletterDeps): Promise<boolean> {
  const welcome = deps.emails.welcome;
  if (!welcome) return false;
  const token = mintUnsubscribeToken(email);
  await lm(deps).sendTransactional({
    to: email,
    subject: welcome.subject,
    html: fillToken(welcome.html, UNSUBSCRIBE_TOKEN_PLACEHOLDER, token),
    headers: {
      "List-Unsubscribe": `<${deps.siteUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  log("newsletter.confirm", "info", "welcome_sent", { edition: welcome.edition });
  return true;
}

/** Add the address to the list and answer with the page that says how it went. */
async function confirm(email: string, issuedAt: number, deps: NewsletterDeps): Promise<string> {
  const client = lm(deps);
  const site = deps.siteUrl;
  // A press on a stale token for an address that is already subscribed:
  // confirm again, but skip the welcome copy so a revisit does not send it twice.
  let alreadyConfirmed: boolean;
  try {
    alreadyConfirmed = await client.isConfirmedOnList(email);
  } catch (err) {
    // No message in the log, here or below: a failed lookup names the address in its path.
    log("newsletter.confirm", "error", "list_lookup_failed");
    deps.after(() =>
      deps.report(err, { source: "newsletter.confirm", event: "list_lookup_failed" }),
    );
    return `${site}/sub/error?reason=list_lookup_failed`;
  }

  try {
    await client.confirmSubscription(email, issuedAt);
  } catch (err) {
    log("newsletter.confirm", "error", "list_add_failed");
    deps.after(() => deps.report(err, { source: "newsletter.confirm", event: "list_add_failed" }));
    return `${site}/sub/error?reason=list_add_failed`;
  }

  let welcomeSent = false;
  if (!alreadyConfirmed) {
    try {
      welcomeSent = await sendWelcomeIssue(email, deps);
    } catch (err) {
      // The subscription is live already; the next issue will reach them.
      log("newsletter.confirm", "error", "welcome_send_failed");
      deps.after(() =>
        deps.report(err, { source: "newsletter.confirm", event: "welcome_send_failed" }),
      );
    }
  }

  log("newsletter.confirm", "info", "confirmed", { welcomeSent });
  return welcomeSent ? `${site}/sub/confirmed?welcome=1` : `${site}/sub/confirmed`;
}

/**
 * A double click posts twice, and the second lookup can run before the first
 * write lands: two welcome copies. A press that finds one running in this
 * isolate waits for it and answers the same. The address is held only while
 * that run lasts.
 */
const running = new Map<string, Promise<string>>();

/**
 * A link from an email changes nothing here: mail filters open every link in
 * an email. New emails link to `/sub/confirm` directly. Links sent before
 * November 2026 lead here for 21 days, carrying the address readable, so the
 * token is sealed before it reaches the page. It keeps its date, which
 * `confirmSubscription` compares with an unsubscribe, and its expiry.
 */
export function handleConfirmLink(url: URL, deps: NewsletterDeps): Response {
  const token = url.searchParams.get("token");
  if (!token) return redirect(`${deps.siteUrl}/sub/error?reason=missing`);

  const result = verifyConfirmToken(token);
  if (!result.ok) {
    log("newsletter.confirm", "info", "verify_failed", { reason: result.reason });
    return redirect(`${deps.siteUrl}/sub/error?reason=${result.reason}`);
  }
  const sealed = mintConfirmToken(result.email, result.issuedAt);
  return redirect(`${deps.siteUrl}/sub/confirm?token=${encodeURIComponent(sealed)}`);
}

/** The button on `/sub/confirm` posts here. */
export async function handleConfirmPress(url: URL, deps: NewsletterDeps): Promise<Response> {
  const token = url.searchParams.get("token");
  if (!token) return redirect(`${deps.siteUrl}/sub/error?reason=missing`);

  const result = verifyConfirmToken(token);
  if (!result.ok) {
    log("newsletter.confirm", "info", "verify_failed", { reason: result.reason });
    return redirect(`${deps.siteUrl}/sub/error?reason=${result.reason}`);
  }

  let run = running.get(result.email);
  if (!run) {
    run = confirm(result.email, result.issuedAt, deps).finally(() => running.delete(result.email));
    running.set(result.email, run);
  }
  return redirect(await run);
}

// ── unsubscribe ────────────────────────────────────────────────────────────

type Outcome = "done" | "invalid" | "failed";

async function unsubscribe(token: string, deps: NewsletterDeps): Promise<Outcome> {
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    log("newsletter.unsubscribe", "info", "verify_failed");
    return "invalid";
  }
  try {
    await lm(deps).unsubscribeFromList(email);
  } catch (err) {
    // No message in the log: a failed lookup names the address in its path.
    log("newsletter.unsubscribe", "error", "unsubscribe_failed");
    deps.after(() =>
      deps.report(err, { source: "newsletter.unsubscribe", event: "unsubscribe_failed" }),
    );
    return "failed";
  }
  log("newsletter.unsubscribe", "info", "unsubscribed");
  return "done";
}

/** A mail client's own Unsubscribe button posts this key (RFC 8058). */
async function isOneClick(request: Request): Promise<boolean> {
  const form = await request.formData().catch(() => null);
  return form?.get("List-Unsubscribe") === "One-Click";
}

const ONE_CLICK_STATUS: Record<Outcome, number> = { done: 200, invalid: 400, failed: 500 };

/**
 * The address in the welcome copy's `List-Unsubscribe` header. A mail client
 * without one-click opens it, and so does a mail filter, so it only leads to
 * the page. A GET that unsubscribed would take people off the list who never
 * asked.
 */
export function handleUnsubscribeLink(url: URL, deps: NewsletterDeps): Response {
  const token = url.searchParams.get("token") ?? "";
  return redirect(`${deps.siteUrl}/sub/unsubscribe?token=${encodeURIComponent(token)}`);
}

/**
 * Two buttons post here: the one on `/sub/unsubscribe`, and a mail client's
 * own. RFC 8058 forbids a redirect for the second, so it gets a status.
 */
export async function handleUnsubscribePress(
  request: Request,
  url: URL,
  deps: NewsletterDeps,
): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  const oneClick = await isOneClick(request);
  const outcome = await unsubscribe(token, deps);

  if (oneClick) {
    return new Response(null, {
      status: ONE_CLICK_STATUS[outcome],
      headers: { "Cache-Control": "no-store" },
    });
  }
  const query = {
    done: "done=1",
    invalid: "invalid=1",
    failed: `token=${encodeURIComponent(token)}&failed=1`,
  }[outcome];
  return redirect(`${deps.siteUrl}/sub/unsubscribe?${query}`);
}
