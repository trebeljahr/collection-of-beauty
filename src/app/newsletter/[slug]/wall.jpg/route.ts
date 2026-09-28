// The newsletter email's header image: the issue's five works hung on a
// gallery wall. Rendered on first request and kept in memory, not
// committed: the works live on the CDN already, and a JPEG per issue in
// git would go stale whenever an edition's works or the layout change.
//
// Apple Mail's privacy proxy fetches every image of a campaign the moment
// it is delivered, so the first minutes after a send hit this route in a
// burst. The in-flight promise is shared, so that burst renders once, and
// the send CLI requests the URL before it starts the campaign.
//
// Drafts render too: test sends of a draft point here.

import { type NextRequest, NextResponse } from "next/server";
import { findEdition } from "@/lib/newsletter/editions";
import { resolveEditionWall } from "@/lib/newsletter/wall";
import { renderWallJpeg } from "@/lib/newsletter/wall-image";

export const dynamic = "force-dynamic";

const MAX_CACHED = 32;
const rendered = new Map<string, Promise<Buffer>>();

function renderOnce(key: string, render: () => Promise<Buffer>): Promise<Buffer> {
  let pending = rendered.get(key);
  if (!pending) {
    pending = render();
    rendered.set(key, pending);
    pending.catch(() => rendered.delete(key));
    // Map iteration is insertion order, so the first key is the oldest.
    if (rendered.size > MAX_CACHED) rendered.delete(rendered.keys().next().value as string);
  }
  return pending;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const edition = findEdition(slug);
  if (!edition) {
    return NextResponse.json({ error: "Unknown edition." }, { status: 404 });
  }

  const wall = resolveEditionWall(edition);
  const etag = `"${wall.version}"`;
  // The email links `?v=<version>`, and a different wall is a different
  // version, so that URL can be cached for good. A bare or stale URL
  // shows whatever the wall is now, so it gets a short lifetime.
  const cacheControl =
    request.nextUrl.searchParams.get("v") === wall.version
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": cacheControl },
    });
  }

  try {
    const jpeg = await renderOnce(`${edition.fileSlug}:${wall.version}`, () =>
      renderWallJpeg(wall),
    );
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  } catch (err) {
    console.error(`[newsletter] wall render failed for ${edition.fileSlug}:`, err);
    return NextResponse.json(
      { error: "Wall image could not be rendered." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
