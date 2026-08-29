import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MaddenShot } from "@/lib/madden-media/types";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  shots: MaddenShot[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<MaddenShot>) => void;
  onRemove: (id: string) => void;
};

/** M1 placeholder shot board — structure + notes only, nothing generates. */
export default function MaddenShotBoard({ shots, onAdd, onChange, onRemove }: Props) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Shots</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Vertical 9:16 short-form beats. Rendering arrives in a later phase.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add shot
        </Button>
      </header>

      <div className="mt-4 space-y-3">
        {shots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No shots yet.
          </p>
        ) : (
          shots.map((shot, index) => (
            <div key={shot.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Input
                  value={shot.title}
                  onChange={(event) => onChange(shot.id, { title: event.target.value })}
                  placeholder="Shot title"
                  className="h-8"
                />
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={shot.durationSeconds}
                  onChange={(event) =>
                    onChange(shot.id, { durationSeconds: Number(event.target.value) || 1 })
                  }
                  className="h-8 w-20"
                  aria-label="Duration in seconds"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remove shot"
                  onClick={() => onRemove(shot.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={shot.direction}
                onChange={(event) => onChange(shot.id, { direction: event.target.value })}
                placeholder="Framing, movement, action"
                rows={2}
                className="mt-2"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
