import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function AccountPage() {
  const { profile, refreshProfile, user } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? "");
  }, [profile?.name]);

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);

    try {
      const { error } = await supabase.from("profiles").update({ name }).eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
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
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">Keep the basics tight.</h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
          >
            <Link to="/billing">Manage membership</Link>
          </Button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="space-y-4 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Current user</p>
              <p className="mt-3 text-xl font-semibold text-white">{profile?.name || "Unnamed account"}</p>
              <p className="mt-1 text-sm text-slate-400">{profile?.email ?? user?.email ?? "No email available"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Credits</p>
                <p className="mt-2 text-3xl font-semibold text-white">{profile?.credits_balance ?? 0}</p>
              </div>
              <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Plan</p>
                <p className="mt-2 text-2xl font-semibold capitalize text-white">{profile?.plan ?? "free"}</p>
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Profile</p>
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
                disabled={savingName}
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
