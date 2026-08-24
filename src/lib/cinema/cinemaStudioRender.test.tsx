import { describe, it, expect } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import CinemaStudio from "@/pages/app/cinema/CinemaStudio";

(globalThis as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
(globalThis as any).DOMRect = (globalThis as any).DOMRect ?? class {};

describe("cinema", () => {
  it("renders and opens every chip", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <HelmetProvider>
          <MemoryRouter>
            <CinemaStudio />
          </MemoryRouter>
        </HelmetProvider>,
      );
    });
    expect(document.body.textContent).toContain("FUSE Cinema");
    const chips = Array.from(document.querySelectorAll("button")).filter((b) =>
      ["References","Presets","Film Setup","Camera","Movement","Composition","Lighting","Color","Optics","Atmosphere"]
        .some((l) => b.textContent?.includes(l)),
    );
    expect(chips.length).toBeGreaterThanOrEqual(10);
    for (const chip of chips) {
      await act(async () => {
        chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
  });
});
