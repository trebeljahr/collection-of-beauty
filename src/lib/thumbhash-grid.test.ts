import { crc32, inflateSync } from "node:zlib";
import sharp from "sharp";
import { rgbaToThumbHash, thumbHashToApproximateAspectRatio, thumbHashToRGBA } from "thumbhash";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BLUR_GRID_LONG_SIDE,
  BLUR_GRID_MIN_SHORT_SIDE,
  blurGridSize,
  decodeThumbHash,
  rgbToPng,
  thumbHashAspect,
  thumbHashBlurUrl,
  thumbHashToGrid,
} from "./thumbhash-grid";

// Real catalogue hashes (build-data's encoding: unpadded base64), picked
// for their spread of aspects — the two extremes of the corpus, a very
// wide panel, a square, and two ordinary paintings.
const FIXTURES = [
  { name: "leucoium (0.167)", b64: "PAgGAQCfT0antVzDZbB6B7s", width: 488, height: 2920 },
  { name: "Yangtze scroll (47.9)", b64: "pEkKCYK/uoh3h3iHB3encHc", width: 22517, height: 470 },
  { name: "Holbein Dead Christ (6.68)", b64: "khgKCYIoZniQd2inRoeAVAg", width: 2560, height: 383 },
  {
    name: "Monet Poplars (1.0)",
    b64: "oQgGDwCvg3l8eIeWaEdYWWdp1qoG/WsK",
    width: 4001,
    height: 4001,
  },
  { name: "Wanderer (0.78)", b64: "ovcVDQCXeI92Z3iHh3Z3iFhwdwOX", width: 1280, height: 1639 },
  {
    name: "Starry Night (1.25)",
    b64: "F8cFDoJ1qHpvaIdweWd3eHh19SKLbPY",
    width: 1879,
    height: 1500,
  },
];

/** Synthetic images, so the header variants a catalogue hash never uses
 *  (alpha, tiny sources) are covered too. */
function syntheticHash(w: number, h: number, alpha: boolean): Uint8Array {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = Math.round((255 * x) / Math.max(1, w - 1));
      rgba[i + 1] = Math.round((255 * y) / Math.max(1, h - 1));
      rgba[i + 2] = (x * 7 + y * 13) % 256;
      rgba[i + 3] = alpha ? Math.round((255 * (x + y)) / Math.max(1, w + h - 2)) : 255;
    }
  return rgbaToThumbHash(w, h, rgba);
}

const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64").replace(/=+$/, "");

function dataUrlBytes(url: string): Buffer {
  const prefix = "data:image/png;base64,";
  expect(url.startsWith(prefix)).toBe(true);
  return Buffer.from(url.slice(prefix.length), "base64");
}

type Chunk = { type: string; data: Buffer };

/** Walk a PNG's chunks, checking every CRC on the way. */
function readPng(png: Buffer): Chunk[] {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks: Chunk[] = [];
  let o = 8;
  while (o < png.length) {
    const length = png.readUInt32BE(o);
    const type = png.toString("latin1", o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + length);
    expect(png.readUInt32BE(o + 8 + length)).toBe(crc32(png.subarray(o + 4, o + 8 + length)));
    chunks.push({ type, data });
    o += 12 + length;
  }
  expect(o).toBe(png.length);
  return chunks;
}

describe("blurGridSize", () => {
  it("puts 6 cells on the long side at the work's own aspect", () => {
    expect(blurGridSize(1)).toEqual({ width: 6, height: 6 });
    expect(blurGridSize(1.5)).toEqual({ width: 6, height: 4 });
    expect(blurGridSize(2 / 3)).toEqual({ width: 4, height: 6 });
    expect(blurGridSize(1879 / 1500)).toEqual({ width: 6, height: 5 });
    expect(blurGridSize(1280 / 1639)).toEqual({ width: 5, height: 6 });
  });

  it("rounds a 4:3 or 3:4 work's 4.5 short-side cells up, whichever way the aspect was computed", () => {
    // Ten catalogued works sit exactly on this boundary. A last-digit
    // wobble in the aspect must not tip them to a different grid than
    // the one the server rendered.
    for (const aspect of [4 / 3, 2000 / 1500, 1600 / 1200]) {
      expect(blurGridSize(aspect)).toEqual({ width: 6, height: 5 });
    }
    for (const aspect of [3 / 4, 1500 / 2000, 1200 / 1600]) {
      expect(blurGridSize(aspect)).toEqual({ width: 5, height: 6 });
    }
  });

  it("floors the short side at 3 for extreme aspects", () => {
    expect(blurGridSize(2)).toEqual({ width: 6, height: 3 });
    expect(blurGridSize(6.68)).toEqual({ width: 6, height: 3 });
    expect(blurGridSize(47.9)).toEqual({ width: 6, height: 3 });
    expect(blurGridSize(0.5)).toEqual({ width: 3, height: 6 });
    expect(blurGridSize(0.167)).toEqual({ width: 3, height: 6 });
  });

  it("never leaves the 3..6 band, and reads nonsense as square", () => {
    for (const aspect of [1e-9, 0.1, 0.3, 0.9, 1.1, 3, 10, 1e9]) {
      const { width, height } = blurGridSize(aspect);
      expect(Math.max(width, height)).toBe(BLUR_GRID_LONG_SIDE);
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(BLUR_GRID_MIN_SHORT_SIDE);
    }
    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(blurGridSize(aspect)).toEqual({ width: 6, height: 6 });
    }
  });
});

describe("thumbHashToGrid", () => {
  const cases = [
    ...FIXTURES.map((f) => ({ name: f.name, hash: decodeThumbHash(f.b64) as Uint8Array })),
    { name: "synthetic landscape", hash: syntheticHash(100, 40, false) },
    { name: "synthetic portrait", hash: syntheticHash(30, 100, false) },
    { name: "synthetic tiny", hash: syntheticHash(3, 2, false) },
    { name: "synthetic with alpha", hash: syntheticHash(80, 60, true) },
  ];

  it.each(cases)("agrees with thumbhash's own decoder at its sample points ($name)", ({ hash }) => {
    expect(hash).not.toBeNull();
    // At the library's own output size the grid's cell centres are the
    // library's pixel centres, so the two must agree up to rounding
    // (the library truncates, the fork rounds).
    const lib = thumbHashToRGBA(hash);
    const grid = thumbHashToGrid(hash, lib.w, lib.h);
    expect(grid).toHaveLength(lib.w * lib.h * 3);
    let worst = 0;
    for (let i = 0, j = 0; i < lib.rgba.length; i += 4, j += 3)
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(lib.rgba[i + c] - grid[j + c]));
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe("decodeThumbHash / thumbHashAspect", () => {
  it("reads unpadded and padded base64 alike", () => {
    for (const { b64 } of FIXTURES) {
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      expect(decodeThumbHash(b64)).toEqual(decodeThumbHash(padded));
      expect(decodeThumbHash(b64)).toEqual(new Uint8Array(Buffer.from(padded, "base64")));
    }
  });

  it("matches thumbhash's approximate aspect ratio", () => {
    for (const { b64 } of FIXTURES) {
      const hash = decodeThumbHash(b64) as Uint8Array;
      expect(thumbHashAspect(hash)).toBe(thumbHashToApproximateAspectRatio(hash));
    }
  });

  it("returns null for anything that isn't a whole hash", () => {
    const real = FIXTURES[4].b64;
    for (const bad of [
      null,
      undefined,
      "",
      "=",
      "!!!!",
      "AAAA",
      "not base64 at all",
      real.slice(0, 9),
      real.slice(0, 12),
    ]) {
      expect(() => decodeThumbHash(bad)).not.toThrow();
      expect(decodeThumbHash(bad)).toBeNull();
    }
  });
});

describe("rgbToPng", () => {
  it("writes a valid truecolour PNG that decodes to the grid", async () => {
    const width = 5;
    const height = 6;
    const rgb = new Uint8Array(width * height * 3).map((_, i) => (i * 37) % 256);
    const png = Buffer.from(rgbToPng(width, height, rgb));
    const chunks = readPng(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const ihdr = chunks[0].data;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([width, height]);
    expect([...ihdr.subarray(8)]).toEqual([8, 2, 0, 0, 0]);

    // zlib itself accepts the stored stream (and its Adler-32), and each
    // scanline is filter byte 0 followed by the row.
    const raw = inflateSync(chunks[1].data);
    const rows = [];
    for (let y = 0; y < height; y++) {
      const line = raw.subarray(y * (width * 3 + 1), (y + 1) * (width * 3 + 1));
      expect(line[0]).toBe(0);
      rows.push(...line.subarray(1));
    }
    expect(rows).toEqual([...rgb]);

    const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width, height, channels: 3 });
    expect([...decoded.data]).toEqual([...rgb]);
  });
});

describe("thumbHashBlurUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(FIXTURES)("encodes the grid at the work's true aspect ($name)", async (fixture) => {
    const url = thumbHashBlurUrl(fixture.b64, fixture.width, fixture.height) as string;
    const size = blurGridSize(fixture.width / fixture.height);
    const png = dataUrlBytes(url);
    const ihdr = readPng(png)[0].data;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([size.width, size.height]);
    // The pixels are the DCT evaluated on that grid, nothing lost on the way.
    const decoded = await sharp(png).raw().toBuffer();
    const hash = decodeThumbHash(fixture.b64) as Uint8Array;
    expect([...decoded]).toEqual([...thumbHashToGrid(hash, size.width, size.height)]);
    // The budget the tile markup was sized against.
    expect(url.length).toBeLessThan(300);
  });

  it("falls back to the hash's own aspect when the size is unknown", () => {
    const { b64 } = FIXTURES[2];
    const hash = decodeThumbHash(b64) as Uint8Array;
    const size = blurGridSize(thumbHashAspect(hash));
    for (const [w, h] of [
      [null, null],
      [undefined, undefined],
      [2560, null],
      [0, 383],
      [-5, 10],
    ] as const) {
      const ihdr = readPng(dataUrlBytes(thumbHashBlurUrl(b64, w, h) as string))[0].data;
      expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([size.width, size.height]);
    }
  });

  it("is deterministic and decodes each (hash, grid) once", () => {
    const btoa = vi.spyOn(globalThis, "btoa");
    // A synthetic hash no other test has warmed the memo with.
    const b64 = toB64(syntheticHash(64, 48, false));
    const first = thumbHashBlurUrl(b64, 1600, 1200);
    expect(btoa).toHaveBeenCalledTimes(1);
    expect(thumbHashBlurUrl(b64, 1600, 1200)).toBe(first);
    // Same aspect, different pixel size: same grid, still a cache hit.
    expect(thumbHashBlurUrl(b64, 800, 600)).toBe(first);
    expect(btoa).toHaveBeenCalledTimes(1);
    // A different grid is a different entry.
    const square = thumbHashBlurUrl(b64, 100, 100);
    expect(square).not.toBe(first);
    expect(btoa).toHaveBeenCalledTimes(2);
  });

  it("returns null, without throwing, for a missing or unusable hash", () => {
    for (const bad of [null, undefined, "", "!!!!", "AAAA", "ovcVDQCXe"]) {
      expect(() => thumbHashBlurUrl(bad, 1280, 1639)).not.toThrow();
      expect(thumbHashBlurUrl(bad, 1280, 1639)).toBeNull();
      expect(thumbHashBlurUrl(bad)).toBeNull();
    }
  });
});
