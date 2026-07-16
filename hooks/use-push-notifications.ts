"use client";

import { useCallback, useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function ensureServiceWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await registration.update();
  await navigator.serviceWorker.ready;
  return registration;
}

export function usePushNotifications(userId?: string) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [lastTestMessage, setLastTestMessage] = useState("");

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);

    fetch("/api/push/vapid")
      .then((r) => r.json())
      .then((d) => setConfigured(!!d.configured && !!d.publicKey))
      .catch(() => setConfigured(false));

    if (!ok || !userId) return;

    ensureServiceWorker()
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [userId]);

  const enablePush = useCallback(async () => {
    if (!userId) {
      setError("Sign in first");
      return false;
    }
    setLoading(true);
    setError("");
    setLastTestMessage("");
    try {
      const vapidRes = await fetch("/api/push/vapid");
      const vapid = await vapidRes.json();
      if (!vapid.configured || !vapid.publicKey) {
        throw new Error("Push is not configured on the server. Run npm run generate:vapid");
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        throw new Error("Notification permission was denied");
      }

      const registration = await ensureServiceWorker();

      // Always resubscribe so the subscription matches current VAPID keys
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        try {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, endpoint: existing.endpoint }),
          });
        } catch {
          // ignore
        }
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save push subscription");

      // Immediate local confirmation (does not prove remote push, but proves permission/UI works)
      try {
        await registration.showNotification("Loopin push enabled", {
          body: "Browser notifications are allowed on this device.",
          icon: "/001-gmail.png",
          tag: "push-enabled",
        });
      } catch {
        // ignore
      }

      setSubscribed(true);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to enable push");
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const disablePush = useCallback(async () => {
    if (!userId) return false;
    setLoading(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to disable push");
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const sendTestPush = useCallback(async () => {
    if (!userId) return false;
    setLoading(true);
    setError("");
    setLastTestMessage("");
    try {
      await ensureServiceWorker();
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Test push failed");
      }
      setLastTestMessage(
        `Server sent ${data.sent} push(es). Check the Windows notification center (bottom-right). ${data.tip || ""}`
      );

      // Also show a local notification so you get feedback even if FCM is delayed
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("Loopin local test", {
        body: "Local notification works. If you only see this, remote push may still be blocked by Windows/browser settings.",
        icon: "/001-gmail.png",
        tag: `local-test-${Date.now()}`,
      });
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Test push failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return {
    supported,
    configured,
    permission,
    subscribed,
    loading,
    error,
    lastTestMessage,
    enablePush,
    disablePush,
    sendTestPush,
  };
}
