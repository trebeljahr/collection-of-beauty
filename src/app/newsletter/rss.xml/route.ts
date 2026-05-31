import { resolveEditionCover } from "@/lib/newsletter/cover";
import { loadPublishedEditions } from "@/lib/newsletter/editions";
import { markdownToHtml } from "@/lib/newsletter/markdown";
import type { Edition } from "@/lib/newsletter/types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

/**
 * RSS 2.0 feed for the Drops archive. Readers (Feedly, NetNewsWire,
 * etc.) and search engines both consume this. Regenerated on every build;
 * Next caches the route output, which we refresh hourly so a new edition
 * appears in feed readers without waiting for the next deploy.
 */
export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  // Pin to noon UTC so the date is unambiguous in feed readers.
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

async function renderItem(edition: Edition): Promise<string> {
  const url = `${SITE_URL}/newsletter/${edition.fileSlug}`;
  const cover = resolveEditionCover(edition);
  const bodyHtml = edition.body.length > 0 ? await markdownToHtml(edition.body) : "";
  const enclosure = cover
    ? `<enclosure url="${escapeXml(cover.url)}" type="image/webp" length="0" />`
    : "";
  const categories = edition.tags.map((t) => `<category>${escapeXml(t)}</category>`).join("");

  return [
    "<item>",
    `<title>${escapeXml(edition.title)}</title>`,
    `<link>${escapeXml(url)}</link>`,
    `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `<pubDate>${rfc822(edition.publishedAt)}</pubDate>`,
    `<description>${escapeXml(edition.excerpt)}</description>`,
    `<content:encoded><![CDATA[${bodyHtml}]]></content:encoded>`,
    enclosure,
    categories,
    "</item>",
  ].join("");
}

export async function GET(): Promise<Response> {
  const editions = loadPublishedEditions().slice().reverse();
  const items = await Promise.all(editions.map(renderItem));
  const buildDate = new Date().toUTCString();
  const feedUrl = `${SITE_URL}/drops/rss.xml`;
  const siteFeedUrl = `${SITE_URL}/drops`;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel>",
    `<title>Drops of Beauty — ${escapeXml(SITE_NAME)}</title>`,
    `<link>${escapeXml(siteFeedUrl)}</link>`,
    `<description>Drops of Beauty — themed editions from the ${escapeXml(SITE_NAME)} public-domain catalogue. Five works on one theme, every Sunday.</description>`,
    `<language>en-us</language>`,
    `<lastBuildDate>${buildDate}</lastBuildDate>`,
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    ...items,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
