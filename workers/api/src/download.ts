/**
 * GET /api/download/<id>?w=<width>&f=<avif|webp>
 *
 * Same-origin download of one artwork variant, moved out of the Next route
 * handler when the site became a static export. A link straight to the CDN
 * cannot do this: `<a download>` is ignored across origins, and the public
 * R2 bucket ignores `response-content-disposition`, so the browser would
 * open a 34 MB AVIF or save it as "9361.avif". This answers with a real
 * filename and `Content-Disposition: attachment`.
 *
 * The body is piped from the public asset host, never buffered, so a
 * download costs this Worker one request and almost no CPU.
 *
 * Which files exist comes from the catalogue, compiled at build time into
 * generated/downloads.json (scripts/build-api-worker-data.ts). Resolving
 * against it rather than trusting `w` keeps a caller from steering the
 * upstream fetch at an arbitrary object.
 */

/** [variant dir (URL-encoded), files largest first, filename stem,
 *  attribution, licence, collection slug or null]. `files` lists
 *  `<width>.<format>` exactly as `downloadOptions()` orders them. */
export type DownloadEntry = [string, string[], string, string, string, string | null];

export type DownloadManifest = Record<string, DownloadEntry>;

const FORMATS = new Set(["avif", "webp"]);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleDownload(
  url: URL,
  id: string,
  manifest: DownloadManifest,
  assetsBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const entry = Object.hasOwn(manifest, id) ? manifest[id] : undefined;
  if (!entry) return json({ error: "Unknown artwork." }, 404);
  const [dir, files, stem, attribution, license, collection] = entry;

  const format = url.searchParams.get("f") ?? "avif";
  if (!FORMATS.has(format)) return json({ error: "Unsupported format." }, 400);
  if (files.length === 0) return json({ error: "No variants built for this artwork." }, 404);

  const requested = url.searchParams.get("w");
  // Without `w`, the largest file. The Next route did the same for either
  // format: the largest option is always an AVIF, so `f=webp` alone fell
  // back to it too.
  const file = requested ? `${Number(requested)}.${format}` : files[0];
  if (!files.includes(file)) {
    return json({ error: "That size was never built for this artwork." }, 404);
  }
  const [width, ext] = file.split(".");

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${assetsBaseUrl}/${dir}/${file}`);
  } catch {
    return json({ error: "The file could not be retrieved from storage." }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    return json({ error: "The file could not be retrieved from storage." }, 502);
  }

  const headers = new Headers({
    "Content-Type": ext === "avif" ? "image/avif" : "image/webp",
    "Content-Disposition": contentDisposition(`${stem}-${width}px.${ext}`),
    "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
    // Courtesy attribution, machine-readable for anyone scripting against
    // the endpoint. Public-domain works don't require it.
    "X-Attribution": headerSafe(attribution),
    "X-License": headerSafe(license),
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  if (collection) headers.set("X-Collection", collection);

  return new Response(upstream.body, { status: 200, headers });
}

/** RFC 6266: an ASCII `filename` for old agents plus a UTF-8 `filename*`. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Header values must be Latin-1 and single-line; credits are neither. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, "?");
}
