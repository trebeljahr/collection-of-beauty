import { after, type NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-reporting/server";
import { SITE_URL } from "@/lib/links";
import { resolveConfirmHero } from "@/lib/newsletter/confirmation-cover";
import {
  checkRateLimit,
  isAlreadySubscribed,
  mintConfirmToken,
  normalizeEmail,
  sendAlreadySubscribedEmail,
  sendConfirmationEmail,
} from "@/lib/newsletter/subscribe";

// Hits ListMonk + does work outside the static-export world, so this must
// run on Node and never get cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscribeBody = {
  email?: string;
  /** Honeypot — bots fill hidden form fields; humans leave them empty. */
  website?: string;
};

function clientIp(request: NextRequest): string {
  // Coolify / typical reverse proxy chain. `x-forwarded-for` is a comma-
  // separated chain; the first entry is the original client. Fall back to
  // a stable bucket key when nothing is set so misconfigured deploys
  // still rate-limit (rather than disabling the limiter entirely).
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function log(level: "info" | "error", event: string, extra: object = {}): void {
  const line = JSON.stringify({ scope: "newsletter.subscribe", level, event, ...extra });
  if (level === "error") console.error(line);
  else console.info(line);
}

/**
 * Send the email this address should get: a confirmation link, or a note
 * that it is already on the list. Only the address's owner learns which.
 */
async function mailAddress(email: string, ip: string): Promise<void> {
  if (await isAlreadySubscribed(email)) {
    await sendAlreadySubscribedEmail({ to: email, siteUrl: SITE_URL });
    log("info", "already_subscribed", { ip });
    return;
  }

  const token = mintConfirmToken(email);
  // Never derive this from the request: behind Coolify's proxy the
  // standalone server sees its own bind address (HOSTNAME=0.0.0.0,
  // PORT=80), and that is what ended up in the emailed link.
  const confirmUrl = `${SITE_URL}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const hero = resolveConfirmHero(SITE_URL);

  await sendConfirmationEmail({
    to: email,
    confirmUrl,
    heroImageUrl: hero.imageUrl,
    heroArtworkUrl: hero.artworkUrl,
    heroCaption: hero.caption,
    heroAlt: hero.alt,
  });
  log("info", "confirmation_sent", { ip });
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  if (!checkRateLimit(ip)) {
    log("info", "rate_limited", { ip });
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please wait a minute." },
      { status: 429 },
    );
  }

  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Couldn't read the request. Please try again." },
      { status: 400 },
    );
  }

  // Honeypot: real users never fill this. Return a 200-shaped success so
  // bots get no signal about what tripped them.
  if (body.website && body.website.trim().length > 0) {
    log("info", "honeypot_triggered", { ip });
    return NextResponse.json({ ok: true });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json(
      { error: "invalid_email", message: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // Anyone can type anyone's address, so every valid address gets this same
  // answer, and it goes out before anything asks ListMonk about this one.
  // Waiting would give the answer away by time: a new address takes two
  // more ListMonk calls than a confirmed one. So a failed send reaches
  // GlitchTip and the log, and the form still says "check your inbox".
  after(() =>
    mailAddress(email, ip).catch((err: unknown) => {
      void reportServerError(err, { source: "newsletter.subscribe", event: "send_failed" });
      log("error", "send_failed", { ip, message: (err as Error).message });
    }),
  );
  return NextResponse.json({ ok: true });
}
