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
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]",
        "bg-[var(--card)] px-2.5 py-1 text-xs font-medium",
        "transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
        className ?? "",
      ].join(" ")}
    >
      {info.isPublicDomain ? <PublicDomainIcon /> : <CcIcon />}
      <span>{info.short}</span>
    </a>
  );
}

/**
 * Public Domain Mark — a circle with "PD" inside. Drawn from scratch
 * so we don't depend on a remote SVG.
 */
function PublicDomainIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      role="img"
      aria-label="Public domain"
      className={className}
    >
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
        PD
      </text>
    </svg>
  );
}

/** Generic Creative Commons "CC" mark for CC BY / BY-SA variants. */
function CcIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      role="img"
      aria-label="Creative Commons"
      className={className}
    >
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
        CC
      </text>
    </svg>
  );
}
