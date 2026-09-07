import {
  type ArtworkSort,
  DEFAULT_ARTWORK_PAGE_SIZE,
  DEFAULT_ARTWORK_SORT,
  DEFAULT_SHUFFLE_SEED,
} from "@/lib/artwork-page-schema";
import { getArtworkListingPage } from "@/lib/artwork-pagination";
import { type ColorBucketId, isColorBucketId } from "@/lib/color-buckets.mjs";
import { ERAS, type EraId } from "@/lib/gallery-eras";
import { isPlateSetId } from "@/lib/plate-sets";

export const dynamic = "force-dynamic";

const SORTS = new Set<ArtworkSort>(["shuffle", "year", "artist", "title", "plate"]);
const ERA_IDS = new Set<string>(ERAS.map((e) => e.id));

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sort = parseSort(params.get("sort"));
  const page = getArtworkListingPage({
    offset: parseNumber(params.get("offset"), 0),
    limit: parseNumber(params.get("limit"), DEFAULT_ARTWORK_PAGE_SIZE),
    sort,
    seed: params.get("seed") || DEFAULT_SHUFFLE_SEED,
    query: params.get("q") ?? "",
    era: parseEra(params.get("era")),
    artistSlug: params.get("artistSlug") || null,
    collection: parseCollection(params.get("collection")),
    color: parseColor(params.get("color")),
  });

  return Response.json(page, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function parseSort(value: string | null): ArtworkSort {
  return value && SORTS.has(value as ArtworkSort) ? (value as ArtworkSort) : DEFAULT_ARTWORK_SORT;
}

function parseEra(value: string | null): EraId | "" {
  return value && ERA_IDS.has(value) ? (value as EraId) : "";
}

function parseCollection(value: string | null): string | null {
  return value && isPlateSetId(value) ? value : null;
}

function parseColor(value: string | null): ColorBucketId | "" {
  return isColorBucketId(value) ? value : "";
}

function parseNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
