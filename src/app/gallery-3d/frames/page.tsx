// Debug sheet of the museum's picture frames: a wall of works, each in
// its own frame (`pickFrameDesign`), lit as in the galleries.
//
//   /gallery-3d/frames                 a spread across every school
//   /gallery-3d/frames?m=Baroque       one school (substring of the tag)
//   /gallery-3d/frames?look=hogarth    one look (a LookId of frame-design.ts)
//   /gallery-3d/frames?n=12&cols=4     fewer, larger
//   /gallery-3d/frames?page=2          the next sheet
//   /gallery-3d/frames?real=1          works at their measured sizes
//   /gallery-3d/frames?hung=1          framed as a room frames them: for
//                                      the wall colour, in one family of
//                                      finishes, each row as one wall
//   /gallery-3d/frames?era=baroque     on another era's wall
//   /gallery-3d/frames?id=a,b          the works named by id

import type { Metadata } from "next";
import { Suspense } from "react";
import { FramesClient } from "./frames-client";

export const metadata: Metadata = {
  title: "Museum frames · debug",
  robots: { index: false, follow: false },
};

export default function FramesPage() {
  return (
    <Suspense>
      <FramesClient />
    </Suspense>
  );
}
