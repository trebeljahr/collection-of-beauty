import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // No `images` config: we serve pre-built AVIF/WebP variants directly
  // via <picture>/<source> from rclone. Next's image optimizer isn't in
  // the hot path, so remotePatterns / formats / sizes are all moot.
};

export default nextConfig;
