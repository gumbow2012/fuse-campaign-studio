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
  roles: string[];
  isAdmin: boolean;
  hasAppAccess: boolean;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  roles: [],
  isAdmin: false,
  hasAppAccess: false,
  signOut: async () => {},
  refreshAccess: async () => {},
  refreshProfile: async () => {},
  refreshSubscription: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAppAccess, setHasAppAccess] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("get_my_profile");
    if (error) {
      console.error("Failed to load profile:", error);
      setProfile(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setProfile(row as Profile);
      return;
    }

    setProfile(null);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("get_my_roles");
    if (error) {
      console.error("Failed to load roles:", error);
      setRoles([]);
      setIsAdmin(false);
      setHasAppAccess(false);
      return;
    }

    const nextRoles = (data ?? []).map((row: any) => String(row.role));
    setRoles(nextRoles);
    setIsAdmin(nextRoles.includes("admin"));
    setHasAppAccess(nextRoles.includes("admin") || nextRoles.includes("dev"));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshAccess = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      await Promise.all([
        fetchProfile(user.id),
        fetchRoles(user.id),
      ]);
    } finally {
      setLoading(false);
    }
  }, [user, fetchProfile, fetchRoles]);

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
    setRoles([]);
    setIsAdmin(false);
    setHasAppAccess(false);
  }, []);

  useEffect(() => {
    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setLoading(true);
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(async () => {
            await Promise.all([
              fetchProfile(newSession.user.id),
              fetchRoles(newSession.user.id),
            ]);
            setLoading(false);
          }, 0);
          return;
        }

        setProfile(null);
        setRoles([]);
        setIsAdmin(false);
        setHasAppAccess(false);
        setLoading(false);
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        setLoading(true);
        await Promise.all([
          fetchProfile(existingSession.user.id),
          fetchRoles(existingSession.user.id),
        ]);
      } else {
        setProfile(null);
        setRoles([]);
        setIsAdmin(false);
        setHasAppAccess(false);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchRoles]);

  // Check subscription periodically
  useEffect(() => {
    if (!session) return;
    refreshSubscription();
    const interval = setInterval(refreshSubscription, 60000);
    return () => clearInterval(interval);
  }, [session, refreshSubscription]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, roles, isAdmin, hasAppAccess, signOut, refreshAccess, refreshProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
