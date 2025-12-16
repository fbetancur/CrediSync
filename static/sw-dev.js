/**
 * Service Worker para desarrollo - CrediSync
 * Funcionalidad básica para testing de PWA en desarrollo
 */

const CACHE_NAME = 'credisync-dev-v1';
const CACHE_URLS = [
  '/',
  '/login',
  '/manifest.webmanifest'
];

// Instalar
self.addEventListener('install', (event) => {
  console.log('🔧 [SW] Service Worker de desarrollo instalado');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📦 [SW] Precacheando recursos básicos');
      return cache.addAll(CACHE_URLS).catch(err => {
        console.warn('⚠️ [SW] Error precacheando:', err);
        // No fallar si algunos recursos no están disponibles
      });
    })
  );
  
  self.skipWaiting();
});

// Activar
self.addEventListener('activate', (event) => {
  console.log('✅ [SW] Service Worker de desarrollo activado');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ [SW] Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch - Estrategia Cache First para recursos estáticos, Network First para API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Solo manejar requests del mismo origen
  if (url.origin !== location.origin) {
    return;
  }
  
  // Estrategia para diferentes tipos de recursos
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|webp|woff|woff2)$/)) {
    // Cache First para recursos estáticos
    event.respondWith(
      caches.match(event.request).then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(fetchResponse => {
          if (fetchResponse.ok) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return fetchResponse;
        });
      })
    );
  } else if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    // Network First para API calls
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  } else {
    // Network First para páginas HTML
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/').then(response => {
          return response || new Response('Offline', { status: 503 });
        });
      })
    );
  }
});

// Background sync placeholder
self.addEventListener('sync', (event) => {
  console.log('🔄 [SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Aquí se integraría con @sync/core
      Promise.resolve().then(() => {
        console.log('✅ [SW] Background sync completado');
      })
    );
  }
});

// Push notifications placeholder
self.addEventListener('push', (event) => {
  console.log('📱 [SW] Push notification recibida');
  
  const options = {
    body: event.data ? event.data.text() : 'Nueva notificación de CrediSync',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'credisync-notification'
  };
  
  event.waitUntil(
    self.registration.showNotification('CrediSync', options)
  );
});

console.log('🔧 [SW] Service Worker de desarrollo cargado');