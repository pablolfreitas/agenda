// ============================================================
// Service Worker – Minha Agenda (PWA)
// Estratégia: network-first para navegação, stale-while-revalidate
// para assets JS/CSS, cache-first para imagens e fontes.
// ============================================================

const CACHE_VERSION = 'agenda-v4';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Instalação: pré-cacheia o shell do app ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Ativação: remove caches de versões antigas ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estratégia por tipo de recurso ──
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignora requisições de outras origens (ex: Supabase API, Google Fonts)
  if (url.origin !== location.origin) return;

  // Navegação (HTML): network-first → fallback para cache → fallback para /
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Assets JS/CSS com hash no nome (gerados pelo Vite): stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(DYNAMIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((response) => {
            cache.put(event.request, response.clone());
            return response;
          });
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // Imagens e ícones: cache-first
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp')
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            caches.open(STATIC_CACHE).then((cache) =>
              cache.put(event.request, response.clone())
            );
            return response;
          })
      )
    );
    return;
  }

  // Demais recursos: network-first simples
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
