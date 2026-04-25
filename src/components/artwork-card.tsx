import { ResponsiveImage } from "@/components/responsive-image";
import { type Artwork, artworkAlt } from "@/lib/data";
import Link from "next/link";

type Props = {
  artwork: Artwork;
  priority?: boolean;
};

export function ArtworkCard({ artwork, priority }: Props) {
  return (
    <Link
      href={`/artwork/${artwork.id}`}
      className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--muted)]">
        <ResponsiveImage
          objectKey={artwork.objectKey}
          variantWidths={artwork.variantWidths}
          alt={artworkAlt(artwork)}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          priority={priority}
          className="transition-transform duration-500 group-hover:scale-105"
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
