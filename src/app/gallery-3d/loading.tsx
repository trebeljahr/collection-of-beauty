// Route Suspense fallback shown while a client-side navigation fetches
// the route. Without this the click on a museum link gives no feedback
// until the route arrives.
//
// Renders the shared GalleryCurtain, the same card the client wrapper
// keeps up from the page's first paint to the Enter click, so the
// handover is one card whose bar keeps filling. See gallery-curtain.tsx
// for the two rules that keep the sequence from jumping.

import { GalleryCurtain } from "./gallery-curtain";

export default function Loading() {
  return <GalleryCurtain />;
}
