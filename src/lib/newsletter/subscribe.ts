import { createHmac, timingSafeEqual } from "node:crypto";
import { render } from "@react-email/render";
import formData from "form-data";
import Mailgun from "mailgun.js";
import { createElement } from "react";
import ConfirmSubscription from "../../../emails/confirm-subscription";
import { resolveListAddress } from "./mailgun";

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

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getClient() {
  const mg = new Mailgun(formData);
  return mg.client({
    username: "api",
    key: required("MAILGUN_API_KEY"),
    url: process.env.MAILGUN_API_URL ?? "https://api.mailgun.net",
  });
}

/**
 * Add (or upsert) a member to the configured Mailgun mailing list. We use
 * upsert=yes so re-confirming an existing address is a no-op rather than
 * an error, and `subscribed` defaults to true since this only runs after
 * the user clicked the confirmation link.
 */
export async function addListMember(email: string, subscribed: boolean = true): Promise<void> {
  const client = getClient();
  const listAddress = resolveListAddress();
  await client.lists.members.createMember(listAddress, {
    address: email,
    subscribed,
    upsert: "yes",
  });
}

/**
 * Returns `true` when the email is already a confirmed (`subscribed`)
 * member of the list. Used by the subscribe endpoint to short-circuit
 * and skip the confirmation send for repeat signups.
 *
 * Returns `false` on any error (member not found, network blip, etc.) —
 * the caller falls through to the normal "send a confirmation" path,
 * which is the right thing to do. Mailgun's `upsert: "yes"` makes the
 * downstream add idempotent.
 */
export async function isAlreadySubscribed(email: string): Promise<boolean> {
  try {
    const client = getClient();
    const listAddress = resolveListAddress();
    const member = await client.lists.members.getMember(listAddress, email);
    return Boolean(member.subscribed);
  } catch {
    return false;
  }
}

export async function sendConfirmationEmail(params: {
  to: string;
  confirmUrl: string;
}): Promise<void> {
  const client = getClient();
  const domain = required("MAILGUN_DOMAIN");
  const from = required("MAILGUN_FROM");

  const element = createElement(ConfirmSubscription, { confirmUrl: params.confirmUrl });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  await client.messages.create(domain, {
    from,
    to: params.to,
    subject: "Confirm your subscription · Collection of Beauty",
    html,
    text,
    "o:tracking": "no",
    "o:tracking-clicks": "no",
    "o:tracking-opens": "no",
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Rate limiter — per-IP, sliding window, in-memory.
//
// This intentionally resets on container restart. Subscribe is a low-volume
// endpoint (~one POST per legitimate user, ever) and the worst-case after a
// restart is a small spam burst that ends at the Mailgun layer (dedupe via
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
