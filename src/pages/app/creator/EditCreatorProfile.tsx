/**
 * FUSE Creator — edit your OWN public profile (/creator/settings/edit).
 *
 * Public fields only. Avatar gets a square crop (zoom + drag-free centre crop
 * via canvas) before upload; the banner uploads as-is. Nothing here touches
 * generation, credits, Stripe or billing.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/contexts/AuthContext";
import {
  CREATOR_ACCENTS,
  CREATOR_SPECIALTIES,
  DEFAULT_ACCENT,
  accentStyle,
  resolveAccent,
} from "@/lib/creatorAccents";
import {
  getOwnCreatorProfile,
  normalizeHandle,
  uploadCreatorImage,
  upsertOwnCreatorProfile,
  validateHandle,
} from "@/services/creatorProfile";

const AVATAR_SIZE = 512;

/** Centre-square crop at the chosen zoom, rendered through a canvas. */
async function cropSquare(file: File, zoom: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height) / Math.max(1, zoom);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare that image.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare that image."))),
      "image/jpeg",
      0.92,
    ),
  );
}

export default function EditCreatorProfile() {
  const navigate = useNavigate();
  const { user, authStatus } = useAuth();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [accentId, setAccentId] = useState<string>(DEFAULT_ACCENT);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getOwnCreatorProfile()
      .then((row) => {
        if (cancelled || !row) return;
        setHandle(row.handle);
        setDisplayName(row.display_name);
        setBio(row.bio ?? "");
        setDescription(row.description ?? "");
        setLocation(row.location ?? "");
        setWebsite(row.website ?? "");
        setInstagram(row.instagram ?? "");
        setTiktok(row.tiktok ?? "");
        setXHandle(row.x_handle ?? "");
        setPortfolio(row.portfolio_url ?? "");
        setSpecialties(row.specialties ?? []);
        setAccentId(resolveAccent(row.accent).id);
        setAvatarUrl(row.avatar_url);
        setBannerUrl(row.banner_url);
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not load your profile"),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingAvatar) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingAvatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingAvatar]);

  function toggleSpecialty(value: string) {
    setSpecialties((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  }

  async function handleBanner(file: File) {
    try {
      const { url } = await uploadCreatorImage("banner", file);
      setBannerUrl(url);
      toast.success("Banner uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Banner upload failed");
    }
  }

  async function save() {
    const handleError = validateHandle(handle);
    if (handleError) {
      toast.error(handleError);
      return;
    }
    setSaving(true);
    try {
      let nextAvatar = avatarUrl;
      if (pendingAvatar) {
        const cropped = await cropSquare(pendingAvatar, zoom);
        const { url } = await uploadCreatorImage("avatar", cropped);
        nextAvatar = url;
      }
      const saved = await upsertOwnCreatorProfile({
        handle,
        display_name: displayName,
        avatar_url: nextAvatar,
        banner_url: bannerUrl,
        bio,
        description,
        location,
        website,
        instagram,
        tiktok,
        x_handle: xHandle,
        portfolio_url: portfolio,
        specialties,
        accent: accentId,
        is_public: true,
      });
      setAvatarUrl(saved.avatar_url);
      setPendingAvatar(null);
      toast.success("Profile saved");
      navigate(`/creator/${saved.handle}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  const accent = resolveAccent(accentId);

  if (authStatus !== "initializing_session" && !user) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-2xl px-4 py-12 text-sm text-muted-foreground">
          Please sign in to edit your creator profile.
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageMeta
        title="Edit creator profile · FUSE"
        description="Customize your public FUSE creator profile: avatar, banner, bio, specialties and accent."
      />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8" style={accentStyle(accent)}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Edit creator profile</h1>
          <p className="text-xs text-muted-foreground">
            Public information only — nothing here touches your billing details or account email.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {/* images */}
            <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Images</h2>
              <div className="flex flex-wrap items-center gap-5">
                <div
                  className="h-24 w-24 overflow-hidden rounded-full border-2 bg-background"
                  style={{ borderColor: "var(--creator-accent)" }}
                >
                  {avatarPreview || avatarUrl ? (
                    <img
                      src={avatarPreview ?? avatarUrl ?? ""}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                      style={pendingAvatar ? { transform: `scale(${zoom})` } : undefined}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No avatar
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Button variant="outline" onClick={() => avatarInput.current?.click()}>
                    Choose avatar
                  </Button>
                  <input
                    ref={avatarInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        setPendingAvatar(file);
                        setZoom(1);
                      }
                      event.target.value = "";
                    }}
                  />
                  {pendingAvatar ? (
                    <div className="w-56 space-y-1">
                      <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Crop zoom
                      </Label>
                      <Slider
                        value={[zoom]}
                        min={1}
                        max={3}
                        step={0.05}
                        onValueChange={([value]) => setZoom(value ?? 1)}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Banner (optional)
                </Label>
                <div className="h-24 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
                  {bannerUrl ? (
                    <img src={bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <Button variant="outline" onClick={() => bannerInput.current?.click()}>
                  Upload banner
                </Button>
                <input
                  ref={bannerInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleBanner(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </section>

            {/* identity */}
            <section className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-5 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Handle</Label>
                <Input
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  onBlur={() => setHandle((prev) => normalizeHandle(prev))}
                  placeholder="your-handle"
                />
                <p className="text-[11px] text-muted-foreground">fuse.app/creator/{normalizeHandle(handle) || "…"}</p>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Short bio</Label>
                <Input value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>About</Label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Location</Label>
                <Input value={location} onChange={(event) => setLocation(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={website} onChange={(event) => setWebsite(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input value={instagram} onChange={(event) => setInstagram(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>TikTok</Label>
                <Input value={tiktok} onChange={(event) => setTiktok(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>X</Label>
                <Input value={xHandle} onChange={(event) => setXHandle(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Portfolio link</Label>
                <Input value={portfolio} onChange={(event) => setPortfolio(event.target.value)} />
              </div>
            </section>

            {/* specialties */}
            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Specialties</h2>
              <div className="flex flex-wrap gap-2">
                {CREATOR_SPECIALTIES.map((specialty) => {
                  const active = specialties.includes(specialty);
                  return (
                    <button
                      key={specialty}
                      type="button"
                      onClick={() => toggleSpecialty(specialty)}
                      className="rounded-full border px-3 py-1 text-xs transition-colors"
                      style={
                        active
                          ? {
                              borderColor: "var(--creator-accent)",
                              backgroundColor: `rgba(var(--creator-accent-rgb), 0.14)`,
                              color: "var(--creator-accent)",
                            }
                          : undefined
                      }
                    >
                      {specialty}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* accent */}
            <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Accent</h2>
              <p className="text-[11px] text-muted-foreground">
                Tints glow, badges, button highlight and dividers only — the FUSE dark base stays put.
              </p>
              <div className="flex flex-wrap gap-2">
                {CREATOR_ACCENTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAccentId(option.id)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                    style={{
                      borderColor: accentId === option.id ? option.hex : "rgba(255,255,255,0.1)",
                      boxShadow: accentId === option.id ? `0 0 20px -8px ${option.hex}` : undefined,
                    }}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: option.hex }}
                      aria-hidden
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            </section>

            <div className="flex items-center gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </Button>
              <Button variant="ghost" onClick={() => navigate(-1)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
