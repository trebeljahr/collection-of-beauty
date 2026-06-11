import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml link handling", () => {
  it("absolutizes site-rooted links when siteUrl is given", async () => {
    const html = await markdownToHtml("see [Poussin](/artist/nicolas-poussin)", {
      siteUrl: "https://beauty.trebeljahr.com/",
    });
    expect(html).toContain('href="https://beauty.trebeljahr.com/artist/nicolas-poussin"');
  });

  it("leaves site-rooted links relative without siteUrl (website path)", async () => {
    const html = await markdownToHtml("see [Poussin](/artist/nicolas-poussin)");
    expect(html).toContain('href="/artist/nicolas-poussin"');
  });

  it("does not touch absolute external links, but marks them external", async () => {
    const html = await markdownToHtml("see [wiki](https://en.wikipedia.org/wiki/Bokashi)", {
      siteUrl: "https://beauty.trebeljahr.com",
    });
    expect(html).toContain('href="https://en.wikipedia.org/wiki/Bokashi"');
    expect(html).toContain('target="_blank"');
  });

  it("internal links never get target=_blank", async () => {
    const html = await markdownToHtml("[cross-link](/newsletter/0002-japanese-rain)", {
      siteUrl: "https://beauty.trebeljahr.com",
    });
    expect(html).not.toContain("target");
  });
});
