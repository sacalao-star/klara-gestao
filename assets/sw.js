const CACHE_NAME = 'klara-gestao-pwa-v1';
const STATIC_ASSETS = [
  '/assets/pwa-install.js',
  '/assets/icons/klara-rh.svg',
  '/assets/icons/klara-rh-192.png',
  '/assets/icons/klara-rh-512.png',
  '/assets/icons/klara-apontamento.svg',
  '/assets/icons/klara-apontamento-192.png',
  '/assets/icons/klara-apontamento-512.png',
  '/assets/icons/klara-colaborador.svg',
  '/assets/icons/klara-colaborador-192.png',
  '/assets/icons/klara-colaborador-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // APIs sempre vão direto para a rede (dados em tempo real)
  if (url.pathname.startsWith('/api/')) return;

  // Ícones e scripts estáticos: cache-first com atualização em background
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Páginas HTML: network-first com fallback em cache para carregamento rápido
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
