import { parseScopeParams, resolveScope } from "@/lib/artwork-scope";
import { withoutThumbHash } from "@/lib/data";

export const dynamic = "force-dynamic";

/** The ordered sequence a scope walks. Takes the same query string an
 *  `/artwork/<id>` link carries (`from`, plus `q` / `era` / `sort` for a
 *  filtered gallery or timeline).
 *
 *  `fields=id` answers with the ids alone. That is all the detail
 *  page's prev/next needs, and for the unfiltered gallery it is ~70 KB
 *  gzipped against ~330 KB for the listings the lightbox fetches.
 *
 *  The listings answer drops `thumbHash`. Its only consumer is the
 *  lightbox's prev/next list, which paints no tiles, and an unfiltered
 *  scope is all 4,557 rows. `resolveScope` hands back a shared cached
 *  array, so the strip copies instead of deleting in place. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const scope = parseScopeParams(params);
  if (!scope) {
    return Response.json({ error: "invalid_scope" }, { status: 400 });
  }
  const items = resolveScope(scope);
  if (items.length === 0) {
    return Response.json({ error: "empty_scope" }, { status: 404 });
  }
  const body = params.get("fields") === "id" ? items.map((a) => a.id) : withoutThumbHash(items);
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
