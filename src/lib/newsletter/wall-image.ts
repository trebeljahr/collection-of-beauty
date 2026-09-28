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

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`wall: ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
