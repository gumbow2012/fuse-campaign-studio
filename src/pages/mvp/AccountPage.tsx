import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import AccountHeader from "@/components/mvp/AccountHeader";
import BrandActivationBanner from "@/components/brand/BrandActivationBanner";
import CreditsOverviewCard from "@/components/mvp/membership/CreditsOverviewCard";
import CreditUsageHistory from "@/components/mvp/membership/CreditUsageHistory";
import AchievementsSection from "@/components/mvp/AchievementsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_VISUAL_BUDGET_TOTAL, getAdminVisualCreditsRemaining, getAdminVisualCreditsSpent } from "@/lib/adminBudget";
import { updateAccountProfile } from "@/services/account";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarInitials, fileToAvatarDataUrl } from "@/lib/avatarImage";

export default function AccountPage() {
  const { isAdmin, profile, refreshProfile, user } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [adminVisualSpent, setAdminVisualSpent] = useState(0);
  const trimmedName = name.trim();
  const adminVisualRemaining = getAdminVisualCreditsRemaining();

  useEffect(() => {
    setName(profile?.name ?? "");
  }, [profile?.name]);

  useEffect(() => {
    setAvatarDataUrl(undefined);
  }, [profile?.avatar_url]);

  const currentAvatar =
    avatarDataUrl === undefined
      ? profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined) || ""
      : avatarDataUrl ?? "";

  const handlePickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatarDataUrl(await fileToAvatarDataUrl(file));
    } catch (error) {
      toast({
        title: "Could not use that photo",
        description: error instanceof Error ? error.message : "Please try a different image.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    setAdminVisualSpent(getAdminVisualCreditsSpent());
  }, []);



  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);

    try {
      await updateAccountProfile({
        name: trimmedName,
        ...(avatarDataUrl === undefined ? {} : { avatarDataUrl }),
      });
      // Refresh the auth context so the header avatar updates without signing out.
      await refreshProfile();
      setAvatarDataUrl(undefined);
      toast({ title: "Profile updated" });
    } catch (error) {
      toast({
        title: "Profile update failed",
        description: error instanceof Error ? error.message : "Could not save your profile.",
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePassword = async () => {
    setSavingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      toast({ title: "Password updated" });
    } catch (error) {
      toast({
        title: "Password update failed",
        description: error instanceof Error ? error.message : "Could not update your password.",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <SiteShell>
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Account</p>
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">Manage the account that runs Fuse.</h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
          >
            <Link to="/pricing">Manage membership</Link>
          </Button>
        </div>

        <BrandActivationBanner surface="account" className="mt-8" />

        <div className="mt-8">
          <AccountHeader />
        </div>

        {isAdmin ? (
          <p className="mt-3 text-xs text-slate-500">
            Admin accounts bypass credit locks. Visual budget {adminVisualRemaining}/{ADMIN_VISUAL_BUDGET_TOTAL} remaining. Spent {adminVisualSpent}.
          </p>
        ) : null}

        <div className="mt-6 grid gap-6">


          <div className="space-y-6">
            <CreditsOverviewCard buyCreditsHref="/membership?tab=credits" />

            <CreditUsageHistory />

            <AchievementsSection />


            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Profile</p>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Avatar className="h-16 w-16 rounded-2xl border border-white/10">
                  <AvatarImage src={currentAvatar} alt="Your profile photo" />
                  <AvatarFallback className="rounded-2xl bg-cyan-200/10 font-sans text-base font-bold text-cyan-300">
                    {avatarInitials(profile?.name || profile?.email || user?.email || "")}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <p className="font-sans text-sm text-white">Profile photo</p>
                  <p className="font-sans text-xs text-muted-foreground">
                    Square JPG or PNG. Shown in the header and on your creator profile.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-full border-white/15 bg-white/5 text-xs text-foreground hover:bg-white/10"
                    >
                      Choose photo
                    </Button>
                    {currentAvatar ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAvatarDataUrl(null)}
                        className="rounded-full text-xs text-muted-foreground hover:text-foreground"
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    aria-label="Upload profile photo"
                    onChange={(event) => {
                      void handlePickPhoto(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="account-email"
                    value={profile?.email ?? user?.email ?? ""}
                    disabled
                    className="rounded-2xl border-white/10 bg-white/[0.03] text-white disabled:opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-name" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Display name
                  </Label>
                  <Input
                    id="account-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveName}
                disabled={
                  savingName ||
                  trimmedName.length < 2 ||
                  (trimmedName === (profile?.name ?? "") && avatarDataUrl === undefined)
                }
                className="mt-6 rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {savingName ? "Saving..." : "Save profile"}
              </Button>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Security</p>
              <div className="mt-5 space-y-2">
                <Label htmlFor="account-password" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  New password
                </Label>
                <Input
                  id="account-password"
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                />
              </div>

              <Button
                variant="outline"
                onClick={handleUpdatePassword}
                disabled={savingPassword || password.length < 6}
                className="mt-6 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                {savingPassword ? "Updating..." : "Update password"}
              </Button>
            </section>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
