import { parseScope, resolveScope } from "@/lib/artwork-scope";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const from = new URL(request.url).searchParams.get("from");
  const scope = parseScope(from);
  if (!scope) {
    return Response.json({ error: "invalid_scope" }, { status: 400 });
  }
  const items = resolveScope(scope);
  if (items.length === 0) {
    return Response.json({ error: "empty_scope" }, { status: 404 });
  }
  return Response.json(items, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
