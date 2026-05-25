// Shared pre-mount curtain for the 3D gallery. One component, one
// visual, used by every "scene not ready yet" moment before the museum
// can paint:
//   - loading.tsx       — route Suspense fallback while the JS chunk
//                         (Three.js + R3F + drei) downloads.
//   - gallery-3d-client — while /api/artworks is in flight AND as the
//                         next/dynamic loading fallback.
//
// Card styling deliberately mirrors index.tsx's StartOverlay ("Enter
// the museum") — same dark backdrop, same bordered card, same serif
// heading, same bar — so when the real overlay takes over the swap is
// invisible. The user perceives one continuous loader that ends on the
// Enter card, not three different screens flashing past.
//
// Pure / no hooks so it can be imported by both the Server Component
// route fallback (loading.tsx) and the client wrapper without dragging
// the Three.js bundle into the route shell.
//
// Stays h-screen: the root layout appends a footer (mt-16) right after
// <main>, so a 0-height loading state would flash the footer into the
// viewport before the canvas takes over. h-screen pins it below the fold
// for the whole load.
export function GalleryCurtain({ failed = false }: { failed?: boolean }) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0a0805] px-4 text-white">
      <div className="w-[min(480px,92vw)] rounded-xl border border-white/15 bg-black/60 p-6 text-center text-white shadow-2xl">
        <h2 className="font-serif text-2xl tracking-wide">
          {failed ? "Could not load museum" : "Entering the museum"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {failed ? "Refresh to try again." : "Loading the exhibit…"}
        </p>
        {!failed && (
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/4 rounded-full bg-white/70 animate-loading-bar" />
          </div>
        )}
      </div>
    </div>
  );
}
