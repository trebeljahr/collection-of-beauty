// The four plate-set ZIPs, built by scripts/build-collection-zips.ts and
// published to the asset bucket at `/downloads/v1/<sha256>/<filename>`,
// the press kit's scheme. A content-addressed key never changes bytes, so
// the CDN caches it for good and a rebuilt archive is a new URL. This
// file records what is published; the collection page links to a set's
// ZIP only once it is, through `/api/collections/<slug>` (a `_redirects`
// line), so the link a visitor bookmarked stays the same.

const SHA256 = /^[a-f0-9]{64}$/;
const FILENAME = /^[a-z0-9][a-z0-9._-]*\.zip$/;

export function validateCollectionZips(meta) {
  if (meta?.schema !== 1 || typeof meta.sets !== "object" || meta.sets === null) {
    throw new Error("Invalid collection ZIP metadata.");
  }
  const origin = new URL(meta.origin);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || meta.origin !== origin.origin) {
    throw new Error("Invalid collection ZIP origin.");
  }
  for (const [slug, set] of Object.entries(meta.sets)) {
    if (
      !SHA256.test(set?.sha256 ?? "") ||
      !FILENAME.test(set?.filename ?? "") ||
      set.path !== `/downloads/v1/${set.sha256}/${set.filename}` ||
      !Number.isSafeInteger(set.bytes) ||
      set.bytes <= 0 ||
      !Number.isSafeInteger(set.entries) ||
      typeof set.published !== "boolean"
    ) {
      throw new Error(`Invalid collection ZIP metadata for ${slug}.`);
    }
  }
  return meta;
}

/** Published sets only: `{ slug: { url, bytes, entries } }`. */
export function publishedCollectionZips(meta) {
  const out = {};
  for (const [slug, set] of Object.entries(meta.sets)) {
    if (set.published) {
      out[slug] = {
        url: new URL(set.path, meta.origin).href,
        bytes: set.bytes,
        entries: set.entries,
      };
    }
  }
  return out;
}

/** `_redirects` rules, [from, to, status], for the published sets. */
export function collectionZipRedirects(meta) {
  return Object.entries(publishedCollectionZips(meta)).flatMap(([slug, { url }]) => [
    [`/api/collections/${slug}`, url, 302],
    [`/api/collections/${slug}.zip`, url, 302],
  ]);
}

/** HEAD every recorded set on the public origin; true when its size matches. */
export async function verifyCollectionZips(meta, fetchImpl = fetch) {
  const results = {};
  for (const [slug, set] of Object.entries(meta.sets)) {
    const res = await fetchImpl(new URL(set.path, meta.origin), { method: "HEAD" });
    results[slug] =
      res.ok &&
      res.headers.get("content-length") === String(set.bytes) &&
      (res.headers.get("content-type") ?? "").startsWith("application/zip");
  }
  return results;
}
