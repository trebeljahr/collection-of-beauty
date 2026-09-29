import { catalogueListings } from "@/lib/data";

export const dynamic = "force-static";

/** The whole catalogue as slim listings for the lightbox's unscoped
 *  prev/next list. `thumbHash` is stripped because this list does not
 *  display preview images. */
export function GET() {
  return Response.json(catalogueListings, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
