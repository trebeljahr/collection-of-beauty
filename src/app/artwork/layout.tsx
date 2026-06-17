import { type ReactNode, Suspense } from "react";
import { LightboxProvider } from "@/components/lightbox-provider";

// Persists across /artwork/[id] page transitions, so the lightbox
// overlay (rendered by LightboxProvider) doesn't unmount when the user
// hits prev/next inside the modal.
//
// LightboxProvider reads `useSearchParams()` (the `?from=` scope), which
// triggers a CSR bailout that fails `next build`'s static export unless
// it sits under a Suspense boundary. `fallback={children}` keeps the
// artwork page content in the static HTML — the lightbox overlay only
// needs the param after hydration anyway.
export default function ArtworkLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <LightboxProvider>{children}</LightboxProvider>
    </Suspense>
  );
}
