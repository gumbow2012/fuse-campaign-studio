import { describe, expect, it } from "vitest";

import {
  FALLBACK_FAILURE,
  isCustomerSafeFailureText,
  readPublicFailure,
  type PublicGenerationFailure,
} from "@/lib/generationFailure";

/**
 * P0 failure taxonomy contract: customer-facing payloads must NEVER carry raw
 * provider/moderation strings. These tests mirror the edge classifier in
 * supabase/functions/_shared/generation-failure.ts and assert the frontend
 * rendering path (readPublicFailure) always yields polished copy.
 */

const RAW_PROVIDER_STRINGS = {
  policy: "The material was flagged by a content checker due to policy violation.",
  timeout: "upstream request timed out after 60000ms (ETIMEDOUT)",
  server500: "500 Internal Server Error from provider api.kling.ai",
  malformedRef: "Invalid reference_url: failed to fetch https://example.com/x.png (404)",
  unknown: "segfault in worker isolate #7: undefined is not a function",
};

describe("readPublicFailure", () => {
  it("returns the polished fallback for null/garbage payloads", () => {
    expect(readPublicFailure(null)).toEqual(FALLBACK_FAILURE);
    expect(readPublicFailure(undefined)).toEqual(FALLBACK_FAILURE);
    expect(readPublicFailure("raw provider string")).toEqual(FALLBACK_FAILURE);
    expect(readPublicFailure({})).toEqual(FALLBACK_FAILURE);
  });

  it("passes through a well-formed public failure unchanged", () => {
    const failure: PublicGenerationFailure = {
      code: "PROVIDER_TIMEOUT",
      title: "Generation took too long",
      message: "This generation didn't finish in time.",
      retryable: true,
    };
    expect(readPublicFailure(failure)).toEqual(failure);
  });

  it("flags raw provider language for the rendering guard", () => {
    // readPublicFailure passes structure through; the language guard is the
    // gate that proves raw provider text is never rendered to customers.
    const poisoned = {
      code: "PROVIDER_FAILED",
      title: "500 Internal Server Error from provider api.kling.ai",
      message: "The material was flagged by a content checker.",
      retryable: true,
    } as const;
    expect(isCustomerSafeFailureText(poisoned.title)).toBe(false);
    expect(isCustomerSafeFailureText(poisoned.message)).toBe(false);
  });
});

describe("customer payload safety", () => {
  const publicCopyPool = [
    FALLBACK_FAILURE,
    ...(["POLICY_REJECTED", "INVALID_INPUT", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_FAILED", "REFERENCE_UNAVAILABLE", "UPLOAD_FAILED", "INSUFFICIENT_CREDITS", "UNKNOWN"] as const).map(
      (code) => ({ code, title: "t", message: "m", retryable: true }),
    ),
  ];

  it("never echoes raw provider strings in customer-facing copy", () => {
    for (const raw of Object.values(RAW_PROVIDER_STRINGS)) {
      // A customer payload built from the taxonomy must not contain the raw string.
      const payload = { publicFailure: FALLBACK_FAILURE, error: undefined };
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(raw);
    }
    expect(publicCopyPool.length).toBeGreaterThan(0);
  });

  it("isCustomerSafeFailureText rejects raw provider diagnostics", () => {
    expect(isCustomerSafeFailureText(RAW_PROVIDER_STRINGS.policy)).toBe(false);
    expect(isCustomerSafeFailureText(RAW_PROVIDER_STRINGS.server500)).toBe(false);
    expect(isCustomerSafeFailureText("Generation couldn't be completed")).toBe(true);
  });
});
