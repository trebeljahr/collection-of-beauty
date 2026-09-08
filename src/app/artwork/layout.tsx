import type { Viewport } from "next";
import type { ReactNode } from "react";
import { LightboxProvider } from "@/components/lightbox-provider";

// Route-scoped on purpose — do NOT hoist this to the root layout.
//
// `env(safe-area-inset-*)` resolves to 0px on iOS Safari and on Android
// Chrome unless the document opts in with `viewport-fit=cover`. Without
// this export every safe-area offset in the lightbox
// (src/components/lightbox.tsx) silently computes to the flat fallback it
// was written to replace — `max(1rem, 0px)` is just the 1rem it stood in
// for, and the chevrons' `env()` margins are a literal zero.
//
// /artwork earns the opt-in because of that lightbox: a `fixed inset-0`
// full-bleed image viewer whose Close button and prev/next chevrons are
// pinned hard against the extreme screen edges. Looking at a painting
// fullscreen on a phone held sideways is exactly the moment an iPhone's
// sensor housing sits over one of those edges. Setting `viewportFit`
// globally instead would push *every* page's content under the notch and
// force a re-audit of each full-bleed surface on the site — a far bigger
// change than the two routes that actually need it (the other is
// /gallery-3d, which carries its own copy of this export).
//
// Safe to state only the single field: Next merges `viewport` exports
// field-by-field down the segment chain rather than replacing the parent
// wholesale (see `mergeViewport` in next/dist/lib/metadata/
// resolve-metadata.js — it structuredClones the resolved parent and
// overwrites only the keys present in the child object). The root
// layout's `themeColor`, `width` and `initialScale` therefore survive on
// this route; restating them here would just be a second copy to keep in
// sync.
export const viewport: Viewport = {
  viewportFit: "cover",
};

/* Cover mode is not free: it widens the layout viewport for *every* page
   in this segment, not only the overlay that asked for it. The detail
   page underneath is ordinary scrolling content in an
   `mx-auto max-w-6xl px-4` column, and in landscape on a notched device
   that 16px gutter would end up beneath the sensor housing — the opt-in
   above would have fixed the lightbox and broken the page behind it. So
   the gutter lives here rather than in `[id]/page.tsx`: one wrapper
   covers every route in the segment, present and future.

   Deliberately no `max()` around these, unlike the lightbox's own insets:
   this is pure extra gutter added on top of whatever padding the page
   already has, so where no inset is reported — every desktop browser,
   every phone without a housing — it resolves to `0px` and the column is
   pixel-for-pixel where it was.

   Horizontal only, for three separate reasons:
   - Top: the sticky header is the root layout's, rendered above this
     wrapper. Padding here cannot lift it clear, and would only add dead
     space below a header that is already the topmost element.
   - Bottom: this div sits inside <main>, above the root layout's footer,
     so padding-bottom would open a gap mid-document rather than lift
     anything off the home indicator. Scrolling content can always be
     scrolled clear of the indicator; a bottom inset is for *pinned*
     bottom chrome, which nothing in this segment has.
   - The lightbox overlay is portalled to document.body, so it is not a
     descendant of this div and inherits none of this padding — it does
     its own insetting, against the same `env()` values this export
     switches on. */
const SAFE_AREA_GUTTER = {
  paddingLeft: "env(safe-area-inset-left, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
} as const;

// Persists across /artwork/[id] page transitions, so the lightbox
// overlay (rendered by LightboxProvider) doesn't unmount when the user
// hits prev/next inside the modal.
//
// No Suspense boundary here: the provider must stay above `children` at
// all times or `useLightbox()` throws. The `useSearchParams()` CSR
// bailout is contained inside the provider instead.
export default function ArtworkLayout({ children }: { children: ReactNode }) {
  return (
    <LightboxProvider>
      <div style={SAFE_AREA_GUTTER}>{children}</div>
    </LightboxProvider>
  );
}
