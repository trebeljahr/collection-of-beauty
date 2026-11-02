import { type NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-reporting/server";
import { SITE_URL } from "@/lib/links";
import { unsubscribeFromList } from "@/lib/newsletter/listmonk";
import { verifyUnsubscribeToken } from "@/lib/newsletter/subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = `${SITE_URL}/sub/unsubscribe`;

function log(level: "info" | "error", event: string): void {
  const line = JSON.stringify({ scope: "newsletter.unsubscribe", level, event });
  if (level === "error") console.error(line);
  else console.info(line);
}

type Outcome = "done" | "invalid" | "failed";

async function unsubscribe(token: string): Promise<Outcome> {
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    log("info", "verify_failed");
    return "invalid";
  }

  try {
    await unsubscribeFromList(email);
  } catch (err) {
    // No message in the log: a failed lookup names the address in its path.
    void reportServerError(err, { source: "newsletter.unsubscribe", event: "unsubscribe_failed" });
    log("error", "unsubscribe_failed");
    return "failed";
  }

  log("info", "unsubscribed");
  return "done";
}

/** A mail client's own Unsubscribe button posts this key (RFC 8058). */
async function isOneClick(request: NextRequest): Promise<boolean> {
  const form = await request.formData().catch(() => null);
  return form?.get("List-Unsubscribe") === "One-Click";
}

const ONE_CLICK_STATUS: Record<Outcome, number> = { done: 200, invalid: 400, failed: 500 };

/**
 * The address in the welcome copy's `List-Unsubscribe` header. A mail client
 * without one-click opens it, and so does a mail filter, so it only leads to
 * the page. A GET that unsubscribed would take people off the list who never
 * asked.
 */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return NextResponse.redirect(`${PAGE}?token=${encodeURIComponent(token)}`, { status: 303 });
}

/**
 * Two buttons post here: the one on `/sub/unsubscribe`, and a mail client's
 * own. RFC 8058 forbids a redirect for the second, so it gets a status.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const oneClick = await isOneClick(request);
  const outcome = await unsubscribe(token);

  if (oneClick) return new NextResponse(null, { status: ONE_CLICK_STATUS[outcome] });

  const query = {
    done: "done=1",
    invalid: "invalid=1",
    failed: `token=${encodeURIComponent(token)}&failed=1`,
  }[outcome];
  return NextResponse.redirect(`${PAGE}?${query}`, { status: 303 });
}
