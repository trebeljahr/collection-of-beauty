// Same-origin download proxy for a single artwork variant.
//
// The links on /artwork/[id] could point straight at the CDN, but two
// things break if they do. First, `<a download="...">` is ignored across
// origins, so the browser would either navigate to a 34 MB AVIF and try to
// render it, or save it as "9361.avif" — a filename that says nothing
// about the painting. Second, a bare CDN link can't be given a
// Content-Disposition. Routing through here costs a proxy hop and buys a
// real filename and a real attachment.
//
// The response body is piped, never buffered: the largest file in the
// catalogue is ~34 MB and the container is small.

import { type NextRequest, NextResponse } from "next/server";
import { collectionForFolder } from "@/lib/collections";
import { getArtwork } from "@/lib/data";
import { attributionText, downloadFilename, downloadOptions } from "@/lib/downloads";
import { publicVariantUrl, type VariantFormat } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FORMATS = new Set<VariantFormat>(["avif", "webp"]);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artwork = getArtwork(id);
  if (!artwork) {
    return NextResponse.json({ error: "Unknown artwork." }, { status: 404 });
  }

  const requested = request.nextUrl.searchParams.get("w");
  const format = (request.nextUrl.searchParams.get("f") ?? "avif") as VariantFormat;
  if (!FORMATS.has(format)) {
    return NextResponse.json({ error: "Unsupported format." }, { status: 400 });
  }

  const options = downloadOptions(artwork);
  if (options.length === 0) {
    return NextResponse.json({ error: "No variants built for this artwork." }, { status: 404 });
  }

  // Resolve against the artwork's own manifest rather than trusting `w`.
  // This is the same rule that keeps `variantSrcSet` from emitting widths
  // that were never encoded, and it doubles as the guard that stops a
  // caller from steering the upstream fetch at an arbitrary object.
  const option = requested
    ? options.find((o) => o.width === Number(requested) && o.format === format)
    : (options.find((o) => o.isLargest && o.format === format) ?? options[0]);

  if (!option) {
    return NextResponse.json(
      { error: "That size was never built for this artwork." },
      { status: 404 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(publicVariantUrl(artwork.objectKey, option.width, option.format), {
      // The variant ladder is immutable once built — a given width/format
      // for a given object key never changes content — so a long-lived
      // cached copy upstream is always correct.
      cache: "force-cache",
    });
  } catch {
    // A transport-level failure (DNS, connection reset, TLS) is the same
    // story for the caller as a non-2xx from storage, so it gets the same
    // structured 502 rather than escaping as a generic 500 plus a stack.
    return NextResponse.json(
      { error: "The file could not be retrieved from storage." },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "The file could not be retrieved from storage." },
      { status: 502 },
    );
  }

  const headers = new Headers({
    "Content-Type": option.format === "avif" ? "image/avif" : "image/webp",
    "Content-Disposition": contentDisposition(
      downloadFilename(artwork, option.width, option.format),
    ),
    "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    // Courtesy attribution, machine-readable for anyone scripting against
    // the endpoint. Public-domain works don't require it; saying so is the
    // point of shipping it.
    "X-Attribution": headerSafe(attributionText(artwork)),
    "X-License": headerSafe(artwork.license),
  });

  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  const collection = collectionForFolder(artwork.folder);
  if (collection) headers.set("X-Collection", collection.slug);

  return new NextResponse(upstream.body, { status: 200, headers });
}

/** RFC 6266: an ASCII `filename` for old agents plus a UTF-8 `filename*`.
 *  Our filenames are slugified ASCII already, but titles reach the
 *  slugifier in every script in the catalogue, so this stays honest. */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Header values must be Latin-1 and single-line; artwork credits contain
 *  neither reliably. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, "?");
}
