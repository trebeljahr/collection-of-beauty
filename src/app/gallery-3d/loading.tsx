// Route Suspense fallback shown while the Gallery3D component's JS chunk
// (Three.js + R3F + drei + postprocessing — ~600 KB gzipped) downloads
// and parses. Without this the route is a blank canvas until the bundle
// is ready.
//
// Renders the shared GalleryCurtain, which is also the artworks-fetch
// window and the in-canvas Enter card — one card, one progress bar,
// filled continuously across all three phases. See gallery-curtain.tsx
// for the two rules that keep the sequence from jumping.

import { GalleryCurtain } from "./gallery-curtain";

export default function Loading() {
  return <GalleryCurtain />;
}
