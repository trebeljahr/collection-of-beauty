// Suspense fallback shown while the Gallery3D component's JS chunk
// (Three.js + R3F + drei + postprocessing — ~600 KB gzipped) is
// downloading and parsing. Without this, the route is a blank canvas
// until the bundle is ready — the same animated curtain we already
// use during context-loss recovery keeps the user oriented.
//
// Once the chunk parses and Gallery3D mounts, its StartOverlay takes
// over (with the per-painting load progress bar). This file just
// covers the bundle-fetch window.

export default function Loading() {
  return (
    <div className="relative h-screen w-full bg-[#0a0805]">
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="w-[min(360px,88vw)] rounded-xl border border-white/15 bg-black/70 p-5 text-center text-white shadow-2xl">
          <h2 className="font-serif text-lg tracking-wide">Loading 3D gallery</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/70">Fetching the WebGL bundle…</p>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/4 rounded-full bg-white/70 animate-loading-bar" />
          </div>
        </div>
      </div>
    </div>
  );
}
