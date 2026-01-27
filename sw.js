const CACHE_NAME = 'andreabozzo-v2';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/assets/styles.min.css',
    '/assets/main.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (!request.url.startsWith(self.location.origin)) {
        return;
    }

    if (request.url.includes('api.github.com')) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();

                if (response.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }

                return response;
            })
            .catch(() => {
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    if (request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
