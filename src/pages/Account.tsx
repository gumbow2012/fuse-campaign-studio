import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const Account = () => {
  const { profile, refreshProfile, user } = useAuth();
  const [name, setName] = useState(profile?.name ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSaveName = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name })
        .eq("user_id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast({ title: "Profile updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      toast({ title: "Password updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6 max-w-xl">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Account</h1>
        <p className="text-muted-foreground text-sm mb-8">Manage your profile settings.</p>

        {/* Profile */}
        <div className="rounded-xl border border-border/40 bg-card p-6 mb-6">
          <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Profile</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground text-xs font-bold uppercase tracking-wider">Email</Label>
              <Input value={profile?.email ?? ""} disabled className="bg-secondary border-border text-muted-foreground mt-1" />
            </div>
            <div>
              <Label className="text-foreground text-xs font-bold uppercase tracking-wider">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-secondary border-border text-foreground mt-1" />
            </div>
            <Button onClick={handleSaveName} disabled={saving} className="gradient-primary text-primary-foreground font-bold border-0">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Password */}
        <div className="rounded-xl border border-border/40 bg-card p-6">
          <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Change Password</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-foreground text-xs font-bold uppercase tracking-wider">New Password</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} className="bg-secondary border-border text-foreground mt-1" />
            </div>
            <Button onClick={handleChangePassword} disabled={saving || newPassword.length < 6} variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
              Update Password
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
