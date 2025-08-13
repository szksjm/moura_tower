const CACHE_NAME = 'animal-tower-v1';
const CORE_ASSETS = [
  './',
  './index.html'
];

const IMAGE_ASSETS = [
  './1.PNG',
  './2.PNG',
  './3.PNG',
  './4.PNG',
  './5.PNG',
  './6.PNG',
  './7.PNG',
  './8.PNG',
  './9.PNG',
  './10.PNG',
  './11.PNG',
  './12.PNG'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const results = await Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`Failed to cache ${CORE_ASSETS[index]}`, result.reason);
        }
      });
    })
  );
});

// Cache large images after activation without blocking install
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  caches.open(CACHE_NAME).then(cache => {
    IMAGE_ASSETS.forEach(url => {
      cache.add(url).catch(err => console.warn(`Image cache failed: ${url}`, err));
    });
  });
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }

      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });

        return networkResponse;
      });
    }).catch(error => {
      console.error('Fetch failed:', error);
      return fetch(event.request);
    })
  );
});

