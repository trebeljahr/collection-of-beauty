import { artworkAbout } from "@/lib/artwork-about";

// One work's "about" text for the 3D museum's info pill, a few hundred
// bytes gzipped. Rendered on first request and then cached like the
// artwork pages it mirrors: nothing is prebuilt, since the pill asks for
// a work only when a visitor opens it.
export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 86400;

export function generateStaticParams(): { id: string }[] {
  return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const about = artworkAbout(id);
  if (!about) {
    return Response.json({ error: "Unknown artwork." }, { status: 404 });
  }
  return Response.json(about, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
