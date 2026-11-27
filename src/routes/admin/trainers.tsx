import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  ownerCreateTrainer,
  ownerListTrainers,
  ownerResetTrainerPassword,
  ownerSetTrainerStatus,
} from "@/lib/admin-clients.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/trainers")({ component: Trainers });

// Solo el dueño (cuenta maestra) gestiona a los preparadores.
function Trainers() {
  const { isOwner, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [resetFor, setResetFor] = useState<any | null>(null);
  const listFn = useServerFn(ownerListTrainers);
  const createFn = useServerFn(ownerCreateTrainer);
  const statusFn = useServerFn(ownerSetTrainerStatus);
  const resetFn = useServerFn(ownerResetTrainerPassword);

  useEffect(() => {
    if (!loading && !isOwner) navigate({ to: "/admin/clients" });
  }, [loading, isOwner, navigate]);

  const load = async () => {
    try {
      setRows((await listFn({ data: {} })) ?? []);
    } catch (e: any) {
      toast.error(e.message || "No se pudieron cargar los preparadores");
    }
  };

  useEffect(() => {
    if (isOwner) load();
  }, [isOwner]);

  const toggleStatus = async (t: any) => {
    const next = t.status === "disabled" ? "active" : "disabled";
    const msg =
      next === "disabled"
        ? `¿Desactivar a ${t.full_name}? Ya no podrá ingresar y sus ${t.client_count} cliente(s) pasarán a tu cargo.`
        : `¿Reactivar a ${t.full_name}? Podrá ingresar de nuevo; sus clientes anteriores siguen a tu cargo hasta que los reasignes.`;
    if (!confirm(msg)) return;
    try {
      const res = await statusFn({ data: { trainerId: t.id, status: next } });
      toast.success(res.message);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!isOwner) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Preparadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada preparador ve y gestiona solo a sus clientes. Tú ves a todos.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ Crear preparador</button>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-left text-muted-foreground">
              <tr>
                <th className="p-4">Nombre</th>
                <th className="p-4">Correo</th>
                <th className="p-4">Clientes</th>
                <th className="p-4">Estado</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="p-4 font-medium">
                    {t.full_name}
                    {t.is_owner && <span className="ml-2 rounded bg-gold/15 px-2 py-0.5 text-xs text-gold">Dueño</span>}
                  </td>
                  <td className="p-4 text-muted-foreground">{t.email}</td>
                  <td className="p-4" style={{ fontVariantNumeric: "tabular-nums" }}>{t.client_count}</td>
                  <td className="p-4">
                    {t.status === "disabled"
                      ? <span className="text-destructive">Desactivado</span>
                      : <span className="text-vitality">Activo</span>}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-4">
                      <button onClick={() => setResetFor(t)} className="text-sm text-muted-foreground hover:text-gold">
                        Cambiar contraseña
                      </button>
                      {!t.is_owner && (
                        <button onClick={() => toggleStatus(t)} className="text-sm text-muted-foreground hover:text-gold">
                          {t.status === "disabled" ? "Reactivar" : "Desactivar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin preparadores.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateTrainerModal
          createFn={createFn}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {resetFor && (
        <ResetPasswordModal trainer={resetFor} resetFn={resetFn} onClose={() => setResetFor(null)} />
      )}
    </div>
  );
}

function CreateTrainerModal({ createFn, onClose, onCreated }: { createFn: any; onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createFn({ data: { fullName, email, password } });
      toast.success(res.message);
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Nuevo preparador</h2>
        <p className="mt-1 text-sm text-muted-foreground">Entrará con este correo y contraseña. Podrá crear y gestionar sus propios clientes.</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Nombre completo">
            <input id="preparador-nombre" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </Field>
          <Field label="Correo">
            <input id="preparador-correo" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </Field>
          <Field label="Contraseña (mínimo 8 caracteres)">
            <input id="preparador-clave" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </Field>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Creando..." : "Crear preparador"}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ trainer, resetFn, onClose }: { trainer: any; resetFn: any; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await resetFn({ data: { trainerId: trainer.id, password } });
      toast.success(res.message);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Nueva contraseña</h2>
        <p className="mt-1 text-sm text-muted-foreground">Para {trainer.full_name} ({trainer.email}).</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Contraseña (mínimo 8 caracteres)">
            <input id="preparador-nueva-clave" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </Field>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Guardando..." : "Guardar"}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
