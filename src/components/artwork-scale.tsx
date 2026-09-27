// Scale view on /artwork/[id]: the work drawn at its physical size next to
// a reference object, a 175 cm figure for paintings and an A4 sheet or a
// hand for plates and prints.
//
// Server component, no client JS. The scene is laid out once in cm and
// every box is placed as a percentage of it, so the drawing scales with
// the column and needs no resize handling. It sits inside a closed
// <details>, and browsers do not fetch a lazy image that is not rendered,
// so a visitor who never opens it downloads nothing.
//
// Callers must gate on `trustworthyRealSize()`. This component draws
// whatever it is given; it has no way to tell a good size from a bad one.

import type { CSSProperties } from "react";
import { formatCm, type RealSize, type ScaleReference } from "@/lib/real-size";
import {
  type Box,
  HANG_CENTRE_CM,
  layoutScene,
  type Scene,
  sceneMaxWidthRem,
  workSizes,
} from "@/lib/real-size-scene";
import { fallbackVariantUrl, variantSrcSet } from "@/lib/utils";

type Props = {
  objectKey: string;
  variantWidths: readonly number[] | null;
  size: RealSize;
  reference: ScaleReference;
};

/** The work box is at most ~500 css px wide (Veronese's 994 cm Wedding at
 *  Cana at 590–767 px viewports is 493), so the srcset stops at the 960
 *  rung: 2x for a box up to 480 px. */
const MAX_RUNG = 960;

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

function place(box: Box, scene: Scene): CSSProperties {
  return {
    left: pct(box.x / scene.width),
    bottom: pct(box.y / scene.height),
    width: pct(box.w / scene.width),
    height: pct(box.h / scene.height),
  };
}

export function ArtworkScale(props: Props) {
  return (
    <details className="group/scale border-t border-[var(--border)] pt-5">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0 [&::-webkit-details-marker]:hidden">
        {/* <summary> allows heading content, so the aside keeps one <h2>
            per section, as ArtworkDownloads does below it. */}
        <h2 className="font-serif text-lg">
          Size{" "}
          <span className="font-sans text-base tabular-nums text-[var(--muted-foreground)]">
            {formatCm(props.size)}
          </span>
        </h2>
        <span className="text-sm underline underline-offset-4">
          <span className="group-open/scale:hidden">Show to scale</span>
          <span className="hidden group-open/scale:inline">Hide</span>
        </span>
      </summary>
      <ScaleFigure {...props} />
    </details>
  );
}

function ScaleFigure({ objectKey, variantWidths, size, reference }: Props) {
  const scene = layoutScene(size, reference);
  // The work is the subject: after the figure's label, a subjectless
  // sentence reads as describing the figure.
  const note = scene.standsOnFloor
    ? `The work is over ${(2 * HANG_CENTRE_CM) / 100} m tall, so it stands on the floor.`
    : reference.kind === "person"
      ? `The work hangs with its centre ${HANG_CENTRE_CM} cm above the floor.`
      : null;
  const caption = `${reference.label.replace(/\.$/, "")}.${note ? ` ${note}` : ""}`;

  const sceneStyle: CSSProperties = {
    aspectRatio: `${scene.width.toFixed(2)} / ${scene.height.toFixed(2)}`,
    width: `min(100%, ${sceneMaxWidthRem(scene).toFixed(3)}rem)`,
  };

  return (
    <figure
      className="mt-3 space-y-2"
      aria-label={`Scale drawing of the work, ${formatCm(size)}. ${reference.label.replace(/\.$/, "")}.`}
    >
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]">
        {/* The border is the floor line. It sits on the full-width row, not
            on the scene, so it runs past both objects when the scene is
            capped and narrower than the frame. */}
        <div className="flex justify-center border-b border-[var(--muted-foreground)]/50 px-3 pt-3">
          <div className="relative" style={sceneStyle}>
            <div
              className="absolute overflow-hidden bg-[var(--border)] shadow-sm ring-1 ring-[var(--foreground)]/15"
              style={place(scene.work, scene)}
            >
              <WorkImage
                objectKey={objectKey}
                variantWidths={variantWidths}
                sizes={workSizes(scene, scene.work)}
              />
            </div>
            <ReferenceDrawing reference={reference} style={place(scene.ref, scene)} />
          </div>
        </div>
        <div className="h-3" />
      </div>
      <figcaption className="text-xs leading-relaxed text-[var(--muted-foreground)]">
        {caption}
      </figcaption>
    </figure>
  );
}

/** Same <picture> shape as ResponsiveImage, cut down to the small rungs.
 *  The <img> fallback stays the 1280 WebP from the full manifest: it is
 *  the only WebP the encoder writes, so it is the one file a browser that
 *  skips the AVIF <source> can decode.
 *
 *  Empty alt: the figure's aria-label already says what the drawing is,
 *  and the hero image above carries the work's alt text. Repeating it
 *  here would read the title, artist and year a second time. */
function WorkImage({
  objectKey,
  variantWidths,
  sizes,
}: {
  objectKey: string;
  variantWidths: readonly number[] | null;
  sizes: string;
}) {
  const small = (variantWidths ?? []).filter((w) => w <= MAX_RUNG);
  const img = (
    // biome-ignore lint/performance/noImgElement: variants are pre-built static files; next/image does not fit the pipeline (see ResponsiveImage).
    <img
      src={fallbackVariantUrl(objectKey, variantWidths)}
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
  if (small.length === 0) return img;
  return (
    <picture>
      <source type="image/avif" srcSet={variantSrcSet(objectKey, "avif", small)} sizes={sizes} />
      {img}
    </picture>
  );
}

// Reference drawings, in cm. Each is scaled to the reference's height and
// centred in its width, so the stated height ("175 cm tall") is exact even
// if the box's width differs a little from the drawing's; overflow is
// visible so a slightly wider drawing spills into the gap, not off-canvas.

/** Pictogram figure: round head, block torso, arms and legs as round-capped
 *  bars. No face, hair, clothing or build cues. Head top at 0, soles at
 *  175; shoulders at 150 cm above the floor, fingertips at 70. */
const PERSON = { w: 50, h: 175 };
function PersonShape() {
  return (
    <>
      <circle cx="25" cy="10.5" r="10.5" fill="currentColor" />
      <rect x="12.5" y="25" width="25" height="62" rx="6" fill="currentColor" />
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <line x1="7" y1="29" x2="7" y2="101.5" strokeWidth="7" />
        <line x1="43" y1="29" x2="43" y2="101.5" strokeWidth="7" />
        <line x1="19" y1="84" x2="19" y2="169.5" strokeWidth="11" />
        <line x1="31" y1="84" x2="31" y2="169.5" strokeWidth="11" />
      </g>
    </>
  );
}

/** Open hand, palm out, fingers up, thumb spread. Units are mm: 19 cm from
 *  the heel of the palm to the tip of the middle finger. */
const HAND = { w: 116, h: 190 };
function HandShape() {
  return (
    <>
      <rect x="36" y="78" width="71" height="112" rx="18" fill="currentColor" />
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <line x1="44" y1="100" x2="44" y2="26" strokeWidth="16" />
        <line x1="63" y1="100" x2="63" y2="8" strokeWidth="16" />
        <line x1="82" y1="100" x2="82" y2="20" strokeWidth="16" />
        <line x1="100" y1="100" x2="100" y2="49" strokeWidth="14" />
        <line x1="48" y1="150" x2="18" y2="104" strokeWidth="21" />
      </g>
    </>
  );
}

function ReferenceDrawing({
  reference,
  style,
}: {
  reference: ScaleReference;
  style: CSSProperties;
}) {
  const { widthCm: w, heightCm: h } = reference;
  const svgProps = {
    viewBox: `0 0 ${w} ${h}`,
    overflow: "visible",
    focusable: "false",
    className: "absolute text-[var(--muted-foreground)]",
    style,
  } as const;

  if (reference.kind === "a4") {
    // Sheet outline with a folded top corner, so it reads as paper rather
    // than as a second, blank work.
    const fold = Math.min(w, h) * 0.12;
    return (
      <svg aria-hidden="true" {...svgProps}>
        <path
          d={`M0 0H${w - fold}L${w} ${fold}V${h}H0Z`}
          className="fill-[var(--card)]"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`M${w - fold} 0V${fold}H${w}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const shape = reference.kind === "person" ? PERSON : HAND;
  const scale = h / shape.h;
  const dx = (w - shape.w * scale) / 2;
  return (
    <svg aria-hidden="true" {...svgProps}>
      <g transform={`translate(${dx.toFixed(3)} 0) scale(${scale.toFixed(5)})`}>
        {reference.kind === "person" ? <PersonShape /> : <HandShape />}
      </g>
    </svg>
  );
}
