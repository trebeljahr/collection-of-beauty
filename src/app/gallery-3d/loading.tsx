// Route Suspense fallback shown while the Gallery3D component's JS chunk
// (Three.js + R3F + drei + postprocessing — ~600 KB gzipped) downloads
// and parses. Without this the route is a blank canvas until the bundle
// is ready.
//
// Renders the shared GalleryCurtain so this window, the artworks-fetch
// window, and the StartOverlay all read as one continuous loader that
// ends on the "Enter the museum" card — no swapping between differently
// styled screens.

import { GalleryCurtain } from "./gallery-curtain";

export default function Loading() {
  return <GalleryCurtain />;
}
