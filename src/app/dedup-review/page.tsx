import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { artworks } from "@/lib/data";
import { variantUrl } from "@/lib/utils";

// Internal verification panel for the duplicate-image sweep. Not linked
// from the site nav; not in the sitemap; blocked in robots.ts. The page
// reads metadata/duplicate-images.json (produced by
// scripts/find-duplicate-images.mjs) and renders every cluster as a
// side-by-side image grid so the curator can eyeball which "same artist
// + same title" pairs are genuine duplicates vs distinct works.

export const metadata: Metadata = {
  title: "Duplicate-image review",
  robots: { index: false, follow: false },
};

type NearCluster = {
  seedHash: string;
  members: Array<{
    id: string;
    title: string;
    artist: string | null;
    objectKey: string;
    hash: string;
    distance: number;
  }>;
};

type TitleCluster = {
  key: string;
  minDistance: number | null;
  members: Array<{
    id: string;
    title: string;
    englishTitle: string | null;
    artist: string | null;
    objectKey: string;
  }>;
};

type Report = {
  generatedAt: string;
  threshold: number;
  stats: { total: number; hashed: number; skipped: number };
  near: NearCluster[];
  titleClusters: TitleCluster[];
};

async function loadReport(): Promise<Report | null> {
  try {
    const p = path.join(process.cwd(), "metadata/duplicate-images.json");
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw) as Report;
  } catch {
    return null;
  }
}

const artworkById = new Map(artworks.map((a) => [a.id, a]));

function bestVariant(objectKey: string, widths: number[] | null): string | null {
  if (!widths?.length) return null;
  // Use avif; the shrink pipeline emits webp only at width 1280 for many
  // works, so a webp request at 480/640 returns 404.
  const target = [640, 480, 960, 1280].find((w) => widths.includes(w)) ?? widths[0];
  return variantUrl(objectKey, target, "avif");
}

function distanceTone(d: number | null): string {
  if (d === null) return "border-zinc-300 bg-zinc-50";
  if (d <= 5) return "border-red-400 bg-red-50";
  if (d <= 10) return "border-orange-300 bg-orange-50";
  if (d <= 15) return "border-amber-200 bg-amber-50";
  return "border-zinc-300 bg-white";
}

function MemberCard({ id, objectKey }: { id: string; objectKey: string }) {
  const a = artworkById.get(id);
  const src = a ? bestVariant(a.objectKey, a.variantWidths) : null;
  const detailHref = `/artwork/${id}`;
  return (
    <figure className="flex flex-col gap-2 text-sm">
      <a href={detailHref} target="_blank" rel="noreferrer" className="block">
        {src ? (
          // biome-ignore lint/performance/noImgElement: this is a one-off review panel, not the public gallery
          <img
            src={src}
            alt={a?.englishTitle ?? a?.title ?? id}
            loading="lazy"
            className="aspect-auto max-h-72 w-auto rounded border border-zinc-300 bg-white object-contain"
          />
        ) : (
          <div className="flex h-72 items-center justify-center rounded border border-zinc-300 bg-zinc-100 text-xs text-zinc-500">
            {a ? "no variants" : "removed (no longer in artworks.json)"}
          </div>
        )}
      </a>
      <figcaption className="space-y-0.5 leading-tight">
        <div className="font-medium">{a?.englishTitle ?? a?.title ?? id}</div>
        {a?.englishTitle && a.englishTitle !== a.title && (
          <div className="text-xs text-zinc-500">source title: {a.title}</div>
        )}
        <div className="text-xs text-zinc-600">
          {a?.artist ?? "—"} {a?.year != null ? `· ${a.year}` : ""}
        </div>
        <div className="text-xs text-zinc-500">
          {a?.width && a?.height ? `${a.width}×${a.height}px` : "?"}
          {a?.realDimensions
            ? ` · ${a.realDimensions.widthCm}×${a.realDimensions.heightCm} cm`
            : ""}
        </div>
        <div className="break-all font-mono text-[10px] text-zinc-500">{objectKey}</div>
        <div className="font-mono text-[10px] text-zinc-400">id: {id}</div>
      </figcaption>
    </figure>
  );
}

export default async function DedupReviewPage() {
  const report = await loadReport();
  if (!report) notFound();

  // Title clusters: sort ascending by minDistance so the most-likely-dupe
  // pairs (low Δ) sit at the top of the page. Null distance = unknowable
  // (one member lacked a hash); push to the end.
  const titleClusters = [...report.titleClusters].sort((a, b) => {
    const da = a.minDistance ?? 999;
    const db = b.minDistance ?? 999;
    return da - db;
  });

  return (
    <main className="mx-auto max-w-7xl space-y-10 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Duplicate-image review</h1>
        <p className="text-sm text-zinc-600">
          Generated {new Date(report.generatedAt).toLocaleString()} from {report.stats.hashed}/
          {report.stats.total} artworks. {report.near.length} near-dup clusters (hamming ≤{" "}
          {report.threshold}); {titleClusters.length} artist+title clusters.
        </p>
        <p className="text-xs text-zinc-500">
          Red = min Δ ≤ 5 (likely duplicate scan). Orange = 6–10. Amber = 11–15. White = high Δ
          (probably a series sharing a title). Click an image to open the artwork page in a new tab.
          Tell Claude which IDs to drop or which titles to override.
        </p>
      </header>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">
          Near duplicates (pairs the hash sweep found visually similar)
        </h2>
        {report.near.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          report.near.map((c) => {
            const minD = c.members.reduce(
              (m, x) => (x.distance > 0 && x.distance < m ? x.distance : m),
              99,
            );
            return (
              <div key={c.seedHash} className={`rounded-lg border-2 p-4 ${distanceTone(minD)}`}>
                <div className="mb-3 font-mono text-xs text-zinc-600">
                  seed {c.seedHash} · min Δ{minD}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {c.members.map((m) => (
                    <div key={m.id} className="space-y-1">
                      <div className="text-xs font-mono text-zinc-700">
                        {m.distance === 0 ? "seed" : `Δ${m.distance}`}
                      </div>
                      <MemberCard id={m.id} objectKey={m.objectKey} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Same artist + same normalized title</h2>
        {titleClusters.length === 0 ? (
          <p className="text-sm text-zinc-500">None.</p>
        ) : (
          titleClusters.map((c) => (
            <div key={c.key} className={`rounded-lg border-2 p-4 ${distanceTone(c.minDistance)}`}>
              <div className="mb-3 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-xs text-zinc-700">{c.key}</span>
                <span className="text-xs text-zinc-500">
                  min Δ{c.minDistance ?? "?"} · {c.members.length} members
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {c.members.map((m) => (
                  <MemberCard key={m.id} id={m.id} objectKey={m.objectKey} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
