/**
 * PDP gallery: video items must render in the main viewer and the thumbnail
 * strip even when the backend returns no poster_url.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CampaignMediaGallery from "@/components/templates/CampaignMediaGallery";
import type { TemplateGalleryItem } from "@/services/templateDetailPage";

vi.mock("@/hooks/useClipPosters", () => ({
  __esModule: true,
  default: () => ({}),
  useClipPosters: () => ({}),
}));

const item = (
  id: string,
  media_type: "image" | "video",
): TemplateGalleryItem => ({
  id,
  media_type,
  url: `https://media.test/${id}.${media_type === "video" ? "mp4" : "jpg"}`,
  poster_url: null,
  label: null,
  category: null,
  is_primary: false,
});

describe("CampaignMediaGallery", () => {
  it("renders a video hero and keeps every item in the strip", () => {
    const items = [item("v1", "video"), item("i1", "image"), item("i2", "image")];
    const { container } = render(<CampaignMediaGallery items={items} name="Warehouse" />);

    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.getAttribute("src")).toContain("v1.mp4");
    expect(screen.getAllByLabelText(/^Preview \d+$/)).toHaveLength(3);
  });
});
