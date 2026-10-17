import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { artists } from "@/lib/data";
import { getPlateSets } from "@/lib/plate-sets";
import { PlayClient, type ScopeLabels } from "./play-client";

// A static shell: the scope (`?from=`) and the resume point (`?start=`)
// are read in the browser (play-client.tsx), which also sets the title.

// Route-scoped, like src/app/artwork/layout.tsx and /surprise: the
// slideshow's chrome insets itself with `env(safe-area-inset-*)`, which is
// 0px unless the document opts into `viewport-fit=cover`. On iPhone, where
// Safari has no element fullscreen, the fixed overlay *is* the fullscreen,
// so its Exit button and toolbar must clear the notch and home indicator.
// Next merges viewport exports field by field, so the root layout's width
// and initialScale survive. The black themeColor replaces the root's
// light/dark pair on this route only, so the browser chrome around the
// overlay matches it.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

// One URL per scope and per resume point: nothing worth indexing, and the
// works themselves are indexed at /artwork/[id]. Not in the sitemap.
export const metadata: Metadata = {
  title: "Slideshow",
  robots: { index: false, follow: false },
};

/** Names `scopeLabel` reads from the catalogue, for the heading. */
function scopeLabels(): ScopeLabels {
  return {
    artists: Object.fromEntries(artists.map((a) => [a.slug, a.name])),
    collections: Object.fromEntries(getPlateSets().map((set) => [set.id, set.title])),
  };
}

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="min-h-[60svh] bg-black" aria-busy="true" />}>
      <PlayClient labels={scopeLabels()} />
    </Suspense>
  );
}
