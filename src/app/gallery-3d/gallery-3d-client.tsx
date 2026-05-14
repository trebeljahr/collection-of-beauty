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

const Gallery3D = dynamic(() => import("@/components/gallery-3d").then((m) => m.Gallery3D), {
  ssr: false,
});

export function Gallery3DClient() {
  const [artworks, setArtworks] = useState<ArtworkListing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
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
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0805] px-4 text-white">
        <div className="w-[min(360px,88vw)] text-center">
          <h1 className="font-serif text-xl tracking-wide">
            {failed ? "Could not load museum" : "Loading museum"}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {failed ? "Refresh to try again." : "Preparing the collection..."}
          </p>
          {!failed && (
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/4 rounded-full bg-white/70 animate-loading-bar" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Gallery3D artworks={artworks} />;
}
