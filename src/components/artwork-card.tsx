import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";
import { type Artwork, artworkAlt } from "@/lib/data";

type Props = {
  artwork: Artwork;
  priority?: boolean;
};

export function ArtworkCard({ artwork, priority }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg">
      <Link
        href={`/artwork/${artwork.id}`}
        aria-label={artworkAlt(artwork)}
        className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--muted)]">
        <ResponsiveImage
          objectKey={artwork.objectKey}
          variantWidths={artwork.variantWidths}
          alt={artworkAlt(artwork)}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          priority={priority}
          className="transition-transform duration-500 group-hover:scale-105 group-active:scale-[1.02]"
        />
      </div>
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium">{artwork.title}</h3>
        <p className="truncate text-xs text-[var(--muted-foreground)]">
          {artwork.artist ? (
            <Link
              href={`/artist/${artwork.artistSlug}`}
              className="relative z-20 underline-offset-2 hover:underline"
            >
              {artwork.artist}
            </Link>
          ) : (
            "Unknown artist"
          )}
          {artwork.year ? ` · ${artwork.year}` : ""}
        </p>
      </div>
    </div>
  );
}
