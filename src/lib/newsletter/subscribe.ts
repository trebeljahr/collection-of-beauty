import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { render } from "@react-email/render";
import { createElement } from "react";
import AlreadySubscribed from "../../../emails/already-subscribed";
import ConfirmSubscription from "../../../emails/confirm-subscription";
import {
  ensureSubscriber,
  isConfirmedOnList,
  confirmSubscription as listmonkConfirm,
  sendTransactional,
} from "./listmonk";

// Confirmation tokens are valid for 21 days. Long enough that an email
// sitting in a vacation inbox still works on return, short enough that
// truly abandoned tokens eventually stop being one click from a live
// subscription.
export const CONFIRM_TOKEN_TTL_MS = 21 * 24 * 60 * 60 * 1000;

function tokenSecret(): string {
  const explicit = process.env.NEWSLETTER_TOKEN_SECRET;
  if (explicit) return explicit;
  const fallback = process.env.CRON_SECRET;
  if (fallback) return fallback;
  throw new Error("Missing NEWSLETTER_TOKEN_SECRET (or CRON_SECRET fallback)");
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

type TokenPayload = { e: string; x: number };

export function mintConfirmToken(email: string, now: number = Date.now()): string {
  const payload: TokenPayload = { e: email.toLowerCase(), x: now + CONFIRM_TOKEN_TTL_MS };
  const payloadStr = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64urlEncode(createHmac("sha256", tokenSecret()).update(payloadStr).digest());
  return `${payloadStr}.${sig}`;
}

export type VerifyResult =
  | { ok: true; email: string; issuedAt: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyConfirmToken(token: string, now: number = Date.now()): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadStr, sig] = parts;

  const expected = createHmac("sha256", tokenSecret()).update(payloadStr).digest();
  const provided = b64urlDecode(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadStr).toString("utf8")) as TokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof payload.e !== "string" ||
    typeof payload.x !== "number" ||
    !Number.isFinite(payload.x)
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (payload.x < now) return { ok: false, reason: "expired" };
  return { ok: true, email: payload.e, issuedAt: payload.x - CONFIRM_TOKEN_TTL_MS };
}

// An unsubscribe token has no expiry: an edition stays in an inbox for
// years, and its link has to work on the day it is clicked. It sits in the
// URL of a page that loads the site's scripts, so the address is encrypted,
// not only signed. All it lets its holder do is take that one address off
// the list. Rotating NEWSLETTER_TOKEN_SECRET breaks every link already sent.
//
// It has a key of its own. A confirm token must never pass here, and this
// one must never pass `verifyConfirmToken`, which would subscribe the address.
const UNSUBSCRIBE_IV_BYTES = 12;
const UNSUBSCRIBE_TAG_BYTES = 16;

function unsubscribeKey(): Buffer {
  return createHmac("sha256", tokenSecret()).update("newsletter-unsubscribe").digest();
}

export function mintUnsubscribeToken(email: string): string {
  const iv = randomBytes(UNSUBSCRIBE_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", unsubscribeKey(), iv);
  const body = Buffer.concat([cipher.update(email.toLowerCase(), "utf8"), cipher.final()]);
  return b64urlEncode(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

/** The address a token was minted for, or `null` when it is not one of ours. */
export function verifyUnsubscribeToken(token: string): string | null {
  const key = unsubscribeKey();
  const raw = b64urlDecode(token);
  const bodyStart = UNSUBSCRIBE_IV_BYTES + UNSUBSCRIBE_TAG_BYTES;
  if (raw.length <= bodyStart) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, UNSUBSCRIBE_IV_BYTES));
    decipher.setAuthTag(raw.subarray(UNSUBSCRIBE_IV_BYTES, bodyStart));
    const body = Buffer.concat([decipher.update(raw.subarray(bodyStart)), decipher.final()]);
    return body.toString("utf8");
  } catch {
    return null;
  }
}

// RFC 5322 is wildly permissive; this is the standard "good enough" check
// used by HTML5 forms. We rely on the confirmation step for actual proof
// of ownership, so the regex just keeps obvious garbage out.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * `true` when the address is already a confirmed member of the
 * environment-resolved list. Used by the subscribe endpoint to choose
 * which email to send. Never let this reach the form's response: anyone
 * can type anyone's address.
 *
 * Swallows network errors and returns `false` so a ListMonk hiccup
 * falls through to the normal send-confirmation path rather than 500ing
 * the public form.
 */
export async function isAlreadySubscribed(email: string): Promise<boolean> {
  try {
    return await isConfirmedOnList(email);
  } catch {
    return false;
  }
}

export type SendConfirmationEmailParams = {
  to: string;
  confirmUrl: string;
  /** Public URL of the cover artwork shown in the email header. */
  heroImageUrl: string;
  /** Permalink to the artwork's detail page on the site. */
  heroArtworkUrl: string;
  /** Short caption shown under the hero image. */
  heroCaption: string;
  /** Alt text — read by screen readers and shown when images are off. */
  heroAlt: string;
};

export async function sendConfirmationEmail(params: SendConfirmationEmailParams): Promise<void> {
  // The recipient must exist as a ListMonk subscriber before /api/tx
  // will accept the send. It stays off the list until the link is
  // clicked (see "Double opt-in and list membership" in listmonk.ts).
  await ensureSubscriber(params.to);

  const element = createElement(ConfirmSubscription, {
    confirmUrl: params.confirmUrl,
    heroImageUrl: params.heroImageUrl,
    heroArtworkUrl: params.heroArtworkUrl,
    heroCaption: params.heroCaption,
    heroAlt: params.heroAlt,
  });
  const html = await render(element);

  await sendTransactional({
    to: params.to,
    subject: "Confirm your subscription · Drops of Beauty",
    html,
  });
}

export type SendAlreadySubscribedEmailParams = {
  to: string;
  /** Public site root, linked from the email. */
  siteUrl: string;
};

/**
 * Tell a confirmed member that their address went through the form. No
 * token and no `ensureSubscriber`: the member exists in ListMonk already,
 * and there is nothing left for them to confirm.
 */
export async function sendAlreadySubscribedEmail(
  params: SendAlreadySubscribedEmailParams,
): Promise<void> {
  const html = await render(createElement(AlreadySubscribed, { siteUrl: params.siteUrl }));

  await sendTransactional({
    to: params.to,
    subject: "You're already on the list · Drops of Beauty",
    html,
  });
}

/** Thin re-exports so route code can stay close to its previous shape. */
export { isListmonkUp } from "./listmonk";
export { listmonkConfirm as confirmSubscription };

// ────────────────────────────────────────────────────────────────────────────
// Rate limiter — per-IP, sliding window, in-memory.
//
// This intentionally resets on container restart. Subscribe is a low-volume
// endpoint (~one POST per legitimate user, ever) and the worst-case after a
// restart is a small spam burst that ends at the ListMonk layer (dedupe in
// `ensureSubscriber`) anyway. A real shared store would be overkill.
// ────────────────────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 5;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  const current = ipBuckets.get(ip);
  if (!current || current.resetAt < now) {
    const bucket = { count: 1, resetAt: now + RATE_WINDOW_MS };
    ipBuckets.set(ip, bucket);
    // /privacy says an address is held for the window and then discarded, so
    // this cannot wait for a later request. `unref` lets a draining server exit.
    setTimeout(() => {
      if (ipBuckets.get(ip) === bucket) ipBuckets.delete(ip);
    }, RATE_WINDOW_MS).unref();
    return true;
  }
  if (current.count >= RATE_MAX_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

// Test-only — drop the bucket so unit tests don't bleed state across runs.
export function _resetRateLimit(): void {
  ipBuckets.clear();
}

// Test-only — how many addresses the limiter holds right now.
export function _rateLimitBuckets(): number {
  return ipBuckets.size;
}
