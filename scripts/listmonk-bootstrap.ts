#!/usr/bin/env -S npx tsx
/**
 * One-shot ListMonk admin bootstrap.
 *
 * Hatchkit creates the prod + dev lists and wires SES SMTP into
 * ListMonk, but it does NOT create the two passthrough templates the
 * app needs:
 *
 *   1. A transactional template ("Collection of Beauty — Tx Passthrough")
 *      consumed by `POST /api/tx` for the confirmation + welcome emails.
 *      Body wraps `{{ .Tx.Data.body | safeHTML }}` and renders a footer
 *      with `{{ UnsubscribeURL }}` so transactional welcomes still carry
 *      a working opt-out link.
 *   2. A campaign template ("Collection of Beauty — Campaign Passthrough")
 *      consumed by `POST /api/campaigns` for the weekly digest. Body is
 *      just `{{ template "content" . }}` because the digest HTML already
 *      includes its own unsubscribe footer (the weekly-digest React
 *      Email template injects `{{ UnsubscribeURL }}` at render time).
 *
 * Idempotent: a template whose name matches the canonical string above
 * is reused rather than duplicated. The script prints the resulting
 * template ids so the operator can paste them into
 * `.env.production` (and `.env.development`, if you keep dev pointing
 * at the same ListMonk instance — Hatchkit does by default).
 *
 *   pnpm listmonk:bootstrap
 */

const TX_TEMPLATE_NAME = "Collection of Beauty — Tx Passthrough";
const CAMPAIGN_TEMPLATE_NAME = "Collection of Beauty — Campaign Passthrough";

const TX_TEMPLATE_SUBJECT = "{{ .Tx.Data.subject }}";
const TX_TEMPLATE_BODY = `<!doctype html>
<html><body>
{{ .Tx.Data.body | safeHTML }}
<p style="margin-top:24px;font-size:11px;color:#888;text-align:center;font-family:Georgia,serif">
  You're receiving this because you signed up for the Collection of Beauty newsletter.<br>
  <a href="{{ UnsubscribeURL }}" style="color:#888;text-decoration:underline">Unsubscribe</a>
</p>
</body></html>`;

const CAMPAIGN_TEMPLATE_BODY = `{{ template "content" . }}`;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function baseUrl(): string {
  return required("LISTMONK_URL").replace(/\/$/, "");
}

function authHeader(): string {
  return `token ${required("LISTMONK_API_USER")}:${required("LISTMONK_API_TOKEN")}`;
}

async function listmonkFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`listmonk ${init.method ?? "GET"} ${path}: ${res.status} ${text}`);
  }
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

type ListmonkTemplate = {
  id: number;
  name: string;
  type: "campaign" | "tx" | "campaign_visual";
};

type TemplatesResponse = { data: ListmonkTemplate[] | { results: ListmonkTemplate[] } };

async function listTemplates(): Promise<ListmonkTemplate[]> {
  const res = await listmonkFetch<TemplatesResponse>("/api/templates");
  const data = res.data as ListmonkTemplate[] | { results: ListmonkTemplate[] };
  return Array.isArray(data) ? data : (data.results ?? []);
}

async function findTemplate(
  name: string,
  type: "tx" | "campaign",
): Promise<ListmonkTemplate | null> {
  const all = await listTemplates();
  return all.find((t) => t.name === name && t.type === type) ?? null;
}

async function createTemplate(params: {
  name: string;
  type: "tx" | "campaign";
  subject?: string;
  body: string;
}): Promise<ListmonkTemplate> {
  type CreateResp = { data: ListmonkTemplate };
  const res = await listmonkFetch<CreateResp>("/api/templates", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      type: params.type,
      subject: params.subject ?? "",
      body: params.body,
    }),
  });
  return res.data;
}

async function upsertTemplate(params: {
  name: string;
  type: "tx" | "campaign";
  subject?: string;
  body: string;
}): Promise<{ id: number; created: boolean }> {
  const existing = await findTemplate(params.name, params.type);
  if (existing) return { id: existing.id, created: false };
  const created = await createTemplate(params);
  return { id: created.id, created: true };
}

async function main(): Promise<void> {
  console.info(`[bootstrap] ListMonk @ ${baseUrl()}`);

  const tx = await upsertTemplate({
    name: TX_TEMPLATE_NAME,
    type: "tx",
    subject: TX_TEMPLATE_SUBJECT,
    body: TX_TEMPLATE_BODY,
  });
  console.info(
    `[bootstrap] tx template       ${tx.created ? "created" : "found"}: id=${tx.id}`,
  );

  const campaign = await upsertTemplate({
    name: CAMPAIGN_TEMPLATE_NAME,
    type: "campaign",
    body: CAMPAIGN_TEMPLATE_BODY,
  });
  console.info(
    `[bootstrap] campaign template ${campaign.created ? "created" : "found"}: id=${campaign.id}`,
  );

  console.info(``);
  console.info(`Add these to .env.production (and .env.development, same values):`);
  console.info(`  LISTMONK_TX_TEMPLATE_ID=${tx.id}`);
  console.info(`  LISTMONK_CAMPAIGN_TEMPLATE_ID=${campaign.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
