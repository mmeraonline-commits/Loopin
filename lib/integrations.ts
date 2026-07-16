export function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function updateUserIntegration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminDb: { from: (table: string) => any },
  userId: string,
  platform: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: Record<string, any> | null
) {
  const { data: dbUser, error: dbError } = await adminDb
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (dbError) {
    return { error: dbError.message || "Failed to load user integrations" };
  }

  if (!dbUser) {
    return { error: "User not found in database. Sign in again, then reconnect." };
  }

  const currentIntegrations = dbUser.integrations || {};
  const updatedIntegrations = {
    ...currentIntegrations,
    [platform]: value,
  };

  const { data: updatedRows, error: updateError } = await adminDb
    .from("users")
    .update({ integrations: updatedIntegrations })
    .eq("id", userId)
    .select("id, integrations");

  if (updateError) {
    return { error: updateError.message || "Failed to save integration" };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { error: "No user row was updated" };
  }

  return { data: updatedRows[0], error: null };
}
