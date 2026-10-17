import { staticOrders } from "@/lib/static-data/server";

export const dynamic = "force-static";

/** Plate and colour orders as id lists: what the browser needs, beside
 *  the listings, to order a search the export did not prebuild. */
export function GET() {
  return Response.json(staticOrders());
}
