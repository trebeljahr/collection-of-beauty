import { type NextRequest, NextResponse } from "next/server";
import { resolveConfirmHero } from "@/lib/newsletter/confirmation-cover";
import {
  checkRateLimit,
  isAlreadySubscribed,
  mintConfirmToken,
  normalizeEmail,
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

function getSiteUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return request.nextUrl.origin;
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

  // Short-circuit confirmed members — no point sending another confirmation
  // email and re-issuing a token that does nothing. UX-wise this also lets
  // the form tell the user "you're already on the list" instead of "check
  // your inbox" (which never arrives because the address is already live).
  if (await isAlreadySubscribed(email)) {
    log("info", "already_subscribed", { ip });
    return NextResponse.json({ ok: true, alreadySubscribed: true });
  }

  const token = mintConfirmToken(email);
  const siteUrl = getSiteUrl(request).replace(/\/$/, "");
  const confirmUrl = `${siteUrl}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const hero = resolveConfirmHero(siteUrl);

  try {
    await sendConfirmationEmail({
      to: email,
      confirmUrl,
      heroImageUrl: hero.imageUrl,
      heroArtworkUrl: hero.artworkUrl,
      heroCaption: hero.caption,
      heroAlt: hero.alt,
    });
  } catch (err) {
    log("error", "send_confirmation_failed", { ip, message: (err as Error).message });
    return NextResponse.json(
      { error: "send_failed", message: "Could not send confirmation email. Please try again." },
      { status: 502 },
    );
  }

  log("info", "confirmation_sent", { ip });
  return NextResponse.json({ ok: true });
}
