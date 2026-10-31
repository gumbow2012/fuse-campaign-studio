import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TemplateInputCard from "@/components/templates/TemplateInputCard";
import { CampaignAssetGroupCard } from "@/components/templates/CampaignAssetGroup";
import type { CampaignInputGroup } from "@/lib/campaignInputGroups";

vi.mock("@/lib/uploadChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadChecks")>();
  return { ...actual, runUploadChecks: vi.fn(() => new Promise(() => undefined)) };
});

const png = (name: string) => new File(["x"], name, { type: "image/png" });
const txt = new File(["x"], "notes.txt", { type: "text/plain" });

describe("template drop zones", () => {
  it("an empty slot takes the first dropped image and ignores other files", () => {
    const onFileChange = vi.fn();
    render(<TemplateInputCard label="Brand logo" file={null} onFileChange={onFileChange} />);
    const zone = screen.getByText("Drag Brand logo here").closest("button")!;
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(screen.getByText("Drop it here")).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: { files: [txt, png("logo.png")] } });
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0].name).toBe("logo.png");
  });

  it("a group card hands every dropped image to the page, in order", () => {
    const onDropFiles = vi.fn();
    const group = { id: "hats", label: "Hats", multi: true, requiredKeys: ["h1"], members: [] } as unknown as CampaignInputGroup;
    render(<CampaignAssetGroupCard group={group} filledCount={0} totalCount={4} ready={false} preview={null} onOpen={vi.fn()} onDropFiles={onDropFiles} />);
    const card = screen.getByRole("button");
    fireEvent.drop(card, { dataTransfer: { files: [png("a.png"), txt, png("b.png")] } });
    expect(onDropFiles).toHaveBeenCalledTimes(1);
    expect(onDropFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(["a.png", "b.png"]);
  });
});
