import { precacheAndRoute } from 'workbox-precaching';

// Precache de archivos estáticos
precacheAndRoute(self.__WB_MANIFEST);

// Cache runtime
self.addEventListener('fetch', (event) => {
	event.respondWith(
		caches.match(event.request).then((response) => {
			return response || fetch(event.request);
		})
	);
});
