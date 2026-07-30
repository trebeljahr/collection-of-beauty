import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("names Wikimedia Commons file pages", () => {
    expect(sourceLabel("https://commons.wikimedia.org/wiki/File:Starry_Night.jpg")).toBe(
      "Wikimedia Commons",
    );
  });

  it("does not claim Commons for the c82.net restorations", () => {
    expect(sourceLabel("https://www.c82.net/redoute/flower/alstroemeria-ligtu")).toBe("c82.net");
  });

  it("matches a known host with or without the www prefix", () => {
    expect(sourceLabel("https://c82.net/redoute")).toBe("c82.net");
    expect(sourceLabel("https://www.loc.gov/item/123")).toBe("Library of Congress");
  });

  it("falls back to the bare hostname for unknown hosts", () => {
    expect(sourceLabel("https://www.example.org/some/page")).toBe("example.org");
  });

  it("returns a generic label for missing or unparseable urls", () => {
    expect(sourceLabel(null)).toBe("Original source");
    expect(sourceLabel("")).toBe("Original source");
    expect(sourceLabel("not a url")).toBe("Original source");
  });
});
