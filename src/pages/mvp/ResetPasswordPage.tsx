import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!window.location.hash.includes("type=recovery")) {
      toast({
        title: "Invalid reset link",
        description: "This recovery link is invalid or expired.",
        variant: "destructive",
      });
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Password updated", description: "Sign in with the new password." });
      navigate("/auth", { replace: true });
    } catch (error) {
      toast({
        title: "Password update failed",
        description: error instanceof Error ? error.message : "Could not update your password.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <section className="container flex min-h-[calc(100vh-90px)] items-center justify-center py-12">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Recovery</p>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.05em] text-white">Choose a new password</h1>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </form>

          <Link to="/auth" className="mt-6 inline-block text-sm text-slate-400 hover:text-white">
            Back to sign in
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
