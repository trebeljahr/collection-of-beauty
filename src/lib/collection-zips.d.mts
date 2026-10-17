export type CollectionZipSet = {
  sha256: string;
  bytes: number;
  entries: number;
  filename: string;
  path: string;
  published: boolean;
};
export type CollectionZipsMeta = {
  schema: 1;
  origin: string;
  sets: Record<string, CollectionZipSet>;
};
export function validateCollectionZips(meta: unknown): CollectionZipsMeta;
export function publishedCollectionZips(
  meta: CollectionZipsMeta,
): Record<string, { url: string; bytes: number; entries: number }>;
export function collectionZipRedirects(meta: CollectionZipsMeta): [string, string, number][];
export function verifyCollectionZips(
  meta: CollectionZipsMeta,
  fetchImpl?: typeof fetch,
): Promise<Record<string, boolean>>;
