/* UBTKD Management System — Service Worker */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "UBTKD", body: event.data.text(), url: "/" };
  }

  const title   = data.title ?? "UBTKD Notification";
  const options = {
    body:    data.body   ?? "",
    icon:    "/favicon.svg",
    badge:   "/favicon.svg",
    tag:     data.tag    ?? "ubtkd",
    data:    { url: data.url ?? "/" },
    renotify: true,
    vibrate: [200, 100, 200]
  };

  const tasks = [self.registration.showNotification(title, options)];

  // Update the app icon badge with the total unread count
  if (typeof data.badge === "number" && "setAppBadge" in self.navigator) {
    tasks.push(
      data.badge > 0
        ? self.navigator.setAppBadge(data.badge)
        : self.navigator.clearAppBadge()
    );
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});


self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
