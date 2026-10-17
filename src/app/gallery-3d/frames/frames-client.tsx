"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ArtworkListing } from "@/lib/data";
import { assignEra } from "@/lib/gallery-eras";
import { pickFrameDesign } from "@/lib/gallery-layout/frame-design";
import { STATIC_DATA } from "@/lib/static-data/keys";
import { FrameSheetClient } from "./frame-sheet-client";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Works for one sheet: the works named by id, all of a school or of a
 *  look in a stable shuffle, or with none named, the same number from
 *  each school in turn. */
function pickWorks(
  listings: readonly ArtworkListing[],
  ids: string[] | null,
  movement: string | null,
  look: string | null,
  count: number,
  page: number,
): ArtworkListing[] {
  const hung = listings.filter((a) => a.objectKey && a.width && a.height);
  if (ids) return ids.flatMap((id) => hung.filter((a) => a.id === id));
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

/** The sheet, chosen from the query in the browser: the page is a
 *  static file, so it loads the museum's catalogue and picks here. */
export function FramesClient() {
  const q = useSearchParams();
  const [listings, setListings] = useState<ArtworkListing[] | null>(null);
  useEffect(() => {
    fetch(STATIC_DATA.museum)
      .then((res) => (res.ok ? (res.json() as Promise<ArtworkListing[]>) : []))
      .then(setListings)
      .catch(() => setListings([]));
  }, []);
  if (!listings) return null;
  const one = (key: string) => q.get(key);
  const count = Math.min(96, Math.max(1, Number(one("n")) || 32));
  const cols = Math.min(16, Math.max(1, Number(one("cols")) || 8));
  const page = Math.max(0, Number(one("page")) || 0);
  const works = pickWorks(
    listings,
    one("id")?.split(",") ?? null,
    one("m"),
    one("look"),
    count,
    page,
  );
  const era = one("era") ?? (works[0] && assignEra(works[0])) ?? "baroque";
  return (
    <FrameSheetClient
      works={works}
      cols={cols}
      eraId={era}
      realSize={one("real") === "1"}
      hung={one("hung") === "1"}
    />
  );
}
