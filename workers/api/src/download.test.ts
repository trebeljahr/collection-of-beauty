import { describe, expect, it, vi } from "vitest";
import { artworks } from "../../../src/lib/data";
import { downloadFilename, downloadOptions } from "../../../src/lib/downloads";
import { contentDisposition, type DownloadManifest, handleDownload } from "./download";

const ASSETS = "https://assets.example";

const MANIFEST: DownloadManifest = {
  "audubon-birds-raven": [
    "audubon-birds/101_Raven",
    ["4096.avif", "2560.avif", "1280.avif", "1280.webp"],
    "john-james-audubon-raven",
    "Raven, John James Audubon, 1827. Public domain. Source: University of Pittsburgh.",
    "Public domain",
    "audubon-birds-of-america",
  ],
};

function upstream(body = "bytes", init: ResponseInit = {}) {
  return vi.fn(
    async () => new Response(body, { status: 200, headers: { "content-length": "5" }, ...init }),
  );
}

const url = (query: string) => new URL(`https://collectionofbeauty.com/api/download/x${query}`);

describe("GET /api/download/<id>", () => {
  it("pipes the largest file with a filename when no width is asked for", async () => {
    const fetchImpl = upstream();
    const res = await handleDownload(url(""), "audubon-birds-raven", MANIFEST, ASSETS, fetchImpl);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(`${ASSETS}/audubon-birds/101_Raven/4096.avif`);
    expect(res.headers.get("content-type")).toBe("image/avif");
    expect(res.headers.get("content-disposition")).toBe(
      contentDisposition("john-james-audubon-raven-4096px.avif"),
    );
    expect(res.headers.get("content-length")).toBe("5");
    expect(res.headers.get("x-collection")).toBe("audubon-birds-of-america");
    expect(await res.text()).toBe("bytes");
  });

  it("serves a width and format the work was built at", async () => {
    const fetchImpl = upstream();
    const res = await handleDownload(
      url("?w=1280&f=webp"),
      "audubon-birds-raven",
      MANIFEST,
      ASSETS,
      fetchImpl,
    );
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledWith(`${ASSETS}/audubon-birds/101_Raven/1280.webp`);
    expect(res.headers.get("content-type")).toBe("image/webp");
  });

  it("refuses widths, formats and ids that were never built", async () => {
    const fetchImpl = upstream();
    expect(
      (await handleDownload(url("?w=9999"), "audubon-birds-raven", MANIFEST, ASSETS, fetchImpl))
        .status,
    ).toBe(404);
    expect(
      (
        await handleDownload(
          url("?w=2560&f=webp"),
          "audubon-birds-raven",
          MANIFEST,
          ASSETS,
          fetchImpl,
        )
      ).status,
    ).toBe(404);
    expect(
      (await handleDownload(url("?f=png"), "audubon-birds-raven", MANIFEST, ASSETS, fetchImpl))
        .status,
    ).toBe(400);
    expect((await handleDownload(url(""), "nope", MANIFEST, ASSETS, fetchImpl)).status).toBe(404);
    expect((await handleDownload(url(""), "constructor", MANIFEST, ASSETS, fetchImpl)).status).toBe(
      404,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers 502 when storage fails", async () => {
    const failing = vi.fn(async () => new Response("nope", { status: 404 }));
    const res = await handleDownload(url(""), "audubon-birds-raven", MANIFEST, ASSETS, failing);
    expect(res.status).toBe(502);
    const throwing = vi.fn(async () => {
      throw new Error("reset");
    });
    expect(
      (await handleDownload(url(""), "audubon-birds-raven", MANIFEST, ASSETS, throwing)).status,
    ).toBe(502);
  });
});

// The manifest scripts/build-api-worker-data.ts writes must name exactly
// the files the artwork page offers, under the filenames the Next route
// gave them.
describe("download manifest from the catalogue", () => {
  it("matches downloadOptions and downloadFilename for every work", async () => {
    const { buildDownloadManifest } = await import("../../../scripts/build-api-worker-data");
    const manifest = buildDownloadManifest();
    const wrong: string[] = [];
    for (const art of artworks) {
      const entry = manifest[art.id];
      const options = downloadOptions(art);
      const files = options.map((o) => `${o.width}.${o.format}`);
      if (!entry || entry[1].join() !== files.join()) {
        wrong.push(art.id);
        continue;
      }
      const largest = options[0];
      const name = `${entry[2]}-${largest.width}px.${largest.format}`;
      if (name !== downloadFilename(art, largest.width, largest.format)) wrong.push(art.id);
    }
    expect(wrong).toEqual([]);
  });
});

describe("withSecurityHeaders", () => {
  it("adds the site's headers, also to a redirect whose headers are immutable", async () => {
    const { withSecurityHeaders } = await import("./router");
    const res = withSecurityHeaders(
      Response.redirect("https://collectionofbeauty.com/sub/error", 303),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://collectionofbeauty.com/sub/error");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
