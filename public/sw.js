self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let data = {
    title: "Loopin Alert",
    body: "You have a new important notification.",
    url: "/dashboard?tab=alerts",
    icon: "/001-gmail.png",
    tag: "omnisync-alert",
  };

  try {
    if (event.data) {
      const raw = await event.data.text();
      try {
        data = { ...data, ...JSON.parse(raw) };
      } catch {
        if (raw) data.body = raw;
      }
    }
  } catch {
    // keep defaults
  }

  // Chrome rejects SVG icons for notifications — always use PNG.
  const icon = (data.icon || "").endsWith(".svg") ? "/001-gmail.png" : data.icon || "/001-gmail.png";

  try {
    await self.registration.showNotification(data.title || "Loopin Alert", {
      body: data.body || "",
      icon,
      badge: "/001-gmail.png",
      tag: data.tag || "omnisync-alert",
      renotify: true,
      requireInteraction: false,
      data: { url: data.url || "/dashboard?tab=alerts" },
    });
  } catch (err) {
    console.error("[sw] showNotification failed:", err);
    await self.registration.showNotification("Loopin Alert", {
      body: data.body || "New notification",
      icon: "/001-gmail.png",
      tag: "omnisync-alert-fallback",
    });
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/dashboard?tab=alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
