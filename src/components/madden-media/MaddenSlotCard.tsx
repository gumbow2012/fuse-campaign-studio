import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  MADDEN_SLOT_HINTS,
  MADDEN_SLOT_LABELS,
  type MaddenSlot,
  type MaddenSlotKind,
} from "@/lib/madden-media/types";

type Props = {
  slot: MaddenSlot;
  onChange: (kind: MaddenSlotKind, patch: Partial<MaddenSlot>) => void;
};

/** M1 placeholder: captures the slot identity + lock. References land in M2. */
export default function MaddenSlotCard({ slot, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{MADDEN_SLOT_LABELS[slot.kind]}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{MADDEN_SLOT_HINTS[slot.kind]}</p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Lock
          <Switch
            checked={slot.locked}
            onCheckedChange={(checked) => onChange(slot.kind, { locked: checked })}
          />
        </label>
      </header>

      <div className="mt-3 space-y-2">
        <Input
          value={slot.name}
          onChange={(event) => onChange(slot.kind, { name: event.target.value })}
          placeholder={`${MADDEN_SLOT_LABELS[slot.kind]} name`}
        />
        <Textarea
          value={slot.description}
          onChange={(event) => onChange(slot.kind, { description: event.target.value })}
          placeholder="Describe what must stay identical across every shot"
          rows={3}
        />
        <p className="text-[11px] text-muted-foreground/70">
          Reference uploads and analysis arrive in a later phase.
        </p>
      </div>
    </section>
  );
}
