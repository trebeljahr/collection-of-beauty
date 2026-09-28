import { ResponsiveImage } from "@/components/responsive-image";
import type { Artwork } from "@/lib/data";
import type { EditionWall } from "@/lib/newsletter/wall";
import { wallPictureBoxes, wallSvg } from "@/lib/newsletter/wall-svg";

/** Widest the wall is drawn: the edition page's max-w-3xl column minus its gutter. */
const MAX_WIDTH = 736;

/**
 * The email header's gallery wall, on the edition page. The wall and its
 * frames are the SVG the email's JPEG is painted from; the works go on
 * top as <picture> elements, so the page gets the variant ladder and the
 * ThumbHash blur rather than one JPEG baked for a 640 px email.
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

  return (
    <div role="img" aria-label={wall.alt} className="relative">
      <div
        className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        // Built from layout numbers and palette hexes only, no edition text.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shared with the email JPEG, which sharp rasterises from the same string.
        dangerouslySetInnerHTML={{ __html: wallSvg(wall.layout, wall.palette, 1) }}
      />
      {wallPictureBoxes(wall.layout, 1).map((box) => {
        const artwork = artworks[box.index];
        const share = box.w / width;
        return (
          <div
            key={artwork.id}
            className="absolute"
            style={{
              left: percent(box.x, width),
              top: percent(box.y, height),
              width: percent(box.w, width),
              height: percent(box.h, height),
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
          </div>
        );
      })}
    </div>
  );
}
