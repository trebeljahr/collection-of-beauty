"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { artworkAlt } from "@/lib/artwork-format";
import { Lightbox } from "./lightbox";

type LightboxArtwork = {
  id: string;
  objectKey: string;
  variantWidths: readonly number[] | null;
  title: string;
  englishTitle: string | null;
  artist: string | null;
  year: number | null;
  width: number | null;
  height: number | null;
  nsfw: boolean;
};

type LightboxApi = {
  open: (artwork: LightboxArtwork) => void;
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
// into the global artworks array after lazily fetching it; route changes
// are fired in parallel (router.push, scroll: false) so URL stays in sync
// without closing the modal.
export function LightboxProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [current, setCurrent] = useState<LightboxArtwork | null>(null);
  const [artworks, setArtworks] = useState<LightboxArtwork[] | null>(null);
  const artworksPromiseRef = useRef<Promise<LightboxArtwork[]> | null>(null);

  const loadArtworks = useCallback(() => {
    if (artworks) return Promise.resolve(artworks);
    if (!artworksPromiseRef.current) {
      artworksPromiseRef.current = fetch("/api/artworks")
        .then((res) => {
          if (!res.ok) throw new Error(`fetch /api/artworks: ${res.status}`);
          return res.json() as Promise<LightboxArtwork[]>;
        })
        .then((data) => {
          setArtworks(data);
          return data;
        })
        .catch((err) => {
          artworksPromiseRef.current = null;
          throw err;
        });
    }
    return artworksPromiseRef.current;
  }, [artworks]);

  const open = useCallback(
    (artwork: LightboxArtwork) => {
      setCurrent(artwork);
      void loadArtworks();
    },
    [loadArtworks],
  );

  const close = useCallback(() => setCurrent(null), []);

  const index = useMemo(() => {
    if (!current || !artworks) return -1;
    return artworks.findIndex((a) => a.id === current.id);
  }, [artworks, current]);

  const navigate = useCallback(
    (delta: number) => {
      if (!artworks || index < 0) {
        void loadArtworks();
        return;
      }
      const target = index + delta;
      if (target < 0 || target >= artworks.length) return;
      const artwork = artworks[target];
      setCurrent(artwork);
      // Soft URL sync: page below the modal swaps for the new artwork
      // (so closing the lightbox lands on what the user was viewing,
      // and reload preserves state). The provider lives in the layout
      // and stays mounted, so the lightbox itself doesn't flicker.
      // Fired outside the setState updater because router.push triggers
      // an update in the Router component, which React forbids during
      // the render phase that the updater function runs in.
      router.push(`/artwork/${artwork.id}`, { scroll: false });
    },
    [artworks, index, loadArtworks, router],
  );

  const api = useMemo<LightboxApi>(
    () => ({ open, close, isOpen: current != null }),
    [open, close, current],
  );

  const hasPrev = artworks != null && index > 0;
  const hasNext = artworks != null && index >= 0 && index < artworks.length - 1;

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
        nsfw={current?.nsfw ?? false}
        onPrev={hasPrev ? () => navigate(-1) : null}
        onNext={hasNext ? () => navigate(1) : null}
      />
    </LightboxContext.Provider>
  );
}
