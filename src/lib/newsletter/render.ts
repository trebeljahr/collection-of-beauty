import { createElement } from "react";
import { render } from "@react-email/render";
import WeeklyDigest, {
  type DigestArtwork,
  type WeeklyDigestProps,
} from "../../../emails/weekly-digest";
import { assetUrl } from "@/lib/utils";
import type { Artwork } from "@/lib/data";

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
export function toDigestArtwork(
  artwork: Artwork,
  siteUrl: string,
): DigestArtwork {
  return {
    id: artwork.id,
    title: artwork.title,
    artist: artwork.artist,
    year: artwork.year,
    description: artwork.description,
    movement: artwork.movement,
    imageUrl: assetUrl(artwork.objectKey),
    artworkUrl: `${siteUrl.replace(/\/$/, "")}/artwork/${artwork.id}`,
  };
}

export async function renderDigest(
  input: BuildDigestInput,
): Promise<RenderedDigest> {
  const digestArtworks = input.artworks.map((a) =>
    toDigestArtwork(a, input.siteUrl),
  );
  const props: WeeklyDigestProps = {
    issueNumber: input.issueNumber,
    issueDate: input.issueDate,
    weekKey: input.weekKey,
    artworks: digestArtworks,
    siteUrl: input.siteUrl,
  };
  const element = createElement(WeeklyDigest, props);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  const subject = buildSubject(input.issueNumber, digestArtworks);
  return { subject, html, text };
}

function buildSubject(issueNumber: number, artworks: DigestArtwork[]): string {
  const lead = artworks[0];
  if (!lead) return `Collection of Beauty · Issue ${issueNumber}`;
  const byline = lead.artist ? ` by ${lead.artist}` : "";
  return `Collection of Beauty #${issueNumber}: ${lead.title}${byline} + 4 more`;
}
