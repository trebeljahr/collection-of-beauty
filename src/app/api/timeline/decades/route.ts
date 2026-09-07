import { getTimelineSummary } from "@/lib/timeline";

export const dynamic = "force-dynamic";

/** Decade histogram under the active filters — 62 `{decade, count}`
 *  pairs at most. The page renders its bars, section headers and the
 *  "N dated works across M decades" line from this alone; the works
 *  themselves come from /api/timeline/works once a section scrolls
 *  into view. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const summary = getTimelineSummary({
    query: params.get("q"),
    movement: params.get("movement"),
  });

  return Response.json(summary, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
