import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  plan: string | null;
  subscription_status: string | null;
  credits_balance: number;
  stripe_customer_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signOut: async () => {},
  refreshProfile: async () => {},
  refreshSubscription: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data as Profile);
  }, []);

  const checkAdmin = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshSubscription = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      if (data?.subscribed && data?.product_id) {
        // Map product IDs to plan names
        const planMap: Record<string, string> = {
          "prod_U3o88Rn0fn4P2w": "starter",
          "prod_U3o9Beo3BdMnId": "pro",
          "prod_U3oAl1dM2orh9D": "studio",
        };
        const plan = planMap[data.product_id] || "free";
        // Update local profile
        if (profile) {
          setProfile({ ...profile, plan, subscription_status: "active" });
        }
      }
    } catch (e) {
      console.error("Failed to check subscription:", e);
    }
  }, [session, profile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => {
            fetchProfile(newSession.user.id);
            checkAdmin(newSession.user.id);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      if (existingSession?.user) {
        fetchProfile(existingSession.user.id);
        checkAdmin(existingSession.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, checkAdmin]);

  // Check subscription periodically
  useEffect(() => {
    if (!session) return;
    refreshSubscription();
    const interval = setInterval(refreshSubscription, 60000);
    return () => clearInterval(interval);
  }, [session, refreshSubscription]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isAdmin, signOut, refreshProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
