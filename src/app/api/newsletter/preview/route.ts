import { type NextRequest, NextResponse } from "next/server";
import { type Artwork, artworks } from "@/lib/data";
import { renderDigest } from "@/lib/newsletter/render";
import {
  DIGEST_SIZE,
  isoWeekKey,
  issueDateLabel,
  pickArtworks,
  resolveManualPicks,
} from "@/lib/newsletter/select";
import { loadState, type NewsletterState, sentArtworkIds } from "@/lib/newsletter/state";

// Preview what *would* be sent this week, as a renderable HTML page.
// Query params:
//   ?format=html | json   (default: html)
//   ?ids=id1,id2,...      (optional manual selection)
//   ?week=2026-W17        (optional override; default: current ISO week)
//   ?ignoreState=1        (optional; pick from all works, ignoring sent history)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  // Disable auth in dev for convenience; require it in prod.
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  if (header === `Bearer ${expected}`) return true;
  // Also accept ?secret=... for browser-based previewing.
  return request.nextUrl.searchParams.get("secret") === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const format = searchParams.get("format") === "json" ? "json" : "html";
  const now = new Date();
  const weekKey = searchParams.get("week") ?? isoWeekKey(now);
  const issueDate = issueDateLabel(now);
  const ignoreState = searchParams.get("ignoreState") === "1";

  // Preview is forgiving — if R2 isn't configured yet, fall back to empty
  // state so you can iterate on the template without full prod setup.
  let state: NewsletterState;
  if (ignoreState) {
    state = { issues: [] };
  } else {
    try {
      state = await loadState();
    } catch {
      state = { issues: [] };
    }
  }
  const excluded = sentArtworkIds(state);

  const idsParam = searchParams.get("ids");
  let picks: Artwork[];
  try {
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      picks = resolveManualPicks(artworks, ids);
    } else {
      picks = pickArtworks(artworks, excluded, weekKey, DIGEST_SIZE);
    }
  } catch (err) {
    return NextResponse.json(
      { error: "selection_failed", message: (err as Error).message },
      { status: 400 },
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const issueNumber = state.issues.length + 1;

  const rendered = await renderDigest({
    issueNumber,
    weekKey,
    issueDate,
    artworks: picks,
    siteUrl,
  });

  if (format === "json") {
    return NextResponse.json({
      weekKey,
      issueNumber,
      subject: rendered.subject,
      picks: picks.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        year: a.year,
      })),
      html: rendered.html,
      text: rendered.text,
    });
  }

  return new NextResponse(rendered.html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
