import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "http", hostname: "localhost", port: "9100" },
      { protocol: "http", hostname: "127.0.0.1", port: "9100" },
      // compose-internal hostname the Next optimizer uses to reach rclone
      { protocol: "http", hostname: "assets", port: "8080" },
    ],
    formats: ["image/avif", "image/webp"],
    // Breakpoints served in srcset. Smaller set = smaller cache footprint.
    imageSizes: [64, 128, 256],
    deviceSizes: [480, 640, 960, 1280, 1920, 2560],
    // How long cached derivatives live before revalidation (1 year).
    minimumCacheTTL: 31_536_000,
    // Next 16 blocks private-IP origins by default (SSRF protection). The
    // rclone sidecar lives on the docker-compose network, so allow it.
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
