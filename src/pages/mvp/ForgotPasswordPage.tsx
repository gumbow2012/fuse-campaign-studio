import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAbsoluteSiteUrl("/reset-password"),
      });
      if (error) throw error;
      toast({ title: "Reset email sent", description: "Check your inbox for the recovery link." });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Could not send reset instructions.",
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
          <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.05em] text-white">Reset your password</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            Send a reset link to your email and come back here to set a new password.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recovery-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Email
              </Label>
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            >
              {submitting ? "Sending..." : "Send reset link"}
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
