/**
 * Campaign Merchandising — admin-only shelf curation.
 *
 * Drag to reorder shelves, drag to reorder templates inside editorial shelves,
 * pin/unpin, add/remove templates. Ordering is LOCAL until "Save order".
 * Algorithmic shelves are shown read-only (auto-ordered downstream).
 *
 * Scope: only `marketplace_collections` + `marketplace_collection_templates`.
 * The public marketplace, the customer builder and every workflow are untouched.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  addTemplatesToShelf,
  loadMerchandising,
  removeShelfItem,
  saveItemOrder,
  saveShelfOrder,
  saveShelfVisibility,
  type MerchShelf,
  type MerchShelfItem,
  type MerchTemplate,
  type MerchandisingSnapshot,
} from "@/services/marketplaceMerchandising";

type ShelfState = MerchShelf;
type ItemMap = Record<string, MerchShelfItem[]>;

function groupItems(snapshot: MerchandisingSnapshot): ItemMap {
  const map: ItemMap = {};
  for (const shelf of snapshot.shelves) map[shelf.id] = [];
  for (const item of snapshot.items) {
    if (!map[item.collectionId]) map[item.collectionId] = [];
    map[item.collectionId].push(item);
  }
  for (const key of Object.keys(map)) {
    map[key] = [...map[key]].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });
  }
  return map;
}

function orderSignature(shelves: ShelfState[], items: ItemMap) {
  const shelfPart = shelves.map((shelf, index) => `${shelf.id}:${index}`).join("|");
  const itemPart = Object.keys(items)
    .sort()
    .map(
      (key) =>
        `${key}>${items[key].map((item, index) => `${item.id}:${index}:${item.pinned ? 1 : 0}`).join(",")}`,
    )
    .join("|");
  return `${shelfPart}##${itemPart}`;
}

/* ------------------------------------------------------------------ cards */

function TemplateRow({
  item,
  template,
  position,
  draggable,
  onRemove,
  onTogglePin,
}: {
  item: MerchShelfItem;
  template: MerchTemplate | undefined;
  position: number;
  draggable: boolean;
  onRemove: () => void;
  onTogglePin: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-2xl border bg-black/25 p-2.5",
        isDragging ? "border-cyan-300/60 shadow-[0_0_0_3px_rgba(34,211,238,0.12)]" : "border-white/10",
      )}
    >
      {draggable ? (
        <button
          type="button"
          aria-label="Reorder template"
          className="cursor-grab text-slate-500 transition hover:text-cyan-200"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="w-4" />
      )}

      <span className="w-6 shrink-0 text-center font-mono text-[11px] text-slate-500">{position}</span>

      <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-slate-900">
        {template?.previewUrl ? (
          <img src={template.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {template?.name ?? "Unknown template"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.18em]">
          {/* "Live" means the template has an active non-fork version (the only
              templates this page loads). No draft flag exists on fuse_templates. */}
          {template?.live ? (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-emerald-100">
              Live
            </span>
          ) : null}
          {template?.createdBy ? (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">
              Creator {template.createdBy.slice(0, 8)}
            </span>
          ) : null}
          {item.pinned ? (
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-cyan-100">
              Pinned
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button asChild size="sm" variant="ghost" className="h-8 rounded-full text-[11px] text-slate-300">
          <Link to={`/app/templates?template=${item.templateId}`} target="_blank" rel="noreferrer">
            Preview
          </Link>
        </Button>
        {draggable ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onTogglePin}
            aria-label={item.pinned ? "Unpin template" : "Pin template"}
            className="h-8 w-8 rounded-full text-slate-300 hover:text-cyan-200"
          >
            {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          aria-label="Remove from shelf"
          className="h-8 w-8 rounded-full text-slate-400 hover:text-rose-300"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ShelfCard({
  shelf,
  items,
  templateMap,
  onItemDragEnd,
  onToggleVisibility,
  onRemoveItem,
  onTogglePin,
  onAddClick,
}: {
  shelf: ShelfState;
  items: MerchShelfItem[];
  templateMap: Map<string, MerchTemplate>;
  onItemDragEnd: (event: DragEndEvent) => void;
  onToggleVisibility: (next: boolean) => void;
  onRemoveItem: (item: MerchShelfItem) => void;
  onTogglePin: (item: MerchShelfItem) => void;
  onAddClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shelf.id,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const editorial = !shelf.isAlgorithmic;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-[1.75rem] border bg-slate-950/70 p-4 backdrop-blur",
        isDragging ? "border-cyan-300/60" : "border-white/10",
        !shelf.isVisible && "opacity-70",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            aria-label="Reorder shelf"
            className="mt-1 cursor-grab text-slate-500 transition hover:text-cyan-200"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-white">{shelf.title}</h2>
              <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                {shelf.slug}
              </span>
              {shelf.isAlgorithmic ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] text-cyan-100">
                  <Sparkles className="h-3 w-3" /> Auto-ordered
                </span>
              ) : null}
            </div>
            {shelf.subtitle ? <p className="mt-1 text-xs text-slate-400">{shelf.subtitle}</p> : null}
            <p className="mt-1 text-[11px] text-slate-500">
              {items.length} template{items.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {shelf.isVisible ? (
              <Eye className="h-4 w-4 text-emerald-200" />
            ) : (
              <EyeOff className="h-4 w-4 text-slate-500" />
            )}
            <Switch
              checked={shelf.isVisible}
              onCheckedChange={onToggleVisibility}
              aria-label="Shelf visibility"
            />
          </div>
          {editorial ? (
            <Button
              size="sm"
              onClick={onAddClick}
              className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add template
            </Button>
          ) : null}
        </div>
      </header>

      {shelf.isAlgorithmic ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-slate-400">
          This shelf is personalized/algorithmic — its templates are ordered automatically and cannot be
          reordered manually.
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {!items.length ? (
          <p className="rounded-2xl border border-dashed border-white/12 bg-black/20 p-4 text-center text-xs text-slate-400">
            No templates on this shelf yet.
          </p>
        ) : editorial ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onItemDragEnd}
          >
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <TemplateRow
                  key={item.id}
                  item={item}
                  template={templateMap.get(item.templateId)}
                  position={index + 1}
                  draggable
                  onRemove={() => onRemoveItem(item)}
                  onTogglePin={() => onTogglePin(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          items.map((item, index) => (
            <TemplateRow
              key={item.id}
              item={item}
              template={templateMap.get(item.templateId)}
              position={index + 1}
              draggable={false}
              onRemove={() => onRemoveItem(item)}
              onTogglePin={() => onTogglePin(item)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- page */

export default function AdminMerchandising() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MerchandisingSnapshot | null>(null);
  const [shelves, setShelves] = useState<ShelfState[]>([]);
  const [itemsByShelf, setItemsByShelf] = useState<ItemMap>({});
  const [baseline, setBaseline] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [pickerShelfId, setPickerShelfId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelection, setPickerSelection] = useState<string[]>([]);
  const [pickerBusy, setPickerBusy] = useState(false);

  const applySnapshot = useCallback((next: MerchandisingSnapshot) => {
    const grouped = groupItems(next);
    setSnapshot(next);
    setShelves(next.shelves);
    setItemsByShelf(grouped);
    setBaseline(orderSignature(next.shelves, grouped));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await loadMerchandising());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load merchandising data");
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const templateMap = useMemo(
    () => new Map((snapshot?.templates ?? []).map((template) => [template.id, template])),
    [snapshot],
  );

  const dirty = baseline !== "" && orderSignature(shelves, itemsByShelf) !== baseline;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleShelfDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const previous = shelves;
    const from = previous.findIndex((shelf) => shelf.id === active.id);
    const to = previous.findIndex((shelf) => shelf.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(previous, from, to);
    setShelves(next);
    try {
      await saveShelfOrder(next.map((shelf, index) => ({ id: shelf.id, sortOrder: index })));
      setBaseline(orderSignature(next, itemsByShelf));
      toast.success("Order saved");
    } catch (cause) {
      setShelves(previous);
      toast.error(cause instanceof Error ? cause.message : "Could not save order");
    }
  };

  const persistShelfItems = async (
    shelfId: string,
    next: MerchShelfItem[],
    previous: MerchShelfItem[],
  ) => {
    try {
      await saveItemOrder(
        next.map((item, index) => ({ id: item.id, sortOrder: index, pinned: item.pinned })),
      );
      setBaseline(orderSignature(shelves, { ...itemsByShelf, [shelfId]: next }));
      toast.success("Order saved");
    } catch (cause) {
      setItemsByShelf((current) => ({ ...current, [shelfId]: previous }));
      toast.error(cause instanceof Error ? cause.message : "Could not save order");
    }
  };

  const handleItemDragEnd = (shelfId: string) => async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = itemsByShelf[shelfId] ?? [];
    const from = list.findIndex((item) => item.id === active.id);
    const to = list.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(list, from, to);
    setItemsByShelf((current) => ({ ...current, [shelfId]: next }));
    await persistShelfItems(shelfId, next, list);
  };

  const togglePin = async (shelfId: string, itemId: string) => {
    const list = itemsByShelf[shelfId] ?? [];
    const next = list.map((item) =>
      item.id === itemId ? { ...item, pinned: !item.pinned } : item,
    );
    next.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    setItemsByShelf((current) => ({ ...current, [shelfId]: next }));
    await persistShelfItems(shelfId, next, list);
  };


  const toggleVisibility = async (shelfId: string, next: boolean) => {
    setShelves((current) =>
      current.map((shelf) => (shelf.id === shelfId ? { ...shelf, isVisible: next } : shelf)),
    );
    try {
      await saveShelfVisibility(shelfId, next);
      toast.success(next ? "Shelf visible" : "Shelf hidden");
    } catch (cause) {
      setShelves((current) =>
        current.map((shelf) => (shelf.id === shelfId ? { ...shelf, isVisible: !next } : shelf)),
      );
      toast.error(cause instanceof Error ? cause.message : "Could not update visibility");
    }
  };

  const removeItem = async (shelfId: string, item: MerchShelfItem) => {
    try {
      await removeShelfItem(item.id);
      setItemsByShelf((current) => ({
        ...current,
        [shelfId]: (current[shelfId] ?? []).filter((row) => row.id !== item.id),
      }));
      toast.success("Removed from shelf");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not remove template");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveShelfOrder(shelves.map((shelf, index) => ({ id: shelf.id, sortOrder: index })));
      const itemRows = Object.values(itemsByShelf).flatMap((list) =>
        list.map((item, index) => ({ id: item.id, sortOrder: index, pinned: item.pinned })),
      );
      await saveItemOrder(itemRows);
      setBaseline(orderSignature(shelves, itemsByShelf));
      toast.success("Merchandising order saved");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save order");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!snapshot) return;
    applySnapshot(snapshot);
  };

  const pickerShelf = shelves.find((shelf) => shelf.id === pickerShelfId) ?? null;
  const pickerExisting = new Set(
    (pickerShelfId ? itemsByShelf[pickerShelfId] ?? [] : []).map((item) => item.templateId),
  );
  const pickerResults = (snapshot?.templates ?? []).filter((template) => {
    if (pickerExisting.has(template.id)) return false;
    const query = pickerSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      template.name.toLowerCase().includes(query) ||
      (template.description ?? "").toLowerCase().includes(query)
    );
  });

  const confirmAdd = async () => {
    if (!pickerShelfId || !pickerSelection.length) return;
    setPickerBusy(true);
    try {
      const existing = itemsByShelf[pickerShelfId] ?? [];
      const nextSort = existing.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0);
      await addTemplatesToShelf(pickerShelfId, pickerSelection, nextSort);
      toast.success(`Added ${pickerSelection.length} template(s)`);
      setPickerShelfId(null);
      setPickerSelection([]);
      setPickerSearch("");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not add templates");
    } finally {
      setPickerBusy(false);
    }
  };

  return (
    <SiteShell>
      <div className="container mx-auto max-w-5xl px-4 pb-28 pt-10 sm:pt-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Admin</p>
            <h1 className="mt-2 font-display text-3xl font-black tracking-tight text-white">
              Campaign Merchandising
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Curate marketplace shelves: drag to reorder shelves, drag templates inside editorial
              shelves, pin the hero picks, and toggle what's visible.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              className="rounded-full border-white/15 bg-white/5"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full border-white/15 bg-white/5">
              <Link to="/admin/templates">Template Workbench</Link>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-[1.75rem] border border-rose-300/30 bg-rose-500/10 p-5 text-sm text-rose-100">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Could not load merchandising data
            </p>
            <p className="mt-2 text-rose-100/80">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              className="mt-3 rounded-full border-white/20 bg-white/5"
            >
              Try again
            </Button>
          </div>
        ) : !shelves.length ? (
          <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-6 text-center text-sm text-slate-300">
            No marketplace shelves exist yet.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleShelfDragEnd}
          >
            <SortableContext items={shelves.map((shelf) => shelf.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {shelves.map((shelf) => (
                  <ShelfCard
                    key={shelf.id}
                    shelf={shelf}
                    items={itemsByShelf[shelf.id] ?? []}
                    templateMap={templateMap}
                    onItemDragEnd={handleItemDragEnd(shelf.id)}
                    onToggleVisibility={(next) => void toggleVisibility(shelf.id, next)}
                    onRemoveItem={(item) => void removeItem(shelf.id, item)}
                    onTogglePin={(item) => togglePin(shelf.id, item.id)}
                    onAddClick={() => {
                      setPickerShelfId(shelf.id);
                      setPickerSelection([]);
                      setPickerSearch("");
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-300/25 bg-slate-950/95 backdrop-blur">
          <div className="container mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">
              Unsaved changes
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={saving}
                className="rounded-full border-white/15 bg-white/5"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save order
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={Boolean(pickerShelfId)}
        onOpenChange={(open) => {
          if (!open) setPickerShelfId(null);
        }}
      >
        <DialogContent className="max-w-lg border-white/10 bg-slate-950/95 text-white">
          <DialogHeader>
            <DialogTitle className="font-display text-xl tracking-[-0.02em]">
              Add to {pickerShelf?.title ?? "shelf"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Marketplace-live templates only. Templates already on this shelf are hidden.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              placeholder="Search templates"
              className="border-white/10 bg-black/30 pl-9 text-sm"
            />
          </div>

          <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
            {!pickerResults.length ? (
              <p className="rounded-2xl border border-dashed border-white/12 bg-black/20 p-4 text-center text-xs text-slate-400">
                No matching live templates.
              </p>
            ) : (
              pickerResults.map((template) => {
                const checked = pickerSelection.includes(template.id);
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() =>
                      setPickerSelection((current) =>
                        checked
                          ? current.filter((id) => id !== template.id)
                          : [...current, template.id],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition",
                      checked
                        ? "border-cyan-300/60 bg-cyan-300/10"
                        : "border-white/10 bg-black/25 hover:border-white/25",
                    )}
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-slate-900">
                      {template.previewUrl ? (
                        <img src={template.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{template.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">
                        {template.description ?? ""}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">{pickerSelection.length} selected</p>
            <Button
              size="sm"
              onClick={() => void confirmAdd()}
              disabled={!pickerSelection.length || pickerBusy}
              className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              {pickerBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add to shelf
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SiteShell>
  );
}
