// ============================================================
// SERVICE WORKER — PWA Cache & Offline
// JBS Leather - Horas Extras
// ============================================================

const CACHE_NAME = 'he-jbs-v2';
const OFFLINE_QUEUE_KEY = 'he_offline_queue';

const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap'
];

// ——— INSTALL ————————————————————————————————————————————————
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_ASSETS.map(url => new Request(url, { mode: 'no-cors' })).filter(r => !r.url.includes('googleapis')))
        .catch(() => cache.addAll(['/index.html', '/css/styles.css', '/js/api.js', '/js/app.js']))
      )
      .then(() => self.skipWaiting())
  );
});

// ——— ACTIVATE ————————————————————————————————————————————————
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ——— FETCH ————————————————————————————————————————————————————
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Siempre ir a la red para el API de Apps Script
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Offline: si es POST (crear solicitud), guardamos en cola
          if (event.request.method === 'POST') {
            return event.request.json().then(body => {
              if (body.action === 'crearSolicitud') {
                guardarEnCola(body);
              }
              return new Response(JSON.stringify({
                ok: false,
                error: 'Sin conexión. La solicitud se sincronizará cuando vuelva la red.',
                offline: true
              }), { headers: { 'Content-Type': 'application/json' } });
            });
          }
          // Para GET, intentar cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Para Google Fonts: red primero, luego cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          fetch(event.request).then(response => {
            cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached)
        )
      )
    );
    return;
  }

  // Para todos los demás: cache first
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Offline: devolver index.html para SPA
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});

// ——— BACKGROUND SYNC ————————————————————————————————————————
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-solicitudes') {
    event.waitUntil(sincronizarCola());
  }
});

async function guardarEnCola(body) {
  // Usar IDB sería mejor, pero usamos localStorage via mensaje
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'OFFLINE_QUEUE', body });
  });
}

async function sincronizarCola() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_QUEUE' });
  });
}

// ——— PUSH NOTIFICATIONS (preparado para futuro) —————————————
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'HE JBS Leather', {
      body: data.body || 'Nueva notificación',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'he-notification'
    })
  );
});
