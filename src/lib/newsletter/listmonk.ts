import { legacyBridge } from "./bridge";

/**
 * ListMonk HTTP API client.
 *
 * We talk to a self-hosted ListMonk instance (configured to deliver via
 * Amazon SES SMTP) over its REST API:
 *
 *   - Subscribers + list memberships are stored in ListMonk. An address
 *     joins the list only once it confirms (see `confirmSubscription`).
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

function resolveMessenger(): string {
  return process.env.LISTMONK_MESSENGER || "email";
}

function assertNewsletterWritesEnabled(): void {
  if (process.env.NEWSLETTER_WRITES_PAUSED === "true") {
    throw new Error("Newsletter writes are paused for migration. Retry after reconciliation.");
  }
}

/**
 * From-address for outbound campaigns. Defaults to the SES verified
 * sender that Hatchkit emits as `SES_FROM_EMAIL`; an explicit
 * `LISTMONK_FROM` (display-name + address) overrides it for both
 * campaign and transactional sends when a richer header is wanted.
 */
function resolveFromAddress(): string {
  const from = process.env.LISTMONK_FROM ?? required("SES_FROM_EMAIL");
  if (resolveMessenger() === "project-ses") {
    if (from !== required("SES_FROM_EMAIL") || !/^[a-z0-9][a-z0-9._+-]*@[a-z0-9.-]+$/.test(from)) {
      throw new Error(
        "project-ses requires LISTMONK_FROM to be unset or equal to the bare SES_FROM_EMAIL mailbox.",
      );
    }
    const pinnedReplyTo = process.env.SES_PROJECT_REPLY_TO;
    if (
      pinnedReplyTo &&
      (pinnedReplyTo.trim() !== pinnedReplyTo ||
        !/^[a-zA-Z0-9._+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,63}$/.test(pinnedReplyTo))
    ) {
      throw new Error("project-ses requires a bare SES_PROJECT_REPLY_TO mailbox.");
    }
    if (process.env.LISTMONK_REPLY_TO && process.env.LISTMONK_REPLY_TO !== pinnedReplyTo) {
      throw new Error(
        "project-ses requires LISTMONK_REPLY_TO to match the relay's SES_PROJECT_REPLY_TO.",
      );
    }
  }
  return from;
}

function resolveEmailHeaders(): Array<Record<string, string>> {
  // The isolated relay sets its operator-pinned Reply-To. Request headers
  // cannot override that value; resolveFromAddress checks the app's intent.
  if (resolveMessenger() === "project-ses") return [];
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
  subscription_updated_at?: string;
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
  // ListMonk matches `search` as an unescaped Postgres regex
  // (`email ~* $search`). Unquoted, a plus-address never finds itself:
  // the `+` in `a+b@x.com` means "one or more a". The confirm click
  // would then try to create the subscriber again and fail with a 409.
  const pattern = `^${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
  const params = new URLSearchParams({
    search: pattern,
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
  if (!sub || sub.status !== "enabled") return false;
  const entry = sub.lists?.find((l) => l.id === listId);
  return entry?.subscription_status === "confirmed";
}

// Double opt-in and list membership
//
// An address goes on the list only after the HMAC link in our
// confirmation email is clicked, and then as `confirmed`. Until then it
// exists as a subscriber with no lists, which is all `/api/tx` needs to
// deliver the confirmation email.
//
// The lists are `optin: double` (since 2026-09-28), so campaigns reach
// `confirmed` members only. That is a second guard, not the mechanism:
// ListMonk sends its own opt-in email for any `unconfirmed` membership on
// a double list created or updated without `preconfirm_subscriptions`,
// next to ours. And if a list is ever single again, ListMonk mails every
// member not `unsubscribed`, `unconfirmed` included.

type CreateResp = { data: ListmonkSubscriber };

async function createSubscriber(email: string, listIds: number[]): Promise<ListmonkSubscriber> {
  const created = await listmonkFetch<CreateResp>("/api/subscribers", {
    method: "POST",
    body: JSON.stringify({
      email: email.toLowerCase(),
      // ListMonk requires a non-empty name. The address itself is the
      // only thing we ask for in the form, so reuse it.
      name: email.toLowerCase(),
      status: "enabled",
      lists: listIds,
      // Marks any list in `listIds` as `confirmed`. It also stops
      // ListMonk's own opt-in email: with `false`, ListMonk mails its
      // confirmation for every double-opt-in list in `listIds` (when
      // `app.send_optin_confirmation` is on), on top of ours.
      preconfirm_subscriptions: true,
    }),
  });
  return created.data;
}

/**
 * Make sure `email` exists as a ListMonk subscriber, without adding it
 * to any list. Call this before sending the confirmation email.
 *
 * An existing subscriber is returned untouched. It may belong to other
 * projects' lists, or be `unsubscribed` from ours, and submitting the
 * form again must not put it on our list before the confirm click.
 */
export async function ensureSubscriber(email: string): Promise<ListmonkSubscriber> {
  assertNewsletterWritesEnabled();
  const existing = await findSubscriber(email);
  if (existing && existing.status !== "enabled") {
    throw new Error("Subscriber is suppressed; confirmation mail is not allowed.");
  }
  return existing ?? (await createSubscriber(email, []));
}

/**
 * Add `email` to the configured list as `confirmed`. Only the confirm
 * route calls this after verifying the token. Suppression wins over consent.
 * An unsubscribed member needs a token issued after that unsubscribe.
 * Preserve membership timestamps during migration; unknown dates fail closed.
 * This read/write pair is not atomic: cutover still requires a write freeze
 * and feedback reconciliation before sending.
 */
export async function confirmSubscription(
  email: string,
  tokenIssuedAt?: number,
  token?: string,
): Promise<void> {
  assertNewsletterWritesEnabled();
  if (await legacyBridge("confirm", token)) return;
  const listId = resolveListId();
  const existing = await findSubscriber(email);
  // During migration, an old token cannot create or confirm an unattributed
  // orphan, even if a new signup has since created its row. Project membership
  // must come from the reviewed transfer/legacy reconciliation first.
  const started = process.env.NEWSLETTER_MIGRATION_STARTED_AT;
  if (started) {
    const cutoff = Date.parse(started);
    if (!Number.isFinite(cutoff) || !Number.isFinite(tokenIssuedAt)) {
      throw new Error("Migration confirmation timing is invalid.");
    }
    if (
      (tokenIssuedAt as number) < cutoff &&
      !existing?.lists?.some((list) => list.id === listId)
    ) {
      throw new Error(
        "Legacy confirmation needs suppression reconciliation before adding membership.",
      );
    }
  }
  if (!existing) {
    await createSubscriber(email, [listId]);
    return;
  }
  if (existing.status !== "enabled") {
    throw new Error("Subscriber is suppressed; subscription cannot be confirmed.");
  }
  const membership = existing.lists?.find((list) => list.id === listId);
  if (membership?.subscription_status === "unsubscribed") {
    const unsubscribedAt = Date.parse(membership.subscription_updated_at ?? "");
    if (
      !Number.isFinite(unsubscribedAt) ||
      !Number.isFinite(tokenIssuedAt) ||
      (tokenIssuedAt as number) <= unsubscribedAt
    ) {
      throw new Error("Confirmation predates unsubscribe or consent timing is unknown.");
    }
  }
  await listmonkFetch("/api/subscribers/lists", {
    method: "PUT",
    body: JSON.stringify({
      ids: [existing.id],
      action: "add",
      target_list_ids: [listId],
      status: "confirmed",
    }),
  });
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
 * `ensureSubscriber` before sending the confirmation email.
 */
export async function sendTransactional(params: SendTransactionalParams): Promise<void> {
  assertNewsletterWritesEnabled();
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
      messenger: resolveMessenger(),
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
  assertNewsletterWritesEnabled();
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
      ...(process.env.LISTMONK_MESSENGER ? { messenger: resolveMessenger() } : {}),
    }),
  });

  const id = created.data.id;
  const url = `${baseUrl()}/admin/campaigns/${id}`;
  // The draft campaign already exists at this point. If the flip to
  // `running` fails, say so explicitly — a naive re-run of the send would
  // create a second campaign rather than starting this one.
  try {
    await listmonkFetch(`/api/campaigns/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "running" }),
    });
  } catch (err) {
    throw new Error(
      `Campaign ${id} was created but could not be started: ${
        err instanceof Error ? err.message : String(err)
      }. Do not re-run the send — that creates a second campaign. Start or delete campaign ${id} at ${url}.`,
      { cause: err },
    );
  }

  return { id, url };
}
