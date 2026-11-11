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
// ~600 KB Three/R3F bundle out of the route's initial JS.
//
// Artwork data is fetched after the route shell paints. Passing the
// full listing array through RSC made /gallery-3d ship ~1.2 MB before
// the browser could even start the WebGL bundle.
//
// This wrapper owns the museum's one loader. The curtain is mounted
// here once, from the first paint to the Enter click, over whatever
// stands under it: the placeholder while the artworks and the chunk
// download, then the scene, which reports its entry room through
// `onEntryChange`. It sits outside next/dynamic's Suspense boundary, so
// nothing the scene does can swap it for another card.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { GalleryEntry } from "@/components/gallery-3d";
import type { ArtworkListing } from "@/lib/data";
import { STATIC_DATA } from "@/lib/static-data/keys";
import { GalleryCurtain } from "./gallery-curtain";

/** Holds the museum's height while there is no scene under the curtain,
 *  so the footer doesn't flash up. Same box as the scene's host. */
function Placeholder() {
  return <div className="h-dvh w-full bg-black" />;
}

const Gallery3D = dynamic(() => import("@/components/gallery-3d").then((m) => m.Gallery3D), {
  ssr: false,
  // A box, not a card: the curtain above it is the loader. This also
  // shows if the scene ever suspends after mounting, and then the
  // curtain stays where it is.
  loading: Placeholder,
});

export function Gallery3DClient() {
  const [artworks, setArtworks] = useState<ArtworkListing[] | null>(null);
  const [failed, setFailed] = useState(false);
  // undefined: no scene yet. null: the visitor has entered.
  const [entry, setEntry] = useState<GalleryEntry | null | undefined>(undefined);

  useEffect(() => {
    // Warm the Three/R3F chunk in parallel with the data fetch. The
    // dynamic import isn't referenced until `artworks` resolves, so
    // without this the chunk download would only start after the fetch.
    void import("@/components/gallery-3d");

    const controller = new AbortController();
    fetch(STATIC_DATA.museum, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`fetch ${STATIC_DATA.museum}: ${res.status}`);
        return res.json() as Promise<ArtworkListing[]>;
      })
      .then(setArtworks)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  // Memoised so a progress report, which re-renders this wrapper, does
  // not render the whole scene a second time.
  const scene = useMemo(
    () => (artworks ? <Gallery3D artworks={artworks} onEntryChange={setEntry} /> : <Placeholder />),
    [artworks],
  );

  return (
    <div className="relative w-full">
      {scene}
      {entry !== null && (
        <GalleryCurtain
          overlay
          fetchFailed={failed}
          title={entry?.title}
          blurb={entry?.blurb}
          progress={entry?.progress}
          ready={entry?.ready}
          failedCount={entry?.failedCount}
          status={entry?.status}
          onStart={entry?.onStart}
          onRetry={entry?.onRetry}
        />
      )}
    </div>
  );
}
