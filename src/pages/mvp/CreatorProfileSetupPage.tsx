import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Layers3, Loader2, Rocket, Coins, Upload } from "lucide-react";
import PageMeta from "@/components/mvp/PageMeta";
import FuseCore from "@/components/fuse/FuseCore";
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

const labelClass = "font-display text-[10px] font-bold uppercase tracking-[0.24em] text-white/45";
const inputClass =
  "mt-2 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5 text-base text-white outline-none transition placeholder:text-white/30 focus:border-cyan-300/60";

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
};

const BrandLockup = () => (
  <div className="flex flex-col items-center">
    <div className="flex items-center gap-3">
      <img src="/fuse-icon.png" alt="" aria-hidden className="h-8 w-8" />
      <img src="/fuse-wordmark.png" alt="FUSE" className="h-6 w-auto" />
    </div>
    <div className="mt-4 h-0.5 w-14 bg-cyan-300" />
  </div>
);

const ACTIVATION_MODULES = [
  { icon: Layers3, label: "BUILD", line: "Create your first template" },
  { icon: Rocket, label: "PUBLISH", line: "Put it on your Creator profile" },
  { icon: Coins, label: "EARN", line: "Earn from eligible template runs" },
];

/**
 * Premium activation sequence — presentation only.
 * Credits are granted server-side by handle_new_user; the count-up is purely visual.
 */
const ActivationSuccess = ({ onEnter }: { onEnter: () => void }) => {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(reduced ? 3 : 0);
  const [credits, setCredits] = useState(reduced ? 4000 : 0);

  useEffect(() => {
    track("creator_access_activated_view");
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timers = [
      window.setTimeout(() => setPhase(1), 450),
      window.setTimeout(() => setPhase(2), 1050),
      window.setTimeout(() => setPhase(3), 1650),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);

  useEffect(() => {
    if (reduced || phase < 2) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 1100);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCredits(Math.round(4000 * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced]);

  const settled = credits >= 4000;

  return (
    <div className="mt-12 text-center">
      <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
        {/* radial cyan energy */}
        <span
          className={`absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(186_100%_62%/0.28),transparent_70%)] transition-opacity duration-700 ${
            phase >= 1 ? "opacity-100" : "opacity-0"
          }`}
        />
        <span
          className={`absolute inset-2 rounded-full border transition-all duration-700 ${
            phase >= 1 ? "scale-100 border-cyan-300/70 opacity-100" : "scale-75 border-white/10 opacity-0"
          }`}
        />
        <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
          <FuseCore size={30} active={phase >= 1} />
          {!reduced && phase < 2 && (
            <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.2s_ease-in-out_1] bg-gradient-to-r from-transparent via-white/45 to-transparent" />
          )}
        </span>
        {phase >= 2 && (
          <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300">
            <Check className="h-4 w-4 text-[#0a0a0a]" strokeWidth={3} />
          </span>
        )}
      </div>

      <h1
        className={`mt-7 font-display text-3xl font-bold uppercase tracking-[0.04em] text-white transition-all duration-500 ${
          phase >= 2 ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        You're in.
      </h1>
      <p className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300">
        VIP Creator Access activated
      </p>
      <p className="mt-3 text-sm text-white/65">
        4,000 Creator credits are ready. Your Creator profile is live.
      </p>

      <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-full border border-cyan-300/30 bg-cyan-300/[0.07] px-5 py-2.5">
        <span className="font-display text-base font-bold tracking-[0.08em] text-cyan-300">
          {settled ? "4,000 Creator credits" : `+${credits.toLocaleString()} CR`}
        </span>
        {settled && (
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">
            · Ready
          </span>
        )}
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {ACTIVATION_MODULES.map(({ icon: Icon, label, line }, index) => (
          <li
            key={label}
            className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-all duration-500 sm:flex-col ${
              phase >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
            style={{ transitionDelay: reduced ? undefined : `${index * 110}ms` }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
              <Icon className="h-4 w-4 text-cyan-300" />
            </span>
            <span className="sm:mt-2.5">
              <span className="block font-display text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                {label}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-white/55">{line}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onEnter}
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-4 font-display text-sm font-bold uppercase tracking-[0.1em] text-[#0a0a0a] transition hover:bg-cyan-200"
      >
        Enter creator studio
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-3 text-xs text-white/40">Your first goal: publish your first template.</p>
    </div>
  );
};

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
      track("creator_profile_setup_started");
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
        <BrandLockup />

        {loading ? (
          <p className="mt-12 flex items-center justify-center gap-2 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" /> Loading your profile…
          </p>
        ) : done ? (
          <ActivationSuccess
            onEnter={() => {
              track("creator_studio_entered");
              navigate("/app/creator");
            }}
          />
        ) : (
          <div className="mt-10">
            <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-[0.03em] text-white">
              Set up your creator profile
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              One quick step, then you can start building. You can change any of this later.
            </p>

            {/* Live creator page preview */}
            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className={labelClass}>Your FUSE Creator page</p>
              <p className="mt-2 break-all text-xs text-cyan-300">
                fuse-us.com/creator/{cleanHandle || "handle"}
              </p>
              <div className="mt-4 flex items-center gap-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" aria-hidden className="h-11 w-11 rounded-full object-cover" />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-sm font-bold text-cyan-300">
                    {avatarInitials(displayName || cleanHandle)}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-bold uppercase tracking-[0.06em] text-white">
                    {displayName || "Your name"}
                  </span>
                  <span className="block truncate text-xs text-white/50">@{cleanHandle || "handle"}</span>
                </span>
              </div>
              <p className="mt-3 text-xs text-white/40">Templates you publish will live here.</p>
            </div>

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
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/30 disabled:opacity-60"
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
              {handleState === "checking" && <p className="mt-2 text-xs text-white/40">Checking availability…</p>}
              {handleState === "free" && <p className="mt-2 text-xs text-cyan-300">Available</p>}
              {handleState === "invalid" && (
                <p className="mt-2 text-xs text-amber-300">
                  Use 3–30 lowercase letters, numbers, dashes or underscores.
                </p>
              )}
              {handleState === "taken" && (
                <p className="mt-2 text-xs text-amber-300">
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
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-4 font-display text-sm font-bold uppercase tracking-[0.1em] text-[#0a0a0a] transition hover:bg-cyan-200 disabled:opacity-60"
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
