/**
 * FT6 / Phase 5 — "My Avatars" management. Saved cast members are used by
 * generation (start-template-run cast_config), so they are reusable everywhere.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Star, Trash2, Upload, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CastPortrait } from "@/components/cast/CastLibrary";
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
        <CastPortrait avatar={avatar} />
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

interface ReferenceSlot {
  id: string;
  label: string;
  preview: string;
  url: string | null;
  status: "uploading" | "done" | "error";
  error?: string;
}

const SLOT_LABELS = ["Front", "3/4 view", "Profile", "Full body", "Detail"];

function AvatarCreator({ onDone, intent = "upload" }: { onDone: () => void; intent?: "generate" | "upload" }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [slots, setSlots] = useState<ReferenceSlot[]>([]);
  const [permission, setPermission] = useState(false);

  // Object URLs are revoked when the creator unmounts.
  useEffect(
    () => () => {
      slots.forEach((slot) => URL.revokeObjectURL(slot.preview));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const uploading = slots.some((slot) => slot.status === "uploading");
  const readyUrls = slots.filter((slot) => slot.status === "done" && slot.url).map((slot) => slot.url as string);
  const canSave = Boolean(name.trim()) && !uploading;

  const patchSlot = (id: string, patch: Partial<ReferenceSlot>) =>
    setSlots((current) => current.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));

  /** One independent upload per file — a bad file never blocks the others. */
  const startUpload = (file: File, slotId: string, label: string) => {
    const preview = URL.createObjectURL(file);
    setSlots((current) => {
      const next: ReferenceSlot = { id: slotId, label, preview, url: null, status: "uploading" };
      return current.some((slot) => slot.id === slotId)
        ? current.map((slot) => (slot.id === slotId ? next : slot))
        : [...current, next];
    });

    void uploadAvatarReference(file)
      .then((url) => patchSlot(slotId, { url, status: "done", error: undefined }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Upload failed";
        patchSlot(slotId, { status: "error", error: message, url: null });
        toast.error(message);
      });
  };

  const addFiles = (files: FileList) => {
    const room = MAX_REFERENCES - slots.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_REFERENCES} reference images.`);
      return;
    }
    Array.from(files)
      .slice(0, room)
      .forEach((file, index) => {
        const position = slots.length + index;
        startUpload(file, crypto.randomUUID(), SLOT_LABELS[position] ?? `Reference ${position + 1}`);
      });
  };

  const removeSlot = (id: string) =>
    setSlots((current) => {
      const target = current.find((slot) => slot.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((slot) => slot.id !== id);
    });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give this cast member a name.");
      await createUserAvatar({
        name: name.trim(),
        reference_assets: readyUrls,
        thumbnail_url: readyUrls[0] ?? null,
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

  const addTile = slots.length < MAX_REFERENCES ? (
    <label className="cursor-pointer">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          event.target.value = "";
          if (files?.length) addFiles(files);
        }}
      />
      <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-300/30 bg-cyan-300/[0.04] text-[10px] uppercase tracking-[0.16em] text-cyan-200">
        <Upload className="h-5 w-5" />
        {slots.length === 0 ? "Add photos" : "+ Add more"}
      </span>
    </label>
  ) : null;

  return (
    <div className={CARD}>
      <p className="text-lg font-semibold">
        {intent === "generate" ? "Describe your cast member" : "Turn your photos into a cast member"}
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Start with the images — 1–{MAX_REFERENCES} clear photos (JPG, PNG or WEBP, up to 15 MB each). We store
        them as references only.
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL}>Reference images ({readyUrls.length}/{MAX_REFERENCES} ready)</p>
          {uploading ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-cyan-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {slots.map((slot) => (
            <div key={slot.id} className="space-y-1.5">
              <div
                className={cn(
                  "relative aspect-[3/4] w-full overflow-hidden rounded-2xl border bg-black/40",
                  slot.status === "error" ? "border-rose-400/50" : "border-white/10",
                )}
              >
                <img
                  src={slot.preview}
                  alt={`${slot.label} reference`}
                  className={cn(
                    "h-full w-full object-cover transition",
                    slot.status !== "done" && "opacity-50",
                  )}
                />
                {slot.status === "uploading" ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
                  </span>
                ) : null}
                {slot.status === "done" ? (
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 p-1">
                    <Check className="h-3 w-3 text-cyan-300" />
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  aria-label={`Remove ${slot.label} reference`}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1"
                >
                  <X className="h-3 w-3 text-slate-200" />
                </button>
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-300">
                  {slot.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label className="cursor-pointer text-[10px] uppercase tracking-[0.16em] text-slate-400 hover:text-cyan-200">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        URL.revokeObjectURL(slot.preview);
                        startUpload(file, slot.id, slot.label);
                      }
                    }}
                  />
                  {slot.status === "error" ? "Retry" : "Replace"}
                </label>
                <button
                  type="button"
                  onClick={() => removeSlot(slot.id)}
                  className="text-[10px] uppercase tracking-[0.16em] text-slate-500 hover:text-rose-300"
                >
                  Remove
                </button>
              </div>
              {slot.status === "error" ? (
                <p className="text-[11px] leading-snug text-rose-300">{slot.error}</p>
              ) : null}
            </div>
          ))}
          {addTile}
        </div>
      </div>

      <div className="mt-6">
        <p className={LABEL}>Avatar name</p>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Mia — street cast"
          className="mt-2 max-w-md border-white/10 bg-black/30 text-white"
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <p className={LABEL}>Style tags (optional)</p>
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
        <div>
          <p className={LABEL}>Notes (optional)</p>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Wardrobe, hair styling, or look notes that matter for the shoot."
            className="mt-2 border-white/10 bg-black/30 text-white"
          />
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
          disabled={!canSave || save.isPending}
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const createIntent = searchParams.get("create") === "generate" ? "generate" : "upload";
  const backTo = searchParams.get("from");

  useEffect(() => {
    if (searchParams.get("create")) setCreating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goBack = () => {
    if (backTo) navigate(backTo);
    else navigate(-1);
  };

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
        <button
          type="button"
          onClick={goBack}
          className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <h1 className="font-display text-3xl font-semibold tracking-tight">My Avatars</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          Save a cast member once and reuse them across every campaign — in the Brand Workspace and
          in the campaign runner.
        </p>

        <div className="mt-8 space-y-5">
          {creating ? (
            <AvatarCreator intent={createIntent} onDone={() => setCreating(false)} />
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
