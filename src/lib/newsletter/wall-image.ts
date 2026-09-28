import sharp from "sharp";
import type { EditionWall } from "./wall";
import { FRAME_WIDTH } from "./wall-layout";

/** Rendered at 2x the email width so the wall stays sharp on retina screens. */
const SCALE = 2;
const FRAME_COLOUR = "#17140f";
const FETCH_TIMEOUT_MS = 20_000;

/**
 * Paint the wall as a JPEG: spotlight gradient, soft shadows and frames
 * drawn as one SVG, then each work scaled into its frame.
 *
 * JPEG rather than WebP because desktop Outlook on Windows cannot show
 * WebP at all. 4:4:4 chroma keeps the flat bottom rows exactly the
 * palette's base colour, which the HTML cell under the image repeats.
 */
export async function renderWallJpeg(wall: EditionWall): Promise<Buffer> {
  const { layout, palette } = wall;
  const width = layout.width * SCALE;
  const height = layout.height * SCALE;
  const px = (v: number) => Math.round(v * SCALE);

  // The gradient must reach the base colour before the bottom edge:
  // centred at 10% of the height, radius 85% of the height (1.6x wider).
  const cy = height * 0.1;
  const r = height * 0.85;
  const frames = layout.frames.map((f) => ({
    ...f,
    x: px(f.x),
    y: px(f.y),
    w: px(f.x + f.width) - px(f.x),
    h: px(f.y + f.height) - px(f.y),
  }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="wall" gradientUnits="userSpaceOnUse" cx="${width / 2}" cy="${cy}" r="${r}"
      gradientTransform="translate(${width / 2} ${cy}) scale(1.6 1) translate(${-width / 2} ${-cy})">
      <stop offset="0" stop-color="${palette.spot}"/>
      <stop offset="1" stop-color="${palette.base}"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${9 * SCALE}"/></filter>
    <filter id="tight" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${1 * SCALE}"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#wall)"/>
  ${frames.map(frameSvg).join("\n")}
</svg>`;

  const border = px(FRAME_WIDTH);
  const pictures = await Promise.all(
    frames.map(async (f) => {
      const source = await fetchImage(wall.works[f.index].sourceUrl);
      const input = await sharp(source)
        .resize(f.w - 2 * border, f.h - 2 * border, { fit: "cover" })
        .toBuffer();
      return { input, left: f.x + border, top: f.y + border };
    }),
  );

  return sharp(Buffer.from(svg))
    .composite(pictures)
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4", progressive: true, mozjpeg: true })
    .toBuffer();
}

/** A frame in device pixels: a soft drop shadow, a tight contact shadow,
 *  then the frame itself. The picture is composited inside it later. */
function frameSvg(f: { x: number; y: number; w: number; h: number }): string {
  const box = `x="${f.x}" width="${f.w}" height="${f.h}"`;
  return [
    `<rect ${box} y="${f.y + 8 * SCALE}" fill="#000" fill-opacity="0.45" filter="url(#soft)"/>`,
    `<rect ${box} y="${f.y + 1 * SCALE}" fill="#000" fill-opacity="0.4" filter="url(#tight)"/>`,
    `<rect ${box} y="${f.y}" fill="${FRAME_COLOUR}"/>`,
  ].join("\n");
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`wall: ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
