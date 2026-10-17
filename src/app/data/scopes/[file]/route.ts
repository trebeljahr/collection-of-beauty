import { orderedArtworkListings } from "@/lib/artwork-pagination";
import {
  prebuiltOrder,
  prebuiltOrders,
  prebuiltTimeline,
  prebuiltTimelines,
  timelineListings,
} from "@/lib/static-data/server";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { file: string };

/** The ids a scope walks, in order: the artwork page's prev/next and the
 *  lightbox. One file per prebuilt ordering, and `timeline.<key>` for the
 *  timeline's `decade` scope. */
export function generateStaticParams(): Params[] {
  return [
    ...prebuiltOrders().map(({ key }) => ({ file: `${key}.json` })),
    ...prebuiltTimelines().map(({ key }) => ({ file: `timeline.${key}.json` })),
  ];
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { file } = await params;
  const key = file.endsWith(".json") ? file.slice(0, -".json".length) : "";
  if (key.startsWith("timeline.")) {
    const timeline = prebuiltTimeline(key.slice("timeline.".length));
    if (timeline) return Response.json(timelineListings({ era: timeline.era }).map((a) => a.id));
  } else {
    const order = prebuiltOrder(key);
    if (order) return Response.json(orderedArtworkListings(order.input).map((a) => a.id));
  }
  return Response.json({ error: "not_prebuilt" }, { status: 404 });
}
