import type { MetadataRoute } from "next";
import { COLOR_BUCKETS } from "@/lib/color-buckets.mjs";
import { artists, artworks } from "@/lib/data";
import { ERAS } from "@/lib/gallery-eras";
import { sitemapImagesForArtwork } from "@/lib/licensable-images";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { getPlateSets } from "@/lib/plate-sets";
import { absoluteUrl } from "@/lib/seo";

// Cache the rendered sitemap for a day. Iterating ~4,900 entries on
// every crawler hit is wasteful — the underlying data only changes
// when `pnpm assets:build-data` runs and the site redeploys, so the
// next build invalidates this naturally.
export const revalidate = 86400;

/**
 * Served at /sitemap.xml. Emits every indexable URL:
 *   - Static pages (home, timeline, artists index, eras index,
 *     collections index, drops index, subscribe, press, 3D gallery)
 *   - One entry per era (11)
 *   - One entry per plate set (4)
 *   - One entry per colour family (12)
 *   - One entry per published newsletter edition
 *   - One entry per artist (~331)
 *   - One entry per artwork (~4,571)
 *
 * Every artwork entry also carries an <image:image> pointing at the one
 * variant we know is servable for that work, which is what gets the
 * corpus into Google Images at all — the detail pages are otherwise
 * discovered by crawl alone.
 *
 * Deliberately absent: /dedup-review and /replace-low-res (internal
 * tools, also disallowed in robots.ts) and the two redirect surfaces —
 * /drops/<slug>, a permanent redirect to /newsletter/<slug>, and
 * /newsletter, a permanent redirect to /drops. Listing either alongside
 * its destination would only split signal.
 *
 * Total is ~4.9k URLs / ~2 MB, well under Google's 50k-URL and 50 MB
 * per-sitemap caps, so we can ship one file. If the collection ever
 * grows past that, split via a sitemap index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/timeline"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/artists"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/eras"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    {
      url: absoluteUrl("/collections"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    { url: absoluteUrl("/colours"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/sub"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    {
      url: absoluteUrl("/gallery-3d"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/press"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: absoluteUrl("/imprint"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/privacy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    { url: absoluteUrl("/drops"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  // Derived from ERAS — the same list /era/[id] builds its static params
  // from — so a twelfth era lands in the sitemap the moment it exists
  // instead of silently going missing until a crawler flags it.
  const eraEntries: MetadataRoute.Sitemap = ERAS.map((era) => ({
    url: absoluteUrl(`/era/${era.id}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Derived from getPlateSets() the same way the era entries are derived
  // from ERAS — a fifth plate set lands in the sitemap the moment it
  // exists. This is the page about the book, and the page that offers the
  // set's ZIP.
  const plateSetEntries: MetadataRoute.Sitemap = getPlateSets().map((set) => ({
    url: absoluteUrl(`/collection/${set.id}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // Same source the /colours/[family] page builds its static params from,
  // so a new family can't silently go missing from the sitemap.
  const colourEntries: MetadataRoute.Sitemap = COLOR_BUCKETS.map((bucket) => ({
    url: absoluteUrl(`/colours/${bucket.id}`),
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const editionEntries: MetadataRoute.Sitemap = loadPublishedEditions().map((ed) => ({
    url: absoluteUrl(`/newsletter/${ed.fileSlug}`),
    lastModified: new Date(`${ed.publishedAt}T12:00:00Z`),
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  const artistEntries: MetadataRoute.Sitemap = artists.map((a) => ({
    url: absoluteUrl(`/artist/${a.slug}`),
    lastModified: now,
    changeFrequency: "monthly",
    // More works → more signal → slightly higher priority.
    priority: a.count >= 20 ? 0.7 : a.count >= 5 ? 0.6 : 0.5,
  }));

  const artworkEntries: MetadataRoute.Sitemap = artworks.map((art) => ({
    url: absoluteUrl(`/artwork/${art.id}`),
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.5,
    images: sitemapImagesForArtwork(art),
  }));

  return [
    ...staticEntries,
    ...eraEntries,
    ...plateSetEntries,
    ...colourEntries,
    ...editionEntries,
    ...artistEntries,
    ...artworkEntries,
  ];
}
