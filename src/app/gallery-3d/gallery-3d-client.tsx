"use client";

// Client-side wrapper around the lazy <Gallery3D> import. Lives in a
// dedicated file so the server page (page.tsx) can stay a Server
// Component for metadata — Next 16 doesn't allow `dynamic(..., {
// ssr: false })` directly inside a Server Component, so this thin
// shell is the workaround.
//
// Why ssr:false: Three.js + R3F touch `window` on import, the canvas
// is intrinsically client-only, and there's no benefit to streaming
// HTML for a WebGL view. ssr:false also unlocks splitting the
// ~600 KB Three/R3F bundle out of the route's initial JS — the
// loading.tsx sibling renders while it downloads.
//
// Artwork data is fetched after the route shell paints. Passing the
// full listing array through RSC made /gallery-3d ship ~1.2 MB before
// the browser could even start the WebGL bundle.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ArtworkListing } from "@/lib/data";
import { GalleryCurtain } from "./gallery-curtain";

const Gallery3D = dynamic(() => import("@/components/gallery-3d").then((m) => m.Gallery3D), {
  ssr: false,
  // Without this, next/dynamic renders null while the chunk downloads,
  // collapsing <main> to 0 height and flashing the footer. Keep it
  // h-screen (same curtain as the fetch wait) so the layout never jumps.
  loading: () => <GalleryCurtain />,
});

export function Gallery3DClient() {
  const [artworks, setArtworks] = useState<ArtworkListing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Warm the Three/R3F chunk in parallel with the data fetch. Without
    // this the two pre-mount waits run back-to-back: the dynamic import
    // isn't referenced until `artworks` resolves (the `if (!artworks)`
    // guard below), so the chunk download only *started* after the fetch
    // finished — and each wait rendered its own GalleryCurtain instance,
    // remounting the DOM node and restarting the loading bar, so the
    // curtain looked like it reappeared. Kicking the import here overlaps
    // the two; by the time the fetch resolves the chunk is usually
    // already cached and <Gallery3D> mounts straight to its StartOverlay.
    void import("@/components/gallery-3d");

    const controller = new AbortController();
    fetch("/api/artworks", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`fetch /api/artworks: ${res.status}`);
        return res.json() as Promise<ArtworkListing[]>;
      })
      .then(setArtworks)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  if (!artworks) {
    return <GalleryCurtain failed={failed} />;
  }

  return <Gallery3D artworks={artworks} />;
}
