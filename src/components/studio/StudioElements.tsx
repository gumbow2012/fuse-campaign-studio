import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, ImagePlus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  ELEMENT_KINDS,
  MAX_ELEMENT_IMAGES,
  activeMention,
  toElementName,
  type ElementKind,
  type StudioElement,
} from "@/lib/generationStudio/elements";

/** Prompt box with an @ menu for saved elements and a chip row underneath. */
export function ElementPromptBox({
  value,
  onChange,
  elements,
  onNewElement,
  onDeleteElement,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  elements: StudioElement[];
  onNewElement: () => void;
  onDeleteElement: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return elements.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [elements, mention]);

  useEffect(() => setHighlight(0), [mention?.query]);

  const sync = (text: string, caret: number) => setMention(activeMention(text, caret));

  /** Replaces the typed "@partial" (or inserts at the caret) with "@Name ". */
  const insert = (element: StudioElement) => {
    const box = ref.current;
    const caret = box?.selectionStart ?? value.length;
    const start = mention ? mention.start : caret;
    const before = value.slice(0, start);
    const pad = before && !/\s$/.test(before) ? " " : "";
    const token = `${pad}@${element.name} `;
    const next = before + token + value.slice(caret);
    onChange(next);
    setMention(null);
    requestAnimationFrame(() => {
      box?.focus();
      const at = before.length + token.length;
      box?.setSelectionRange(at, at);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          sync(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) => sync(value, event.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={(event) => {
          if (!matches.length) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setHighlight((h) => (h + step + matches.length) % matches.length);
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            insert(matches[highlight]);
          } else if (event.key === "Escape") {
            setMention(null);
          }
        }}
        placeholder={placeholder}
        rows={8}
        className={className}
        aria-autocomplete="list"
        aria-expanded={matches.length > 0}
      />

      {mention ? (
        <div
          role="listbox"
          className="absolute left-3 right-3 z-30 mt-1 overflow-hidden rounded-xl border border-white/12 bg-[hsl(var(--background))] shadow-xl"
        >
          {matches.length ? (
            matches.map((element, index) => (
              <button
                key={element.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(element);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  index === highlight ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                )}
              >
                <img src={element.urls[0]} alt="" className="h-8 w-8 rounded-md object-cover" />
                <span className="text-[14px] text-foreground">@{element.name}</span>
                <span className="ml-auto text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  {element.kind}
                </span>
              </button>
            ))
          ) : (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setMention(null);
                onNewElement();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            >
              <Plus size={14} />
              {elements.length ? `No element named "${mention.query}". Create one` : "No elements yet. Create one"}
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <AtSign size={12} /> Elements
        </span>
        {elements.map((element) => (
          <span
            key={element.id}
            className="group flex items-center gap-1.5 rounded-full border border-white/12 bg-black/30 py-0.5 pl-0.5 pr-1.5"
          >
            <button
              type="button"
              onClick={() => insert(element)}
              title={`Insert @${element.name}`}
              className="flex items-center gap-1.5 text-[12px] text-foreground"
            >
              <img src={element.urls[0]} alt="" className="h-6 w-6 rounded-full object-cover" />@{element.name}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete the element @${element.name}?`)) onDeleteElement(element.id);
              }}
              aria-label={`Delete element ${element.name}`}
              className="text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={onNewElement}
          className="flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Plus size={12} /> New element
        </button>
      </div>
    </div>
  );
}

/** Name + type + up to four images. Starts from whatever images the caller passes. */
export function CreateElementDialog({
  open,
  onOpenChange,
  initialUrls,
  existingNames,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrls: string[];
  existingNames: string[];
  onCreate: (element: StudioElement) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ElementKind>("person");
  const [urls, setUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKind("person");
    setUrls(initialUrls.slice(0, MAX_ELEMENT_IMAGES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const clean = toElementName(name);
  const taken = existingNames.some((n) => n.toLowerCase() === clean.toLowerCase());

  const upload = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/")).slice(0, MAX_ELEMENT_IMAGES - urls.length);
    if (!images.length) return;
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of images) added.push(await uploadRunInputFile(file));
      setUrls((prev) => [...prev, ...added].slice(0, MAX_ELEMENT_IMAGES));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the image");
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!clean || taken || !urls.length) return;
    onCreate({ id: crypto.randomUUID(), name: clean, kind, urls });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/12 bg-[hsl(var(--background))]">
        <DialogTitle>New element</DialogTitle>
        <DialogDescription>
          Save a person, object or place, then type @{clean || "Name"} in any prompt to use it.
        </DialogDescription>

        <div className="space-y-4">
          <div>
            <label htmlFor="element-name" className="text-[12px] text-muted-foreground">Name</label>
            <Input
              id="element-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && save()}
              placeholder="Marv"
              autoFocus
              className="mt-1"
            />
            {name && clean !== name.trim() ? (
              <p className="mt-1 text-[12px] text-muted-foreground">You'll type it as @{clean}</p>
            ) : null}
            {taken ? <p className="mt-1 text-[12px] text-rose-300">An element named @{clean} already exists</p> : null}
          </div>

          <div className="flex gap-2" role="radiogroup" aria-label="Element type">
            {ELEMENT_KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={kind === option.value}
                onClick={() => setKind(option.value)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-1.5 text-[13px]",
                  kind === option.value
                    ? "border-[hsl(var(--electric-cyan)/0.6)] bg-[hsl(var(--electric-cyan)/0.12)] text-foreground"
                    : "border-white/12 text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[12px] text-muted-foreground">
              Images ({urls.length}/{MAX_ELEMENT_IMAGES}). Different angles help the model keep it consistent.
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {urls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-white/10">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setUrls((prev) => prev.filter((u) => u !== url))}
                    aria-label="Remove image"
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {urls.length < MAX_ELEMENT_IMAGES ? (
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/20 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <ImagePlus size={16} />
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                void upload(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={!clean || taken || !urls.length || uploading}>
              Save element
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}