/**
 * Route-level loading state for `/gallery-3d`. Renders during the
 * pending phase of a client-side navigation while Next streams the
 * WebGL bundle (Three.js + r3f + drei + the gallery itself — easily
 * 1–3 s on a cold cache). Without this, clicking "3D Room" in the site
 * nav modal feels frozen: the modal slides off but no replacement
 * appears until the chunk lands. The styling deliberately mirrors
 * `StartOverlay` so the swap from this loading card to the real
 * "Enter the museum" panel reads as the same screen updating in place,
 * not a hard cut.
 *
 * Direct (server-rendered) navigation skips this entirely — Next only
 * uses loading.tsx during client transitions.
 */
export default function Gallery3DLoading() {
  return (
    <div className="relative min-h-screen w-full bg-black animate-page-slide-in-top">
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="w-[min(480px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
          <h2 className="font-serif text-2xl tracking-wide">Entering the museum</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">Loading the 3D experience…</p>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/4 rounded-full bg-white/70 animate-loading-bar" />
          </div>
        </div>
      </div>
    </div>
  );
}
