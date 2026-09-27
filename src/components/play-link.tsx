import Link from "next/link";
import { chipClasses } from "@/components/ui/pill";
import type { Scope } from "@/lib/scope-href";
import { isPlayableScope, playHref } from "@/lib/slideshow";
import { cn } from "@/lib/utils";

/**
 * "Play slideshow" chip for a scope's page. No hooks and no "use client",
 * so it renders from server pages and from the client gallery alike.
 *
 * `prefetch={false}` because /play is dynamic and heavy on first paint
 * (it starts decoding a full-screen image), and most visitors never
 * press it. `rel="nofollow"` keeps crawlers from walking one noindex URL
 * per scope and filter. Renders nothing for the timeline's scope, which
 * the slideshow cannot page through.
 */
export function PlayLink({ scope, className }: { scope: Scope; className?: string }) {
  if (!isPlayableScope(scope)) return null;
  return (
    <Link
      href={playHref(scope)}
      prefetch={false}
      rel="nofollow"
      className={cn(chipClasses, "text-[var(--foreground)]", className)}
    >
      <PlayIcon />
      Play slideshow
    </Link>
  );
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}
