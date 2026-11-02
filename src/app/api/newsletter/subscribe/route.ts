import { after, type NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-reporting/server";
import { SITE_URL } from "@/lib/links";
import { resolveConfirmHero } from "@/lib/newsletter/confirmation-cover";
import {
  checkRateLimit,
  isAlreadySubscribed,
  isListmonkUp,
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

/**
 * An IPv6 client is handed a /64 or more and can use any address in it, so its
 * bucket is the /64.
 */
function ipv6Network(ip: string): string {
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
 *
 * Measured on the live site on 3 November 2026. Coolify's Traefik trusts no
 * proxy, so it replaces `x-forwarded-for` and `x-real-ip` with the address it
 * took the request from: a Cloudflare edge, one of many. Seven POSTs from one
 * client came through five, so a retry got a new bucket and strangers shared
 * one. `cf-connecting-ip` passes through and names the client. Cloudflare
 * answers 403 to a client that sends its own, and the origin's firewall
 * (hatchkit's `HATCHKIT-CF`) drops whatever does not come from Cloudflare.
 * Without that firewall this header can be forged.
 *
 * A Worker on another Cloudflare account can set the header on a subrequest,
 * and Cloudflare marks those with `cf-worker`. They share one bucket with any
 * request that has no address, so a misconfigured deploy still rate-limits.
 */
function rateLimitKey(request: NextRequest): string {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip || request.headers.has("cf-worker")) return "unknown";
  return ip.includes(":") ? ipv6Network(ip) : ip;
}

// No address on these lines: /privacy says the rate limiter alone holds it.
function log(level: "info" | "error", event: string, extra: object = {}): void {
  const line = JSON.stringify({ scope: "newsletter.subscribe", level, event, ...extra });
  if (level === "error") console.error(line);
  else console.info(line);
}

/**
 * Send the email this address should get: a confirmation link, or a note
 * that it is already on the list. Only the address's owner learns which.
 */
async function mailAddress(email: string): Promise<void> {
  if (await isAlreadySubscribed(email)) {
    await sendAlreadySubscribedEmail({ to: email, siteUrl: SITE_URL });
    log("info", "already_subscribed");
    return;
  }

  const token = mintConfirmToken(email);
  // Never derive this from the request: behind Coolify's proxy the
  // standalone server sees its own bind address (HOSTNAME=0.0.0.0,
  // PORT=80), and that is what ended up in the emailed link.
  const confirmUrl = `${SITE_URL}/sub/confirm?token=${encodeURIComponent(token)}`;
  const hero = resolveConfirmHero(SITE_URL);

  await sendConfirmationEmail({
    to: email,
    confirmUrl,
    heroImageUrl: hero.imageUrl,
    heroArtworkUrl: hero.artworkUrl,
    heroCaption: hero.caption,
    heroAlt: hero.alt,
  });
  log("info", "confirmation_sent");
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(rateLimitKey(request))) {
    log("info", "rate_limited");
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
    log("info", "honeypot_triggered");
    return NextResponse.json({ ok: true });
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return NextResponse.json(
      { error: "invalid_email", message: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  // The health check takes no address, so an outage can tell a visitor to try
  // again without saying anything about the address they typed.
  if (!(await isListmonkUp())) {
    void reportServerError(new Error("ListMonk health check failed"), {
      source: "newsletter.subscribe",
      event: "listmonk_unreachable",
    });
    log("error", "listmonk_unreachable");
    return NextResponse.json(
      {
        error: "send_failed",
        message: "Could not send the email. Please try again in a few minutes.",
      },
      { status: 502 },
    );
  }

  // Anyone can type anyone's address, so every valid address gets this same
  // answer, and it goes out before anything asks ListMonk about this one.
  // Waiting would give the answer away by time: a new address takes two
  // more ListMonk calls than a confirmed one. So a send that fails after the
  // health check reaches GlitchTip and the log, and the form still says
  // "check your inbox".
  after(() =>
    mailAddress(email).catch((err: unknown) => {
      void reportServerError(err, { source: "newsletter.subscribe", event: "send_failed" });
      log("error", "send_failed", { message: (err as Error).message });
    }),
  );
  return NextResponse.json({ ok: true });
}
