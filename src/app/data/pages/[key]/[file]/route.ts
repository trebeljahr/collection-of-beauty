import { pageCount, prebuiltOrder, prebuiltOrders, staticPage } from "@/lib/static-data/server";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { key: string; file: string };

/** One page of 80 for every ordering a page of the site requests without
 *  a search: what `/api/artworks/page` answered per request before the
 *  site became a static export. */
export function generateStaticParams(): Params[] {
  return prebuiltOrders().flatMap(({ key, input }) =>
    Array.from({ length: pageCount(input) }, (_, i) => ({ key, file: `${i}.json` })),
  );
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { key, file } = await params;
  const order = prebuiltOrder(key);
  const index = /^(0|[1-9]\d*)\.json$/.test(file) ? Number.parseInt(file, 10) : Number.NaN;
  if (!order || !Number.isSafeInteger(index) || index >= pageCount(order.input)) {
    return Response.json({ error: "not_prebuilt" }, { status: 404 });
  }
  return Response.json(staticPage(order.input, index));
}
