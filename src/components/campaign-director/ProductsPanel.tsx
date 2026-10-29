import { useRef, useState } from "react";
import { Loader2, ScanText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { readProductDesign } from "@/services/campaignDirector";
import { newId } from "@/lib/campaign-director/state";
import type { DirectorProduct } from "@/lib/campaign-director/types";

type Props = {
  products: DirectorProduct[];
  onChange: (products: DirectorProduct[]) => void;
};

export default function ProductsPanel({ products, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<string | null>(null);

  const update = (id: string, patch: Partial<DirectorProduct>) => onChange(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...products];
      for (const file of Array.from(files)) {
        const imageUrl = await uploadRunInputFile(file);
        next.push({ id: newId("prod"), name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60), artist: "", collab: "", flavor: "", imageUrl });
      }
      onChange(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const read = async (product: DirectorProduct) => {
    setReading(product.id);
    try {
      const fields = await readProductDesign(product.imageUrl);
      update(product.id, {
        name: fields.name || product.name,
        artist: fields.artist || product.artist,
        collab: fields.collab || product.collab,
        flavor: fields.flavor || product.flavor,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that design");
    } finally {
      setReading(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Upload each flat design (the front of the pouch). The names below are the product ledger: one design is one product, and a shot only ever
          receives its own design.
        </p>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          Add designs
        </Button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      </div>

      {products.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No designs yet.</p>
      ) : (
        <div className="space-y-2">
          {products.map((product, i) => (
            <div key={product.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[72px_1fr]">
              <img src={product.imageUrl} alt={product.name} className="h-24 w-[72px] rounded object-cover" />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <Input value={product.name} placeholder="Short name" onChange={(e) => update(product.id, { name: e.target.value })} />
                  <Button type="button" size="sm" variant="outline" disabled={reading === product.id} onClick={() => void read(product)} title="Read the printed text">
                    {reading === product.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange(products.filter((p) => p.id !== product.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input value={product.artist} placeholder="Artist" onChange={(e) => update(product.id, { artist: e.target.value })} />
                  <Input value={product.collab} placeholder="Collab / franchise" onChange={(e) => update(product.id, { collab: e.target.value })} />
                  <Input value={product.flavor} placeholder="Flavor" onChange={(e) => update(product.id, { flavor: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
