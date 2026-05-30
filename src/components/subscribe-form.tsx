"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "already-subscribed" }
  | { kind: "error"; message: string };

// Same regex as the server (src/lib/newsletter/subscribe.ts) so client and
// server agree on what "looks like an email". The server is still
// authoritative — this is purely a UX layer that avoids a slow round-trip
// for obviously-malformed input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

type SubscribeFormProps = {
  variant?: "default" | "compact";
  submitLabel?: string;
  placeholder?: string;
  className?: string;
};

export function SubscribeForm({
  variant = "default",
  submitLabel,
  placeholder = "you@example.com",
  className,
}: SubscribeFormProps = {}) {
  const id = useId();
  const emailId = `${id}-newsletter-email`;
  const websiteId = `${id}-newsletter-website`;
  const inlineErrorId = `${id}-newsletter-email-error`;
  const [email, setEmail] = useState("");
  // Honeypot — wired but never shown to the user. Bots that fill every
  // input get filtered server-side before any ListMonk call.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Inline validation error, surfaced on blur. Kept separate from a
  // submit-time `status: error` so a transient format complaint doesn't
  // look like a server failure.
  const [formatError, setFormatError] = useState<string | null>(null);

  function handleEmailChange(value: string) {
    setEmail(value);
    // Stale messages disappear the moment the user starts fixing things.
    if (formatError !== null) setFormatError(null);
    if (status.kind === "error") setStatus({ kind: "idle" });
  }

  function handleEmailBlur() {
    if (email.trim().length === 0) {
      setFormatError(null);
      return;
    }
    setFormatError(looksLikeEmail(email) ? null : "That doesn't look like an email address.");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;

    if (!looksLikeEmail(email)) {
      setFormatError("That doesn't look like an email address.");
      return;
    }
    setFormatError(null);
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
      const data = (await res.json().catch(() => ({}))) as { alreadySubscribed?: boolean };
      setStatus({ kind: data.alreadySubscribed ? "already-subscribed" : "success" });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  const compact = variant === "compact";
  const buttonText = submitLabel ?? (compact ? "Join" : "Subscribe");

  if (status.kind === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-lg border border-[var(--border)] bg-[var(--accent)] text-sm",
          compact ? "p-3 text-xs" : "p-5",
          className,
        )}
      >
        <p className="font-medium">Check your inbox.</p>
        {!compact && (
          <p className="mt-1 text-[var(--muted-foreground)]">
            Tap the confirmation link to finish. Spam folder is the usual suspect if it doesn't
            surface.
          </p>
        )}
      </div>
    );
  }

  if (status.kind === "already-subscribed") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "rounded-lg border border-[var(--border)] bg-[var(--accent)] text-sm",
          compact ? "p-3 text-xs" : "p-5",
          className,
        )}
      >
        <p className="font-medium">You&apos;re already on the list.</p>
        {!compact && (
          <p className="mt-1 text-[var(--muted-foreground)]">
            That address is already a confirmed subscriber. Nothing to do. The next issue arrives at
            the usual cadence.
          </p>
        )}
      </div>
    );
  }

  const visibleError = formatError ?? (status.kind === "error" ? status.message : null);

  return (
    <form
      onSubmit={onSubmit}
      className={cn(compact ? "space-y-2" : "space-y-3", className)}
      noValidate
    >
      <label htmlFor={emailId} className="sr-only">
        Email address
      </label>
      <div className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={placeholder}
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          onBlur={handleEmailBlur}
          disabled={status.kind === "submitting"}
          aria-invalid={visibleError !== null}
          aria-describedby={visibleError !== null ? inlineErrorId : undefined}
          className={cn("flex-1", compact ? "h-9 min-w-0 text-sm" : "h-11 text-base")}
        />
        <Button
          type="submit"
          disabled={status.kind === "submitting" || email.trim().length === 0}
          className={cn(compact ? "h-9 shrink-0 px-3 text-xs" : "h-11 sm:w-auto")}
        >
          {status.kind === "submitting" ? "Sending..." : buttonText}
        </Button>
      </div>

      {/* Honeypot — visually hidden + aria-hidden + tab-skipped. Real users
          won't see it; bots that fill every input trip it server-side. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={websiteId}>Website</label>
        <input
          id={websiteId}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {visibleError !== null && (
        <p
          id={inlineErrorId}
          role="alert"
          aria-live="assertive"
          className="text-sm text-[var(--destructive,#b00020)]"
        >
          {visibleError}
        </p>
      )}

      {!compact && (
        <p className="text-xs text-[var(--muted-foreground)]">
          <em>A Drop of Beauty</em> - one email a week. The unsubscribe link sits at the bottom of
          every issue. Leave whenever.
        </p>
      )}
    </form>
  );
}
