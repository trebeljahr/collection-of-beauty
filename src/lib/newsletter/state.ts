import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { NewsletterIssue, NewsletterState } from "./types";
import { EMPTY_STATE } from "./types";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Lazy — only instantiated when the handler actually runs, so importing this
 * module during build does not require credentials.
 */
function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: required("R2_ENDPOINT"),
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function getBucket(): string {
  return required("R2_STATE_BUCKET");
}

function getKey(): string {
  return process.env.R2_STATE_KEY ?? "newsletter-state.json";
}

export async function loadState(): Promise<NewsletterState> {
  const client = getClient();
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: getKey() }));
    const body = await res.Body?.transformToString();
    if (!body) return EMPTY_STATE;
    const parsed = JSON.parse(body) as NewsletterState;
    if (!Array.isArray(parsed.issues)) return EMPTY_STATE;
    return parsed;
  } catch (err: unknown) {
    // R2/S3 missing-object errors: NoSuchKey (404). Everything else surfaces.
    if (isNoSuchKey(err)) return EMPTY_STATE;
    throw err;
  }
}

export async function saveState(state: NewsletterState): Promise<void> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: getKey(),
      Body: JSON.stringify(state, null, 2),
      ContentType: "application/json",
      // Ensure the state file isn't cached by any fronting CDN.
      CacheControl: "no-store",
    }),
  );
}

/** Flat set of every artwork id that has been featured in any prior issue. */
export function sentArtworkIds(state: NewsletterState): Set<string> {
  const set = new Set<string>();
  for (const issue of state.issues) {
    for (const id of issue.artworkIds) set.add(id);
  }
  return set;
}

export function findIssue(state: NewsletterState, weekKey: string): NewsletterIssue | undefined {
  return state.issues.find((i) => i.weekKey === weekKey);
}

function isNoSuchKey(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    anyErr.name === "NoSuchKey" ||
    anyErr.Code === "NoSuchKey" ||
    anyErr.$metadata?.httpStatusCode === 404
  );
}

// Re-export so callers can import the type from a single place.
export type { NewsletterIssue, NewsletterState } from "./types";
