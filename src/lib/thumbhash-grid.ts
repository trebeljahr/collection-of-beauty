// Blur-preview decoder for `Artwork.thumbHash`.
//
// A ThumbHash is ~20 bytes of DCT coefficients describing a whole image.
// The reference decoder (`thumbHashToDataURL`) renders it as a 32 px RGBA
// PNG, which is ~4.3 KB of data URL per tile: across an 80-tile page that
// is more markup than the tiles themselves. A gallery tile is shown blurred
// by the browser's bilinear upscale anyway, so a handful of cells carries
// the same picture. This evaluates the hash's DCT at the centres of a
// small grid instead — 6 cells on the long side — and emits that as an
// uncompressed truecolour PNG, ~240 characters of data URL.
//
// The grid is laid out at the work's TRUE aspect (from the listing's pixel
// size), not at the hash's own aspect, which thumbhash quantises to n/7.
// Each cell is sampled at its own centre across the full image, so the
// grid always spans the whole work however coarse the cells are.
//
// Pure: no DOM, no canvas, no zlib, so the same code runs in a server
// render and in the browser. Output is byte-identical in V8 and
// JavaScriptCore (see the note on `Math.round` below), which is what lets
// a server-rendered tile hydrate without a style mismatch.
//
// `thumbHashToGrid` is forked from `thumbHashToRGBA` in thumbhash by
// Evan Wallace (https://github.com/evanw/thumbhash), used under the MIT
// licence:
//
//   Copyright (c) 2023 Evan Wallace
//
//   Permission is hereby granted, free of charge, to any person obtaining
//   a copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to
//   the following conditions:
//
//   The above copyright notice and this permission notice shall be
//   included in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
//   MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
//   IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
//   CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
//   SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/** Cells on the grid's long side. Measured against 4,557 works: 6 is
 *  where the preview stops reading as "a colour" and starts reading as
 *  "that painting", at ~240 characters of data URL. */
export const BLUR_GRID_LONG_SIDE = 6;
/** Floor for the short side, so a hanging scroll (aspect ~0.2) still gets
 *  three columns of colour rather than one smeared stripe. */
export const BLUR_GRID_MIN_SHORT_SIDE = 3;

export type BlurGridSize = { width: number; height: number };

/** Grid dimensions for a work of this aspect (width / height). A missing
 *  or nonsensical aspect reads as square. */
export function blurGridSize(aspect: number): BlurGridSize {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const n = BLUR_GRID_LONG_SIDE;
  const clamp = (cells: number) => Math.min(n, Math.max(BLUR_GRID_MIN_SHORT_SIDE, cells));
  // `n / a`, not `n * (1 / a)`: a 3:4 or 4:3 work lands exactly on 4.5
  // cells, and only the direct division is guaranteed to get there
  // without a rounding step that could tip it to either side.
  return a >= 1
    ? { width: n, height: clamp(Math.round(n / a)) }
    : { width: clamp(Math.round(n * a)), height: n };
}

/** Header fields the decoder needs, plus how many AC coefficients the
 *  luminance channel carries (which fixes the hash's minimum length). */
function readHeader(hash: Uint8Array) {
  const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
  const header16 = hash[3] | (hash[4] << 8);
  const hasAlpha = header24 >> 23;
  const isLandscape = header16 >> 15;
  const lx = Math.max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
  const ly = Math.max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);
  return { header24, header16, hasAlpha, isLandscape, lx, ly };
}

function acCount(nx: number, ny: number): number {
  let count = 0;
  for (let cy = 0; cy < ny; cy++) for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) count++;
  return count;
}

/** Base64 (standard alphabet, padding optional) → hash bytes. Null for
 *  anything that isn't base64 or is too short to hold the header and the
 *  colour coefficients — a truncated hash would otherwise decode silently
 *  into noise, since reads past the end come back as 0. */
export function decodeThumbHash(value: string | null | undefined): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0) return null;
  let binary: string;
  try {
    // `atob` accepts the unpadded form (forgiving-base64) and is a global
    // in every browser and in Node >= 16.
    binary = atob(value);
  } catch {
    return null;
  }
  if (binary.length < 5) return null;
  const hash = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) hash[i] = binary.charCodeAt(i);
  const { hasAlpha, lx, ly } = readHeader(hash);
  // Alpha coefficients come after L, P and Q and are never read here, so
  // only those three channels have to be present.
  const needed = (hasAlpha ? 6 : 5) + Math.ceil((acCount(lx, ly) + 2 * acCount(3, 3)) / 2);
  return hash.length >= needed ? hash : null;
}

/** The hash's own, n/7-quantised aspect ratio (width / height) — the
 *  fallback when the work's pixel size isn't known. Same arithmetic as
 *  thumbhash's `thumbHashToApproximateAspectRatio`. */
export function thumbHashAspect(hash: Uint8Array): number {
  const header = hash[3];
  const hasAlpha = hash[2] & 0x80;
  const isLandscape = hash[4] & 0x80;
  const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7;
  const ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7;
  const aspect = lx / ly;
  return Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
}

/** RGB bytes (row-major, 3 per cell) for a `width` x `height` grid, each
 *  cell the hash's DCT evaluated at that cell's centre. Alpha is ignored:
 *  build-data flattens every source onto white before hashing, so a
 *  catalogued hash never carries any. */
export function thumbHashToGrid(hash: Uint8Array, width: number, height: number): Uint8Array {
  const { PI, min, max, cos } = Math;
  const { header24, header16, hasAlpha, lx, ly } = readHeader(hash);
  const l_dc = (header24 & 63) / 63;
  const p_dc = ((header24 >> 6) & 63) / 31.5 - 1;
  const q_dc = ((header24 >> 12) & 63) / 31.5 - 1;
  const l_scale = ((header24 >> 18) & 31) / 31;
  const p_scale = ((header16 >> 3) & 63) / 63;
  const q_scale = ((header16 >> 9) & 63) / 63;
  const ac_start = hasAlpha ? 6 : 5;
  let ac_index = 0;
  const decodeChannel = (nx: number, ny: number, scale: number) => {
    const ac: number[] = [];
    for (let cy = 0; cy < ny; cy++)
      for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++) {
        ac.push(
          (((hash[ac_start + (ac_index >> 1)] >> ((ac_index & 1) << 2)) & 15) / 7.5 - 1) * scale,
        );
        ac_index++;
      }
    return ac;
  };
  const l_ac = decodeChannel(lx, ly, l_scale);
  // thumbhash boosts saturation 1.25x to compensate for quantisation.
  const p_ac = decodeChannel(3, 3, p_scale * 1.25);
  const q_ac = decodeChannel(3, 3, q_scale * 1.25);

  const rgb = new Uint8Array(width * height * 3);
  const fx: number[] = [];
  const fy: number[] = [];
  for (let y = 0, i = 0; y < height; y++) {
    for (let cy = 0; cy < max(ly, 3); cy++) fy[cy] = cos((PI / height) * (y + 0.5) * cy);
    for (let x = 0; x < width; x++, i += 3) {
      let l = l_dc;
      let p = p_dc;
      let q = q_dc;
      for (let cx = 0; cx < max(lx, 3); cx++) fx[cx] = cos((PI / width) * (x + 0.5) * cx);
      for (let cy = 0, j = 0; cy < ly; cy++) {
        const fy2 = fy[cy] * 2;
        for (let cx = cy ? 0 : 1; cx * ly < lx * (ly - cy); cx++, j++) l += l_ac[j] * fx[cx] * fy2;
      }
      for (let cy = 0, j = 0; cy < 3; cy++) {
        const fy2 = fy[cy] * 2;
        for (let cx = cy ? 0 : 1; cx < 3 - cy; cx++, j++) {
          const f = fx[cx] * fy2;
          p += p_ac[j] * f;
          q += q_ac[j] * f;
        }
      }
      const b = l - (2 / 3) * p;
      const r = (3 * l - b + q) / 2;
      const g = r - q;
      // Math.round, not the library's truncating Uint8Array store: a
      // last-ulp difference in `cos` between engines can then only flip a
      // byte when the value sits within ~1e-12 of a .5 boundary, instead
      // of whenever it lands near an integer. That is what keeps server
      // and browser output identical.
      rgb[i] = Math.round(max(0, 255 * min(1, r)));
      rgb[i + 1] = Math.round(max(0, 255 * min(1, g)));
      rgb[i + 2] = Math.round(max(0, 255 * min(1, b)));
    }
  }
  return rgb;
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = ~0;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

/** A truecolour (colour type 2, 8-bit) PNG of an RGB grid, its pixels in
 *  one *stored* deflate block. Compression would win nothing on ~100
 *  bytes of noise-free gradient, and skipping it means no zlib — so this
 *  runs unchanged in the browser. Grids are tiny (at most 6 x 6), far
 *  below the 65,535-byte limit of a single stored block. */
export function rgbToPng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const raw = height * (width * 3 + 1);
  // signature + IHDR (12 + 13) + IDAT (12 + 2 zlib + 5 block + raw + 4 adler) + IEND (12)
  const out = new Uint8Array(8 + 25 + 12 + 11 + raw + 12);
  let o = 0;
  const u8 = (v: number) => {
    out[o++] = v & 255;
  };
  const u32 = (v: number) => {
    u8(v >>> 24);
    u8(v >>> 16);
    u8(v >>> 8);
    u8(v);
  };
  const chunk = (type: string, length: number, body: () => void) => {
    u32(length);
    const start = o;
    for (let i = 0; i < 4; i++) u8(type.charCodeAt(i));
    body();
    u32(crc32(out, start, o));
  };
  for (const b of [137, 80, 78, 71, 13, 10, 26, 10]) u8(b);
  chunk("IHDR", 13, () => {
    u32(width);
    u32(height);
    // bit depth 8, colour type 2 (RGB), deflate, no filter set, no interlace
    for (const b of [8, 2, 0, 0, 0]) u8(b);
  });
  chunk("IDAT", 2 + 5 + raw + 4, () => {
    // zlib header (deflate, 32 K window, no preset dictionary; 0x7801 % 31 === 0)
    u8(0x78);
    u8(0x01);
    // final stored block, LEN and its one's complement, little-endian
    u8(1);
    u8(raw);
    u8(raw >>> 8);
    u8(~raw);
    u8(~raw >>> 8);
    let a = 1;
    let b = 0;
    const byte = (v: number) => {
      u8(v);
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    };
    for (let y = 0; y < height; y++) {
      byte(0); // filter type: none
      for (let i = y * width * 3; i < (y + 1) * width * 3; i++) byte(rgb[i]);
    }
    u8(b >>> 8);
    u8(b);
    u8(a >>> 8);
    u8(a);
  });
  chunk("IEND", 0, () => {});
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Memo of finished data URLs, keyed by grid size and hash. A tile
// re-renders on every load-more and the plain -> progressive swap renders
// the same preview a second time, so each work should pay the ~20 µs
// decode once. Module scope so it survives remounts and route changes,
// like image-cache.ts. The key space is one entry per catalogued work in
// practice (its aspect fixes the grid), so the cap is a backstop, evicting
// oldest-first in Map insertion order.
const MAX_CACHED_BLURS = 8192;
const blurCache = new Map<string, string | null>();

/** The blur preview for a work, as a `data:image/png;base64,…` URL, or
 *  null when there is no usable hash. `width` / `height` are the work's
 *  pixel size, used only for its aspect; when either is missing the grid
 *  falls back to the hash's own aspect. Never throws. */
export function thumbHashBlurUrl(
  value: string | null | undefined,
  width?: number | null,
  height?: number | null,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const known = width != null && height != null && width > 0 && height > 0;
  let hash: Uint8Array | null | undefined;
  let size: BlurGridSize;
  if (known) {
    size = blurGridSize(width / height);
  } else {
    hash = decodeThumbHash(value);
    if (!hash) return null;
    size = blurGridSize(thumbHashAspect(hash));
  }
  const key = `${size.width}x${size.height}:${value}`;
  const hit = blurCache.get(key);
  if (hit !== undefined) return hit;

  if (hash === undefined) hash = decodeThumbHash(value);
  const url = hash
    ? `data:image/png;base64,${toBase64(rgbToPng(size.width, size.height, thumbHashToGrid(hash, size.width, size.height)))}`
    : null;
  blurCache.set(key, url);
  if (blurCache.size > MAX_CACHED_BLURS) {
    const oldest = blurCache.keys().next().value;
    if (oldest !== undefined) blurCache.delete(oldest);
  }
  return url;
}
