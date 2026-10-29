import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { newId } from "@/lib/campaign-director/state";
import type { DirectorRef, DirectorRefKind } from "@/lib/campaign-director/types";

type Props = {
  title: string;
  hint: string;
  kind: DirectorRefKind;
  refs: DirectorRef[];
  max: number;
  onChange: (refs: DirectorRef[]) => void;
};

export default function RefUploader({ title, hint, kind, refs, max, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...refs];
      for (const file of Array.from(files)) {
        if (next.length >= max) {
          toast.message(`Up to ${max} images here.`);
          break;
        }
        const url = await uploadRunInputFile(file);
        next.push({ id: newId("ref"), url, kind, label: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) });
      }
      onChange(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={busy || refs.length >= max} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          Add
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      </div>
      {refs.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">None yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {refs.map((ref) => (
            <div key={ref.id} className="space-y-1 rounded-md border p-1.5">
              <img src={ref.url} alt={ref.label} className="aspect-[3/4] w-full rounded object-cover" />
              <Input
                value={ref.label}
                className="h-7 text-xs"
                onChange={(e) => onChange(refs.map((r) => (r.id === ref.id ? { ...r, label: e.target.value } : r)))}
              />
              <Button type="button" size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => onChange(refs.filter((r) => r.id !== ref.id))}>
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
