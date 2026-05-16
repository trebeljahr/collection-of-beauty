"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { artworkAlt } from "@/lib/artwork-format";
import { useLightbox } from "./lightbox-provider";
import { ResponsiveImage } from "./responsive-image";

type ArtworkLike = {
  id: string;
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

export function ArtworkViewer({ art, prevId, nextId }: Props) {
  const router = useRouter();
  const { open, isOpen } = useLightbox();

  useEffect(() => {
    if (prevId) router.prefetch(`/artwork/${prevId}`);
    if (nextId) router.prefetch(`/artwork/${nextId}`);
  }, [prevId, nextId, router]);

  // Page-level keyboard navigation. Skipped while the lightbox is open —
  // the lightbox binds its own arrows that swap the modal image instead.
  useEffect(() => {
    if (isOpen) return;
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
  }, [isOpen, prevId, nextId, router]);

  const alt = artworkAlt(art);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => open(art)}
        title="View fullscreen"
        aria-label={`Open ${art.title} in fullscreen viewer`}
        className="flex min-h-0 w-full flex-1 cursor-zoom-in items-center justify-center rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        <ResponsiveImage
          objectKey={art.objectKey}
          variantWidths={art.variantWidths}
          alt={alt}
          srcWidth={art.width ?? 1600}
          srcHeight={art.height ?? 2000}
          sizes="(max-width: 768px) 100vw, 65vw"
          priority
          className="h-auto max-h-full w-auto max-w-full rounded-md object-contain"
        />
      </button>
    </div>
  );
}
