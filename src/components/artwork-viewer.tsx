"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { artworkAlt } from "@/lib/data";
import { Lightbox } from "./lightbox";
import { ResponsiveImage } from "./responsive-image";

type ArtworkLike = {
  objectKey: string;
  variantWidths: readonly number[] | null;
  title: string;
  artist: string | null;
  year: number | null;
  width: number | null;
  height: number | null;
};

type Props = {
  art: ArtworkLike;
  prevId: string | null;
  nextId: string | null;
};

// Bridge so the lightbox stays open across prev/next page navigation.
// Set right before router.push, consumed by the next page's ArtworkViewer
// on mount. sessionStorage (not localStorage) so it doesn't leak between
// tabs or persist across reloads.
const STORAGE_KEY = "cob:lightbox-open";

export function ArtworkViewer({ art, prevId, nextId }: Props) {
  const router = useRouter();
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      setLightboxOpen(true);
    }
  }, []);

  useEffect(() => {
    if (prevId) router.prefetch(`/artwork/${prevId}`);
    if (nextId) router.prefetch(`/artwork/${nextId}`);
  }, [prevId, nextId, router]);

  // Page-level keyboard navigation. Skipped while the lightbox is open —
  // the lightbox binds its own handler to avoid double-firing.
  useEffect(() => {
    if (lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        router.push(`/artwork/${prevId}`);
      } else if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        router.push(`/artwork/${nextId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, prevId, nextId, router]);

  const navigateInLightbox = (id: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    }
    router.push(`/artwork/${id}`);
  };

  const alt = artworkAlt(art);

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        title="View fullscreen"
        aria-label={`Open ${art.title} in fullscreen viewer`}
        className="block w-full cursor-zoom-in rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ResponsiveImage
          objectKey={art.objectKey}
          variantWidths={art.variantWidths}
          alt={alt}
          srcWidth={art.width ?? 1600}
          srcHeight={art.height ?? 2000}
          sizes="(max-width: 768px) 100vw, 65vw"
          priority
          className="mx-auto max-h-[80vh] w-auto rounded-md"
        />
      </button>

      <Lightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        objectKey={art.objectKey}
        variantWidths={art.variantWidths}
        alt={alt}
        srcWidth={art.width}
        srcHeight={art.height}
        caption={alt}
        onPrev={prevId ? () => navigateInLightbox(prevId) : null}
        onNext={nextId ? () => navigateInLightbox(nextId) : null}
      />
    </>
  );
}
