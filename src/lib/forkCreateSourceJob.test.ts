import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
  SUPABASE_URL: "https://example.test",
  SUPABASE_PUBLISHABLE_KEY: "anon",
}));

import { createFork, estimateForkRun } from "@/services/templateForks";

describe("TR10b create_fork / estimate_fork_run payloads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("create_fork stores the sourceJobId in the request body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => new Response(JSON.stringify({ forkId: "fork-1" })));
    vi.stubGlobal("fetch", fetchMock);

    await createFork("template-1", { sourceJobId: "job-9" });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toMatchObject({ action: "create_fork", templateId: "template-1", sourceJobId: "job-9" });
  });

  it("omits sourceJobId when there is no originating run", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => new Response(JSON.stringify({ forkId: "fork-1" })));
    vi.stubGlobal("fetch", fetchMock);

    await createFork("template-1");

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body.sourceJobId).toBeUndefined();
  });

  it("estimate_fork_run reads the server-authoritative credit estimate", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => new Response(JSON.stringify({ estimatedCredits: 315 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(estimateForkRun("fork-1")).resolves.toEqual({ estimatedCredits: 315 });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body));
    expect(body).toEqual({ action: "estimate_fork_run", forkId: "fork-1" });
  });
});
