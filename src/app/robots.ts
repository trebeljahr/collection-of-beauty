import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * Served at /robots.txt. Opens the whole site to crawlers except the
 * newsletter API (no value to index, and we don't want crawlers poking
 * the send endpoint — the Bearer auth would block them anyway).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
