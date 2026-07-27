import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

const schema = z.string().trim().email("Correo inválido").max(255);

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo className="h-32 w-auto md:h-40" />
        </Link>
        <div className="surface-card p-8">
          {sent ? (
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold">Revisa tu correo</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Si existe una cuenta con <strong className="text-foreground">{email}</strong>, te enviamos un enlace para restablecer tu contraseña.
              </p>
              <Link to="/login" className="btn-primary mt-6 inline-flex">Volver al inicio de sesión</Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold">Recuperar contraseña</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Te enviaremos un enlace para crear una nueva contraseña.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Esta opción solo funciona para cuentas con correo real. Si tu acceso fue creado por tu entrenador con un usuario interno, debes pedirle que cambie tu contraseña desde el panel de administración.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Correo</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="h-12 w-full rounded-md border border-border bg-input/30 px-3 text-base outline-none focus:border-gold" />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-60">
                  {submitting ? "Enviando..." : "Enviar enlace"}
                </button>
              </form>
              <p className="mt-6 text-center text-sm">
                <Link to="/login" className="text-muted-foreground hover:text-gold">← Volver al inicio de sesión</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
