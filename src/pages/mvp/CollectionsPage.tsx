/**
 * MARKET3 — "My Collections" workspace (/app/collections).
 *
 * Owner-only surface: create / edit / delete collections, toggle public, and
 * manage the templates inside them. Template display data is joined
 * client-side from the existing catalog (`fetchTemplates`) — collections only
 * store the catalog template id.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Globe,
  Loader2,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";
import {
  addTemplateToCollection,
  countCollectionItems,
  createCollection,
  deleteCollection,
  listCollectionItems,
  listMyCollections,
  removeTemplateFromCollection,
  reorderCollectionItems,
  updateCollection,
  type TemplateCollection,
} from "@/services/collections";

function TinyLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[10px] uppercase tracking-[0.24em] text-cyan-100">{children}</p>
  );
}

function TemplateThumb({ template }: { template: ApiTemplate | undefined }) {
  if (template?.preview_url && template.preview_asset_type !== "video") {
    return (
      <img
        src={template.preview_url}
        alt={template.name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_120%_at_50%_-10%,rgba(34,211,238,0.22),transparent_70%)] text-[10px] uppercase tracking-[0.18em] text-slate-500">
      FUSE
    </div>
  );
}

export default function CollectionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");

  const { data: templates = [] } = useQuery({
    queryKey: ["mvp-templates"],
    queryFn: () => fetchTemplates(""),
    staleTime: 5 * 60 * 1000,
  });

  const templateMap = useMemo(() => {
    const map: Record<string, ApiTemplate> = {};
    for (const template of templates) map[String(template.id)] = template;
    return map;
  }, [templates]);

  const collectionsQuery = useQuery({
    queryKey: ["my-collections", user?.id],
    queryFn: () => listMyCollections(user!.id),
    enabled: Boolean(user?.id),
  });
  const collections = collectionsQuery.data ?? [];

  const { data: itemCounts = {} } = useQuery({
    queryKey: ["collection-counts", collections.map((c) => c.id).join(",")],
    queryFn: () => countCollectionItems(collections.map((c) => c.id)),
    enabled: collections.length > 0,
  });

  useEffect(() => {
    if (!activeId && collections.length) setActiveId(collections[0].id);
    if (activeId && !collections.some((c) => c.id === activeId)) {
      setActiveId(collections[0]?.id ?? null);
    }
  }, [activeId, collections]);

  const active = collections.find((c) => c.id === activeId) ?? null;

  const { data: items = [] } = useQuery({
    queryKey: ["collection-items", activeId],
    queryFn: () => listCollectionItems(activeId!),
    enabled: Boolean(activeId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-membership"] });
  };

  const fail = (title: string) => (error: unknown) =>
    toast({
      title,
      description: error instanceof Error ? error.message : "Please try again.",
      variant: "destructive",
    });

  const create = useMutation({
    mutationFn: (title: string) => createCollection({ title }),
    onSuccess: (collection) => {
      setNewTitle("");
      setActiveId(collection.id);
      invalidate();
    },
    onError: fail("Could not create that drop"),
  });

  const patch = useMutation({
    mutationFn: ({ id, ...rest }: { id: string; title?: string; description?: string | null; is_public?: boolean }) =>
      updateCollection(id, rest),
    onSuccess: invalidate,
    onError: fail("Could not save that drop"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: () => {
      setActiveId(null);
      invalidate();
    },
    onError: fail("Could not delete that drop"),
  });

  const addItem = useMutation({
    mutationFn: (templateId: string) => addTemplateToCollection(activeId!, templateId),
    onSuccess: invalidate,
    onError: fail("Could not add that template"),
  });

  const removeItem = useMutation({
    mutationFn: (templateId: string) => removeTemplateFromCollection(activeId!, templateId),
    onSuccess: invalidate,
    onError: fail("Could not remove that template"),
  });

  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => reorderCollectionItems(activeId!, orderedIds),
    onSuccess: invalidate,
    onError: fail("Could not reorder that drop"),
  });

  const move = (index: number, direction: -1 | 1) => {
    const ordered = items.map((item) => item.template_id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    reorder.mutate(ordered);
  };

  const inCollection = new Set(items.map((item) => item.template_id));
  const pickerResults = templates
    .filter((template) => !inCollection.has(String(template.id)))
    .filter((template) =>
      pickerQuery.trim()
        ? template.name.toLowerCase().includes(pickerQuery.trim().toLowerCase())
        : true,
    )
    .slice(0, 12);

  const copyShareLink = async (collection: TemplateCollection) => {
    const url = `${window.location.origin}/c/${collection.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Share link copied", description: url });
    } catch {
      toast({ title: "Copy this link", description: url });
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title="My Drops · FUSE"
        description="Group FUSE campaign templates into drops and share them with a public link."
        path="/app/collections"
      />

      <div className="container space-y-8 py-10">
        <header className="space-y-3">
          <TinyLabel>Drops</TinyLabel>
          <h1 className="font-display text-3xl font-semibold uppercase tracking-[-0.02em] text-white sm:text-4xl">
            My drops
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Curate template line-ups for a drop, a client or a season. Flip a drop public to
            get a shareable link and share card.
          </p>
        </header>

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            if (newTitle.trim()) create.mutate(newTitle);
          }}
        >
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="New drop title"
            className="max-w-sm border-white/10 bg-white/5"
          />
          <Button
            type="submit"
            disabled={!newTitle.trim() || create.isPending}
            className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          >
            {create.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Create drop
          </Button>
        </form>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* list */}
          <div className="space-y-3">
            {collectionsQuery.isLoading ? (
              <p className="text-sm text-slate-400">Loading drops…</p>
            ) : collections.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-400">
                No drops yet. Create one above, then add templates from the marketplace.
              </div>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  onClick={() => setActiveId(collection.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    collection.id === activeId
                      ? "border-cyan-200/50 bg-cyan-300/5"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                    {collection.cover_url ? (
                      <img
                        src={collection.cover_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <TemplateThumb template={undefined} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold uppercase tracking-[0.06em] text-white">
                      {collection.title}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {collection.is_public ? (
                        <span className="inline-flex items-center gap-1 text-cyan-100">
                          <Globe className="h-3 w-3" /> Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Private
                        </span>
                      )}
                      <span>
                        {itemCounts[collection.id] ?? 0}{" "}
                        {(itemCounts[collection.id] ?? 0) === 1 ? "template" : "templates"}
                      </span>
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* editor */}
          {active ? (
            <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="space-y-3">
                <TinyLabel>Details</TinyLabel>
                <Input
                  defaultValue={active.title}
                  key={`title-${active.id}`}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== active.title) patch.mutate({ id: active.id, title: value });
                  }}
                  className="border-white/10 bg-white/5 font-display text-lg"
                />
                <Textarea
                  defaultValue={active.description ?? ""}
                  key={`desc-${active.id}`}
                  placeholder="What is this drop for?"
                  onBlur={(event) => {
                    const value = event.target.value;
                    if (value !== (active.description ?? "")) {
                      patch.mutate({ id: active.id, description: value });
                    }
                  }}
                  className="min-h-[80px] border-white/10 bg-white/5 text-sm"
                />

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-slate-300">
                    <Switch
                      checked={active.is_public}
                      onCheckedChange={(checked) =>
                        patch.mutate({ id: active.id, is_public: checked })
                      }
                    />
                    Public
                  </label>

                  {active.is_public ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void copyShareLink(active)}
                        className="rounded-full border-white/15 bg-white/5 text-xs"
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy link
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-xs text-cyan-100"
                      >
                        <Link to={`/c/${active.slug}`}>Open public page</Link>
                      </Button>
                    </>
                  ) : null}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(active.id)}
                    disabled={remove.isPending}
                    className="ml-auto rounded-full text-xs text-rose-300 hover:text-rose-200"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>

              {/* items */}
              <div className="space-y-3">
                <TinyLabel>Templates in this drop</TinyLabel>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    Nothing here yet — add templates from the picker below.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((item, index) => {
                      const template = templateMap[item.template_id];
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-2"
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                            <TemplateThumb template={template} />
                          </div>
                          <p className="min-w-0 flex-1 truncate text-sm text-white">
                            {template?.name ?? item.template_id}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Move up"
                              disabled={index === 0 || reorder.isPending}
                              onClick={() => move(index, -1)}
                              className="h-8 w-8 text-slate-400"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Move down"
                              disabled={index === items.length - 1 || reorder.isPending}
                              onClick={() => move(index, 1)}
                              className="h-8 w-8 text-slate-400"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove from drop"
                              onClick={() => removeItem.mutate(item.template_id)}
                              className="h-8 w-8 text-rose-300"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* picker */}
              <div className="space-y-3 border-t border-white/10 pt-5">
                <TinyLabel>Add templates</TinyLabel>
                <Input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  placeholder="Search the marketplace catalog"
                  className="max-w-sm border-white/10 bg-white/5 text-sm"
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {pickerResults.map((template) => (
                    <button
                      key={String(template.id)}
                      type="button"
                      disabled={addItem.isPending}
                      onClick={() => addItem.mutate(String(template.id))}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2 text-left transition-colors hover:border-cyan-200/40"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                        <TemplateThumb template={template} />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-white">
                        {template.name}
                      </span>
                      <Plus className="h-4 w-4 shrink-0 text-cyan-200" />
                    </button>
                  ))}
                  {pickerResults.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      <Check className="mr-1 inline h-3.5 w-3.5" />
                      No more templates match that search.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-sm text-slate-400">
              Select a drop to manage it.
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
