// The newsletter email's header image: the issue's five works hung on a
// gallery wall. A static file of the export, rendered at build for every
// edition under both of its slugs: the works live on the CDN already,
// and a JPEG per issue in git would go stale whenever an edition's works
// or the layout change.
//
// Drafts render too: test sends of a draft point here. The email links
// `?v=<version>`, which a static file ignores; a changed wall is a new
// deploy, and _headers keeps the file's lifetime short.

import { findEdition, loadEditions } from "@/lib/newsletter/editions";
import { resolveEditionWall } from "@/lib/newsletter/wall";
import { renderWallJpeg } from "@/lib/newsletter/wall-image";

export const dynamic = "force-static";
export const dynamicParams = false;

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return loadEditions().flatMap((e) => [{ slug: e.fileSlug }, { slug: e.themeSlug }]);
}

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition) return Response.json({ error: "Unknown edition." }, { status: 404 });
  const jpeg = await renderWallJpeg(resolveEditionWall(edition));
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg" } });
}
