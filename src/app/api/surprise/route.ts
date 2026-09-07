import { MAX_SURPRISE_DECK_SIZE, SURPRISE_DECK_SIZE, sampleDistinct } from "@/lib/surprise";
import { SURPRISE_POOL } from "@/lib/surprise-pool";

// Random per request, so no prerender and no caching anywhere — see the
// same note on src/app/surprise/page.tsx.
export const dynamic = "force-dynamic";

/**
 * Refill endpoint for `/surprise`: hands the client another deck of slim
 * listings so "Show me another" keeps being a state swap instead of a
 * navigation. Disallowed in robots.txt along with the rest of /api.
 */
export function GET(request: Request) {
  // Branch on absence before converting: `Number(null)` is 0, not NaN, so
  // a missing `count` would otherwise clamp to 1 instead of falling
  // through to the default deck size.
  const raw = new URL(request.url).searchParams.get("count");
  const requested = raw === null ? Number.NaN : Number(raw);
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_SURPRISE_DECK_SIZE)
    : SURPRISE_DECK_SIZE;

  return Response.json(
    { artworks: sampleDistinct(SURPRISE_POOL, count) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
