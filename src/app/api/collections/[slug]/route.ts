// On-demand ZIP for one of the four published plate sets.
//
// Nothing is precomputed and nothing is buffered. Entries are fetched from
// the CDN one at a time and forwarded straight into the archive stream, so
// a 225 MB download costs the container one in-flight response rather than
// 225 MB of heap. Committing prebuilt archives to the repo was the other
// option and is worse in every direction: ~530 MB of binaries in git, stale
// the moment a plate is re-shrunk.
//
// A variant can be re-encoded at the same object key, so the archive has no
// safe metadata-only validator. Do not cache a ZIP across asset rebuilds.

import { type NextRequest, NextResponse } from "next/server";
import {
  collectionZipEntries,
  getCollection,
  ZIP_VARIANT_WIDTH,
  zipEntryName,
} from "@/lib/collections";
import { getArtwork } from "@/lib/data";
import { attributionText } from "@/lib/downloads";
import { SITE_URL } from "@/lib/links";
import { publicVariantUrl } from "@/lib/utils";
import { type ZipEntry, zipReadableStream } from "@/lib/zip-stream";

export const dynamic = "force-dynamic";
// The stream can run for minutes on the 475-plate set. Node's default
// would be fine; stating it keeps a future platform default from
// truncating an archive mid-write.
export const maxDuration = 900;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const collection = getCollection(slug.replace(/\.zip$/, ""));
  if (!collection) {
    return NextResponse.json({ error: "Unknown collection." }, { status: 404 });
  }

  const artworks = collectionZipEntries(collection);
  if (artworks.length === 0) {
    return NextResponse.json(
      { error: "No variants have been built for this collection yet." },
      { status: 503 },
    );
  }

  const readme = buildReadme(
    collection.slug,
    artworks.map((a) => a.id),
  );

  const entries: ZipEntry[] = [
    {
      name: `${collection.slug}/README.txt`,
      open: async () => onceIterable(new TextEncoder().encode(readme)),
    },
    ...artworks.map((art, i) => ({
      name: `${collection.slug}/${zipEntryName(art, i)}`,
      open: async () => {
        const upstream = await fetch(publicVariantUrl(art.objectKey, ZIP_VARIANT_WIDTH, "avif"), {
          cache: "no-store",
        });
        if (!upstream.ok || !upstream.body) {
          // Aborting is deliberate. A ZIP that silently skips plates looks
          // complete and isn't; a failed transfer is at least visible.
          throw new Error(`Upstream ${upstream.status} for ${art.objectKey}`);
        }
        return upstream.body as unknown as AsyncIterable<Uint8Array>;
      },
    })),
  ];

  return new NextResponse(zipReadableStream(entries), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${collection.slug}-${ZIP_VARIANT_WIDTH}px.zip"`,
      // No Content-Length: sizes are only known as each entry streams
      // past, and computing them up front would mean fetching the whole
      // set twice.
      "Cache-Control": "no-store",
      "X-Entry-Count": String(entries.length),
      "X-Variant-Width": String(ZIP_VARIANT_WIDTH),
    },
  });
}

async function* onceIterable(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}

/**
 * Plaintext manifest placed at the root of every archive: what the set is,
 * where the plates came from, and a per-file attribution line. Public-
 * domain works carry no attribution requirement — this exists so that
 * someone who *wants* to credit the source doesn't have to reconstruct it
 * from a filename.
 */
function buildReadme(slug: string, ids: string[]): string {
  const collection = getCollection(slug);
  if (!collection) return "";

  const lines = [
    `${collection.title} — ${collection.creator}`,
    `${collection.published}`,
    "",
    wrap(collection.blurb),
    "",
    `${ids.length} plates, ${ZIP_VARIANT_WIDTH} px wide, AVIF.`,
    collection.sourceNote,
    "",
    "LICENCE",
    wrap(
      "Every plate in this archive is in the public domain. You may use, " +
        "modify, print and sell these images without permission and without " +
        "attribution. The credit lines below are offered as a courtesy, not " +
        "as a condition.",
    ),
    "",
    `Browse the full catalogue: ${SITE_URL}/collection/${collection.slug}`,
    "",
    "PLATES",
    "",
  ];

  ids.forEach((id, i) => {
    const art = getArtwork(id);
    if (!art) return;
    lines.push(`${zipEntryName(art, i)}`);
    lines.push(`    ${attributionText(art)}`);
    lines.push(`    ${SITE_URL}/artwork/${art.id}`);
    lines.push("");
  });

  return lines.join("\n");
}

function wrap(text: string, width = 76): string {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.join("\n");
}
