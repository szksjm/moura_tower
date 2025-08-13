const CACHE_NAME = 'animal-tower-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/sample/matter.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => {
        // キャッシュ失敗時でもインストールを継続
        console.error('Precache failed:', err);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
