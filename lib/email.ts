import { Resend } from "resend";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

export type EmailPayload = {
  subject: string;
  html: string;
  text?: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    "Loopin <onboarding@resend.dev>"
  );
}

/**
 * Send an email to the user's account email via Resend.
 * Skips cleanly when Resend is not configured or the user has no email.
 */
export async function sendEmailToUser(
  userId: string,
  payload: EmailPayload
): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }
  if (!hasInsforgeAdminKey) {
    return { ok: false, error: "Server database key missing" };
  }

  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (error || !dbUser) {
    return { ok: false, error: "User not found" };
  }

  const to = String(dbUser.email || "").trim();
  if (!to || !to.includes("@")) {
    return {
      ok: false,
      skipped: true,
      error: "No account email on file — add an email to receive email notifications",
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error: sendError } = await resend.emails.send({
      from: getFromAddress(),
      to: [to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text || payload.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });

    if (sendError) {
      return { ok: false, error: sendError.message || "Resend send failed" };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}

/** Escape HTML for safe injection into email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
