import formData from "form-data";
import Mailgun from "mailgun.js";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** Lazy so importing this module during build doesn't need credentials. */
function getClient() {
  const mg = new Mailgun(formData);
  return mg.client({
    username: "api",
    key: required("MAILGUN_API_KEY"),
    // EU domains need "https://api.eu.mailgun.net". Default is the US endpoint.
    url: process.env.MAILGUN_API_URL ?? "https://api.mailgun.net",
  });
}

export type SendDigestParams = {
  subject: string;
  html: string;
  text: string;
  /** Preview / replyTo defaults to MAILGUN_FROM. */
  from?: string;
  /**
   * For mailing lists, Mailgun rewrites per-recipient. We send to the list
   * address (e.g. `weekly@mg.example.com`) and Mailgun fans it out.
   */
  to?: string;
};

export type SendResult = {
  id: string | null;
  message: string | null;
};

export async function sendDigest(params: SendDigestParams): Promise<SendResult> {
  const client = getClient();
  const domain = required("MAILGUN_DOMAIN");
  const from = params.from ?? required("MAILGUN_FROM");
  const to = params.to ?? required("MAILGUN_LIST");

  const res = await client.messages.create(domain, {
    from,
    to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    // Mailgun tracking / unsubscribe — harmless if the domain doesn't have
    // click tracking enabled, but the List-Unsubscribe header always helps.
    "o:tracking": "yes",
    "o:tracking-clicks": "htmlonly",
    "o:tracking-opens": "yes",
  });

  return {
    id: res.id ?? null,
    message: res.message ?? null,
  };
}
