import { useMemo, useState } from "react";
import { Film, Image as ImageIcon, Layers, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type GalleryTemplate = {
  templateId: string;
  templateName: string;
  description: string | null;
  previewUrl: string | null;
  previewAssetType: "image" | "video" | null;
  versionId: string;
  versionNumber: number;
  isActive: boolean;
  updatedAt?: string | null;
  counts: {
    inputs: number;
    imageOutputs: number;
    videoOutputs: number;
  };
};

function relativeTime(value?: string | null) {
  if (!value) return "No edit history";
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "No edit history";
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Edited ${days}d ago`;
  return `Edited ${new Date(then).toLocaleDateString()}`;
}

type TemplateGalleryProps = {
  open: boolean;
  templates: GalleryTemplate[];
  loading?: boolean;
  activeVersionId?: string | null;
  creating?: boolean;
  onClose: () => void;
  onOpenTemplate: (versionId: string) => void;
  onCreateTemplate: (name: string) => void;
  onRefresh: () => void;
};

const TemplateGallery = ({
  open,
  templates,
  loading,
  activeVersionId,
  creating,
  onClose,
  onOpenTemplate,
  onCreateTemplate,
  onRefresh,
}: TemplateGalleryProps) => {
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((template) =>
      `${template.templateName} ${template.description ?? ""}`.toLowerCase().includes(needle));
  }, [query, templates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/85 backdrop-blur-xl">
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-border/50 bg-card/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2 className="truncate text-base font-bold">Template gallery</h2>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {templates.length} templates
          </span>
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates"
            className="h-9 rounded-full pl-8 text-xs"
            aria-label="Search templates"
          />
        </div>
        <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close gallery">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New template name"
          className="h-9 w-full max-w-xs rounded-full text-xs"
        />
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          disabled={!newName.trim() || creating}
          onClick={() => {
            onCreateTemplate(newName.trim());
            setNewName("");
          }}
        >
          {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          New template
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && !templates.length ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading templates...
          </div>
        ) : !filtered.length ? (
          <div className="rounded-3xl border border-border/50 bg-card/60 p-8 text-center text-sm text-muted-foreground">
            No templates match “{query}”.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((template) => {
              const isCurrent = template.versionId === activeVersionId;
              return (
                <button
                  key={template.templateId}
                  type="button"
                  onClick={() => onOpenTemplate(template.versionId)}
                  className={`group flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-card/70 text-left shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl transition hover:-translate-y-0.5 ${
                    isCurrent ? "border-primary/70 ring-1 ring-primary/40" : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-background/70">
                    {template.previewUrl && template.previewAssetType !== "video" ? (
                      <img
                        src={template.previewUrl}
                        alt={template.templateName}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                    ) : template.previewUrl ? (
                      <video src={template.previewUrl} muted loop playsInline className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.28),transparent_60%)] text-muted-foreground">
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-[10px] uppercase tracking-[0.2em]">No preview yet</span>
                      </div>
                    )}
                    <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur ${
                      template.isActive ? "bg-emerald-400/20 text-emerald-200" : "bg-background/70 text-muted-foreground"
                    }`}>
                      {template.isActive ? "Live" : "Draft"} · v{template.versionNumber}
                    </span>
                  </div>
                  <div className="min-w-0 space-y-1.5 p-4">
                    <p className="truncate text-sm font-bold text-foreground">{template.templateName}</p>
                    <p className="text-[11px] text-muted-foreground">{relativeTime(template.updatedAt)}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      <span className="rounded-full border border-border/60 px-2 py-0.5">{template.counts.inputs} in</span>
                      <span className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                        <ImageIcon className="h-3 w-3" />{template.counts.imageOutputs}
                      </span>
                      <span className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                        <Film className="h-3 w-3" />{template.counts.videoOutputs}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateGallery;
