"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Gallery3DState = {
  is3DActive: boolean;
  setIs3DActive: (v: boolean) => void;
};

const Ctx = createContext<Gallery3DState>({
  is3DActive: false,
  setIs3DActive: () => {},
});

/**
 * Tracks whether the user is currently inside the 3D experience (post
 * Enter-click on the loading overlay), as opposed to merely on the
 * `/gallery-3d` route. Exposed to:
 *   - SiteNav, which renders `null` while active so the museum visit
 *     isn't framed by the page header.
 *   - The body, whose vertical scroll is locked while active so the
 *     scroll wheel doesn't move the page out from under the canvas.
 *
 * Restoring the previous overflow value (rather than blanking it) plays
 * nicely with the menu modal's matching scroll lock — if both happen
 * to be active, releasing one doesn't clobber the other.
 */
export function Gallery3DProvider({ children }: { children: React.ReactNode }) {
  const [is3DActive, setIs3DActive] = useState(false);

  useEffect(() => {
    if (!is3DActive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [is3DActive]);

  return <Ctx.Provider value={{ is3DActive, setIs3DActive }}>{children}</Ctx.Provider>;
}

export function useIs3DActive(): boolean {
  return useContext(Ctx).is3DActive;
}

export function useSetIs3DActive(): (v: boolean) => void {
  return useContext(Ctx).setIs3DActive;
}
