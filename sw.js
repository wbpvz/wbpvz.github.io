// Service Worker: офлайн-кэш оболочки приложения.
// Озвучка хранится отдельно (IndexedDB, см. p_shared.js) и от этого файла не зависит.
const CACHE_NAME = 'wb-pvz-app-v1.12.3';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/p_shared.js',
  '/manifest.json',
  '/icon.png',
  '/logotype.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

// Установка: один недоступный файл не ломает установку
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((e) => console.warn('SW: не удалось закэшировать', url, e))
        )
      )
    )
  );
  self.skipWaiting();
});

// Активация: удаляем старые версии кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keyList) =>
        Promise.all(keyList.map((key) => (key !== CACHE_NAME ? caches.delete(key) : undefined)))
      )
      .then(() => self.clients.claim())
  );
});

// Запросы: сначала кэш, потом сеть. Аудио (mp3) и запросы с Range всегда идут напрямую в сеть
// (их подменяет p_shared.js на файлы из IndexedDB).
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;
  if (/\.mp3(\?|#|$)/i.test(request.url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === 'navigate') return caches.match('/index.html');
        return Response.error();
      });
    })
  );
});
