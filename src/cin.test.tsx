import { describe, it, expect } from "vitest";
describe("cinema", () => {
  it("imports", async () => {
    const m = await import("@/pages/app/cinema/CinemaStudio");
    expect(m.default).toBeTruthy();
  });
});
