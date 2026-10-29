import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, UploadCloud, Wand2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { readProductDesign } from "@/services/campaignDirector";
import { newId } from "@/lib/campaign-director/state";
import { issueSummary, validateScript } from "@/lib/campaign-director/script";
import { cn } from "@/lib/utils";
import type { DirectorProduct, DirectorProject } from "@/lib/campaign-director/types";
import { SignedImg } from "./Signed";

type Props = {
  project: DirectorProject;
  writing: boolean;
  onAddProduct: (product: DirectorProduct) => void;
  onUpdateProduct: (id: string, patch: Partial<DirectorProduct>) => void;
  onRemoveProduct: (id: string) => void;
  onThemeChange: (theme: string) => void;
  onWrite: () => void;
};

/** The whole front door: drag in the mylars, say the idea, write the script. */
export default function SimpleStart({ project, writing, onAddProduct, onUpdateProduct, onRemoveProduct, onThemeChange, onWrite }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const { products, shots, brief, world } = project;

  const issues = useMemo(() => validateScript(shots, products, brief.shotCount), [shots, products, brief.shotCount]);
  const summary = issueSummary(issues);

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.message("Drop image files (the front of each mylar).");
      return;
    }
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          const imageUrl = await uploadRunInputFile(file);
          const product: DirectorProduct = {
            id: newId("prod"),
            name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
            artist: "",
            collab: "",
            flavor: "",
            imageUrl,
          };
          onAddProduct(product);
          // Fill in the printed name / flavor in the background. Optional, so failures are silent.
          void readProductDesign(imageUrl)
            .then((f) => onUpdateProduct(product.id, { name: f.name || product.name, artist: f.artist, collab: f.collab, flavor: f.flavor }))
            .catch(() => undefined);
        } catch (error) {
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  const hasWork = shots.some((s) => s.image.url || s.video.url || s.image.requestId);
  const write = () => {
    if (hasWork && !window.confirm("Rewriting replaces every shot, including images and clips you already paid for. Continue?")) return;
    onWrite();
  };
  const ready = products.length > 0 && brief.theme.trim().length > 0 && !writing;

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-card/50 p-4 sm:p-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
          dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60",
        )}
      >
        {uploading > 0 ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7 text-muted-foreground" />}
        <p className="text-base font-medium">{uploading > 0 ? `Uploading ${uploading}…` : "Drag your mylar designs here"}</p>
        <p className="text-xs text-muted-foreground">or click to choose files. One image per design: the front of the bag.</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = "";
        }} />
      </div>

      {products.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {products.map((p) => (
            <div key={p.id} className="group relative">
              <SignedImg src={p.imageUrl} alt={p.name} className="aspect-[3/4] w-full rounded-md border object-cover" />
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => onRemoveProduct(p.id)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-100 shadow sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" title={p.name}>{p.name}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <Textarea
          rows={4}
          value={brief.theme}
          placeholder="What's the idea? e.g. Labor Day weekend takeover: he travels through a Caribbean festival and hands each artist their bag."
          onChange={(e) => onThemeChange(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" disabled={!ready} onClick={write}>
            {writing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {writing ? "Writing the script…" : shots.length ? "Rewrite the script" : "Write the script"}
          </Button>
          <span className="text-xs text-muted-foreground">Free to write. Nothing is generated or charged until you approve a price.</span>
        </div>
        {world.characters.length === 0 ? (
          <p className="text-xs text-amber-600">No character photos are saved yet. Open Advanced below and add them once so he looks the same every time.</p>
        ) : null}
      </div>

      {shots.length > 0 && issues.length > 0 ? (
        <details className="rounded-md border p-3 text-xs">
          <summary className="cursor-pointer text-sm font-medium">
            Script check: {summary.errors} error{summary.errors === 1 ? "" : "s"}, {summary.warnings} warning{summary.warnings === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1">
            {issues.map((issue, i) => (
              <li key={i} className="flex items-start gap-2">
                {issue.level === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />}
                <span>{issue.shot ? `Shot ${issue.shot}: ` : ""}{issue.message}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
