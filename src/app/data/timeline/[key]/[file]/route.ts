import { prebuiltTimeline, prebuiltTimelines, timelineDecades } from "@/lib/static-data/server";
import { getTimelineDecadeWorks } from "@/lib/timeline";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { key: string; file: string };

/** One decade's works, unfiltered and per era: what a timeline section
 *  loads as it scrolls into view. Only decades the filter has works in. */
export function generateStaticParams(): Params[] {
  return prebuiltTimelines().flatMap(({ key, era }) =>
    timelineDecades(era).map((decade) => ({ key, file: `${decade}.json` })),
  );
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { key, file } = await params;
  const timeline = prebuiltTimeline(key);
  const match = /^(\d{3,4})\.json$/.exec(file);
  if (!timeline || !match) return Response.json({ error: "not_prebuilt" }, { status: 404 });
  return Response.json({
    decade: Number(match[1]),
    items: getTimelineDecadeWorks(Number(match[1]), { era: timeline.era }),
  });
}
