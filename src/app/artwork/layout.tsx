import type { ReactNode } from "react";
import { LightboxProvider } from "@/components/lightbox-provider";

// Persists across /artwork/[id] page transitions, so the lightbox
// overlay (rendered by LightboxProvider) doesn't unmount when the user
// hits prev/next inside the modal.
//
// No Suspense boundary here: the provider must stay above `children` at
// all times or `useLightbox()` throws. The `useSearchParams()` CSR
// bailout is contained inside the provider instead.
export default function ArtworkLayout({ children }: { children: ReactNode }) {
  return <LightboxProvider>{children}</LightboxProvider>;
}
