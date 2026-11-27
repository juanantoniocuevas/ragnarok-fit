// Los clientes entran con un nombre de usuario. Internamente se guarda como
// un correo ficticio en este dominio (no recibe correos).
export const CLIENT_LOGIN_DOMAIN = "clientes.ragnarokfit.local";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
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
