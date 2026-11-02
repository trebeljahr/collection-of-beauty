import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pinned before importing the module under test — token mint/verify reads
// the env at call time, but defensive in case that ever changes.
process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-do-not-use-in-prod";

import {
  _rateLimitBuckets,
  _resetRateLimit,
  CONFIRM_TOKEN_TTL_MS,
  checkRateLimit,
  mintConfirmToken,
  mintUnsubscribeToken,
  normalizeEmail,
  verifyConfirmToken,
  verifyUnsubscribeToken,
} from "./subscribe";

describe("unsubscribe token", () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
  });

  it("round-trips to the lowercased address", () => {
    expect(verifyUnsubscribeToken(mintUnsubscribeToken("A@B.com"))).toBe("a@b.com");
  });

  it("does not show the address to whoever reads the URL", () => {
    const decoded = Buffer.from(mintUnsubscribeToken("a@b.com"), "base64url").toString("latin1");
    expect(decoded).not.toContain("a@b.com");
  });

  it("still works years later, as an old edition's link has to", () => {
    const token = mintUnsubscribeToken("a@b.com");
    vi.useFakeTimers({ now: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 });
    expect(verifyUnsubscribeToken(token)).toBe("a@b.com");
  });

  it("rejects a changed token, garbage and a token from another secret", () => {
    const token = mintUnsubscribeToken("a@b.com");
    const raw = Buffer.from(token, "base64url");
    raw[raw.length - 1] ^= 1;
    expect(verifyUnsubscribeToken(raw.toString("base64url"))).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("garbage")).toBeNull();

    process.env.NEWSLETTER_TOKEN_SECRET = "another-secret";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("cannot stand in for a confirm token, or the reverse", () => {
    expect(verifyConfirmToken(mintUnsubscribeToken("a@b.com")).ok).toBe(false);
    expect(verifyUnsubscribeToken(mintConfirmToken("a@b.com"))).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases + trims a valid address", () => {
    expect(normalizeEmail("  Foo@Bar.Com  ")).toBe("foo@bar.com");
  });

  it("rejects missing pieces", () => {
    expect(normalizeEmail("foo")).toBeNull();
    expect(normalizeEmail("foo@")).toBeNull();
    expect(normalizeEmail("foo@bar")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("  ")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("rejects whitespace inside the address", () => {
    expect(normalizeEmail("foo @bar.com")).toBeNull();
    expect(normalizeEmail("foo@b ar.com")).toBeNull();
  });
});

describe("confirm token", () => {
  it("round-trips a fresh token", () => {
    const now = Date.now();
    const tok = mintConfirmToken("a@b.com", now);
    const res = verifyConfirmToken(tok, now);
    expect(res).toEqual({ ok: true, email: "a@b.com", issuedAt: now });
  });

  it("rejects a tampered signature", () => {
    const tok = mintConfirmToken("a@b.com");
    const tampered = `${tok.slice(0, -2)}XX`;
    expect(verifyConfirmToken(tampered)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects malformed input", () => {
    expect(verifyConfirmToken("garbage")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyConfirmToken("a.b.c")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an expired token", () => {
    const issuedAt = 1_000_000;
    const tok = mintConfirmToken("a@b.com", issuedAt);
    const afterExpiry = issuedAt + CONFIRM_TOKEN_TTL_MS + 1;
    expect(verifyConfirmToken(tok, afterExpiry)).toEqual({ ok: false, reason: "expired" });
  });

  it("does not show the address to whoever reads the URL", () => {
    const decoded = Buffer.from(mintConfirmToken("a@b.com"), "base64url").toString("latin1");
    expect(decoded).not.toContain("a@b.com");
  });

  it("rejects a token from another secret", () => {
    const tok = mintConfirmToken("a@b.com");
    process.env.NEWSLETTER_TOKEN_SECRET = "another-secret";
    expect(verifyConfirmToken(tok)).toEqual({ ok: false, reason: "bad_signature" });
    process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
  });

  describe("as emails carried it until November 2026", () => {
    function signedToken(issuedAt: number, secret = "test-secret-do-not-use-in-prod"): string {
      const payload = Buffer.from(
        JSON.stringify({ e: "a@b.com", x: issuedAt + CONFIRM_TOKEN_TTL_MS }),
      ).toString("base64url");
      return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    }

    it("still verifies, with the date it was issued", () => {
      const now = Date.now();
      expect(verifyConfirmToken(signedToken(now), now)).toEqual({
        ok: true,
        email: "a@b.com",
        issuedAt: now,
      });
    });

    it("still expires", () => {
      const issuedAt = 1_000_000;
      expect(
        verifyConfirmToken(signedToken(issuedAt), issuedAt + CONFIRM_TOKEN_TTL_MS + 1),
      ).toEqual({ ok: false, reason: "expired" });
    });

    it("rejects a changed signature and another secret's", () => {
      const now = Date.now();
      expect(verifyConfirmToken(`${signedToken(now).slice(0, -2)}XX`, now)).toEqual({
        ok: false,
        reason: "bad_signature",
      });
      expect(verifyConfirmToken(signedToken(now, "another-secret"), now)).toEqual({
        ok: false,
        reason: "bad_signature",
      });
    });
  });
});

describe("rate limiter", () => {
  beforeEach(() => _resetRateLimit());

  it("allows up to the burst limit then blocks", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("1.2.3.4")).toBe(true);
    }
    expect(checkRateLimit("1.2.3.4")).toBe(false);
  });

  it("buckets IPs independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4");
    expect(checkRateLimit("5.6.7.8")).toBe(true);
  });

  it("resets after the window elapses", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit("9.9.9.9", t0);
    expect(checkRateLimit("9.9.9.9", t0)).toBe(false);
    expect(checkRateLimit("9.9.9.9", t0 + 60_001)).toBe(true);
  });

  describe("holding an address", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    // /privacy: held "for the configured window (currently 60 seconds) and
    // then discarded", with no later request needed to discard it.
    it("discards an address when its window ends", () => {
      checkRateLimit("1.2.3.4");
      vi.advanceTimersByTime(59_999);
      expect(_rateLimitBuckets()).toBe(1);
      vi.advanceTimersByTime(1);
      expect(_rateLimitBuckets()).toBe(0);
    });

    // A busy event loop runs the delete late, after a request opened a new window.
    it("leaves a newer window alone when an old delete runs late", () => {
      const t0 = Date.now();
      checkRateLimit("1.2.3.4", t0);
      vi.advanceTimersByTime(30_000);
      checkRateLimit("1.2.3.4", t0 + 60_001);
      vi.advanceTimersByTime(30_000);
      expect(_rateLimitBuckets()).toBe(1);
      vi.advanceTimersByTime(30_000);
      expect(_rateLimitBuckets()).toBe(0);
    });
  });
});
