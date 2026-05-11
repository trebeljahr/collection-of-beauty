"use client";

// Client-side wrapper around the lazy <Gallery3D> import. Lives in a
// dedicated file so the server page (page.tsx) can stay a Server
// Component for metadata + static-asset data import — Next 16 doesn't
// allow `dynamic(..., { ssr: false })` directly inside a Server
// Component, so this thin shell is the workaround.
//
// Why ssr:false: Three.js + R3F touch `window` on import, the canvas
// is intrinsically client-only, and there's no benefit to streaming
// HTML for a WebGL view. ssr:false also unlocks splitting the
// ~600 KB Three/R3F bundle out of the route's initial JS — the
// loading.tsx sibling renders while it downloads.

import dynamic from "next/dynamic";
import type { ArtworkListing } from "@/lib/data";

const Gallery3D = dynamic(() => import("@/components/gallery-3d").then((m) => m.Gallery3D), {
  ssr: false,
});

export function Gallery3DClient({ artworks }: { artworks: ArtworkListing[] }) {
  return <Gallery3D artworks={artworks} />;
}
