import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { GOAL_LABEL, autoRecommendations } from "@/lib/health-recommendations";
import { MEASUREMENT_FIELDS, calcIMC } from "@/lib/measurements";
import {
  adminUpdateClient,
  adminResetClientPassword,
  adminSetClientStatus,
  adminGetClientAuthInfo,
} from "@/lib/admin-clients.functions";

export const Route = createFileRoute("/admin/clients/$clientId")({ component: ClientDetail });

const CLIENT_LOGIN_DOMAIN = "@clientes.ragnarokfit.local";

function displayLoginIdentifier(email: string | null | undefined): string {
  const raw = email ?? "";
  if (raw.endsWith(CLIENT_LOGIN_DOMAIN)) return raw.slice(0, -CLIENT_LOGIN_DOMAIN.length);
  return raw;
}

function ClientDetail() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [phys, setPhys] = useState<any>(null);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [recs, setRecs] = useState<any[]>([]);
  const [authInfo, setAuthInfo] = useState<{ last_sign_in_at: string | null } | null>(null);
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const updateFn = useServerFn(adminUpdateClient);
  const resetPwFn = useServerFn(adminResetClientPassword);
  const setStatusFn = useServerFn(adminSetClientStatus);
  const authInfoFn = useServerFn(adminGetClientAuthInfo);

  const load = async () => {
    const [p, ph, m, r] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", clientId).maybeSingle(),
      supabase.from("physical_profiles").select("*").eq("user_id", clientId).maybeSingle(),
      supabase.from("measurements").select("*").eq("user_id", clientId).is("deleted_at", null).order("created_at"),
      supabase.from("recommendations").select("*").eq("client_id", clientId).is("deleted_at", null).order("created_at", { ascending: false }),
    ]);
    setProfile(p.data); setPhys(ph.data); setMeasurements(m.data ?? []); setRecs(r.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    authInfoFn({ data: { clientId } }).then(setAuthInfo).catch(() => {});
    const ch = supabase
      .channel(`client-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${clientId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "physical_profiles", filter: `user_id=eq.${clientId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "measurements", filter: `user_id=eq.${clientId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "recommendations", filter: `client_id=eq.${clientId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const latest = measurements[measurements.length - 1];
  const prev = measurements[measurements.length - 2];
  const autoRecs = useMemo(() => latest ? autoRecommendations(latest, prev) : [], [latest, prev]);

  const buildSeries = (key: string) =>
    measurements.map((m) => ({
      date: new Date(m.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
      value: m[key] !== null && m[key] !== undefined ? Number(m[key]) : null,
    }));

  const submitRec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !content.trim()) return;
    setSaving(true);
    if (editingId) {
      const { error } = await supabase.from("recommendations").update({ content: content.trim() }).eq("id", editingId);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Recomendación actualizada");
    } else {
      const { error } = await supabase.from("recommendations").insert({ client_id: clientId, admin_id: user.id, content: content.trim() });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Recomendación enviada");
    }
    setContent(""); setEditingId(null); load();
  };

  const startEdit = (r: any) => { setContent(r.content); setEditingId(r.id); };
  const deleteRec = async (id: string) => {
    if (!confirm("¿Eliminar esta recomendación?")) return;
    await supabase.from("recommendations").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    toast.success("Recomendación eliminada");
    load();
  };

  const toggleStatus = async () => {
    if (!profile) return;
    const next = profile.status === "disabled" ? "active" : "disabled";
    if (!confirm(`¿${next === "disabled" ? "Deshabilitar" : "Reactivar"} esta cuenta?`)) return;
    try {
      await setStatusFn({ data: { clientId, status: next } });
      toast.success("Estado actualizado");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <p className="text-muted-foreground">Cargando...</p>;
  if (!profile) return <p className="text-muted-foreground">Cliente no encontrado.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/admin/clients" className="text-sm text-muted-foreground hover:text-gold">← Volver</Link>
      </div>

      {/* SECCIÓN 1 — Resumen general */}
      <section className="surface-card p-6">
        <div className="flex flex-wrap items-start gap-6">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-background text-3xl font-display text-gold">
              {profile.full_name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="flex-1 space-y-1">
            <h1 className="font-display text-3xl font-bold">{profile.full_name}</h1>
            <p className="text-muted-foreground">Usuario: {displayLoginIdentifier(profile.email)}</p>
            {profile.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
            <div className="mt-2">
              {profile.status === "disabled"
                ? <span className="rounded bg-destructive/20 px-2 py-0.5 text-xs text-destructive">Cuenta deshabilitada</span>
                : <span className="rounded bg-vitality/20 px-2 py-0.5 text-xs text-vitality">Cuenta activa</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setEditing(true)} className="btn-secondary text-sm">Editar datos</button>
            <button onClick={() => setShowResetPassword(true)} className="btn-secondary text-sm">Restablecer contraseña</button>
            <button onClick={toggleStatus} className="btn-secondary text-sm">
              {profile.status === "disabled" ? "Reactivar" : "Deshabilitar"}
            </button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Info label="Edad" value={phys?.age ? `${phys.age} años` : "—"} />
          <Info label="Sexo" value={phys?.sex === "male" ? "Hombre" : phys?.sex === "female" ? "Mujer" : "—"} />
          <Info label="Peso actual" value={latest?.weight_kg != null ? `${latest.weight_kg} kg` : "—"} />
          <Info label="Estatura" value={latest?.height_cm ? `${latest.height_cm} cm` : phys?.height_cm ? `${phys.height_cm} cm` : "—"} />
          <Info label="Objetivo" value={GOAL_LABEL[phys?.goal] ?? "—"} />
          <Info label="IMC" value={latest ? (calcIMC(latest.weight_kg, latest.height_cm) ?? "—") : "—"} />
          <Info label="Cuenta creada" value={new Date(profile.created_at).toLocaleDateString("es-CL")} />
          <Info label="Último acceso" value={authInfo?.last_sign_in_at ? new Date(authInfo.last_sign_in_at).toLocaleString("es-CL") : "—"} />
        </dl>
      </section>

      {editing && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSave={async (patch) => {
            try {
              await updateFn({ data: { clientId, ...patch } });
              toast.success("Datos actualizados");
              setEditing(false);
              load();
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}

      {showResetPassword && (
        <ResetPasswordModal
          onClose={() => setShowResetPassword(false)}
          onSave={async (password) => {
            try {
              const res = await resetPwFn({ data: { clientId, password } });
              toast.success(res.message);
              setShowResetPassword(false);
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}

      {/* SECCIÓN 2 — Progreso */}
      <section>
        <h2 className="mb-4 font-display text-2xl">Progreso</h2>
        {measurements.length < 2 ? (
          <p className="surface-card p-6 text-muted-foreground">Se requieren al menos dos evaluaciones para visualizar la evolución.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {MEASUREMENT_FIELDS.map((f) => (
              <div key={f.key} className="surface-card p-6">
                <h3 className="mb-3 font-display text-lg">{f.label} ({f.unit})</h3>
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={buildSeries(f.key)}>
                      <CartesianGrid stroke="#2D3E5F" strokeDasharray="3 3" />
                      <XAxis dataKey="date" stroke="#A0AEC0" />
                      <YAxis stroke="#A0AEC0" domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#1B2A4A", border: "1px solid #2D3E5F", borderRadius: 8 }} />
                      <Line type="monotone" dataKey="value" stroke={f.color} strokeWidth={2} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}

        {latest && (
          <div className="surface-card mt-6 p-6">
            <h3 className="mb-3 font-display text-lg">Recomendaciones automáticas del sistema</h3>
            <ul className="list-disc space-y-2 pl-5 text-sm">{autoRecs.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </section>

      {/* SECCIÓN 3 — Historial */}
      <section>
        <h2 className="mb-4 font-display text-2xl">Historial de evaluaciones</h2>
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/40 text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Fecha</th>
                  {MEASUREMENT_FIELDS.map((f) => <th key={f.key} className="p-3">{f.short}</th>)}
                  <th className="p-3">IMC</th>
                </tr>
              </thead>
              <tbody>
                {measurements.slice().reverse().map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3">{new Date(m.created_at).toLocaleString("es-CL")}</td>
                    {MEASUREMENT_FIELDS.map((f) => <td key={f.key} className="p-3">{m[f.key] ?? "—"}</td>)}
                    <td className="p-3">{calcIMC(m.weight_kg, m.height_cm) ?? "—"}</td>
                  </tr>
                ))}
                {measurements.length === 0 && (
                  <tr><td colSpan={MEASUREMENT_FIELDS.length + 2} className="p-8 text-center text-muted-foreground">Sin evaluaciones aún.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="surface-card p-6">
        <h2 className="mb-4 font-display text-xl">{editingId ? "Editar recomendación" : "Nueva recomendación"}</h2>
        <form onSubmit={submitRec} className="space-y-3">
          <textarea required value={content} onChange={(e) => setContent(e.target.value)} rows={3} maxLength={5000}
            placeholder="Escribe una recomendación personalizada..."
            className="w-full rounded-md border border-border bg-input/30 p-3" />
          <div className="flex gap-2">
            <button disabled={saving} className="btn-primary">{saving ? "Guardando..." : editingId ? "Actualizar" : "Enviar"}</button>
            {editingId && <button type="button" onClick={() => { setEditingId(null); setContent(""); }} className="btn-secondary">Cancelar</button>}
          </div>
        </form>

        <ul className="mt-6 divide-y divide-border">
          {recs.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>{new Date(r.created_at).toLocaleString("es-CL")}</span>
                {r.admin_id === user?.id && (
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(r)} className="hover:text-gold">Editar</button>
                    <button onClick={() => deleteRec(r.id)} className="hover:text-destructive">Eliminar</button>
                  </div>
                )}
              </div>
              <p className="mt-1">{r.content}</p>
            </li>
          ))}
          {recs.length === 0 && <li className="py-4 text-center text-muted-foreground">Sin recomendaciones.</li>}
        </ul>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>;
}

function EditProfileModal({ profile, onClose, onSave }: { profile: any; onClose: () => void; onSave: (patch: { fullName?: string; username?: string; phone?: string | null }) => Promise<void> }) {
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [username, setUsername] = useState(displayLoginIdentifier(profile.email));
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ fullName, username, phone: phone || null });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Editar cliente</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block"><span className="mb-1 block text-sm font-medium">Nombre</span>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Usuario</span>
            <input required value={username} onChange={(e) => setUsername(e.target.value)} className="input" />
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Teléfono</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
          </label>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Guardando..." : "Guardar"}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ onClose, onSave }: { onClose: () => void; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSaving(true);
    await onSave(password);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="surface-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl font-bold">Restablecer contraseña</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Define una nueva contraseña manualmente para esta cuenta administrada.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block"><span className="mb-1 block text-sm font-medium">Nueva contraseña</span>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Confirmar contraseña</span>
            <input type="password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
          </label>
          <div className="flex gap-2 pt-2">
            <button disabled={saving} className="btn-primary flex-1">{saving ? "Guardando..." : "Actualizar contraseña"}</button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
