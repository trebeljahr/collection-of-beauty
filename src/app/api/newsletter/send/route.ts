import { NextRequest, NextResponse } from "next/server";
import { artworks } from "@/lib/data";
import {
  findIssue,
  loadState,
  saveState,
  sentArtworkIds,
  type NewsletterIssue,
} from "@/lib/newsletter/state";
import {
  DIGEST_SIZE,
  isoWeekKey,
  issueDateLabel,
  pickArtworks,
  resolveManualPicks,
} from "@/lib/newsletter/select";
import { renderDigest } from "@/lib/newsletter/render";
import { sendDigest } from "@/lib/newsletter/mailgun";

// This route must be dynamic (talks to R2 and Mailgun) and must run in Node
// (AWS SDK + Mailgun SDK both need Node APIs).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SendBody = {
  /** Optional 5 artwork ids to send instead of random pick. */
  artworkIds?: string[];
  /** If true, render the email but don't actually send or update state. */
  dryRun?: boolean;
  /** If true, allow sending again within the same ISO week. Default false. */
  force?: boolean;
  /** If true, allow manual picks to include already-sent artworks. Default false. */
  allowRepeats?: boolean;
};

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${expected}`;
}

function getSiteUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return request.nextUrl.origin;
}

/** Vercel Cron fires GET. We accept it and treat it as the default random flow. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();
  return runSend(request, {});
}

/** Manual trigger with overrides (curation, dry-run, force). */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return unauthorized();
  let body: SendBody = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  return runSend(request, body);
}

async function runSend(
  request: NextRequest,
  body: SendBody,
): Promise<NextResponse> {
  const now = new Date();
  const weekKey = isoWeekKey(now);
  const issueDate = issueDateLabel(now);
  const siteUrl = getSiteUrl(request);
  const dryRun = body.dryRun ?? false;

  // For dry-runs we don't require R2 to be configured — fall back to empty
  // state so previews work during initial setup. Real sends still fail loudly.
  let state;
  try {
    state = await loadState();
  } catch (err) {
    if (dryRun) {
      state = { issues: [] };
    } else {
      return NextResponse.json(
        {
          error: "state_load_failed",
          message: (err as Error).message,
          hint: "Check R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_STATE_BUCKET.",
        },
        { status: 500 },
      );
    }
  }

  // Idempotency: refuse to re-send an already-sent week unless forced.
  const existing = findIssue(state, weekKey);
  if (existing && !body.force && !dryRun) {
    return NextResponse.json(
      {
        error: "already_sent_this_week",
        weekKey,
        issue: existing,
      },
      { status: 409 },
    );
  }

  // Pick the 5 artworks (manual or random, always respecting sent history).
  const excluded = sentArtworkIds(state);
  let picks;
  let mode: NewsletterIssue["mode"];
  try {
    if (body.artworkIds && body.artworkIds.length > 0) {
      picks = resolveManualPicks(artworks, body.artworkIds);
      if (!body.allowRepeats) {
        const repeats = picks.filter((a) => excluded.has(a.id));
        if (repeats.length > 0) {
          return NextResponse.json(
            {
              error: "manual_picks_already_sent",
              ids: repeats.map((a) => a.id),
              hint: "Pass allowRepeats: true to override.",
            },
            { status: 400 },
          );
        }
      }
      mode = "manual";
    } else {
      picks = pickArtworks(artworks, excluded, weekKey, DIGEST_SIZE);
      mode = "random";
    }
  } catch (err) {
    return NextResponse.json(
      { error: "selection_failed", message: (err as Error).message },
      { status: 400 },
    );
  }

  const issueNumber = state.issues.length + 1;
  const rendered = await renderDigest({
    issueNumber,
    weekKey,
    issueDate,
    artworks: picks,
    siteUrl,
  });

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      weekKey,
      issueNumber,
      subject: rendered.subject,
      picks: picks.map((a) => ({
        id: a.id,
        title: a.title,
        artist: a.artist,
        year: a.year,
      })),
    });
  }

  // Fire the send, then record it. We record regardless of mailgun's async
  // delivery state — once Mailgun has accepted the message, we consider the
  // issue "sent" for the purpose of no-repeat tracking.
  const result = await sendDigest({
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  const issue: NewsletterIssue = {
    weekKey,
    sentAt: now.toISOString(),
    artworkIds: picks.map((a) => a.id),
    issueNumber,
    mailgunId: result.id,
    mode,
  };

  const nextState = { issues: [...state.issues, issue] };
  await saveState(nextState);

  return NextResponse.json({
    ok: true,
    issue,
    mailgun: result,
  });
}
