import { describe, expect, it } from "vitest";

// The edge classifier is zero-dependency TypeScript — import it directly so the
// frontend tests pin the exact backend contract customers rely on.
import {
  classifyProviderFailure,
  publicGenerationFailure,
  toPublicGenerationFailure,
} from "../../supabase/functions/_shared/generation-failure";

describe("classifyProviderFailure", () => {
  it("maps timeouts to PROVIDER_TIMEOUT", () => {
    expect(classifyProviderFailure({ rawError: "upstream request timed out after 60000ms" })).toBe("PROVIDER_TIMEOUT");
    expect(classifyProviderFailure({ rawError: null, httpStatus: 504 })).toBe("PROVIDER_TIMEOUT");
    expect(classifyProviderFailure({ rawError: "deadline exceeded while waiting for provider" })).toBe("PROVIDER_TIMEOUT");
  });

  it("maps a bare 500 to PROVIDER_FAILED — never policy", () => {
    expect(classifyProviderFailure({ rawError: "500 Internal Server Error" })).toBe("PROVIDER_FAILED");
    expect(classifyProviderFailure({ rawError: null, httpStatus: 500 })).toBe("PROVIDER_FAILED");
  });

  it("maps malformed/unreadable references to input errors", () => {
    expect(classifyProviderFailure({ rawError: "invalid image url supplied in reference" })).toBe("INVALID_INPUT");
    expect(classifyProviderFailure({ rawError: "failed to fetch image from the provided reference url" })).toBe("REFERENCE_UNAVAILABLE");
  });

  it("maps explicit policy evidence to POLICY_REJECTED", () => {
    expect(classifyProviderFailure({ rawError: "the material was flagged by a content checker" })).toBe("POLICY_REJECTED");
    expect(classifyProviderFailure({ rawError: "request rejected by the safety system: nsfw content policy" })).toBe("POLICY_REJECTED");
    expect(classifyProviderFailure({ rawError: "content was flagged for a policy violation" })).toBe("POLICY_REJECTED");
  });

  it("never infers POLICY_REJECTED from ambiguous failures", () => {
    expect(classifyProviderFailure({ rawError: "generation failed" })).toBe("PROVIDER_FAILED");
    expect(classifyProviderFailure({ rawError: "provider failed with status 422" })).toBe("PROVIDER_FAILED");
    expect(classifyProviderFailure({ rawError: "segfault in worker isolate #7: undefined is not a function" })).toBe("PROVIDER_FAILED");
    expect(classifyProviderFailure({ rawError: null, httpStatus: 400 })).toBe("PROVIDER_FAILED");
  });

  it("maps empty evidence to UNKNOWN", () => {
    expect(classifyProviderFailure({ rawError: null })).toBe("UNKNOWN");
    expect(classifyProviderFailure({ rawError: "" })).toBe("UNKNOWN");
  });
});

describe("publicGenerationFailure — customer payload safety", () => {
  const rawStrings = [
    "upstream request timed out after 60000ms",
    "500 Internal Server Error from provider api.kling.ai",
    "invalid image url supplied in reference",
    "segfault in worker isolate #7: undefined is not a function",
    "the material was flagged by a content checker",
  ];

  it("customer copy never contains the raw provider string", () => {
    for (const raw of rawStrings) {
      const publicFailure = toPublicGenerationFailure({ rawError: raw });
      const customerPayload = JSON.stringify({ publicFailure }); // customer branch: no `error` field
      expect(customerPayload).not.toContain(raw);
    }
  });

  it("policy copy uses guideline language only", () => {
    const failure = publicGenerationFailure("POLICY_REJECTED");
    const text = `${failure.title} ${failure.message}`.toLowerCase();
    for (const forbidden of ["flagged", "content checker", "moderation", "safety detector", "violation"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(text).toContain("guidelines");
  });

  it("INSUFFICIENT_CREDITS is not retryable; others are", () => {
    expect(publicGenerationFailure("INSUFFICIENT_CREDITS").retryable).toBe(false);
    expect(publicGenerationFailure("PROVIDER_FAILED").retryable).toBe(true);
    expect(publicGenerationFailure("POLICY_REJECTED").retryable).toBe(true);
  });
});
