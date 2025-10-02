const CACHE_VERSION = 'v2';
const CACHE_NAME = `punchbuggy-cache-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './service-worker.js',
  './icons/punchbuggy.svg'
].map(path => new URL(path, self.location).toString());

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(new URL('./index.html', self.location).toString()));
    })
  );
});
