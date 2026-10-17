// One of the four published plate sets as a ZIP: its 2,560 px AVIF plates
// and a README with a credit line per plate.
//
// Built once per asset change by scripts/build-collection-zips.ts and
// published to the asset bucket at a content-addressed path, like the
// press kit; /api/collections/<slug> is a `_redirects` line to it. The
// static site has no server to stream it per request, and building it
// from 435 to 475 CDN fetches took minutes.
//
// Nothing is buffered: entries are opened one at a time and forwarded
// straight into the archive stream.

import {
  collectionZipEntries,
  getCollection,
  ZIP_VARIANT_WIDTH,
  zipEntryName,
} from "@/lib/collections";
import { getArtwork } from "@/lib/data";
import { attributionText } from "@/lib/downloads";
import { SITE_URL } from "@/lib/links";
import { type ZipEntry, zipReadableStream } from "@/lib/zip-stream";

export type OpenVariant = (objectKey: string, width: number) => Promise<AsyncIterable<Uint8Array>>;

export type CollectionZip = {
  filename: string;
  entryCount: number;
  stream: ReadableStream<Uint8Array>;
};

/** The archive for `slug`, or null for an unknown set or one with no
 *  plates built. `open` reads one plate's AVIF. */
export function collectionZip(slug: string, open: OpenVariant): CollectionZip | null {
  const collection = getCollection(slug);
  if (!collection) return null;
  const artworks = collectionZipEntries(collection);
  if (artworks.length === 0) return null;

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
      // A failed plate aborts the archive. A ZIP that silently skips
      // plates looks complete and isn't.
      open: () => open(art.objectKey, ZIP_VARIANT_WIDTH),
    })),
  ];
  return {
    filename: `${collection.slug}-${ZIP_VARIANT_WIDTH}px.zip`,
    entryCount: entries.length,
    stream: zipReadableStream(entries),
  };
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
