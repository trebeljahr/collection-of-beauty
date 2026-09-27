import type { ArtworkListing } from "@/lib/data";
import {
  chooseSlideWidth,
  PAN_MAX_SCALE,
  type PanPlan,
  panPlan,
  type SlideViewport,
} from "@/lib/slideshow";
import { fallbackVariantUrl, variantUrl } from "@/lib/utils";

export type PreparedSlide = {
  index: number;
  art: ArtworkListing;
  src: string;
  plan: PanPlan;
  /** Held so the decoded bitmap is not collected before the slide is
   *  shown. The visible <img> reuses the same URL and so the same cache
   *  entry. */
  image: HTMLImageElement;
};

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

/** Fetch and decode one URL off-screen. No `crossOrigin` and no
 *  `srcset`: the visible <img src> must hit this exact cache entry, and
 *  either attribute would key a different one.
 *
 *  An abort drops the `src`, which cancels the download in every current
 *  engine: rapid Next presses would otherwise queue up full-size fetches
 *  for works that will never be shown. */
async function decode(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  if (signal.aborted) throw abortError();
  const img = new Image();
  img.decoding = "async";
  const cancel = () => img.removeAttribute("src");
  signal.addEventListener("abort", cancel, { once: true });
  try {
    img.src = url;
    await img.decode();
    return img;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/**
 * Get one work ready to show: choose its rung and its pan, then fetch and
 * decode the image before the slideshow is allowed to cross-fade to it.
 * That order is what keeps a half-loaded image off the screen.
 *
 * AVIF first, at the rung sized for this stage. Browsers without AVIF,
 * and a rung that 404s, fall back to the 1280 WebP every shrunk work
 * carries. When both fail the promise rejects, and the player skips the
 * work. A low-resolution scan decodes like any other and is never
 * skipped; it just gets no pan.
 */
export async function prepareSlide(input: {
  index: number;
  art: ArtworkListing;
  viewport: SlideViewport;
  slow: boolean;
  reducedMotion: boolean;
  signal: AbortSignal;
}): Promise<PreparedSlide> {
  const { index, art, viewport, slow, reducedMotion, signal } = input;
  const plan = panPlan(art, index, reducedMotion);
  const width = chooseSlideWidth(art, viewport, { slow, headroom: plan ? PAN_MAX_SCALE : 1 });
  const fallback = fallbackVariantUrl(art.objectKey, art.variantWidths);
  const primary = width ? variantUrl(art.objectKey, width, "avif") : fallback;

  let src = primary;
  let image: HTMLImageElement;
  try {
    image = await decode(primary, signal);
  } catch (err) {
    if (signal.aborted) throw abortError();
    if (!fallback || fallback === primary) throw err;
    src = fallback;
    image = await decode(fallback, signal);
  }
  if (signal.aborted) throw abortError();
  return { index, art, src, plan, image };
}
