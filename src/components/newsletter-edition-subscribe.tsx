"use client";

import { useEffect, useState } from "react";
import { isNewsletterEmailVisit, type SearchParamsLike } from "@/lib/newsletter/email-origin";
import { SubscribeForm } from "./subscribe-form";

function currentSearchParams(): SearchParamsLike {
  const out: SearchParamsLike = {};
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of params.entries()) {
    const current = out[key];
    if (current === undefined) {
      out[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      out[key] = [current, value];
    }
  }
  return out;
}

export function NewsletterEditionSubscribe() {
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setShowForm(!isNewsletterEmailVisit(currentSearchParams()));
  }, []);

  if (!showForm) return null;

  return (
    <section
      aria-label="Subscribe to new editions"
      className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--background)] p-5 md:p-6"
    >
      <h2 className="mb-3 font-serif text-2xl leading-tight">Subscribe to new editions</h2>
      <SubscribeForm />
    </section>
  );
}
