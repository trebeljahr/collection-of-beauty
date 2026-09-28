import { COLLECTIONS } from "@/lib/collections";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
import { artists, artworkListings } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import type { TypoTarget } from "@/lib/not-found-match";

/**
 * Every page a mistyped URL might have meant: each artwork, artist, era,
 * colour, collection and top-level page, built once per server process.
 *
 * Server-only. It closes over the full listing array, the same way
 * `surprise-pool.ts` does, and has no business in a client chunk.
 */

/** Top-level pages. `aliases` are whole slugs that name the page
 *  outright ("/3d" is the museum). */
const STATIC_PAGES: { href: string; label: string; aliases?: string[] }[] = [
  { href: "/artists", label: "Artists", aliases: ["painters"] },
  { href: "/timeline", label: "Timeline" },
  { href: "/eras", label: "Eras", aliases: ["rooms"] },
  { href: "/collections", label: "Collections", aliases: ["downloads", "plates"] },
  { href: "/colours", label: "Colours", aliases: ["colors", "colour", "color"] },
  {
    href: "/gallery-3d",
    label: "The Museum",
    aliases: ["3d", "museum", "gallery", "3d-gallery", "gallery3d", "3d-museum"],
  },
  { href: "/surprise", label: "Surprise me", aliases: ["random", "surprise-me"] },
  { href: "/play", label: "Slideshow", aliases: ["slideshow", "slides"] },
  { href: "/drops", label: "Newsletter", aliases: ["subscribe", "newsletters"] },
  { href: "/newsletter", label: "Newsletter archive" },
  { href: "/about", label: "About", aliases: ["about-us"] },
  { href: "/press", label: "Press", aliases: ["press-kit", "media"] },
  { href: "/imprint", label: "Imprint", aliases: ["impressum", "legal", "contact"] },
  { href: "/privacy", label: "Privacy", aliases: ["privacy-policy"] },
];

function buildTargets(): TypoTarget[] {
  const targets: TypoTarget[] = [];

  for (const art of artworkListings) {
    const prefix = `${art.objectKey.slice(0, art.objectKey.indexOf("/"))}-`;
    const bare = art.id.startsWith(prefix) ? art.id.slice(prefix.length) : art.id;
    targets.push({
      href: `/artwork/${art.id}`,
      label: art.englishTitle ?? art.title,
      keys: bare === art.id ? [art.id] : [art.id, bare],
    });
  }
  for (const artist of artists) {
    targets.push({ href: `/artist/${artist.slug}`, label: artist.name, keys: [artist.slug] });
  }
  for (const era of ERAS) {
    targets.push({ href: `/era/${era.id}`, label: era.title, keys: [era.id] });
  }
  for (const bucket of COLOR_BUCKETS) {
    targets.push({ href: `/colours/${bucket.id}`, label: bucket.label, keys: [bucket.id] });
  }
  for (const collection of COLLECTIONS) {
    targets.push({
      href: `/collection/${collection.slug}`,
      label: collection.title,
      keys: [collection.slug],
    });
  }
  for (const page of STATIC_PAGES) {
    targets.push({
      href: page.href,
      label: page.label,
      keys: [page.href.slice(1), ...(page.aliases ?? [])],
    });
  }
  return targets;
}

export const TYPO_TARGETS: readonly TypoTarget[] = buildTargets();
