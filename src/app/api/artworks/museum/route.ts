import { artworkListings } from "@/lib/data";

export const dynamic = "force-static";

/** Include blur hashes so every museum painting has an immediate preview. */
export function GET() {
  return Response.json(artworkListings, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
