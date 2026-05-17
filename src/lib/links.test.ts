import { describe, expect, it } from "vitest";
import { GITHUB_URL, SITE_URL, suggestFixUrl } from "./links";

function parse(url: string) {
  const u = new URL(url);
  return {
    origin: `${u.origin}${u.pathname}`,
    title: u.searchParams.get("title") ?? "",
    body: u.searchParams.get("body") ?? "",
  };
}

describe("suggestFixUrl", () => {
  it("targets the new-issue form on the canonical GitHub repo", () => {
    const url = suggestFixUrl({ id: "abc-123", title: "Starry Night" });
    expect(url.startsWith(`${GITHUB_URL}/issues/new?`)).toBe(true);
  });

  it("encodes the title with id, work title, and artist when provided", () => {
    const url = suggestFixUrl({
      id: "abc-123",
      title: "Starry Night",
      artist: "Vincent van Gogh",
    });
    const { title } = parse(url);
    expect(title).toBe("Fix: Starry Night — Vincent van Gogh");
  });

  it("omits the artist suffix when no artist is given", () => {
    const url = suggestFixUrl({ id: "abc-123", title: "Anonymous portrait" });
    const { title } = parse(url);
    expect(title).toBe("Fix: Anonymous portrait");
  });

  it("body contains the artwork id, artist, source URL, and a markdown link to the live detail page", () => {
    const url = suggestFixUrl({
      id: "abc-123",
      title: "Starry Night",
      artist: "Vincent van Gogh",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Starry_Night.jpg",
    });
    const { body } = parse(url);
    expect(body).toContain("abc-123");
    expect(body).toContain("Vincent van Gogh");
    expect(body).toContain("https://commons.wikimedia.org/wiki/File:Starry_Night.jpg");
    expect(body).toContain(`[Starry Night](${SITE_URL}/artwork/abc-123)`);
  });

  it("encodes spaces as %20 (not '+') so GitHub displays the prefill cleanly", () => {
    const url = suggestFixUrl({ id: "x", title: "A B C" });
    // The raw, undecoded query string should never contain '+' for a space.
    const rawQuery = url.split("?")[1] ?? "";
    expect(rawQuery).not.toMatch(/title=[^&]*\+/);
    expect(rawQuery).toMatch(/title=Fix%3A%20A%20B%20C/);
  });
});
