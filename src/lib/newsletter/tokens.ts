/**
 * Newsletter tokens and address checks, with nothing but node:crypto in
 * them: the API Worker (workers/api) imports this module, and the send CLI
 * and tests reach it through subscribe.ts.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// Confirmation tokens are valid for 21 days. Long enough that an email
// sitting in a vacation inbox still works on return, short enough that
// truly abandoned tokens eventually stop being one button press from a live
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

// A sealed token is AES-GCM with a key per purpose: the address cannot be read
// from it, and a token for one purpose never passes as the other's.
const SEAL_IV_BYTES = 12;
const SEAL_TAG_BYTES = 16;
type SealPurpose = "newsletter-confirm" | "newsletter-unsubscribe";

function sealKey(purpose: SealPurpose): Buffer {
  return createHmac("sha256", tokenSecret()).update(purpose).digest();
}

function seal(purpose: SealPurpose, text: string): string {
  const iv = randomBytes(SEAL_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", sealKey(purpose), iv);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return b64urlEncode(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

function unseal(purpose: SealPurpose, token: string): string | null {
  const raw = b64urlDecode(token);
  const bodyStart = SEAL_IV_BYTES + SEAL_TAG_BYTES;
  if (raw.length <= bodyStart) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      sealKey(purpose),
      raw.subarray(0, SEAL_IV_BYTES),
    );
    decipher.setAuthTag(raw.subarray(SEAL_IV_BYTES, bodyStart));
    const body = Buffer.concat([decipher.update(raw.subarray(bodyStart)), decipher.final()]);
    return body.toString("utf8");
  } catch {
    return null;
  }
}

type TokenPayload = { e: string; x: number };

// A confirm token sits in the URL of `/sub/confirm`, a page that loads the
// site's scripts, so the address is sealed, not only signed. Cloudflare's page
// report holds that URL.
export function mintConfirmToken(email: string, now: number = Date.now()): string {
  const payload: TokenPayload = { e: email.toLowerCase(), x: now + CONFIRM_TOKEN_TTL_MS };
  return seal("newsletter-confirm", JSON.stringify(payload));
}

export type VerifyResult =
  | { ok: true; email: string; issuedAt: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

// Until November 2026 the token was `<payload>.<hmac>`, the address readable in
// the payload. Those links stay in inboxes for 21 days. A GET of the confirm
// route seals one before it reaches the page.
function readSignedToken(token: string): VerifyResult | string {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadStr, sig] = parts;

  const expected = createHmac("sha256", tokenSecret()).update(payloadStr).digest();
  const provided = b64urlDecode(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return b64urlDecode(payloadStr).toString("utf8");
}

function readSealedToken(token: string): VerifyResult | string {
  if (b64urlDecode(token).length <= SEAL_IV_BYTES + SEAL_TAG_BYTES) {
    return { ok: false, reason: "malformed" };
  }
  return unseal("newsletter-confirm", token) ?? { ok: false, reason: "bad_signature" };
}

export function verifyConfirmToken(token: string, now: number = Date.now()): VerifyResult {
  const read = token.includes(".") ? readSignedToken(token) : readSealedToken(token);
  if (typeof read !== "string") return read;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(read) as TokenPayload;
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
// URL of a page that loads the site's scripts, so it is sealed too. All it
// lets its holder do is take that one address off the list. Rotating
// NEWSLETTER_TOKEN_SECRET breaks every link already sent.
export function mintUnsubscribeToken(email: string): string {
  return seal("newsletter-unsubscribe", email.toLowerCase());
}

/** The address a token was minted for, or `null` when it is not one of ours. */
export function verifyUnsubscribeToken(token: string): string | null {
  return unseal("newsletter-unsubscribe", token);
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
