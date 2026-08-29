import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("credit top-up surface", () => {
  it("shows quick credit packs when a customer has zero credits", async () => {
    const shellSource = await readFile(resolve(process.cwd(), "src/components/mvp/SiteShell.tsx"), "utf8");
    const studioSource = await readFile(resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"), "utf8");
    const dialogSource = await readFile(resolve(process.cwd(), "src/components/mvp/CreditPackDialog.tsx"), "utf8");

    expect(shellSource).toContain("shouldShowCreditTopUp");
    expect(shellSource).toContain("<CreditPackDialog");
    expect(studioSource).toContain("showTopUp={!!user && !!profile && !isPrivilegedUser && hasActiveMembership && displayedCreditBalance <= 0}");
    expect(dialogSource).toContain('supabase.functions.invoke("create-credit-checkout"');
    expect(dialogSource).toContain("Quick buy one-time credit packs");
    // The client submits ONLY the credits integer — never a price or pack key.
    expect(dialogSource).toContain("body: { credits }");
    expect(dialogSource).not.toMatch(/coming soon/i);
  });

  it("keeps membership as the single public billing nav surface", async () => {
    const shellSource = await readFile(resolve(process.cwd(), "src/components/mvp/SiteShell.tsx"), "utf8");
    const appSource = await readFile(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(shellSource).toContain("Membership");
    expect(shellSource).not.toContain(">Billing<");
    expect(appSource).toContain('path="/billing" element={<Navigate to="/pricing" replace />}');
  });
});
