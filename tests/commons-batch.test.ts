import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  diffResolution,
  mergePayloads,
  readBatchCache,
  resolveBatchPages,
  titleKey,
  writeBatchCache,
} from "../scripts/lib/commons-batch.mjs";

const page = (title: string) => ({ title, imageinfo: [{ url: `https://x/${title}` }] });

describe("titleKey", () => {
  it("treats underscores, spaces, NFD and a lowercase first letter as one title", () => {
    const nfc = "File:Gérôme_Black_Bashi-Bazouk.jpg";
    expect(titleKey(nfc.normalize("NFD"))).toBe(titleKey("File:Gérôme Black Bashi-Bazouk.jpg"));
    expect(titleKey("File:foo_bar.jpg")).toBe(titleKey("file:Foo bar.jpg"));
  });
});

describe("resolveBatchPages", () => {
  it("follows a percent-encoded NFD normalization to the spaced page title", () => {
    // Shape copied from metadata/.cache/collection-of-beauty/batch-0000.json.
    const payload = {
      query: {
        normalized: [
          {
            fromencoded: true,
            from: "File%3A1280px-Ge%CC%81ro%CC%82me-Black_Bashi-Bazouk-c._1869.jpg",
            to: "File:1280px-Gérôme-Black_Bashi-Bazouk-c._1869.jpg",
          },
        ],
        pages: [page("File:1280px-Gérôme-Black Bashi-Bazouk-c. 1869.jpg")],
      },
    };
    const nfc = "1280px-Gérôme-Black_Bashi-Bazouk-c._1869.jpg";
    const nfd = nfc.normalize("NFD");
    const out = resolveBatchPages(payload, [nfc, nfd]);
    expect(out.get(nfc)?.title).toBe("File:1280px-Gérôme-Black Bashi-Bazouk-c. 1869.jpg");
    expect(out.get(nfd)?.title).toBe("File:1280px-Gérôme-Black Bashi-Bazouk-c. 1869.jpg");
  });

  it("follows a multi-hop chain and stops on a cycle", () => {
    const payload = {
      query: {
        normalized: [
          { from: "File:A.jpg", to: "File:B.jpg" },
          { from: "File:B.jpg", to: "File:C.jpg" },
          { from: "File:X.jpg", to: "File:Y.jpg" },
          { from: "File:Y.jpg", to: "File:X.jpg" },
        ],
        pages: [page("File:C.jpg")],
      },
    };
    const out = resolveBatchPages(payload, ["A.jpg", "X.jpg"]);
    expect(out.get("A.jpg")?.title).toBe("File:C.jpg");
    expect(out.get("X.jpg")).toBeNull();
  });

  it("resolves Cyrillic and CJK names", () => {
    const payload = {
      query: {
        normalized: [
          { from: "File:Верещагин_Апофеоз.jpg", to: "File:Верещагин Апофеоз.jpg" },
          { from: "File:葛飾北斎_富嶽.jpg", to: "File:葛飾北斎 富嶽.jpg" },
        ],
        pages: [page("File:Верещагин Апофеоз.jpg"), page("File:葛飾北斎 富嶽.jpg")],
      },
    };
    const out = resolveBatchPages(payload, ["Верещагин_Апофеоз.jpg", "葛飾北斎_富嶽.jpg"]);
    expect(out.get("Верещагин_Апофеоз.jpg")).not.toBeNull();
    expect(out.get("葛飾北斎_富嶽.jpg")).not.toBeNull();
  });
});

describe("mergePayloads", () => {
  it("resolves names from either half of a split batch", () => {
    const a = {
      query: {
        normalized: [{ from: "File:A_1.jpg", to: "File:A 1.jpg" }],
        pages: [page("File:A 1.jpg")],
      },
    };
    const b = { query: { pages: [page("File:Б.jpg")] } };
    const out = resolveBatchPages(mergePayloads(a, b), ["A_1.jpg", "Б.jpg"]);
    expect(out.get("A_1.jpg")?.title).toBe("File:A 1.jpg");
    expect(out.get("Б.jpg")?.title).toBe("File:Б.jpg");
  });
});

describe("batch cache", () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "commons-batch-")), "b.json");

  it("reuses a cache only for the exact filename list it was written for", () => {
    const file = tmp();
    writeBatchCache(file, ["a.jpg", "b.jpg"], { query: { pages: [] } });
    expect(readBatchCache(file, ["a.jpg", "b.jpg"]).status).toBe("hit");
    expect(readBatchCache(file, ["b.jpg", "c.jpg"]).status).toBe("stale");
    expect(readBatchCache(file, ["a.jpg"]).status).toBe("stale");
    expect(readBatchCache(file, ["a.jpg".normalize("NFD"), "b.jpg"]).status).toBe("hit");
    expect(readBatchCache(file, ["é.jpg".normalize("NFD"), "b.jpg"]).status).toBe("stale");
  });

  it("treats a bare API payload with no filename list as legacy", () => {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify({ batchcomplete: true, query: { pages: [] } }));
    expect(readBatchCache(file, ["a.jpg"]).status).toBe("legacy");
    expect(readBatchCache(`${file}.nope`, ["a.jpg"]).status).toBe("missing");
  });
});

describe("diffResolution", () => {
  it("matches sidecar keys across NFC and NFD and classifies changes", () => {
    const current = {
      ["Sisley_Hoschedé.jpg".normalize("NFD")]: {
        resolved: true,
        source: { canonical_title: "File:S.jpg" },
      },
      "gone.jpg": { resolved: true },
      "was-unresolved.jpg": { resolved: false },
      "moved.jpg": { resolved: true, source: { canonical_title: "File:Old.jpg" } },
    };
    const next = {
      "Sisley_Hoschedé.jpg": { resolved: false },
      "was-unresolved.jpg": { resolved: true },
      "moved.jpg": { resolved: true, source: { canonical_title: "File:New.jpg" } },
      "new.jpg": { resolved: true },
    };
    const d = diffResolution(current, next);
    expect(d.regressed).toEqual(["Sisley_Hoschedé.jpg"]);
    expect(d.recovered).toEqual(["was-unresolved.jpg"]);
    expect(d.retargeted.map((r) => r.filename)).toEqual(["moved.jpg"]);
    expect(d.added).toEqual(["new.jpg"]);
    expect(d.dropped).toEqual(["gone.jpg"]);
  });
});
