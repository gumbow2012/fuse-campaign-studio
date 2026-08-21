/**
 * BATCH CONTINUATION (§28) — state/logic only.
 *
 * A campaign is produced in batches: MASTER → Batch 1 → (approve) → Batch 2
 * inherits → Batch 3 inherits. The whole point is that the PRODUCT IS NEVER
 * REDISCOVERED between batches: a new batch reuses the established Master
 * Product Lock, Campaign Photography Profile, environment/optics profile and
 * the already-approved masters/plates. Nothing here triggers Gemini analysis,
 * rebuilds a PKM, or starts a generation — it only records lineage.
 */

export type CampaignBatchInheritance = {
  /** The batch this one continues from (null for the first batch). */
  fromBatchId: string | null;
  /** Version of the Master Product Lock carried forward (identity). */
  lockVersion: string | null;
  /** Fingerprint of the Campaign Photography Profile carried forward (look). */
  photographySetVersion: string | null;
  /** Whether an environment / Diamond Optics profile was already established. */
  hasOpticsProfile: boolean;
  /** Approved masters/plates carried forward untouched. */
  inheritedMasterKeys: string[];
};

export type CampaignBatch = {
  id: string;
  /** 1-based, stable for labelling. */
  index: number;
  label: string;
  createdAt: string;
  status: "open" | "approved";
  approvedAt: string | null;
  /** Master/plate keys produced BY this batch (prior ones are inherited). */
  masterKeys: string[];
  inherits: CampaignBatchInheritance;
};

function newId() {
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function findBatch(batches: CampaignBatch[], id: string | null | undefined) {
  if (!id) return null;
  return batches.find((batch) => batch.id === id) ?? null;
}

export function lastApprovedBatch(batches: CampaignBatch[]): CampaignBatch | null {
  for (let i = batches.length - 1; i >= 0; i -= 1) {
    if (batches[i].status === "approved") return batches[i];
  }
  return null;
}

/**
 * Why a new batch cannot start yet, or null when it can. A batch may only start
 * from an ESTABLISHED product identity — that is what makes continuation free of
 * re-analysis — and only one batch is open at a time.
 */
export function batchBlockedReason(args: {
  batches: CampaignBatch[];
  hasLock: boolean;
}): string | null {
  if (!args.hasLock) return "Confirm the product first — batches continue from the locked identity.";
  const open = args.batches.find((batch) => batch.status === "open");
  if (open) return `Approve ${open.label} before starting the next batch.`;
  return null;
}

/**
 * Create the next batch. It INHERITS the established lock, look profile, optics
 * profile and every approved master from earlier batches; no product
 * understanding is recomputed and no generation is started here.
 */
export function startCampaignBatch(args: {
  batches: CampaignBatch[];
  lockVersion: string | null;
  photographySetVersion: string | null;
  hasOpticsProfile: boolean;
  /** Keys of masters that already passed QC in this project. */
  approvedMasterKeys: string[];
}): CampaignBatch {
  const previous = lastApprovedBatch(args.batches);
  const index = args.batches.length + 1;
  const inheritedFromPrevious = previous
    ? [...previous.inherits.inheritedMasterKeys, ...previous.masterKeys]
    : [];
  const inheritedMasterKeys = Array.from(
    new Set([...inheritedFromPrevious, ...args.approvedMasterKeys]),
  );
  return {
    id: newId(),
    index,
    label: `Batch ${index}`,
    createdAt: new Date().toISOString(),
    status: "open",
    approvedAt: null,
    masterKeys: [],
    inherits: {
      fromBatchId: previous?.id ?? null,
      lockVersion: args.lockVersion,
      photographySetVersion: args.photographySetVersion,
      hasOpticsProfile: args.hasOpticsProfile,
      inheritedMasterKeys,
    },
  };
}

/** Attach a freshly generated master/plate to the open batch. */
export function recordBatchMaster(
  batches: CampaignBatch[],
  batchId: string | null | undefined,
  masterKey: string,
): CampaignBatch[] {
  if (!batchId) return batches;
  return batches.map((batch) =>
    batch.id === batchId && batch.status === "open" && !batch.masterKeys.includes(masterKey)
      ? { ...batch, masterKeys: [...batch.masterKeys, masterKey] }
      : batch,
  );
}

/** Approve a batch — its outputs become inheritable by the next batch. */
export function approveCampaignBatch(
  batches: CampaignBatch[],
  batchId: string,
): CampaignBatch[] {
  return batches.map((batch) =>
    batch.id === batchId
      ? { ...batch, status: "approved" as const, approvedAt: new Date().toISOString() }
      : batch,
  );
}

/** Plain-language read-out of what a batch carried forward. */
export function batchInheritanceSummary(batch: CampaignBatch): string[] {
  const lines: string[] = [];
  if (!batch.inherits.fromBatchId && !batch.inherits.inheritedMasterKeys.length) {
    lines.push("First batch — establishes the campaign from the locked product.");
  } else {
    lines.push("Continues the established product — nothing re-analysed.");
  }
  if (batch.inherits.lockVersion) lines.push(`Product identity ${batch.inherits.lockVersion}`);
  if (batch.inherits.photographySetVersion) lines.push("Campaign look carried forward");
  if (batch.inherits.hasOpticsProfile) lines.push("Optics profile carried forward");
  if (batch.inherits.inheritedMasterKeys.length) {
    lines.push(
      `${batch.inherits.inheritedMasterKeys.length} approved plate${
        batch.inherits.inheritedMasterKeys.length === 1 ? "" : "s"
      } carried forward`,
    );
  }
  return lines;
}
