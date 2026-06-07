const CACHE_NAME = "suportesync-pwa-v4";
const SHARE_CACHE_NAME = "suportesync-share-target-v1";
const STATIC_ASSETS = ["/", "/chat", "/dashboard", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST" && url.origin === self.location.origin && url.pathname === "/chat/share") {
    event.respondWith(handleSharedFiles(request));
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }

          return response;
        })
        .catch(() => caches.match(request).then((cachedResponse) => cachedResponse || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    }),
  );
});

async function handleSharedFiles(request) {
  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((item) => item instanceof File && item.size > 0);
  const shareId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const cache = await caches.open(SHARE_CACHE_NAME);
  const metadata = {
    id: shareId,
    title: String(formData.get("title") || ""),
    text: String(formData.get("text") || ""),
    url: String(formData.get("url") || ""),
    files: [],
    created_at: Date.now(),
  };

  await Promise.all(
    files.map(async (file, index) => {
      const safeName = file.name || `arquivo-${index + 1}`;
      const fileUrl = `/share-target-cache/${shareId}/${index}-${encodeURIComponent(safeName)}`;

      metadata.files.push({
        name: safeName,
        type: file.type || "application/octet-stream",
        size: file.size,
        url: fileUrl,
      });

      await cache.put(
        fileUrl,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        }),
      );
    }),
  );

  await cache.put(
    `/share-target-cache/${shareId}/metadata`,
    new Response(JSON.stringify(metadata), {
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );

  return Response.redirect(`/chat?share=${encodeURIComponent(shareId)}`, 303);
}

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : "Nova mensagem recebida.",
    };
  }

  const conversationId = payload.conversation_id || payload.conversationId || "chat";
  const title = payload.title || "SuporteSync";
  const options = {
    body: payload.body || "Voce recebeu uma nova mensagem.",
    icon: payload.icon || "/icons/atendimento-192.png",
    badge: payload.badge || "/icons/atendimento-192.png",
    tag: `suportesync-conversation-${conversationId}`,
    renotify: true,
    data: {
      url: payload.url || "/chat",
      conversation_id: conversationId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/chat", self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client && client.url.startsWith(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      }),
  );
});
