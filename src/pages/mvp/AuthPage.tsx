import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(searchParams.get("mode") === "signup" ? "signup" : "signin");
    setStep("request");
    setToken("");
  }, [searchParams]);

  useEffect(() => {
    if (!user || authLoading) return;
    navigate("/app/templates", { replace: true });
  }, [authLoading, navigate, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      if (step === "request") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            // Use one code-based auth path so a fresh email never silently dead-ends.
            shouldCreateUser: true,
            data: name ? { full_name: name } : undefined,
            emailRedirectTo: getAbsoluteSiteUrl("/auth"),
          },
        });
        if (error) throw error;
        setStep("verify");
        toast({
          title: "Code sent",
          description: `Enter the 6-digit code we sent to ${email}.`,
        });
      } else {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });
        if (error) throw error;
        toast({
          title: "Verified",
          description: "Your account is active.",
        });
        navigate("/app/templates", { replace: true });
      }
    } catch (error) {
      toast({
        title: "Authentication failed",
        description:
          error instanceof Error && error.message === "Invalid login credentials"
            ? "Invalid email or code."
            : error instanceof Error
              ? error.message
              : "Could not complete authentication.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: name ? { full_name: name } : undefined,
          emailRedirectTo: getAbsoluteSiteUrl("/auth"),
        },
      });
      if (error) throw error;
      toast({
        title: "Code resent",
        description: `A new code was sent to ${email}.`,
      });
    } catch (error) {
      toast({
        title: "Could not resend code",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <section className="container flex min-h-[calc(100vh-90px)] items-center py-12">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Access</p>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">
              {mode === "signin" ? "Sign in with your email code." : "Create a Fuse account with a code."}
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Enter your email, we send a 6-digit code, you enter it here, and you are in. No dead-end signup links and no password bullshit.
            </p>

            <div className="mt-8 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/10 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100">Account flow</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <li>Enter your email</li>
                <li>Get a 6-digit code</li>
                <li>Type the code here and continue</li>
                <li>First-time emails are created automatically</li>
                <li>Activate membership when you are ready to run as a customer</li>
                <li>Open Template Studio and run workflows</li>
              </ul>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${mode === "signin" ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${mode === "signup" ? "bg-cyan-300 text-slate-950" : "text-slate-300"}`}
              >
                Create account
              </button>
            </div>

            {user ? (
              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
                <p className="text-sm text-slate-200">You are already authenticated.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
                    <Link to="/app/templates">Open templates</Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void signOut()}
                    className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                {mode === "signup" && step === "request" ? (
                  <div className="space-y-2">
                    <Label htmlFor="auth-name" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Name
                    </Label>
                    <Input
                      id="auth-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="auth-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={step === "verify"}
                    className="rounded-2xl border-white/10 bg-white/[0.03] text-white"
                  />
                </div>

                {step === "verify" ? (
                  <div className="space-y-2">
                    <Label htmlFor="auth-token" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Verification code
                    </Label>
                    <Input
                      id="auth-token"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={token}
                      onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      className="rounded-2xl border-white/10 bg-white/[0.03] text-white tracking-[0.4em]"
                    />
                    <p className="text-xs text-slate-400">We sent the code to {email}.</p>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                >
                  {submitting
                    ? "Working..."
                    : step === "request"
                      ? mode === "signin"
                        ? "Send sign-in code"
                        : "Send account code"
                      : "Verify code"}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                  {step === "request" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                        className="hover:text-white"
                      >
                        {mode === "signin" ? "Need a name field?" : "Already have an account?"}
                      </button>
                      <span>Same email code flow either way.</span>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("request");
                          setToken("");
                        }}
                        className="hover:text-white"
                      >
                        Change email
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResend()}
                        className="hover:text-white"
                        disabled={submitting}
                      >
                        Resend code
                      </button>
                    </>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
