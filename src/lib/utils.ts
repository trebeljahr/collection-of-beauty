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
// - assetUrl()       browser-reachable (raw <img>, <a href>, download links).
//                    Defaults to the rclone HTTP server exposed on the host.
// - assetOriginUrl() reachable by the Next.js image optimizer running inside
//                    the web container. Uses the docker-compose service name
//                    so web → assets traffic stays on the internal network.
//                    In prod both collapse to the same public URL.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "http://localhost:9100";
const ASSETS_ORIGIN_URL = process.env.ASSETS_ORIGIN_URL ?? ASSETS_BASE_URL;

function encodeKey(objectKey: string): string {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

export function assetUrl(objectKey: string): string {
  return `${ASSETS_BASE_URL}/${encodeKey(objectKey)}`;
}

export function assetOriginUrl(objectKey: string): string {
  return `${ASSETS_ORIGIN_URL}/${encodeKey(objectKey)}`;
}
