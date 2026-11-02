import { type NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-reporting/server";
import { SITE_URL } from "@/lib/links";
import { unsubscribeFromList } from "@/lib/newsletter/listmonk";
import { verifyUnsubscribeToken } from "@/lib/newsletter/subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function log(level: "info" | "error", event: string): void {
  const line = JSON.stringify({ scope: "newsletter.unsubscribe", level, event });
  if (level === "error") console.error(line);
  else console.info(line);
}

/**
 * The button on `/sub/unsubscribe` posts here. POST only: mail filters open
 * every link in an email, and a GET that unsubscribed would take people off
 * the list who never asked.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const page = `${SITE_URL}/sub/unsubscribe`;

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    log("info", "verify_failed");
    return NextResponse.redirect(`${page}?invalid=1`, { status: 303 });
  }

  try {
    await unsubscribeFromList(email);
  } catch (err) {
    // No message in the log: a failed lookup names the address in its path.
    void reportServerError(err, { source: "newsletter.unsubscribe", event: "unsubscribe_failed" });
    log("error", "unsubscribe_failed");
    return NextResponse.redirect(`${page}?token=${encodeURIComponent(token)}&failed=1`, {
      status: 303,
    });
  }

  log("info", "unsubscribed");
  return NextResponse.redirect(`${page}?done=1`, { status: 303 });
}
