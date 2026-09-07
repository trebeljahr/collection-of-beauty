import { pillClasses } from "@/components/ui/pill";
import { getLicenseInfo } from "@/lib/license";

type Props = {
  license: string | null | undefined;
  className?: string;
};

/**
 * A clickable license pill: PD/CC icon + label, opens the canonical
 * license URL in a new tab. Used on the artwork detail page so visitors
 * can see at a glance that a work is public-domain (or which CC variant
 * applies) and follow through to the license itself.
 */
export function LicenseBadge({ license, className }: Props) {
  const info = getLicenseInfo(license);

  return (
    <a
      href={info.url}
      target="_blank"
      rel="license noreferrer"
      title={`License: ${info.short} — opens creativecommons.org`}
      className={[pillClasses, className ?? ""].join(" ")}
    >
      {info.isPublicDomain ? (
        <MarkIcon initials="PD" label="Public domain" />
      ) : (
        <MarkIcon initials="CC" label="Creative Commons" />
      )}
      <span>{info.short}</span>
    </a>
  );
}

/**
 * The Public Domain Mark ("PD") and the generic Creative Commons mark
 * ("CC") are the same glyph — initials inside a circle — so they are one
 * component. Drawn from scratch so we don't depend on a remote SVG.
 */
function MarkIcon({ initials, label }: { initials: string; label: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" role="img" aria-label={label}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <text
        x="12"
        y="13"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="9"
        fontWeight="700"
        fill="currentColor"
      >
        {initials}
      </text>
    </svg>
  );
}
