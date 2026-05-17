import { beforeEach, describe, expect, it } from "vitest";

// Pinned before importing the module under test — token mint/verify reads
// the env at call time, but defensive in case that ever changes.
process.env.NEWSLETTER_TOKEN_SECRET = "test-secret-do-not-use-in-prod";

import {
  _resetRateLimit,
  CONFIRM_TOKEN_TTL_MS,
  checkRateLimit,
  mintConfirmToken,
  normalizeEmail,
  verifyConfirmToken,
} from "./subscribe";

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
    const tok = mintConfirmToken("a@b.com");
    const res = verifyConfirmToken(tok);
    expect(res).toEqual({ ok: true, email: "a@b.com" });
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
});
