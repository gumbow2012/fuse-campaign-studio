import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, hasAppAccess, signOut } = useAuth();
  const reason = new URLSearchParams(location.search).get("reason");

  useEffect(() => {
    if (!user || authLoading) return;
    navigate(hasAppAccess ? "/app/lab/templates" : "/dashboard", { replace: true });
  }, [user, hasAppAccess, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;
        toast({ title: "Check your email", description: "Account created. Confirm your email, then sign in." });
      }
    } catch (err: any) {
      const description =
        err?.message === "Invalid login credentials"
          ? "Invalid email or password."
          : err?.message ?? "Authentication failed. Please try again.";

      toast({ title: "Auth Error", description, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-16 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-border/40 bg-card p-8">
            <h1 className="font-display text-2xl font-black text-foreground mb-2 text-center">
              {isLogin ? "Welcome Back" : "Create Account"}
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-8">
              {isLogin ? "Sign in to your FUSE account" : "Create a customer account"}
            </p>

            {reason === "restricted" ? (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                This page is reserved for admin/dev access. Sign in to continue to your dashboard.
              </div>
            ) : null}

            {user ? (
              <div className="mb-6 rounded-lg border border-border/40 bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                <p>{hasAppAccess ? "Admin/dev access granted. Opening the template lab." : "Signed in. Opening your customer dashboard."}</p>
                <Button type="button" variant="ghost" className="mt-3 px-0" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <Label htmlFor="name" className="text-foreground text-xs font-bold uppercase tracking-wider">Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="bg-secondary border-border text-foreground mt-1" />
                </div>
              )}
              <div>
                <Label htmlFor="email" className="text-foreground text-xs font-bold uppercase tracking-wider">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@brand.com" required className="bg-secondary border-border text-foreground mt-1" />
              </div>
              <div>
                <Label htmlFor="password" className="text-foreground text-xs font-bold uppercase tracking-wider">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="bg-secondary border-border text-foreground mt-1" />
              </div>

              <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm">
                {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>
            <div className="mt-6 rounded-lg border border-border/40 bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
              MVP uses email/password only. Social sign-in is deferred.
            </div>

            <div className="mt-6 text-center">
              <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>

            {isLogin && (
              <div className="mt-4 text-center">
                <button onClick={() => navigate("/forgot-password")} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  Forgot password?
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
