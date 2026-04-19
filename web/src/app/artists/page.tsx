import Link from "next/link";
import { artists } from "@/lib/data";
import { wikimediaThumb } from "@/lib/utils";

export default function ArtistsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Artists</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          {artists.length} artists represented, sorted by number of works.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {artists.map((a) => (
          <Link
            key={a.slug}
            href={`/artist/${a.slug}`}
            className="group block overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] transition-shadow hover:shadow-lg"
          >
            <div className="aspect-square overflow-hidden bg-[var(--muted)]">
              {a.coverFileUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={wikimediaThumb(a.coverFileUrl, 400)}
                  alt={a.coverTitle || a.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-1 text-sm font-medium">{a.name}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {a.count} work{a.count === 1 ? "" : "s"}
                {a.born && a.died ? ` · ${a.born}–${a.died}` : ""}
              </p>
              {a.movement && (
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {a.movement}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
