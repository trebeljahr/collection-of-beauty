import { type NextRequest, NextResponse } from "next/server";
import { addListMember, verifyConfirmToken } from "@/lib/newsletter/subscribe";

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

  try {
    await addListMember(result.email, true);
  } catch (err) {
    log("error", "list_add_failed", { message: (err as Error).message });
    return NextResponse.redirect(`${siteUrl}/sub/error?reason=list_add_failed`, { status: 303 });
  }

  log("info", "confirmed");
  return NextResponse.redirect(`${siteUrl}/sub/confirmed`, { status: 303 });
}
