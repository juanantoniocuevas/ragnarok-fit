import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_LOGIN_DOMAIN, normalizeUsername } from "@/lib/client-login";

// Permisos:
//  - Dueño (owner): gestiona a todos los clientes y a los preparadores.
//  - Preparador (trainer): gestiona solo a los clientes que tiene asignados.
// Toda acción se verifica aquí en el servidor, además de las reglas de la base de datos.

const usernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z.string()
      .min(3, "El usuario debe tener al menos 3 letras o números")
      .max(40, "El usuario puede tener como máximo 40 caracteres"),
  );
const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña es demasiado larga");
const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Escribe el nombre completo")
  .max(120, "El nombre es demasiado largo");

function buildClientLoginEmail(username: string): string {
  return `${normalizeUsername(username)}@${CLIENT_LOGIN_DOMAIN}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function rolesOf(userId: string): Promise<string[]> {
  const db = await admin();
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.role as string);
}

// Verifica que quien llama sea parte del personal y dice si es el dueño.
async function assertStaff(userId: string): Promise<{ isOwner: boolean }> {
  const roles = await rolesOf(userId);
  if (!roles.includes("trainer") && !roles.includes("owner")) {
    throw new Error("Forbidden: solo administradores");
  }
  return { isOwner: roles.includes("owner") };
}

async function assertOwner(userId: string) {
  const { isOwner } = await assertStaff(userId);
  if (!isOwner) throw new Error("Forbidden: solo el dueño puede hacer esto");
}

// Verifica que quien llama pueda gestionar a ese cliente (dueño o su preparador).
async function assertCanManage(actorId: string, clientId: string) {
  const db = await admin();
  const { data, error } = await db.rpc("can_manage_client", { _actor: actorId, _client: clientId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: este cliente no está a tu cargo");
}

// Verifica que el destino sea un preparador activo (no el dueño desactivado, no un cliente).
async function assertActiveTrainer(trainerId: string) {
  const db = await admin();
  const roles = await rolesOf(trainerId);
  if (!roles.includes("trainer")) throw new Error("El preparador elegido no existe");
  const { data: p, error } = await db
    .from("profiles")
    .select("status, disabled_at")
    .eq("id", trainerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (p?.status === "disabled" || p?.disabled_at) throw new Error("El preparador elegido está desactivado");
}

// Deja al cliente asignado solo a un preparador.
async function assignClientTo(clientId: string, trainerId: string, requestedBy: string) {
  const db = await admin();
  const { error: delError } = await db.from("trainer_clients").delete().eq("client_id", clientId);
  if (delError) throw new Error(delError.message);
  const { error } = await db.from("trainer_clients").insert({
    trainer_id: trainerId,
    client_id: clientId,
    requested_by: requestedBy,
    accepted_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

async function rollbackCreatedUser(userId: string) {
  const db = await admin();
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) console.error("Error rolling back incomplete user creation:", error);
}

const banFor = (disabled: boolean) => ({ ban_duration: disabled ? "876000h" : "none" }) as any;

// ------------------------------------------------------------------
// Clientes
// ------------------------------------------------------------------

export const adminListManagedClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    const { isOwner } = await assertStaff(context.userId);
    const db = await admin();

    let ids: string[];
    if (isOwner) {
      const { data, error } = await db.from("user_roles").select("user_id, role");
      if (error) throw new Error(error.message);
      const staff = new Set((data ?? []).filter((r: any) => r.role !== "client").map((r: any) => r.user_id));
      ids = [...new Set((data ?? []).filter((r: any) => r.role === "client" && !staff.has(r.user_id)).map((r: any) => r.user_id as string))];
    } else {
      const { data, error } = await db
        .from("trainer_clients")
        .select("client_id")
        .eq("trainer_id", context.userId)
        .not("accepted_at", "is", null);
      if (error) throw new Error(error.message);
      ids = (data ?? []).map((row: any) => row.client_id);
    }
    if (ids.length === 0) return [];

    const { data: profiles, error: profilesError } = await db
      .from("profiles")
      .select("id, full_name, email, status, created_at")
      .in("id", ids)
      .order("full_name");
    if (profilesError) throw new Error(profilesError.message);

    // Preparador a cargo de cada cliente
    const { data: links, error: linksError } = await db
      .from("trainer_clients")
      .select("client_id, trainer_id")
      .in("client_id", ids)
      .not("accepted_at", "is", null);
    if (linksError) throw new Error(linksError.message);
    const trainerIds = [...new Set((links ?? []).map((l: any) => l.trainer_id as string))];
    const { data: trainers } = trainerIds.length
      ? await db.from("profiles").select("id, full_name").in("id", trainerIds)
      : { data: [] as any[] };
    const trainerName = new Map((trainers ?? []).map((t: any) => [t.id, t.full_name]));
    const trainerOf = new Map((links ?? []).map((l: any) => [l.client_id, l.trainer_id]));

    return (profiles ?? []).map((p: any) => {
      const tid = trainerOf.get(p.id) ?? null;
      return { ...p, trainer_id: tid, trainer_name: tid ? trainerName.get(tid) ?? null : null };
    });
  });

export const adminCreateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; fullName: string; phone?: string; password: string; trainerId?: string }) =>
    z.object({
      username: usernameSchema,
      fullName: fullNameSchema,
      phone: z.string().trim().max(30).optional(),
      password: passwordSchema,
      trainerId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { isOwner } = await assertStaff(context.userId);
    // Un preparador siempre crea clientes para sí mismo; el dueño puede elegir preparador.
    const trainerId = isOwner && data.trainerId ? data.trainerId : context.userId;
    if (trainerId !== context.userId) await assertActiveTrainer(trainerId);

    const db = await admin();
    const username = normalizeUsername(data.username);
    const loginEmail = buildClientLoginEmail(username);
    const { data: created, error } = await db.auth.admin.createUser({
      email: loginEmail,
      password: data.password.trim(),
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone, username },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) throw new Error("Ese usuario ya existe. Elige otro.");
      throw new Error(error.message);
    }
    const uid = created.user!.id;
    try {
      const { error: profileError } = await db.from("profiles").upsert(
        { id: uid, full_name: data.fullName, email: loginEmail, phone: data.phone ?? null },
        { onConflict: "id" },
      );
      if (profileError) throw new Error(profileError.message);
      const { error: roleError } = await db
        .from("user_roles")
        .upsert({ user_id: uid, role: "client" }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);
      await assignClientTo(uid, trainerId, context.userId);
    } catch (e) {
      await rollbackCreatedUser(uid);
      throw e;
    }
    return { id: uid, message: `Cliente creado exitosamente. Usuario: ${username}` };
  });

export const adminUpdateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; fullName?: string; username?: string; phone?: string | null }) =>
    z.object({
      clientId: z.string().uuid(),
      fullName: fullNameSchema.optional(),
      username: usernameSchema.optional(),
      phone: z.string().trim().max(30).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    await assertCanManage(context.userId, data.clientId);
    const db = await admin();
    // Primero el acceso (puede fallar si el usuario ya existe), después el perfil.
    if (data.username) {
      const username = normalizeUsername(data.username);
      const { error } = await db.auth.admin.updateUserById(data.clientId, {
        email: buildClientLoginEmail(username),
        user_metadata: { username },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) throw new Error("Ese usuario ya existe. Elige otro.");
        throw new Error(error.message);
      }
    }
    const patch: any = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.username !== undefined) patch.email = buildClientLoginEmail(data.username);
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("profiles").update(patch).eq("id", data.clientId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminResetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; password: string }) =>
    z.object({ clientId: z.string().uuid(), password: passwordSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    await assertCanManage(context.userId, data.clientId);
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.clientId, { password: data.password.trim() });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Contraseña actualizada correctamente." };
  });

export const adminSetClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; status: "active" | "disabled" }) =>
    z.object({ clientId: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    await assertCanManage(context.userId, data.clientId);
    const db = await admin();
    const disabled = data.status === "disabled";
    const { error: e1 } = await db.from("profiles").update({
      status: data.status,
      disabled_at: disabled ? new Date().toISOString() : null,
    }).eq("id", data.clientId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db.auth.admin.updateUserById(data.clientId, banFor(disabled));
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const adminGetClientAuthInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    await assertCanManage(context.userId, data.clientId);
    const db = await admin();
    const { data: u, error } = await db.auth.admin.getUserById(data.clientId);
    if (error) throw new Error(error.message);
    return {
      last_sign_in_at: u.user?.last_sign_in_at ?? null,
      created_at: u.user?.created_at ?? null,
      email: u.user?.email ?? null,
    };
  });

// ------------------------------------------------------------------
// Solo el dueño: preparadores y asignaciones
// ------------------------------------------------------------------

export const ownerAssignClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; trainerId: string }) =>
    z.object({ clientId: z.string().uuid(), trainerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    await assertCanManage(context.userId, data.clientId);
    await assertActiveTrainer(data.trainerId);
    await assignClientTo(data.clientId, data.trainerId, context.userId);
    return { ok: true };
  });

export const ownerListTrainers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d ?? {}))
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const db = await admin();
    const { data: roles, error } = await db.from("user_roles").select("user_id, role").in("role", ["trainer", "owner"]);
    if (error) throw new Error(error.message);
    const owners = new Set((roles ?? []).filter((r: any) => r.role === "owner").map((r: any) => r.user_id));
    const ids = [...new Set((roles ?? []).filter((r: any) => r.role === "trainer").map((r: any) => r.user_id as string))];
    if (ids.length === 0) return [];
    const { data: profiles, error: pErr } = await db
      .from("profiles")
      .select("id, full_name, email, status, created_at")
      .in("id", ids)
      .order("full_name");
    if (pErr) throw new Error(pErr.message);
    const { data: links } = await db
      .from("trainer_clients")
      .select("trainer_id")
      .in("trainer_id", ids)
      .not("accepted_at", "is", null);
    const counts = new Map<string, number>();
    for (const l of links ?? []) counts.set((l as any).trainer_id, (counts.get((l as any).trainer_id) ?? 0) + 1);
    return (profiles ?? []).map((p: any) => ({
      ...p,
      is_owner: owners.has(p.id),
      client_count: counts.get(p.id) ?? 0,
    }));
  });

export const ownerCreateTrainer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; fullName: string; password: string }) =>
    z.object({
      email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
      fullName: fullNameSchema,
      password: passwordSchema,
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    if (data.email.endsWith(`@${CLIENT_LOGIN_DOMAIN}`)) throw new Error("Usa un correo real para el preparador");
    const db = await admin();
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password.trim(),
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) throw new Error("Ya existe una cuenta con ese correo.");
      throw new Error(error.message);
    }
    const uid = created.user!.id;
    try {
      const { error: profileError } = await db.from("profiles").upsert(
        { id: uid, full_name: data.fullName, email: data.email },
        { onConflict: "id" },
      );
      if (profileError) throw new Error(profileError.message);
      const { error: roleError } = await db
        .from("user_roles")
        .upsert({ user_id: uid, role: "trainer" }, { onConflict: "user_id,role" });
      if (roleError) throw new Error(roleError.message);
    } catch (e) {
      await rollbackCreatedUser(uid);
      throw e;
    }
    return { id: uid, message: `Preparador creado. Entra con ${data.email}` };
  });

export const ownerSetTrainerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trainerId: string; status: "active" | "disabled" }) =>
    z.object({ trainerId: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const roles = await rolesOf(data.trainerId);
    if (!roles.includes("trainer")) throw new Error("Ese usuario no es preparador");
    if (roles.includes("owner")) throw new Error("No se puede desactivar la cuenta del dueño");
    const db = await admin();
    const disabled = data.status === "disabled";

    let moved = 0;
    if (disabled) {
      // Sus clientes pasan al dueño para que no queden sin preparador.
      const { data: links, error } = await db
        .from("trainer_clients")
        .select("client_id")
        .eq("trainer_id", data.trainerId)
        .not("accepted_at", "is", null);
      if (error) throw new Error(error.message);
      for (const l of links ?? []) {
        await assignClientTo((l as any).client_id, context.userId, context.userId);
        moved++;
      }
    }

    const { error: e1 } = await db.from("profiles").update({
      status: data.status,
      disabled_at: disabled ? new Date().toISOString() : null,
    }).eq("id", data.trainerId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await db.auth.admin.updateUserById(data.trainerId, banFor(disabled));
    if (e2) throw new Error(e2.message);
    return {
      ok: true,
      message: disabled
        ? `Preparador desactivado. ${moved} cliente(s) pasaron a tu cargo.`
        : "Preparador reactivado. Asígnale clientes desde la lista de clientes.",
    };
  });

export const ownerResetTrainerPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trainerId: string; password: string }) =>
    z.object({ trainerId: z.string().uuid(), password: passwordSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const roles = await rolesOf(data.trainerId);
    if (!roles.includes("trainer")) throw new Error("Ese usuario no es preparador");
    if (roles.includes("owner") && data.trainerId !== context.userId) {
      throw new Error("No se puede cambiar la contraseña de otro dueño");
    }
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.trainerId, { password: data.password.trim() });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Contraseña actualizada correctamente." };
  });
