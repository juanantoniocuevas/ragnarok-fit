import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "trainer" | "client" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  /** Cuenta maestra: gestiona preparadores y todos los clientes. */
  isOwner: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, role: null, isOwner: false, loading: true, signOut: async () => {} });

function clearSupabaseStorage() {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith("sb-")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [isOwner, setIsOwner] = useState(false);
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
        const roles = (data ?? []).map((entry: any) => entry.role as string);
        if (isMounted) setIsOwner(roles.includes("owner"));
        // El dueño entra al panel de administración igual que un preparador.
        if (roles.includes("trainer") || roles.includes("owner")) return "trainer";
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
          setIsOwner(false);
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
        setIsOwner(false);
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
    clearSupabaseStorage();
    setSession(null);
    setRole(null);
    setIsOwner(false);
    setLoading(false);
  };

  return <Ctx.Provider value={{ user: session?.user ?? null, session, role, isOwner, loading, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
