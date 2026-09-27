import Link from "next/link";
import type { CSSProperties } from "react";
import { ResponsiveImage } from "@/components/responsive-image";
import { displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";

type FanWork = Pick<
  ArtworkListing,
  | "id"
  | "title"
  | "englishTitle"
  | "artist"
  | "year"
  | "objectKey"
  | "variantWidths"
  | "width"
  | "height"
  | "dominantColor"
>;

// Card shape limits, width over height. Narrow on purpose: with the full
// range a 1.57 panorama covered half the hand and the fan read as a pile.
// Inside it a card keeps its work's proportions; beyond it the image
// crops to the centre, which still keeps Friedrich's monk (at ~30% of
// the width) and Fan Kuan's travellers in frame.
const ASPECT_MIN = 0.7;
const ASPECT_MAX = 1.1;

function cardAspect(work: FanWork): number {
  if (!work.width || !work.height) return 3 / 4;
  return Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, work.width / work.height));
}

function label(work: FanWork): string {
  const parts = [displayTitle(work)];
  if (work.artist) parts.push(`by ${work.artist}`);
  if (work.year) parts.push(`(${work.year})`);
  return parts.join(" ");
}

/**
 * The works of one edition fanned out like a hand of prints, each linking
 * to its artwork page. Pure CSS (see `.edition-fan` in globals.css): the
 * angle and stacking come from each card's offset from the middle, so any
 * number of works spreads symmetrically.
 */
export function EditionFan({ works }: { works: FanWork[] }) {
  if (works.length === 0) return null;
  const middle = (works.length - 1) / 2;

  return (
    <ul className="edition-fan" aria-label="Works in this issue">
      {works.map((work, i) => (
        <li
          key={work.id}
          className="edition-fan-slot"
          style={
            {
              "--fan-i": i,
              "--fan-offset": i - middle,
              // Middle card in front, the rest stacked symmetrically
              // behind it, so neither end of the hand dominates.
              "--fan-z": Math.round(works.length - Math.abs(i - middle) * 2),
              "--fan-aspect": cardAspect(work),
            } as CSSProperties
          }
        >
          <Link href={`/artwork/${work.id}`} className="edition-fan-card" aria-label={label(work)}>
            <span className="relative block h-full w-full overflow-hidden">
              <ResponsiveImage
                objectKey={work.objectKey}
                alt=""
                sizes="(min-width: 768px) 280px, 180px"
                variantWidths={work.variantWidths}
                dominantColor={work.dominantColor}
                fill
              />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
