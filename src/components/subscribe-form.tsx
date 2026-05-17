"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  // Honeypot — wired but never shown to the user. Bots that fill every
  // input get filtered server-side before any Mailgun call.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setStatus({
          kind: "error",
          message: data.message ?? "Something went wrong. Please try again.",
        });
        return;
      }
      setStatus({ kind: "success" });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)] p-5 text-sm">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-[var(--muted-foreground)]">
          A confirmation link is on its way. Click it within 48 hours to finish subscribing. If it
          doesn't arrive, check your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="newsletter-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status.kind === "submitting"}
          className="h-11 flex-1 text-base"
        />
        <Button
          type="submit"
          disabled={status.kind === "submitting" || email.trim().length === 0}
          className="h-11 sm:w-auto"
        >
          {status.kind === "submitting" ? "Sending…" : "Subscribe"}
        </Button>
      </div>

      {/* Honeypot — visually hidden + aria-hidden + tab-skipped. Real users
          won't see it; bots that fill every input trip it server-side. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="newsletter-website">Website</label>
        <input
          id="newsletter-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {status.kind === "error" && (
        <p role="alert" className="text-sm text-[var(--destructive,#b00020)]">
          {status.message}
        </p>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        One email per week. Unsubscribe any time — the link is in every issue.
      </p>
    </form>
  );
}
