// Vertex Mail service worker — notifications only (no caching).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tapping a notification focuses an open Vertex Mail tab (or opens one) at the right thread.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Ready for server-sent Web Push later: shows whatever payload arrives.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON payload */ }
  event.waitUntil(
    self.registration.showNotification(data.title || "New mail", {
      body: data.body || "",
      tag: data.tag,
      data: { url: data.url || "/inbox" },
    })
  );
});
