// Build-time museum layout. The artwork JSON is immutable per build, and
// `layoutMuseum` is deterministic on its input, so the multi-floor plan
// can be computed once at module init and reused by every server caller
// (debug floor plan, future SEO surfaces) instead of recomputing on every
// request.
//
// Server-only — importing this from a client component would drag the
// full artwork JSON into the client bundle, which is the exact thing
// `artworkListings` was introduced to avoid. The client 3D gallery still
// computes its own layout from the fetched `ArtworkListing[]` (see
// `components/gallery-3d/index.tsx`).

import { artworkListings } from "@/lib/data";
import { layoutMuseum } from "./layout-museum";

export const museumLayout = layoutMuseum(artworkListings);
