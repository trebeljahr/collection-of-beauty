// Debug sheet of the museum's picture frames: a wall of works, each in
// the frame `pickFrameDesign` gives it, lit as in the galleries.
//
//   /gallery-3d/frames                 a spread across every school
//   /gallery-3d/frames?m=Baroque       one school (substring of the tag)
//   /gallery-3d/frames?look=hogarth    one look (a LookId of frame-design.ts)
//   /gallery-3d/frames?n=12&cols=4     fewer, larger
//   /gallery-3d/frames?page=2          the next sheet
//   /gallery-3d/frames?real=1          works at their measured sizes

import type { Metadata } from "next";
import { type ArtworkListing, artworkListings } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
import { pickFrameDesign } from "@/lib/gallery-layout/frame-design";
import { FrameSheetClient } from "./frame-sheet-client";

export const metadata: Metadata = {
  title: "Museum frames · debug",
  robots: { index: false, follow: false },
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Works for one sheet: all of a school or of a look in a stable
 *  shuffle, or with neither named, the same number from each school in
 *  turn. */
function pickWorks(
  movement: string | null,
  look: string | null,
  count: number,
  page: number,
): ArtworkListing[] {
  const hung = artworkListings.filter((a) => a.objectKey && a.width && a.height);
  const shuffled = [...hung].sort((a, b) => hash(a.id) - hash(b.id));
  if (look) {
    const of = shuffled.filter((a) => pickFrameDesign(a).look === look);
    return of.slice(page * count, (page + 1) * count);
  }
  if (movement) {
    const needle = movement.toLowerCase();
    const of = shuffled.filter((a) => (a.movement ?? "untagged").toLowerCase().includes(needle));
    return of.slice(page * count, (page + 1) * count);
  }
  const bySchool = new Map<string, ArtworkListing[]>();
  for (const a of shuffled) {
    const key = a.movement ?? "untagged";
    bySchool.set(key, [...(bySchool.get(key) ?? []), a]);
  }
  const schools = [...bySchool.values()].sort((a, b) => b.length - a.length);
  const out: ArtworkListing[] = [];
  for (let round = 0; out.length < (page + 1) * count; round++) {
    let any = false;
    for (const works of schools) {
      if (works[round]) {
        out.push(works[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return out.slice(page * count, (page + 1) * count);
}

export default async function FramesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const one = (key: string) => (typeof q[key] === "string" ? (q[key] as string) : null);
  const count = Math.min(96, Math.max(1, Number(one("n")) || 32));
  const cols = Math.min(16, Math.max(1, Number(one("cols")) || 8));
  const page = Math.max(0, Number(one("page")) || 0);
  const works = pickWorks(one("m"), one("look"), count, page);
  const era = one("era") ?? (works[0] && assignEra(works[0])) ?? "baroque";
  return <FrameSheetClient works={works} cols={cols} eraId={era} realSize={one("real") === "1"} />;
}
