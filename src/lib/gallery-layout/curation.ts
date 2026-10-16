import type { ArtworkListing } from "@/lib/data";
import type { Era } from "@/lib/gallery-eras";

// How an era's works are ordered before they are dealt into its rooms,
// and what a room is called once it hangs them.
//
// Until 17 October 2026 an era's works were shuffled by a hash of their
// id and grouped by movement alone. A movement is wide (Baroque holds
// Caravaggio, Rubens, Poussin and Velázquez), so a room was a random
// draw from it: one Baroque gallery hung 17 artists of four countries,
// and two rooms of one floor were both signed "Baroque". Rico asked for
// rooms that "make sense". Now the works are ordered as a museum hangs
// them: by school (movement and country), each school in the order of
// its median year and a country's schools one after another, each
// artist's works together and in date order.
// `fillRooms` deals that sequence into the rooms in the order they are
// walked, so a room holds a few whole artists of one school, and the
// next room carries on where it stopped.

/** Movements a country's name goes in front of: "Italian Baroque",
 *  "German Romanticism", schools that grew up apart in each country.
 *  Others already say where they are from ("Dutch Golden Age", "Hudson
 *  River School", "Ukiyo-e") or were one movement across borders: Van
 *  Gogh's Post-Impressionism is Cézanne's. */
const GENERIC_MOVEMENTS: ReadonlySet<string> = new Set([
  "Renaissance",
  "Northern Renaissance",
  "Mannerism",
  "Baroque",
  "Rococo",
  "Neoclassicism",
  "Romanticism",
  "Realism",
  "Academicism",
  "Impressionism",
]);

/** Countries that hang together. A school is a movement in one of
 *  these, so Fuseli's Swiss birth does not give him a room apart from
 *  the German Romantics, and a Scot hangs with the English. */
const REGION_OF: Readonly<Record<string, string>> = {
  English: "British",
  Scottish: "British",
  Welsh: "British",
  Irish: "British",
  British: "British",
  Flemish: "Flemish",
  Netherlandish: "Flemish",
  "Early Netherlandish": "Flemish",
  Belgian: "Flemish",
  German: "German",
  Austrian: "German",
  Swiss: "German",
};

/** The country a work is filed under: the first of its artist's
 *  nationalities ("American / British" is an American), except that a
 *  Spanish painter born elsewhere is Spanish (El Greco). */
function regionOf(nationality: string | null): string | null {
  if (!nationality) return null;
  const parts = nationality.split("/").map((p) => p.trim());
  if (parts.includes("Spanish")) return "Spanish";
  const first = parts[0];
  return REGION_OF[first] ?? first;
}

/** What a school's country is called in its name. */
function adjectiveFor(region: string, movement: string): string {
  if (region === "Flemish" && /Renaissance/.test(movement)) return "Netherlandish";
  return region;
}

/** The school a work hangs with: its movement, and for a movement that
 *  spans Europe, its country. */
export function schoolOf(artwork: ArtworkListing, era: Era): string {
  // Natural history is a few books, each by one hand: Vesalius's
  // anatomy, Redouté's lilies, Audubon's birds, Haeckel's plates.
  if (era.id === "natural-history" && artwork.artist) return artwork.artist;
  const movement = artwork.movement?.trim() || era.title;
  if (movement === "Classical East Asian") {
    const region = regionOf(artwork.nationality);
    return region ? `${region} Painting` : movement;
  }
  if (!GENERIC_MOVEMENTS.has(movement)) return movement;
  const region = regionOf(artwork.nationality);
  if (!region) return movement;
  if (movement === "Baroque" && region === "Spanish") return "Spanish Golden Age";
  const base = movement === "Northern Renaissance" ? "Renaissance" : movement;
  return `${adjectiveFor(region, movement)} ${base}`;
}

const artistKey = (a: ArtworkListing) => a.artistSlug ?? a.artist ?? "";

function median(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const yearsOf = (works: readonly ArtworkListing[]) =>
  works.map((a) => a.year).filter((y): y is number => y != null);

/**
 * An era's works in the order they are hung, as a queue of schools for
 * `fillRooms`. A country's schools hang one after another, so French
 * Realism and French Academicism share rooms and Russian Realism does
 * not come between them. Countries go in the order of the median year
 * of their works, schools within a country in the order of theirs, and
 * so do the artists within a school. An artist's works go by year, then
 * by title. Undated works sort after the dated ones of their group.
 */
export function curatedQueue(
  era: Era,
  works: readonly ArtworkListing[],
): Array<{ name: string; artworks: ArtworkListing[] }> {
  const bySchool = new Map<string, ArtworkListing[]>();
  const byRegion = new Map<string, ArtworkListing[]>();
  for (const a of works) {
    const school = schoolOf(a, era);
    bySchool.set(school, [...(bySchool.get(school) ?? []), a]);
  }
  // Natural history's schools are its books: they go by date alone.
  const byDate = era.id === "natural-history";
  const schools = [...bySchool.entries()].map(([name, list]) => {
    const region = byDate ? "" : ranked(list, (a) => regionOf(a.nationality) ?? "")[0][0];
    byRegion.set(region, [...(byRegion.get(region) ?? []), ...list]);
    return { name, region, artworks: orderSchool(list), year: median(yearsOf(list)) };
  });
  const regionYear = (region: string) => median(yearsOf(byRegion.get(region) ?? []));
  return schools
    .sort(
      (a, b) =>
        regionYear(a.region) - regionYear(b.region) ||
        a.region.localeCompare(b.region) ||
        a.year - b.year ||
        a.name.localeCompare(b.name),
    )
    .map(({ name, artworks }) => ({ name, artworks }));
}

function orderSchool(works: ArtworkListing[]): ArtworkListing[] {
  const byArtist = new Map<string, ArtworkListing[]>();
  for (const a of works) {
    const key = artistKey(a);
    const list = byArtist.get(key) ?? [];
    list.push(a);
    byArtist.set(key, list);
  }
  const byWork = (a: ArtworkListing, b: ArtworkListing) =>
    (a.year ?? Number.POSITIVE_INFINITY) - (b.year ?? Number.POSITIVE_INFINITY) ||
    (a.title ?? "").localeCompare(b.title ?? "") ||
    a.id.localeCompare(b.id);
  return [...byArtist.entries()]
    .map(([key, list]) => ({ key, list: list.sort(byWork), year: median(yearsOf(list)) }))
    .sort((a, b) => a.year - b.year || a.key.localeCompare(b.key))
    .flatMap(({ list }) => list);
}

/** Share of a room one artist has to hang for the room to take their
 *  name, and the most the next artist may hang beside them. */
const ARTIST_ROOM_SHARE = 0.5;
const ARTIST_ROOM_RIVAL = 0.25;
/** Share of a room one school has to hang to name it, and the most the
 *  next school may hang beside it. */
const SCHOOL_ROOM_SHARE = 0.5;
const SCHOOL_ROOM_RIVAL = 0.3;
/** Share two schools together have to hang to name a room as a pair. */
const SCHOOL_PAIR_SHARE = 0.75;

function ranked(works: readonly ArtworkListing[], key: (a: ArtworkListing) => string) {
  const counts = new Map<string, number>();
  for (const a of works) counts.set(key(a), (counts.get(key(a)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * A room's sign, from what hangs in it. A room that is mostly one
 * artist's takes their name ("Pierre-Joseph Redouté"); one that is
 * mostly one school takes the school's ("Flemish Baroque"); two schools
 * of one movement share it ("German and Italian Renaissance"). A room
 * that is none of these is signed with its era.
 */
export function roomTitle(works: readonly ArtworkListing[], era: Era): string {
  if (works.length === 0) return era.title;
  const n = works.length;
  const artists = ranked(
    works.filter((a) => a.artist),
    (a) => a.artist!,
  );
  const [lead, rival] = artists;
  if (lead && lead[1] / n >= ARTIST_ROOM_SHARE && (!rival || rival[1] / n < ARTIST_ROOM_RIVAL)) {
    return lead[0];
  }
  const schools = ranked(works, (a) => schoolOf(a, era));
  const [first, second] = schools;
  if (first[1] / n >= SCHOOL_ROOM_SHARE && (!second || second[1] / n < SCHOOL_ROOM_RIVAL)) {
    return first[0];
  }
  // Untagged works file under the era's own name, which is no school
  // to pair with.
  const named = second && first[0] !== era.title && second[0] !== era.title;
  if (named && (first[1] + second[1]) / n >= SCHOOL_PAIR_SHARE) {
    return pairName(first[0], second[0]);
  }
  return era.title;
}

/** "German Renaissance" and "Italian Renaissance" are "German and
 *  Italian Renaissance", "French Realism" and "French Academicism" are
 *  "French Realism and Academicism"; two schools with nothing in common
 *  are "A and B". Ordered by name, so a room's sign does not depend on
 *  which of the two it hangs more of. */
function pairName(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  const xs = x.split(" ");
  const ys = y.split(" ");
  if (xs.length === 2 && ys.length === 2) {
    if (xs[1] === ys[1]) return `${xs[0]} and ${ys[0]} ${xs[1]}`;
    if (xs[0] === ys[0]) return `${xs[0]} ${xs[1]} and ${ys[1]}`;
  }
  return `${x} and ${y}`;
}

/** The line under a room's sign: how many works, their years, and the
 *  artists who hang most of them. */
export function roomDescription(works: readonly ArtworkListing[], title: string): string {
  if (works.length === 0) return title;
  const years = yearsOf(works);
  const span =
    years.length === 0
      ? ""
      : Math.min(...years) === Math.max(...years)
        ? `, ${years[0]}`
        : `, ${Math.min(...years)}–${Math.max(...years)}`;
  const artists = ranked(
    works.filter((a) => a.artist),
    (a) => a.artist!,
  )
    .map(([name]) => name)
    .filter((name) => name !== title);
  const shown = artists.slice(0, 3);
  const rest = artists.length - shown.length;
  const names =
    shown.length === 0 ? "" : `: ${shown.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`;
  return `${works.length} works${span}${names}`;
}
