/**
 * FT6 — "My Avatars" management. Model + management only: no generation,
 * no wiring into the template runner yet.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Star, Trash2, Upload, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { uploadRunInputFile } from "@/services/runInputUpload";
import {
  AVATAR_UPLOAD_TIPS,
  createUserAvatar,
  deleteAvatar,
  listFuseAvatars,
  listMyAvatars,
  toggleFavorite,
  type AvatarProfile,
} from "@/services/avatarProfiles";

const CARD = "rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400";
const MAX_REFERENCES = 5;

function AvatarCard({
  avatar,
  onFavorite,
  onDelete,
}: {
  avatar: AvatarProfile;
  onFavorite?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03]">
      <div className="relative aspect-[3/4] bg-black/50">
        {avatar.thumbnail_url ? (
          <img src={avatar.thumbnail_url} alt={avatar.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">No image</div>
        )}
        {onFavorite ? (
          <button
            type="button"
            onClick={onFavorite}
            aria-label={avatar.favorited ? "Remove from favorites" : "Add to favorites"}
            className="absolute right-2 top-2 rounded-full border border-white/15 bg-black/60 p-1.5"
          >
            <Star
              className={cn("h-3.5 w-3.5", avatar.favorited ? "fill-cyan-300 text-cyan-300" : "text-slate-300")}
            />
          </button>
        ) : null}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{avatar.name}</p>
        {avatar.style_tags.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {avatar.style_tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500 hover:text-rose-300"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AvatarCreator({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [references, setReferences] = useState<string[]>([]);
  const [permission, setPermission] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canSave = Boolean(name.trim()) && references.length > 0 && permission;

  const handleFiles = async (files: FileList) => {
    const room = MAX_REFERENCES - references.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_REFERENCES} images.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        uploaded.push(await uploadRunInputFile(file));
      }
      setReferences((current) => [...current, ...uploaded]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canSave) throw new Error("Add a name, at least one image, and confirm permission.");
      await createUserAvatar({
        name: name.trim(),
        reference_assets: references,
        thumbnail_url: references[0] ?? null,
        visual_description: notes.trim() || null,
        style_tags: tags,
      });
    },
    onSuccess: () => {
      toast.success("Avatar saved");
      queryClient.invalidateQueries({ queryKey: ["my-avatars"] });
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save avatar"),
  });

  return (
    <div className={CARD}>
      <p className="text-lg font-semibold">Create your Avatar</p>
      <p className="mt-1 text-sm text-slate-400">
        Upload 1–{MAX_REFERENCES} clear images of the person. We store them as references only.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className={LABEL}>Avatar name</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Mia — street cast"
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
        </div>
        <div>
          <p className={LABEL}>Style tags</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              placeholder="editorial, streetwear"
              className="border-white/10 bg-black/30 text-white"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const tag = tagDraft.trim();
                if (!tag) return;
                setTags((current) => (current.includes(tag) ? current : [...current, tag]));
                setTagDraft("");
              }}
              className="rounded-full border-white/12 bg-white/[0.03] px-3 text-[11px] uppercase tracking-[0.16em]"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {tags.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/30 px-2.5 py-1 text-xs text-slate-200"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags((current) => current.filter((entry) => entry !== tag))}
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3 text-slate-500 hover:text-rose-300" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <p className={LABEL}>Reference images ({references.length}/{MAX_REFERENCES})</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {references.map((url, index) => (
            <div key={`${url}-${index}`} className="relative h-24 w-20 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setReferences((current) => current.filter((_, i) => i !== index))}
                aria-label="Remove reference"
                className="absolute right-1 top-1 rounded-full bg-black/70 p-1"
              >
                <X className="h-3 w-3 text-slate-200" />
              </button>
            </div>
          ))}
          {references.length < MAX_REFERENCES ? (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (event) => {
                  const files = event.target.files;
                  event.target.value = "";
                  if (files?.length) await handleFiles(files);
                }}
              />
              <span className="inline-flex h-24 w-20 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload
              </span>
            </label>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
        <p className={LABEL}>For best results</p>
        <ul className="mt-2 space-y-1.5">
          {AVATAR_UPLOAD_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-xs text-slate-300">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <p className={LABEL}>Notes (optional)</p>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Wardrobe, hair styling, or look notes that matter for the shoot."
          className="mt-2 border-white/10 bg-black/30 text-white"
        />
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm text-slate-300">
        <Checkbox
          checked={permission}
          onCheckedChange={(value) => setPermission(value === true)}
          className="mt-0.5"
        />
        <span>I confirm I have permission to use this person's likeness.</span>
      </label>

      <div className="mt-5 flex gap-2">
        <Button
          type="button"
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending || uploading}
          className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save avatar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          className="rounded-full text-[11px] uppercase tracking-[0.16em] text-slate-400"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function AvatarProfilesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const myAvatars = useQuery({
    queryKey: ["my-avatars", user?.id],
    queryFn: () => listMyAvatars(user?.id ?? ""),
    enabled: Boolean(user?.id),
  });

  const fuseAvatars = useQuery({
    queryKey: ["fuse-avatars"],
    queryFn: listFuseAvatars,
  });

  const favorite = useMutation({
    mutationFn: (avatar: AvatarProfile) => toggleFavorite(avatar.id, !avatar.favorited),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-avatars"] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update favorite"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAvatar(id),
    onSuccess: () => {
      toast.success("Avatar deleted");
      queryClient.invalidateQueries({ queryKey: ["my-avatars"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete avatar"),
  });

  const mine = myAvatars.data ?? [];
  const fuse = fuseAvatars.data ?? [];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28">
        <h1 className="font-display text-3xl font-semibold tracking-tight">My Avatars</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Save a cast member once and reuse them across campaigns. Management only for now — avatars
          aren't wired into generation yet.
        </p>

        <div className="mt-8 space-y-5">
          {creating ? (
            <AvatarCreator onDone={() => setCreating(false)} />
          ) : (
            <Button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full bg-cyan-300 px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
            >
              <Plus className="h-3.5 w-3.5" /> Create your Avatar
            </Button>
          )}

          {myAvatars.isLoading ? (
            <p className="text-sm text-slate-400">Loading avatars…</p>
          ) : mine.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {mine.map((avatar) => (
                <AvatarCard
                  key={avatar.id}
                  avatar={avatar}
                  onFavorite={() => favorite.mutate(avatar)}
                  onDelete={() => remove.mutate(avatar.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No avatars yet — upload your first cast member.</p>
          )}
        </div>

        {fuse.length ? (
          <section className="mt-14">
            <h2 className="font-display text-xl font-semibold tracking-tight">FUSE Avatars</h2>
            <p className="mt-2 text-sm text-slate-400">Built-in cast, ready to reuse.</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {fuse.map((avatar) => (
                <AvatarCard key={avatar.id} avatar={avatar} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
