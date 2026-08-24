import { describe, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import CinemaStudio from "@/pages/app/cinema/CinemaStudio";

describe("cinema", () => {
  it("renders", async () => {
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
  });
});
