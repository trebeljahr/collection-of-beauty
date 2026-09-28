import { ResponsiveImage } from "@/components/responsive-image";
import type { Artwork } from "@/lib/data";
import type { EditionWall } from "@/lib/newsletter/wall";
import { FRAME_GAP, FRAME_WIDTH } from "@/lib/newsletter/wall-layout";
import { wallFrameBoxes, wallSvg } from "@/lib/newsletter/wall-svg";

/** Widest the wall is drawn: the edition page's max-w-3xl column minus its gutter. */
const MAX_WIDTH = 736;

/** Each link reaches halfway into the gap on every side, so neighbouring
 *  targets meet with no dead strip between them. On a phone the narrowest
 *  picture is ~38 px wide; this takes its target to ~53. */
const HIT_PAD = FRAME_GAP / 2;

/**
 * The email header's gallery wall, on the edition page. The wall and its
 * frames are the SVG the email's JPEG is painted from; the works go on
 * top as <picture> elements, so the page gets the variant ladder and the
 * ThumbHash blur rather than one JPEG baked for a 640 px email.
 *
 * Unlike the email's picture, every work is a link to `#<artwork.id>`,
 * the id of its figure further down the edition page.
 *
 * `artworks` is in issue order, like `wall.works`.
 */
export function NewsletterWall({
  wall,
  artworks,
}: {
  wall: EditionWall;
  artworks: readonly Artwork[];
}) {
  const { width, height } = wall.layout;
  const percent = (v: number, of: number) => `${(v / of) * 100}%`;
  const inset = HIT_PAD + FRAME_WIDTH;

  return (
    <nav aria-label="The works in this issue" className="relative">
      <div
        aria-hidden="true"
        className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        // Built from layout numbers and palette hexes only, no edition text.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shared with the email JPEG, which sharp rasterises from the same string.
        dangerouslySetInnerHTML={{ __html: wallSvg(wall.layout, wall.palette, 1) }}
      />
      {wallFrameBoxes(wall.layout, 1).map((frame) => {
        const artwork = artworks[frame.index];
        const work = wall.works[frame.index];
        const hit = {
          x: frame.x - HIT_PAD,
          y: frame.y - HIT_PAD,
          w: frame.w + 2 * HIT_PAD,
          h: frame.h + 2 * HIT_PAD,
        };
        const pictureWidth = frame.w - 2 * FRAME_WIDTH;
        const pictureHeight = frame.h - 2 * FRAME_WIDTH;
        const share = pictureWidth / width;
        return (
          <a
            key={artwork.id}
            href={`#${artwork.id}`}
            aria-label={work.artist ? `${work.title} by ${work.artist}` : work.title}
            className="group absolute focus-visible:outline-none"
            style={{
              left: percent(hit.x, width),
              top: percent(hit.y, height),
              width: percent(hit.w, width),
              height: percent(hit.h, height),
            }}
          >
            {/* The ring goes round the frame, not the padded hit box, and
                in the title's colour: the site's --ring is lost on a dark
                wall. The offset clears the moulding. */}
            <span
              className="absolute transition-[filter] duration-200 group-hover:brightness-110 group-focus-visible:outline-2 group-focus-visible:outline-offset-4"
              style={{
                left: percent(inset, hit.w),
                top: percent(inset, hit.h),
                width: percent(pictureWidth, hit.w),
                height: percent(pictureHeight, hit.h),
                outlineColor: wall.palette.title,
              }}
            >
              <ResponsiveImage
                fill
                objectKey={artwork.objectKey}
                alt=""
                // Full bleed below 768 px, the capped column above it.
                sizes={`(max-width: 767px) ${Math.ceil(share * 100)}vw, ${Math.ceil(share * MAX_WIDTH)}px`}
                variantWidths={artwork.variantWidths}
                loading="eager"
                dominantColor={artwork.dominantColor}
                thumbHash={artwork.thumbHash}
                workWidth={artwork.width}
                workHeight={artwork.height}
              />
            </span>
          </a>
        );
      })}
    </nav>
  );
}
