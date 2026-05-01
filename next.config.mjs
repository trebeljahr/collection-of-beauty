import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  return "http://localhost:9100";
}

const ASSETS_REWRITE_TARGET = assetsRewriteTarget();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
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
};

export default nextConfig;
