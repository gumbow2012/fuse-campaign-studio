/**
 * MARKET3 — "Add to collection" affordance for marketplace template cards.
 *
 * Additive only: renders a small icon button that opens a popover with the
 * signed-in user's collections plus an inline "create collection" field.
 * Signed-out visitors get a sign-in nudge instead of a broken write.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FolderPlus, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  addTemplateToCollection,
  createCollection,
  listCollectionItems,
  listMyCollections,
  removeTemplateFromCollection,
} from "@/services/collections";

export default function AddToCollectionButton({
  templateId,
  className,
}: {
  templateId: string;
  className?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ["my-collections", user?.id],
    queryFn: () => listMyCollections(user!.id),
    enabled: Boolean(user?.id) && open,
    staleTime: 30 * 1000,
  });

  const { data: membership = {} } = useQuery({
    queryKey: ["collection-membership", templateId, collections.map((c) => c.id).join(",")],
    enabled: open && collections.length > 0,
    queryFn: async () => {
      const map: Record<string, boolean> = {};
      for (const collection of collections) {
        const items = await listCollectionItems(collection.id);
        map[collection.id] = items.some((item) => item.template_id === templateId);
      }
      return map;
    },
    staleTime: 15 * 1000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-membership"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
  };

  const toggle = useMutation({
    mutationFn: async ({ collectionId, member }: { collectionId: string; member: boolean }) => {
      if (member) await removeTemplateFromCollection(collectionId, templateId);
      else await addTemplateToCollection(collectionId, templateId);
      return !member;
    },
    onSuccess: (added) => {
      invalidate();
      toast({ title: added ? "Added to drop" : "Removed from drop" });
    },
    onError: (error) =>
      toast({
        title: "Could not update drop",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const create = useMutation({
    mutationFn: async (title: string) => {
      const collection = await createCollection({ title });
      await addTemplateToCollection(collection.id, templateId);
      return collection;
    },
    onSuccess: (collection) => {
      setNewTitle("");
      invalidate();
      toast({ title: `Added to “${collection.title}”` });
    },
    onError: (error) =>
      toast({
        title: "Could not create drop",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add to drop"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-cyan-100 backdrop-blur transition-colors hover:border-cyan-200/50 hover:text-white",
            className,
          )}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 border-white/10 bg-slate-950/95 p-3 text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="font-display text-[10px] uppercase tracking-[0.22em] text-cyan-100">
          Add to drop
        </p>

        {!user ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-400">
              Sign in to save templates into shareable drops.
            </p>
            <Button
              asChild
              size="sm"
              className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {isLoading ? (
                <p className="px-1 py-2 text-xs text-slate-400">Loading…</p>
              ) : collections.length === 0 ? (
                <p className="px-1 py-2 text-xs text-slate-400">
                  No drops yet — create your first one below.
                </p>
              ) : (
                collections.map((collection) => {
                  const member = Boolean(membership[collection.id]);
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ collectionId: collection.id, member })}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-white/5"
                    >
                      <span className="truncate">{collection.title}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-slate-500">
                        {collection.is_public ? "Public" : "Private"}
                        {member ? <Check className="h-3.5 w-3.5 text-cyan-200" /> : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <form
              className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (newTitle.trim()) create.mutate(newTitle);
              }}
            >
              <Input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="New drop"
                className="h-9 border-white/10 bg-white/5 text-xs"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!newTitle.trim() || create.isPending}
                className="h-9 w-9 shrink-0 rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </form>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="mt-2 w-full rounded-full text-[11px] uppercase tracking-[0.16em] text-cyan-100"
            >
              <Link to="/app/collections">Manage drops</Link>
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
