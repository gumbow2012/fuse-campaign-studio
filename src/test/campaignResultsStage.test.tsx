/**
 * Verifies the two customer scenarios the Results experience must get right:
 * a running campaign, and a TERMINAL campaign that is missing some outputs.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { normalizeLiveStatus } from "@/services/campaignLiveStatus";
import { buildSlots } from "@/components/results/resultSlots";

const fetchMock = vi.fn();

vi.mock("@/services/campaignLiveStatus", async () => {
  const actual = await vi.importActual<typeof import("@/services/campaignLiveStatus")>(
    "@/services/campaignLiveStatus",
  );
  return { ...actual, fetchCampaignLiveStatus: (id: string) => fetchMock(id) };
});
vi.mock("@/services/campaignEditor", () => ({ findEditProjectForRun: async () => null }));

const payload = (overrides: Record<string, unknown>) => ({
  job: {
    id: "job-1",
    status: "running",
    progress_pct: 53,
    phase: "mixed",
    headline: "Bringing your campaign to life",
    support: null,
    execution_complete: false,
  },
  active: [{ label: "Generating video clip 03", model: "Kling 3.0 Pro", node_type: "video", output_number: 3 }],
  recent: [],
  graph: [
    { id: "n1", media_type: "video", output_number: 1, model: null, status: "ready" },
    { id: "n2", media_type: "video", output_number: 2, model: null, status: "generating" },
    { id: "n3", media_type: "image", output_number: 3, model: null, status: "ready" },
    { id: "n4", media_type: "image", output_number: 4, model: null, status: "waiting" },
  ],
  outputs: {
    ready: 2,
    total: 4,
    needs_regeneration: 0,
    items: [
      { id: "o1", output_number: 1, media_type: "video", url: "https://x/clip1.mp4" },
      { id: "o3", output_number: 3, media_type: "image", url: "https://x/photo3.png" },
    ],
  },
  eta_seconds: 120,
  updated_at: null,
  ...overrides,
});

async function renderStage() {
  const { default: CampaignResultsStage } = await import("@/components/results/CampaignResultsStage");
  return render(
    <MemoryRouter>
      <CampaignResultsStage jobId="job-1" templateName="Group Meet" />
    </MemoryRouter>,
  );
}

describe("Results experience", () => {
  beforeEach(() => fetchMock.mockReset());

  it("slots fill by intended output number, not completion order", () => {
    const status = normalizeLiveStatus(payload({}), "job-1");
    const videos = buildSlots(status, "video");
    expect(videos.map((slot) => [slot.number, !!slot.item])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(buildSlots(status, "image").map((slot) => slot.number)).toEqual([3, 4]);
  });

  it("shows live activity and both sections while running", async () => {
    fetchMock.mockImplementation(async (id: string) => normalizeLiveStatus(payload({}), id));
    await renderStage();
    await waitFor(() => expect(screen.getByText(/Bringing your campaign to life/i)).toBeTruthy());
    expect(screen.getByText(/Generating video clip 03/i)).toBeTruthy();
    expect(screen.getByText(/1 \/ 2 clips ready/i)).toBeTruthy();
    expect(screen.getByText(/Photoshoot/i)).toBeTruthy();
    expect(screen.getByText(/About 2 min remaining/i)).toBeTruthy();
  });

  it("terminal missing-output campaigns read as ready with no failure copy", async () => {
    fetchMock.mockImplementation(async (id: string) =>
      normalizeLiveStatus(
        payload({
          job: {
            id: "job-1",
            status: "complete",
            progress_pct: 53,
            phase: "ready",
            headline: "Your campaign is ready",
            support: "2 outputs need another pass",
            execution_complete: true,
          },
          eta_seconds: null,
          active: [],
        }),
        id,
      ),
    );
    await renderStage();
    await waitFor(() => expect(screen.getByText(/Your campaign is ready/i)).toBeTruthy());
    expect(screen.getByText(/2 outputs need another pass/i)).toBeTruthy();
    expect(screen.getByText(/Complete/i)).toBeTruthy();
    expect(screen.queryByText(/interrupted|partial|failed|didn't finish/i)).toBeNull();
    expect(screen.queryByText(/min remaining/i)).toBeNull();
    /* Usable media stays reachable; missing slots stay calm. */
    expect(screen.getByText(/1 \/ 2 clips ready/i)).toBeTruthy();
    expect(screen.getAllByText(/Needs another pass/i).length).toBeGreaterThan(0);
  });
});
