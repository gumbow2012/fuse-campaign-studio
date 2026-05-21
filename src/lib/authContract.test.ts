import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth page contract", () => {
  const authPageSource = () => readFile(
    resolve(process.cwd(), "src/pages/mvp/AuthPage.tsx"),
    "utf8",
  );

  it("keeps email-code auth while adding Google OAuth", async () => {
    const source = await authPageSource();

    expect(source).toContain("supabase.auth.signInWithOtp");
    expect(source).toContain("supabase.auth.verifyOtp");
    expect(source).toContain("supabase.auth.signInWithOAuth");
    expect(source).toContain('provider: "google"');
    expect(source).toContain('redirectTo: getAbsoluteSiteUrl("/auth")');
    expect(source).toContain("Continue with Google");
  });
});
