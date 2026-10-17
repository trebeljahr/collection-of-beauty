import { artworkAbout } from "@/lib/artwork-about";
import { artworks } from "@/lib/data";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { file: string };

/** One work's "about" text for the 3D museum's info pill, a few hundred
 *  bytes gzipped, fetched only when a visitor opens the pill. One file a
 *  work, so the museum's listings carry none of it. */
export function generateStaticParams(): Params[] {
  return artworks.map((a) => ({ file: `${a.id}.json` }));
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { file } = await params;
  const about = file.endsWith(".json") ? artworkAbout(file.slice(0, -".json".length)) : null;
  if (!about) return Response.json({ error: "Unknown artwork." }, { status: 404 });
  return Response.json(about);
}
