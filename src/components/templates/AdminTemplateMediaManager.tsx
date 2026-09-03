/**
 * ADMIN ONLY — example media manager for a template's detail page.
 * Upload, drag-reorder, label, publish/unpublish, feature and delete.
 * Rendered only for admins; every operation is also authorized server-side.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addTemplateMedia,
  deleteTemplateMedia,
  listAdminTemplateMedia,
  reorderTemplateMedia,
  setTemplateMediaFeatured,
  setTemplateMediaPublished,
  updateTemplateMediaLabel,
  uploadTemplateMediaFile,
  type AdminTemplateMediaRow,
} from "@/services/templateDetailPage";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function AdminTemplateMediaManager({ templateId }: { templateId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);

  const mediaQuery = useQuery({
    queryKey: ["admin-template-media", templateId],
    queryFn: () => listAdminTemplateMedia(templateId),
    enabled: !!templateId,
    retry: false,
  });

  const rows: AdminTemplateMediaRow[] = (() => {
    const list = mediaQuery.data ?? [];
    if (!order) return list;
    const map = new Map(list.map((row) => [row.id, row]));
    const ordered = order.map((id) => map.get(id)).filter((row): row is AdminTemplateMediaRow => !!row);
    const extras = list.filter((row) => !order.includes(row.id));
    return [...ordered, ...extras];
  })();

  const invalidate = () => {
    setOrder(null);
    void queryClient.invalidateQueries({ queryKey: ["admin-template-media", templateId] });
    void queryClient.invalidateQueries({ queryKey: ["template-detail-page"] });
  };

  const mutate = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: invalidate,
    onError: (error) => toast({ title: "Action failed", description: errorMessage(error), variant: "destructive" }),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const mediaType = file.type.startsWith("video") ? "video" : "image";
      const path = await uploadTemplateMediaFile(templateId, file);
      await addTemplateMedia({
        templateId,
        sourcePath: path,
        mediaType,
        label: label.trim() || file.name.replace(/\.[^.]+$/, ""),
      });
      setLabel("");
      toast({ title: "Example added" });
      invalidate();
    } catch (error) {
      toast({ title: "Upload failed", description: errorMessage(error), variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const commitOrder = (next: string[]) => {
    setOrder(next);
    mutate.mutate(() => reorderTemplateMedia(templateId, next));
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = rows.map((row) => row.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    commitOrder(ids);
  };

  return (
    <section className="rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(8,145,178,0.08),rgba(255,255,255,0.02))] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-cyan-200/80">Admin only</p>
          <h2 className="mt-1 font-display text-lg font-semibold uppercase tracking-[-0.01em] text-white">
            Example media manager
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label (optional)"
            className="h-9 w-40 border-white/10 bg-black/40 text-xs text-white"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-cyan-300 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload example
          </Button>
        </div>
      </div>

      {mediaQuery.isLoading ? (
        <p className="mt-4 text-xs text-slate-400">Loading media…</p>
      ) : mediaQuery.isError ? (
        <p className="mt-4 text-xs text-rose-200">Media manager unavailable right now.</p>
      ) : !rows.length ? (
        <p className="mt-4 text-xs text-slate-400">No example media yet — upload the first one.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              draggable
              onDragStart={() => setDragId(row.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(row.id)}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-2.5",
                dragId === row.id && "border-cyan-300/50 opacity-70",
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-500" aria-hidden />
              <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black">
                {row.poster_url || row.url ? (
                  <img
                    src={(row.media_type === "video" ? row.poster_url : row.url) ?? row.url ?? ""}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <Input
                  defaultValue={row.label ?? ""}
                  placeholder="Label"
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (row.label ?? "")) {
                      mutate.mutate(() => updateTemplateMediaLabel(row.id, next));
                    }
                  }}
                  className="h-8 border-white/10 bg-black/40 text-xs text-white"
                />
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  {row.media_type}
                  {row.is_featured ? " · featured" : ""}
                  {row.published ? "" : " · unpublished"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={row.is_featured ? "Featured" : "Mark as featured"}
                  onClick={() => mutate.mutate(() => setTemplateMediaFeatured(row.id))}
                  className={cn("h-8 px-2", row.is_featured ? "text-amber-200" : "text-slate-400")}
                >
                  <Star className={cn("h-4 w-4", row.is_featured && "fill-current")} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={row.published ? "Unpublish" : "Publish"}
                  onClick={() => mutate.mutate(() => setTemplateMediaPublished(row.id, !row.published))}
                  className="h-8 px-2 text-slate-400"
                >
                  {row.published ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Delete"
                  onClick={() => {
                    if (!window.confirm("Delete this example permanently?")) return;
                    mutate.mutate(() => deleteTemplateMedia(row.id));
                  }}
                  className="h-8 px-2 text-rose-300/80 hover:text-rose-200"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
