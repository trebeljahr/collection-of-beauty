import { prebuiltTimeline, prebuiltTimelines } from "@/lib/static-data/server";
import { getTimelineSummary } from "@/lib/timeline";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { key: string };

/** The timeline's histogram, unfiltered and per era. */
export function generateStaticParams(): Params[] {
  return prebuiltTimelines().map(({ key }) => ({ key: `${key}.json` }));
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { key } = await params;
  const timeline = key.endsWith(".json") ? prebuiltTimeline(key.slice(0, -".json".length)) : null;
  if (!timeline) return Response.json({ error: "not_prebuilt" }, { status: 404 });
  return Response.json(getTimelineSummary({ era: timeline.era }));
}
