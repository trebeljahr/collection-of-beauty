"use client";

// Three.js touches `window` on import, so the sheet loads client-side
// only, like the museum itself (see gallery-3d-client.tsx).

import dynamic from "next/dynamic";
import type { FrameSheetProps } from "@/components/gallery-3d/frame-sheet";

const FrameSheet = dynamic(
  () => import("@/components/gallery-3d/frame-sheet").then((m) => m.FrameSheet),
  { ssr: false, loading: () => <div className="h-screen w-full bg-black" /> },
);

export function FrameSheetClient(props: FrameSheetProps) {
  return <FrameSheet {...props} />;
}
