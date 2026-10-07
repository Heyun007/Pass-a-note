// 小纸条 Service Worker
var CACHE_NAME = 'xiaozhitiao-v1';
var URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './icon.png',
  './manifest.json'
];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE).catch(function() {});
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.map(function(n) {
          if (n !== CACHE_NAME) return caches.delete(n);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var fetchPromise = fetch(e.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return cached;
      });
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('push', function(e) {
  var data = { title: '小纸条', body: '你有新消息' };
  if (e.data) {
    try { data = e.data.json(); } catch (err) { data.body = e.data.text(); }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || '小纸条', {
      body: data.body || '',
      icon: './icon.png'
    })
  );
});

// 接收来自 main.js 的消息，然后弹出通知
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'show-notification') {
    self.registration.showNotification(e.data.title || '小纸条', {
      body: e.data.body || '你有新消息',
      icon: './icon.png',
      badge: './icon.png',
      vibrate: [200, 100, 200],
      data: { url: './' } // 点击通知后要跳转的地址
    });
  }
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus(); // 如果页面还开着，就聚焦到该页面
      }
      if (clients.openWindow) return clients.openWindow('./'); // 如果页面关了，就打开新页面
    })
  );
});