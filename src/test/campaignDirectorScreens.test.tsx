import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEmptyProject } from "@/lib/campaign-director/defaults";
import { normalizeShot } from "@/lib/campaign-director/state";
import type { DirectorProject } from "@/lib/campaign-director/types";
import ScriptEditor from "@/components/campaign-director/ScriptEditor";
import SimpleStart from "@/components/campaign-director/SimpleStart";
import FinalVideo from "@/components/campaign-director/FinalVideo";

vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "k",
  supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed.test/a.png" } }) }) }, auth: { getUser: async () => ({ data: { user: null } }) }, functions: { invoke: vi.fn() } },
}));

function project(): DirectorProject {
  const p = createEmptyProject();
  p.world.characters = [{ id: "c1", url: "https://x.supabase.co/storage/v1/object/public/fuse-assets/u/c.webp", kind: "character", label: "front" }];
  p.products = [{ id: "p1", name: "Lab Rats", artist: "", collab: "", flavor: "Electric Blue", imageUrl: "https://x.supabase.co/storage/v1/object/public/fuse-assets/u/a.png" }];
  p.shots = [
    normalizeShot({ id: "s1", title: "Lab door", action: "He walks into the lab.", productIds: ["p1"], productRole: "hero" }, 0),
    normalizeShot({ id: "s2", title: "Second", action: "A quiet street at dusk." }, 1),
  ];
  return p;
}

describe("campaign director screens", () => {
  it("script editor shows every shot, is editable, and previews the price", () => {
    render(<ScriptEditor project={project()} prices={{ imageUsd: 0.15, videoUsdPerSecond: 0.112 }} onUpdateShot={vi.fn()} onShotsChange={vi.fn()} onRequest={vi.fn()} />);
    expect(screen.getByDisplayValue("He walks into the lab.")).toBeTruthy();
    expect(screen.getByDisplayValue("A quiet street at dusk.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /generate 2 images \(\$0\.30\)/i })).toBeTruthy();
  });

  it("front door shows the drop zone, optional direction box and the design", () => {
    render(<SimpleStart project={project()} writing={false} onAddProduct={vi.fn()} onUpdateProduct={vi.fn()} onRemoveProduct={vi.fn()} onThemeChange={vi.fn()} onWrite={vi.fn()} />);
    expect(screen.getByText(/drag your mylar designs here/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/optional: any direction/i)).toBeTruthy();
    expect(screen.getByText("Lab Rats")).toBeTruthy();
  });

  it("final video panel counts finished clips, names the missing shots, and offers editor + zip", () => {
    const p = project();
    p.shots[0].video.url = "https://x.supabase.co/storage/v1/object/public/fuse-assets/u/campaign-director/p/a.mp4";
    render(<FinalVideo project={p} name="Spray" onOpenEditor={vi.fn()} />);
    expect(screen.getByText(/1 of 2 clips are finished/i)).toBeTruthy();
    expect(screen.getByText(/no clip yet for shot 2/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /edit and export final video/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /download all clips/i })).toBeTruthy();
  });
});
