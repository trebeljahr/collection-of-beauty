"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { artworkAlt, artworks } from "@/lib/data";
import { Lightbox } from "./lightbox";

type LightboxApi = {
  open: (id: string) => void;
  close: () => void;
  isOpen: boolean;
};

const LightboxContext = createContext<LightboxApi | null>(null);

export function useLightbox(): LightboxApi {
  const ctx = useContext(LightboxContext);
  if (!ctx) {
    throw new Error("useLightbox must be used within <LightboxProvider>");
  }
  return ctx;
}

// Hosted at the /artwork layout level so prev/next navigation inside the
// lightbox doesn't unmount the overlay. The lightbox holds its own index
// into the global artworks array; route changes are fired in parallel
// (router.push, scroll: false) so URL stays in sync without closing the
// modal.
export function LightboxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);

  const open = useCallback((id: string) => {
    const i = artworks.findIndex((a) => a.id === id);
    if (i < 0) return;
    setIndex(i);
  }, []);

  const close = useCallback(() => setIndex(null), []);

  const navigate = useCallback(
    (delta: number) => {
      if (index == null) return;
      const target = index + delta;
      if (target < 0 || target >= artworks.length) return;
      setIndex(target);
      // Soft URL sync: page below the modal swaps for the new artwork
      // (so closing the lightbox lands on what the user was viewing,
      // and reload preserves state). The provider lives in the layout
      // and stays mounted, so the lightbox itself doesn't flicker.
      // Fired outside the setState updater because router.push triggers
      // an update in the Router component, which React forbids during
      // the render phase that the updater function runs in.
      router.push(`/artwork/${artworks[target].id}`, { scroll: false });
    },
    [index, router],
  );

  const api = useMemo<LightboxApi>(
    () => ({ open, close, isOpen: index != null }),
    [open, close, index],
  );

  const current = index != null ? artworks[index] : null;
  const hasPrev = index != null && index > 0;
  const hasNext = index != null && index < artworks.length - 1;

  return (
    <LightboxContext.Provider value={api}>
      {children}
      <Lightbox
        open={current != null}
        onClose={close}
        objectKey={current?.objectKey ?? ""}
        variantWidths={current?.variantWidths ?? null}
        alt={current ? artworkAlt(current) : ""}
        srcWidth={current?.width}
        srcHeight={current?.height}
        caption={current ? artworkAlt(current) : undefined}
        onPrev={hasPrev ? () => navigate(-1) : null}
        onNext={hasNext ? () => navigate(1) : null}
      />
    </LightboxContext.Provider>
  );
}
