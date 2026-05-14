import { withLocalDev } from "@hatchkit/dev-plugin-next";
import bundleAnalyzer from "@next/bundle-analyzer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Bundle analyzer — only active when ANALYZE=true. Emits HTML reports
// in .next/analyze/ for client + server. Useful for tracking the
// gallery-3d route's Three/R3F chunk size and catching regressions.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Standard browser-hardening headers. Applied to every route. Kept
// conservative on CSP — adding a strict policy here would break the
// inline JSON-LD <script> tags in seo.ts plus any next/script flags,
// so we leave CSP to Coolify/Traefik (configurable per environment)
// for now and ship the cheap wins.
const SECURITY_HEADERS = [
  // Block the browser's content-type sniff, so a misserved JSON file
  // can't be reinterpreted as JS or HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full URL (incl. query string) to cross-origin
  // navigations. Same-origin requests still get the full referrer,
  // so internal analytics keep working.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Block iframing entirely. The gallery isn't designed to live
  // inside someone else's frame and the lightbox/zoom modal don't
  // play well with frame-ancestor sandboxing anyway.
  { key: "X-Frame-Options", value: "DENY" },
  // Disable powerful features the site doesn't use, so a future
  // third-party script can't suddenly start asking for the
  // microphone / camera / geolocation.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

// Same-origin rewrite target for the rclone asset server. Used by
// /gallery-3d to pull textures into <canvas> without tripping over CORS
// (rclone doesn't emit Access-Control-Allow-Origin). Points at the same
// URL the browser would use directly — we just re-expose it under a
// same-origin path so WebGL textures aren't tainted.
function assetsRewriteTarget() {
  const explicit = process.env.NEXT_PUBLIC_ASSETS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_ASSETS_BASE_URL must be set in production.");
  }
  return "http://localhost:9837";
}

const ASSETS_REWRITE_TARGET = assetsRewriteTarget();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  ...(process.env.NODE_ENV === "development"
    ? {
        allowedDevOrigins: [
          "192.168.1.119",
          "192.168.1.*",
          "*.local",
          "*.local.ricoslabs.com",
          "collection-of-beauty.local.ricoslabs.com",
        ],
      }
    : {}),
  // No `images` config: we serve pre-built AVIF/WebP variants directly
  // via <picture>/<source> from rclone. Next's image optimizer isn't in
  // the hot path, so remotePatterns / formats / sizes are all moot.
  async rewrites() {
    return [
      {
        source: "/assets-raw/:path*",
        destination: `${ASSETS_REWRITE_TARGET}/:path*`,
      },
    ];
  },
  // The old German /impressum route was renamed to /imprint when the
  // page was translated. Permanent redirect so any external links or
  // search-engine entries still resolve.
  async redirects() {
    return [
      {
        source: "/impressum",
        destination: "/imprint",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

const __hatchkitLocalDevConfig = withBundleAnalyzer(nextConfig);
export default withLocalDev(__hatchkitLocalDevConfig, { slug: "collection-of-beauty" });
