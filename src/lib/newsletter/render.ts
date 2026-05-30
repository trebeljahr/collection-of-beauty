import { render } from "@react-email/render";
import { createElement } from "react";
import { displayTitle } from "@/lib/artwork-format";
import { artworks as ALL_ARTWORKS, type Artwork } from "@/lib/data";
import { publicVariantUrl } from "@/lib/utils";
import WeeklyDigest, {
  type DigestArtwork,
  type WeeklyDigestProps,
} from "../../../emails/weekly-digest";
import { markdownToHtml } from "./markdown";
import type { Edition } from "./types";

export type RenderedEdition = {
  subject: string;
  html: string;
  text: string;
};

/** Build the per-artwork shape the email template needs. */
export function toDigestArtwork(
  artwork: Artwork,
  note: string | undefined,
  siteUrl: string,
): DigestArtwork {
  return {
    id: artwork.id,
    title: displayTitle(artwork),
    artist: artwork.artist,
    year: artwork.year,
    movement: artwork.movement,
    // 1280w WebP: readable on retina, ~150-300 KB, supported by every
    // modern client. Pinned to 1280 because that's the only WebP width
    // shrink-sources.mjs emits — AVIF covers the rest, but email
    // clients don't grok AVIF yet.
    imageUrl: publicVariantUrl(artwork.objectKey, 1280, "webp"),
    artworkUrl: `${siteUrl.replace(/\/$/, "")}/artwork/${artwork.id}`,
    note: note ?? null,
  };
}

/**
 * Resolve the edition's artwork ids against the catalogue. Throws on
 * unknown ids so a typo in frontmatter fails the build loudly.
 */
export function resolveEditionArtworks(
  edition: Edition,
): Array<{ artwork: Artwork; note?: string }> {
  const byId = new Map(ALL_ARTWORKS.map((a) => [a.id, a]));
  return edition.artworks.map((entry, i) => {
    const artwork = byId.get(entry.id);
    if (!artwork) {
      throw new Error(
        `Edition ${edition.fileSlug}: artworks[${i}] references unknown id "${entry.id}".`,
      );
    }
    return { artwork, note: entry.note };
  });
}

export type RenderEditionInput = {
  edition: Edition;
  siteUrl: string;
  /**
   * Where the unsubscribe link comes from in the final email.
   *
   *   - `"listmonk-campaign"` (default): emit ListMonk's `{{ UnsubscribeURL }}`
   *     placeholder inline. ListMonk's Go template engine substitutes it
   *     per recipient when the campaign body is rendered for delivery.
   *   - `"tx-template"`: omit the in-body unsubscribe block entirely. The
   *     ListMonk transactional template renders the already-built body
   *     without trying to evaluate campaign-only unsubscribe helpers.
   */
  unsubscribeMode?: "listmonk-campaign" | "tx-template";
};

export async function renderEdition(input: RenderEditionInput): Promise<RenderedEdition> {
  const { edition, siteUrl, unsubscribeMode = "listmonk-campaign" } = input;
  const resolved = resolveEditionArtworks(edition);
  const digestArtworks = resolved.map((r) => toDigestArtwork(r.artwork, r.note, siteUrl));
  const introHtml = edition.body.length > 0 ? await markdownToHtml(edition.body) : "";

  const issueDate = formatIssueDate(edition.publishedAt);
  const archiveUrl = `${siteUrl.replace(/\/$/, "")}/newsletter/${edition.fileSlug}`;

  const props: WeeklyDigestProps = {
    issueNumber: edition.number,
    issueDate,
    title: edition.title,
    introHtml,
    artworks: digestArtworks,
    siteUrl,
    archiveUrl,
    // Default prop is the ListMonk placeholder; setting `null` removes
    // the block entirely for transactional sends.
    unsubscribeUrl: unsubscribeMode === "tx-template" ? null : undefined,
  };

  const element = createElement(WeeklyDigest, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject = buildSubject(edition);
  return { subject, html, text };
}

function buildSubject(edition: Edition): string {
  // The user can override via frontmatter `subject`. Otherwise the title
  // is good enough on its own — adding "Issue #N" feels redundant when
  // every email already has that in its header.
  return edition.subject;
}

function formatIssueDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
