import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
});

const CLIENT_LOGIN_DOMAIN = "clientes.ragnarokfit.local";

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

function toAuthEmail(identifier: string): string {
  const value = identifier.trim();
  if (value.includes("@")) return value.toLowerCase();
  return `${normalizeUsername(value)}@${CLIENT_LOGIN_DOMAIN}`;
}

function LoginPage() {
  const navigate = useNavigate();
  const { role, user, loading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && role) {
      navigate({ to: role === "trainer" ? "/admin" : "/dashboard" });
    }
  }, [user, role, loading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const authEmail = toAuthEmail(identifier);
    if (!authEmail || authEmail.startsWith(`@${CLIENT_LOGIN_DOMAIN}`)) {
      toast.error("Ingresa un usuario o correo válido");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    setSubmitting(false);
    if (error) {
      // Security: Use generic message to prevent email enumeration
      toast.error("Usuario o contraseña incorrectos");
      return;
    }
    toast.success("Bienvenido");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo className="h-32 w-auto md:h-40" />
        </Link>
        <div className="surface-card p-8">
          <h1 className="font-display text-2xl font-bold">Ingresar a Mi Cuenta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Accede a tu portal personal.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Usuario o correo</label>
              <input type="text" required value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                className="h-12 w-full rounded-md border border-border bg-input/30 px-3 text-base outline-none focus:border-gold" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contraseña</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-12 w-full rounded-md border border-border bg-input/30 px-3 text-base outline-none focus:border-gold" />
            </div>
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-gold">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              Si tu cuenta fue creada por tu entrenador y no usa un correo real, pide el restablecimiento directamente en administración.
            </p>
            <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
              {submitting ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link to="/signup" className="font-medium text-gold hover:underline">
              Crear cuenta
            </Link>
          </p>
        </div>
        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-gold">← Volver al inicio</Link>
        </div>
      </div>
    </div>
  );
}
