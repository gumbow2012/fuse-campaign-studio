import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BulkReferenceDrop from "@/components/campaigns/BulkReferenceDrop";
import type { CampaignField } from "@/lib/campaignFields";

vi.mock("@/lib/uploadChecks", () => ({ runUploadChecks: vi.fn(async () => ({ state: "ready", warnings: [], notChecked: [] })) }));
vi.mock("@/services/sortReferences", () => ({
  sortReferencePhotos: vi.fn(async (files: File[]) =>
    files.map((file) => ({ file, slotId: file.name.startsWith("front") ? "front" : file.name.startsWith("back") ? "back" : null, seen: "" })),
  ),
}));

const field = (id: string, label: string): CampaignField => ({ id, label, category: "accessory", kind: "image", required: true, helper: "", accept: "image/*" });
const png = (name: string) => new File(["x"], name, { type: "image/png" });

describe("drop all photos at once", () => {
  it("puts each photo in the slot it shows and names the ones it could not place", async () => {
    const onFileChange = vi.fn();
    render(<BulkReferenceDrop fields={[field("front", "Front"), field("back", "Back")]} files={{}} assets={{}} onFileChange={onFileChange} />);
    fireEvent.drop(screen.getByText("Drop all your photos at once").closest("button")!, {
      dataTransfer: { files: [png("back.png"), png("front.png"), png("random.png")] },
    });
    await waitFor(() => expect(onFileChange).toHaveBeenCalledTimes(2));
    expect(onFileChange.mock.calls.map(([slot, file]) => [slot, file.name])).toEqual([["back", "back.png"], ["front", "front.png"]]);
    expect(await screen.findByText(/Placed 2 of 3\. Couldn't place random\.png/)).toBeTruthy();
  });
});

import CampaignReferenceRow from "@/components/campaigns/CampaignReferenceRow";

describe("AI fill on an empty view row", () => {
  it("shows the generated view for approval and only uses it on 'Use it'", async () => {
    const use = vi.fn();
    const generate = vi.fn(async () => "https://cdn.test/back.png");
    render(
      <CampaignReferenceRow
        field={field("back", "Back")}
        file={null}
        onFileChange={vi.fn()}
        onClear={vi.fn()}
        fill={{ credits: 4, blocked: null, generate, use }}
      />,
    );
    fireEvent.click(screen.getByText(/Generate from your hat · 4 credits/));
    expect(await screen.findByText(/AI-made from your photos \(4 credits used\)/)).toBeTruthy();
    expect(use).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Use it"));
    expect(use).toHaveBeenCalledWith("https://cdn.test/back.png");
  });

  it("is disabled with a reason when the customer is signed out", () => {
    render(
      <CampaignReferenceRow field={field("back", "Back")} file={null} onFileChange={vi.fn()} onClear={vi.fn()} fill={{ credits: 4, blocked: "Sign in to generate it.", generate: vi.fn(), use: vi.fn() }} />,
    );
    expect((screen.getByText(/Generate from your hat/).closest("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Sign in to generate it.")).toBeTruthy();
  });
});
