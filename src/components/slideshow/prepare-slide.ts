import type { ArtworkListing } from "@/lib/data";
import {
  type AvifSupport,
  chooseSlideWidth,
  INITIAL_AVIF_SUPPORT,
  nextAvifSupport,
  PAN_MAX_SCALE,
  type PanPlan,
  panPlan,
  type SlideViewport,
} from "@/lib/slideshow";
import { fallbackVariant, fallbackVariantUrl, variantUrl } from "@/lib/utils";

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

/** Module scope, so it lasts for the page load across slides. */
let avif: AvifSupport = INITIAL_AVIF_SUPPORT;

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
  let cancel = () => {};
  // Reject on abort by itself too, not only through decode(): a timeout
  // must end the wait even in an engine that leaves the decode pending.
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => {
      img.removeAttribute("src");
      reject(abortError());
    };
  });
  aborted.catch(() => {});
  signal.addEventListener("abort", cancel, { once: true });
  try {
    img.src = url;
    await Promise.race([img.decode(), aborted]);
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
 * carries. Once AVIF has failed that way twice with no success, later
 * slides go to the WebP directly instead of downloading both. When both fail the promise rejects, and the player skips the
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
  // Only a WebP fallback says anything about AVIF: a work without the
  // 1280 rung falls back to another AVIF.
  const webpFallback = !!fallback && fallbackVariant(art.variantWidths).format === "webp";
  const primary =
    width && !(avif.supported === false && webpFallback)
      ? variantUrl(art.objectKey, width, "avif")
      : fallback;
  const learn = webpFallback && primary !== fallback;

  let src = primary;
  let image: HTMLImageElement;
  try {
    image = await decode(primary, signal);
    if (learn) avif = nextAvifSupport(avif, "ok");
  } catch (err) {
    if (signal.aborted) throw abortError();
    if (!fallback || fallback === primary) throw err;
    src = fallback;
    image = await decode(fallback, signal);
    if (learn) avif = nextAvifSupport(avif, "miss");
  }
  if (signal.aborted) throw abortError();
  return { index, art, src, plan, image };
}
