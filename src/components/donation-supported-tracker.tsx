"use client";

import { useEffect } from "react";
import { consumeSupportedParam } from "@/lib/donation-supported";

/** Mounts once in the root layout. On arrival from ricos.site's donate
 *  page (`?supported=1`) it records the time and strips the parameter.
 *  Renders nothing. */
export function DonationSupportedTracker() {
  useEffect(() => {
    consumeSupportedParam(window);
  }, []);
  return null;
}
