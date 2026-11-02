import { type NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-reporting/server";
import { SITE_URL } from "@/lib/links";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { isConfirmedOnList, sendTransactional } from "@/lib/newsletter/listmonk";
import { renderEdition } from "@/lib/newsletter/render";
import {
  confirmSubscription,
  mintConfirmToken,
  mintUnsubscribeToken,
  verifyConfirmToken,
} from "@/lib/newsletter/subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function log(level: "info" | "error", event: string, extra: object = {}): void {
  const line = JSON.stringify({ scope: "newsletter.confirm", level, event, ...extra });
  if (level === "error") console.error(line);
  else console.info(line);
}

/**
 * Render the most recent published edition and send it to the address
 * that just finished double opt-in. Gives the new subscriber an
 * immediate look at what an issue actually feels like in their inbox.
 *
 * Goes through ListMonk's transactional API rather than a one-off
 * campaign. ListMonk substitutes no unsubscribe link on this path, so the
 * copy carries a signed link to our own page.
 *
 * Throws are swallowed by the caller — if the send blips here, the
 * confirmation has already succeeded; no point bouncing the user to the
 * error page over a "welcome bonus" failure.
 */
async function sendWelcomeIssue(email: string, siteUrl: string): Promise<boolean> {
  const editions = loadPublishedEditions();
  if (editions.length === 0) return false;
  const latest = editions[editions.length - 1];
  const token = encodeURIComponent(mintUnsubscribeToken(email));
  const rendered = await renderEdition({
    edition: latest,
    siteUrl,
    unsubscribeUrl: `${siteUrl}/sub/unsubscribe?token=${token}`,
  });
  await sendTransactional({
    to: email,
    subject: `Welcome — ${rendered.subject}`,
    html: rendered.html,
    // The mail client's own Unsubscribe button, which ListMonk adds to a
    // campaign by itself.
    headers: {
      "List-Unsubscribe": `<${siteUrl}/api/newsletter/unsubscribe?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  log("info", "welcome_sent", { edition: latest.fileSlug });
  return true;
}

/** Add the address to the list and answer with the page that says how it went. */
async function confirm(email: string, issuedAt: number): Promise<string> {
  // Re-confirmation case: the user pressed the button on a stale token for an
  // address that's already subscribed. Skip the welcome send so they don't get
  // a duplicate latest-issue email every time they revisit the link.
  let alreadyConfirmed: boolean;
  try {
    alreadyConfirmed = await isConfirmedOnList(email);
  } catch (err) {
    // No message in the log, here or below: a failed lookup names the address in its path.
    void reportServerError(err, { source: "newsletter.confirm", event: "list_lookup_failed" });
    log("error", "list_lookup_failed");
    return `${SITE_URL}/sub/error?reason=list_lookup_failed`;
  }

  try {
    await confirmSubscription(email, issuedAt);
  } catch (err) {
    void reportServerError(err, { source: "newsletter.confirm", event: "list_add_failed" });
    log("error", "list_add_failed");
    return `${SITE_URL}/sub/error?reason=list_add_failed`;
  }

  let welcomeSent = false;
  if (!alreadyConfirmed) {
    try {
      welcomeSent = await sendWelcomeIssue(email, SITE_URL);
    } catch (err) {
      // Don't fail the confirmation over a welcome-send error — the
      // subscription itself is already live. They'll get the next
      // issue when it goes out.
      void reportServerError(err, { source: "newsletter.confirm", event: "welcome_send_failed" });
      log("error", "welcome_send_failed");
    }
  }

  log("info", "confirmed", { welcomeSent });
  return welcomeSent ? `${SITE_URL}/sub/confirmed?welcome=1` : `${SITE_URL}/sub/confirmed`;
}

/**
 * A double click posts twice, and the second lookup can run before the first
 * write lands: two welcome copies. A press that finds one running waits for it
 * and answers the same. The address is held only while that run lasts.
 */
const running = new Map<string, Promise<string>>();

/**
 * A link from an email changes nothing here: mail filters open every link in
 * an email, and anyone can type anyone's address into the form. New emails link
 * to `/sub/confirm` directly. Links sent before that lead here for 21 days,
 * carrying the address readable, so the token is sealed before it reaches the
 * page. It keeps its date, which `confirmSubscription` compares with an
 * unsubscribe, and its expiry.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  // Links and redirects use SITE_URL, never request.nextUrl.origin: behind
  // the proxy that is the container's bind address (0.0.0.0:80).

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/sub/error?reason=missing`, { status: 303 });
  }

  const result = verifyConfirmToken(token);
  if (!result.ok) {
    log("info", "verify_failed", { reason: result.reason });
    return NextResponse.redirect(`${SITE_URL}/sub/error?reason=${result.reason}`, { status: 303 });
  }

  const sealed = mintConfirmToken(result.email, result.issuedAt);
  return NextResponse.redirect(`${SITE_URL}/sub/confirm?token=${encodeURIComponent(sealed)}`, {
    status: 303,
  });
}

/** The button on `/sub/confirm` posts here. */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${SITE_URL}/sub/error?reason=missing`, { status: 303 });
  }

  const result = verifyConfirmToken(token);
  if (!result.ok) {
    log("info", "verify_failed", { reason: result.reason });
    return NextResponse.redirect(`${SITE_URL}/sub/error?reason=${result.reason}`, { status: 303 });
  }

  let run = running.get(result.email);
  if (!run) {
    run = confirm(result.email, result.issuedAt).finally(() => running.delete(result.email));
    running.set(result.email, run);
  }
  return NextResponse.redirect(await run, { status: 303 });
}
