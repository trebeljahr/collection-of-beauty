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

export function wikimediaThumb(fileUrl: string, width = 800): string {
  const m = fileUrl.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/(.+)$/,
  );
  if (!m) return fileUrl;
  const [, a, ab, name] = m;
  const ext = (name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  const passthrough = ext === "jpg" || ext === "jpeg" || ext === "png";
  if (!passthrough) return fileUrl;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${a}/${ab}/${name}/${width}px-${name}`;
}
