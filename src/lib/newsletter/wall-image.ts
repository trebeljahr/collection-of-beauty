import sharp from "sharp";
import type { EditionWall } from "./wall";
import { wallPictureBoxes, wallSvg } from "./wall-svg";

/** Rendered at 2x the email width so the wall stays sharp on retina screens. */
const SCALE = 2;
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Paint the wall as a JPEG: the wall SVG (spotlight gradient, soft
 * shadows and frames), then each work scaled into its frame.
 *
 * JPEG rather than WebP because desktop Outlook on Windows cannot show
 * WebP at all. 4:4:4 chroma keeps the flat bottom rows exactly the
 * palette's base colour, which the HTML cell under the image repeats.
 */
export async function renderWallJpeg(wall: EditionWall): Promise<Buffer> {
  const pictures = await Promise.all(
    wallPictureBoxes(wall.layout, SCALE).map(async (box) => {
      const source = await fetchImage(wall.works[box.index].sourceUrl);
      const input = await sharp(source).resize(box.w, box.h, { fit: "cover" }).toBuffer();
      return { input, left: box.x, top: box.y };
    }),
  );

  return sharp(Buffer.from(wallSvg(wall.layout, wall.palette, SCALE)))
    .composite(pictures)
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
}

/** Tries per image. A build fetches every edition's works at once (about
 *  240 images); one slow answer from the CDN failed a deploy on 2026-11-11. */
const FETCH_ATTEMPTS = 3;

/** Fetch one source image, retrying a timeout, a network error or a 5xx.
 *  Any other answer (a missing image) fails at once. */
export async function fetchImage(
  url: string,
  { request = fetch, wait = (ms: number) => new Promise((done) => setTimeout(done, ms)) } = {},
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await request(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) await wait(1_000 * attempt);
      continue;
    }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastError = new Error(`wall: ${res.status} fetching ${url}`);
    if (res.status < 500) break;
    if (attempt < FETCH_ATTEMPTS) await wait(1_000 * attempt);
  }
  throw lastError;
}
