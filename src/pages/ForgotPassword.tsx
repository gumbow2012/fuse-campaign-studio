import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import Navbar from "@/components/Navbar";
import { getAbsoluteSiteUrl } from "@/lib/site-url";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAbsoluteSiteUrl("/reset-password"),
      });
      if (error) throw error;
      toast({ title: "Check your email", description: "We sent you a password reset link." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-32 pb-16 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-border/40 bg-card p-8">
          <h1 className="font-display text-2xl font-black text-foreground mb-2 text-center">Reset Password</h1>
          <p className="text-sm text-muted-foreground text-center mb-8">Enter your email and we'll send a reset link.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-foreground text-xs font-bold uppercase tracking-wider">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-secondary border-border text-foreground mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground font-bold border-0">
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
