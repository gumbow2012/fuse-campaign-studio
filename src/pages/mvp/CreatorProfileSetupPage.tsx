import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Loader2, Upload } from "lucide-react";
import PageMeta from "@/components/mvp/PageMeta";
import fuseLogo from "@/assets/fuse-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics/track";
import { avatarInitials } from "@/lib/avatarImage";
import {
  getOwnCreatorProfile,
  isHandleAvailable,
  normalizeHandle,
  uploadCreatorImage,
  upsertOwnCreatorProfile,
  validateHandle,
} from "@/services/creatorProfile";
import { CREATOR_INVITE_PREFILL_KEY } from "@/pages/mvp/CreatorInviteRedirectPage";

/** "@x" | "x" | "instagram.com/x" -> "x" */
function normalizeInstagram(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/[/?#].*$/, "")
    .trim();
}

type HandleState = "idle" | "checking" | "free" | "taken" | "invalid";

const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-base text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60";

/**
 * /creator/setup — single short creator profile step after an invite is claimed.
 * Roles and credits are granted server-side by handle_new_user; nothing here grants anything.
 */
const CreatorProfileSetupPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      track("creator_profile_setup_view");
      let prefill: { firstName?: string | null; instagramHandle?: string | null; displayName?: string | null } = {};
      try {
        const raw = window.localStorage.getItem(CREATOR_INVITE_PREFILL_KEY);
        if (raw) prefill = JSON.parse(raw) ?? {};
        window.localStorage.removeItem(CREATOR_INVITE_PREFILL_KEY);
      } catch {
        /* ignore */
      }

      const existing = await getOwnCreatorProfile().catch(() => null);
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      const email = sessionData.session?.user?.email ?? "";
      setDisplayName(
        existing?.display_name || prefill.displayName || prefill.firstName || "",
      );
      setHandle(
        existing?.handle ||
          normalizeHandle(prefill.instagramHandle || prefill.displayName || prefill.firstName || email.split("@")[0] || ""),
      );
      setInstagram(existing?.instagram || normalizeInstagram(prefill.instagramHandle || ""));
      setBio(existing?.bio || "");
      setAvatarUrl(existing?.avatar_url ?? null);
      setLoading(false);
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Live handle availability.
  useEffect(() => {
    if (loading) return;
    const candidate = normalizeHandle(handle);
    if (!candidate) {
      setHandleState("idle");
      setSuggestion(null);
      return;
    }
    if (validateHandle(candidate)) {
      setHandleState("invalid");
      setSuggestion(null);
      return;
    }
    setHandleState("checking");
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const ownId = sessionData.session?.user?.id;
        const free = await isHandleAvailable(candidate, ownId);
        if (cancelled) return;
        if (free) {
          setHandleState("free");
          setSuggestion(null);
          return;
        }
        setHandleState("taken");
        for (const variant of [`${candidate}2`, `${candidate}-ai`, `${candidate}-fuse`]) {
          if (!validateHandle(variant) && (await isHandleAvailable(variant, ownId))) {
            if (!cancelled) setSuggestion(variant);
            return;
          }
        }
      } catch {
        if (!cancelled) setHandleState("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handle, loading]);

  const cleanHandle = useMemo(() => normalizeHandle(handle), [handle]);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadCreatorImage("avatar", file);
      setAvatarUrl(url);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload that photo.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!displayName.trim()) {
      setError("Add a display name.");
      return;
    }
    const handleError = validateHandle(cleanHandle);
    if (handleError) {
      setError(handleError);
      return;
    }
    if (handleState === "taken") {
      setError("That handle is already taken.");
      return;
    }
    setSaving(true);
    try {
      await upsertOwnCreatorProfile({
        handle: cleanHandle,
        display_name: displayName.trim(),
        instagram: normalizeInstagram(instagram) || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        is_public: true,
      });
      track("creator_profile_completed");
      setDone(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-12 sm:px-6">
      <PageMeta
        title="Set up your creator profile | FUSE"
        description="Create your FUSE Creator profile and claim your creator link."
        path="/creator/setup"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <div className="inline-block rounded-xl bg-white px-5 py-3">
            <img src={fuseLogo} alt="FUSE" className="h-8 w-auto" />
          </div>
          <div className="mx-auto mt-4 h-0.5 w-14 bg-cyan-300" />
        </div>

        {loading ? (
          <p className="mt-12 flex items-center justify-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> Loading your profile…
          </p>
        ) : done ? (
          <div className="mt-12 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-cyan-300">
              <Check className="h-6 w-6 text-[#0a0a0a]" />
            </span>
            <h1 className="mt-5 text-3xl font-bold uppercase text-white">You're in</h1>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              VIP Creator Access activated
            </p>
            <p className="mt-3 text-sm text-white/65">4,000 creator credits added</p>
            <p className="text-sm text-white/65">Your Creator profile is ready.</p>
            <button
              type="button"
              onClick={() => {
                track("creator_studio_entered");
                navigate("/app/creator");
              }}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-4 text-sm font-bold uppercase tracking-wide text-[#0a0a0a]"
            >
              Enter creator studio
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mt-10">
            <h1 className="text-2xl font-bold uppercase leading-tight text-white">
              Set up your creator profile
            </h1>
            <p className="mt-2 text-sm text-white/60">
              One quick step. You can change all of this later.
            </p>

            <div className="mt-8 flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Your profile photo"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-lg font-bold text-cyan-300">
                  {avatarInitials(displayName || cleanHandle)}
                </span>
              )}
              <div>
                <p className={labelClass}>Profile photo</p>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {avatarUrl ? "Replace" : "Upload"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void pickAvatar(event.target.files?.[0])}
                />
              </div>
            </div>

            <div className="mt-7">
              <label className={labelClass} htmlFor="creator-display-name">
                Display name
              </label>
              <input
                id="creator-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Your name or studio"
                className={inputClass}
              />
            </div>

            <div className="mt-5">
              <label className={labelClass} htmlFor="creator-handle">
                Creator handle
              </label>
              <input
                id="creator-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputClass}
              />
              <p className="mt-2 break-all text-xs text-white/45">
                Your creator URL: <span className="text-cyan-300">fuse-us.com/creator/{cleanHandle || "handle"}</span>
              </p>
              {handleState === "checking" && <p className="mt-1 text-xs text-white/40">Checking availability…</p>}
              {handleState === "free" && <p className="mt-1 text-xs text-cyan-300">Available</p>}
              {handleState === "invalid" && (
                <p className="mt-1 text-xs text-amber-300">
                  Use 3–30 lowercase letters, numbers, dashes or underscores.
                </p>
              )}
              {handleState === "taken" && (
                <p className="mt-1 text-xs text-amber-300">
                  Taken.
                  {suggestion && (
                    <button
                      type="button"
                      onClick={() => setHandle(suggestion)}
                      className="ml-1 font-semibold text-cyan-300 underline"
                    >
                      Use {suggestion}
                    </button>
                  )}
                </p>
              )}
            </div>

            <div className="mt-5">
              <label className={labelClass} htmlFor="creator-instagram">
                Instagram (optional)
              </label>
              <input
                id="creator-instagram"
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
                onBlur={() => setInstagram(normalizeInstagram(instagram))}
                placeholder="@yourhandle"
                autoCapitalize="none"
                className={inputClass}
              />
            </div>

            <div className="mt-5">
              <label className={labelClass} htmlFor="creator-bio">
                Short bio (optional)
              </label>
              <textarea
                id="creator-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value.slice(0, 200))}
                rows={3}
                placeholder="What kind of campaigns do you make?"
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1 text-right text-[11px] text-white/35">{bio.length}/160</p>
            </div>

            {error && <p className="mt-5 text-sm text-amber-300">{error}</p>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-4 text-sm font-bold uppercase tracking-wide text-[#0a0a0a] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Complete setup
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </main>
  );
};

export default CreatorProfileSetupPage;
