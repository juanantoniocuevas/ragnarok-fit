import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { adminCreateClient, adminListManagedClients, adminSetClientStatus } from "@/lib/admin-clients.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clients")({ component: Clients });

const CLIENT_LOGIN_DOMAIN = "@clientes.ragnarokfit.local";

function displayLoginIdentifier(profile: any): string {
  const raw = profile?.email ?? "";
  if (typeof raw === "string" && raw.endsWith(CLIENT_LOGIN_DOMAIN)) {
    return raw.slice(0, -CLIENT_LOGIN_DOMAIN.length);
  }
  return raw;
}

function Clients() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const createFn = useServerFn(adminCreateClient);
  const listClientsFn = useServerFn(adminListManagedClients);
  const setStatusFn = useServerFn(adminSetClientStatus);

  const load = async () => {
    if (!user?.id) return;
    try {
      const data = await listClientsFn({ data: {} });
      setRows(data ?? []);
    } catch (error: any) {
      console.error("Error loading managed clients:", error);
      setRows([]);
      toast.error(error.message || "No se pudieron cargar los clientes");
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    load();
    const ch = supabase
      .channel("admin-clients")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "trainer_clients" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const toggleStatus = async (r: any) => {
    const next = r.status === "disabled" ? "active" : "disabled";
    if (!confirm(`¿${next === "disabled" ? "Deshabilitar" : "Reactivar"} a ${r.full_name}?`)) return;
    try {
      await setStatusFn({ data: { clientId: r.id, status: next } });
      toast.success("Estado actualizado");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = rows.filter((r) =>
    r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    displayLoginIdentifier(r).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Clientes</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ Crear cliente</button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o usuario..."
        className="h-12 w-full rounded-md border border-border bg-input/30 px-3 outline-none focus:border-gold" />

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-left text-muted-foreground">
              <tr>
                <th className="p-4">Nombre</th>
                <th className="p-4">Usuario</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Creado</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-4 font-medium">
                    <Link to="/admin/clients/$clientId" params={{ clientId: r.id }} className="text-gold hover:underline">
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">{displayLoginIdentifier(r)}</td>
                  <td className="p-4">
                    {r.status === "disabled"
                      ? <span className="text-destructive">Deshabilitado</span>
                      : <span className="text-vitality">Activo</span>}
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("es-CL")}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => toggleStatus(r)} className="text-sm text-muted-foreground hover:text-gold">
                      {r.status === "disabled" ? "Reactivar" : "Deshabilitar"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin clientes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateClientModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} createFn={createFn} />}
    </div>
  );
}

function CreateClientModal({ onClose, onCreated, createFn }: { onClose: () => void; onCreated: () => void; createFn: any }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createFn({ data: { fullName, username, phone: phone || undefined, password } });
      toast.success(res.message);
      onCreated();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Nuevo cliente</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Nombre completo"><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" /></Field>
          <Field label="Usuario"><input required value={username} onChange={(e) => setUsername(e.target.value)} className="input" /></Field>
          <Field label="Teléfono (opcional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></Field>
          <Field label="Contraseña"><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></Field>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Creando..." : "Crear cliente"}</button>
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
