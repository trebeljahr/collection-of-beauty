import { withLocalDev } from "@hatchkit/dev-plugin-next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { pressKitRedirects } from "./scripts/press-kit-download.mjs";
import { FIXED_REDIRECTS, SECURITY_HEADERS, toNextRedirects } from "./scripts/static-routing.mjs";

// Bundle analyzer — only active when ANALYZE=true. Emits HTML reports
// in .next/analyze/ for client + server. Useful for tracking the
// gallery-3d route's Three/R3F chunk size and catching regressions.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const isDev = process.env.NODE_ENV === "development";

// `next dev` only. The local asset server (rclone, `pnpm assets:serve`)
// sends no CORS headers, so the 3D gallery reads textures through this
// same-origin path; the CDN answers collectionofbeauty.com with
// Access-Control-Allow-Origin, so the export loads from it directly.
function assetsRewriteTarget() {
  const explicit = process.env.NEXT_PUBLIC_ASSETS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return "http://localhost:9837";
}

// `next dev` only: the API Worker (workers/api) under `wrangler dev`.
const API_DEV_URL = (process.env.COB_API_DEV_URL ?? "http://localhost:8790").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A static export, served by an assets-only Cloudflare Worker. What
  // still needs code (newsletter, downloads) is the API Worker in
  // workers/api. See docs/static-site.md.
  output: "export",
  // No optimizer behind a static file host. Every gallery image is a
  // pre-built AVIF/WebP variant in a plain <picture>; only /press uses
  // next/image, for its own /marketing files.
  images: { unoptimized: true },
  // `page.dev.tsx` is a page under `next dev` only: the review tools
  // (/dedup-review, /replace-low-res) read files on this machine and have
  // no place in the export.
  pageExtensions: isDev ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  // Browser error reporting (src/lib/error-reporting). "" when unset, so the
  // reporter's condition on it is a literal and a build without a DSN drops
  // the SDK chunk instead of shipping it unused.
  env: { NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "" },
  ...(isDev
    ? {
        allowedDevOrigins: [
          "192.168.1.119",
          "192.168.1.*",
          "*.local",
          "*.local.ricoslabs.com",
          "collection-of-beauty.local.ricoslabs.com",
        ],
        async rewrites() {
          return [
            { source: "/assets-raw/:path*", destination: `${assetsRewriteTarget()}/:path*` },
            {
              source: "/api/newsletter/:path*",
              destination: `${API_DEV_URL}/api/newsletter/:path*`,
            },
            { source: "/api/download/:path*", destination: `${API_DEV_URL}/api/download/:path*` },
          ];
        },
        async redirects() {
          return [...pressKitRedirects(), ...toNextRedirects(FIXED_REDIRECTS)];
        },
        async headers() {
          return [{ source: "/:path*", headers: SECURITY_HEADERS }];
        },
      }
    : {}),
};

const __hatchkitLocalDevConfig = withBundleAnalyzer(nextConfig);
export default withLocalDev(__hatchkitLocalDevConfig, { slug: "collection-of-beauty" });
