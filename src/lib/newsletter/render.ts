import { render } from "@react-email/render";
import { createElement } from "react";
import type { Artwork } from "@/lib/data";
import { variantUrl } from "@/lib/utils";
import WeeklyDigest, {
  type DigestArtwork,
  type WeeklyDigestProps,
} from "../../../emails/weekly-digest";

export type RenderedDigest = {
  subject: string;
  html: string;
  text: string;
};

export type BuildDigestInput = {
  issueNumber: number;
  weekKey: string;
  issueDate: string;
  artworks: Artwork[];
  siteUrl: string;
};

/** Shape an Artwork for the email template (public image URL + link). */
export function toDigestArtwork(artwork: Artwork, siteUrl: string): DigestArtwork {
  return {
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    year: artwork.year,
    description: artwork.description,
    movement: artwork.movement,
    // 1280w WebP: readable on retina, ~150-300 KB, supported by every
    // modern client (Gmail, Apple Mail, Outlook 2019+). Pinned to 1280
    // because that's the only WebP width shrink-sources.mjs emits —
    // AVIF covers the rest, but email clients don't grok AVIF yet.
    imageUrl: variantUrl(artwork.objectKey, 1280, "webp"),
    artworkUrl: `${siteUrl.replace(/\/$/, "")}/artwork/${artwork.id}`,
  };
}

export async function renderDigest(input: BuildDigestInput): Promise<RenderedDigest> {
  const digestArtworks = input.artworks.map((a) => toDigestArtwork(a, input.siteUrl));
  const props: WeeklyDigestProps = {
    issueNumber: input.issueNumber,
    issueDate: input.issueDate,
    weekKey: input.weekKey,
    artworks: digestArtworks,
    siteUrl: input.siteUrl,
  };
  const element = createElement(WeeklyDigest, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject = buildSubject(input.issueNumber, digestArtworks);
  return { subject, html, text };
}

function buildSubject(issueNumber: number, artworks: DigestArtwork[]): string {
  const lead = artworks[0];
  if (!lead) return `Collection of Beauty · Issue ${issueNumber}`;
  const byline = lead.artist ? ` by ${lead.artist}` : "";
  return `Collection of Beauty #${issueNumber}: ${lead.title}${byline} + 4 more`;
}
