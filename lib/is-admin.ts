function parseAllowlist(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Allowlist from env. Client only sees NEXT_PUBLIC_ADMIN_EMAILS. */
export function getAdminEmails(): string[] {
  const server =
    typeof process !== "undefined" ? parseAllowlist(process.env.ADMIN_EMAILS) : [];
  const pub =
    typeof process !== "undefined"
      ? parseAllowlist(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
      : [];
  return Array.from(new Set([...server, ...pub]));
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}
