export const pillClasses =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]";

/* Tappable chip — a pill that is also a navigation target (era, movement,
   collection, licence, source). `min-h-11` is WCAG 2.5.5's 44px touch
   floor; the bare pill's own type only makes 26px. It is gated to below
   `sm:` on purpose: 2.5.5 is a *touch* criterion, and a mouse pointer is
   governed by 2.5.8's 24px, which the bare pill already clears — ungated,
   a contemporaries grid of two dozen pills would be a stack of
   rounded-full slabs on a desktop. Below `sm:` the pill itself grows
   rather than gaining an invisible overflowing hit area: a pill is its own
   visible box, and an overflowing target would sit on top of the chip in
   the row above wherever these wrap. Only `min-h` is added, never a
   competing `px-*` — `pillClasses` already sets padding, and two
   conflicting spacing utilities in one class string resolve by stylesheet
   order, not by who was written last. The focus ring is part of the shared
   string because every consumer renders these as links, which otherwise
   have no visible focus indicator of their own. */
export const chipClasses = `${pillClasses} min-h-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:min-h-0`;

/* Bare text link (back / prev / next / artist / plate set) sized for
   touch. Same 44px WCAG 2.5.5 floor below `sm:` and the plain inline
   anchor above it, for the same reason: 2.5.5 is a touch criterion, a
   mouse only asks for 2.5.8's 24px, and at a bare 20px line height these
   were easy to mis-tap. `-my-3` hands the extra 24px straight back to
   layout so the enlarged box overlaps the neighbouring lines instead of
   spreading them apart — nothing above or below these links is clickable,
   so the overlap costs nothing and the surrounding blocks keep their exact
   positions in running prose. `sm:inline` returns the anchor to an
   ordinary inline box above the breakpoint, so a long artist name still
   wraps mid-sentence the way it always did. This is the idiom on every
   page that grew a touch target: enlarge the box and overlap, never shrink
   a neighbour's margin. Compose extra utilities at the call site
   (`${touchTextLinkClasses} text-sm underline-offset-4`); none of them may
   conflict with what is already here, since a later class does not win in
   Tailwind v4. */
export const touchTextLinkClasses =
  "-my-3 inline-flex min-h-11 items-center rounded-sm underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:my-0 sm:inline sm:min-h-0";
