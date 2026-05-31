import { createHmac, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/render";
import { createElement } from "react";
import ConfirmSubscription from "../../../emails/confirm-subscription";
import {
  isConfirmedOnList,
  confirmSubscription as listmonkConfirm,
  sendTransactional,
  upsertSubscriber,
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
  | { ok: true; email: string }
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
  if (typeof payload.e !== "string" || typeof payload.x !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (payload.x < now) return { ok: false, reason: "expired" };
  return { ok: true, email: payload.e };
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
 * Adds (or upserts) the subscriber on the configured ListMonk list with
 * the given subscription status. Re-exported under the historical
 * `addListMember` name so existing call sites in the API routes stay
 * tidy.
 */
export async function addListMember(email: string, confirmed: boolean = true): Promise<void> {
  await upsertSubscriber(email, confirmed ? "confirmed" : "unconfirmed");
}

/**
 * `true` when the address is already a confirmed member of the
 * environment-resolved list. Used by the subscribe endpoint to
 * short-circuit and skip the confirmation send for repeat signups.
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
  // will accept the send. Create them as `unconfirmed` so they show up
  // in the admin UI even if they never click the confirmation link.
  await upsertSubscriber(params.to, "unconfirmed");

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

/** Thin re-export so route code can stay close to its previous shape. */
export { listmonkConfirm as confirmSubscription };

// ────────────────────────────────────────────────────────────────────────────
// Rate limiter — per-IP, sliding window, in-memory.
//
// This intentionally resets on container restart. Subscribe is a low-volume
// endpoint (~one POST per legitimate user, ever) and the worst-case after a
// restart is a small spam burst that ends at the ListMonk layer (dedupe via
// upsert) anyway. A real shared store would be overkill.
// ────────────────────────────────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 5;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, now: number = Date.now()): boolean {
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

// Test-only — drop the bucket so unit tests don't bleed state across runs.
export function _resetRateLimit(): void {
  ipBuckets.clear();
}
