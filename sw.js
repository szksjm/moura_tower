const CACHE_NAME = 'animal-tower-v3';
const PRECACHE_URLS = [
  './',
  'index.html',
  'styles.css',
  'main.js',
  'public/manifest.json',
  'public/icon.svg',
  'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js'
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

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
