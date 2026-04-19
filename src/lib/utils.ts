import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// Two URLs to the same asset:
//
// - assetUrl()       browser-facing (raw <img>, <a href>, download links).
//                    Defaults to the rclone HTTP server exposed on the host.
// - assetOriginUrl() used in next/image src. The browser never dereferences
//                    this URL directly — it only hits /_next/image?url=<here>,
//                    which the Next server resolves itself. So the value only
//                    needs to be resolvable from the Next server process.
//                    Inside docker-compose that's host.docker.internal; in
//                    prod it collapses to the same public URL as assetUrl.
//
// Both are read from NEXT_PUBLIC_* so client and server agree (no hydration
// mismatch) and a private image-optimizer URL doesn't leak as a secret — the
// Next.js optimizer only signs whitelisted hostnames anyway.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "http://localhost:9100";
const ASSETS_ORIGIN_URL =
  process.env.NEXT_PUBLIC_ASSETS_ORIGIN_URL ?? ASSETS_BASE_URL;

function encodeKey(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

export function assetUrl(objectKey: string): string {
  return `${ASSETS_BASE_URL}/${encodeKey(objectKey)}`;
}

export function assetOriginUrl(objectKey: string): string {
  return `${ASSETS_ORIGIN_URL}/${encodeKey(objectKey)}`;
}
