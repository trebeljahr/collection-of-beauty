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

// Set via .env.local; defaults to the bucket on the local shared MinIO.
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_BASE_URL ??
  "http://localhost:9000/collection-of-beauty";

export function assetUrl(objectKey: string): string {
  return `${ASSETS_BASE_URL}/${objectKey
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
