import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import CinemaStudio from "@/pages/app/cinema/CinemaStudio";

describe("cinema", () => {
  it("renders", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <CinemaStudio />
        </MemoryRouter>
      </HelmetProvider>,
    );
  });
});
