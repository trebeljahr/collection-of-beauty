import type { MetadataRoute } from "next";
import { artists, artworks } from "@/lib/data";
import { absoluteUrl } from "@/lib/seo";

/**
 * Served at /sitemap.xml. Emits every indexable URL:
 *   - Static pages (home, timeline, artists index, lineage, 3D gallery)
 *   - One entry per artist (~329)
 *   - One entry per artwork (~2,947)
 *
 * Total is well under Google's 50k per-sitemap cap, so we can ship one file.
 * If the collection ever grows past that, split via a sitemap index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: absoluteUrl("/timeline"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/artists"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: absoluteUrl("/lineage"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    {
      url: absoluteUrl("/gallery-3d"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

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
  }));

  return [...staticEntries, ...artistEntries, ...artworkEntries];
}
