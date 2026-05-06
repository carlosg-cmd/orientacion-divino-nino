// ============================================================
//  SERVICE WORKER — SIPOE I.E. Divino Niño
//  Permite abrir la app sin internet (GitHub Pages)
//  v1.0 — 2026-05-06
// ============================================================

const CACHE_NAME = 'sipoe-v2026-05-06-2';

// Archivos que se guardan en caché al instalar
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './app.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// ---- Instalación: guardar archivos en caché ----
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ARCHIVOS_CACHE).catch(err => {
        console.warn('SW: algunos archivos no se pudieron cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// ---- Activación: limpiar cachés viejas ----
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch: servir desde caché si no hay internet ----
self.addEventListener('fetch', event => {
  // No interceptar peticiones a Supabase (necesitan internet real)
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Si no está en caché, intentar la red
      return fetch(event.request).then(response => {
        // Guardar en caché si es una respuesta válida
        if (
          response &&
          response.status === 200 &&
          response.type !== 'opaque' &&
          (event.request.url.endsWith('.js') ||
           event.request.url.endsWith('.html') ||
           event.request.url.endsWith('.css') ||
           event.request.url.endsWith('.png') ||
           event.request.url.endsWith('.ico'))
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => {
        // Sin red y sin caché: devolver index.html como fallback
        return caches.match('./index.html');
      });
    })
  );
});
