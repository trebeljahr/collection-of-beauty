import Link from "next/link";
import { assetUrl } from "@/lib/utils";
import type { Artwork } from "@/lib/data";

type Props = {
  artwork: Artwork;
  priority?: boolean;
};

export function ArtworkCard({ artwork, priority }: Props) {
  const src = assetUrl(artwork.objectKey);
  return (
    <Link
      href={`/artwork/${artwork.id}`}
      className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg"
    >
      <div className="aspect-[4/5] overflow-hidden bg-[var(--muted)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={artwork.title}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium">{artwork.title}</h3>
        <p className="truncate text-xs text-[var(--muted-foreground)]">
          {artwork.artist ?? "Unknown artist"}
          {artwork.year ? ` · ${artwork.year}` : ""}
        </p>
      </div>
    </Link>
  );
}
