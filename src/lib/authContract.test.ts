import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth page contract", () => {
  const authPageSource = () => readFile(
    resolve(process.cwd(), "src/components/auth/UniversalAuthPanel.tsx"),
    "utf8",
  );

  it("keeps email + password auth alongside Google OAuth", async () => {
    const source = await authPageSource();

    expect(source).toContain("supabase.auth.signUp");
    expect(source).toContain("supabase.auth.signInWithPassword");
    expect(source).toContain("supabase.auth.resetPasswordForEmail");
    expect(source).toContain("supabase.auth.signInWithOAuth");
    expect(source).toContain('provider: "google"');
    expect(source).toContain("redirectTo: oauthRedirectTo");
    expect(source).toContain("Continue with Google");
  });
});
