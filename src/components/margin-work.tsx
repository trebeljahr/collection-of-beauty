import Link from "next/link";
import { ResponsiveImage } from "@/components/responsive-image";
import { displayTitle } from "@/lib/artwork-format";
import type { ArtworkListing } from "@/lib/data";
import { cn } from "@/lib/utils";

type Props = {
  work: ArtworkListing;
  /** The margin it hangs in from `xl` up. */
  side: "left" | "right";
  /** The side it floats to in the text below `xl`, when that should
   *  differ from `side` so consecutive floats don't all line up on one
   *  edge of a phone screen. Defaults to `side`. */
  float?: "left" | "right";
  /** Leave it out of the text below `xl` and hang it only in the margin.
   *  For a second work beside one short section, where two floats would
   *  squeeze a phone's column to a few words per line. */
  marginOnly?: boolean;
  /** Width at every breakpoint, the `xl:top-*` offset from the top of the
   *  section and, optionally, `xl:[--margin-gap:<length>]` for the gap to
   *  the text (4rem by default). Literal classes from the caller, so
   *  Tailwind sees them; nothing here sets a width, a top or the gap, so
   *  there is no class of the same property for them to beat. */
  className?: string;
};

/**
 * A work hung beside the text of a prose page, linking to its own page.
 *
 * From `xl` up the text column leaves a wide empty margin on each side,
 * and the work sits there out of the flow: absolutely positioned against
 * the nearest `relative` ancestor (the section it illustrates), so the
 * text keeps its measure. Below `xl` there is no margin to hang it in, so
 * it floats into the text instead and the paragraph wraps around it. The
 * ancestor should be `flow-root` so a float taller than its section
 * doesn't run into the next one.
 *
 * The caller places each work by hand: two works on the same side of
 * neighbouring sections can overlap, since neither takes up space.
 */
export function MarginWork({ work, side, float = side, marginOnly, className }: Props) {
  return (
    <div
      className={cn(
        "mt-1 mb-3",
        float === "right" ? "float-right ml-4 sm:ml-6" : "float-left mr-4 sm:mr-6",
        marginOnly && "hidden xl:block",
        "xl:absolute xl:float-none xl:m-0",
        side === "right"
          ? "xl:left-[calc(100%+var(--margin-gap,4rem))]"
          : "xl:right-[calc(100%+var(--margin-gap,4rem))]",
        className,
      )}
    >
      {/* One link for picture and caption. The caption names the work, so
          the image is alt="" rather than a second reading of the same
          title, artist and year. */}
      <Link
        href={`/artwork/${work.id}`}
        className="group block rounded-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--background)]"
      >
        <ResponsiveImage
          objectKey={work.objectKey}
          alt=""
          sizes="(min-width: 640px) 240px, 160px"
          variantWidths={work.variantWidths}
          srcWidth={work.width ?? undefined}
          srcHeight={work.height ?? undefined}
          dominantColor={work.dominantColor}
          thumbHash={work.thumbHash}
          className="h-auto w-full shadow-[0_1px_2px_oklch(0.2_0.02_50/0.14),0_14px_24px_-14px_oklch(0.2_0.02_50/0.5)]"
        />
        <span className="mt-2 block text-xs leading-snug text-[var(--muted-foreground)]">
          <span className="line-clamp-2 text-[var(--foreground)] transition-opacity group-hover:opacity-70">
            {displayTitle(work)}
          </span>
          {(work.artist || work.year != null) && (
            <span className="mt-0.5 block">
              {[work.artist, work.year].filter((part) => part != null).join(", ")}
            </span>
          )}
        </span>
      </Link>
    </div>
  );
}
