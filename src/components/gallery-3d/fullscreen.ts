/** Asks for browser fullscreen on `element` and lets a refusal pass.
 *  Call it inside the click or tap that asked for it: outside a user
 *  gesture the browser rejects the request. iPhone Safari has no
 *  fullscreen for anything but a video, so the method is missing there
 *  and nothing happens; the museum stays in the page as before. */
export function requestFullscreenQuietly(element: Element | null | undefined) {
  if (!element || document.fullscreenElement) return;
  const result: unknown = element.requestFullscreen?.({ navigationUI: "hide" });
  if (result instanceof Promise) {
    result.catch((err) => {
      // A breadcrumb for "fullscreen does nothing" reports.
      console.warn("[gallery-3d] requestFullscreen rejected:", err);
    });
  }
}
