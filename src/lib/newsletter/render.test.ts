import { describe, expect, it } from "vitest";
import { editionArchiveUrl } from "./render";

describe("editionArchiveUrl", () => {
  it("marks newsletter email archive links so the public page can hide signup UI", () => {
    expect(editionArchiveUrl("https://example.com/", "0004-books-and-reading")).toBe(
      "https://example.com/newsletter/0004-books-and-reading?from=email",
    );
  });
});
