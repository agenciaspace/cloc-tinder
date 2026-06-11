/* CLOC-Tinder service worker — cache de estáticos, fallback offline e push. */
const CACHE = 'cloc-static-v1';
const STATIC = ['/css/style.css', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegações (HTML autenticado): rede primeiro, sem cachear; fallback offline simples.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Offline</title><style>body{font-family:sans-serif;background:#FBF6EE;color:#241C16;display:grid;place-items:center;height:100vh;margin:0;text-align:center}</style>' +
        '<div><h1>Você está offline</h1><p>Verifique sua conexão e tente de novo.</p></div>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      ))
    );
    return;
  }

  // Estáticos: cache primeiro, atualizando em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((resp) => {
        if (resp.ok) caches.open(CACHE).then((c) => c.put(request, resp.clone()));
        return resp;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// Notificações push.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'CLOC-Tinder';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) { c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    })
  );
});
