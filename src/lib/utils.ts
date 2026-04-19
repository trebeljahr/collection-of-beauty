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

// Set via .env.local; defaults to the rclone HTTP server (docker-compose).
// objectKey is "<folder>/<filename>", which rclone serves directly as
// .../<folder>/<filename> from the bind-mounted assets/ directory.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ?? "http://localhost:9100";

export function assetUrl(objectKey: string): string {
  return `${ASSETS_BASE_URL}/${objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
