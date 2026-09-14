/**
 * The plum-blossom mark from src/app/icon-source.svg (the favicon),
 * inlined so the header draws it without a request. Decorative: every
 * use sits next to the "Collection of Beauty" wordmark, which carries
 * the accessible name. Keep the geometry in step with icon-source.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="#c93b65">
        <circle cx="32" cy="18" r="9" />
        <circle cx="45.32" cy="27.67" r="9" />
        <circle cx="40.22" cy="43.33" r="9" />
        <circle cx="23.78" cy="43.33" r="9" />
        <circle cx="18.68" cy="27.67" r="9" />
      </g>
      <circle cx="32" cy="32" r="3.5" fill="#f5d44e" />
      <g stroke="#f5d44e" strokeWidth="1.2" strokeLinecap="round">
        <line x1="32" y1="32" x2="32" y2="26" />
        <line x1="32" y1="32" x2="37.7" y2="30.15" />
        <line x1="32" y1="32" x2="35.52" y2="36.85" />
        <line x1="32" y1="32" x2="28.48" y2="36.85" />
        <line x1="32" y1="32" x2="26.3" y2="30.15" />
      </g>
    </svg>
  );
}
