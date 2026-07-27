import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CLIENT_LOGIN_DOMAIN = "clientes.ragnarokfit.local";

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

function buildClientLoginEmail(username: string): string {
  return `${normalizeUsername(username)}@${CLIENT_LOGIN_DOMAIN}`;
}

async function rollbackCreatedClient(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Error rolling back incomplete client creation:", error);
  }
}

async function assertTrainer(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "trainer" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: solo administradores");
}

// Prevent trainer-vs-trainer takeover: target must be a client and not a trainer.
async function assertTargetIsClient(clientId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", clientId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("trainer")) {
    throw new Error("Forbidden: no se pueden modificar cuentas de administrador");
  }
  if (!roles.includes("client")) {
    throw new Error("Forbidden: el usuario objetivo no es un cliente");
  }
}

export const adminCreateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; fullName: string; phone?: string; password: string }) =>
    z.object({
      username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido"),
      fullName: z.string().trim().min(2).max(120),
      phone: z.string().trim().max(30).optional(),
      password: z.string().min(8).max(72),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTrainer(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = normalizeUsername(data.username);
    const loginEmail = buildClientLoginEmail(username);
    const password = data.password.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone, username },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;
    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: uid,
      full_name: data.fullName,
      email: loginEmail,
      phone: data.phone ?? null,
    }, { onConflict: "id" });
    if (profileError) {
      await rollbackCreatedClient(uid);
      throw new Error(profileError.message);
    }
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: uid, role: "client" }, { onConflict: "user_id,role" });
    if (roleError) {
      await rollbackCreatedClient(uid);
      throw new Error(roleError.message);
    }
    const { error: relationError } = await supabaseAdmin
      .from("trainer_clients")
      .upsert(
        {
          trainer_id: context.userId,
          client_id: uid,
          accepted_at: new Date().toISOString(),
          requested_by: context.userId,
        },
        { onConflict: "trainer_id,client_id" },
      );
    if (relationError) {
      await rollbackCreatedClient(uid);
      throw new Error(relationError.message);
    }
    return { id: uid, message: `Cliente creado exitosamente. Usuario: ${username}` };
  });

export const adminUpdateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; fullName?: string; username?: string; phone?: string | null }) =>
    z.object({
      clientId: z.string().uuid(),
      fullName: z.string().trim().min(2).max(120).optional(),
      username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/, "Usuario inválido").optional(),
      phone: z.string().trim().max(30).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTrainer(context.supabase, context.userId);
    await assertTargetIsClient(data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = {};
    if (data.fullName !== undefined) patch.full_name = data.fullName;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.username !== undefined) patch.email = buildClientLoginEmail(data.username);
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.clientId);
      if (error) throw new Error(error.message);
    }
    if (data.username) {
      const username = normalizeUsername(data.username);
      const loginEmail = buildClientLoginEmail(username);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.clientId, {
        email: loginEmail,
        user_metadata: { username },
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminResetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; password: string }) =>
    z.object({ clientId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTrainer(context.supabase, context.userId);
    await assertTargetIsClient(data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = data.password.trim();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.clientId, { password });
    if (error) throw new Error(error.message);
    return { ok: true, message: "Contraseña actualizada correctamente." };
  });

export const adminSetClientStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; status: "active" | "disabled" }) =>
    z.object({ clientId: z.string().uuid(), status: z.enum(["active", "disabled"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertTrainer(context.supabase, context.userId);
    await assertTargetIsClient(data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const disabled = data.status === "disabled";
    const { error: e1 } = await supabaseAdmin.from("profiles").update({
      status: data.status,
      disabled_at: disabled ? new Date().toISOString() : null,
    }).eq("id", data.clientId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin.auth.admin.updateUserById(data.clientId, {
      ban_duration: disabled ? "876000h" : "none",
    } as any);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const adminGetClientAuthInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string }) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTrainer(context.supabase, context.userId);
    await assertTargetIsClient(data.clientId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(data.clientId);
    if (error) throw new Error(error.message);
    return {
      last_sign_in_at: u.user?.last_sign_in_at ?? null,
      created_at: u.user?.created_at ?? null,
      email: u.user?.email ?? null,
    };
  });
