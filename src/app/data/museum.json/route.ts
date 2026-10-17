import { artworkListings } from "@/lib/data";

export const dynamic = "force-static";

/** Every listing with its blur hash: the 3D museum's catalogue, and the
 *  corpus the browser orders a search over (src/lib/static-data). */
export function GET() {
  return Response.json(artworkListings);
}
