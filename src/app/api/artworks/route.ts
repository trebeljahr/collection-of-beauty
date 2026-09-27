import { catalogueListings } from "@/lib/data";

export const dynamic = "force-static";

/** The whole catalogue as slim listings, for the 3D gallery and the
 *  lightbox's unscoped prev/next list. `thumbHash` is stripped: neither
 *  paints a DOM tile, and on every row it is a third of the gzipped
 *  response. */
export function GET() {
  return Response.json(catalogueListings, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
