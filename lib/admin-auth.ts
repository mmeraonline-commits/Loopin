import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/is-admin";

export type AdminIdentity = {
  email: string;
  userId: string;
};

export { isAdminEmail, getAdminEmails } from "@/lib/is-admin";

export function extractAdminIdentity(req: NextRequest): {
  email: string | null;
  userId: string | null;
} {
  const headerEmail =
    req.headers.get("x-admin-email") ||
    req.headers.get("x-user-email") ||
    null;
  const headerUserId = req.headers.get("x-user-id") || null;

  const { searchParams } = new URL(req.url);
  const queryEmail = searchParams.get("email");
  const queryUserId = searchParams.get("userId");

  return {
    email: (headerEmail || queryEmail || "").trim().toLowerCase() || null,
    userId: (headerUserId || queryUserId || "").trim() || null,
  };
}

/**
 * Guard for /api/admin/* routes.
 * Expects x-admin-email + x-user-id headers (or email/userId query params).
 */
export function requireAdmin(
  req: NextRequest
): AdminIdentity | NextResponse {
  const { email, userId } = extractAdminIdentity(req);

  if (!email || !userId) {
    return NextResponse.json(
      { error: "Admin identity required (email + userId)." },
      { status: 401 }
    );
  }

  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { email, userId };
}

export function isAdminResponse(
  value: AdminIdentity | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}
