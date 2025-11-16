// Service Worker per Andrea Bozzo Portfolio
// Versione: 1.0.0

const CACHE_NAME = 'andreabozzo-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/assets/styles.min.css',
    '/assets/main.min.js',
    '/assets/og-image.jpg'
];

// Install event - cache degli asset critici
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - pulizia delle vecchie cache
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - strategia Network First con Cache Fallback
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Skip cross-origin requests
    if (!request.url.startsWith(self.location.origin)) {
        return;
    }

    // Skip GitHub API calls (sempre fresh)
    if (request.url.includes('api.github.com')) {
        return;
    }

    event.respondWith(
        // Network First Strategy
        fetch(request)
            .then((response) => {
                // Clone response per cache
                const responseClone = response.clone();

                // Solo cache delle risposte ok
                if (response.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }

                return response;
            })
            .catch(() => {
                // Fallback to cache se network fallisce
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        console.log('[SW] Serving from cache:', request.url);
                        return cachedResponse;
                    }

                    // Pagina offline di fallback
                    if (request.destination === 'document') {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// Message event - per aggiornamenti runtime
self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
