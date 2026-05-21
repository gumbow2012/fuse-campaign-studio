import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public template studio access", () => {
  it("keeps the template studio browseable before sign-in", async () => {
    const appSource = await readFile(resolve(process.cwd(), "src/App.tsx"), "utf8");
    const shellSource = await readFile(resolve(process.cwd(), "src/components/mvp/SiteShell.tsx"), "utf8");
    const studioSource = await readFile(resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"), "utf8");

    expect(appSource).toContain('path="/app/templates" element={<TemplateStudioPage />}');
    expect(appSource).not.toContain('<CustomerRoute>\n                  <TemplateStudioPage />');
    expect(shellSource).toContain('<NavLink to="/app/templates" className={navLinkClass}>');
    expect(studioSource).toContain('queryFn: () => fetchTemplates("")');
  });

  it("requires auth before paid or executable template actions", async () => {
    const studioSource = await readFile(resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"), "utf8");
    const billingSource = await readFile(resolve(process.cwd(), "src/pages/mvp/BillingPage.tsx"), "utf8");

    expect(studioSource).toContain('navigate("/auth?mode=signup", { state: { redirectTo: "/app/templates" } })');
    expect(studioSource).toContain('{submitting || isRunning ? "Running..." : user ? "Run template" : "Sign in to run"}');
    expect(studioSource).toContain("enabled: !!user");
    expect(billingSource).toContain('navigate("/auth?mode=signup")');
  });
});
