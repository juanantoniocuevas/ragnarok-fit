import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { adminCreateClient, adminListManagedClients, adminSetClientStatus, ownerAssignClient, ownerListTrainers } from "@/lib/admin-clients.functions";
import { displayLoginIdentifier, friendlyError, normalizeUsername } from "@/lib/client-login";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clients")({ component: Clients });

function Clients() {
  const { user, isOwner } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [trainerFilter, setTrainerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const createFn = useServerFn(adminCreateClient);
  const listClientsFn = useServerFn(adminListManagedClients);
  const setStatusFn = useServerFn(adminSetClientStatus);
  const assignFn = useServerFn(ownerAssignClient);
  const listTrainersFn = useServerFn(ownerListTrainers);

  // Solo el dueño necesita la lista de preparadores (para asignar clientes).
  useEffect(() => {
    if (!isOwner) return;
    listTrainersFn({ data: {} })
      .then((t) => setTrainers((t ?? []).filter((x: any) => x.status !== "disabled")))
      .catch(() => setTrainers([]));
  }, [isOwner]);

  const reassign = async (r: any, trainerId: string) => {
    if (!trainerId || trainerId === r.trainer_id) return;
    const t = trainers.find((x) => x.id === trainerId);
    if (!confirm(`¿Asignar a ${r.full_name} al preparador ${t?.full_name ?? ""}?`)) return;
    try {
      await assignFn({ data: { clientId: r.id, trainerId } });
      toast.success("Cliente asignado");
      load();
    } catch (e: any) { toast.error(friendlyError(e)); }
  };

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
    } catch (e: any) { toast.error(friendlyError(e)); }
  };

  const filtered = rows.filter((r) =>
    (r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      displayLoginIdentifier(r).toLowerCase().includes(search.toLowerCase())) &&
    (!trainerFilter || (trainerFilter === "none" ? !r.trainer_id : r.trainer_id === trainerFilter)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Clientes</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ Crear cliente</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o usuario..."
          className="h-12 min-w-0 flex-1 rounded-md border border-border bg-input/30 px-3 outline-none focus:border-gold" />
        {isOwner && (
          <select id="filtro-preparador" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)} aria-label="Filtrar por preparador"
            className="h-12 rounded-md border border-border bg-input/30 px-3 outline-none focus:border-gold">
            <option value="">Todos los preparadores</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.is_owner ? " (dueño)" : ""}</option>)}
            <option value="none">Sin preparador</option>
          </select>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-background/40 text-left text-muted-foreground">
              <tr>
                <th className="p-4">Nombre</th>
                <th className="p-4">Usuario</th>
                {isOwner && <th className="p-4">Preparador</th>}
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
                  {isOwner && (
                    <td className="p-4">
                      <select value={r.trainer_id ?? ""} onChange={(e) => reassign(r, e.target.value)} aria-label={`Preparador de ${r.full_name}`}
                        className="h-10 rounded-md border border-border bg-input/30 px-2 text-sm outline-none focus:border-gold">
                        {!r.trainer_id && <option value="">Sin preparador</option>}
                        {r.trainer_id && !trainers.some((t) => t.id === r.trainer_id) && <option value={r.trainer_id}>{r.trainer_name ?? "—"}</option>}
                        {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.is_owner ? " (dueño)" : ""}</option>)}
                      </select>
                    </td>
                  )}
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
              {filtered.length === 0 && <tr><td colSpan={isOwner ? 6 : 5} className="p-8 text-center text-muted-foreground">Sin clientes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateClientModal onClose={() => setShowCreate(false)} onCreated={() => { load(); setShowCreate(false); }} createFn={createFn} trainers={isOwner ? trainers : []} selfId={user?.id ?? ""} />}
    </div>
  );
}

function CreateClientModal({ onClose, onCreated, createFn, trainers, selfId }: { onClose: () => void; onCreated: () => void; createFn: any; trainers: any[]; selfId: string }) {
  const [trainerId, setTrainerId] = useState(selfId);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createFn({ data: { fullName, username, phone: phone || undefined, password, trainerId: trainers.length && trainerId ? trainerId : undefined } });
      toast.success(res.message);
      onCreated();
    } catch (e: any) { toast.error(friendlyError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Nuevo cliente</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Nombre completo"><input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" /></Field>
          <Field label="Usuario (con esto ingresará el cliente)">
            <input id="nuevo-cliente-usuario" required value={username} onChange={(e) => setUsername(e.target.value)} className="input" autoCapitalize="none" autoCorrect="off" />
            <span className="mt-1 block text-xs text-muted-foreground">
              {username.trim()
                ? <>Quedará como: <strong className="text-foreground">{normalizeUsername(username) || "—"}</strong></>
                : "Sin espacios ni tildes; se ajusta solo. Ej.: maria.gonzalez"}
            </span>
          </Field>
          <Field label="Teléfono (opcional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" /></Field>
          <Field label="Contraseña"><input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" /></Field>
          {trainers.length > 0 && (
            <Field label="Preparador a cargo">
              <select id="preparador-nuevo-cliente" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="input">
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.id === selfId ? " (tú)" : ""}</option>)}
              </select>
            </Field>
          )}
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
