/* TravelBuddy Service Worker：静态资源缓存优先，接口请求走网络。
   目的：安装成 PWA 后可从桌面图标秒开，断网时仍能看到界面骨架。 */
const VERSION = 'tb-v1';
const STATIC_CACHE = `${VERSION}-static`;

const PRECACHE = [
  '/',
  '/index.html',
  '/static/css/app.css',
  '/static/css/extra.css',
  '/static/js/api.js',
  '/static/js/app.js',
  '/static/js/itinerary.js',
  '/static/js/extra.js',
  '/data/pois.json',
  '/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 接口与动态图片：网络优先，不缓存
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // 后台静默更新，保证下次打开是新版本
        fetch(request)
          .then((response) => {
            if (response && response.ok) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
            }
          })
          .catch(() => null);
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
