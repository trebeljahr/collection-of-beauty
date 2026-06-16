import { promises as fs } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { variantUrl } from "@/lib/utils";
import { ApproveButton, ExportDecisions } from "./approve-controls";

// Internal review panel for the low-res replacement workflow.
// Reads src/data/replacement-candidates.json (produced by the
// find-hires-replacements workflow) and renders the current low-res
// image side-by-side with each candidate higher-res replacement so the
// curator can eyeball whether the candidate depicts the same artwork.
//
// Not indexed (see src/app/robots.ts). Not linked from site nav.

export const metadata: Metadata = {
  title: "Low-res replacement review",
  robots: { index: false, follow: false },
};

type Candidate = {
  fileUrl: string;
  commonsPageUrl: string;
  width: number;
  height: number;
  confidence: number;
  reason: string;
  hamming?: number | null;
  source?: string;
};

type Entry = {
  target: {
    id: string;
    title: string;
    englishTitle: string | null;
    artist: string;
    w: number;
    h: number;
    fileUrl: string;
    commonsUrl: string;
    wikidataId: string | null;
    objectKey: string;
    variantWidths: number[] | null;
  };
  candidates: Candidate[];
  summary: string;
};

async function loadEntries(): Promise<Entry[]> {
  const p = path.join(process.cwd(), "src/data/replacement-candidates.json");
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as Entry[];
}

function bestVariant(objectKey: string, widths: number[] | null): string {
  if (!widths?.length) return "";
  const target =
    [960, 1280, 1920, 640, 480].find((w) => widths.includes(w)) ?? widths[widths.length - 1];
  return variantUrl(objectKey, target, "avif");
}

function confidenceTone(c: number): string {
  if (c >= 0.9) return "border-emerald-400 bg-emerald-50";
  if (c >= 0.7) return "border-amber-300 bg-amber-50";
  return "border-rose-300 bg-rose-50";
}

function megapixels(w: number, h: number): string {
  return ((w * h) / 1e6).toFixed(2);
}

function ratio(w: number, h: number): string {
  return (Math.max(w, h) / Math.min(w, h)).toFixed(2);
}

export default async function ReplaceLowResPage() {
  const entries = await loadEntries();
  const withCands = entries.filter((e) => e.candidates.length > 0);
  const noCands = entries.filter((e) => e.candidates.length === 0);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 text-zinc-900">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Low-res replacement review</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {entries.length} low-res works · {withCands.length} have candidates · {noCands.length} had
          nothing better on Commons. Eyeball each pair to confirm the candidate depicts the same
          artwork before swapping.
        </p>
      </header>

      <ExportDecisions />

      <section className="space-y-10">
        {withCands.map((entry) => (
          <ReviewCard key={entry.target.id} entry={entry} />
        ))}
      </section>

      {noCands.length > 0 && (
        <section className="mt-12 border-t pt-8">
          <h2 className="text-xl font-semibold">No replacement found ({noCands.length})</h2>
          <p className="mt-1 text-sm text-zinc-600">
            These either had no higher-res file on Commons or the higher-res copy is gated behind a
            museum download tool.
          </p>
          <ul className="mt-4 space-y-3">
            {noCands.map((entry) => (
              <li key={entry.target.id} className="rounded border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <strong>{entry.target.title}</strong>{" "}
                    <span className="text-sm text-zinc-600">— {entry.target.artist}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {entry.target.w}×{entry.target.h} ({megapixels(entry.target.w, entry.target.h)}{" "}
                    MP)
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-700">{entry.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function ReviewCard({ entry }: { entry: Entry }) {
  const { target, candidates, summary } = entry;
  const currentSrc = bestVariant(target.objectKey, target.variantWidths);

  return (
    <article className="rounded-lg border border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {target.title} <span className="font-normal text-zinc-600">— {target.artist}</span>
          </h2>
          <a
            href={`/artwork/${target.id}`}
            className="text-xs text-blue-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            open artwork page →
          </a>
        </div>
        {target.englishTitle && <p className="text-sm text-zinc-600">{target.englishTitle}</p>}
        <p className="mt-2 text-sm text-zinc-700">{summary}</p>
      </header>

      <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel
          label="CURRENT"
          tone="border-zinc-400 bg-zinc-100"
          src={currentSrc}
          alt={`Current ${target.title}`}
          dims={{ w: target.w, h: target.h }}
          aspect={ratio(target.w, target.h)}
          fileUrl={target.fileUrl}
          pageUrl={target.commonsUrl}
        />
        {candidates.map((c, i) => (
          <Panel
            key={c.fileUrl}
            label={`CANDIDATE ${i + 1} · conf ${(c.confidence * 100).toFixed(0)}%${c.hamming != null ? ` · Δ${c.hamming}` : ""}${c.source ? ` · ${c.source}` : ""}`}
            tone={confidenceTone(c.confidence)}
            src={c.fileUrl}
            alt={`Candidate ${i + 1}`}
            dims={{ w: c.width, h: c.height }}
            aspect={ratio(c.width, c.height)}
            fileUrl={c.fileUrl}
            pageUrl={c.commonsPageUrl}
            reason={c.reason}
            sizeGain={`${(c.width / target.w).toFixed(1)}× linear · ${((c.width * c.height) / (target.w * target.h)).toFixed(1)}× pixels`}
            approve={
              <ApproveButton targetId={target.id} fileUrl={c.fileUrl} source={c.source ?? ""} />
            }
          />
        ))}
      </div>
    </article>
  );
}

function Panel({
  label,
  tone,
  src,
  alt,
  dims,
  aspect,
  fileUrl,
  pageUrl,
  reason,
  sizeGain,
  approve,
}: {
  label: string;
  tone: string;
  src: string;
  alt: string;
  dims: { w: number; h: number };
  aspect: string;
  fileUrl: string;
  pageUrl: string;
  reason?: string;
  sizeGain?: string;
  approve?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded border-2 p-3 ${tone}`}>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-zinc-700">
        <span>{label}</span>
        <span className="font-normal normal-case">
          {dims.w}×{dims.h} · {megapixels(dims.w, dims.h)} MP · ratio {aspect}
        </span>
      </div>
      <div className="mt-2 flex-1 bg-zinc-900/5">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="block max-h-[600px] w-full object-contain"
          />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-zinc-500">
            (no image)
          </div>
        )}
      </div>
      {sizeGain && <p className="mt-2 text-xs text-emerald-700">{sizeGain}</p>}
      {reason && <p className="mt-2 text-xs text-zinc-700">{reason}</p>}
      {approve}
      <div className="mt-2 flex gap-3 text-xs">
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          Commons page
        </a>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          direct file
        </a>
      </div>
    </div>
  );
}
