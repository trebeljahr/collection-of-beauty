/**
 * ListMonk HTTP API client.
 *
 * We talk to a self-hosted ListMonk instance (configured to deliver via
 * Amazon SES SMTP) over its REST API:
 *
 *   - Subscribers + list memberships are stored in ListMonk.
 *   - Transactional emails (double-opt-in confirmation, welcome issue)
 *     go through `POST /api/tx` against a pre-defined passthrough
 *     template.
 *   - The weekly digest goes through `POST /api/campaigns` + status
 *     toggle, which lets ListMonk fan out per-recipient with native
 *     `{{ UnsubscribeURL }}` substitution.
 *
 * Required ListMonk setup (one-time, in the admin UI):
 *
 *   - Two templates created under Campaigns → Templates:
 *       • A transactional template whose body renders
 *         `{{ .Tx.Data.body | Safe }}`. Subject:
 *         `{{ .Tx.Data.subject }}`.
 *       • A campaign template whose body is just
 *         `{{ template "content" . }}` (the digest HTML already
 *         carries the wrapper, including the unsubscribe link).
 *   - One list per environment (prod + test). Hatchkit writes each
 *     environment's list id into that env file as `LISTMONK_LIST_ID`.
 *   - An API user with both Subscribers + Campaigns + Templates +
 *     Transactional roles; the user + token go into
 *     `LISTMONK_API_USER` / `LISTMONK_API_TOKEN`.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function baseUrl(): string {
  return required("LISTMONK_URL").replace(/\/$/, "");
}

function authHeader(): string {
  const user = required("LISTMONK_API_USER");
  const token = required("LISTMONK_API_TOKEN");
  return `token ${user}:${token}`;
}

async function listmonkFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
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

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers
//
// Hatchkit provisions one ListMonk list per environment (prod + dev) and
// renders a single `LISTMONK_LIST_ID` env var into each env file —
// `.env.production` carries the live list id, `.env.development` carries
// the test list id. The runtime just reads the variable; selecting the
// right env file is the deploy layer's job (Next.js does this for you;
// the newsletter-send CLI uses `scripts/newsletter-send.sh` to pick).
// ─────────────────────────────────────────────────────────────────────────────

export function isProductionSend(): boolean {
  return process.env.NODE_ENV === "production";
}

export function resolveListId(): number {
  const raw = required("LISTMONK_LIST_ID");
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ListMonk list id: ${raw}`);
  }
  return n;
}

export function describeListTarget(): string {
  const id = process.env.LISTMONK_LIST_ID;
  return isProductionSend()
    ? `LISTMONK_LIST_ID=${id} (production env file)`
    : `LISTMONK_LIST_ID=${id} (development env file)`;
}

/**
 * From-address for outbound campaigns. Defaults to the SES verified
 * sender that Hatchkit emits as `SES_FROM_EMAIL`; an explicit
 * `LISTMONK_FROM` (display-name + address) overrides it for both
 * campaign and transactional sends when a richer header is wanted.
 */
function resolveFromAddress(): string {
  return process.env.LISTMONK_FROM ?? required("SES_FROM_EMAIL");
}

function resolveEmailHeaders(): Array<Record<string, string>> {
  const replyTo = process.env.LISTMONK_REPLY_TO;
  return replyTo ? [{ "Reply-To": replyTo }] : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscriber operations
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "unconfirmed" | "confirmed" | "unsubscribed";

export type ListmonkSubscriberList = {
  id: number;
  uuid: string;
  name: string;
  subscription_status: SubscriptionStatus;
};

export type ListmonkSubscriber = {
  id: number;
  uuid: string;
  email: string;
  name: string;
  status: "enabled" | "disabled" | "blocklisted";
  lists?: ListmonkSubscriberList[];
};

type SubscribersQueryResponse = {
  data: { results: ListmonkSubscriber[]; total: number };
};

export async function findSubscriber(email: string): Promise<ListmonkSubscriber | null> {
  const normalized = email.toLowerCase();
  const params = new URLSearchParams({
    search: normalized,
    per_page: "all",
  });
  const res = await listmonkFetch<SubscribersQueryResponse>(
    `/api/subscribers?${params.toString()}`,
  );
  return res.data.results.find((sub) => sub.email.toLowerCase() === normalized) ?? null;
}

/**
 * Returns true if `email` is a confirmed member of the configured list
 * (production or test, depending on NODE_ENV).
 */
export async function isConfirmedOnList(email: string): Promise<boolean> {
  const listId = resolveListId();
  const sub = await findSubscriber(email);
  if (!sub) return false;
  const entry = sub.lists?.find((l) => l.id === listId);
  return entry?.subscription_status === "confirmed";
}

/**
 * Create the subscriber if missing, otherwise add the configured list
 * with the given subscription status. Idempotent.
 */
export async function upsertSubscriber(
  email: string,
  status: SubscriptionStatus,
): Promise<ListmonkSubscriber> {
  const listId = resolveListId();
  const existing = await findSubscriber(email);

  if (existing) {
    await listmonkFetch("/api/subscribers/lists", {
      method: "PUT",
      body: JSON.stringify({
        ids: [existing.id],
        action: "add",
        target_list_ids: [listId],
        status,
      }),
    });
    // Re-fetch so callers see the updated `lists` array.
    return (await findSubscriber(email)) ?? existing;
  }

  type CreateResp = { data: ListmonkSubscriber };
  const created = await listmonkFetch<CreateResp>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({
      email: email.toLowerCase(),
      // ListMonk requires a non-empty name. The address itself is the
      // only thing we ask for in the form, so reuse it.
      name: email.toLowerCase(),
      status: "enabled",
      lists: [listId],
      // We run our own double opt-in (custom HMAC token + designed
      // confirmation email), so ask ListMonk *not* to send its own
      // opt-in email. New list subscriptions land as `unconfirmed`
      // until we promote them in `confirmSubscription`.
      preconfirm_subscriptions: status === "confirmed",
    }),
  });
  return created.data;
}

/**
 * Promote an existing subscription from `unconfirmed` to `confirmed`.
 * Idempotent: if the subscriber is missing entirely (e.g. cleaned up
 * server-side after token issuance), we recreate them as confirmed.
 */
export async function confirmSubscription(email: string): Promise<void> {
  await upsertSubscriber(email, "confirmed");
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional send — confirmation email + welcome issue
// ─────────────────────────────────────────────────────────────────────────────

export type SendTransactionalParams = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Send a one-off transactional email through ListMonk's `/api/tx`
 * endpoint. Uses the passthrough template configured via
 * `LISTMONK_TX_TEMPLATE_ID` — that template should consume
 * `{{ .Tx.Data.subject }}` and `{{ .Tx.Data.body | Safe }}`.
 *
 * The recipient must already exist as a subscriber. Call
 * `upsertSubscriber` before sending the confirmation email.
 */
export async function sendTransactional(params: SendTransactionalParams): Promise<void> {
  const templateId = Number(required("LISTMONK_TX_TEMPLATE_ID"));
  const headers = resolveEmailHeaders();
  await listmonkFetch("/api/tx", {
    method: "POST",
    body: JSON.stringify({
      subscriber_email: params.to.toLowerCase(),
      template_id: templateId,
      from_email: resolveFromAddress(),
      ...(headers.length > 0 ? { headers } : {}),
      data: { subject: params.subject, body: params.html },
      content_type: "html",
      messenger: "email",
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign send — weekly digest
// ─────────────────────────────────────────────────────────────────────────────

export type SendCampaignParams = {
  /** Internal name shown in the ListMonk admin UI. */
  name: string;
  subject: string;
  html: string;
  text: string;
};

export type CampaignResult = { id: number; url: string };

/**
 * Create a campaign targeting the configured list and immediately move
 * it to `running` so ListMonk starts dispatching. The body is sent as
 * pre-rendered HTML; ListMonk applies the campaign template (which
 * should be a passthrough wrapper) and substitutes `{{ UnsubscribeURL }}`
 * + `{{ Subscriber.* }}` per recipient.
 *
 * Returns the campaign id so the caller can log it / open it in the
 * admin UI.
 */
export async function sendCampaign(params: SendCampaignParams): Promise<CampaignResult> {
  const listId = resolveListId();
  const fromEmail = resolveFromAddress();
  const headers = resolveEmailHeaders();
  const templateId = Number(required("LISTMONK_CAMPAIGN_TEMPLATE_ID"));

  type CreateResp = { data: { id: number } };
  const created = await listmonkFetch<CreateResp>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      subject: params.subject,
      lists: [listId],
      from_email: fromEmail,
      content_type: "html",
      body: params.html,
      altbody: params.text,
      type: "regular",
      template_id: templateId,
      ...(headers.length > 0 ? { headers } : {}),
      send_later: false,
    }),
  });

  const id = created.data.id;
  await listmonkFetch(`/api/campaigns/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status: "running" }),
  });

  return { id, url: `${baseUrl()}/admin/campaigns/${id}` };
}
