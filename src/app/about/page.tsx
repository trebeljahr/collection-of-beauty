import type { Metadata } from "next";
import Link from "next/link";
import { summary } from "@/lib/data";
import { GITHUB_URL } from "@/lib/links";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About",
  description:
    `About ${SITE_NAME} — what this gallery is, where its ${summary.totalArtworks.toLocaleString()} works ` +
    `come from, and how to contribute corrections to the metadata.`,
  alternates: { canonical: "/about" },
  openGraph: {
    title: `About · ${SITE_NAME}`,
    description:
      `What this gallery is, where its ${summary.totalArtworks.toLocaleString()} works come from, ` +
      `and how to contribute corrections.`,
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">About</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">
          What this is, where the works come from, and how to help fix mistakes.
        </p>
      </header>

      <div className="space-y-10 text-[var(--foreground)] leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-serif text-xl">What this is</h2>
          <p>
            {SITE_NAME} is a personal gallery — a one-person collection of paintings, prints, and
            natural-history illustrations that I find beautiful. It is not a museum, not an academic
            catalog, and not a comprehensive survey of any movement. It is a curated shelf, gathered
            slowly, that I wanted to share without the overhead of a heavyweight CMS.
          </p>
          <p>
            Every piece on display is in the public domain or under an open licence. The site
            organises {summary.totalArtworks.toLocaleString()} works by{" "}
            {summary.totalArtists.toLocaleString()} artists across {summary.totalMovements}{" "}
            movements, spanning {summary.yearRange.min}–{summary.yearRange.max}, and presents them
            as a flat gallery, a decade-by-decade timeline, an artist index, and a walkable 3D room.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl">Where the data comes from</h2>
          <p>
            The bulk of the catalogue is scraped from open sources. The build pipeline pulls
            metadata, normalises it, fills in gaps from a small artists database, and writes a
            single JSON file that Next.js consumes at build time:
          </p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Wikidata + Wikimedia Commons.</strong> The primary source for titles, dates,
              artists, descriptions, licences, and museum provenance. See{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                scripts/fetch-wikimedia-metadata.mjs
              </code>{" "}
              and{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                scripts/fetch-provenance.mjs
              </code>
              .
            </li>
            <li>
              <strong>
                John James Audubon — <em>Birds of America</em> (1827–1838).
              </strong>{" "}
              All 435 plates, downloaded directly from Wikimedia Commons. See{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                scripts/download-birds-of-america.sh
              </code>{" "}
              and{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                metadata/audubon-birds.json
              </code>
              .
            </li>
            <li>
              <strong>
                Ernst Haeckel — <em>Kunstformen der Natur</em> (1904).
              </strong>{" "}
              The full 100-plate edition. See{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                scripts/download-kunstformen.sh
              </code>{" "}
              and{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                metadata/kunstformen-images.json
              </code>
              .
            </li>
            <li>
              <strong>Per-film extras.</strong> Smaller hand-curated batches with bespoke metadata
              files, e.g.{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                metadata/spirited-away.json
              </code>
              ,{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">
                metadata/your-name.json
              </code>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl">Disclaimer</h2>
          <p>
            Most of this metadata was scraped automatically and stitched together from multiple
            sources. Errors are inevitable. Expect to find: wrong creation dates, broken or
            mistranslated titles, garbled non-Latin characters, the wrong artist attached to a work,
            weird or partial provenance, and the occasional broken licence link. None of this is
            intentional, and none of it is final.
          </p>
          <p>
            If you spot something that's wrong, I'd genuinely like to know. The fix is usually a few
            lines of JSON.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-xl">How to contribute fixes</h2>
          <p>
            The source lives on GitHub:{" "}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--muted-foreground)]"
            >
              {GITHUB_URL.replace(/^https?:\/\//, "")}
            </a>
            . The lowest-friction option is to{" "}
            <a
              href={`${GITHUB_URL}/issues/new`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-[var(--muted-foreground)]"
            >
              open an issue
            </a>{" "}
            describing what's wrong — every artwork detail page also has a small{" "}
            <em>Suggest a fix</em> link that opens a pre-filled issue with the work's ID.
          </p>
          <p>If you'd rather send a PR, here's where things live:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <code className="rounded bg-[var(--muted)] px-1 text-xs">metadata/</code> — the raw
              scrape, one JSON file per source folder. This is the right place for almost every
              correction. Fixing a title, a date, or an artist here means the change survives the
              next rebuild.
            </li>
            <li>
              <code className="rounded bg-[var(--muted)] px-1 text-xs">src/data/artworks.json</code>{" "}
              and the other files in{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">src/data/</code> — the built
              artefact. Generated, committed for fast deploys, but never edited by hand.
            </li>
            <li>
              <code className="rounded bg-[var(--muted)] px-1 text-xs">scripts/build-data.mjs</code>{" "}
              — the build pipeline. It walks the metadata files, applies normalisation (multilingual
              titles, date heuristics, copyright status), enriches artists from a small curated
              database, probes image dimensions, and emits the JSON in{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">src/data/</code>. After
              changing a metadata file, run{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">pnpm run build:data</code>{" "}
              and commit both the metadata change and the regenerated{" "}
              <code className="rounded bg-[var(--muted)] px-1 text-xs">src/data/*.json</code>.
            </li>
          </ul>
          <p>
            Contributions of any size are welcome — a one-character typo fix is just as useful as a
            hundred-row provenance audit.
          </p>
        </section>

        <section className="pt-4">
          <Link href="/" className="text-sm underline underline-offset-2 hover:opacity-70">
            ← Back to the gallery
          </Link>
        </section>
      </div>
    </div>
  );
}
