import { LightboxProvider } from "@/components/lightbox-provider";
import type { ReactNode } from "react";

// Persists across /artwork/[id] page transitions, so the lightbox
// overlay (rendered by LightboxProvider) doesn't unmount when the user
// hits prev/next inside the modal.
export default function ArtworkLayout({ children }: { children: ReactNode }) {
  return <LightboxProvider>{children}</LightboxProvider>;
}
