import webpush from "web-push";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  );
}

function configureWebPush() {
  if (!isPushConfigured()) {
    throw new Error("VAPID keys are missing. Run: npm run generate:vapid");
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@omnisync.local",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!hasInsforgeAdminKey || !isPushConfigured()) {
    return { sent: 0, skipped: true as const, errors: ["Push not configured"] };
  }

  configureWebPush();

  const { data: subs, error } = await insforgeAdmin.database
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    return { sent: 0, skipped: true as const, errors: [error.message] };
  }
  if (!subs?.length) {
    return { sent: 0, skipped: true as const, errors: ["No subscriptions"] };
  }

  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          url: payload.url || "/dashboard?tab=alerts",
          // PNG only — SVG icons break Chrome notifications
          icon: (payload.icon || "").endsWith(".svg")
            ? "/001-gmail.png"
            : payload.icon || "/001-gmail.png",
          tag: payload.tag || `alert-${Date.now()}`,
        }),
        {
          TTL: 60,
          urgency: "high",
        }
      );
      sent += 1;
    } catch (err: unknown) {
      const statusCode =
        typeof err === "object" && err && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err && "body" in err
            ? String((err as { body?: string }).body)
            : "Push send failed";
      console.error("[push] send failed:", statusCode, message, err);
      errors.push(statusCode ? `${statusCode}: ${message}` : message);

      if (statusCode === 404 || statusCode === 410) {
        await insforgeAdmin.database
          .from("push_subscriptions")
          .delete()
          .eq("id", sub.id);
      }
    }
  }

  return { sent, skipped: false as const, errors };
}
