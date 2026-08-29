import { describe, expect, it, vi } from "vitest";
import {
  performOutputRegeneration,
  refundRegenCreditsIfNeeded,
  RegenerationError,
} from "../../supabase/functions/_shared/regeneration-run";
import {
  assertRegenerationAccess,
  resolveRegenerationSubgraphFromGraph,
  type RegenEdge,
  type RegenNode,
  type RegenStep,
} from "../../supabase/functions/_shared/regeneration";

// ---------------------------------------------------------------- fake client
type Row = Record<string, any>;

function matchIlike(value: unknown, pattern: string) {
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`,
    "i",
  );
  return regex.test(String(value ?? ""));
}

function makeClient(tables: Record<string, Row[]>) {
  const rpcCalls: Array<{ fn: string; args: Row }> = [];
  const ops: string[] = [];

  class Query {
    table: string;
    mode: "read" | "insert" | "update" = "read";
    payload: Row | null = null;
    filters: Array<(row: Row) => boolean> = [];
    sort: { col: string; asc: boolean } | null = null;
    cap: number | null = null;

    constructor(table: string) {
      this.table = table;
    }
    select() {
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push((row) => String(row[col] ?? "") === String(val ?? ""));
      return this;
    }
    lt(col: string, val: number) {
      this.filters.push((row) => Number(row[col]) < val);
      return this;
    }
    in(col: string, arr: unknown[]) {
      const set = new Set(arr.map(String));
      this.filters.push((row) => set.has(String(row[col])));
      return this;
    }
    ilike(col: string, pattern: string) {
      this.filters.push((row) => matchIlike(row[col], pattern));
      return this;
    }
    order(col: string, opts?: { ascending?: boolean }) {
      this.sort = { col, asc: opts?.ascending !== false };
      return this;
    }
    limit(n: number) {
      this.cap = n;
      return this;
    }
    insert(payload: Row) {
      this.mode = "insert";
      this.payload = payload;
      return this;
    }
    update(payload: Row) {
      this.mode = "update";
      this.payload = payload;
      return this;
    }
    rows() {
      const all = tables[this.table] ?? (tables[this.table] = []);
      let rows = all.filter((row) => this.filters.every((fn) => fn(row)));
      if (this.sort) {
        const { col, asc } = this.sort;
        rows = [...rows].sort((a, b) =>
          asc ? Number(a[col] ?? 0) - Number(b[col] ?? 0) : Number(b[col] ?? 0) - Number(a[col] ?? 0)
        );
      }
      if (this.cap != null) rows = rows.slice(0, this.cap);
      return rows;
    }
    run() {
      if (this.mode === "insert") {
        const row = { id: `row-${Math.random().toString(36).slice(2, 8)}`, ...this.payload };
        (tables[this.table] ?? (tables[this.table] = [])).push(row);
        ops.push(`insert:${this.table}`);
        return { data: [row], error: null };
      }
      if (this.mode === "update") {
        const rows = this.rows();
        for (const row of rows) Object.assign(row, this.payload);
        ops.push(`update:${this.table}`);
        return { data: rows, error: null };
      }
      return { data: this.rows(), error: null };
    }
    maybeSingle() {
      const result = this.run();
      return Promise.resolve({ data: (result.data as Row[])[0] ?? null, error: null });
    }
    then(resolve: (value: any) => unknown) {
      return Promise.resolve(this.run()).then(resolve);
    }
  }

  const client = {
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      if (fn === "apply_credit_transaction") {
        const profile = (tables.profiles ?? []).find(
          (row) => String(row.user_id) === String(args.p_user_id),
        );
        if (profile) profile.credits_balance = Number(profile.credits_balance) + Number(args.p_amount);
        const ledger = {
          id: `ledger-${(tables.credit_ledger ?? []).length + 1}`,
          user_id: args.p_user_id,
          type: args.p_type,
          amount: args.p_amount,
          description: args.p_description,
        };
        (tables.credit_ledger ?? (tables.credit_ledger = [])).push(ledger);
        return {
          data: [{ ledger_id: ledger.id, new_balance: profile?.credits_balance ?? 0 }],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  return { client, tables, rpcCalls, ops };
}

// ------------------------------------------------------------------- fixtures
const nodes: RegenNode[] = [
  { id: "input", node_type: "user_input" },
  { id: "imageA", node_type: "image_gen", prompt_config: { output_exposed: false } },
  { id: "videoA", node_type: "video_gen", prompt_config: { output_exposed: true } },
];
const edges: RegenEdge[] = [
  { source_node_id: "input", target_node_id: "imageA" },
  { source_node_id: "imageA", target_node_id: "videoA" },
];
const steps: RegenStep[] = [
  { node_id: "input", status: "complete", output_asset_id: "asset-input" },
  { node_id: "imageA", status: "complete", output_asset_id: "asset-image" },
  { node_id: "videoA", status: "complete", output_asset_id: "asset-video" },
];

function estimateFor(nodeId: string) {
  return resolveRegenerationSubgraphFromGraph({ nodes, edges, steps, target: { nodeId } });
}

function seed(balance = 10000) {
  return makeClient({
    execution_jobs: [
      {
        id: "job-1",
        user_id: "user-1",
        template_id: "tpl-1",
        version_id: "v-1",
        status: "complete",
        result_payload: {},
        progress: 100,
      },
    ],
    execution_steps: [
      { id: "step-input", job_id: "job-1", node_id: "input", status: "complete", output_asset_id: "asset-input" },
      { id: "step-image", job_id: "job-1", node_id: "imageA", status: "complete", output_asset_id: "asset-image" },
      { id: "step-video", job_id: "job-1", node_id: "videoA", status: "complete", output_asset_id: "asset-video" },
    ],
    assets: [
      { id: "asset-image", supabase_storage_url: "https://cdn/img.png", asset_type: "image" },
      { id: "asset-video", supabase_storage_url: "https://cdn/vid.mp4", asset_type: "video" },
    ],
    profiles: [{ user_id: "user-1", credits_balance: balance }],
    credit_ledger: [],
    output_revisions: [],
  });
}

describe("TR7 regenerate_output execution", () => {
  it("charges exactly the server estimate, never a client value", async () => {
    const env = seed();
    const estimate = estimateFor("videoA");
    // pretend the client tried to pay 1 credit
    (estimate as any).clientQuotedCredits = 1;

    const result = await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate,
      userId: "user-1",
      privileged: false,
      idempotencyKey: "key-a",
      runGraphJob: async () => undefined,
    });

    expect(result.estimatedCredits).toBe(estimate.estimatedCredits);
    const debits = env.tables.credit_ledger.filter((row) => row.amount < 0);
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(-estimate.estimatedCredits);
    expect(debits[0].type).toBe("rerun_step");
    expect(debits[0].description).toContain("(regen job-1 rev 1)");
    expect(result.ledgerId).toBeTruthy();
  });

  it("is idempotent — a duplicate key does not charge or reset twice", async () => {
    const env = seed();
    const run = vi.fn(async () => undefined);
    const first = await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate: estimateFor("videoA"),
      userId: "user-1",
      privileged: false,
      idempotencyKey: "key-dup",
      runGraphJob: run,
    });
    const second = await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate: estimateFor("videoA"),
      userId: "user-1",
      privileged: false,
      idempotencyKey: "key-dup",
      runGraphJob: run,
    });

    expect(second.idempotent).toBe(true);
    expect(second.revision).toBe(first.revision);
    expect(env.tables.credit_ledger.filter((row) => row.amount < 0)).toHaveLength(1);
    expect(env.tables.output_revisions).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("snapshots the old output before resetting and leaves upstream complete", async () => {
    const env = seed();
    await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate: estimateFor("videoA"),
      userId: "user-1",
      privileged: false,
      idempotencyKey: "key-snap",
      runGraphJob: async () => undefined,
    });

    // snapshot preserves the previous asset + url
    expect(env.tables.output_revisions).toHaveLength(1);
    const revision = env.tables.output_revisions[0];
    expect(revision).toMatchObject({
      job_id: "job-1",
      node_id: "videoA",
      step_id: "step-video",
      asset_id: "asset-video",
      output_url: "https://cdn/vid.mp4",
      output_type: "video",
      revision: 1,
    });
    // insert happened before the reset update of execution_steps
    expect(env.ops.indexOf("insert:output_revisions"))
      .toBeLessThan(env.ops.lastIndexOf("update:execution_steps"));

    const stepById = new Map(env.tables.execution_steps.map((row) => [row.id, row]));
    expect(stepById.get("step-video")).toMatchObject({ status: "pending", output_asset_id: null });
    expect(stepById.get("step-image")).toMatchObject({ status: "complete", output_asset_id: "asset-image" });
    expect(stepById.get("step-input")).toMatchObject({ status: "complete" });
    expect(env.tables.execution_jobs[0].status).toBe("running");
    // old asset row is never deleted
    expect(env.tables.assets.some((row) => row.id === "asset-video")).toBe(true);
  });

  it("rejects insufficient credits with no charge and no reset", async () => {
    const env = seed(1);
    await expect(
      performOutputRegeneration(env.client, {
        jobId: "job-1",
        estimate: estimateFor("videoA"),
        userId: "user-1",
        privileged: false,
        idempotencyKey: "key-broke",
        runGraphJob: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    expect(env.tables.credit_ledger).toHaveLength(0);
    expect(env.tables.output_revisions).toHaveLength(0);
    expect(env.tables.execution_steps.every((row) => row.status === "complete")).toBe(true);
  });

  it("rejects a non-owner", () => {
    expect(() =>
      assertRegenerationAccess({ jobUserId: "user-1", userId: "intruder", roles: [] })
    ).toThrow("Forbidden");
  });

  it("refunds the regen debit when the run fails synchronously", async () => {
    const env = seed();
    await expect(
      performOutputRegeneration(env.client, {
        jobId: "job-1",
        estimate: estimateFor("videoA"),
        userId: "user-1",
        privileged: false,
        idempotencyKey: "key-fail",
        runGraphJob: async () => {
          throw new Error("provider exploded");
        },
      }),
    ).rejects.toThrow("provider exploded");

    const refunds = env.tables.credit_ledger.filter((row) => row.type === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(estimateFor("videoA").estimatedCredits);
    expect(env.tables.profiles[0].credits_balance).toBe(10000);
  });

  it("regen refund is idempotent and ignores original-run debits", async () => {
    const env = seed();
    env.tables.credit_ledger.push({
      id: "ledger-run",
      user_id: "user-1",
      type: "run_template",
      amount: -900,
      description: "Run template: Paparazzi (job-1)",
    });
    await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate: estimateFor("videoA"),
      userId: "user-1",
      privileged: false,
      idempotencyKey: "key-refund",
      runGraphJob: async () => undefined,
    });

    await refundRegenCreditsIfNeeded(env.client, { jobId: "job-1" });
    await refundRegenCreditsIfNeeded(env.client, { jobId: "job-1" });

    const refunds = env.tables.credit_ledger.filter((row) => row.type === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0].description).toContain("regen job-1 rev 1");
    // the original run debit is untouched
    expect(env.tables.credit_ledger.find((row) => row.id === "ledger-run")!.amount).toBe(-900);
  });

  it("privileged users are not charged", async () => {
    const env = seed(0);
    const result = await performOutputRegeneration(env.client, {
      jobId: "job-1",
      estimate: estimateFor("imageA"),
      userId: "admin-1",
      privileged: true,
      idempotencyKey: "key-admin",
      runGraphJob: async () => undefined,
    });
    expect(env.tables.credit_ledger).toHaveLength(0);
    expect(result.revision).toBe(1);
    expect(new RegenerationError("X").code).toBe("X");
  });
});
