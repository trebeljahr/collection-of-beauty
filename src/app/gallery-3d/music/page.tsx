// Credits for the museum's background music. Each CC BY and CC BY-SA
// licence asks for the work, the author, the source, the licence and a
// note of changes; every track below carries all five.

import type { Metadata } from "next";
import Link from "next/link";
import { GALLERY_MUSIC, type MusicTrack } from "@/lib/gallery-music";

export const metadata: Metadata = {
  title: "Museum music",
  description: `Credits and licences for the ${GALLERY_MUSIC.length} recordings the 3D museum plays in the background.`,
  alternates: { canonical: "/gallery-3d/music" },
};

const LINK =
  "rounded-sm underline hover:text-[var(--muted-foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export default function MuseumMusicPage() {
  const records = GALLERY_MUSIC.filter((t) => t.pre1963).length;
  const usProtected = GALLERY_MUSIC.filter((t) => t.pre1963 && t.usStatus).length;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 md:pb-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl md:text-4xl">Museum music</h1>
      </header>

      <section className="space-y-4 text-[var(--foreground)]">
        <p>
          The{" "}
          <Link href="/gallery-3d" className={LINK}>
            museum
          </Link>{" "}
          plays these {GALLERY_MUSIC.length} recordings in random order. Each plays once before any
          plays again. The settings in the museum turn the music off or skip to the next piece.
        </p>
        <p>
          Of these, {GALLERY_MUSIC.length - records} were released by their performers under a
          Creative Commons licence or into the public domain. The other {records} are 78 rpm records
          published before 1963. In the EU the rights in a recording ran 50 years from publication
          until 2013, when they were extended to 70 years for recordings that were still protected.
          So no rights remain in these records in the EU.{" "}
          {usProtected === records
            ? "All of them are still protected in the United States"
            : `${usProtected} of them are still protected in the United States`}
          ; each entry below gives the year it becomes free there.
        </p>
        <p>
          The files here are not the originals. Each was converted to MP3 and set to the same
          loudness, and the 78 rpm records were mixed to mono with the rumble below 40 Hz removed.
          The licence of each recording applies to this version as well.
        </p>
      </section>

      <ol className="mt-10 space-y-8">
        {GALLERY_MUSIC.map((track) => (
          <TrackCredit key={track.id} track={track} />
        ))}
      </ol>
    </div>
  );
}

function TrackCredit({ track }: { track: MusicTrack }) {
  return (
    <li className="border-t border-[var(--border)] pt-6">
      <h2 className="font-serif text-xl">{track.work}</h2>
      <p className="mt-1 text-[var(--muted-foreground)]">
        {track.composer} ({track.composerDates})
      </p>
      <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-[var(--muted-foreground)]">Performed by</dt>
        <dd>{track.performer}</dd>
        <dt className="text-[var(--muted-foreground)]">Recording</dt>
        <dd>{track.recorded}</dd>
        <dt className="text-[var(--muted-foreground)]">Licence</dt>
        <dd>
          {track.licence.url ? (
            <a href={track.licence.url} className={LINK} rel="license noopener">
              {track.licence.name}
            </a>
          ) : (
            track.licence.name
          )}
        </dd>
        <dt className="text-[var(--muted-foreground)]">Source</dt>
        <dd>
          <a href={track.sourceUrl} className={LINK} rel="noopener">
            {track.sourceName}
          </a>
        </dd>
        <dt className="text-[var(--muted-foreground)]">Rights</dt>
        <dd>
          {track.rights}
          {track.usStatus ? ` ${track.usStatus}` : ""}
        </dd>
      </dl>
    </li>
  );
}
