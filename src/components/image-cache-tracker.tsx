"use client";

import { useEffect } from "react";
import { installImageLoadTracker } from "@/lib/image-cache";

/** Mounts once in the root layout to start recording which image variant
 *  the browser loaded per artwork. Renders nothing. */
export function ImageCacheTracker() {
  useEffect(() => {
    installImageLoadTracker();
  }, []);
  return null;
}
