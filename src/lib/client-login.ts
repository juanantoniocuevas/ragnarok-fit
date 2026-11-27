// Los clientes entran con un nombre de usuario. Internamente se guarda como
// un correo ficticio en este dominio (no recibe correos).
export const CLIENT_LOGIN_DOMAIN = "clientes.ragnarokfit.local";

// Convierte lo que escriba la persona en un usuario válido:
// "María José Pérez" → "mariajoseperez", "Ñuñoa 2" → "nunoa2".
export function normalizeUsername(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

// Convierte un error técnico (por ejemplo, de validación) en un mensaje legible.
export function friendlyError(e: unknown): string {
  const raw = (e as any)?.message ?? String(e ?? "");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed[0]?.message) {
      return parsed.map((p: any) => p.message).join(". ");
    }
  } catch {
    // no era JSON: se usa tal cual
  }
  return raw || "Ocurrió un error. Inténtalo de nuevo.";
}

// Muestra el usuario del cliente en vez del correo interno.
export function displayLoginIdentifier(profile: { email?: string | null } | null | undefined): string {
  const raw = profile?.email ?? "";
  const suffix = `@${CLIENT_LOGIN_DOMAIN}`;
  return typeof raw === "string" && raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
}

export function isClientLoginEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${CLIENT_LOGIN_DOMAIN}`);
}
