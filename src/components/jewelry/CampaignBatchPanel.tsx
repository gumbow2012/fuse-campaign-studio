/**
 * BATCH CONTINUATION (§28) — surface only.
 *
 * Shows the batch lineage of a campaign and lets the user start the next batch
 * or approve the open one. Starting a batch generates NOTHING: it only records
 * that the next set of plates continues from the established product identity,
 * look and approved plates. All rendering still happens through the existing
 * user-triggered Generate buttons.
 */

import { Check, Layers, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  batchInheritanceSummary,
  type CampaignBatch,
} from "@/lib/campaignBatches";

export function CampaignBatchPanel({
  batches,
  activeBatchId,
  blockedReason,
  onStartBatch,
  onApproveBatch,
}: {
  batches: CampaignBatch[];
  activeBatchId: string | null;
  blockedReason: string | null;
  onStartBatch: () => void;
  onApproveBatch: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-foreground/65">
          <Layers size={12} /> Batches
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(blockedReason)}
          onClick={onStartBatch}
          className="h-7 border-white/15 bg-white/[0.04] text-[11px] text-foreground hover:bg-white/[0.08]"
        >
          <Plus size={11} className="mr-1" /> Start next batch
        </Button>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-foreground/45">
        Each batch continues the same product — the locked identity, your campaign look and every
        approved plate carry forward, so nothing is re-read or re-analysed.
      </p>

      {blockedReason ? (
        <p className="mt-2 text-[10px] text-amber-200/70">{blockedReason}</p>
      ) : null}

      {batches.length ? (
        <div className="mt-2.5 space-y-2">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className={
                batch.id === activeBatchId
                  ? "rounded-xl border border-cyan-200/35 bg-cyan-400/[0.05] px-2.5 py-2"
                  : "rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground/80">
                  {batch.label}
                  <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-foreground/45">
                    {batch.status === "approved" ? "approved" : "open"}
                  </span>
                </p>
                {batch.status === "open" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApproveBatch(batch.id)}
                    className="h-6 border-white/15 bg-white/[0.04] text-[10px] text-foreground hover:bg-white/[0.08]"
                  >
                    <Check size={10} className="mr-1" /> Approve batch
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-[10px] text-foreground/45">
                {batch.masterKeys.length} plate{batch.masterKeys.length === 1 ? "" : "s"} in this
                batch
              </p>
              <ul className="mt-1 space-y-0.5">
                {batchInheritanceSummary(batch).map((line) => (
                  <li key={line} className="text-[10px] text-foreground/40">
                    · {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-foreground/40">
          No batches yet — start one to group the next set of plates.
        </p>
      )}
    </div>
  );
}

export default CampaignBatchPanel;
