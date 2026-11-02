import { describe, expect, it } from "vitest";
import { LISTMONK_UNSUBSCRIBE_URL } from "../../../emails/weekly-digest";
import { loadPublishedEditions } from "./editions";
import { editionArchiveUrl, renderEdition } from "./render";

describe("editionArchiveUrl", () => {
  it("marks newsletter email archive links so the public page can hide signup UI", () => {
    expect(editionArchiveUrl("https://example.com/", "0004-books-and-reading")).toBe(
      "https://example.com/newsletter/0004-books-and-reading?from=email",
    );
  });
});

describe("renderEdition's unsubscribe link", () => {
  const edition = loadPublishedEditions().at(-1);
  if (!edition) throw new Error("No published edition to render");

  it("keeps ListMonk's placeholder intact for a campaign to substitute", async () => {
    const { html } = await renderEdition({
      edition,
      siteUrl: "https://example.com",
      unsubscribeUrl: LISTMONK_UNSUBSCRIBE_URL,
    });
    expect(html).toContain(`href="${LISTMONK_UNSUBSCRIBE_URL}"`);
  });

  it("puts a transactional send's own link in the footer, with no placeholder left", async () => {
    const { html, text } = await renderEdition({
      edition,
      siteUrl: "https://example.com",
      unsubscribeUrl: "https://example.com/sub/unsubscribe?token=abc",
    });
    expect(html).toContain('href="https://example.com/sub/unsubscribe?token=abc"');
    expect(html).not.toContain("{{");
    expect(text).toContain("https://example.com/sub/unsubscribe?token=abc");
  });
});
