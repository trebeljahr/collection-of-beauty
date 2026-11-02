import { render } from "@react-email/render";
import { createElement } from "react";
import { displayTitle } from "@/lib/artwork-format";
import { artworks as ALL_ARTWORKS, type Artwork } from "@/lib/data";
import { publicVariantUrl } from "@/lib/utils";
import WeeklyDigest, {
  type DigestArtwork,
  type WeeklyDigestProps,
} from "../../../emails/weekly-digest";
import { inlineEmailLinkStyles, markdownToHtml } from "./markdown";
import type { Edition } from "./types";
import { editionWallUrl, resolveEditionWall } from "./wall";

export type RenderedEdition = {
  subject: string;
  html: string;
  text: string;
  /** Header image URL; the send CLI checks it is live before sending. */
  wallUrl: string;
};

/** Build the per-artwork shape the email template needs. */
export async function toDigestArtwork(
  artwork: Artwork,
  note: string | undefined,
  siteUrl: string,
): Promise<DigestArtwork> {
  const noteHtml = note ? inlineEmailLinkStyles(await markdownToHtml(note, { siteUrl })) : null;
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
    noteHtml,
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
   * The link behind "Unsubscribe" in the footer. Required, so no send can
   * go out without one.
   *
   *   - A campaign passes `LISTMONK_UNSUBSCRIBE_URL`. ListMonk's Go template
   *     engine substitutes it per recipient when it renders the body.
   *   - A transactional send passes a signed link to `/sub/unsubscribe`. Its
   *     body reaches ListMonk as data, so a placeholder would stay literal.
   */
  unsubscribeUrl: string;
};

export function editionArchiveUrl(siteUrl: string, fileSlug: string): string {
  return `${siteUrl.replace(/\/$/, "")}/newsletter/${fileSlug}?from=email`;
}

export async function renderEdition(input: RenderEditionInput): Promise<RenderedEdition> {
  const { edition, siteUrl, unsubscribeUrl } = input;
  const resolved = resolveEditionArtworks(edition);
  const digestArtworks = await Promise.all(
    resolved.map((r) => toDigestArtwork(r.artwork, r.note, siteUrl)),
  );
  const introHtml =
    edition.body.length > 0
      ? inlineEmailLinkStyles(await markdownToHtml(edition.body, { siteUrl }))
      : "";

  const issueDate = formatIssueDate(edition.publishedAt);
  const archiveUrl = editionArchiveUrl(siteUrl, edition.fileSlug);
  const wall = resolveEditionWall(edition);
  const wallUrl = editionWallUrl(siteUrl, edition, wall);

  const props: WeeklyDigestProps = {
    issueNumber: edition.number,
    issueDate,
    title: edition.title,
    introHtml,
    artworks: digestArtworks,
    siteUrl,
    archiveUrl,
    unsubscribeUrl,
    wall: {
      imageUrl: wallUrl,
      width: wall.layout.width,
      height: wall.layout.height,
      alt: wall.alt,
      palette: wall.palette,
    },
  };

  const element = createElement(WeeklyDigest, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  const subject = buildSubject(edition);
  return { subject, html, text, wallUrl };
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
