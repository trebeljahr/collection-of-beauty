import { type NextRequest, NextResponse } from "next/server";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { sendTransactional } from "@/lib/newsletter/listmonk";
import { renderEdition } from "@/lib/newsletter/render";
import {
  confirmSubscription,
  isAlreadySubscribed,
  verifyConfirmToken,
} from "@/lib/newsletter/subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function log(level: "info" | "error", event: string, extra: object = {}): void {
  const line = JSON.stringify({ scope: "newsletter.confirm", level, event, ...extra });
  if (level === "error") console.error(line);
  else console.info(line);
}

function getSiteUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  return request.nextUrl.origin;
}

/**
 * Render the most recent published edition and send it to the address
 * that just finished double opt-in. Gives the new subscriber an
 * immediate look at what an issue actually feels like in their inbox.
 *
 * Goes through ListMonk's transactional API rather than a one-off
 * campaign. The tx template cannot use campaign-only unsubscribe
 * helpers, so we render the digest body with `unsubscribeMode:
 * "tx-template"` to suppress unsub placeholders that would not be
 * substituted on this path.
 *
 * Throws are swallowed by the caller — if the send blips here, the
 * confirmation has already succeeded; no point bouncing the user to the
 * error page over a "welcome bonus" failure.
 */
async function sendWelcomeIssue(email: string, siteUrl: string): Promise<boolean> {
  const editions = loadPublishedEditions();
  if (editions.length === 0) return false;
  const latest = editions[editions.length - 1];
  const rendered = await renderEdition({
    edition: latest,
    siteUrl,
    unsubscribeMode: "tx-template",
  });
  await sendTransactional({
    to: email,
    subject: `Welcome — ${rendered.subject}`,
    html: rendered.html,
  });
  log("info", "welcome_sent", { edition: latest.fileSlug });
  return true;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const siteUrl = getSiteUrl(request).replace(/\/$/, "");

  if (!token) {
    return NextResponse.redirect(`${siteUrl}/sub/error?reason=missing`, { status: 303 });
  }

  const result = verifyConfirmToken(token);
  if (!result.ok) {
    log("info", "verify_failed", { reason: result.reason });
    return NextResponse.redirect(`${siteUrl}/sub/error?reason=${result.reason}`, { status: 303 });
  }

  // Re-confirmation case: the user clicked a stale token for an address
  // that's already subscribed. Skip the welcome send so they don't get a
  // duplicate latest-issue email every time they revisit the link.
  const alreadyConfirmed = await isAlreadySubscribed(result.email);

  try {
    await confirmSubscription(result.email);
  } catch (err) {
    log("error", "list_add_failed", { message: (err as Error).message });
    return NextResponse.redirect(`${siteUrl}/sub/error?reason=list_add_failed`, { status: 303 });
  }

  let welcomeSent = false;
  if (!alreadyConfirmed) {
    try {
      welcomeSent = await sendWelcomeIssue(result.email, siteUrl);
    } catch (err) {
      // Don't fail the confirmation over a welcome-send error — the
      // subscription itself is already live. They'll get the next
      // regular issue at the usual cadence.
      log("error", "welcome_send_failed", { message: (err as Error).message });
    }
  }

  log("info", "confirmed", { welcomeSent });
  const destination = welcomeSent
    ? `${siteUrl}/sub/confirmed?welcome=1`
    : `${siteUrl}/sub/confirmed`;
  return NextResponse.redirect(destination, { status: 303 });
}
