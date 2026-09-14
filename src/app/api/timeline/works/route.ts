import { getTimelineDecadeWorks, TIMELINE_DECADE_SPAN } from "@/lib/timeline";

export const dynamic = "force-dynamic";

/** One decade's works, in render order, projected down to what a
 *  timeline tile draws. Requested lazily as each decade section
 *  scrolls into view, which is what keeps the initial /timeline
 *  document from carrying all ~4,300 dated records. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const decade = parseDecade(params.get("decade"));
  if (decade == null) {
    return Response.json({ error: "invalid_decade" }, { status: 400 });
  }

  const items = getTimelineDecadeWorks(decade, {
    query: params.get("q"),
    era: params.get("era"),
  });

  return Response.json(
    { decade, items },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

function parseDecade(value: string | null): number | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  const decade = Number.parseInt(value, 10);
  if (!Number.isFinite(decade)) return null;
  // Only bucket starts are addressable — 1873 is a typo, not a decade.
  return decade % TIMELINE_DECADE_SPAN === 0 ? decade : null;
}
