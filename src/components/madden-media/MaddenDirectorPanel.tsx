/**
 * Madden Media Studio — M8 Director panel.
 *
 * Gemini TEXT proposals only. Nothing changes the project until the user
 * clicks Apply on a specific proposal, and STRICT locks always win.
 */
import { useMemo, useState } from "react";
import { AlertCircle, Clapperboard, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MADDEN_VARIATIONS,
  describeProposalDiff,
  type MaddenDirectorProposal,
  type MaddenVariationId,
} from "@/lib/madden-media/director";
import { requestMaddenDirection } from "@/services/maddenMediaStudio";
import type { MaddenProjectState } from "@/lib/madden-media/types";

type Props = {
  state: MaddenProjectState;
  disabled?: boolean;
  onApply: (proposal: MaddenDirectorProposal) => void;
};

function ProposalCard({
  proposal,
  state,
  onApply,
}: {
  proposal: MaddenDirectorProposal;
  state: MaddenProjectState;
  onApply: () => void;
}) {
  const diff = useMemo(() => describeProposalDiff(state, proposal.changes), [state, proposal]);
  const effective = diff.filter((line) => !line.blocked);

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight tracking-tight">{proposal.title}</h4>
        {proposal.mood ? (
          <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {proposal.mood}
          </span>
        ) : null}
      </div>

      {proposal.rationale ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{proposal.rationale}</p>
      ) : null}

      <div className="rounded-lg border border-border/50 bg-background/40 p-2">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Apply would change
        </p>
        {diff.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nothing — this matches your current setup.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {diff.map((line) => (
              <li key={line.field} className="text-[11px] leading-snug">
                <span className="text-muted-foreground">{line.field}: </span>
                <span className={line.blocked ? "text-muted-foreground line-through" : ""}>
                  {line.from} → {line.to}
                </span>
                {line.blocked ? (
                  <span className="ml-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    kept (your lock)
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        className="h-7 text-xs"
        disabled={effective.length === 0}
        onClick={onApply}
      >
        <Wand2 className="mr-1 h-3 w-3" />
        Apply
      </Button>
    </article>
  );
}

export default function MaddenDirectorPanel({ state, disabled, onApply }: Props) {
  const [variation, setVariation] = useState<MaddenVariationId>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<MaddenDirectorProposal[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [ran, setRan] = useState(false);

  const run = async (id: MaddenVariationId) => {
    setVariation(id);
    setLoading(true);
    setError(null);
    const result = await requestMaddenDirection(state, id);
    setLoading(false);
    setRan(true);
    if (!result.ok) {
      setProposals([]);
      setNotes([]);
      setError(result.reason);
      return;
    }
    setProposals(result.proposals);
    setNotes(result.notes);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold tracking-tight">
            <Clapperboard className="h-4 w-4 text-primary" aria-hidden />
            Madden Director
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Proposals only — nothing changes until you apply one, and your locks always win.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          disabled={disabled || loading}
          onClick={() => void run(variation)}
        >
          {loading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Clapperboard className="mr-1 h-3 w-3" />
          )}
          Get direction
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {MADDEN_VARIATIONS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            disabled={disabled || loading}
            onClick={() => void run(entry.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              variation === entry.id
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            } disabled:opacity-50`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Reading the project…</p>
      ) : null}

      {!loading && !error && proposals.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {ran
            ? "No proposals came back — try another variation."
            : "Pick a mood or hit Get direction for the Director's call."}
        </p>
      ) : null}

      {proposals.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              state={state}
              onApply={() => onApply(proposal)}
            />
          ))}
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-[11px] text-muted-foreground">
              · {note}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
