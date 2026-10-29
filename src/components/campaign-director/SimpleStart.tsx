import { useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { readProductDesign } from "@/services/campaignDirector";
import { compressImageFile } from "@/lib/imageCompress";
import { newId } from "@/lib/campaign-director/state";
import { cn } from "@/lib/utils";
import type { DirectorProduct, DirectorProject } from "@/lib/campaign-director/types";
import { signedDisplayUrl } from "@/lib/campaign-director/signedUrl";
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

/** Wait this long after the last design finishes so a batch of drops becomes ONE script. */
const AUTO_WRITE_DELAY_MS = 2500;

/** The whole front door: drag in the mylars and the script writes itself. */
export default function SimpleStart({ project, writing, onAddProduct, onUpdateProduct, onRemoveProduct, onThemeChange, onWrite }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(0);
  const [reading, setReading] = useState(0);
  const [dragging, setDragging] = useState(false);
  /** Set by a drop in this session only, so reopening a campaign never writes a script unasked. */
  const autoWrite = useRef(false);
  const writeRef = useRef(onWrite);
  writeRef.current = onWrite;
  const { products, shots, brief, world } = project;

  const busy = uploading > 0 || reading > 0;

  useEffect(() => {
    if (!autoWrite.current || busy || writing || products.length === 0 || shots.length > 0) return;
    const timer = setTimeout(() => {
      autoWrite.current = false;
      writeRef.current();
    }, AUTO_WRITE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy, writing, products.length, shots.length]);

  // Designs uploaded before thumbnails existed get one made once, quietly, so the script writer can see them.
  const triedThumbs = useRef(new Set<string>());
  const updateRef = useRef(onUpdateProduct);
  updateRef.current = onUpdateProduct;
  useEffect(() => {
    const missing = products.filter((p) => !p.thumbUrl && !triedThumbs.current.has(p.id));
    if (missing.length === 0) return;
    missing.forEach((p) => triedThumbs.current.add(p.id));
    void (async () => {
      for (const p of missing) {
        try {
          const blob = await fetch(await signedDisplayUrl(p.imageUrl)).then((r) => r.blob());
          const original = new File([blob], `${p.id}.${blob.type.split("/")[1] || "png"}`, { type: blob.type || "image/png" });
          const small = await compressImageFile(original, 1024, 0.82);
          updateRef.current(p.id, { thumbUrl: await uploadRunInputFile(small) });
        } catch {
          /* optional: the script writer just goes without this picture */
        }
      }
    })();
  }, [products]);

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.message("Drop image files (the front of each mylar).");
      return;
    }
    autoWrite.current = shots.length === 0;
    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (file) => {
        try {
          const [imageUrl, thumbUrl] = await Promise.all([
            uploadRunInputFile(file),
            // A small copy lets the script writer look at many designs in one request.
            compressImageFile(file, 1024, 0.82).then(uploadRunInputFile).catch(() => undefined),
          ]);
          const product: DirectorProduct = {
            id: newId("prod"),
            name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
            artist: "",
            collab: "",
            flavor: "",
            imageUrl,
            thumbUrl,
          };
          onAddProduct(product);
          // Fill in the printed name / flavor. Optional, so a failure is silent.
          setReading((n) => n + 1);
          void readProductDesign(imageUrl)
            .then((f) => onUpdateProduct(product.id, { name: f.name || product.name, artist: f.artist, collab: f.collab, flavor: f.flavor }))
            .catch(() => undefined)
            .finally(() => setReading((n) => n - 1));
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
    if (shots.length > 0 && !hasWork && !window.confirm("Rewriting replaces the script, including any edits you made. Continue?")) return;
    onWrite();
  };

  const status = uploading > 0 ? `Uploading ${uploading}…` : reading > 0 ? "Reading your designs…" : writing ? "Writing the script from your designs…" : null;

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
        {status ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7 text-muted-foreground" />}
        <p className="text-base font-medium">{status ?? "Drag your mylar designs here"}</p>
        <p className="text-xs text-muted-foreground">
          {shots.length === 0 ? "The script writes itself from your designs, then you edit it." : "Add more designs any time. Your script stays as you edited it."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
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

      {products.length > 0 ? (
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={brief.theme}
            placeholder="Optional: any direction for the story. Leave it empty and the script is built from the designs."
            onChange={(e) => onThemeChange(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant={shots.length ? "outline" : "default"} disabled={busy || writing} onClick={write}>
              {writing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {shots.length ? "Rewrite the script" : "Write the script"}
            </Button>
            <span className="text-xs text-muted-foreground">Free to write. Nothing is generated or charged until you approve a price.</span>
          </div>
        </div>
      ) : null}

      {world.characters.length === 0 ? (
        <p className="text-xs text-amber-600">No character photos are saved yet. Open Advanced below and add them once so he looks the same every time.</p>
      ) : null}
    </section>
  );
}
