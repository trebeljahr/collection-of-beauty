"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordNavigation } from "@/lib/navigation-history";

/** Mounts once in the root layout to remember the previous in-app URL,
 *  so a "Back to …" link can tell whether history.back() lands where
 *  it points. Renders nothing. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordNavigation(`${pathname}${window.location.search}`);
  }, [pathname]);
  return null;
}
