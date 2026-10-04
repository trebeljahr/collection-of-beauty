"use client";
import { useEffect } from "react";
import { installReleaseNavigationGuard } from "@/lib/release-session";
import { reloadForReleaseChange, reloadIfStaleDeploy } from "@/lib/stale-deploy";

export function ReleaseNavigationGuard() {
  useEffect(() => {
    const removeGuard = installReleaseNavigationGuard();
    const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
    if (!commit || !/^[a-f0-9]{40}$/.test(commit)) return removeGuard;
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/releases.json?at=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok || stopped) return;
        const data = await response.json();
        if (
          data.schema === 2 &&
          Array.isArray(data.releases) &&
          data.releases.length >= 1 &&
          data.releases.length <= 6 &&
          data.releases.every(
            (id: unknown) => typeof id === "string" && /^[a-f0-9]{40}$/.test(id),
          ) &&
          !data.releases.includes(commit)
        )
          reloadForReleaseChange();
      } catch {
        /* A failed check does not discard the active page. */
      }
    };
    const resourceError = (event: Event) => {
      if (
        event.target instanceof HTMLScriptElement &&
        new URL(event.target.src, window.location.href).pathname.startsWith("/_next/static/")
      )
        reloadForReleaseChange();
    };
    const rejected = (event: PromiseRejectionEvent) => {
      reloadIfStaleDeploy(event.reason);
    };
    const focus = () => {
      void check();
    };
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("focus", focus);
    window.addEventListener("error", resourceError, true);
    window.addEventListener("unhandledrejection", rejected);
    void check();
    return () => {
      stopped = true;
      removeGuard();
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("error", resourceError, true);
      window.removeEventListener("unhandledrejection", rejected);
    };
  }, []);
  return null;
}
