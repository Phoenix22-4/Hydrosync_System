// Minimal service worker for PWA installability
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through with error handling for PWA
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
