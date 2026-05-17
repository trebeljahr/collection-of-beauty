import { createHmac, timingSafeEqual } from "node:crypto";
import formData from "form-data";
import Mailgun from "mailgun.js";

// Confirmation tokens are valid for 48 hours from issue. Past that the
// user has to start over from /sub. Keeps stale tokens from sitting in
// inboxes for months and pretending to still be one click from a live
// subscription.
export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

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
  const listAddress = required("MAILGUN_LIST");
  await client.lists.members.createMember(listAddress, {
    address: email,
    subscribed,
    upsert: "yes",
  });
}

export async function sendConfirmationEmail(params: {
  to: string;
  confirmUrl: string;
}): Promise<void> {
  const client = getClient();
  const domain = required("MAILGUN_DOMAIN");
  const from = required("MAILGUN_FROM");

  const subject = "Confirm your subscription · Collection of Beauty";
  const text =
    `Thanks for subscribing to the Collection of Beauty weekly digest.\n\n` +
    `Click the link below to confirm your email address. The link expires in 48 hours.\n\n` +
    `${params.confirmUrl}\n\n` +
    `If you didn't sign up, ignore this email — no list membership was created until you click.\n`;
  const html = `<!doctype html>
<html><body style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222; line-height: 1.55;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">Confirm your subscription</h1>
  <p style="margin: 0 0 12px;">Thanks for subscribing to the <strong>Collection of Beauty</strong> weekly digest — five public-domain works in your inbox, every Sunday.</p>
  <p style="margin: 0 0 24px;">Click the button below to confirm. The link expires in 48 hours.</p>
  <p style="margin: 0 0 24px;"><a href="${params.confirmUrl}" style="display: inline-block; background: #111; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 6px;">Confirm subscription</a></p>
  <p style="margin: 0 0 12px; font-size: 13px; color: #666;">Or paste this URL into your browser:</p>
  <p style="margin: 0 0 24px; font-size: 13px; color: #666; word-break: break-all;">${params.confirmUrl}</p>
  <p style="margin: 0; font-size: 13px; color: #666;">If you didn't sign up, ignore this email — no list membership is created until you click.</p>
</body></html>`;

  await client.messages.create(domain, {
    from,
    to: params.to,
    subject,
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
