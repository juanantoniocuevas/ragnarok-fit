import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "trainer" | "client" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, role: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadUserRole = async (userId: string): Promise<Role> => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (error) {
          console.error("Error loading user role:", error);
          return null;
        }
        const roles = (data ?? []).map((entry: any) => entry.role as Role);
        if (roles.includes("trainer")) return "trainer";
        if (roles.includes("client")) return "client";
        return null;
      } catch (error) {
        console.error("Error loading user role:", error);
        return null;
      }
    };

    const setupAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (data.session?.user) {
          setLoading(true);
          const userRole = await loadUserRole(data.session.user.id);
          if (!isMounted) return;

          setSession(data.session);
          setRole(userRole);
        } else {
          setSession(null);
          setRole(null);
        }
      } catch (error) {
        console.error("Error setting up auth:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setupAuth();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!isMounted) return;

      setLoading(true);
      setSession(s);

      if (s?.user) {
        const userRole = await loadUserRole(s.user.id);
        if (isMounted) {
          setRole(userRole);
          setLoading(false);
        }
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return <Ctx.Provider value={{ user: session?.user ?? null, session, role, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
