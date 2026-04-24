#!/usr/bin/env node
/**
 * Native Node static file server for ./assets-web/. Drop-in replacement
 * for the rclone-in-docker setup: same port, same URL shape, no Linux
 * VM required. Serves the same three behaviours the site depends on:
 *
 *   - `GET /<folder>/<filename>`     → the file, or 404
 *   - Range requests for seeking into big originals
 *   - Long-lived Cache-Control so browser revisits are fast
 *
 * Deliberately minimal. No directory listing, no index.html, no writes.
 * Mirrors `rclone serve http --read-only` closely enough that nothing
 * downstream notices the swap.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..", "assets-web");
const PORT = Number.parseInt(process.env.PORT ?? "9100", 10);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = /** @type {const} */ ({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
});

function safeResolve(reqPath) {
  // Decode percent-escapes (filenames have spaces, unicode, etc.),
  // normalise `..` segments, then verify we're still under ROOT.
  const decoded = decodeURIComponent(reqPath);
  const absolute = join(ROOT, normalize(decoded));
  if (!absolute.startsWith(ROOT + "/") && absolute !== ROOT) return null;
  return absolute;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const url = req.url ?? "/";
    const path = safeResolve(url.split("?")[0]);
    if (!path) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }

    let stats;
    try {
      stats = await stat(path);
      if (!stats.isFile()) throw new Error("not a file");
    } catch {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const mime =
      MIME[/** @type {keyof typeof MIME} */ (extname(path).toLowerCase())] ??
      "application/octet-stream";

    // HTTP Range — browsers use this for big media. Without it, seeking
    // and interrupted downloads force a full re-fetch.
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number.parseInt(m[1], 10);
        const end = m[2] ? Number.parseInt(m[2], 10) : stats.size - 1;
        if (start >= stats.size || end >= stats.size || start > end) {
          res.writeHead(416, {
            "Content-Range": `bytes */${stats.size}`,
          });
          res.end();
          return;
        }
        res.writeHead(206, {
          "Content-Type": mime,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${stats.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        if (req.method === "HEAD") return res.end();
        createReadStream(path, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": mime,
      "Content-Length": stats.size,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Last-Modified": stats.mtime.toUTCString(),
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(path).pipe(res);
  } catch (err) {
    console.error("[assets] request error:", err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("server error");
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[assets] serving ${ROOT} at http://${HOST}:${PORT} (read-only)`);
});

for (const sig of /** @type {const} */ (["SIGINT", "SIGTERM"])) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
